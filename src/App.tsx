import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import { Landing } from "@/components/landing/Landing";
import { ChunkFailedNotice, LazyView } from "@/components/ui/LazyView";
import { lazyComponent } from "@/components/ui/lazyComponent";
import { getPipeline, loadPipeline } from "@/lib/analytics/pipeline";
import { computePresetRange, type DateRange, type DateRangePreset } from "@/lib/analytics/dateRange";
import type { Granularity } from "@/lib/analytics/granularity";
import { CsvValidationError, parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { bucketDuration, bucketRowCount, capture } from "@/lib/posthog";
import { extendSampleRows } from "@/lib/sample/extendSample";
import { generateSampleBodyComp } from "@/lib/sample/generateSampleBodyComp";
import { generateSampleTimeline } from "@/lib/sample/generateSampleTimeline";
import { loadBodyCompRows, saveBodyCompRows } from "@/lib/storage/bodyCompStorage";
import { loadTimeline, saveTimeline } from "@/lib/storage/timelineStorage";
import { loadWeighIns, saveWeighIns } from "@/lib/storage/weighInsStorage";
import { removeWeighIn, upsertWeighIn } from "@/lib/analytics/weighIns";
import type { WeighIn } from "@/types/weighIn";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadViewPreferences, saveViewPreferences } from "@/lib/storage/viewPreferencesStorage";
import {
  loadWorkoutMeta,
  loadWorkoutRows,
  saveWorkoutMeta,
  saveWorkoutRows,
  type WorkoutMeta,
} from "@/lib/storage/workoutStorage";
import { countNewRows } from "@/lib/analytics/newRows";
import { STALE_LOG_SNOOZE_DAYS } from "@/lib/analytics/insightConfig";
import type { InBodyRow } from "@/types/inbody";
import type { TimelineEntry } from "@/types/timeline";
import type { SugarWodRow } from "@/types/sugarwod";

export type DataSource = "upload" | "sample";

interface RevealSummary {
  workoutCount: number;
  prCount: number;
  /** Entries not in the log this load replaced. Absent when nothing was loaded before it. */
  newCount?: number;
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

/**
 * The dashboard (every chart, Recharts included) is a separate chunk, so the upload screen loads without it. Whoever is about to
 * need it starts the fetch early instead of waiting for the screen to mount: a returning athlete as soon as storage says there is
 * a log, a first-time visitor when the browser is idle on the upload screen, and an upload or the sample the moment it begins,
 * so the parse overlaps the download.
 */
const dashboard = lazyComponent(() => import("@/components/dashboard/Dashboard").then((m) => ({ default: m.Dashboard })));
const Dashboard = dashboard.Component;
const preloadDashboard = dashboard.preload;

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
  // The classify/analytics pipeline is its own chunk (lib/analytics/pipeline.ts); null until it has arrived.
  const [pipeline, setPipeline] = useState(getPipeline);
  // True when that chunk could not be fetched (usually a tab left open across a deploy). Reload is the fix, as for any chunk.
  const [pipelineFailed, setPipelineFailed] = useState(false);
  const [range, setRange] = useState<DateRange | null>(null);
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("all_time");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [bodyComp, setBodyComp] = useState<BodyCompState>({ status: "idle" });
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  // When the stored workout log reached this browser, and its stale-log snooze. Null for sample data and for caches saved before this existed.
  // The uploaded log currently on screen, kept so a replacement can say what it added. Cleared by reset().
  const previousRowsRef = useRef<SugarWodRow[] | null>(null);
  const [workoutMeta, setWorkoutMeta] = useState<WorkoutMeta | null>(null);

  // Restore whatever was uploaded last time — persistence is local-only (see
  // CLAUDE.md) and lasts until "Start over" clears it. Sample data is never
  // written to storage, so a restore always resumes as an "upload".
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rows, storedMeta, bodyRows, viewPrefs, storedTimeline, storedWeighIns] = await Promise.all([
        loadWorkoutRows(),
        loadWorkoutMeta(),
        loadBodyCompRows(),
        loadViewPreferences(),
        loadTimeline(),
        loadWeighIns(),
      ]);
      if (cancelled) return;
      if (rows && rows.length > 0) {
        preloadDashboard();
        // Held on the loading screen until the pipeline has arrived, so "ready" never has nothing to compute from.
        const loaded = await loadPipeline().catch(() => null);
        if (cancelled) return;
        if (loaded) setPipeline(loaded);
        else setPipelineFailed(true);
        setState({ status: "ready", rows, source: "upload" });
        if (storedMeta) setWorkoutMeta(storedMeta);
      } else {
        setState({ status: "idle" });
        if (typeof requestIdleCallback === "function") requestIdleCallback(preloadDashboard, { timeout: 3000 });
        else setTimeout(preloadDashboard, 500);
      }
      if (bodyRows && bodyRows.length > 0) setBodyComp({ status: "ready", rows: bodyRows });
      if (storedTimeline) setTimeline(storedTimeline);
      if (storedWeighIns) setWeighIns(storedWeighIns);
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

  useEffect(() => {
    if (state.status === "ready" && state.source === "upload") previousRowsRef.current = state.rows;
  }, [state]);

  const insights = useMemo(
    () => (state.status === "ready" && pipeline ? pipeline.buildInsights(state.rows, range, granularity) : null),
    [state, pipeline, range, granularity]
  );

  // Hold on "reveal" just long enough for UploadReveal's numbers to chalk
  // themselves in before handing off to the dashboard.
  useEffect(() => {
    if (state.status !== "reveal") return;
    const { rows, source } = state;
    let cancelled = false;
    // Sync and backup restore reach here without run(), so the pipeline may still be on its way: wait for it as well as the beat.
    const pipelineReady = loadPipeline().then(setPipeline, () => setPipelineFailed(true));
    const timer = window.setTimeout(
      () =>
        void pipelineReady.then(() => {
          if (!cancelled) setState({ status: "ready", rows, source });
        }),
      prefersReducedMotion() ? REVEAL_HOLD_MS_REDUCED : REVEAL_HOLD_MS
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
      // A new file starts a new clock, and clears any snooze left by the old one.
      const meta: WorkoutMeta = { uploadedAt: new Date().toISOString() };
      setWorkoutMeta(meta);
      void saveWorkoutRows(rows);
      void saveWorkoutMeta(meta);
      void saveViewPreferences({ granularity: "monthly", rangePreset: "all_time", customRange: null });
    } else {
      setWorkoutMeta(null);
      // Fill in the datasets the Progress, Timeline and Body Comp views need, so
      // sample mode has something for them to show instead of their empty
      // states — entirely in memory, never persisted (see the generators' own
      // header comments). The functional setState form means a
      // previously-restored *real* InBody upload or real entries are never
      // clobbered: sample data only fills in what's genuinely still empty.
      const generatedBodyComp = generateSampleBodyComp(rows);
      setBodyComp((prev) => (prev.status === "ready" ? prev : { status: "ready", rows: generatedBodyComp }));
      const generatedTimeline = generateSampleTimeline(rows);
      setTimeline((prev) => (prev.length > 0 ? prev : generatedTimeline));
    }
    const previous = source === "upload" ? previousRowsRef.current : null;
    setState({
      status: "reveal",
      rows,
      source,
      summary: {
        workoutCount: rows.length,
        prCount: rows.filter((r) => r.pr === "PR").length,
        ...(previous ? { newCount: countNewRows(previous, rows) } : {}),
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
      preloadDashboard();
      // Fetched alongside the parse (and the download, for the sample), so a first-time visitor pays for it only once a log is on its way.
      void loadPipeline().then(setPipeline, () => setPipelineFailed(true));
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

  // "Remind me later" on the stale-log line. Persisted like the rows it belongs to, and only for an upload.
  const snoozeStaleNudge = useCallback(() => {
    setWorkoutMeta((prev) => {
      if (!prev) return prev;
      const next: WorkoutMeta = {
        ...prev,
        staleSnoozedUntil: dayjs().add(STALE_LOG_SNOOZE_DAYS, "day").toISOString(),
      };
      void saveWorkoutMeta(next);
      return next;
    });
  }, []);

  const handleFile = useCallback(
    (file: File) => void run("upload", () => Promise.resolve(file)),
    [run]
  );

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

  // Timeline entries: user-authored state, not derived from an upload — its own IndexedDB key (see
  // timelineStorage.ts), persisted in full on every change, except in sample mode (see
  // handleBodyCompFile's comment above: an entry added or deleted while sample data is loaded must
  // not leave anything in IndexedDB for a later real session to stumble on).
  const commitTimeline = useCallback(
    (update: (prev: TimelineEntry[]) => TimelineEntry[]) => {
      setTimeline((prev) => {
        const next = update(prev);
        if (state.status === "ready" && state.source === "upload") void saveTimeline(next);
        return next;
      });
    },
    [state]
  );
  const addEntry = useCallback((entry: Omit<TimelineEntry, "id">): string => {
    const id = crypto.randomUUID();
    commitTimeline((prev) => [...prev, { ...entry, id }]);
    return id;
  }, [commitTimeline]);
  const updateEntry = useCallback((entry: TimelineEntry) => commitTimeline((prev) => prev.map((e) => (e.id === entry.id ? entry : e))), [commitTimeline]);
  const deleteEntry = useCallback((id: string) => commitTimeline((prev) => prev.filter((e) => e.id !== id)), [commitTimeline]);

  // Manual weigh-ins: user-authored, one per day, its own IndexedDB key (see weighInsStorage.ts). Persisted on every change except in
  // sample mode, for the same reason as the timeline above.
  const commitWeighIns = useCallback(
    (update: (prev: WeighIn[]) => WeighIn[]) => {
      setWeighIns((prev) => {
        const next = update(prev);
        if (state.status === "ready" && state.source === "upload") void saveWeighIns(next);
        return next;
      });
    },
    [state]
  );
  const saveWeighIn = useCallback((weighIn: WeighIn) => commitWeighIns((prev) => upsertWeighIn(prev, weighIn)), [commitWeighIns]);
  const deleteWeighIn = useCallback((date: string) => commitWeighIns((prev) => removeWeighIn(prev, date)), [commitWeighIns]);

  // Sync's weigh-ins handler: an unconditional writer, gated by SyncDialog, and always persisted (synced data is never sample data).
  const handleSyncedWeighIns = useCallback((incoming: WeighIn[]) => {
    setWeighIns(incoming);
    void saveWeighIns(incoming);
  }, []);

  // Sync's timeline handler, alongside the others: an unconditional writer, gated by SyncDialog.
  // Entries always persist for the same reason handleSyncedBodyCompData does — synced data is never sample data.
  const handleSyncedTimeline = useCallback((incoming: TimelineEntry[]) => {
    setTimeline(incoming);
    void saveTimeline(incoming);
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
    setTimeline([]);
    setWeighIns([]);
    setWorkoutMeta(null);
    previousRowsRef.current = null;
    // "Start over" is also the one clear-my-data control: without wiping
    // storage here, a reload would silently restore the data this button
    // just appeared to discard.
    void idbClearAll();
  }, []);

  if (state.status === "ready" && insights) {
    return (
      <LazyView label="Loading your dashboard" variant="page">
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
          workoutMeta={workoutMeta}
          onSnoozeStaleNudge={snoozeStaleNudge}
          onWorkoutFile={handleFile}
          bodyComp={bodyComp}
          onBodyCompFile={handleBodyCompFile}
          onSyncedWorkoutData={handleSyncedWorkoutData}
          onSyncedBodyCompData={handleSyncedBodyCompData}
          onSyncedTimeline={handleSyncedTimeline}
          onSyncedWeighIns={handleSyncedWeighIns}
          weighIns={weighIns}
          onSaveWeighIn={saveWeighIn}
          onDeleteWeighIn={deleteWeighIn}
          timeline={timeline}
          onAddEntry={addEntry}
          onUpdateEntry={updateEntry}
          onDeleteEntry={deleteEntry}
        />
      </LazyView>
    );
  }

  if (pipelineFailed && state.status !== "idle") return <ChunkFailedNotice variant="page" />;

  return (
    <Landing
      loading={state.status === "loading" || state.status === "ready"}
      reveal={state.status === "reveal" ? state.summary : null}
      error={state.status === "error" ? state.message : null}
      onFile={handleFile}
      onSample={handleSample}
      onDismissError={reset}
      onSyncedWorkoutData={handleSyncedWorkoutData}
      onSyncedBodyCompData={handleSyncedBodyCompData}
      onSyncedTimeline={handleSyncedTimeline}
      onSyncedWeighIns={handleSyncedWeighIns}
    />
  );
}
