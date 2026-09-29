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

/** `date` as YYYY-MM-DD; time of day defaults to 09:00. */
export function scanRow(date: string, fields: Partial<InBodyRow> = {}, hhmmss = "090000"): InBodyRow {
  return {
    date: `${date.replaceAll("-", "")}${hhmmss}`,
    "Weight(lb)": "-",
    "Skeletal Muscle Mass(lb)": "-",
    "Soft Lean Mass(lb)": "-",
    "Body Fat Mass(lb)": "-",
    "Percent Body Fat(%)": "-",
    "BMI(kg/m²)": "-",
    "InBody Score": "-",
    ...fields,
  };
}
