/**
 * Manual weigh-ins and how they pool with InBody scans.
 *
 * A weigh-in is a date and a weight in pounds (50 to 600 inclusive), plus an optional note of up to 200 characters. One per day: a
 * second weigh-in for a date replaces the first, note included. The form refuses a date after today (`validateWeighIn`); a list
 * that arrives by sync or backup is checked for shape only (`validateWeighInList`), because another device's clock must not make a good
 * list unreadable. All-or-nothing, like every other dataset.
 *
 * **One body-weight series.** InBody scans and weigh-ins pool into one series for "body weight at a date"; on a day with both, the InBody
 * scan is used and the weigh-in is kept, listed as not used, and used again if the scan goes away. Lean and fat mass come from scans
 * only. The noise band is estimated from the pooled series (`bodyCompNoise.ts`), so frequent weigh-ins reach a measured band where
 * scans months apart fell to the 3 lb default. No smoothing: a reading is used as entered.
 */
import { WEIGH_IN_MAX_LB, WEIGH_IN_MIN_LB, WEIGH_IN_NOTE_MAX, type WeighIn } from "@/types/weighIn";
import type { InBodyRow } from "@/types/inbody";
import { inbodyRowFromReading, type BodyReading } from "./insights/bodyContext";
import { isIsoDay } from "./scanParsing";

export type WeighInResult = { status: "ok"; value: WeighIn } | { status: "invalid"; reasons: string[] };

/** Checks the form's fields. Every failing rule is listed, in plain sentences, and nothing is saved while any fails. */
export function validateWeighIn(input: { date: string; weightLb: number | null; notes?: string }, today: string): WeighInResult {
  const reasons: string[] = [];
  if (!input.date) reasons.push("Add a date.");
  else if (!isIsoDay(input.date)) reasons.push("Add a valid date.");
  else if (input.date > today) reasons.push("The date is after today.");
  const w = input.weightLb;
  if (w === null || !Number.isFinite(w)) reasons.push("Enter your weight in pounds.");
  else if (w < WEIGH_IN_MIN_LB || w > WEIGH_IN_MAX_LB) reasons.push(`The weight must be between ${WEIGH_IN_MIN_LB} and ${WEIGH_IN_MAX_LB} lb.`);
  const notes = (input.notes ?? "").trim();
  if (notes.length > WEIGH_IN_NOTE_MAX) reasons.push(`The note is over ${WEIGH_IN_NOTE_MAX} characters.`);
  if (reasons.length) return { status: "invalid", reasons };
  return { status: "ok", value: { date: input.date, weightLb: w as number, ...(notes ? { notes } : {}), source: "manual" } };
}

export type WeighInListResult = { status: "ok"; weighIns: WeighIn[] } | { status: "invalid"; reason: string };

/** Shape check for a list from sync or backup: the first bad record rejects the whole list, naming it. */
export function validateWeighInList(list: unknown): WeighInListResult {
  if (!Array.isArray(list)) return { status: "invalid", reason: "That file doesn't contain a list of weigh-ins." };
  const out: WeighIn[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const w = raw as Partial<Record<keyof WeighIn, unknown>> | null;
    if (!w || typeof w !== "object" || Array.isArray(w)) return { status: "invalid", reason: `Weigh-in ${n} isn't an object.` };
    if (!isIsoDay(w.date)) return { status: "invalid", reason: `Weigh-in ${n} has no valid date (YYYY-MM-DD).` };
    if (seen.has(w.date)) return { status: "invalid", reason: `Weigh-in ${n} repeats a date used by an earlier weigh-in.` };
    if (typeof w.weightLb !== "number" || !Number.isFinite(w.weightLb)) return { status: "invalid", reason: `Weigh-in ${n} has a weight that isn't a number.` };
    if (w.weightLb < WEIGH_IN_MIN_LB || w.weightLb > WEIGH_IN_MAX_LB) {
      return { status: "invalid", reason: `Weigh-in ${n} has a weight outside ${WEIGH_IN_MIN_LB} to ${WEIGH_IN_MAX_LB} lb.` };
    }
    if (w.source !== "manual") return { status: "invalid", reason: `Weigh-in ${n} has a source other than manual.` };
    if (w.notes !== undefined && typeof w.notes !== "string") return { status: "invalid", reason: `Weigh-in ${n} has a note that isn't text.` };
    const notes = typeof w.notes === "string" ? w.notes.trim() : "";
    if (notes.length > WEIGH_IN_NOTE_MAX) return { status: "invalid", reason: `Weigh-in ${n} has a note over ${WEIGH_IN_NOTE_MAX} characters.` };
    seen.add(w.date);
    out.push({ date: w.date, weightLb: w.weightLb, ...(notes ? { notes } : {}), source: "manual" });
  }
  return { status: "ok", weighIns: out };
}

/** Saves a weigh-in, replacing any for the same date, and keeps the list ascending by date. */
export function upsertWeighIn(list: readonly WeighIn[], next: WeighIn): WeighIn[] {
  return [...list.filter((w) => w.date !== next.date), next].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function removeWeighIn(list: readonly WeighIn[], date: string): WeighIn[] {
  return list.filter((w) => w.date !== date);
}

export interface BodyWeightRow {
  date: string;
  weightLb: number;
  /** "scan" is read-only; "entered" can be edited and deleted. */
  kind: "scan" | "entered";
  notes?: string;
  /** False for a weigh-in on a day an InBody scan also covers. */
  used: boolean;
}

/** Scans (read-only) and weigh-ins in one list, newest first, with a weigh-in marked unused when a scan covers its day. */
export function bodyWeightRows(scans: readonly BodyReading[], weighIns: readonly WeighIn[]): BodyWeightRow[] {
  const scanDays = new Set(scans.map((s) => s.date));
  const rows: BodyWeightRow[] = [
    ...scans.map((s) => ({ date: s.date, weightLb: s.weightLb, kind: "scan" as const, used: true })),
    ...weighIns.map((w) => ({ date: w.date, weightLb: w.weightLb, kind: "entered" as const, ...(w.notes ? { notes: w.notes } : {}), used: !scanDays.has(w.date) })),
  ];
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.kind === "scan" ? -1 : 1));
}

/** The pooled series: every scan, plus each weigh-in on a day no scan covers. Lean and fat mass are the scans' own. */
export function pooledReadings(scans: readonly BodyReading[], weighIns: readonly WeighIn[]): BodyReading[] {
  const scanDays = new Set(scans.map((s) => s.date));
  const extra: BodyReading[] = weighIns.filter((w) => !scanDays.has(w.date)).map((w) => ({ date: w.date, weightLb: w.weightLb }));
  return [...scans, ...extra].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The scans plus each weigh-in on a day no scan covers, as scan rows carrying only a weight, so the existing noise-band methods can measure the pooled series. */
export function pooledScanRows(scans: readonly InBodyRow[], weighIns: readonly WeighIn[]): InBodyRow[] {
  const scanDays = new Set(scans.map((s) => s.date.slice(0, 8)));
  const extra = weighIns.filter((w) => !scanDays.has(w.date.replaceAll("-", ""))).map((w) => inbodyRowFromReading({ date: w.date, weightLb: w.weightLb }));
  return [...scans, ...extra];
}
