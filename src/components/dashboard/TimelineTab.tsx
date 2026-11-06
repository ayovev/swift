import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import { TimelineView } from "./timeline/TimelineView";

interface TimelineTabProps {
  workouts: readonly SugarWodRow[];
  scans: readonly InBodyRow[];
  weighIns?: readonly WeighIn[];
  timeline: readonly TimelineEntry[];
  onAddEntry: (entry: Omit<TimelineEntry, "id">) => string;
  onUpdateEntry: (entry: TimelineEntry) => void;
  onDeleteEntry: (id: string) => void;
  asOf?: string;
  initialSubjectKey?: string | null;
}

/**
 * The Timeline (tab id `timeline`): the athlete's entries, things they changed and things that happened, laid on one axis beside the
 * verdicts from the Progress view. Needs only the SugarWOD log; InBody scans and weigh-ins add a body-weight line to an entry.
 */
export function TimelineTab(props: TimelineTabProps) {
  return <TimelineView {...props} />;
}
