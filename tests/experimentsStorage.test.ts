import { afterEach, describe, expect, it } from "vitest";
import {
  clearExperiments,
  loadExperiments,
  saveExperiments,
} from "@/lib/storage/experimentsStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import type { Experiment } from "@/types/experiment";

afterEach(async () => {
  await idbClearAll();
});

const sample: Experiment[] = [
  { id: "1", date: "2024-05-01", label: "Started 5/3/1 cycle" },
  { id: "2", date: "2024-08-15", label: "Switched to own programming" },
];

describe("experimentsStorage", () => {
  it("resolves undefined before anything has been saved", async () => {
    expect(await loadExperiments()).toBeUndefined();
  });

  it("round-trips saved experiments through save and load", async () => {
    await saveExperiments(sample);
    expect(await loadExperiments()).toEqual(sample);
  });

  it("clears saved experiments", async () => {
    await saveExperiments(sample);
    await clearExperiments();
    expect(await loadExperiments()).toBeUndefined();
  });
});
