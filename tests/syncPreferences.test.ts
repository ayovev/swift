import { describe, expect, it } from "vitest";
import { PRESET_OPTIONS } from "@/lib/analytics/dateRange";
import { GRANULARITY_OPTIONS } from "@/lib/analytics/granularity";
import { buildSyncedPreferences, parseSyncedPreferences } from "@/lib/sync/preferences";
import { ACCENT_SWATCHES } from "@/lib/theme/palette";

const view = { granularity: "weekly", rangePreset: "last_6_months", customRange: null } as const;
const theme = { mode: "dark", accent: "teal" } as const;

describe("parseSyncedPreferences", () => {
  it("round-trips what buildSyncedPreferences makes, through JSON", () => {
    const built = buildSyncedPreferences(view, theme);
    expect(parseSyncedPreferences(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it("accepts every granularity, every preset the picker offers, every accent and every mode", () => {
    for (const g of GRANULARITY_OPTIONS) {
      expect(parseSyncedPreferences({ view: { granularity: g.id, rangePreset: "all_time", customRange: null } })?.view?.granularity).toBe(g.id);
    }
    for (const p of PRESET_OPTIONS) {
      expect(parseSyncedPreferences({ view: { ...view, rangePreset: p.id } })?.view?.rangePreset).toBe(p.id);
    }
    for (const a of ACCENT_SWATCHES) {
      expect(parseSyncedPreferences({ theme: { mode: "system", accent: a.id } })?.theme?.accent).toBe(a.id);
    }
    for (const mode of ["light", "dark", "system"]) {
      expect(parseSyncedPreferences({ theme: { mode, accent: "blue" } })?.theme?.mode).toBe(mode);
    }
  });

  it("keeps a custom range's dates, and drops a custom range that has none or is inverted", () => {
    const custom = { granularity: "monthly", rangePreset: "custom", customRange: { start: "2024-01-01T00:00:00.000Z", end: "2024-06-30T23:59:59.999Z" } };
    expect(parseSyncedPreferences({ view: custom })?.view).toEqual(custom);
    expect(parseSyncedPreferences({ view: { ...custom, customRange: null } })).toBeNull();
    expect(parseSyncedPreferences({ view: { ...custom, customRange: { start: "2024-06-30", end: "2024-01-01" } } })).toBeNull();
    expect(parseSyncedPreferences({ view: { ...custom, customRange: { start: "yesterday", end: "today" } } })).toBeNull();
  });

  it("does not carry stray dates on a preset", () => {
    const r = parseSyncedPreferences({ view: { ...view, customRange: { start: "2024-01-01", end: "2024-02-01" } } });
    expect(r?.view?.customRange).toBeNull();
  });

  it("drops a half that fails validation and keeps the other", () => {
    expect(parseSyncedPreferences({ view: { granularity: "hourly", rangePreset: "all_time" }, theme })).toEqual({ theme });
    expect(parseSyncedPreferences({ view, theme: { mode: "neon", accent: "teal" } })).toEqual({ view });
    expect(parseSyncedPreferences({ view, theme: { mode: "dark", accent: "ultraviolet" } })).toEqual({ view });
  });

  it("returns null when nothing is usable, so the dataset is skipped", () => {
    for (const bad of [null, undefined, 3, "x", [], {}, { view: 1, theme: 2 }]) {
      expect(parseSyncedPreferences(bad)).toBeNull();
    }
  });

  it("drops keys it doesn't know", () => {
    const r = parseSyncedPreferences({ view: { ...view, secret: "x" }, theme: { ...theme, secret: "y" }, extra: 1 });
    expect(r).toEqual({ view, theme });
  });
});
