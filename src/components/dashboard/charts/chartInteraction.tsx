import { createContext, useContext, useState, type ReactNode } from "react";
import { ReferenceArea } from "recharts";
import { Button } from "@/components/ui/button";
import { defaultWindowA, windowLengthDays } from "@/lib/analytics/compareWindows";
import type { DateWindow } from "@/types/compare";
import { formatDate } from "./chartUtils";

/**
 * What every time-series chart can do beyond drawing: let a drag across the
 * chart pick a date range to compare or tag. Periods are deliberately not drawn
 * on charts for now (shaded bands, a timeline, a picker and a tooltip section
 * were each tried); they live on the Periods and Compare views until what a
 * period stores and where it shows is settled. Provided once by Dashboard so a chart needs no props threaded down
 * through six tab components; a chart rendered without a provider (a unit
 * test, say) is just a chart.
 *
 * Dragging is a pointer convenience only. Everything it does is also
 * reachable from date inputs on the Compare and Tags views, so nothing
 * depends on being able to drag.
 */

export interface ChartInteraction {
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

  if (!ctx) return { handlers: {}, overlays: null, footer: null };

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
    committed ? (
      <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
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
      </div>
    ) : null;

  return { handlers, overlays, footer };
}
