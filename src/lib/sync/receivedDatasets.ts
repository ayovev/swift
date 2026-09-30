import { validateTagList } from "@/lib/analytics/contextTags";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";
import type { SyncDataset } from "./chunking";
import { DATASET_LABEL } from "./datasetLabels";
import { validateBodyCompRows, validateExperiments, validateWorkoutRows, type Validated } from "./validateReceived";

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
 * another. Every payload is validated first (`validateReceived.ts`, and
 * `validateTagList` for tags): one that fails, or that arrived unreadable, is
 * skipped and named in `skipped` with the reason, the local copy is left
 * exactly as it was, and it never half-applies. The dialog tells the athlete.
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
  offer<Experiment>("experiments", received.experiments, validateExperiments, existing.experiments, handlers.experiments);
  offer<ContextTag>(
    "tags",
    received.tags,
    (raw) => {
      const result = validateTagList(raw);
      return result.status === "ok" ? { status: "ok", value: result.tags } : result;
    },
    existing.tags,
    handlers.tags
  );

  return { conflicts, skipped };
}
