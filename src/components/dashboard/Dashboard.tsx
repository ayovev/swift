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
import { CompareTab } from "./CompareTab";
import { PeriodsTab } from "./PeriodsTab";
import { ChartInteractionProvider } from "./charts/chartInteraction";
import type { OutgoingDataset } from "@/lib/sync/syncSession";
import {
  ALL_TABS,
  BODY_COMP_TAB,
  MOVEMENTS_TAB,
  OVERVIEW_TAB,
  LIFTS_TAB,
  COMPARE_TAB,
  PERIODS_TAB,
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
import type { RelativeStrengthResult } from "@/lib/analytics/relativeStrength";
import type { AlignmentResult } from "@/types/alignment";
import type { DateWindow } from "@/types/compare";
import type { PeriodVerdict } from "@/types/verdict";
import type { ContextTag } from "@/types/tag";
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
  onSyncedTags: (tags: ContextTag[]) => void;
  plateauInsights: PlateauInsight[] | null;
  alignment: AlignmentResult | null;
  relativeStrength: RelativeStrengthResult | null;
  tags: ContextTag[];
  onAddTag: (tag: Omit<ContextTag, "id">) => void;
  onUpdateTag: (tag: ContextTag) => void;
  onDeleteTag: (id: string) => void;
  verdicts: Map<string, PeriodVerdict> | null;
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
  onSyncedTags,
  plateauInsights,
  alignment,
  relativeStrength,
  tags,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
  verdicts,
}: DashboardProps) {
  const [tab, setTab] = useState<string>(OVERVIEW_TAB);
  // A range dragged out on a chart, waiting for the Compare or Tags view to
  // pick it up. `nonce` re-keys that view so a second drag replaces the first.
  const [pendingWindow, setPendingWindow] = useState<{ window: DateWindow | null; tagId: string | null; nonce: number } | null>(null);
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
    if (tags.length > 0) {
      outgoing.push({ dataset: "tags", json: JSON.stringify(tags) });
    }
    return outgoing;
  }, [workoutRows, bodyComp, tags]);

  // Widening the range out from under an active daily view (via the date
  // picker, not this control) would otherwise leave a chart stuck rendering
  // a granularity its own picker no longer offers.
  useEffect(() => {
    if (granularity === "daily" && dailyDisabled) onGranularityChange("weekly");
  }, [granularity, dailyDisabled, onGranularityChange]);

  const chartInteraction = useMemo(
    () => ({
      tags,
      onCompare: (window: DateWindow) => {
        setPendingWindow((p) => ({ window, tagId: null, nonce: (p?.nonce ?? 0) + 1 }));
        setTab(COMPARE_TAB);
        capture({ name: "interaction_used", props: { interaction: "compare_range_selected" } });
        capture({ name: "tab_viewed", props: { tab: "Compare", source } });
      },
      onTag: (window: DateWindow) => {
        setPendingWindow((p) => ({ window, tagId: null, nonce: (p?.nonce ?? 0) + 1 }));
        setTab(PERIODS_TAB);
        capture({ name: "interaction_used", props: { interaction: "tag_range_selected" } });
        capture({ name: "tab_viewed", props: { tab: "Periods", source } });
      },
    }),
    [tags, source]
  );

  // From a row on the Tags view: open Compare with that tag's range filled in.
  const onCompareTag = useCallback(
    (tagId: string) => {
      setPendingWindow((p) => ({ window: null, tagId, nonce: (p?.nonce ?? 0) + 1 }));
      setTab(COMPARE_TAB);
      capture({ name: "interaction_used", props: { interaction: "tag_compared" } });
      capture({ name: "tab_viewed", props: { tab: "Compare", source } });
    },
    [source]
  );

  const onTabChange = useCallback(
    (value: string) => {
      setTab(value);
      setPendingWindow(null);
      const label = ALL_TABS.find((t) => t.value === value)?.label ?? value;
      capture({ name: "tab_viewed", props: { tab: label, source } });
    },
    [source]
  );

  return (
    <ChartInteractionProvider value={chartInteraction}>
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
              tags={tags}
              syncOutgoing={syncOutgoing}
              onSyncedWorkoutData={onSyncedWorkoutData}
              onSyncedBodyCompData={onSyncedBodyCompData}
              onSyncedTags={onSyncedTags}
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
              // Progress and Compare are computed in App.tsx
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
              onFile={onBodyCompFile}
              dashboard={insights.dashboard}
            />
          </TabsContent>

          <TabsContent value={LIFTS_TAB}>
            <LiftsTab
              plateauInsights={plateauInsights}
              alignment={alignment}
              relativeStrength={relativeStrength}
              bodyComp={bodyComp}
              onBodyCompFile={onBodyCompFile}
            />
          </TabsContent>

          <TabsContent value={COMPARE_TAB}>
            <CompareTab
              key={pendingWindow?.nonce ?? 0}
              workouts={workoutRows}
              scans={bodyComp.status === "ready" ? bodyComp.rows : []}
              tags={tags}
              verdicts={verdicts}
              bodyComp={bodyComp}
              onBodyCompFile={onBodyCompFile}
              initialWindowB={pendingWindow?.window ?? null}
              initialTagId={pendingWindow?.tagId ?? null}
              onAddTag={onAddTag}
            />
          </TabsContent>

          <TabsContent value={PERIODS_TAB}>
            <PeriodsTab
              key={pendingWindow?.nonce ?? 0}
              tags={tags}
              source={source}
              verdicts={verdicts}
              onCompareTag={onCompareTag}
              initialWindow={pendingWindow?.window ?? null}
              onAdd={onAddTag}
              onUpdate={onUpdateTag}
              onDelete={onDeleteTag}
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
    </ChartInteractionProvider>
  );
}
