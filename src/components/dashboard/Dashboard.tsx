import { useCallback, useEffect, useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ThemeControls } from "@/components/theme/ThemeControls";
import { SwiftMark } from "@/components/SwiftMark";
import { BodyCompTab, type BodyCompState } from "./BodyCompTab";
import { DateRangePicker } from "./DateRangePicker";
import { DomainTab } from "./DomainTab";
import { GranularityPicker } from "./GranularityPicker";
import { ModalityTab } from "./ModalityTab";
import { OverviewTab } from "./OverviewTab";
import { ALL_TABS, BODY_COMP_TAB, OVERVIEW_TAB, WORKOUTS_TAB, TabNav } from "./TabNav";
import { WorkoutsTab } from "./WorkoutsTab";
import { formatDate } from "./charts/chartUtils";
import type { DateRange } from "@/lib/analytics/dateRange";
import { dailyGranularityFits, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";
import { DOMAIN_LIST, type Domain } from "@/types/dashboard";
import { MODALITY_LIST, type Modality } from "@/types/modality";
import type { Insights } from "@/lib/analytics/buildInsights";
import type { DataSource } from "@/App";

interface DashboardProps {
  insights: Insights;
  source: DataSource;
  range: DateRange | null;
  onRangeChange: (range: DateRange | null) => void;
  granularity: Granularity;
  onGranularityChange: (granularity: Granularity) => void;
  onReset: () => void;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
}

/** Years between the first and last logged workout, to a sensible precision. */
function spanLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return `${months} month${months === 1 ? "" : "s"} and counting`;
  }
  return `${years.toFixed(1)} years and counting`;
}

export function Dashboard({
  insights,
  source,
  range,
  onRangeChange,
  granularity,
  onGranularityChange,
  onReset,
  bodyComp,
  onBodyCompFile,
}: DashboardProps) {
  const [tab, setTab] = useState<string>(OVERVIEW_TAB);
  const { summary } = insights.dashboard;

  // "All time" (range === null) has no explicit span of its own, so it falls
  // back to the log's own full bounds — the same span DateRangePicker uses
  // to size its calendar.
  const effectiveRange = range ?? insights.dateBounds;
  const dailyDisabled = effectiveRange ? !dailyGranularityFits(effectiveRange) : false;

  // Widening the range out from under an active daily view (via the date
  // picker, not this control) would otherwise leave a chart stuck rendering
  // a granularity its own picker no longer offers.
  useEffect(() => {
    if (granularity === "daily" && dailyDisabled) onGranularityChange("weekly");
  }, [granularity, dailyDisabled, onGranularityChange]);

  const onTabChange = useCallback(
    (value: string) => {
      setTab(value);
      const label = ALL_TABS.find((t) => t.value === value)?.label ?? value;
      capture({ name: "tab_viewed", props: { tab: label, source } });
    },
    [source]
  );

  return (
    <div className="min-h-svh bg-background">
      {source === "sample" ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-b border-accent-border bg-accent-subtle px-5 py-2 text-center text-sm"
        >
          <FlaskConical className="size-3.5 shrink-0 text-accent-link" aria-hidden="true" />
          <span>
            <strong className="font-medium">Sample data.</strong>{" "}
            <span className="text-muted-foreground">
              This is someone else's training log, here so you can look around.
            </span>
          </span>
        </div>
      ) : null}

      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SwiftMark />
          <div className="flex flex-wrap items-center gap-2">
            {insights.dateBounds ? (
              <DateRangePicker
                dateBounds={insights.dateBounds}
                value={range}
                onChange={onRangeChange}
              />
            ) : null}
            {insights.dateBounds ? (
              <GranularityPicker
                value={granularity}
                onChange={onGranularityChange}
                dailyDisabled={dailyDisabled}
              />
            ) : null}
            <ThemeControls />
            <Button variant="outline" size="sm" onClick={onReset} className="h-8 gap-2">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Start over</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Your training log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.total_logged > 0 ? (
              <>
                {formatDate(summary.date_start)} — {formatDate(summary.date_end)} ·{" "}
                {spanLabel(summary.date_start, summary.date_end)}
              </>
            ) : (
              "No workouts logged in this date range"
            )}
          </p>
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="gap-6">
          <TabNav value={tab} onValueChange={onTabChange} />

          <TabsContent value={OVERVIEW_TAB}>
            <OverviewTab insights={insights} granularity={granularity} />
          </TabsContent>

          <TabsContent value={WORKOUTS_TAB}>
            <WorkoutsTab data={insights.modality} />
          </TabsContent>

          {DOMAIN_LIST.map((domain: Domain) => (
            <TabsContent key={domain} value={`domain:${domain}`}>
              <DomainTab domain={domain} data={insights.dashboard} granularity={granularity} />
            </TabsContent>
          ))}

          {MODALITY_LIST.map((modality: Modality) => (
            <TabsContent key={modality} value={`modality:${modality}`}>
              <ModalityTab modality={modality} data={insights.modality} granularity={granularity} />
            </TabsContent>
          ))}

          <TabsContent value={BODY_COMP_TAB}>
            <BodyCompTab
              state={bodyComp}
              granularity={granularity}
              onFile={onBodyCompFile}
              dashboard={insights.dashboard}
            />
          </TabsContent>
        </Tabs>

        <footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          <p className="max-w-3xl">
            Workouts are classified automatically from their names and descriptions, so a workout
            can land somewhere surprising if your gym names things unusually — every tab shows its
            reasoning so you can check. Flexibility sits low for almost everyone, because mobility
            work rarely gets logged as its own entry rather than because nobody stretches.
            {insights.modality.unclassified_count > 0 ? (
              <>
                {" "}
                {insights.modality.unclassified_count.toLocaleString()} of{" "}
                {summary.total_logged.toLocaleString()} entries had no recognisable movement in them
                and sit outside the cardio/weights/gymnastics split.
              </>
            ) : null}
          </p>
          <p className="mt-3">Your file never left this browser.</p>
        </footer>
      </main>
    </div>
  );
}
