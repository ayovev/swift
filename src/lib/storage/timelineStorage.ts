import { idbGet, idbSet } from "./idbStore";
import type { TimelineEntry } from "@/types/timeline";

const KEY = "timeline-entries";

export function saveTimeline(entries: TimelineEntry[]): Promise<void> {
  return idbSet(KEY, entries);
}

export function loadTimeline(): Promise<TimelineEntry[] | undefined> {
  return idbGet<TimelineEntry[]>(KEY);
}
