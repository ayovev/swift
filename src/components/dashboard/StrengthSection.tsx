import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TREND_THRESHOLD } from "@/lib/analytics/plateauDetector";
import { capture } from "@/lib/posthog";
import type { LiftRelativeStrength, RelativeStrengthResult, StrengthAttribution } from "@/lib/analytics/relativeStrength";
import { ATTRIBUTION_LABEL } from "./strengthLabels";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { RelativeStrengthChart, type StrengthView } from "./charts/RelativeStrengthChart";

interface StrengthSectionProps {
  relativeStrength: RelativeStrengthResult;
}

const THRESHOLD_PCT = `${Math.round(TREND_THRESHOLD * 100)}%`;

/** What each badge means, in the same order as the calculation checks them. Uses the calculation's own threshold. */
const BADGE_LEGEND: readonly { attribution: StrengthAttribution; meaning: string }[] = [
  {
    attribution: "strength-driven",
    meaning: `Estimated 1RM up ${THRESHOLD_PCT} or more, with body mass level or lower beyond normal scan variation.`,
  },
  {
    attribution: "mixed",
    meaning: `Estimated 1RM and body mass both up. Per lb of body mass, 1RM is still up ${THRESHOLD_PCT} or more.`,
  },
  {
    attribution: "mass-driven",
    meaning: `Estimated 1RM and body mass both up. Per lb of body mass, 1RM is up less than ${THRESHOLD_PCT}.`,
  },
  { attribution: "flat", meaning: `Estimated 1RM within ${THRESHOLD_PCT} either way.` },
  { attribution: "declined", meaning: `Estimated 1RM down ${THRESHOLD_PCT} or more.` },
];

const VIEW_OPTIONS: readonly SegmentedControlOption<StrengthView>[] = [
  { id: "raw", label: "Raw" },
  { id: "perBodyweight", label: "Per bodyweight" },
  { id: "perLeanMass", label: "Per lean mass" },
];

function LiftCard({ lift }: { lift: LiftRelativeStrength }) {
  const [view, setView] = useState<StrengthView>("raw");
  const hasLean = lift.series.some((p) => p.perLeanMass !== null);
  const options = VIEW_OPTIONS.map((o) =>
    o.id === "perLeanMass" && !hasLean
      ? { ...o, disabled: true, title: "This export has no lean mass reading close to these sessions." }
      : o
  );
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <CardTitle className="text-base">
          {lift.lift} ({lift.rxStatus})
        </CardTitle>
        <div className="flex items-center gap-3">
          {lift.attribution ? <Badge variant={lift.attribution === "strength-driven" ? "default" : "secondary"}>{ATTRIBUTION_LABEL[lift.attribution]}</Badge> : null}
          <SegmentedControl
            ariaLabel={`${lift.lift} chart view`}
            value={view}
            options={options}
            onChange={(v) => {
              setView(v);
              capture({ name: "interaction_used", props: { interaction: "strength_view_toggled" } });
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{lift.reason}</p>
        <RelativeStrengthChart liftName={lift.lift} points={lift.series} view={view} />
      </CardContent>
    </Card>
  );
}

/**
 * "Got stronger" or "got bigger"? Lifts that fail an eligibility gate are
 * listed collapsed with the gate that failed, never hidden. Sits on the Progress
 * view under the plateau table, which is what gates it on both uploads.
 */
export function StrengthSection({ relativeStrength }: StrengthSectionProps) {
  const eligible = relativeStrength.lifts.filter((l) => l.status === "ok");
  const ineligible = relativeStrength.lifts.filter((l) => l.status === "insufficient");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Estimated one-rep max per session for each lift, from the top load and the rep scheme
            in the workout text. Body mass at each session comes from the InBody scan on that day,
            or a straight line between two scans close together; sessions with no scan near enough
            are left out of the per-bodyweight and per-lean-mass views.
          </p>
          <dl aria-label="What the badges mean" className="mt-3 grid max-w-3xl grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
            {BADGE_LEGEND.map(({ attribution, meaning }) => (
              <div key={attribution} className="contents">
                <dt>
                  <Badge variant={attribution === "strength-driven" ? "default" : "secondary"}>
                    {ATTRIBUTION_LABEL[attribution]}
                  </Badge>
                </dt>
                <dd className="text-muted-foreground">{meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
            Body mass is lean mass, or bodyweight when the export has no lean mass close to the
            sessions. Changes are measured from the start to the end of the last year of sessions.
          </p>
          {relativeStrength.status === "insufficient" ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {relativeStrength.reason?.charAt(0).toUpperCase()}
              {relativeStrength.reason?.slice(1)}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {eligible.map((lift) => (
        <LiftCard key={`${lift.lift}:${lift.rxStatus}`} lift={lift} />
      ))}

      {ineligible.length > 0 ? (
        <Collapsible>
          <Card>
            <CardHeader className="pb-2">
              <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
                <CardTitle className="text-base">
                  Not enough data yet ({ineligible.length} {ineligible.length === 1 ? "lift" : "lifts"})
                </CardTitle>
                <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {ineligible.map((lift) => (
                    <li key={`${lift.lift}:${lift.rxStatus}`} className="text-sm">
                      <span className="font-medium">
                        {lift.lift} ({lift.rxStatus})
                      </span>
                      <span className="text-muted-foreground">: {lift.reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ) : null}
    </div>
  );
}
