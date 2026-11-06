import { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SwiftMark } from "@/components/SwiftMark";
import { ScopeLine } from "./ScopeLine";
import { SectionLinks, SubNav, pageSubtitleOf, pageTitleOf, sectionOf } from "./SectionNav";
import { SettingsSheet } from "./SettingsSheet";
import { BodyCompTab, type BodyCompState } from "./BodyCompTab";
import { DomainTab } from "./DomainTab";
import { ModalityTab } from "./ModalityTab";
import { MovementsTab } from "./MovementsTab";
import { OverviewTab } from "./OverviewTab";
import { LiftsTab } from "./LiftsTab";
import { TimelineTab } from "./TimelineTab";
import type { OutgoingDataset } from "@/lib/sync/syncSession";
import {
  ALL_TABS,
  BODY_COMP_TAB,
  MOVEMENTS_TAB,
  OVERVIEW_TAB,
  LIFTS_TAB,
  TIMELINE_TAB,
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
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
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
  onSyncedTimeline: (entries: TimelineEntry[]) => void;
  onSyncedWeighIns: (weighIns: WeighIn[]) => void;
  weighIns: WeighIn[];
  onSaveWeighIn: (weighIn: WeighIn) => void;
  onDeleteWeighIn: (date: string) => void;
  timeline: TimelineEntry[];
  onAddEntry: (entry: Omit<TimelineEntry, "id">) => string;
  onUpdateEntry: (entry: TimelineEntry) => void;
  onDeleteEntry: (id: string) => void;
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
  onSyncedTimeline,
  onSyncedWeighIns,
  weighIns,
  onSaveWeighIn,
  onDeleteWeighIn,
  timeline,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
}: DashboardProps) {
  const [tab, setTab] = useState<string>(OVERVIEW_TAB);
  // A subject to open on the Timeline when it is reached from a row's "See on timeline" link. `nonce` re-keys the view so a second link replaces the first.
  const [timelineSubject, setTimelineSubject] = useState<{ key: string; nonce: number } | null>(null);
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
  // host session (see SyncDialog). Data only: nothing about how the app looks
  // or is configured is ever offered.
  const syncOutgoing = useMemo<OutgoingDataset[]>(() => {
    const outgoing: OutgoingDataset[] = [{ dataset: "workout", json: JSON.stringify(workoutRows) }];
    if (bodyComp.status === "ready") {
      outgoing.push({ dataset: "bodyComp", json: JSON.stringify(bodyComp.rows) });
    }
    if (weighIns.length > 0) {
      outgoing.push({ dataset: "weighIns", json: JSON.stringify(weighIns) });
    }
    if (timeline.length > 0) {
      outgoing.push({ dataset: "timeline", json: JSON.stringify(timeline) });
    }
    return outgoing;
  }, [workoutRows, bodyComp, weighIns, timeline]);

  // Widening the range out from under an active daily view (via the date
  // picker, not this control) would otherwise leave a chart stuck rendering
  // a granularity its own picker no longer offers.
  useEffect(() => {
    if (granularity === "daily" && dailyDisabled) onGranularityChange("weekly");
  }, [granularity, dailyDisabled, onGranularityChange]);

  const onSeeOnTimeline = useCallback(
    (key: string) => {
      setTimelineSubject((p) => ({ key, nonce: (p?.nonce ?? 0) + 1 }));
      setTab(TIMELINE_TAB);
      capture({ name: "tab_viewed", props: { tab: "Timeline", source } });
    },
    [source]
  );

  const onTabChange = useCallback(
    (value: string) => {
      setTab(value);
      setTimelineSubject(null);
      const label = ALL_TABS.find((t) => t.value === value)?.label ?? value;
      capture({ name: "tab_viewed", props: { tab: label, source } });
    },
    [source]
  );

  return (
    <div className="min-h-svh bg-background">
      {/* The one sample-mode indicator: a full-width strip above the header,
          rather than a chip in it or notes scattered through the page. */}
      {source === "sample" ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-b border-accent-border bg-accent-subtle px-5 py-2 text-center text-sm"
        >
          <FlaskConical className="size-3.5 shrink-0 text-accent-link" aria-hidden="true" />
          {/* One line at phone width: what this is, and the way out. "Use your
              own" is the same reset as Settings' Start over, which sample mode
              runs without a confirmation since nothing here is stored. */}
          <span className="whitespace-nowrap">
            <strong className="font-medium">Sample data</strong>
            <span className="text-muted-foreground" aria-hidden="true">
              {" · "}
            </span>
            <button
              type="button"
              onClick={onReset}
              className="text-accent-link underline underline-offset-2 hover:no-underline"
            >
              Use your own
            </button>
          </span>
        </div>
      ) : null}

      {/* Two things only: where you are (the wordmark and the four sections)
          and one door to everything else (SettingsSheet). View scope lives
          with the content below; see ScopeLine. */}
      <header className="border-b border-border">
        {/* From lg up, a three-column grid with equal outer tracks, so the
            sections sit at the true centre of the page whatever the wordmark
            and Settings widths are. Narrower than that there isn't room for
            all three on one line, so the sections wrap onto their own row. */}
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-10 px-5 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex h-16 shrink-0 items-center gap-3">
            <SwiftMark className="[&_img]:h-7" />
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
              timeline={timeline}
              weighIns={weighIns}
              syncOutgoing={syncOutgoing}
              onSyncedWorkoutData={onSyncedWorkoutData}
              onSyncedBodyCompData={onSyncedBodyCompData}
              onSyncedTimeline={onSyncedTimeline}
              onSyncedWeighIns={onSyncedWeighIns}
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
              // Progress and Timeline are computed in App.tsx
              // from the full, unfiltered history as of today — saying so
              // beats showing a date control that silently does nothing here.
              <p className="text-base text-muted-foreground">
                Uses your full history, as of today — the date range doesn't apply here.
              </p>
            )}
            {/* Sample mode already says so in the strip above the header. */}
            {source === "upload" ? (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                Stored in this browser only
              </div>
            ) : null}
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

          <TabsContent value={MOVEMENTS_TAB}>
            <MovementsTab data={insights.movements} granularity={granularity} />
          </TabsContent>

          <TabsContent value={BODY_COMP_TAB}>
            <BodyCompTab
              state={bodyComp}
              granularity={granularity}
              range={range}
              onFile={onBodyCompFile}
              dashboard={insights.dashboard}
              weighIns={weighIns}
              onSaveWeighIn={onSaveWeighIn}
              onDeleteWeighIn={onDeleteWeighIn}
            />
          </TabsContent>

          <TabsContent value={LIFTS_TAB}>
            <LiftsTab workouts={workoutRows} scans={bodyComp.status === "ready" ? bodyComp.rows : []} weighIns={weighIns} onSeeOnTimeline={onSeeOnTimeline} />
          </TabsContent>

          <TabsContent value={TIMELINE_TAB}>
            <TimelineTab
              key={timelineSubject?.nonce ?? 0}
              workouts={workoutRows}
              scans={bodyComp.status === "ready" ? bodyComp.rows : []}
              weighIns={weighIns}
              timeline={timeline}
              onAddEntry={onAddEntry}
              onUpdateEntry={onUpdateEntry}
              onDeleteEntry={onDeleteEntry}
              initialSubjectKey={timelineSubject?.key ?? null}
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
          <p className="mt-3">Your files never left this browser.</p>
        </footer>
      </main>
    </div>
  );
}
