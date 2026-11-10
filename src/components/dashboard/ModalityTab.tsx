import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartViewToggle } from "./charts/ChartTable";
import { ChartPickNote, scrollToList, useBucketPick } from "./charts/ChartPick";
import { ShareAreaChart } from "./charts/ShareAreaChart";
import { modalityColor, splitText, unclassifiedNote } from "./charts/chartUtils";
import { TrendStat } from "./TrendStat";
import { WorkoutList } from "./WorkoutList";
import { GRANULARITY_NOUN, granularityLabel, type Granularity } from "@/lib/analytics/granularity";
import {
  MODALITY_BLURBS,
  MODALITY_NAMES,
  type Modality,
  type ModalityData,
} from "@/types/modality";

/**
 * One modality's tab. Mirrors DomainTab, but the numbers mean
 * something different: a domain is a yes/no tag, a modality is a proportion of
 * each workout, so these are average shares rather than counts.
 */
export function ModalityTab({
  modality,
  data,
  granularity,
  coverage,
}: {
  modality: Modality;
  data: ModalityData;
  granularity: Granularity;
  /** The days the data covers (YYYY-MM-DD), so the chart can mark a bucket the range only partly covers. */
  coverage?: { start: string; end: string } | undefined;
}) {
  const trend = data.modality_trends[modality];
  const direction = data.modality_trend_direction[modality];
  const overall = data.modality_overall[modality];
  const workouts = data.modality_workout_lists[modality];
  const name = MODALITY_NAMES[modality];
  // Picking a month on the chart narrows the list below to it (ChartPick.tsx).
  const { picked, pick, clear, inPicked, label: pickedLabel } = useBucketPick(granularity, `${modality}|${data.classified_count}|${trend.length}`);
  const listRef = useRef<HTMLDivElement>(null);
  const point = picked ? trend.find((p) => p.bucket === picked) : undefined;
  const rows = workouts.map((w) => ({
    date: w.date,
    title: w.title,
    reason: `${w.share.toFixed(0)}%`,
    detail: `${w.movements.join(", ") || "—"} · ${splitText(w.split)}`,
  }));
  const shown = picked ? rows.filter((r) => inPicked(r.date)) : rows;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {MODALITY_BLURBS[modality]}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border pt-4">
            <div>
              <span className="text-2xl font-semibold tabular">
                {overall.avg_share.toFixed(1)}%
              </span>
              <span className="ml-2 text-sm text-muted-foreground">of your training, on average</span>
            </div>
            <div className="text-sm text-muted-foreground tabular">
              appears in {overall.count.toLocaleString()} of{" "}
              {data.classified_count.toLocaleString()} workouts
            </div>
            {unclassifiedNote(data.unclassified_count) ? (
              <p className="w-full text-xs text-muted-foreground">{unclassifiedNote(data.unclassified_count)}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-2">
          <CardTitle className="text-sm font-medium">
            Share of training, {GRANULARITY_NOUN[granularity]} by {GRANULARITY_NOUN[granularity]}
          </CardTitle>
          <ChartViewToggle />
        </CardHeader>
        <CardContent>
          <ShareAreaChart
            data={trend.map((p) => ({ bucket: p.bucket, value: p.avg_share, total: p.total, basis: `Average of ${p.total} classified ${p.total === 1 ? "workout" : "workouts"}` }))}
            coverage={coverage}
            color={modalityColor(modality)}
            seriesLabel={name}
            label={`${granularityLabel(granularity)} average share of training spent on ${name}`}
            granularity={granularity}
            selected={picked}
            onSelect={pick}
          />
          {picked && pickedLabel ? (
            <ChartPickNote
              onClear={clear}
              action={shown.length ? { label: `List ${shown.length === 1 ? "it" : "them"}`, onClick: () => scrollToList(listRef.current) } : undefined}
            >
              <span className="font-medium">{pickedLabel}</span>: {name.toLowerCase()} in {shown.length.toLocaleString()} of{" "}
              {(point?.total ?? 0).toLocaleString()} classified workouts, {(point?.avg_share ?? 0).toFixed(1)}% on average
            </ChartPickNote>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Then versus now</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendStat
            earlyPct={direction.early_pct}
            latePct={direction.late_pct}
            delta={direction.delta}
            unitLabel={`share of training spent on ${name.toLowerCase()}`}
            halves={data.modality_trend_halves}
          />
        </CardContent>
      </Card>

      <Card ref={listRef}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Every workout with {name} in it</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Each workout's full M/W/G split is shown alongside the movements that put it here.
          </p>
          <WorkoutList
            reasonLabel="share"
            rows={shown}
            emptyMessage={picked ? `No workouts in ${pickedLabel} involved ${name.toLowerCase()}.` : `No workouts in this export involved ${name.toLowerCase()}.`}
            scope={picked && pickedLabel ? { label: pickedLabel, onClear: clear } : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
