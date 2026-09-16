import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { InBodyRow } from "@/types/inbody";
import type { BodyCompData, BodyCompPoint } from "@/types/bodyComp";
import { bucketKey, type Granularity } from "./granularity";

dayjs.extend(customParseFormat);

/**
 * InBody's own export writes a raw timestamp, not a calendar-date string:
 * `YYYYMMDDHHmmss` (e.g. "20260528152808" = 2026-05-28 15:28:08).
 */
function parseInBodyDate(raw: string): Dayjs {
  return dayjs(raw.trim(), "YYYYMMDDHHmmss", true);
}

/** "-" is InBody's own missing-value sentinel; an empty cell also counts as missing. */
function parseMetric(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isNaN(n) ? null : n;
}

function averageMetric(rows: InBodyRow[], key: keyof InBodyRow): number | null {
  const values = rows.map((r) => parseMetric(r[key])).filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * Bucket InBody rows onto the same Granularity/bucketKey the workout charts
 * use, so a body-comp trend line can sit on the same x-axis as consistency
 * and domain charts without any row-level join between the two datasets —
 * SugarWOD and InBody rows are never merged, only aligned by bucket key.
 *
 * Multiple scans landing in one bucket are averaged, not summed or picked;
 * a metric a given scan didn't measure ("-") is excluded from that bucket's
 * average rather than counted as zero, the same non-distorting treatment
 * buildModalityData gives an unrecognised workout.
 */
export function buildBodyCompData(
  rows: InBodyRow[],
  granularity: Granularity = "monthly"
): BodyCompData {
  const byBucket = new Map<string, InBodyRow[]>();

  for (const row of rows) {
    const date = parseInBodyDate(row.date ?? "");
    // parseInBodyCsv already dropped rows whose date isn't 14 digits; skip
    // defensively rather than letting an impossible date (e.g. month 13)
    // produce a NaN bucket downstream.
    if (!date.isValid()) continue;

    const key = bucketKey(date, granularity);
    const existing = byBucket.get(key);
    if (existing) {
      existing.push(row);
    } else {
      byBucket.set(key, [row]);
    }
  }

  const points: BodyCompPoint[] = Array.from(byBucket.keys())
    .sort()
    .map((bucket) => {
      // Every key iterated here came from byBucket itself.
      const bucketRows = byBucket.get(bucket)!;
      return {
        bucket,
        weight: averageMetric(bucketRows, "Weight(lb)"),
        skeletalMuscleMass: averageMetric(bucketRows, "Skeletal Muscle Mass(lb)"),
        bodyFatPct: averageMetric(bucketRows, "Percent Body Fat(%)"),
        bmi: averageMetric(bucketRows, "BMI(kg/m²)"),
        inbodyScore: averageMetric(bucketRows, "InBody Score"),
      };
    });

  return { granularity, points };
}
