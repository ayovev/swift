import { validateEntryList } from "@/lib/analytics/timeline";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { TimelineEntry } from "@/types/timeline";
import type { WeighIn } from "@/types/weighIn";
import type { SyncDataset } from "./chunking";
import { DATASET_LABEL } from "./datasetLabels";
import { validateBodyCompRows, validateWeighIns, validateWorkoutRows, type Validated } from "./validateReceived";

/**
 * What a joiner does with the datasets that arrived: nothing is applied
 * until this says so, and anything that would overwrite existing local data
 * comes back as a conflict for the dialog to confirm first. Pure — handlers
 * in, conflicts out — so the rules below are unit-testable without a WebRTC
 * connection.
 *
 * Sync carries the athlete's data and nothing else: the workout log, the
 * InBody history, manual weigh-ins and the timeline. How the app looks or is
 * configured (theme, grouping, date range) stays on each device.
 *
 * Every payload is validated first (`validateReceived.ts`, and
 * `validateEntryList` for the timeline): one that fails, or that arrived
 * unreadable, is named in `skipped` with the reason and never half-applies.
 * This is the per-dataset layer; a transfer as a whole is all-or-nothing, which
 * is `planTransfer` (`planTransfer.ts`): any skipped dataset means nothing is
 * applied, and all conflicts are confirmed together.
 */

export interface ExistingCounts {
  /** `null` means nothing local to conflict with. */
  workout: number | null;
  bodyComp: number | null;
  timeline: number | null;
  weighIns: number | null;
}

export interface ReceivedHandlers {
  workout: (rows: SugarWodRow[]) => void;
  bodyComp: (rows: InBodyRow[]) => void;
  timeline: (entries: TimelineEntry[]) => void;
  weighIns: (weighIns: WeighIn[]) => void;
}

export interface ConflictItem {
  dataset: SyncDataset;
  existingCount: number;
  incomingCount: number;
  apply: () => void;
}

export interface SkippedDataset {
  dataset: SyncDataset;
  /** A plain sentence naming what is wrong, e.g. "Row 12 of the workout log has an unreadable date." */
  reason: string;
}

export interface ReceivedPlan {
  conflicts: ConflictItem[];
  skipped: SkippedDataset[];
}

export function planReceived(
  received: Partial<Record<SyncDataset, unknown>>,
  existing: ExistingCounts,
  handlers: ReceivedHandlers,
  /** Datasets whose payload wasn't valid JSON, so there is nothing to validate. */
  unreadable: readonly SyncDataset[] = []
): ReceivedPlan {
  const conflicts: ConflictItem[] = [];
  const skipped: SkippedDataset[] = [];

  for (const dataset of unreadable) {
    skipped.push({ dataset, reason: `The ${DATASET_LABEL[dataset]} arrived damaged and couldn't be read.` });
  }

  const offer = <T>(
    dataset: SyncDataset,
    payload: unknown,
    validate: (raw: unknown) => Validated<T[]>,
    existingCount: number | null,
    apply: (value: T[]) => void
  ) => {
    if (payload === undefined) return;
    const result = validate(payload);
    if (result.status === "invalid") {
      skipped.push({ dataset, reason: result.reason });
      return;
    }
    const value = result.value;
    if (existingCount !== null) conflicts.push({ dataset, existingCount, incomingCount: value.length, apply: () => apply(value) });
    else apply(value);
  };

  offer<SugarWodRow>("workout", received.workout, validateWorkoutRows, existing.workout, handlers.workout);
  offer<InBodyRow>("bodyComp", received.bodyComp, validateBodyCompRows, existing.bodyComp, handlers.bodyComp);

  offer<WeighIn>("weighIns", received.weighIns, validateWeighIns, existing.weighIns, handlers.weighIns);

  offer<TimelineEntry>(
    "timeline",
    received.timeline,
    (raw) => {
      const result = validateEntryList(raw);
      return result.status === "ok" ? { status: "ok", value: result.entries } : { status: "invalid", reason: result.reason };
    },
    existing.timeline,
    handlers.timeline
  );

  return { conflicts, skipped };
}
