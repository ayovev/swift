import { idbDelete, idbGet, idbSet } from "./idbStore";
import type { SugarWodRow } from "@/types/sugarwod";

const KEY = "workout-rows";

export function saveWorkoutRows(rows: SugarWodRow[]): Promise<void> {
  return idbSet(KEY, rows);
}

export function loadWorkoutRows(): Promise<SugarWodRow[] | undefined> {
  return idbGet<SugarWodRow[]>(KEY);
}

export function clearWorkoutRows(): Promise<void> {
  return idbDelete(KEY);
}
