import { afterEach, describe, expect, it } from "vitest";
import { idbClearAll } from "@/lib/storage/idbStore";
import {
  clearWorkoutRows,
  loadWorkoutRows,
  saveWorkoutRows,
} from "@/lib/storage/workoutStorage";
import { loadSampleRows } from "./fixtures/sampleRows";

afterEach(async () => {
  await idbClearAll();
});

describe("workoutStorage", () => {
  it("resolves undefined before anything has been saved", async () => {
    expect(await loadWorkoutRows()).toBeUndefined();
  });

  it("round-trips real parsed rows through save and load", async () => {
    const rows = (await loadSampleRows()).slice(0, 3);
    await saveWorkoutRows(rows);
    expect(await loadWorkoutRows()).toEqual(rows);
  });

  it("clears saved rows", async () => {
    const rows = (await loadSampleRows()).slice(0, 3);
    await saveWorkoutRows(rows);
    await clearWorkoutRows();
    expect(await loadWorkoutRows()).toBeUndefined();
  });
});
