import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { ProgressReportPrototype } from "@/components/reports/ProgressReportPrototype";
import { parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { extendSampleRows } from "@/lib/sample/extendSample";
import type { SugarWodRow } from "@/types/sugarwod";

/**
 * Dev-only entry for the Reports print prototype (docs/reports.md). `main.tsx` reaches it only behind `import.meta.env.DEV` and a
 * `?report-prototype` query, so a production build never includes it. It loads the bundled sample the way sample mode does.
 */
export function DevReportPrototype() {
  const [rows, setRows] = useState<SugarWodRow[] | null>(null);
  useEffect(() => {
    void fetch("/sample/sugarwod-sample-export.csv")
      .then((r) => r.text())
      .then((text) => parseSugarWodCsv(text))
      .then((parsed) => setRows(extendSampleRows(parsed)));
  }, []);
  if (!rows) return <p className="p-6">Loading sample…</p>;
  return <ProgressReportPrototype rows={rows} today={dayjs().format("YYYY-MM-DD")} />;
}
