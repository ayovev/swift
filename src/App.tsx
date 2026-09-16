import { useCallback, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Landing } from "@/components/landing/Landing";
import { buildInsights, type Insights } from "@/lib/analytics/buildInsights";
import { CsvValidationError, parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { bucketDuration, bucketRowCount, capture } from "@/lib/posthog";

export type DataSource = "upload" | "sample";

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; insights: Insights; source: DataSource };

const SAMPLE_CSV_URL = "/sample/sugarwod-sample-export.csv";

export default function App() {
  const [state, setState] = useState<AppState>({ status: "idle" });

  const run = useCallback(async (source: DataSource, load: () => Promise<File | string>) => {
    setState({ status: "loading" });
    capture(source === "sample" ? { name: "sample_data_used" } : { name: "upload_attempted" });

    const startedAt = performance.now();
    try {
      const input = await load();
      const rows = await parseSugarWodCsv(input);
      const insights = buildInsights(rows);

      capture({
        name: "upload_succeeded",
        props: {
          rows: bucketRowCount(rows.length),
          duration_bucket: bucketDuration(performance.now() - startedAt),
        },
      });
      setState({ status: "ready", insights, source });
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

  const reset = useCallback(() => setState({ status: "idle" }), []);

  if (state.status === "ready") {
    return <Dashboard insights={state.insights} source={state.source} onReset={reset} />;
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
