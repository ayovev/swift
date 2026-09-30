import { afterEach, describe, expect, it } from "vitest";
import {
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
  { id: "2", date: "2024-08-15", endDate: "2024-11-01", label: "Switched to own programming" },
];

describe("experimentsStorage", () => {
  it("resolves undefined before anything has been saved", async () => {
    expect(await loadExperiments()).toBeUndefined();
  });

  it("round-trips saved experiments through save and load", async () => {
    await saveExperiments(sample);
    expect(await loadExperiments()).toEqual(sample);
  });

  it("is wiped by idbClearAll, which is what Start over calls", async () => {
    await saveExperiments(sample);
    await idbClearAll();
    expect(await loadExperiments()).toBeUndefined();
  });
});
