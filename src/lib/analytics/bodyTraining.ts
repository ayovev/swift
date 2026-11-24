import { classifySubjects, type ProgressHeadline } from "./insights/headline";
import { readingsFromInBody, weightBandLb } from "./insights/bodyReadings";
import type { BodyReading } from "./insights/bodyContext";
import { entriesInPeriod } from "./insights/progressReport";
import { buildProgressSubjects } from "./insights/sessions";
import { weightChange, type WeightChange } from "./overview";
import type { ParsedRow } from "./buildDashboardData";
import { buildTrainingMix, type TrainingMixData } from "./trainingMix";
import { pooledReadings, pooledScanRows } from "./weighIns";
import type { InBodyRow } from "@/types/inbody";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";

/**
 * Everything the Body and training report prints (docs/reports.md), for a period: body weight from the pooled scans and weigh-ins, lean and
 * fat mass from scans, days trained per month, and the Progress headline, side by side. Entries that touch the period are marked.
 *
 * Nothing here relates body to training. Body composition never feeds a verdict or a count (CLAUDE.md, "Architecture: the progress
 * verdict"): the headline is Progress exactly as it stands at the end of the period, and the report states no sentence about one
 * changing the other. Weight keeps its noise band: a change inside it is "within normal variation", the rule every other view uses.
 * Dates are passed in, never read from the clock.
 */
export interface BodyTrainingData {
  start: string | null;
  end: string;
  /** Every reading in the period (scans, and weigh-ins on days no scan covers), oldest first. */
  readings: BodyReading[];
  /** Readings in the period from a scan, and from a weigh-in. */
  scanReadings: number;
  weighInReadings: number;
  /** The noise band for body weight, in lb, measured from the whole pooled history. */
  bandLb: number;
  /** First reading in the period to its last; null with fewer than two. */
  change: WeightChange | null;
  /** Any reading in the period reports lean or fat mass (scans only). */
  hasLeanFat: boolean;
  /** Days trained per month, and the log's last workout, from the same builder the Training mix report uses. */
  mix: TrainingMixData;
  /** Progress as of the end of the period. */
  headline: ProgressHeadline;
  /** Timeline entries that touch the period, in start order. */
  entries: TimelineEntry[];
  /** The newest scan and the newest weigh-in on or before the end, for the footer's basis. */
  lastScan: string | null;
  lastWeighIn: string | null;
}

/** Whether there is anything to report on at all: any reading, in any period. A report needs an InBody file or weigh-ins. */
export function hasBodyReadings(scans: readonly InBodyRow[], weighIns: readonly WeighIn[]): boolean {
  return pooledReadings(readingsFromInBody(scans), weighIns).length > 0;
}

export function buildBodyTraining(
  parsedRows: readonly ParsedRow[],
  scans: readonly InBodyRow[],
  weighIns: readonly WeighIn[],
  timeline: readonly TimelineEntry[],
  start: string | null,
  end: string
): BodyTrainingData {
  const scanReadings = readingsFromInBody(scans);
  const pooled = pooledReadings(scanReadings, weighIns);
  const inPeriod = (date: string): boolean => date <= end && (start === null || date >= start);
  const readings = pooled.filter((r) => inPeriod(r.date));
  const scansIn = scanReadings.filter((r) => inPeriod(r.date)).length;
  const bandLb = weightBandLb(pooledScanRows(scans, weighIns));
  const first = readings[0];
  const last = readings.at(-1);

  const newest = (dates: readonly string[]): string | null => dates.filter((d) => d <= end).reduce<string | null>((m, d) => (m === null || d > m ? d : m), null);

  return {
    start,
    end,
    readings,
    scanReadings: scansIn,
    weighInReadings: readings.length - scansIn,
    bandLb,
    change: first && last && first !== last ? weightChange(first.weightLb, last.weightLb, bandLb) : null,
    hasLeanFat: readings.some((r) => r.leanLb !== undefined || r.fatLb !== undefined),
    mix: buildTrainingMix(parsedRows, start, end),
    headline: classifySubjects(buildProgressSubjects(parsedRows.map((r) => r.raw)).subjects, end).headline,
    entries: entriesInPeriod(timeline, start, end),
    lastScan: newest(scanReadings.map((r) => r.date)),
    lastWeighIn: newest(weighIns.map((w) => w.date)),
  };
}

const lb = (x: number): string => String(Number(x.toFixed(1)));

/** "190 lb to 180 lb, down 10 lb." or "…, within normal variation." The words the Timeline and Overview use; no cause, no grade. */
export function weightChangeSentence(data: BodyTrainingData): string | null {
  const first = data.readings[0];
  const last = data.readings.at(-1);
  if (!first || !last || !data.change) return null;
  const span = `${lb(first.weightLb)} lb to ${lb(last.weightLb)} lb`;
  if (data.change.kind === "within") return `Body weight, first reading to last in this period: ${span}, within normal variation.`;
  const lbs = Math.abs(data.change.lb);
  return `Body weight, first reading to last in this period: ${span}, ${data.change.lb > 0 ? "up" : "down"} ${lb(lbs)} lb.`;
}

/** The noise band in words: what a change has to beat before it reads as more than normal variation. */
export function bandSentence(bandLb: number): string {
  return `A change of ${lb(bandLb)} lb or less between readings is within normal variation.`;
}
