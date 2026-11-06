import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { WeighIn } from "@/types/weighIn";
import { ProgressView } from "./progress/ProgressView";

interface LiftsTabProps {
  workouts: readonly SugarWodRow[];
  /** InBody scans, when loaded: they only feed the body-context lines under a row, never a verdict. */
  scans: readonly InBodyRow[];
  /** Manual weigh-ins: pooled with the scans for the same lines. */
  weighIns?: readonly WeighIn[];
  /** YYYY-MM-DD; today unless a test says otherwise. */
  asOf?: string;
  /** Opens a subject on the Timeline. */
  onSeeOnTimeline?: (subjectKey: string) => void;
}

/**
 * The Insights front door (tab id `lifts`, labelled Progress): is each lift and benchmark moving, and what is the headline across them?
 * Needs only the SugarWOD log. The rules are in `src/lib/analytics/insights`; this is the view over them.
 */
export function LiftsTab({ workouts, scans, weighIns, asOf, onSeeOnTimeline }: LiftsTabProps) {
  return <ProgressView workouts={workouts} scans={scans} {...(weighIns ? { weighIns } : {})} {...(asOf ? { asOf } : {})} {...(onSeeOnTimeline ? { onSeeOnTimeline } : {})} />;
}
