import { useState } from "react";
import { describeTag, tagLabel, type LanedBand } from "@/lib/analytics/contextTags";
import { cn } from "@/lib/utils";
import { CHART_MARGIN, NUM_AXIS_WIDTH } from "./chartUtils";

/**
 * Where the x-positions of the chart above sit, which decides how a span of
 * positions maps to a span of the track:
 *  - "bands": a bar chart. Position i fills the i-th of n equal slices.
 *  - "points": a line chart whose x-axis pads 12px each side and puts position
 *    i at i/(n-1) of what is left (Recharts' point scale). A period runs from
 *    half a step before its first point to half a step after its last, and
 *    at either end of the plot reaches the edge.
 */
export type TrackLayout = "bands" | "points";

const POINT_PAD_PX = 12;
const ROW_PX = 18;
const ROW_GAP_PX = 2;

function spanStyle(b: LanedBand, n: number, layout: TrackLayout) {
  if (layout === "bands") {
    return { left: `${(b.first / n) * 100}%`, width: `${((b.last - b.first + 1) / n) * 100}%` };
  }
  const steps = Math.max(1, n - 1);
  const inner = `(100% - ${2 * POINT_PAD_PX}px)`;
  const start = b.first === 0 ? `0px` : `calc(${POINT_PAD_PX}px + ${inner} * ${(b.first - 0.5) / steps})`;
  const end = b.last === n - 1 ? `100%` : `calc(${POINT_PAD_PX}px + ${inner} * ${(b.last + 0.5) / steps})`;
  return { left: start, width: `calc(${end} - ${start})` };
}

/**
 * The athlete's periods as a timeline directly under a chart, sharing its
 * x-axis: one bar per period, overlapping periods in separate rows. Hovering
 * or focusing a bar lights up the same span on the chart; clicking one pins
 * its details underneath, which is also how a touch screen reads it.
 */
export function PeriodTrack({
  bands,
  n,
  layout,
  onHover,
}: {
  bands: readonly LanedBand[];
  n: number;
  layout: TrackLayout;
  onHover: (id: string | null) => void;
}) {
  const [pinned, setPinned] = useState<string | null>(null);
  if (bands.length === 0) return null;

  const rows = Math.max(...bands.map((b) => b.lane)) + 1;
  const detail = bands.find((b) => b.tag.id === pinned);

  return (
    <div className="mt-1 text-xs" data-testid="period-track">
      <div style={{ paddingLeft: CHART_MARGIN.left + NUM_AXIS_WIDTH, paddingRight: CHART_MARGIN.right }}>
        <div className="relative" style={{ height: rows * ROW_PX + (rows - 1) * ROW_GAP_PX }}>
          {bands.map((b) => (
            <button
              key={b.tag.id}
              type="button"
              aria-label={describeTag(b.tag)}
              aria-pressed={pinned === b.tag.id}
              onClick={() => setPinned(pinned === b.tag.id ? null : b.tag.id)}
              onMouseEnter={() => onHover(b.tag.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(b.tag.id)}
              onBlur={() => onHover(null)}
              className={cn(
                "absolute overflow-hidden rounded-sm border px-1.5 text-left leading-none whitespace-nowrap text-ellipsis",
                "border-border bg-muted-foreground/20 text-foreground hover:bg-primary/25 hover:border-primary/50",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                pinned === b.tag.id && "border-primary/60 bg-primary/25"
              )}
              style={{ ...spanStyle(b, n, layout), top: b.lane * (ROW_PX + ROW_GAP_PX), height: ROW_PX }}
            >
              {tagLabel(b.tag)}
            </button>
          ))}
        </div>
      </div>
      {detail ? <p className="mt-1.5 text-muted-foreground">{describeTag(detail.tag)}</p> : null}
    </div>
  );
}
