import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { bucketBounds, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";

/**
 * Drag across a Training chart to set the date range: the same custom range the date picker sets, through the same handler, so the
 * scope line says what is showing and the picker undoes it.
 *
 * Two ways in, because one gesture cannot serve both:
 * - a mouse or pen drags on the chart itself (a click that does not move still picks a point, see ChartPick.tsx);
 * - a finger drags on a strip under the chart. On a phone a drag across the chart is how the page scrolls, so the chart is left alone
 *   and the strip, which owns its touches (`touch-action: none`), is the gesture target. Only a coarse pointer sees the strip.
 *
 * A drag is a pointer-only gesture, so it is never the only way: the date range picker in the scope line sets the same range from
 * the keyboard (WCAG 2.5.7).
 *
 * Pointer positions are mapped to buckets from the chart's own plot area, measured from its grid lines when a drag starts. A share
 * chart draws its buckets evenly from the left edge of the plot to the right, one point each.
 */

/** How far a mouse moves before a press on the chart is a drag rather than a click. */
const DRAG_START_PX = 6;

/** The plot area, in pixels from the left and top of the element the band is drawn in. */
export interface PlotSpan {
  left: number;
  width: number;
  top: number;
  height: number;
}

interface Measured {
  span: PlotSpan;
  /** The plot's left edge on screen, for mapping a pointer's clientX. */
  clientLeft: number;
}

/** The plot area of the Recharts chart inside `container`, from its horizontal grid lines; null before it has drawn. */
export function measurePlot(container: HTMLElement): Measured | null {
  const lines = container.querySelectorAll(".recharts-cartesian-grid-horizontal line");
  if (lines.length === 0) return null;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  lines.forEach((l) => {
    const r = l.getBoundingClientRect();
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  });
  if (!(right > left)) return null;
  const origin = container.getBoundingClientRect();
  return { clientLeft: left, span: { left: left - origin.left, width: right - left, top: top - origin.top, height: bottom - top } };
}

/** The bucket index under `clientX`, 0 to count - 1: points sit evenly from the plot's left edge to its right. */
export function indexAt(clientX: number, plotClientLeft: number, plotWidth: number, count: number): number {
  if (count <= 1 || plotWidth <= 0) return 0;
  const i = Math.round(((clientX - plotClientLeft) / plotWidth) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/**
 * The days a drag from one bucket to another covers: the first bucket's first day to the last bucket's last day, held inside the
 * days the chart covers (a partial first or last bucket reaches past the range). Null when it would not narrow anything.
 */
export function rangeOfBuckets(
  keys: readonly string[],
  a: number,
  b: number,
  granularity: Granularity,
  coverage?: { start: string; end: string }
): { start: string; end: string } | null {
  const first = keys[Math.min(a, b)];
  const last = keys[Math.max(a, b)];
  if (first === undefined || last === undefined || a === b) return null;
  let start = bucketBounds(first, granularity).start;
  let end = bucketBounds(last, granularity).end;
  if (coverage) {
    if (start < coverage.start) start = coverage.start;
    if (end > coverage.end) end = coverage.end;
    if (start === coverage.start && end === coverage.end) return null;
  }
  return start <= end ? { start, end } : null;
}

interface Drag {
  from: number;
  to: number;
  span: PlotSpan;
}

interface Gesture {
  id: number;
  startIndex: number;
  startX: number;
  engaged: boolean;
  measured: Measured;
}

export function useRangeDrag({
  containerRef,
  buckets,
  granularity,
  coverage,
  onSelect,
}: {
  /** The element the chart is in and the band is drawn in (it must be positioned). */
  containerRef: RefObject<HTMLElement | null>;
  /** The chart's bucket keys, oldest first. */
  buckets: readonly string[];
  granularity: Granularity;
  coverage?: { start: string; end: string } | undefined;
  /** Called with the first and last day (YYYY-MM-DD) of a drag. Omit for a chart without dragging. */
  onSelect?: ((start: string, end: string) => void) | undefined;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const enabled = onSelect !== undefined && buckets.length >= 3;

  const cancel = useCallback(() => {
    gesture.current = null;
    setDrag(null);
  }, []);

  // Escape abandons a drag in progress.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, cancel]);

  const begin = (e: PointerEvent<HTMLElement>, immediate: boolean) => {
    const container = containerRef.current;
    if (!enabled || !container || e.button !== 0) return;
    const measured = measurePlot(container);
    if (!measured) return;
    const startIndex = indexAt(e.clientX, measured.clientLeft, measured.span.width, buckets.length);
    gesture.current = { id: e.pointerId, startIndex, startX: e.clientX, engaged: immediate, measured };
    if (immediate) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({ from: startIndex, to: startIndex, span: measured.span });
    }
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    if (!g.engaged) {
      if (Math.abs(e.clientX - g.startX) < DRAG_START_PX) return;
      g.engaged = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const to = indexAt(e.clientX, g.measured.clientLeft, g.measured.span.width, buckets.length);
    setDrag((d) => (d && d.to === to ? d : { from: g.startIndex, to, span: g.measured.span }));
  };

  /** True when the release ended a drag (committed or not), so the chart must not also treat it as a click. */
  const end = (e: PointerEvent<HTMLElement>): boolean => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return false;
    gesture.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDrag(null);
    if (!g.engaged) return false;
    const to = indexAt(e.clientX, g.measured.clientLeft, g.measured.span.width, buckets.length);
    const range = rangeOfBuckets(buckets, g.startIndex, to, granularity, coverage);
    if (range && onSelect) onSelect(range.start, range.end);
    return true;
  };

  const label =
    drag && drag.from !== drag.to
      ? `${formatBucketLabel(buckets[Math.min(drag.from, drag.to)]!, granularity)} to ${formatBucketLabel(buckets[Math.max(drag.from, drag.to)]!, granularity)}`
      : null;

  return {
    drag,
    label,
    enabled,
    /** Handlers for the chart itself: a mouse or pen, never a finger (a finger's drag on the chart scrolls the page). */
    chart: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType !== "touch") begin(e, false);
      },
      onPointerMove: move,
      onPointerCancel: cancel,
      /** Returns true when the release finished a drag. */
      end,
    },
    /** Handlers for the strip under the chart, which a finger drags along. */
    strip: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => begin(e, true),
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLElement>) => void end(e),
      onPointerCancel: cancel,
    },
    count: buckets.length,
  };
}

/** The band drawn over the plot while dragging, with what it covers. Decorative: the result is announced by the scope line. */
export function RangeBand({ drag, count, label }: { drag: Drag | null; count: number; label: string | null }) {
  if (!drag || count < 2) return null;
  const step = drag.span.width / (count - 1);
  const x = (i: number) => drag.span.left + i * step;
  const lo = Math.min(drag.from, drag.to);
  const hi = Math.max(drag.from, drag.to);
  const left = Math.max(drag.span.left, x(lo) - step / 2);
  const right = Math.min(drag.span.left + drag.span.width, x(hi) + step / 2);
  return (
    <div
      aria-hidden
      data-range-band
      className="pointer-events-none absolute border-x-2 border-primary bg-primary/15"
      style={{ left, width: right - left, top: drag.span.top, height: drag.span.height }}
    >
      {label ? (
        <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground">{label}</span>
      ) : null}
    </div>
  );
}

/**
 * The strip a finger drags along, shown only where the main pointer is coarse. It owns its touches, so the page still scrolls
 * everywhere else.
 */
export function RangeStrip({ handlers }: { handlers: ReturnType<typeof useRangeDrag>["strip"] }) {
  return (
    <div
      data-range-strip
      {...handlers}
      style={{ touchAction: "none" }}
      className="mt-2 hidden min-h-11 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground select-none pointer-coarse:flex"
    >
      Drag along here to set the date range
    </div>
  );
}
