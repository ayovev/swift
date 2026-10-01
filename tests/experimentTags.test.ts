import { describe, expect, it } from "vitest";
import { experimentToTag, hasVerdict, mergeTagsById, tagToExperiment } from "@/lib/analytics/experimentTags";
import type { Experiment } from "@/types/experiment";
import type { ContextTag } from "@/types/tag";

const open: Experiment = { id: "a", date: "2024-05-01", label: "Started 5/3/1" };
const closed: Experiment = { id: "b", date: "2024-05-01", endDate: "2024-07-01", baselineStart: "2024-04-01", label: "Cut back" };

describe("experimentToTag / tagToExperiment", () => {
  it("round-trips an open-ended experiment without gaining or losing a field", () => {
    expect(experimentToTag(open)).toEqual({ id: "a", type: "experiment", label: "Started 5/3/1", startDate: "2024-05-01", endDate: null });
    expect(tagToExperiment(experimentToTag(open))).toEqual(open);
  });

  it("round-trips an ended experiment with an earlier-range start", () => {
    expect(experimentToTag(closed)).toEqual({
      id: "b",
      type: "experiment",
      label: "Cut back",
      startDate: "2024-05-01",
      endDate: "2024-07-01",
      baselineStart: "2024-04-01",
    });
    expect(tagToExperiment(experimentToTag(closed))).toEqual(closed);
  });

  it("names an unlabelled tag by its type, as every other view does", () => {
    const tag: ContextTag = { id: "c", type: "experiment", startDate: "2024-05-01", endDate: null };
    expect(tagToExperiment(tag).label).toBe("experiment");
  });

  it("gives a verdict to everything in something you changed, and to nothing that happened", () => {
    const at = (type: ContextTag["type"]): ContextTag => ({ id: "x", type, startDate: "2024-05-01", endDate: null });
    for (const type of ["experiment", "nutrition", "cut", "bulk", "maintain", "programming", "cycle", "deload", "recovery", "other"] as const) {
      expect(hasVerdict(at(type))).toBe(true);
    }
    for (const type of ["injury", "travel"] as const) expect(hasVerdict(at(type))).toBe(false);
  });
});

describe("mergeTagsById", () => {
  const t = (id: string, label: string): ContextTag => ({ id, type: "other", label, startDate: "2024-01-01", endDate: null });

  it("keeps existing tags in order and appends the incoming ones", () => {
    expect(mergeTagsById([t("1", "a"), t("2", "b")], [t("3", "c")]).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("lets the incoming tag win on a shared id", () => {
    const merged = mergeTagsById([t("1", "old"), t("2", "b")], [t("1", "new")]);
    expect(merged.map((x) => x.label)).toEqual(["b", "new"]);
  });
});
