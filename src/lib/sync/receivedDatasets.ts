import { validateTagList } from "@/lib/analytics/contextTags";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";
import type { SyncDataset } from "./chunking";

/**
 * What a joiner does with the datasets that arrived: nothing is applied
 * until this says so, and anything that would overwrite existing local data
 * comes back as a conflict for the dialog to confirm first. Pure — handlers
 * in, conflicts out — so the rules below are unit-testable without a WebRTC
 * connection.
 *
 * Sync carries the athlete's data and nothing else: the workout log, the
 * InBody history, experiments and context tags. How the app looks or is
 * configured (theme, grouping, date range) stays on each device.
 *
 * Each dataset is confirmed independently: accepting one never accepts
 * another. A tags payload that fails validation is skipped and named in
 * `skipped`; it never half-applies.
 */

export interface ExistingCounts {
  /** `null` means nothing local to conflict with. */
  workout: number | null;
  bodyComp: number | null;
  experiments: number | null;
  tags: number | null;
}

export interface ReceivedHandlers {
  workout: (rows: SugarWodRow[]) => void;
  bodyComp: (rows: InBodyRow[]) => void;
  experiments: (experiments: Experiment[]) => void;
  tags: (tags: ContextTag[]) => void;
}

export interface ConflictItem {
  dataset: SyncDataset;
  existingCount: number;
  incomingCount: number;
  apply: () => void;
}

export interface ReceivedPlan {
  conflicts: ConflictItem[];
  skipped: SyncDataset[];
}

export function planReceived(
  received: Partial<Record<SyncDataset, unknown>>,
  existing: ExistingCounts,
  handlers: ReceivedHandlers
): ReceivedPlan {
  const conflicts: ConflictItem[] = [];
  const skipped: SyncDataset[] = [];

  const offer = (dataset: SyncDataset, existingCount: number | null, incomingCount: number, apply: () => void) => {
    if (existingCount !== null) conflicts.push({ dataset, existingCount, incomingCount, apply });
    else apply();
  };

  const workoutRows = received.workout as SugarWodRow[] | undefined;
  if (workoutRows) offer("workout", existing.workout, workoutRows.length, () => handlers.workout(workoutRows));

  const bodyCompRows = received.bodyComp as InBodyRow[] | undefined;
  if (bodyCompRows) offer("bodyComp", existing.bodyComp, bodyCompRows.length, () => handlers.bodyComp(bodyCompRows));

  const experiments = received.experiments as Experiment[] | undefined;
  if (experiments) offer("experiments", existing.experiments, experiments.length, () => handlers.experiments(experiments));

  if (received.tags !== undefined) {
    const result = validateTagList(received.tags);
    if (result.status === "ok") {
      offer("tags", existing.tags, result.tags.length, () => handlers.tags(result.tags));
    } else {
      skipped.push("tags");
    }
  }

  return { conflicts, skipped };
}
