import { idbDelete, idbGet, idbSet } from "./idbStore";
import type { Experiment } from "@/types/experiment";

const KEY = "experiments";

export function saveExperiments(experiments: Experiment[]): Promise<void> {
  return idbSet(KEY, experiments);
}

export function loadExperiments(): Promise<Experiment[] | undefined> {
  return idbGet<Experiment[]>(KEY);
}

export function clearExperiments(): Promise<void> {
  return idbDelete(KEY);
}
