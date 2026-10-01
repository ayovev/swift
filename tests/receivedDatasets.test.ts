import { describe, expect, it, vi } from "vitest";
import { planReceived, type ExistingCounts, type ReceivedHandlers } from "@/lib/sync/receivedDatasets";

const none: ExistingCounts = { workout: null, bodyComp: null, tags: null };
import { scanRow, workoutRow } from "./fixtures/rows";

const wRow = workoutRow({ date: "03/05/2024", title: "FRAN" });
const bRow = scanRow("2026-04-01", { "Weight(lb)": "180" });
const exp = { id: "e", date: "2024-05-01", label: "5/3/1" };
const tag = { id: "t", type: "cut", label: "Spring cut", startDate: "2024-03-01", endDate: null };

function handlers() {
  const calls: string[] = [];
  const h: ReceivedHandlers = {
    workout: vi.fn(() => void calls.push("workout")),
    bodyComp: vi.fn(() => void calls.push("bodyComp")),
    tags: vi.fn(() => void calls.push("tags")),
  };
  return { h, calls };
}

describe("planReceived", () => {
  it("applies everything straight away when nothing local would be overwritten", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [wRow], bodyComp: [bRow], tags: [tag] }, none, h);
    expect(plan).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual(["workout", "bodyComp", "tags"]);
  });

  it("holds each existing dataset back as its own conflict, and applies nothing for it yet", () => {
    const { h, calls } = handlers();
    const plan = planReceived(
      { workout: [wRow, wRow], bodyComp: [bRow], tags: [tag] },
      { workout: 10, bodyComp: null, tags: 2 },
      h
    );
    expect(calls).toEqual(["bodyComp"]);
    expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([
      ["workout", 10, 2],
      ["tags", 2, 1],
    ]);
  });

  it("accepting one conflict applies only that dataset", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [wRow], tags: [tag] }, { ...none, workout: 1, tags: 1 }, h);
    plan.conflicts.find((c) => c.dataset === "tags")!.apply();
    expect(calls).toEqual(["tags"]);
  });

  it("skips a dataset that fails validation, says why, applies nothing from it, and still applies the good ones", () => {
    const { h, calls } = handlers();
    const plan = planReceived(
      { workout: [{ ...wRow, date: "nope" }], bodyComp: [bRow], experiments: [{ ...exp, date: "x" }], tags: [{ id: "x", type: "nap", startDate: "2024-03-01", endDate: null }] },
      none,
      h
    );
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["workout", "experiments", "tags"]);
    expect(plan.skipped[0]!.reason).toMatch(/Row 1 of the workout log has an unreadable date/);
    expect(plan.skipped[1]!.reason).toMatch(/Experiment 1 has no valid start date/);
    expect(plan.skipped[2]!.reason).toMatch(/Period 1 has an unknown type/);
    expect(calls).toEqual(["bodyComp"]);
    expect(planReceived({ tags: "nope" }, none, h).skipped.map((s) => s.dataset)).toEqual(["tags"]);
  });

  it("never turns a rejected dataset into a conflict, so declining or accepting can't overwrite with bad data", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [] }, { ...none, workout: 900 }, h);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/workout log is empty/);
    expect(calls).toEqual([]);
  });

  it("names datasets whose payload wasn't readable JSON as skipped, without validating them", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ bodyComp: [bRow] }, none, h, ["workout"]);
    expect(plan.skipped).toEqual([{ dataset: "workout", reason: "The workout log arrived damaged and couldn't be read." }]);
    expect(calls).toEqual(["bodyComp"]);
  });

  it("applies the validated tags, not the raw payload (unknown keys dropped)", () => {
    const { h } = handlers();
    planReceived({ tags: [{ ...tag, secret: "x" }] }, none, h);
    expect(h.tags).toHaveBeenCalledWith([tag]);
  });

  it("ignores anything that isn't one of the four datasets, so a preferences payload from a newer or odd peer applies nothing", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [wRow], preferences: { theme: { mode: "dark", accent: "teal" } } } as never, none, h);
    expect(calls).toEqual(["workout"]);
    expect(plan.skipped).toEqual([]);
  });

  it("does nothing for datasets that weren't sent", () => {
    const { h, calls } = handlers();
    expect(planReceived({}, none, h)).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual([]);
  });

  describe("experiments from an older device or backup", () => {
    const converted = { id: "e", type: "experiment", label: "5/3/1", startDate: "2024-05-01", endDate: null };

    it("arrive as tags: validated, converted, and applied through the tags handler", () => {
      const { h, calls } = handlers();
      const plan = planReceived({ experiments: [exp] }, none, h);
      expect(plan).toEqual({ conflicts: [], skipped: [] });
      expect(calls).toEqual(["tags"]);
      expect(h.tags).toHaveBeenCalledWith([converted]);
    });

    it("keep their end date and earlier-range start", () => {
      const { h } = handlers();
      planReceived({ experiments: [{ ...exp, endDate: "2024-07-01", baselineStart: "2024-04-01" }] }, none, h);
      expect(h.tags).toHaveBeenCalledWith([{ ...converted, endDate: "2024-07-01", baselineStart: "2024-04-01" }]);
    });

    it("join the tags that came with them as one list, so tags are offered, and counted as a conflict, once", () => {
      const { h } = handlers();
      const plan = planReceived({ experiments: [exp], tags: [tag] }, { ...none, tags: 4 }, h);
      expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([["tags", 4, 2]]);
      plan.conflicts[0]!.apply();
      expect(h.tags).toHaveBeenCalledWith([tag, converted]);
    });

    it("are skipped with their own reason when they don't validate, without touching the tags that arrived", () => {
      const { h } = handlers();
      const plan = planReceived({ experiments: [{ ...exp, label: "" }], tags: [tag] }, none, h);
      expect(plan.skipped).toEqual([{ dataset: "experiments", reason: "Experiment 1 has no label." }]);
      expect(h.tags).toHaveBeenCalledWith([tag]);
    });

    it("add nothing when the list is empty", () => {
      const { h, calls } = handlers();
      expect(planReceived({ experiments: [] }, none, h)).toEqual({ conflicts: [], skipped: [] });
      expect(calls).toEqual([]);
    });
  });
});
