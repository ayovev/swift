import { isIsoDay } from "@/lib/analytics/scanParsing";
import { DATE_SHAPE as SUGARWOD_DATE_SHAPE } from "@/lib/csv/parseCsv";
import { DATE_SHAPE as INBODY_DATE_SHAPE } from "@/lib/csv/parseInBodyCsv";
import type { Experiment } from "@/types/experiment";
import { REQUIRED_COLUMNS as INBODY_REQUIRED, type InBodyRow } from "@/types/inbody";
import { REQUIRED_COLUMNS as SUGARWOD_REQUIRED, type SugarWodRow } from "@/types/sugarwod";

/**
 * Checks for data that arrives from another device, before any of it is
 * written to this one. Sync is between the athlete's own devices, but a
 * corrupted transfer, a version mismatch or a tampered payload must still
 * never overwrite a good local log with something the rest of the app can't
 * read — so each dataset is held to the shape its own parser produces.
 *
 * All-or-nothing: one bad row rejects the dataset, with a reason naming which
 * row and what is wrong, and the caller leaves the local copy untouched.
 * Rows are never repaired or partly kept. Cells in a parsed CSV are always
 * strings, so a row containing anything else is treated as corrupt.
 *
 * Extra columns are kept: an export carries columns nothing reads today (the
 * InBody export has ~44), and sync moves the athlete's data, not only the
 * columns this version happens to use.
 */

export type Validated<T> = { status: "ok"; value: T } | { status: "invalid"; reason: string };

const invalid = (reason: string): { status: "invalid"; reason: string } => ({ status: "invalid", reason });

function validateCsvRows<T>(
  raw: unknown,
  label: string,
  required: readonly string[],
  optionalFill: Record<string, string>,
  dateField: string,
  dateShape: RegExp
): Validated<T[]> {
  if (!Array.isArray(raw)) return invalid(`The ${label} isn't a list.`);
  if (raw.length === 0) return invalid(`The ${label} is empty.`);

  const rows: T[] = [];
  for (const [i, entry] of raw.entries()) {
    const n = i + 1;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return invalid(`Row ${n} of the ${label} isn't a set of columns.`);
    }
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).includes("__proto__")) {
      return invalid(`Row ${n} of the ${label} has a column it can't use.`);
    }
    for (const col of required) {
      if (!(col in row)) return invalid(`Row ${n} of the ${label} has no "${col}" column.`);
    }
    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== "string") return invalid(`Row ${n} of the ${label} has a "${key}" that isn't text.`);
    }
    if (!dateShape.test((row[dateField] as string).trim())) {
      return invalid(`Row ${n} of the ${label} has an unreadable date.`);
    }
    // Optional typed columns a slim export may lack: filled with the empty
    // value every consumer already tolerates, so the row matches its type.
    rows.push({ ...optionalFill, ...row } as T);
  }
  return { status: "ok", value: rows };
}

export function validateWorkoutRows(raw: unknown): Validated<SugarWodRow[]> {
  return validateCsvRows<SugarWodRow>(
    raw,
    "workout log",
    SUGARWOD_REQUIRED,
    { set_details: "", notes: "" },
    "date",
    SUGARWOD_DATE_SHAPE
  );
}

export function validateBodyCompRows(raw: unknown): Validated<InBodyRow[]> {
  return validateCsvRows<InBodyRow>(
    raw,
    "body composition history",
    INBODY_REQUIRED,
    {
      "Skeletal Muscle Mass(lb)": "-",
      "Soft Lean Mass(lb)": "-",
      "Body Fat Mass(lb)": "-",
      "Percent Body Fat(%)": "-",
      "BMI(kg/m²)": "-",
      "InBody Score": "-",
    },
    "date",
    INBODY_DATE_SHAPE
  );
}

export function validateExperiments(raw: unknown): Validated<Experiment[]> {
  if (!Array.isArray(raw)) return invalid("The list of experiments isn't a list.");

  const out: Experiment[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of raw.entries()) {
    const n = i + 1;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return invalid(`Experiment ${n} isn't an object.`);
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id === "") return invalid(`Experiment ${n} has no id.`);
    if (seen.has(e.id)) return invalid(`Experiment ${n} repeats an id used by an earlier experiment.`);
    if (!isIsoDay(e.date)) return invalid(`Experiment ${n} has no valid start date.`);
    if (typeof e.label !== "string" || e.label.trim() === "") return invalid(`Experiment ${n} has no label.`);
    if (e.endDate !== undefined && !isIsoDay(e.endDate)) return invalid(`Experiment ${n} has an end date that isn't a date.`);
    if (e.baselineStart !== undefined && !isIsoDay(e.baselineStart)) {
      return invalid(`Experiment ${n} has an earlier-range start that isn't a date.`);
    }
    seen.add(e.id);
    out.push({
      id: e.id,
      date: e.date,
      label: e.label,
      ...(typeof e.endDate === "string" ? { endDate: e.endDate } : {}),
      ...(typeof e.baselineStart === "string" ? { baselineStart: e.baselineStart } : {}),
    });
  }
  return { status: "ok", value: out };
}
