import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ShareAreaChart } from "./charts/ShareAreaChart";
import { WorkoutList } from "./WorkoutList";
import {
  buildMovementOptions,
  memberBreakdown,
  selectionLabel,
  trendFor,
  workoutsFor,
} from "@/lib/analytics/buildMovementData";
import { GRANULARITY_NOUN, granularityLabel, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";
import type { MovementData, MovementSelection } from "@/types/movements";

const keyOf = (s: MovementSelection) => `${s.kind}:${s.id}`;

/**
 * Any one movement, or a whole family of them (every kind of clean), across
 * the log. Movement ids and families come from the lexicon, so what the
 * picker offers is exactly what the classifier can recognise, and a family
 * counts every one of its variants.
 *
 * The workout list shows the phrase that matched on each row. The matcher is
 * a heuristic, and an athlete whose gym words things unusually needs to see
 * why a workout is here.
 */
export function MovementsTab({ data, granularity }: { data: MovementData; granularity: Granularity }) {
  const options = useMemo(() => buildMovementOptions(data), [data]);
  const first = options.families[0] ?? options.movements[0];
  const [picked, setPicked] = useState<string | null>(null);

  const all = [...options.families, ...options.movements];
  const chosen = all.find((o) => keyOf(o) === picked) ?? first;

  if (!chosen) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No movements were recognised in the workouts in this range.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sel: MovementSelection = { kind: chosen.kind, id: chosen.id };
  const name = selectionLabel(sel);
  const matches = workoutsFor(data, sel);
  const trend = trendFor(data, sel);
  const members = memberBreakdown(data, sel);
  const share = data.workouts.length === 0 ? 0 : (matches.length / data.workouts.length) * 100;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-picker">Movement</Label>
            <select
              id="movement-picker"
              value={keyOf(chosen)}
              onChange={(e) => {
                setPicked(e.target.value);
                capture({ name: "interaction_used", props: { interaction: "movement_selected" } });
              }}
              className="h-9 max-w-sm rounded-md border border-input bg-background px-2 text-sm"
            >
              <optgroup label="Families (every variant)">
                {options.families.map((o) => (
                  <option key={keyOf(o)} value={keyOf(o)}>
                    {o.label} · {o.count.toLocaleString()}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Single movements">
                {options.movements.map((o) => (
                  <option key={keyOf(o)} value={keyOf(o)}>
                    {o.label} · {o.count.toLocaleString()}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border pt-4">
            <div>
              <span className="text-2xl font-semibold tabular">{matches.length.toLocaleString()}</span>
              <span className="ml-2 text-sm text-muted-foreground">workouts with {name.toLowerCase()} in them</span>
            </div>
            <div className="text-sm text-muted-foreground tabular">
              {share.toFixed(1)}% of {data.workouts.length.toLocaleString()} workouts
            </div>
          </div>
          {members.length > 1 ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {members.map((m) => (
                <li key={m.id} className="tabular">
                  {m.label} <span className="text-foreground">{m.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Workouts with {name.toLowerCase()}, {GRANULARITY_NOUN[granularity]} by {GRANULARITY_NOUN[granularity]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ShareAreaChart
            data={trend}
            color="var(--primary)"
            seriesLabel={name}
            label={`${granularityLabel(granularity)} share of workouts that included ${name}`}
            granularity={granularity}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Every workout with {name.toLowerCase()} in it</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutList
            rows={[...matches].reverse().map(({ workout, matched }) => ({
              date: workout.date,
              title: workout.title,
              reason: matched.map((m) => m.label).join(", "),
              detail: `matched on ${matched.map((m) => `"${m.phrase}"`).join(", ")}`,
            }))}
            emptyMessage={`No workouts in this range involved ${name.toLowerCase()}.`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
