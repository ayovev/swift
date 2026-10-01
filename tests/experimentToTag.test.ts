import { describe, expect, it } from "vitest";
import { experimentToTag } from "@/lib/analytics/experimentToTag";
import type { Experiment } from "@/types/experiment";

const open: Experiment = { id: "a", date: "2024-05-01", label: "Started 5/3/1" };
const closed: Experiment = { id: "b", date: "2024-05-01", endDate: "2024-07-01", baselineStart: "2024-04-01", label: "Cut back" };

describe("experimentToTag", () => {
  it("turns an open-ended experiment into a period of type experiment", () => {
    expect(experimentToTag(open)).toEqual({ id: "a", type: "experiment", label: "Started 5/3/1", startDate: "2024-05-01", endDate: null });
  });

  it("keeps the end date and the earlier-range start", () => {
    expect(experimentToTag(closed)).toEqual({
      id: "b",
      type: "experiment",
      label: "Cut back",
      startDate: "2024-05-01",
      endDate: "2024-07-01",
      baselineStart: "2024-04-01",
    });
  });
});
