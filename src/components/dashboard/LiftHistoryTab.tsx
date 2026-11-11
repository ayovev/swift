import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartViewToggle } from "./charts/ChartTable";
import { BenchmarkCards } from "./charts/BenchmarkCards";
import { LiftGrid, MIN_CHART_EFFORTS, type RepMaxHighlight } from "./charts/LiftChart";
import { PrTimeline } from "./charts/PrTimeline";
import { RepMaxPrTable } from "./charts/RepMaxPrTable";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { REP_MAX_CATEGORY_ORDER } from "./charts/chartUtils";
import type { DashboardData } from "@/types/dashboard";

const HIGHLIGHT_OPTIONS: readonly SegmentedControlOption<RepMaxHighlight>[] = [
  { id: "most", label: "Most logged" },
  ...REP_MAX_CATEGORY_ORDER.map((category) => ({ id: category, label: category })),
];

/**
 * Which rep scheme every chart highlights. It moves the emphasis and hides nothing (it used to be a filter that dropped the other
 * schemes' points). The key names only the marks: each chart names its own highlighted scheme at the end of its line.
 */
function HighlightControl({ value, onChange }: { value: RepMaxHighlight; onChange: (h: RepMaxHighlight) => void }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs text-muted-foreground">
          Highlight
        </span>
        <SegmentedControl value={value} onChange={onChange} options={HIGHLIGHT_OPTIONS} ariaLabel="Highlight a rep scheme" wrap />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-foreground" aria-hidden="true" />
          highlighted scheme
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <path d="M1 8 H9 V2 H21" fill="none" stroke="var(--foreground)" strokeWidth="1.5" strokeOpacity="0.7" />
          </svg>
          its best so far
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-muted-foreground opacity-40" aria-hidden="true" />
          other efforts
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rotate-45 bg-muted-foreground" aria-hidden="true" />
          personal record
        </span>
      </div>
    </div>
  );
}

/**
 * Training → Lifts ("Lifts and benchmarks"): the record of every lift and
 * benchmark session and every PR, for the selected date range.
 *
 * These three cards used to sit on Overview. They moved here when Overview
 * became the full-history front door (docs/overview.md): they follow the date
 * range, and Training is where the range applies. They moved unchanged.
 *
 * This is the record, not the verdict. Progress (Insights, tab id `lifts`) says
 * whether each subject is moving and deliberately ignores SugarWOD's PR flag;
 * this view shows the flag as SugarWOD logged it and restates no verdict, so the
 * two definitions of "getting better" never sit side by side. The tab id here
 * is `lift-history` because `lifts` already belongs to Progress.
 */
export function LiftHistoryTab({
  dashboard,
  onOpenWorkouts,
}: {
  dashboard: DashboardData;
  /** Opens Workouts for a range of days (YYYY-MM-DD, inclusive); a picked lift dot opens its one day. */
  onOpenWorkouts?: ((start: string, end: string) => void) | undefined;
}) {
  const [highlight, setHighlight] = useState<RepMaxHighlight>("most");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-2">
          <CardTitle className="text-sm font-medium">What got heavier</CardTitle>
          <ChartViewToggle />
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Each point is one logged effort. Each lift's most-logged rep scheme is highlighted, with a line for its best so far; a diamond
            marks a personal record. Lifts with fewer than {MIN_CHART_EFFORTS} efforts are listed under the charts. These are the
            loads as logged; Progress compares estimated one-rep maxes, so its numbers run higher for sets of more than one rep.
          </p>
          <RepMaxPrTable lifts={dashboard.lifts} />
          <HighlightControl value={highlight} onChange={setHighlight} />
          <LiftGrid lifts={dashboard.lifts} highlight={highlight} onOpenDay={onOpenWorkouts ? (date) => onOpenWorkouts(date, date) : undefined} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Benchmarks, revisited</CardTitle>
          </CardHeader>
          <CardContent>
            <BenchmarkCards benchmarks={dashboard.benchmarks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Personal records</CardTitle>
          </CardHeader>
          <CardContent>
            <PrTimeline prs={dashboard.pr_timeline} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
