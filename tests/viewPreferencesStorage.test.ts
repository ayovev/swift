import { afterEach, describe, expect, it } from "vitest";
import { idbClearAll } from "@/lib/storage/idbStore";
import {
  clearViewPreferences,
  loadViewPreferences,
  saveViewPreferences,
  type StoredViewPreferences,
} from "@/lib/storage/viewPreferencesStorage";

afterEach(async () => {
  await idbClearAll();
});

describe("viewPreferencesStorage", () => {
  it("resolves undefined before anything has been saved", async () => {
    expect(await loadViewPreferences()).toBeUndefined();
  });

  it("round-trips a preset selection", async () => {
    const prefs: StoredViewPreferences = {
      granularity: "weekly",
      rangePreset: "last_3_months",
      customRange: null,
    };
    await saveViewPreferences(prefs);
    expect(await loadViewPreferences()).toEqual(prefs);
  });

  it("round-trips a custom range as day strings", async () => {
    const prefs: StoredViewPreferences = {
      granularity: "daily",
      rangePreset: "custom",
      customRange: { start: "2024-01-01T00:00:00.000Z", end: "2024-02-01T23:59:59.999Z" },
    };
    await saveViewPreferences(prefs);
    expect(await loadViewPreferences()).toEqual(prefs);
  });

  it("clears saved preferences", async () => {
    await saveViewPreferences({ granularity: "yearly", rangePreset: "all_time", customRange: null });
    await clearViewPreferences();
    expect(await loadViewPreferences()).toBeUndefined();
  });
});
