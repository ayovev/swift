import { idbDelete, idbGet, idbSet } from "./idbStore";
import type { InBodyRow } from "@/types/inbody";

const KEY = "body-comp-rows";

export function saveBodyCompRows(rows: InBodyRow[]): Promise<void> {
  return idbSet(KEY, rows);
}

export function loadBodyCompRows(): Promise<InBodyRow[] | undefined> {
  return idbGet<InBodyRow[]>(KEY);
}

export function clearBodyCompRows(): Promise<void> {
  return idbDelete(KEY);
}
