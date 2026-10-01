import type { Experiment } from "@/types/experiment";
import type { ContextTag } from "@/types/tag";
import { tagLabel } from "./contextTags";

/**
 * An experiment used to be its own record. It is now a tag of type
 * "experiment", and these are the two seams that remain: `experimentToTag`
 * reads an old record (saved in the browser, sent by an older device, or in an
 * older backup file) as a tag, and `tagToExperiment` hands an experiment-type
 * tag to `getExperimentInsight`, which still takes the shape it always did.
 * Neither changes a value: dates, label and earlier-range start carry across,
 * and a missing end date is an open-ended tag (`null`).
 */

export function experimentToTag(experiment: Experiment): ContextTag {
  return {
    id: experiment.id,
    type: "experiment",
    label: experiment.label,
    startDate: experiment.date,
    endDate: experiment.endDate ?? null,
    ...(experiment.baselineStart ? { baselineStart: experiment.baselineStart } : {}),
  };
}

export function tagToExperiment(tag: ContextTag): Experiment {
  return {
    id: tag.id,
    date: tag.startDate,
    label: tagLabel(tag),
    ...(tag.endDate ? { endDate: tag.endDate } : {}),
    ...(tag.baselineStart ? { baselineStart: tag.baselineStart } : {}),
  };
}

export const isExperimentTag = (tag: ContextTag): boolean => tag.type === "experiment";

/** `incoming` wins on a shared id; everything else is kept, in order. */
export function mergeTagsById(existing: readonly ContextTag[], incoming: readonly ContextTag[]): ContextTag[] {
  const replaced = new Set(incoming.map((t) => t.id));
  return [...existing.filter((t) => !replaced.has(t.id)), ...incoming];
}
