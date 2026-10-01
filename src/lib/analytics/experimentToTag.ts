import type { Experiment } from "@/types/experiment";
import type { ContextTag } from "@/types/tag";

/**
 * An experiment used to be its own record; it is a period of type "experiment" now.
 * This reads an old record (saved in the browser under the retired key, sent by an older
 * device, or in an older backup file) as a period. It changes no value: dates, label and
 * earlier-range start carry across, and a missing end date is an open-ended period (`null`).
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
