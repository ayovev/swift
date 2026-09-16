import { buildFromParsedRows, parseRows } from "./buildDashboardData";
import { buildModalityData } from "./buildModalityData";
import type { DashboardData } from "@/types/dashboard";
import type { ModalityData } from "@/types/modality";
import type { SugarWodRow } from "@/types/sugarwod";

export interface Insights {
  dashboard: DashboardData;
  modality: ModalityData;
}

/**
 * The whole client-side pipeline: parsed CSV rows in, everything the dashboard
 * renders out. Rows are parsed and classified ONCE and shared by both
 * aggregators — at ~1,200 rows, parsing twice is the difference between
 * comfortably inside the 5-second budget and not.
 */
export function buildInsights(rows: SugarWodRow[]): Insights {
  const parsed = parseRows(rows);
  return {
    dashboard: buildFromParsedRows(parsed),
    modality: buildModalityData(parsed),
  };
}
