import { GRANULARITY_OPTIONS } from "@/lib/analytics/granularity";
import { PRESET_OPTIONS, type DateRangePreset } from "@/lib/analytics/dateRange";
import type { StoredViewPreferences } from "@/lib/storage/viewPreferencesStorage";
import { ACCENT_SWATCHES, type AccentId } from "@/lib/theme/palette";
import type { ModePreference } from "@/lib/theme/useTheme";

/**
 * The athlete's preferences, as one sync dataset: how they view the
 * dashboard (grouping and date range, which live in IndexedDB) and how it
 * looks (accent and light/dark, which live in localStorage). Both are small
 * closed vocabularies — a granularity id, a range preset id, two ISO dates
 * for a custom range, an accent id, a mode — never anything derived from a
 * CSV, so this carries no more than the choices themselves.
 *
 * Either half may be absent, and a half that fails validation is dropped
 * rather than half-applied, because this arrives from another device.
 * Presets are stored as ids, not dates, for the same reason
 * `viewPreferencesStorage.ts` does: "Last 3 months" recomputes against the
 * day the receiving device applies it.
 */
export interface SyncedPreferences {
  view?: StoredViewPreferences;
  theme?: { mode: ModePreference; accent: AccentId };
}

const PRESET_IDS: readonly DateRangePreset[] = [...PRESET_OPTIONS.map((p) => p.id), "custom"];
const MODES: readonly ModePreference[] = ["light", "dark", "system"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

export function buildSyncedPreferences(
  view: StoredViewPreferences,
  theme: { mode: ModePreference; accent: AccentId }
): SyncedPreferences {
  return { view, theme };
}

function parseView(raw: unknown): StoredViewPreferences | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const v = raw as Record<string, unknown>;
  const granularity = GRANULARITY_OPTIONS.find((g) => g.id === v.granularity)?.id;
  const rangePreset = PRESET_IDS.find((p) => p === v.rangePreset);
  if (!granularity || !rangePreset) return undefined;

  if (rangePreset !== "custom") return { granularity, rangePreset, customRange: null };

  const c = v.customRange as Record<string, unknown> | null | undefined;
  if (!c || typeof c.start !== "string" || typeof c.end !== "string") return undefined;
  if (!ISO_DAY.test(c.start) || !ISO_DAY.test(c.end) || c.end < c.start) return undefined;
  return { granularity, rangePreset, customRange: { start: c.start, end: c.end } };
}

function parseTheme(raw: unknown): SyncedPreferences["theme"] | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const t = raw as Record<string, unknown>;
  const mode = MODES.find((m) => m === t.mode);
  const accent = ACCENT_SWATCHES.find((s) => s.id === t.accent)?.id;
  return mode && accent ? { mode, accent } : undefined;
}

/** Null when nothing in `raw` is usable, so the caller can skip the dataset instead of applying an empty one. */
export function parseSyncedPreferences(raw: unknown): SyncedPreferences | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const view = parseView(r.view);
  const theme = parseTheme(r.theme);
  if (!view && !theme) return null;
  return { ...(view ? { view } : {}), ...(theme ? { theme } : {}) };
}
