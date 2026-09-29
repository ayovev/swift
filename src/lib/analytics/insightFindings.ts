import { analyzeTimeOfDay, getBodyCompNoiseBands, NO_NOISE_BANDS, type BodyCompNoiseBands, type TimeOfDayFinding } from "./bodyCompNoise";
import { getAlignment } from "./alignment";
import { getExperimentInsight } from "./experimentInsight";
import { BODY_COMP_METRICS, type BodyCompMetric } from "./insightConfig";
import { getPlateauInsights } from "./plateauDetector";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";

/**
 * Developer-facing report for the maintainer: what the noise bands came out
 * as on a given pair of exports, and exactly which existing insight outputs
 * moved when the bands replaced sign-only body-comp reads. Pure — the
 * `tests/insightFindings.test.ts` runner feeds it real exports from disk
 * (see that file), and nothing here is bundled into the app's runtime path.
 */

export interface InsightChange {
  insight: "plateau" | "alignment" | "experiment";
  subject: string;
  before: string;
  after: string;
}

export interface InsightFindings {
  scanCount: number;
  bands: BodyCompNoiseBands;
  timeOfDay: Record<BodyCompMetric, TimeOfDayFinding>;
  changes: InsightChange[];
  /** Total outputs compared, so "0 of 41 changed" is legible. */
  compared: number;
}

export function buildInsightFindings(
  workouts: SugarWodRow[],
  scans: InBodyRow[],
  experiments: Experiment[],
  asOf: Date
): InsightFindings {
  const bands = getBodyCompNoiseBands(scans);
  const timeOfDay = Object.fromEntries(
    BODY_COMP_METRICS.map((m) => [m, analyzeTimeOfDay(scans, m)])
  ) as Record<BodyCompMetric, TimeOfDayFinding>;

  const changes: InsightChange[] = [];
  let compared = 0;
  const note = (insight: InsightChange["insight"], subject: string, before: string, after: string) => {
    compared++;
    if (before !== after) changes.push({ insight, subject, before, after });
  };

  const plateauBefore = getPlateauInsights(workouts, scans, asOf, { noiseBands: NO_NOISE_BANDS });
  const plateauAfter = getPlateauInsights(workouts, scans, asOf, { noiseBands: bands });
  plateauAfter.forEach((after, i) => {
    const before = plateauBefore[i]!;
    note("plateau", `${after.subject.name} (${after.subject.status})`, before.classification, after.classification);
  });

  const alignBefore = getAlignment(plateauBefore, scans, asOf, { noiseBands: NO_NOISE_BANDS });
  const alignAfter = getAlignment(plateauAfter, scans, asOf, { noiseBands: bands });
  note("alignment", "whole athlete", alignBefore.classification, alignAfter.classification);

  for (const e of experiments) {
    const b = getExperimentInsight(e, workouts, scans, asOf, { noiseBands: NO_NOISE_BANDS });
    const a = getExperimentInsight(e, workouts, scans, asOf, { noiseBands: bands });
    note("experiment", e.label, b.classification, a.classification);
  }

  return { scanCount: scans.length, bands, timeOfDay, changes, compared };
}

export function formatInsightFindings(f: InsightFindings): string {
  const lines: string[] = [`Scans: ${f.scanCount}`, "", "Noise bands (change between two scans below which is treated as noise):"];
  for (const m of BODY_COMP_METRICS) {
    const b = f.bands[m];
    lines.push(
      b.status === "insufficient"
        ? `  ${m}: insufficient — ${b.reason}`
        : `  ${m}: ±${b.band.toFixed(2)}  method=${b.method}  n=${b.sampleSize}${b.reason ? `  (${b.reason})` : ""}`
    );
  }
  lines.push("", "Morning vs afternoon (diagnostic only, nothing adjusts for it):");
  for (const m of BODY_COMP_METRICS) {
    const t = f.timeOfDay[m];
    lines.push(
      t.status === "insufficient"
        ? `  ${m}: ${t.reason}`
        : `  ${m}: afternoon − morning = ${t.meanDifference.toFixed(2)} (${t.differenceInBands?.toFixed(2) ?? "n/a"} bands; ${t.morningCount} am / ${t.afternoonCount} pm)`
    );
  }
  lines.push("", `Existing outputs that changed: ${f.changes.length} of ${f.compared}`);
  for (const c of f.changes) lines.push(`  [${c.insight}] ${c.subject}: ${c.before} -> ${c.after}`);
  return lines.join("\n");
}
