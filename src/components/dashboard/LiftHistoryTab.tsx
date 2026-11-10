import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BenchmarkCards } from "./charts/BenchmarkCards";
import { LiftGrid, type RepMaxFilter } from "./charts/LiftChart";
import { PrTimeline } from "./charts/PrTimeline";
import { RepMaxPrTable } from "./charts/RepMaxPrTable";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { FIXED_REPMAX_COLORS, REP_MAX_CATEGORY_ORDER } from "./charts/chartUtils";
import type { DashboardData } from "@/types/dashboard";

const REP_MAX_CATEGORY_LABELS = {
  "1RM": "1-rep max",
  "2RM": "2-rep max",
  "3RM": "3-rep max",
  "5RM": "5-rep max",
} as const;

const REP_MAX_FILTER_OPTIONS: readonly SegmentedControlOption<RepMaxFilter>[] = [
  { id: "all", label: "All" },
  ...REP_MAX_CATEGORY_ORDER.map((category) => ({ id: category, label: category })),
];

function RepMaxLegend({
  repMaxFilter,
  onRepMaxFilterChange,
}: {
  repMaxFilter: RepMaxFilter;
  onRepMaxFilterChange: (filter: RepMaxFilter) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          value={repMaxFilter}
          onChange={onRepMaxFilterChange}
          options={REP_MAX_FILTER_OPTIONS}
          ariaLabel="Filter by rep-max scheme"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {REP_MAX_CATEGORY_ORDER.map((category) => (
          <span key={category} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: FIXED_REPMAX_COLORS[category] }}
            />
            {REP_MAX_CATEGORY_LABELS[category]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: FIXED_REPMAX_COLORS.other }}
          />
          other
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rotate-45 bg-muted-foreground" />
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
  const [repMaxFilter, setRepMaxFilter] = useState<RepMaxFilter>("all");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">What got heavier</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Each point is one logged effort, colored by rep scheme; a diamond marks a personal
            record. These are the loads as logged; Progress compares estimated one-rep maxes, so its
            numbers run higher for sets of more than one rep.
          </p>
          <RepMaxPrTable lifts={dashboard.lifts} />
          <RepMaxLegend repMaxFilter={repMaxFilter} onRepMaxFilterChange={setRepMaxFilter} />
          <LiftGrid lifts={dashboard.lifts} repMaxFilter={repMaxFilter} onOpenDay={onOpenWorkouts ? (date) => onOpenWorkouts(date, date) : undefined} />
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
