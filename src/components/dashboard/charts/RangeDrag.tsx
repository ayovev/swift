import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { bucketBounds, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";
import { formatDate as formatDay } from "./chartUtils";

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
 * Pointer positions are mapped from the chart's own plot area, measured from its grid lines when a drag starts. A share chart draws
 * its buckets evenly from the left edge of the plot to the right, one point each (`useRangeDrag`); a lift chart's x axis is a
 * continuous date scale from its left edge to its right (`useTimeRangeDrag`). One gesture core serves both.
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

/** The plot area of the Recharts chart(s) inside `container`, from their horizontal grid lines, in pixels from `origin` (the element a band is drawn in); null before it has drawn. */
export function measurePlot(container: HTMLElement, origin: HTMLElement = container): Measured | null {
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
  const o = origin.getBoundingClientRect();
  return { clientLeft: left, span: { left: left - o.left, width: right - left, top: top - o.top, height: bottom - top } };
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

/** What a drag draws: the band's horizontal extent and the plot it sits in, in pixels from the host's left and top. */
export interface Drag {
  left: number;
  right: number;
  span: PlotSpan;
  label: string | null;
}

interface Gesture<P> {
  id: number;
  start: P;
  startX: number;
  engaged: boolean;
  measured: Measured;
}

interface Mapping<P> {
  /** The position under a pointer, in the mapping's own terms (a bucket index, a time). */
  locate: (clientX: number, measured: Measured) => P;
  /** Whether two positions are far enough apart to be a selection. */
  apart: (a: P, b: P) => boolean;
  /** The band between two positions, in pixels from the host's left. */
  band: (a: P, b: P, span: PlotSpan) => { left: number; right: number };
  label: (a: P, b: P) => string;
  /** Called when a drag ends apart. */
  commit: (a: P, b: P) => void;
}

/**
 * The gesture, shared by every chart: where a press starts, when it becomes a drag, the band while it lasts, and what the release
 * does. `measureRef` holds the chart(s) whose plot is measured; `hostRef` is the element the band is drawn in (the same element
 * unless a strip stands for charts elsewhere on the page).
 */
function useRangeGesture<P>({
  measureRef,
  hostRef,
  enabled,
  mapping,
}: {
  measureRef: RefObject<HTMLElement | null>;
  hostRef?: RefObject<HTMLElement | null> | undefined;
  enabled: boolean;
  mapping: Mapping<P>;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const gesture = useRef<Gesture<P> | null>(null);
  // The mapping closes over props that change between renders; a gesture reads the latest.
  const latest = useRef(mapping);
  latest.current = mapping;

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

  const draw = (a: P, b: P, span: PlotSpan): Drag => {
    const m = latest.current;
    const { left, right } = m.band(a, b, span);
    return { left, right, span, label: m.apart(a, b) ? m.label(a, b) : null };
  };

  const begin = (e: PointerEvent<HTMLElement>, immediate: boolean) => {
    const container = measureRef.current;
    if (!enabled || !container || e.button !== 0) return;
    const measured = measurePlot(container, hostRef?.current ?? container);
    if (!measured) return;
    const start = latest.current.locate(e.clientX, measured);
    gesture.current = { id: e.pointerId, start, startX: e.clientX, engaged: immediate, measured };
    if (immediate) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag(draw(start, start, measured.span));
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
    setDrag(draw(g.start, latest.current.locate(e.clientX, g.measured), g.measured.span));
  };

  /** True when the release ended a drag (committed or not), so the chart must not also treat it as a click. */
  const end = (e: PointerEvent<HTMLElement>): boolean => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return false;
    gesture.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDrag(null);
    if (!g.engaged) return false;
    const to = latest.current.locate(e.clientX, g.measured);
    if (latest.current.apart(g.start, to)) latest.current.commit(g.start, to);
    return true;
  };

  return {
    drag,
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
    /** Handlers for the strip under the chart(s), which a finger drags along. */
    strip: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => begin(e, true),
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLElement>) => void end(e),
      onPointerCancel: cancel,
    },
  };
}

/** Drag across a share chart: points are buckets, evenly spaced. */
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
  const n = buckets.length;
  const gesture = useRangeGesture<number>({
    measureRef: containerRef,
    enabled: onSelect !== undefined && n >= 3,
    mapping: {
      locate: (x, m) => indexAt(x, m.clientLeft, m.span.width, n),
      apart: (a, b) => a !== b,
      band: (a, b, span) => {
        const step = span.width / (n - 1);
        return {
          left: Math.max(span.left, span.left + Math.min(a, b) * step - step / 2),
          right: Math.min(span.left + span.width, span.left + Math.max(a, b) * step + step / 2),
        };
      },
      label: (a, b) => `${formatBucketLabel(buckets[Math.min(a, b)]!, granularity)} to ${formatBucketLabel(buckets[Math.max(a, b)]!, granularity)}`,
      commit: (a, b) => {
        const range = rangeOfBuckets(buckets, a, b, granularity, coverage);
        if (range && onSelect) onSelect(range.start, range.end);
      },
    },
  });
  return gesture;
}

/** The calendar day (YYYY-MM-DD) of a time. Dates are read as UTC midnight (`new Date("2024-03-01")`), so UTC is the day. */
const dayOfTime = (t: number): string => new Date(t).toISOString().slice(0, 10);

/**
 * The days a drag between two times covers, or null when it stays in one day or would not narrow the chart's own domain.
 * Pure, so the rule is tested without a pointer.
 */
export function rangeOfTimes(a: number, b: number, domain: readonly [number, number]): { start: string; end: string } | null {
  const start = dayOfTime(Math.min(a, b));
  const end = dayOfTime(Math.max(a, b));
  if (start >= end) return null;
  if (start <= dayOfTime(domain[0]) && end >= dayOfTime(domain[1])) return null;
  return { start, end };
}

/** The time under `clientX`, linear from the plot's left edge (the domain's start) to its right edge (its end). */
export function timeAt(clientX: number, plotClientLeft: number, plotWidth: number, domain: readonly [number, number]): number {
  if (plotWidth <= 0 || domain[1] <= domain[0]) return domain[0];
  const f = Math.min(1, Math.max(0, (clientX - plotClientLeft) / plotWidth));
  return domain[0] + f * (domain[1] - domain[0]);
}

/**
 * Drag across a chart whose x axis is a continuous date scale (the lift charts). `measureRef` is the chart, or the grid of charts a
 * strip stands for (they share one domain and one plot width); `hostRef` is the strip the band is drawn in, when there is one.
 */
export function useTimeRangeDrag({
  measureRef,
  hostRef,
  domain,
  onSelect,
}: {
  measureRef: RefObject<HTMLElement | null>;
  hostRef?: RefObject<HTMLElement | null> | undefined;
  /** The axis's start and end, as times. */
  domain: readonly [number, number];
  onSelect?: ((start: string, end: string) => void) | undefined;
}) {
  return useRangeGesture<number>({
    measureRef,
    hostRef,
    enabled: onSelect !== undefined && domain[1] > domain[0],
    mapping: {
      locate: (x, m) => timeAt(x, m.clientLeft, m.span.width, domain),
      apart: (a, b) => rangeOfTimes(a, b, domain) !== null,
      band: (a, b, span) => {
        const x = (t: number) => span.left + ((t - domain[0]) / (domain[1] - domain[0])) * span.width;
        return { left: x(Math.min(a, b)), right: x(Math.max(a, b)) };
      },
      label: (a, b) => `${formatDay(dayOfTime(Math.min(a, b)))} to ${formatDay(dayOfTime(Math.max(a, b)))}`,
      commit: (a, b) => {
        const range = rangeOfTimes(a, b, domain);
        if (range && onSelect) onSelect(range.start, range.end);
      },
    },
  });
}

/** The band drawn over the plot while dragging, with what it covers. Decorative: the result is announced by the scope line. */
export function RangeBand({ drag, full = false }: { drag: Drag | null; /** Fill the host top to bottom (a strip) rather than just the plot. */ full?: boolean }) {
  if (!drag) return null;
  return (
    <div
      aria-hidden
      data-range-band
      className="pointer-events-none absolute border-x-2 border-primary bg-primary/15"
      style={{ left: drag.left, width: Math.max(0, drag.right - drag.left), ...(full ? { top: 0, bottom: 0 } : { top: drag.span.top, height: drag.span.height }) }}
    >
      {drag.label ? (
        <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground">{drag.label}</span>
      ) : null}
    </div>
  );
}

/**
 * The strip a finger drags along, shown only where the main pointer is coarse. It owns its touches, so the page still scrolls
 * everywhere else. `stripRef` is set when the band is drawn in the strip itself.
 */
export function RangeStrip({
  handlers,
  stripRef,
  drag,
  children = "Drag along here to set the date range",
}: {
  handlers: ReturnType<typeof useRangeGesture<number>>["strip"];
  stripRef?: RefObject<HTMLDivElement | null>;
  drag?: Drag | null;
  children?: string;
}) {
  return (
    <div
      ref={stripRef}
      data-range-strip
      {...handlers}
      style={{ touchAction: "none" }}
      className="relative mt-2 hidden min-h-11 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground select-none pointer-coarse:flex"
    >
      {drag !== undefined ? <RangeBand drag={drag} full /> : null}
      {/* Held in place, not removed, while dragging: it would sit under the band's own label. */}
      <span className={drag ? "invisible" : undefined}>{children}</span>
    </div>
  );
}
