import { idbGet, idbSet } from "./idbStore";
import type { WeighIn } from "@/types/weighIn";

const KEY = "weigh-ins";

export function saveWeighIns(weighIns: WeighIn[]): Promise<void> {
  return idbSet(KEY, weighIns);
}

export function loadWeighIns(): Promise<WeighIn[] | undefined> {
  return idbGet<WeighIn[]>(KEY);
}
