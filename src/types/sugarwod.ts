/**
 * Shape of a single row in a SugarWOD "Export Workouts" CSV.
 *
 * v1 assumes one stable export schema (REQUIREMENTS.md §4.1). Every field
 * arrives as a string from PapaParse; empty cells are empty strings, and a
 * few columns are absent-in-practice rather than absent-in-schema, so all
 * consumers must tolerate "".
 */
export interface SugarWodRow {
  /** MM/DD/YYYY. Never parse with `new Date()` — see parseDate(). */
  date: string;
  title: string;
  description: string;
  /** Numeric score as a bare string, e.g. "225" or "695" (seconds). */
  best_result_raw: string;
  /** Human-formatted score, e.g. "3:45" or "165". */
  best_result_display: string;
  /** "Load" | "Reps" | "Rounds + Reps" | "Calories" | "Meters" | ... | "" */
  score_type: string;
  /** Named barbell movement, e.g. "Back Squat". Empty for non-lift entries. */
  barbell_lift: string;
  /** JSON blob of per-set detail. Unused in v1. */
  set_details: string;
  /** Free-text athlete notes. Never analysed, never transmitted. */
  notes: string;
  /** Literally "RX" or "SCALED"; anything else counts as neither. */
  rx_or_scaled: string;
  /** Literally "PR"; anything else (including "") is not a PR. */
  pr: string;
}

/**
 * Columns parseCsv requires before it will hand a file to the pipeline.
 * `set_details` and `notes` are deliberately excluded — nothing reads them,
 * so their absence should not reject an otherwise-valid export.
 */
export const REQUIRED_COLUMNS = [
  "date",
  "title",
  "description",
  "best_result_raw",
  "best_result_display",
  "score_type",
  "barbell_lift",
  "rx_or_scaled",
  "pr",
] as const;
