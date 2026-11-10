import { PV_CHANGE_THRESHOLD_PCT } from "@/lib/analytics/insightConfig";
import type { ProgressRow } from "@/lib/analytics/insights/headline";
import { VERDICT_STYLE, type VerdictKind } from "./verdictMark";

/**
 * A verdict's change at a glance, on the collapsed Progress row: one bar from a zero line, right for better and left for worse, on a
 * scale shared by every row on the page, with faint ticks at the verdict's own threshold (±PV_CHANGE_THRESHOLD_PCT).
 *
 * The question a scan of the rows asks is "which of these moved, and by how much?", and each verdict already reduces to one number,
 * the change between the two compared bests (positive is better: heavier, faster, more reps). The shared scale is the point: Snatch's
 * +30.4% reads as about seven times Deadlift's +4.4% without reading either number, and a bar that stops inside the ticks says the
 * change was small (an Up there is a record, 2% above everything before, not a 5% gain). It replaced a dot sparkline: at 120 by 24
 * pixels thirty sessions were a smudge, each row had its own scale, and nothing showed the comparison the verdict makes.
 *
 * The row's text keeps the exact figure, so the bar is hidden from assistive tech. Colour follows verdictMark.tsx and only repeats
 * what the bar's direction already says.
 */

/** The shared scale: the most negative and most positive change on the page, always taking in zero and both threshold ticks. */
export interface ChangeScale {
  lo: number;
  hi: number;
}

/**
 * The scale for a set of rows, from every verdict in it (not only the rows a filter shows, so narrowing the list never rescales the
 * bars). A little room past the threshold on each side, so a tick is never drawn on the frame's edge.
 */
export function changeScale(rows: readonly ProgressRow[]): ChangeScale {
  const changes = rows.flatMap((r) => (r.verdict ? [r.verdict.change] : []));
  const room = PV_CHANGE_THRESHOLD_PCT * 1.5;
  return { lo: Math.min(-room, ...changes), hi: Math.max(room, ...changes) };
}

const frac = (v: number, s: ChangeScale): number => (v - s.lo) / (s.hi - s.lo || 1);

export function ChangeBar({ change, kind, scale }: { change: number; kind: VerdictKind; scale: ChangeScale }) {
  const zero = frac(0, scale) * 100;
  const end = frac(Math.max(scale.lo, Math.min(scale.hi, change)), scale) * 100;
  const left = Math.min(zero, end);
  const width = Math.abs(end - zero);
  const ticks = [-PV_CHANGE_THRESHOLD_PCT, PV_CHANGE_THRESHOLD_PCT].map((t) => frac(t, scale) * 100);
  return (
    <span aria-hidden data-change-bar={kind} className="relative h-4 w-20 shrink-0 sm:w-[120px]">
      <span className="absolute top-0 bottom-0 w-px bg-muted-foreground/70" style={{ left: `${zero}%` }} />
      <span
        data-bar
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{ left: `${left}%`, width: `max(${width}%, 2px)`, backgroundColor: VERDICT_STYLE[kind].line.color }}
      />
      {/* Over the bar and taller than it, so the threshold still shows where a bar runs past it. */}
      {ticks.map((t) => (
        <span key={t} data-threshold className="absolute top-0.5 bottom-0.5 w-px bg-muted-foreground/50" style={{ left: `${t}%` }} />
      ))}
    </span>
  );
}
