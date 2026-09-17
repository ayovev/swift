import { useCallback, useEffect, useMemo, useState } from "react";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Landing } from "@/components/landing/Landing";
import { buildInsights } from "@/lib/analytics/buildInsights";
import type { DateRange } from "@/lib/analytics/dateRange";
import type { Granularity } from "@/lib/analytics/granularity";
import { CsvValidationError, parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { bucketDuration, bucketRowCount, capture } from "@/lib/posthog";
import { loadBodyCompRows, saveBodyCompRows } from "@/lib/storage/bodyCompStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadWorkoutRows, saveWorkoutRows } from "@/lib/storage/workoutStorage";
import type { SugarWodRow } from "@/types/sugarwod";

export type DataSource = "upload" | "sample";

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: SugarWodRow[]; source: DataSource };

const SAMPLE_CSV_URL = "/sample/sugarwod-sample-export.csv";

export default function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });
  const [range, setRange] = useState<DateRange | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [bodyComp, setBodyComp] = useState<BodyCompState>({ status: "idle" });

  // Restore whatever was uploaded last time — persistence is local-only (see
  // CLAUDE.md) and lasts until "Start over" clears it. Sample data is never
  // written to storage, so a restore always resumes as an "upload".
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rows, bodyRows] = await Promise.all([loadWorkoutRows(), loadBodyCompRows()]);
      if (cancelled) return;
      if (rows && rows.length > 0) {
        setState({ status: "ready", rows, source: "upload" });
      } else {
        setState({ status: "idle" });
      }
      if (bodyRows && bodyRows.length > 0) setBodyComp({ status: "ready", rows: bodyRows });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const insights = useMemo(
    () => (state.status === "ready" ? buildInsights(state.rows, range, granularity) : null),
    [state, range, granularity]
  );

  const run = useCallback(async (source: DataSource, load: () => Promise<File | string>) => {
    setState({ status: "loading" });
    capture(source === "sample" ? { name: "sample_data_used" } : { name: "upload_attempted" });

    const startedAt = performance.now();
    try {
      const input = await load();
      const rows = await parseSugarWodCsv(input);

      capture({
        name: "upload_succeeded",
        props: {
          rows: bucketRowCount(rows.length),
          duration_bucket: bucketDuration(performance.now() - startedAt),
        },
      });
      setRange(null);
      setGranularity("monthly");
      setState({ status: "ready", rows, source });
      // Sample data is a public demo file, already free to re-fetch from
      // public/sample/ — only a genuine upload is worth persisting.
      if (source === "upload") void saveWorkoutRows(rows);
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
        void saveBodyCompRows(rows);
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
  }, []);

  const handleSample = useCallback(
    () =>
      void run("sample", async () => {
        // Served as a static asset from Swift's own origin — this is the only
        // network request the app makes with training data in it, and it is
        // a download of the bundled demo file, not an upload of anyone's.
        const response = await fetch(SAMPLE_CSV_URL);
        if (!response.ok) throw new Error("the sample file could not be loaded");
        return response.text();
      }),
    [run]
  );

  const reset = useCallback(() => {
    setState({ status: "idle" });
    setRange(null);
    setGranularity("monthly");
    setBodyComp({ status: "idle" });
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
        onRangeChange={setRange}
        granularity={granularity}
        onGranularityChange={setGranularity}
        onReset={reset}
        bodyComp={bodyComp}
        onBodyCompFile={handleBodyCompFile}
      />
    );
  }

  return (
    <Landing
      loading={state.status === "loading"}
      error={state.status === "error" ? state.message : null}
      onFile={handleFile}
      onSample={handleSample}
      onDismissError={reset}
    />
  );
}
