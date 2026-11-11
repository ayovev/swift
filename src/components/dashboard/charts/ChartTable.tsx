import { useSyncExternalStore, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { capture } from "@/lib/posthog";
import { cn } from "@/lib/utils";

/**
 * Every chart's table twin (WCAG 1.1.1 and 1.3.1: the values a chart draws are also reachable as text, without hovering or seeing it).
 *
 * One preference for all charts, not a switch per chart: someone who wants tables (a screen reader, a magnifier, a print-out) wants them
 * everywhere, and should not have to find twenty toggles. It is per device, in localStorage like the theme, never synced or backed up
 * (it is a preference, not the athlete's data), and wrapped in try/catch so private browsing falls back to charts. Toggling records the
 * value-free `chart_view_toggled`.
 */
export type ChartView = "chart" | "table";

const KEY = "swift.chartView";
const EVENT = "swift:chart-view";
let memory: ChartView = "chart";

function read(): ChartView {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "table" ? "table" : "chart";
  } catch {
    // Storage blocked: the in-memory value stands in for this tab. Only then: with storage working, nothing saved means charts.
    return memory;
  }
}

function write(view: ChartView): void {
  memory = view;
  try {
    window.localStorage.setItem(KEY, view);
  } catch {
    // Storage blocked: the choice lasts for this tab only.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current view and a way to change it; every chart on the page follows the same one. */
export function useChartView(): [ChartView, (view: ChartView) => void] {
  const view = useSyncExternalStore(subscribe, read, () => "chart" as ChartView);
  return [view, write];
}

/** The switch, for a chart card's header: "Table" while charts show, "Chart" while tables do. */
export function ChartViewToggle({ className }: { className?: string }) {
  const [view, setView] = useChartView();
  const table = view === "table";
  const Icon = table ? BarChart3 : Table2;
  return (
    <button
      type="button"
      aria-pressed={table}
      aria-label={table ? "Show charts" : "Show charts as tables"}
      onClick={() => {
        setView(table ? "chart" : "table");
        capture({ name: "interaction_used", props: { interaction: "chart_view_toggled" } });
      }}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-7",
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {table ? "Chart" : "Table"}
    </button>
  );
}

export interface TableColumn {
  label: string;
  /** Numbers right-aligned, so their digits line up. */
  numeric?: boolean;
}

/**
 * A chart's data as a plain table, with a caption that names it. Long tables scroll inside a fixed height. Every chart's table lists
 * its most recent row first, the one a reader of a table usually wants, so callers pass rows newest first.
 */
export function DataTable({ caption, columns, rows }: { caption: string; columns: TableColumn[]; rows: ReactNode[][] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm" data-chart-table>
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.label} scope="col" className={cn("px-3 py-2 font-medium", c.numeric ? "text-right" : "text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-3 py-1.5", columns[j]?.numeric ? "text-right tabular" : "")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A chart's text alternative: what it shows, over which span, and its low, high and latest points. Read as the chart's accessible
 * name (its aria-label and its svg title), where the name used to be only the chart's kind, and the focused svg read out its tick text.
 */
export function seriesSummary(what: string, points: readonly { label: string; value: number }[], format: (v: number) => string): string {
  if (points.length === 0) return `${what}: no data.`;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const lo = points.reduce((a, b) => (b.value < a.value ? b : a));
  const hi = points.reduce((a, b) => (b.value > a.value ? b : a));
  const span = first.label === last.label ? first.label : `${first.label} to ${last.label}`;
  return `${what}, ${span}. Lowest ${format(lo.value)} (${lo.label}), highest ${format(hi.value)} (${hi.label}), latest ${format(last.value)} (${last.label}).`;
}
