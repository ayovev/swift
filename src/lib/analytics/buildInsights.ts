import { buildFromParsedRows, parseRows } from "./buildDashboardData";
import { buildModalityData } from "./buildModalityData";
import { filterParsedRowsByRange, getDateBounds, type DateRange } from "./dateRange";
import type { DashboardData } from "@/types/dashboard";
import type { ModalityData } from "@/types/modality";
import type { SugarWodRow } from "@/types/sugarwod";

export interface Insights {
  dashboard: DashboardData;
  modality: ModalityData;
  /** The full, unfiltered span of the uploaded log — independent of `range`. */
  dateBounds: DateRange | null;
}

/**
 * The whole client-side pipeline: parsed CSV rows in, everything the dashboard
 * renders out. Rows are parsed and classified ONCE and shared by both
 * aggregators — at ~1,200 rows, parsing twice is the difference between
 * comfortably inside the 5-second budget and not.
 *
 * `range` filters the shared `ParsedRow[]` once, after parsing, before either
 * aggregator runs — so both stay consistent and neither re-parses the file.
 * `dateBounds` is taken from the unfiltered parse, so a narrower `range`
 * never shrinks the picker's own bounds.
 */
export function buildInsights(rows: SugarWodRow[], range: DateRange | null = null): Insights {
  const parsed = parseRows(rows);
  const dateBounds = getDateBounds(parsed);
  const filtered = filterParsedRowsByRange(parsed, range);
  return {
    dashboard: buildFromParsedRows(filtered),
    modality: buildModalityData(filtered),
    dateBounds,
  };
}
