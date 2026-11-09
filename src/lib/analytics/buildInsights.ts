import { buildFromParsedRows, parseRows, type ParsedRow } from "./buildDashboardData";
import { buildModalityData } from "./buildModalityData";
import { buildMovementData } from "./buildMovementData";
import { filterParsedRowsByRange, getDateBounds, type DateRange } from "./dateRange";
import type { Granularity } from "./granularity";
import type { DashboardData } from "@/types/dashboard";
import type { ModalityData } from "@/types/modality";
import type { MovementData } from "@/types/movements";
import type { SugarWodRow } from "@/types/sugarwod";

export interface Insights {
  dashboard: DashboardData;
  modality: ModalityData;
  movements: MovementData;
  /** The full, unfiltered span of the uploaded log — independent of `range`. */
  dateBounds: DateRange | null;
  /**
   * Every parsed row, oldest first, ignoring `range`: the same parse as
   * everything above, kept for Overview, which reads the full history as of
   * today (docs/overview.md). Never a second `parseRows()` call.
   */
  allRows: ParsedRow[];
  /**
   * `dashboard` and `modality` over the full history, for Overview's charts.
   * The same objects as above when no range is set; otherwise built from
   * `allRows`, which re-aggregates but never re-parses.
   */
  overall: { dashboard: DashboardData; modality: ModalityData };
}

/**
 * The whole client-side pipeline: parsed CSV rows in, everything the dashboard
 * renders out. Rows are parsed and classified ONCE and shared by every
 * aggregator — at ~1,200 rows, parsing twice is the difference between
 * comfortably inside the 5-second budget and not.
 *
 * `range` filters the shared `ParsedRow[]` once, after parsing, before either
 * aggregator runs — so both stay consistent and neither re-parses the file.
 * `dateBounds` is taken from the unfiltered parse, so a narrower `range`
 * never shrinks the picker's own bounds.
 *
 * `granularity` controls how rows are bucketed for every trend chart (default
 * monthly). It's baked into each row once in `parseRows`, same as `range` is
 * applied once here, rather than threaded separately through each aggregator.
 */
export function buildInsights(
  rows: SugarWodRow[],
  range: DateRange | null = null,
  granularity: Granularity = "monthly"
): Insights {
  const parsed = parseRows(rows, granularity);
  const dateBounds = getDateBounds(parsed);
  const filtered = filterParsedRowsByRange(parsed, range);
  const dashboard = buildFromParsedRows(filtered);
  const modality = buildModalityData(filtered);
  return {
    dashboard,
    modality,
    movements: buildMovementData(filtered),
    dateBounds,
    allRows: parsed,
    overall: range
      ? { dashboard: buildFromParsedRows(parsed), modality: buildModalityData(parsed) }
      : { dashboard, modality },
  };
}
