import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Landing } from "@/components/landing/Landing";
import { getAlignment } from "@/lib/analytics/alignment";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { computePresetRange, type DateRange, type DateRangePreset } from "@/lib/analytics/dateRange";
import { getExperimentInsight } from "@/lib/analytics/experimentInsight";
import type { Granularity } from "@/lib/analytics/granularity";
import { getPlateauInsights } from "@/lib/analytics/plateauDetector";
import { getRelativeStrength } from "@/lib/analytics/relativeStrength";
import { CsvValidationError, parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { bucketDuration, bucketRowCount, capture } from "@/lib/posthog";
import { extendSampleRows } from "@/lib/sample/extendSample";
import { generateSampleBodyComp } from "@/lib/sample/generateSampleBodyComp";
import { generateSampleExperiments } from "@/lib/sample/generateSampleExperiments";
import { generateSampleTags } from "@/lib/sample/generateSampleTags";
import { loadBodyCompRows, saveBodyCompRows } from "@/lib/storage/bodyCompStorage";
import { loadExperiments, saveExperiments } from "@/lib/storage/experimentsStorage";
import { loadTags, saveTags } from "@/lib/storage/tagsStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadViewPreferences, saveViewPreferences } from "@/lib/storage/viewPreferencesStorage";
import { loadWorkoutRows, saveWorkoutRows } from "@/lib/storage/workoutStorage";
import type { Experiment, ExperimentFields, ExperimentInsight } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { ContextTag } from "@/types/tag";
import type { SugarWodRow } from "@/types/sugarwod";

export type DataSource = "upload" | "sample";

interface RevealSummary {
  workoutCount: number;
  prCount: number;
}

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  // A brief beat between a successful parse and the dashboard appearing, so
  // Landing can chalk in "N workouts logged, N personal records" (see
  // UploadReveal) instead of cutting straight from spinner to dashboard.
  | { status: "reveal"; rows: SugarWodRow[]; source: DataSource; summary: RevealSummary }
  | { status: "ready"; rows: SugarWodRow[]; source: DataSource };

const SAMPLE_CSV_URL = "/sample/sugarwod-sample-export.csv";

// Long enough to read two short numbers, short enough not to feel like a
// tax on top of the parse itself. Reduced-motion skips it almost entirely.
const REVEAL_HOLD_MS = 500;
const REVEAL_HOLD_MS_REDUCED = 80;

// Parsing the sample export (or a small real one) finishes fast enough that
// the loading bar in UploadDropzone would otherwise flash and vanish before
// its animation ever completes a cycle. Floor the "loading" status to this
// long so the athlete actually sees it. Reduced-motion still gets a short
// floor rather than none, so "loading" never disappears in literally 0ms.
const MIN_LOADING_MS = 700;
const MIN_LOADING_MS_REDUCED = 150;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

async function waitOutMinimum(startedAt: number) {
  const min = prefersReducedMotion() ? MIN_LOADING_MS_REDUCED : MIN_LOADING_MS;
  const remaining = min - (performance.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });
  const [range, setRange] = useState<DateRange | null>(null);
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("all_time");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [bodyComp, setBodyComp] = useState<BodyCompState>({ status: "idle" });
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [tags, setTags] = useState<ContextTag[]>([]);

  // Restore whatever was uploaded last time — persistence is local-only (see
  // CLAUDE.md) and lasts until "Start over" clears it. Sample data is never
  // written to storage, so a restore always resumes as an "upload".
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rows, bodyRows, viewPrefs, storedExperiments, storedTags] = await Promise.all([
        loadWorkoutRows(),
        loadBodyCompRows(),
        loadViewPreferences(),
        loadExperiments(),
        loadTags(),
      ]);
      if (cancelled) return;
      if (rows && rows.length > 0) {
        setState({ status: "ready", rows, source: "upload" });
      } else {
        setState({ status: "idle" });
      }
      if (bodyRows && bodyRows.length > 0) setBodyComp({ status: "ready", rows: bodyRows });
      if (storedExperiments) setExperiments(storedExperiments);
      if (storedTags) setTags(storedTags);
      if (viewPrefs) {
        setGranularity(viewPrefs.granularity);
        setRangePreset(viewPrefs.rangePreset);
        if (viewPrefs.rangePreset === "custom" && viewPrefs.customRange) {
          setRange({
            start: dayjs(viewPrefs.customRange.start),
            end: dayjs(viewPrefs.customRange.end),
          });
        } else if (viewPrefs.rangePreset !== "custom") {
          setRange(computePresetRange(viewPrefs.rangePreset, dayjs()));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The two explicit write points for view preferences, mirroring the
  // pattern for the uploaded datasets above: persist only where the athlete
  // actually changed something, not as a blanket effect on every state
  // change — a reactive mirror would race "Start over"'s idbClearAll (the
  // reset's own setRange/setGranularity calls would re-save the very
  // defaults the clear just removed).
  const persistRangeSelection = useCallback((newRange: DateRange | null, preset: DateRangePreset) => {
    setRange(newRange);
    setRangePreset(preset);
    void saveViewPreferences({
      granularity,
      rangePreset: preset,
      customRange:
        preset === "custom" && newRange
          ? { start: newRange.start.toISOString(), end: newRange.end.toISOString() }
          : null,
    });
  }, [granularity]);

  const persistGranularity = useCallback((newGranularity: Granularity) => {
    setGranularity(newGranularity);
    void saveViewPreferences({
      granularity: newGranularity,
      rangePreset,
      customRange:
        rangePreset === "custom" && range
          ? { start: range.start.toISOString(), end: range.end.toISOString() }
          : null,
    });
  }, [rangePreset, range]);

  const insights = useMemo(
    () => (state.status === "ready" ? buildInsights(state.rows, range, granularity) : null),
    [state, range, granularity]
  );

  // Needs both datasets, so it stays null until an InBody export is loaded
  // too — like BodyCompTab, it operates on the full unfiltered upload rather
  // than the dashboard's selected date range (session-count windowing, not
  // bucket-based, doesn't need one).
  const plateauInsights = useMemo(
    () =>
      state.status === "ready" && bodyComp.status === "ready"
        ? getPlateauInsights(state.rows, bodyComp.rows, new Date(), { tags })
        : null,
    [state, bodyComp, tags]
  );

  // A rollup of plateauInsights, not a re-derivation — recomputed whenever
  // plateauInsights or the InBody rows it's rolled up against change.
  const alignment = useMemo(
    () =>
      plateauInsights && bodyComp.status === "ready"
        ? getAlignment(plateauInsights, bodyComp.rows, new Date(), { tags })
        : null,
    [plateauInsights, bodyComp, tags]
  );

  // Same gate as plateauInsights, same reasoning: the whole unfiltered log as
  // of today, and both datasets.
  const relativeStrength = useMemo(
    () =>
      state.status === "ready" && bodyComp.status === "ready"
        ? getRelativeStrength(state.rows, bodyComp.rows, { asOfDate: new Date() })
        : null,
    [state, bodyComp]
  );

  // Same gate as plateauInsights: needs both datasets. Each experiment is
  // analyzed independently (no cross-experiment view in v1), so this is a
  // map keyed by experiment id rather than a single derived value.
  const experimentInsights = useMemo(
    () =>
      state.status === "ready" && bodyComp.status === "ready"
        ? new Map<string, ExperimentInsight>(
            experiments.map((e) => [e.id, getExperimentInsight(e, state.rows, bodyComp.rows, new Date())])
          )
        : null,
    [state, bodyComp, experiments]
  );

  // Hold on "reveal" just long enough for UploadReveal's numbers to chalk
  // themselves in before handing off to the dashboard.
  useEffect(() => {
    if (state.status !== "reveal") return;
    const { rows, source } = state;
    const timer = window.setTimeout(
      () => setState({ status: "ready", rows, source }),
      prefersReducedMotion() ? REVEAL_HOLD_MS_REDUCED : REVEAL_HOLD_MS
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  // The shared tail of a successful load, regardless of where the rows came
  // from (a parsed CSV upload, the sample generator, or a synced dataset
  // from another device — see handleSyncedWorkoutData below). Kept separate
  // from run()'s try/catch around parsing so a sync entry point can reuse
  // it without ever calling parseSugarWodCsv on data that's already parsed.
  const finishSuccessfulLoad = useCallback((source: DataSource, rows: SugarWodRow[]) => {
    setRange(null);
    setRangePreset("all_time");
    setGranularity("monthly");
    // Sample data is a public demo file, already free to re-fetch from
    // public/sample/ — only a genuine upload is worth persisting. A new
    // upload's fresh defaults are worth persisting too, so a reload
    // right after doesn't restore a previous file's leftover view prefs.
    if (source === "upload") {
      void saveWorkoutRows(rows);
      void saveViewPreferences({ granularity: "monthly", rangePreset: "all_time", customRange: null });
    } else {
      // Fill in the datasets the Plateau Detector, Alignment,
      // Experiments, Tags and Cycles tabs need, so sample mode has something for them to
      // show instead of their empty states — entirely in memory, never
      // persisted (see the two generators' own header comments). The
      // functional setState form means a previously-restored *real*
      // InBody upload or real logged experiments are never clobbered:
      // sample data only fills in what's genuinely still empty.
      const generatedBodyComp = generateSampleBodyComp(rows);
      const generatedExperiments = generateSampleExperiments(rows);
      setBodyComp((prev) => (prev.status === "ready" ? prev : { status: "ready", rows: generatedBodyComp }));
      setExperiments((prev) => (prev.length > 0 ? prev : generatedExperiments));
      const generatedTags = generateSampleTags(rows);
      setTags((prev) => (prev.length > 0 ? prev : generatedTags));
    }
    setState({
      status: "reveal",
      rows,
      source,
      summary: {
        workoutCount: rows.length,
        prCount: rows.filter((r) => r.pr === "PR").length,
      },
    });
  }, []);

  const run = useCallback(
    async (
      source: DataSource,
      load: () => Promise<File | string>,
      extend?: (rows: SugarWodRow[]) => SugarWodRow[]
    ) => {
      setState({ status: "loading" });
      capture(source === "sample" ? { name: "sample_data_used" } : { name: "upload_attempted" });

      const startedAt = performance.now();
      try {
        const input = await load();
        const parsed = await parseSugarWodCsv(input);
        const rows = extend ? extend(parsed) : parsed;

        capture({
          name: "upload_succeeded",
          props: {
            rows: bucketRowCount(rows.length),
            duration_bucket: bucketDuration(performance.now() - startedAt),
          },
        });
        await waitOutMinimum(startedAt);
        finishSuccessfulLoad(source, rows);
      } catch (err) {
        const message =
          err instanceof CsvValidationError
            ? err.message
            : err instanceof Error
              ? `Something went wrong reading that file: ${err.message}`
              : "Something went wrong reading that file.";

        capture({
          name: "upload_failed",
          props: { reason: err instanceof CsvValidationError ? err.category : "unreadable" },
        });
        setState({ status: "error", message });
      }
    },
    [finishSuccessfulLoad]
  );

  // Cross-device sync (see src/lib/sync/) hands over already-parsed rows —
  // read from the host's own IndexedDB, not a raw CSV — so this reuses
  // run()'s shared tail directly rather than routing through
  // parseSugarWodCsv. Synced data is always a genuine upload: SyncDialog
  // gates the call behind its own conflict-confirmation prompt, so by the
  // time this runs, it's an unconditional writer exactly like handleFile.
  const handleSyncedWorkoutData = useCallback(
    (rows: SugarWodRow[]) => {
      finishSuccessfulLoad("upload", rows);
    },
    [finishSuccessfulLoad]
  );

  const handleFile = useCallback(
    (file: File) => void run("upload", () => Promise.resolve(file)),
    [run]
  );

  // Sync's third dataset, alongside handleSyncedWorkoutData/
  // handleSyncedBodyCompData above: SyncDialog's own conflict-confirmation
  // prompt (mirroring the other two) is what gates this call, so this is an
  // unconditional writer exactly like they are. It must not look at `state`:
  // received data is always a genuine upload, and on the landing page (or in
  // the same tick as the workout log) `state` is still the previous screen,
  // so a check on it silently skipped the save and the experiments were gone
  // after a reload. Backup import shares this handler.
  const handleSyncedExperiments = useCallback((incoming: Experiment[]) => {
    setExperiments(incoming);
    void saveExperiments(incoming);
  }, []);

  // A wholly separate upload, independent of the SugarWOD flow above: its own
  // state, its own parser, never joined to `state.rows`. See BodyCompTab.
  const handleBodyCompFile = useCallback((file: File) => {
    setBodyComp({ status: "loading" });
    void (async () => {
      try {
        const rows = await parseInBodyCsv(file);
        setBodyComp({ status: "ready", rows });
        // Sample workout mode leaves nothing behind (see CLAUDE.md's hard
        // constraint #1 and App.tsx's own `source === "upload"` gate on
        // saveWorkoutRows above) — a real InBody upload made while browsing
        // sample data is a genuine upload of the athlete's own file, but it
        // still shouldn't persist until the SugarWOD side of the session is
        // real too, or a reload would resurrect it alongside sample rows
        // that were never saved in the first place.
        if (state.status === "ready" && state.source === "upload") void saveBodyCompRows(rows);
      } catch (err) {
        const message =
          err instanceof CsvValidationError
            ? err.message
            : err instanceof Error
              ? `Something went wrong reading that file: ${err.message}`
              : "Something went wrong reading that file.";
        setBodyComp({ status: "error", message });
      }
    })();
  }, [state]);

  // Sync's counterpart to handleSyncedWorkoutData above: already-parsed rows
  // from the host's device, applied unconditionally (SyncDialog's own
  // conflict prompt is what gates the call). Unlike handleBodyCompFile,
  // this always persists — synced data is, by construction, never sample
  // data, so the source==="upload" gate that protects sample mode from
  // leaving IndexedDB residue doesn't apply here.
  const handleSyncedBodyCompData = useCallback((rows: InBodyRow[]) => {
    setBodyComp({ status: "ready", rows });
    void saveBodyCompRows(rows);
  }, []);

  // User-authored state, not derived from an upload — its own IndexedDB key
  // (see experimentsStorage.ts), persisted in full on every change, except
  // in sample mode (see handleBodyCompFile's comment above — same reasoning
  // applies here: an experiment added or deleted while sample data is
  // loaded must not leave anything in IndexedDB for a later real session to
  // stumble on).
  const addExperiment = useCallback((fields: ExperimentFields) => {
    setExperiments((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), ...fields }];
      if (state.status === "ready" && state.source === "upload") void saveExperiments(next);
      return next;
    });
  }, [state]);

  // Editing replaces everything but the id, so anything keyed by it (its
  // insight) follows the edit. Fields left out of `fields` are cleared, not
  // kept: no endDate means ongoing again, no baselineStart means all earlier
  // history — the form always sends the full set.
  const updateExperiment = useCallback((id: string, fields: ExperimentFields) => {
    setExperiments((prev) => {
      const next = prev.map((e) => (e.id === id ? { id, ...fields } : e));
      if (state.status === "ready" && state.source === "upload") void saveExperiments(next);
      return next;
    });
  }, [state]);

  const deleteExperiment = useCallback((id: string) => {
    setExperiments((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (state.status === "ready" && state.source === "upload") void saveExperiments(next);
      return next;
    });
  }, []);

  // Context tags: user-authored, own IndexedDB key, same sample-mode exclusion
  // as experiments above. `replaceTags` is what an import calls.
  const commitTags = useCallback(
    (update: (prev: ContextTag[]) => ContextTag[]) => {
      setTags((prev) => {
        const next = update(prev);
        if (state.status === "ready" && state.source === "upload") void saveTags(next);
        return next;
      });
    },
    [state]
  );
  const addTag = useCallback((tag: Omit<ContextTag, "id">) => commitTags((prev) => [...prev, { ...tag, id: crypto.randomUUID() }]), [commitTags]);
  const updateTag = useCallback((tag: ContextTag) => commitTags((prev) => prev.map((t) => (t.id === tag.id ? tag : t))), [commitTags]);
  const deleteTag = useCallback((id: string) => commitTags((prev) => prev.filter((t) => t.id !== id)), [commitTags]);
  const replaceTags = useCallback((incoming: ContextTag[]) => commitTags(() => incoming), [commitTags]);

  // Sync's tags handler, alongside the three above: an unconditional writer,
  // gated by SyncDialog. Tags always persist for the same reason
  // handleSyncedBodyCompData does — synced data is never sample data.
  const handleSyncedTags = useCallback((incoming: ContextTag[]) => {
    setTags(incoming);
    void saveTags(incoming);
  }, []);

  const handleSample = useCallback(
    () =>
      void run(
        "sample",
        async () => {
          // Served as a static asset from Swift's own origin — this is the
          // only network request the app makes with training data in it,
          // and it is a download of the bundled demo file, not an upload of
          // anyone's.
          const response = await fetch(SAMPLE_CSV_URL);
          if (!response.ok) throw new Error("the sample file could not be loaded");
          return response.text();
        },
        // The bundled file is frozen (see extendSample.ts); this fills the
        // gap between its last logged date and today entirely in memory so
        // demo mode never looks stale, without ever touching the file the
        // parity fixture is pinned to.
        extendSampleRows
      ),
    [run]
  );

  const reset = useCallback(() => {
    setState({ status: "idle" });
    setRange(null);
    setRangePreset("all_time");
    setGranularity("monthly");
    setBodyComp({ status: "idle" });
    setExperiments([]);
    setTags([]);
    // "Start over" is also the one clear-my-data control: without wiping
    // storage here, a reload would silently restore the data this button
    // just appeared to discard.
    void idbClearAll();
  }, []);

  if (state.status === "ready" && insights) {
    return (
      <Dashboard
        insights={insights}
        source={state.source}
        range={range}
        rangePreset={rangePreset}
        onRangeSelect={persistRangeSelection}
        granularity={granularity}
        onGranularityChange={persistGranularity}
        onReset={reset}
        workoutRows={state.rows}
        onWorkoutFile={handleFile}
        bodyComp={bodyComp}
        onBodyCompFile={handleBodyCompFile}
        onSyncedWorkoutData={handleSyncedWorkoutData}
        onSyncedBodyCompData={handleSyncedBodyCompData}
        onSyncedExperiments={handleSyncedExperiments}
        onSyncedTags={handleSyncedTags}
        plateauInsights={plateauInsights}
        alignment={alignment}
        relativeStrength={relativeStrength}
        tags={tags}
        onAddTag={addTag}
        onUpdateTag={updateTag}
        onDeleteTag={deleteTag}
        onReplaceTags={replaceTags}
        experiments={experiments}
        experimentInsights={experimentInsights}
        onAddExperiment={addExperiment}
        onUpdateExperiment={updateExperiment}
        onDeleteExperiment={deleteExperiment}
      />
    );
  }

  return (
    <Landing
      loading={state.status === "loading"}
      reveal={state.status === "reveal" ? state.summary : null}
      error={state.status === "error" ? state.message : null}
      onFile={handleFile}
      onSample={handleSample}
      onDismissError={reset}
      onSyncedWorkoutData={handleSyncedWorkoutData}
      onSyncedBodyCompData={handleSyncedBodyCompData}
      onSyncedExperiments={handleSyncedExperiments}
      onSyncedTags={handleSyncedTags}
    />
  );
}
