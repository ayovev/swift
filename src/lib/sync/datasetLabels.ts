import type { SyncDataset } from "./chunking";

/**
 * How each sync dataset is named to the athlete, in one place so the pairing
 * views and the overwrite confirmation can't call the same thing two things.
 * Written to read after "your" and "a": "Sending your workout log", "This
 * device already has a list of experiments".
 */
export const DATASET_LABEL: Record<SyncDataset, string> = {
  workout: "workout log",
  bodyComp: "body composition history",
  experiments: "list of experiments",
  tags: "list of periods",
};
