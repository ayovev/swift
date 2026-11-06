/**
 * The words under an entry's before and after, and its body-weight line. Same register as `display.ts`: facts, no cause, no
 * grade. Body weight appears once, over the entry's own span, with the front door's reading rule and noise band and no
 * sentence relating it to the verdict (an entry has one span, so one line is honest here; a headline spans many).
 */
import { PV_HEADLINE_MIN_COUNTED, PV_MIN_SESSIONS_PER_SIDE } from "../insightConfig";
import { entryEnd } from "../timeline";
import type { TimelineEntry } from "@/types/timeline";
import { valueAt, type BodyReading } from "./bodyContext";
import { displayName, formatSession } from "./display";
import type { EntryVerdict } from "./entryVerdict";
import { headlineSentence } from "./headline";
import { bestSession } from "./verdict";
import type { ProgressSubject } from "./sessions";


/** "Improving in 3 of 4 lifts and benchmarks (1 no clear change)." or null when there is no label. */
export function entrySummary(v: EntryVerdict): string | null {
  return v.label ? headlineSentence(v.label, v.up, v.down, v.noClearChange) : null;
}

/** "Left out: 1 not tested since." or null. */
export function entryLeftOut(v: EntryVerdict): string | null {
  return v.notTested > 0 ? `Left out: ${v.notTested} not tested since.` : null;
}

/** The sentence under "No before and after yet". */
export function entryShortfall(v: EntryVerdict): string {
  const gate = `Needs ${PV_HEADLINE_MIN_COUNTED} lifts or benchmarks with at least ${PV_MIN_SESSIONS_PER_SIDE} sessions during this entry and ${PV_MIN_SESSIONS_PER_SIDE} before it, has ${v.counted}.`;
  if (v.closest.length === 0) return gate;
  const parts = v.closest.map((c) => {
    const need = [c.moreDuring > 0 ? `${c.moreDuring} more during` : "", c.moreBefore > 0 ? `${c.moreBefore} more before` : ""].filter(Boolean).join(", ");
    return `${displayName(c.subject)}, ${need}`;
  });
  return `${gate} Closest: ${parts.join("; ")}.`;
}

/**
 * What a subject logged on each side, with no direction: "Back Squat: 5 sessions before, 2 during. Best before 315 lb est., best
 * during 325 lb est."
 */
export function entryFactsLine(subject: ProgressSubject, entry: TimelineEntry, asOf: string): string {
  const end = entryEnd(entry, asOf);
  const sessions = subject.sessions.filter((s) => s.date <= asOf);
  const before = sessions.filter((s) => s.date < entry.startDate);
  const during = sessions.filter((s) => s.date >= entry.startDate && s.date <= end);
  const word = (n: number): string => `${n} ${n === 1 ? "session" : "sessions"}`;
  const est = subject.format === "load" ? " est." : "";
  const bestBefore = formatSession(subject, bestSession(before, subject.lowerIsBetter));
  const bestDuring = formatSession(subject, bestSession(during, subject.lowerIsBetter));
  return `${displayName(subject)}: ${word(before.length)} before, ${during.length} during. Best before ${bestBefore}${before.length ? "" : est}, best during ${bestDuring}.`;
}

/** The first `shown` facts lines and "and N more". */
export function entryFactsLines(v: EntryVerdict, entry: TimelineEntry, asOf: string, shown = 5): { lines: string[]; more: number } {
  return {
    lines: v.facts.slice(0, shown).map((r) => entryFactsLine(r.subject, entry, asOf)),
    more: Math.max(0, v.facts.length - shown),
  };
}

const MINUS = "−";
const lb = (x: number): string => String(Number(x.toFixed(1)));

/**
 * Body weight over the entry's span: the reading at its start and at its end (the reference date for an ongoing one), by the
 * reading rule. A change inside the band is "within normal scan variation". Null when either end has no reading.
 */
export function entryBodyWeightLine(entry: TimelineEntry, readings: readonly BodyReading[], bandLb: number, asOf: string): string | null {
  if (readings.length === 0) return null;
  const start = valueAt(entry.startDate, readings, "weightLb");
  const end = valueAt(entryEnd(entry, asOf), readings, "weightLb");
  if (start === null || end === null) return null;
  const delta = end - start;
  const span = `${lb(start)} lb to ${lb(end)} lb`;
  if (Math.abs(delta) < bandLb) return `Body weight over this entry: ${span}, within normal scan variation.`;
  return `Body weight over this entry: ${span}, ${delta > 0 ? "up" : "down"} ${lb(Math.abs(delta))} lb.`.replace("-", MINUS);
}

/** "Overlaps: Two weeks abroad, Shoulder tweak" or null. */
export function overlapsLine(names: readonly string[]): string | null {
  return names.length > 0 ? `Overlaps: ${names.join(", ")}` : null;
}

