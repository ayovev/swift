import { useCallback, useMemo, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Landing } from "@/components/landing/Landing";
import { buildInsights } from "@/lib/analytics/buildInsights";
import type { DateRange } from "@/lib/analytics/dateRange";
import { CsvValidationError, parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { bucketDuration, bucketRowCount, capture } from "@/lib/posthog";
import type { SugarWodRow } from "@/types/sugarwod";

export type DataSource = "upload" | "sample";

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: SugarWodRow[]; source: DataSource };

const SAMPLE_CSV_URL = "/sample/sugarwod-sample-export.csv";

export default function App() {
  const [state, setState] = useState<AppState>({ status: "idle" });
  const [range, setRange] = useState<DateRange | null>(null);

  const insights = useMemo(
    () => (state.status === "ready" ? buildInsights(state.rows, range) : null),
    [state, range]
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
      setState({ status: "ready", rows, source });
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
  }, []);

  if (state.status === "ready" && insights) {
    return (
      <Dashboard
        insights={insights}
        source={state.source}
        range={range}
        onRangeChange={setRange}
        onReset={reset}
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
