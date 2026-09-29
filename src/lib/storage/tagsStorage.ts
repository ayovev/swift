import { idbDelete, idbGet, idbSet } from "./idbStore";
import type { ContextTag } from "@/types/tag";

const KEY = "context-tags";

export function saveTags(tags: ContextTag[]): Promise<void> {
  return idbSet(KEY, tags);
}

export function loadTags(): Promise<ContextTag[] | undefined> {
  return idbGet<ContextTag[]>(KEY);
}

export function clearTags(): Promise<void> {
  return idbDelete(KEY);
}
