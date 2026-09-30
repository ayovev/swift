import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";

/** Minimal hand-built rows for analytics tests; every field a consumer might read is present. */
export function workoutRow(overrides: Partial<SugarWodRow> & { date: string; title: string }): SugarWodRow {
  return {
    description: "",
    best_result_raw: "",
    best_result_display: "",
    score_type: "",
    barbell_lift: "",
    set_details: "",
    notes: "",
    rx_or_scaled: "RX",
    pr: "",
    ...overrides,
  };
}

/** A logged 1RM for a lift, `date` as MM/DD/YYYY. */
export function liftRow(date: string, lift: string, load: number, extra: Partial<SugarWodRow> = {}): SugarWodRow {
  return workoutRow({
    date,
    title: lift.toUpperCase(),
    description: `${lift} 1RM`,
    barbell_lift: lift,
    score_type: "Load",
    best_result_raw: String(load),
    ...extra,
  });
}

/** Positional form for tests that build many rows: `logRow("01/05/2025", "ROW", "2000m row")`. */
export function logRow(date: string, title: string, description = "", overrides: Partial<SugarWodRow> = {}): SugarWodRow {
  return workoutRow({ date, title, description, ...overrides });
}

/**
 * The row the sample-generator tests use: a FRAN with a score, dated 2022
 * unless told otherwise. Only its dates matter to those generators.
 */
export function franRow(overrides: Partial<SugarWodRow> = {}): SugarWodRow {
  return workoutRow({
    date: "01/01/2022",
    title: "FRAN",
    description: "21-15-9Thrusters (65/95 lb)Pull-ups",
    best_result_raw: "240",
    best_result_display: "4:00",
    ...overrides,
  });
}

/** An InBody row from its raw `YYYYMMDDHHmmss` timestamp; every metric is "-" (not measured) unless given. */
export function inbodyRow(overrides: Partial<InBodyRow> & { date: string }): InBodyRow {
  return {
    "Weight(lb)": "-",
    "Skeletal Muscle Mass(lb)": "-",
    "Soft Lean Mass(lb)": "-",
    "Body Fat Mass(lb)": "-",
    "Percent Body Fat(%)": "-",
    "BMI(kg/m²)": "-",
    "InBody Score": "-",
    ...overrides,
  };
}

/** `date` as YYYY-MM-DD; time of day defaults to 09:00. */
export function scanRow(date: string, fields: Partial<InBodyRow> = {}, hhmmss = "090000"): InBodyRow {
  return inbodyRow({ date: `${date.replaceAll("-", "")}${hhmmss}`, ...fields });
}
