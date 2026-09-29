import { afterEach, describe, expect, it } from "vitest";
import { idbClearAll } from "@/lib/storage/idbStore";
import { clearTags, loadTags, saveTags } from "@/lib/storage/tagsStorage";
import type { ContextTag } from "@/types/tag";

afterEach(async () => {
  await idbClearAll();
});

const sample: ContextTag[] = [
  { id: "1", type: "cut", label: "Spring cut", startDate: "2026-03-01", endDate: null },
  { id: "2", type: "injury", startDate: "2026-05-01", endDate: "2026-05-20", note: "wrist" },
];

describe("tagsStorage", () => {
  it("resolves undefined before anything has been saved", async () => {
    expect(await loadTags()).toBeUndefined();
  });
  it("round-trips, including open-ended tags", async () => {
    await saveTags(sample);
    expect(await loadTags()).toEqual(sample);
  });
  it("is cleared by clearTags and by idbClearAll (Start over)", async () => {
    await saveTags(sample);
    await clearTags();
    expect(await loadTags()).toBeUndefined();
    await saveTags(sample);
    await idbClearAll();
    expect(await loadTags()).toBeUndefined();
  });
});
