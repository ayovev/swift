import { afterEach, describe, expect, it, vi } from "vitest";
import { idbClearAll, idbGet, idbSet } from "@/lib/storage/idbStore";
import { migrateLegacyExperiments } from "@/lib/storage/legacyExperiments";
import * as tagsStorage from "@/lib/storage/tagsStorage";
import { loadTags, saveTags } from "@/lib/storage/tagsStorage";
import type { ContextTag } from "@/types/tag";

afterEach(async () => {
  vi.restoreAllMocks();
  await idbClearAll();
});

const KEY = "experiments";
const legacy = [
  { id: "e1", date: "2024-05-01", label: "Started 5/3/1 cycle" },
  { id: "e2", date: "2025-01-01", endDate: "2025-03-01", baselineStart: "2024-10-01", label: "Cut back on late workouts" },
];
const asTags: ContextTag[] = [
  { id: "e1", type: "experiment", label: "Started 5/3/1 cycle", startDate: "2024-05-01", endDate: null },
  { id: "e2", type: "experiment", label: "Cut back on late workouts", startDate: "2025-01-01", endDate: "2025-03-01", baselineStart: "2024-10-01" },
];
const existing: ContextTag = { id: "t1", type: "cut", label: "Spring cut", startDate: "2026-03-01", endDate: null };

describe("migrateLegacyExperiments", () => {
  it("does nothing when there is no stored experiments list", async () => {
    expect(await migrateLegacyExperiments()).toBeUndefined();
    expect(await loadTags()).toBeUndefined();
  });

  it("moves stored experiments into the tags as experiment-type tags, then removes the old list", async () => {
    await idbSet(KEY, legacy);
    expect(await migrateLegacyExperiments()).toEqual(asTags);
    expect(await loadTags()).toEqual(asTags);
    expect(await idbGet(KEY)).toBeUndefined();
  });

  it("keeps the tags already there, in order, after the migrated ones", async () => {
    await saveTags([existing]);
    await idbSet(KEY, legacy);
    expect(await migrateLegacyExperiments()).toEqual([...asTags, existing]);
    expect(await loadTags()).toEqual([...asTags, existing]);
  });

  it("is safe to run twice: the second run finds nothing", async () => {
    await idbSet(KEY, legacy);
    await migrateLegacyExperiments();
    expect(await migrateLegacyExperiments()).toBeUndefined();
    expect(await loadTags()).toEqual(asTags);
  });

  it("lets a tag already holding an experiment's id win, so an interrupted run doesn't undo later edits", async () => {
    const edited: ContextTag = { ...asTags[0]!, label: "Renamed since" };
    await saveTags([edited]);
    await idbSet(KEY, legacy);
    const result = await migrateLegacyExperiments();
    expect(result?.find((t) => t.id === "e1")?.label).toBe("Renamed since");
    expect(result).toHaveLength(2);
  });

  it("leaves a stored list that doesn't validate untouched", async () => {
    await idbSet(KEY, [{ id: "bad", date: "not a date", label: "x" }]);
    expect(await migrateLegacyExperiments()).toBeUndefined();
    expect(await idbGet(KEY)).toEqual([{ id: "bad", date: "not a date", label: "x" }]);
    expect(await loadTags()).toBeUndefined();
  });

  it("keeps the old list, and still returns the tags for this session, when the write can't be confirmed", async () => {
    await idbSet(KEY, legacy);
    // idbSet swallows its failures, so a write that didn't land looks like success: only the read-back tells.
    vi.spyOn(tagsStorage, "saveTags").mockResolvedValue(undefined);
    expect(await migrateLegacyExperiments()).toEqual(asTags);
    expect(await idbGet(KEY)).toEqual(legacy);
    expect(await loadTags()).toBeUndefined();
  });
});
