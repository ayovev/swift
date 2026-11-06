import { describe, expect, it, vi } from "vitest";
import { planReceived, type ExistingCounts, type ReceivedHandlers } from "@/lib/sync/receivedDatasets";

const none: ExistingCounts = { workout: null, bodyComp: null, timeline: null, weighIns: null };
import { scanRow, workoutRow } from "./fixtures/rows";

const wRow = workoutRow({ date: "03/05/2024", title: "FRAN" });
const bRow = scanRow("2026-04-01", { "Weight(lb)": "180" });
const exp = { id: "e", date: "2024-05-01", label: "5/3/1" };
const entry = { id: "t", initiation: "changed", area: "nutrition", name: "Spring cut", startDate: "2024-03-01", endDate: null };
// The older shape of the same entry: a period (a context tag) of type cut.
const period = { id: "t", type: "cut", label: "Spring cut", startDate: "2024-03-01", endDate: null };

function handlers() {
  const calls: string[] = [];
  const h: ReceivedHandlers = {
    workout: vi.fn(() => void calls.push("workout")),
    bodyComp: vi.fn(() => void calls.push("bodyComp")),
    timeline: vi.fn(() => void calls.push("timeline")),
    weighIns: vi.fn(() => void calls.push("weighIns")),
  };
  return { h, calls };
}

describe("planReceived", () => {
  it("applies everything straight away when nothing local would be overwritten", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [wRow], bodyComp: [bRow], timeline: [entry] }, none, h);
    expect(plan).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual(["workout", "bodyComp", "timeline"]);
  });

  it("holds each existing dataset back as its own conflict, and applies nothing for it yet", () => {
    const { h, calls } = handlers();
    const plan = planReceived(
      { workout: [wRow, wRow], bodyComp: [bRow], timeline: [entry] },
      { workout: 10, bodyComp: null, timeline: 2, weighIns: null },
      h
    );
    expect(calls).toEqual(["bodyComp"]);
    expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([
      ["workout", 10, 2],
      ["timeline", 2, 1],
    ]);
  });

  it("accepting one conflict applies only that dataset", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [wRow], timeline: [entry] }, { ...none, workout: 1, timeline: 1 }, h);
    plan.conflicts.find((c) => c.dataset === "timeline")!.apply();
    expect(calls).toEqual(["timeline"]);
  });

  it("skips a dataset that fails validation, says why, applies nothing from it, and still applies the good ones", () => {
    const { h, calls } = handlers();
    const plan = planReceived(
      { workout: [{ ...wRow, date: "nope" }], bodyComp: [bRow], experiments: [{ ...exp, date: "x" }], tags: [{ id: "x", type: "nap", startDate: "2024-03-01", endDate: null }], timeline: [{ id: "y", initiation: "nope" }] },
      none,
      h
    );
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["workout", "experiments", "tags", "timeline"]);
    expect(plan.skipped[0]!.reason).toMatch(/Row 1 of the workout log has an unreadable date/);
    expect(plan.skipped[1]!.reason).toMatch(/Experiment 1 has no valid start date/);
    expect(plan.skipped[2]!.reason).toMatch(/Period 1 has an unknown type/);
    expect(plan.skipped[3]!.reason).toMatch(/Entry 1 has an unknown kind/);
    expect(calls).toEqual(["bodyComp"]);
    expect(planReceived({ timeline: "nope" }, none, h).skipped.map((s) => s.dataset)).toEqual(["timeline"]);
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

  it("applies the validated entries, not the raw payload (unknown keys dropped, a stored baselineStart ignored)", () => {
    const { h } = handlers();
    planReceived({ timeline: [{ ...entry, secret: "x", baselineStart: "2024-01-01" }] }, none, h);
    expect(h.timeline).toHaveBeenCalledWith([entry]);
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

  describe("experiments and periods from an older device or backup", () => {
    const converted = { id: "e", initiation: "changed", area: "other", name: "5/3/1", startDate: "2024-05-01", endDate: null };

    it("experiments arrive as entries: validated, converted, and applied through the timeline handler", () => {
      const { h, calls } = handlers();
      const plan = planReceived({ experiments: [exp] }, none, h);
      expect(plan).toEqual({ conflicts: [], skipped: [] });
      expect(calls).toEqual(["timeline"]);
      expect(h.timeline).toHaveBeenCalledWith([converted]);
    });

    it("periods arrive as entries by the old types' mapping", () => {
      const { h } = handlers();
      planReceived({ tags: [period, { id: "i", type: "injury", startDate: "2024-06-01", endDate: "2024-06-10" }] }, none, h);
      expect(h.timeline).toHaveBeenCalledWith([
        entry,
        { id: "i", initiation: "happened", area: "health", name: "Injury", startDate: "2024-06-01", endDate: "2024-06-10" },
      ]);
    });

    it("an experiment keeps its end date and drops the earlier-range start", () => {
      const { h } = handlers();
      planReceived({ experiments: [{ ...exp, endDate: "2024-07-01", baselineStart: "2024-04-01" }] }, none, h);
      expect(h.timeline).toHaveBeenCalledWith([{ ...converted, endDate: "2024-07-01" }]);
    });

    it("join the timeline that came with them as one list, so it is offered, and counted as a conflict, once", () => {
      const { h } = handlers();
      const plan = planReceived({ experiments: [exp], timeline: [entry] }, { ...none, timeline: 4 }, h);
      expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([["timeline", 4, 2]]);
      plan.conflicts[0]!.apply();
      expect(h.timeline).toHaveBeenCalledWith([converted, entry]);
    });

    it("are skipped with their own reason when they don't validate, without touching the entries that arrived", () => {
      const { h } = handlers();
      const plan = planReceived({ experiments: [{ ...exp, label: "" }], timeline: [entry] }, none, h);
      expect(plan.skipped).toEqual([{ dataset: "experiments", reason: "Experiment 1 has no label." }]);
      expect(h.timeline).toHaveBeenCalledWith([entry]);
    });

    it("add nothing when the list is empty", () => {
      const { h, calls } = handlers();
      expect(planReceived({ experiments: [] }, none, h)).toEqual({ conflicts: [], skipped: [] });
      expect(calls).toEqual([]);
    });
  });
});
