/**
 * Shape of a single row in an InBody app "Export" CSV.
 *
 * A real export carries ~44 columns (per-limb lean/fat mass, ECW ratios,
 * water compartments, etc.) — only the columns a body-composition trend view
 * actually reads are modeled here, the same way SugarWodRow skips columns
 * nothing reads. PapaParse still attaches every other column to the parsed
 * object; they're simply untyped and ignored.
 */
export interface InBodyRow {
  /**
   * A raw timestamp, NOT a calendar-date string: `YYYYMMDDHHmmss`
   * (e.g. "20260528152808" = 2026-05-28 15:28:08). Parse strictly with
   * dayjs(str, "YYYYMMDDHHmmss", true) — never MM/DD/YYYY like SugarWodRow.date,
   * and never `new Date()`.
   */
  date: string;
  /** Missing/not-applicable cells are the literal string "-", not "". */
  "Weight(lb)": string;
  "Skeletal Muscle Mass(lb)": string;
  "Percent Body Fat(%)": string;
  "BMI(kg/m²)": string;
  "InBody Score": string;
}

/**
 * date + Weight(lb) are the only columns every InBody export tier reports.
 * The rest are read when present and tolerated as missing ("-") otherwise —
 * a slim export must not be rejected for lacking a metric a given device or
 * plan doesn't measure.
 */
export const REQUIRED_COLUMNS = ["date", "Weight(lb)"] as const;
