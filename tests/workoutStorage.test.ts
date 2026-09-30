import { afterEach, describe, expect, it } from "vitest";
import { idbClearAll } from "@/lib/storage/idbStore";
import {
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

  it("is wiped by idbClearAll, which is what Start over calls", async () => {
    const rows = (await loadSampleRows()).slice(0, 3);
    await saveWorkoutRows(rows);
    await idbClearAll();
    expect(await loadWorkoutRows()).toBeUndefined();
  });
});
