import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareAreaChart } from "./charts/ShareAreaChart";
import { modalityColor } from "./charts/chartUtils";
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
}: {
  modality: Modality;
  data: ModalityData;
  granularity: Granularity;
}) {
  const trend = data.modality_trends[modality];
  const direction = data.modality_trend_direction[modality];
  const overall = data.modality_overall[modality];
  const workouts = data.modality_workout_lists[modality];
  const name = MODALITY_NAMES[modality];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{name}</CardTitle>
        </CardHeader>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Share of training, {GRANULARITY_NOUN[granularity]} by {GRANULARITY_NOUN[granularity]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ShareAreaChart
            data={trend.map((p) => ({ bucket: p.bucket, value: p.avg_share }))}
            color={modalityColor(modality)}
            seriesLabel={name}
            label={`${granularityLabel(granularity)} average share of training spent on ${name}`}
            granularity={granularity}
          />
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
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Every workout with {name} in it</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Each workout's full M/W/G split is shown alongside the movements that put it here.
          </p>
          <WorkoutList
            reasonLabel="share"
            rows={workouts.map((w) => ({
              date: w.date,
              title: w.title,
              reason: `${w.share.toFixed(0)}%`,
              detail: `${w.movements.join(", ") || "—"} · M ${w.split.M.toFixed(0)} / W ${w.split.W.toFixed(0)} / G ${w.split.G.toFixed(0)}`,
            }))}
            emptyMessage={`No workouts in this export involved ${name.toLowerCase()}.`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
