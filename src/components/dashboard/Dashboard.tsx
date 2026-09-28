import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SwiftMark } from "@/components/SwiftMark";
import { ScopeLine } from "./ScopeLine";
import { SectionLinks, SubNav, pageSubtitleOf, pageTitleOf, sectionOf } from "./SectionNav";
import { SettingsSheet } from "./SettingsSheet";
import { AlignmentTab } from "./AlignmentTab";
import { BodyCompTab, type BodyCompState } from "./BodyCompTab";
import { DomainTab } from "./DomainTab";
import { ExperimentsTab } from "./ExperimentsTab";
import { ModalityTab } from "./ModalityTab";
import { OverviewTab } from "./OverviewTab";
import { PlateauTab } from "./PlateauTab";
import type { OutgoingDataset } from "@/lib/sync/syncSession";
import {
  ALL_TABS,
  BODY_COMP_TAB,
  OVERVIEW_TAB,
  ALIGNMENT_TAB,
  EXPERIMENTS_TAB,
  PLATEAU_TAB,
  WORKOUTS_TAB,
} from "./tabs";
import { WorkoutsTab } from "./WorkoutsTab";
import { formatDate } from "./charts/chartUtils";
import type { DateRange, DateRangePreset } from "@/lib/analytics/dateRange";
import { dailyGranularityFits, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";
import { DOMAIN_LIST, type Domain } from "@/types/dashboard";
import { MODALITY_LIST, type Modality } from "@/types/modality";
import type { Insights } from "@/lib/analytics/buildInsights";
import type { AlignmentResult } from "@/types/alignment";
import type { Experiment, ExperimentInsight } from "@/types/experiment";
import type { PlateauInsight } from "@/types/plateau";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { DataSource } from "@/App";

interface DashboardProps {
  insights: Insights;
  source: DataSource;
  range: DateRange | null;
  rangePreset: DateRangePreset;
  onRangeSelect: (range: DateRange | null, preset: DateRangePreset) => void;
  granularity: Granularity;
  onGranularityChange: (granularity: Granularity) => void;
  onReset: () => void;
  workoutRows: SugarWodRow[];
  onWorkoutFile: (file: File) => void;
  bodyComp: BodyCompState;
  onBodyCompFile: (file: File) => void;
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
  onSyncedExperiments: (experiments: Experiment[]) => void;
  plateauInsights: PlateauInsight[] | null;
  alignment: AlignmentResult | null;
  experiments: Experiment[];
  experimentInsights: Map<string, ExperimentInsight> | null;
  onAddExperiment: (label: string, date: string) => void;
  onDeleteExperiment: (id: string) => void;
}

export function Dashboard({
  insights,
  source,
  range,
  rangePreset,
  onRangeSelect,
  granularity,
  onGranularityChange,
  onReset,
  workoutRows,
  onWorkoutFile,
  bodyComp,
  onBodyCompFile,
  onSyncedWorkoutData,
  onSyncedBodyCompData,
  onSyncedExperiments,
  plateauInsights,
  alignment,
  experiments,
  experimentInsights,
  onAddExperiment,
  onDeleteExperiment,
}: DashboardProps) {
  const [tab, setTab] = useState<string>(OVERVIEW_TAB);
  const { summary } = insights.dashboard;
  // Insights views read the whole history, never the selected range (see App.tsx).
  const usesRange = sectionOf(tab) !== "Insights";

  // "All time" (range === null) has no explicit span of its own, so it falls
  // back to the log's own full bounds — the same span DateRangePicker uses
  // to size its calendar.
  const effectiveRange = range ?? insights.dateBounds;
  const dailyDisabled = effectiveRange ? !dailyGranularityFits(effectiveRange) : false;

  // Built once per data change, not on every render — JSON.stringify-ing the
  // full unfiltered workout log (and body comp, if present) is real work at
  // ~1,200 rows. Only used if "Send to a device" (SettingsSheet) actually starts a
  // host session (see SyncDialog).
  const syncOutgoing = useMemo<OutgoingDataset[]>(() => {
    const outgoing: OutgoingDataset[] = [{ dataset: "workout", json: JSON.stringify(workoutRows) }];
    if (bodyComp.status === "ready") {
      outgoing.push({ dataset: "bodyComp", json: JSON.stringify(bodyComp.rows) });
    }
    if (experiments.length > 0) {
      outgoing.push({ dataset: "experiments", json: JSON.stringify(experiments) });
    }
    return outgoing;
  }, [workoutRows, bodyComp, experiments]);

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
      {/* Three things only: where you are (the wordmark and the four sections),
          whether this is sample data, and one door to everything else
          (SettingsSheet). View scope lives with the content below; see ScopeLine. */}
      <header className="border-b border-border">
        {/* From lg up, a three-column grid with equal outer tracks, so the
            sections sit at the true centre of the page whatever the wordmark
            and Settings widths are. Narrower than that there isn't room for
            all three on one line, so the sections wrap onto their own row. */}
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-10 px-5 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex h-16 shrink-0 items-center gap-3">
            <SwiftMark className="[&_img]:h-7" />
            {source === "sample" ? (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase">
                Sample data
              </span>
            ) : null}
          </div>
          <div className="order-last -mx-5 w-[calc(100%+2.5rem)] border-t border-border px-5 sm:-mx-8 sm:w-[calc(100%+4rem)] sm:px-8 lg:order-none lg:mx-0 lg:w-auto lg:border-t-0 lg:px-0">
            <SectionLinks value={tab} onValueChange={onTabChange} />
          </div>
          <div className="ml-auto lg:ml-0 lg:justify-self-end">
            <SettingsSheet
              source={source}
              workoutRows={workoutRows}
              onWorkoutFile={onWorkoutFile}
              bodyComp={bodyComp}
              onBodyCompFile={onBodyCompFile}
              experiments={experiments}
              syncOutgoing={syncOutgoing}
              onSyncedWorkoutData={onSyncedWorkoutData}
              onSyncedBodyCompData={onSyncedBodyCompData}
              onSyncedExperiments={onSyncedExperiments}
              onReset={onReset}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <div className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
              Training log <span className="text-muted-foreground/50">/</span> {sectionOf(tab)}
              {summary.total_logged > 0 ? (
                <span className="hidden normal-case tracking-normal sm:inline">
                  {"  ·  "}
                  {formatDate(summary.date_start)} – {formatDate(summary.date_end)}
                </span>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px] sm:leading-[1.1]">
              {pageTitleOf(tab)}
            </h1>
            {pageSubtitleOf(tab) ? (
              <p className="-mt-1 max-w-2xl text-sm text-muted-foreground">{pageSubtitleOf(tab)}</p>
            ) : null}
          </div>
          {/* A ruled row of its own: what the page is (heading, definition)
              ends above the line; how you're viewing it starts below. */}
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-border pt-4">
            {usesRange && insights.dateBounds ? (
              <ScopeLine
                dateBounds={insights.dateBounds}
                range={range}
                rangePreset={rangePreset}
                onRangeSelect={onRangeSelect}
                granularity={granularity}
                onGranularityChange={onGranularityChange}
                dailyDisabled={dailyDisabled}
              />
            ) : (
              // Plateaus, Alignment and Experiments are computed in App.tsx
              // from the full, unfiltered history as of today — saying so
              // beats showing a date control that silently does nothing here.
              <p className="text-base text-muted-foreground">
                Uses your full history, as of today — the date range doesn't apply here.
              </p>
            )}
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {source === "upload" ? "Stored in this browser only" : "Sample data isn't stored"}
            </div>
          </div>
          <SubNav value={tab} onValueChange={onTabChange} />
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="gap-6">
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

          <TabsContent value={PLATEAU_TAB}>
            <PlateauTab
              plateauInsights={plateauInsights}
              bodyComp={bodyComp}
              onBodyCompFile={onBodyCompFile}
            />
          </TabsContent>

          <TabsContent value={ALIGNMENT_TAB}>
            <AlignmentTab
              alignment={alignment}
              bodyComp={bodyComp}
              onBodyCompFile={onBodyCompFile}
            />
          </TabsContent>

          <TabsContent value={EXPERIMENTS_TAB}>
            <ExperimentsTab
              experiments={experiments}
              experimentInsights={experimentInsights}
              bodyComp={bodyComp}
              onBodyCompFile={onBodyCompFile}
              onAddExperiment={onAddExperiment}
              onDeleteExperiment={onDeleteExperiment}
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
