import { classifyModality, movementsFor, sharesTo100 } from "@/lib/classify/classifyModality";
import { MODALITY_LIST } from "@/types/modality";
import type { ParsedRow } from "./buildDashboardData";
import type {
  AllWorkoutsEntry,
  Modality,
  ModalityBucketShare,
  ModalityClassification,
  ModalityData,
  ModalityOverallStat,
  ModalityTrendDirectionStat,
  ModalityTrendPoint,
  ModalityWorkoutEntry,
} from "@/types/modality";
import type { SugarWodRow } from "@/types/sugarwod";

/** Round to one decimal. */
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Mean of one modality's share across a set of classified workouts. */
function meanShare(rows: readonly ClassifiedRow[], modality: Modality): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((n, r) => n + r.modality.split[modality], 0);
  return r1(sum / rows.length);
}

interface ClassifiedRow {
  row: ParsedRow;
  modality: ModalityClassification;
}

/**
 * Aggregate M/W/G classifications into everything the modality tabs need.
 * Deliberately mirrors the shape of the GPP domain aggregates in
 * buildDashboardData, so the tab components can be near-identical.
 *
 * Workouts where no movement was recognised are EXCLUDED from every average
 * rather than counted as zeroes — otherwise a logged non-workout ("DAILY LAZY
 * MACROS POINTS") would silently drag every modality's share down. The count
 * of those is reported so the UI can caveat it honestly.
 */
export function buildModalityData(parsedRows: readonly ParsedRow[]): ModalityData {
  const all: ClassifiedRow[] = parsedRows.map((row) => ({
    row,
    modality: classifyModality(row.text),
  }));

  const classified = all.filter((r) => r.modality.classified);
  const unclassified_count = all.length - classified.length;

  // --- per-bucket trends ----------------------------------------------------
  const byBucket = new Map<string, ClassifiedRow[]>();
  for (const r of classified) {
    const group = byBucket.get(r.row.bucket);
    if (group) group.push(r);
    else byBucket.set(r.row.bucket, [r]);
  }
  const allBuckets = [...byBucket.keys()].sort();

  const modality_trends = {} as Record<Modality, ModalityTrendPoint[]>;
  for (const m of MODALITY_LIST) {
    modality_trends[m] = allBuckets.map((bucket) => {
      const group = byBucket.get(bucket) ?? [];
      return {
        bucket,
        avg_share: meanShare(group, m),
        count: group.filter((r) => r.modality.split[m] > 0).length,
        total: group.length,
      };
    });
  }

  // --- overall ------------------------------------------------------------
  const modality_overall = {} as Record<Modality, ModalityOverallStat>;
  for (const m of MODALITY_LIST) {
    modality_overall[m] = {
      avg_share: meanShare(classified, m),
      count: classified.filter((r) => r.modality.split[m] > 0).length,
    };
  }

  // --- early half vs late half -------------------------------------------
  // Split the CLASSIFIED rows, so both halves have comparable denominators.
  const midpoint = Math.floor(classified.length / 2);
  const early = classified.slice(0, midpoint);
  const late = classified.slice(midpoint);

  const modality_trend_direction = {} as Record<Modality, ModalityTrendDirectionStat>;
  for (const m of MODALITY_LIST) {
    const early_pct = meanShare(early, m);
    const late_pct = meanShare(late, m);
    modality_trend_direction[m] = { early_pct, late_pct, delta: r1(late_pct - early_pct) };
  }

  // --- drill-down lists, most recent first --------------------------------
  const recentFirst = [...classified].reverse();
  const modality_workout_lists = {} as Record<Modality, ModalityWorkoutEntry[]>;
  for (const m of MODALITY_LIST) {
    modality_workout_lists[m] = recentFirst
      .filter((r) => r.modality.split[m] > 0)
      .map((r) => ({
        date: r.row.dateParsed.format("YY-MM-DD"),
        title: r.row.raw.title,
        share: r.modality.split[m],
        split: r.modality.split,
        movements: movementsFor(r.modality.movements, m),
      }));
  }

  // --- full running list, most recent first --------------------------------
  const all_workouts: AllWorkoutsEntry[] = [...all].reverse().map((r) => ({
    date: r.row.dateParsed.format("YY-MM-DD"),
    title: r.row.raw.title,
    split: r.modality.split,
    movements: r.modality.movements.map((m) => m.label),
    classified: r.modality.classified,
  }));

  // --- normalized per-bucket stack -----------------------------------------
  // Each workout's split already sums to 100, so the per-bucket means do too —
  // but independently rounded means can drift, so re-normalize for the chart.
  const bucket_shares: ModalityBucketShare[] = allBuckets.map((bucket) => {
    const group = byBucket.get(bucket) ?? [];
    const weights = { M: 0, W: 0, G: 0 } as Record<Modality, number>;
    for (const r of group) {
      for (const m of MODALITY_LIST) weights[m] += r.modality.split[m];
    }
    const total = MODALITY_LIST.reduce((n, m) => n + weights[m], 0);
    const shares = sharesTo100(weights, total);
    return { bucket, M: shares.M, W: shares.W, G: shares.G };
  });

  return {
    modality_trends,
    modality_overall,
    modality_trend_direction,
    modality_workout_lists,
    all_workouts,
    modality_stacked: { modality_names: MODALITY_LIST, bucket_shares },
    unclassified_count,
    classified_count: classified.length,
  };
}

export type { SugarWodRow };
