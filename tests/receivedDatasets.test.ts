import { describe, expect, it, vi } from "vitest";
import { planReceived, type ExistingCounts, type ReceivedHandlers } from "@/lib/sync/receivedDatasets";

const none: ExistingCounts = { workout: null, bodyComp: null, timeline: null, weighIns: null };
import { scanRow, workoutRow } from "./fixtures/rows";

const wRow = workoutRow({ date: "03/05/2024", title: "FRAN" });
const bRow = scanRow("2026-04-01", { "Weight(lb)": "180" });
const entry = { id: "t", initiation: "changed", area: "nutrition", name: "Spring cut", startDate: "2024-03-01", endDate: null };

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
      { workout: [{ ...wRow, date: "nope" }], bodyComp: [bRow], timeline: [{ id: "y", initiation: "nope" }] },
      none,
      h
    );
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["workout", "timeline"]);
    expect(plan.skipped[0]!.reason).toMatch(/Row 1 of the workout log has an unreadable date/);
    expect(plan.skipped[1]!.reason).toMatch(/Entry 1 has an unknown kind/);
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
});
