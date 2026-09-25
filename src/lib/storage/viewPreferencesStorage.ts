import { idbDelete, idbGet, idbSet } from "./idbStore";
import type { DateRangePreset } from "@/lib/analytics/dateRange";
import type { Granularity } from "@/lib/analytics/granularity";

const KEY = "view-preferences";

/**
 * `range` isn't stored as a concrete date span: presets are anchored to
 * today's real-world date (see DateRangePicker.tsx), so restoring "Last 3
 * months" should recompute against the day the athlete reopens the app, not
 * replay a frozen window from last time. Only "custom" needs concrete dates,
 * stored as day strings (`YYYY-MM-DD`) since a Dayjs instance doesn't survive
 * IndexedDB's structured clone with its prototype methods intact.
 */
export interface StoredViewPreferences {
  granularity: Granularity;
  rangePreset: DateRangePreset;
  customRange: { start: string; end: string } | null;
}

export function saveViewPreferences(prefs: StoredViewPreferences): Promise<void> {
  return idbSet(KEY, prefs);
}

export function loadViewPreferences(): Promise<StoredViewPreferences | undefined> {
  return idbGet<StoredViewPreferences>(KEY);
}

export function clearViewPreferences(): Promise<void> {
  return idbDelete(KEY);
}
