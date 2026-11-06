/**
 * The numbers behind the evidence chart. One dot per day (the session series the verdict uses); a trend line through the best session
 * of each calendar quarter, fitted with the Theil-Sen estimator (the median of pairwise slopes, robust to the odd light session) over
 * the whole history, drawn only with at least `TREND_MIN_QUARTERS` quarters. Best per quarter is used because it does not tilt down with
 * the light sessions of a build. The line is a picture: it carries no number and no up or down wording, and never decides a verdict.
 */
import { dayNumber } from "./verdict";
import type { ProgressSession } from "./sessions";

export const TREND_MIN_QUARTERS = 4;

export interface TrendPoint { x: number; y: number }

const quarterKey = (iso: string): string => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

/** The best session of each calendar quarter, ascending. */
export function quarterBests(sessions: readonly ProgressSession[], lowerIsBetter: boolean): ProgressSession[] {
  const best = new Map<string, ProgressSession>();
  for (const s of sessions) {
    const k = quarterKey(s.date);
    const have = best.get(k);
    if (!have || (lowerIsBetter ? s.value < have.value : s.value > have.value)) best.set(k, s);
  }
  return [...best.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** The trend line's two end points (days on x), or null with fewer than `TREND_MIN_QUARTERS` quarters. */
export function trendLine(sessions: readonly ProgressSession[], lowerIsBetter: boolean): { from: TrendPoint; to: TrendPoint } | null {
  const q = quarterBests(sessions, lowerIsBetter);
  if (q.length < TREND_MIN_QUARTERS) return null;
  const pts = q.map((s) => ({ x: dayNumber(s.date), y: s.value }));
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) slopes.push(((pts[j] as TrendPoint).y - (pts[i] as TrendPoint).y) / ((pts[j] as TrendPoint).x - (pts[i] as TrendPoint).x));
  const slope = median(slopes);
  const intercept = median(pts.map((p) => p.y - slope * p.x));
  const x0 = (pts[0] as TrendPoint).x;
  const x1 = (pts[pts.length - 1] as TrendPoint).x;
  return { from: { x: x0, y: slope * x0 + intercept }, to: { x: x1, y: slope * x1 + intercept } };
}
