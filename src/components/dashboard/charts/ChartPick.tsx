import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import dayjs from "dayjs";
import { ArrowRight, X } from "lucide-react";
import { bucketKey, formatBucketLabel, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";

/**
 * Picking a point on a chart: the one interaction every chart that answers "what was that?" shares (Shneiderman's details on
 * demand). A click, a tap or Enter on a focused chart picks the point under the pointer or the keyboard cursor, and a line under the
 * chart says what was picked, with what to do next and a way to clear it.
 *
 * The same on every input, on purpose. A tap picks rather than navigating, because on a phone the first tap is also what shows the
 * tooltip: a chart that left the page on that tap would never let anyone read it. Where the workouts are on the same page the list
 * narrows straight away; where they are on another view, the line offers the link. Analytics records only that a point was picked
 * or followed (`chart_point_selected`, `chart_point_opened`), never which.
 */

/**
 * Picks the point the chart's tooltip is showing. Recharts shows its tooltip for the point under a mouse, under a finger, or under the
 * keyboard cursor (arrow keys on a focused chart, its accessibilityLayer), and renders the tooltip's content for whatever is active, so
 * that is where the active point is read. Recharts' own onClick was not used: it reports no point for a tap, and nothing for a key.
 */
export function usePointPick<T>(onPick: ((value: T | null) => void) | undefined, picked: T | null) {
  const active = useRef<T | null>(null);
  /** Called from the tooltip's content with whatever point it is showing (null when it is hidden). */
  const track = (value: T | null) => {
    active.current = value;
  };
  const toggle = (fallback: T | null = null) => {
    const value = active.current ?? fallback;
    if (!onPick || value === null) return;
    onPick(value === picked ? null : value);
  };
  /**
   * Mouse, pen and touch alike: Recharts shows the tooltip for the point under a pointer or a finger, so releasing the pointer picks
   * that point. Pointer up rather than click, because Recharts' scatter suppresses the click a tap would make (a tapped lift dot never
   * picked), and only the primary button. Two frames late, because a tap first focuses the chart, which briefly activates its first
   * point, and Recharts renders the touched point only afterwards: picking at once picked the first month whatever was tapped. A
   * scatter does the opposite, hiding its tooltip as the finger lifts, so the point showing at release is kept as the fallback
   * (both measured in Chromium with touch).
   */
  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // A mark that names its own point (a lift dot's `data-pick`) is picked directly: exact, and independent of the tooltip, which a
    // scatter only shows after a tap has ended.
    const mark = e.target instanceof Element ? e.target.closest<HTMLElement | SVGElement>("[data-pick]") : null;
    if (mark && onPick) {
      const value = mark.getAttribute("data-pick") as T;
      onPick(value === picked ? null : value);
      return;
    }
    const atRelease = active.current;
    if (typeof requestAnimationFrame === "undefined") return toggle(atRelease);
    requestAnimationFrame(() => requestAnimationFrame(() => toggle(atRelease)));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!onPick) return;
    if (e.key === "Escape" && picked !== null) {
      e.preventDefault();
      onPick(null);
    } else if (e.key === "Enter" || e.key === " ") {
      if (active.current === null) return;
      e.preventDefault();
      toggle();
    }
  };
  return { track, onPointerUp, onKeyDown };
}

/** Records a pick for analytics, value-free. */
export function capturePick(kind: "selected" | "opened"): void {
  capture({ name: "interaction_used", props: { interaction: kind === "selected" ? "chart_point_selected" : "chart_point_opened" } });
}

/** The line under a chart for its picked point: what it is, what to do next, and Clear. 44px tap targets on a phone. */
export function ChartPickNote({
  children,
  action,
  onClear,
}: {
  children: ReactNode;
  action?: { label: string; onClick: () => void } | undefined;
  onClear: () => void;
}) {
  return (
    <div role="status" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0 rounded-md bg-muted/60 px-3 text-sm">
      <span className="py-2">{children}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-11 items-center gap-1 text-accent-link underline-offset-2 hover:underline sm:min-h-8"
        >
          {action.label}
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground sm:min-h-8"
      >
        <X className="size-3.5" aria-hidden />
        Clear
      </button>
    </div>
  );
}

/** The hint under a tooltip's value, so picking can be found: the same words for a mouse, a finger and a keyboard. */
export function PickHint({ children = "Select to list these workouts" }: { children?: ReactNode }) {
  return <span className="mt-0.5 block text-[11px] text-muted-foreground">{children}</span>;
}

/**
 * The picked bucket of a share chart whose workouts are listed on the same page (a domain, a modality, Movements). Cleared whenever
 * the grouping or the data changes, since a bucket key from one grouping means nothing in another. `inPicked` reads a list row's
 * "YY-MM-DD" date into the same bucket key `parseRows()` gave it.
 */
export function useBucketPick(granularity: Granularity, resetOn: unknown) {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [granularity, resetOn]);
  const pick = (bucket: string | null) => {
    setPicked(bucket);
    if (bucket !== null) capturePick("selected");
  };
  const inPicked = (yyMmDd: string): boolean => picked !== null && bucketKey(dayjs(`20${yyMmDd}`), granularity) === picked;
  const label = picked === null ? null : formatBucketLabel(picked, granularity);
  return { picked, pick, clear: () => setPicked(null), inPicked, label };
}

/** Scrolls a picked point's list into view, without animating when the athlete asked for reduced motion. */
export function scrollToList(el: HTMLElement | null): void {
  if (!el) return;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
