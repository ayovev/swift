import { validateTagList } from "@/lib/analytics/contextTags";
import { experimentToTag, mergeTagsById } from "@/lib/analytics/experimentTags";
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
 * InBody history and context tags (an experiment is a tag of type
 * "experiment"). How the app looks or is configured (theme, grouping, date
 * range) stays on each device.
 *
 * `experiments` is still a name on the wire, but only for receiving: an older
 * device, or an older backup file, sends experiments as their own list. They
 * are validated as before and folded into the tags that arrive with them, so
 * this device only ever holds one list. Nothing sends it any more.
 *
 * Every payload is validated first (`validateReceived.ts`, and
 * `validateTagList` for tags): one that fails, or that arrived unreadable, is
 * named in `skipped` with the reason and never half-applies. This is the
 * per-dataset layer; a transfer as a whole is all-or-nothing, which is
 * `planTransfer` (`planTransfer.ts`): any skipped dataset means nothing is
 * applied, and all conflicts are confirmed together.
 */

export interface ExistingCounts {
  /** `null` means nothing local to conflict with. */
  workout: number | null;
  bodyComp: number | null;
  tags: number | null;
}

export interface ReceivedHandlers {
  workout: (rows: SugarWodRow[]) => void;
  bodyComp: (rows: InBodyRow[]) => void;
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

  // Experiments from an older sender become tags, joined with any tags that
  // came alongside them, so the tags dataset is offered (and conflicts are
  // counted) once, as the one list it now is.
  let legacyTags: ContextTag[] = [];
  if (received.experiments !== undefined) {
    const legacy = validateExperiments(received.experiments);
    if (legacy.status === "invalid") skipped.push({ dataset: "experiments", reason: legacy.reason });
    else legacyTags = legacy.value.map(experimentToTag);
  }

  const validateTags = (raw: unknown): Validated<ContextTag[]> => {
    const result = validateTagList(raw);
    return result.status === "ok" ? { status: "ok", value: result.tags } : result;
  };
  if (received.tags !== undefined) {
    offer<ContextTag>(
      "tags",
      received.tags,
      (raw) => {
        const result = validateTags(raw);
        return result.status === "ok" ? { status: "ok", value: mergeTagsById(result.value, legacyTags) } : result;
      },
      existing.tags,
      handlers.tags
    );
  } else if (legacyTags.length > 0) {
    offer<ContextTag>("tags", legacyTags, validateTags, existing.tags, handlers.tags);
  }

  return { conflicts, skipped };
}
