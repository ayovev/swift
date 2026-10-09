import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ReferenceArea } from "recharts";
import { Button } from "@/components/ui/button";
import { describeTag, tagBandSpans, tagLabel } from "@/lib/analytics/contextTags";
import { defaultWindowA, windowLengthDays } from "@/lib/analytics/compareWindows";
import type { DateWindow } from "@/types/compare";
import type { ContextTag } from "@/types/tag";
import { formatDate } from "./chartUtils";

/**
 * What every time-series chart can do beyond drawing: shade the athlete's
 * context tags, and let a drag across the chart pick a date range to compare
 * or tag. Provided once by Dashboard so a chart needs no props threaded down
 * through six tab components; a chart rendered without a provider (a unit
 * test, say) is just a chart.
 *
 * Dragging is a pointer convenience only. Everything it does is also
 * reachable from date inputs on the Compare and Tags views, so nothing
 * depends on being able to drag.
 */

export interface ChartInteraction {
  tags: readonly ContextTag[];
  onCompare: (window: DateWindow) => void;
  onTag: (window: DateWindow) => void;
}

const Ctx = createContext<ChartInteraction | null>(null);

export function ChartInteractionProvider({ value, children }: { value: ChartInteraction; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** One x-position on a chart's axis and the calendar span it stands for. */
export interface ChartXSpan {
  /** The value the chart's x-axis uses for this position (its category label). */
  label: string;
  start: string;
  end: string;
}

interface MouseState {
  activeTooltipIndex?: number | string | null | undefined;
}

/**
 * Turns the two ends of a drag (indexes into `xs`) into a window covering
 * every x-position between them, in either direction. Null unless the drag
 * moved to a different position — a plain click selects nothing.
 */
export function selectionWindow(xs: readonly ChartXSpan[], a: number, b: number): DateWindow | null {
  if (a === b) return null;
  const lo = xs[Math.min(a, b)];
  const hi = xs[Math.max(a, b)];
  return lo && hi ? { start: lo.start, end: hi.end } : null;
}

/** Past this, the tooltip says how many more instead of growing taller than the chart. */
const MAX_TOOLTIP_PERIODS = 4;

const indexOf = (s: MouseState): number | null => {
  const i = Number(s.activeTooltipIndex);
  return s.activeTooltipIndex == null || Number.isNaN(i) ? null : i;
};

interface Handlers {
  onMouseDown: (s: MouseState) => void;
  onMouseMove: (s: MouseState) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
}

export function useChartInteraction(xs: readonly ChartXSpan[]): {
  handlers: Partial<Handlers>;
  overlays: ReactNode;
  footer: ReactNode;
  /** For a tooltip's `renderFooter`: the periods overlapping the hovered x-position. */
  tooltipFooter: (label: unknown) => ReactNode;
} {
  const ctx = useContext(Ctx);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [committed, setCommitted] = useState<{ window: DateWindow; from: number; to: number } | null>(null);

  const commit = () => {
    if (anchor !== null && current !== null) {
      const window = selectionWindow(xs, anchor, current);
      if (window) setCommitted({ window, from: Math.min(anchor, current), to: Math.max(anchor, current) });
    }
    setAnchor(null);
    setCurrent(null);
  };

  const bands = useMemo(() => (ctx ? tagBandSpans(ctx.tags, xs) : []), [ctx, xs]);

  const periodsByLabel = useMemo(() => {
    const m = new Map<string, ContextTag[]>();
    for (const b of bands) {
      for (let i = b.first; i <= b.last; i++) {
        const label = xs[i]!.label;
        m.set(label, [...(m.get(label) ?? []), b.tag]);
      }
    }
    return m;
  }, [bands, xs]);

  if (!ctx) return { handlers: {}, overlays: null, footer: null, tooltipFooter: () => null };

  const tooltipFooter = (label: unknown): ReactNode => {
    const tags = typeof label === "string" ? periodsByLabel.get(label) : undefined;
    if (!tags?.length) return null;
    const shown = tags.slice(0, MAX_TOOLTIP_PERIODS);
    return (
      <div className="mt-0.5 grid max-w-64 gap-1 border-t border-border/50 pt-1.5">
        <div className="text-muted-foreground">Periods</div>
        {shown.map((t) => (
          <div key={t.id}>{describeTag(t)}</div>
        ))}
        {tags.length > shown.length ? (
          <div className="text-muted-foreground">+{tags.length - shown.length} more</div>
        ) : null}
      </div>
    );
  };

  const live = anchor !== null && current !== null && anchor !== current ? { from: Math.min(anchor, current), to: Math.max(anchor, current) } : null;
  const shown = live ?? (committed ? { from: committed.from, to: committed.to } : null);

  const handlers: Handlers = {
    onMouseDown: (s: MouseState) => {
      const i = indexOf(s);
      if (i === null) return;
      setCommitted(null);
      setAnchor(i);
      setCurrent(i);
    },
    onMouseMove: (s: MouseState) => {
      if (anchor === null) return;
      const i = indexOf(s);
      if (i !== null) setCurrent(i);
    },
    onMouseUp: commit,
    onMouseLeave: () => {
      if (anchor !== null) commit();
    },
  };

  const overlays = (
    <>
      {bands.map((b) => (
        <ReferenceArea
          key={b.tag.id}
          x1={xs[b.first]!.label}
          x2={xs[b.last]!.label}
          fill="var(--muted-foreground)"
          fillOpacity={0.14}
          stroke="none"
          ifOverflow="hidden"
        />
      ))}
      {shown ? (
        <ReferenceArea
          x1={xs[shown.from]!.label}
          x2={xs[shown.to]!.label}
          fill="var(--primary)"
          fillOpacity={0.18}
          stroke="var(--primary)"
          strokeOpacity={0.5}
          ifOverflow="hidden"
        />
      ) : null}
    </>
  );

  const footer =
    committed || bands.length > 0 ? (
      <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
        {bands.length > 0 ? (
          <p>
            Shaded: {bands.map((b) => tagLabel(b.tag)).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.{" "}
            <span className="sr-only">{bands.map((b) => describeTag(b.tag)).join("; ")}</span>
          </p>
        ) : null}
        {committed ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Selected range">
            <span className="tabular">
              {formatDate(committed.window.start)} – {formatDate(committed.window.end)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => ctx.onCompare(committed.window)}
            >
              Compare with the {windowLengthDays(defaultWindowA(committed.window))} days before
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => ctx.onTag(committed.window)}>
              Save as a period
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCommitted(null)}>
              Clear
            </Button>
          </div>
        ) : null}
      </div>
    ) : null;

  return { handlers, overlays, footer, tooltipFooter };
}
