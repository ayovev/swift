import { describe, expect, it, vi } from "vitest";
import { planTransfer } from "@/lib/sync/planTransfer";
import type { ExistingCounts, ReceivedHandlers } from "@/lib/sync/receivedDatasets";
import { scanRow, workoutRow } from "./fixtures/rows";

const none: ExistingCounts = { workout: null, bodyComp: null, timeline: null, weighIns: null };
const datasets = {
  workout: [workoutRow({ date: "03/05/2024", title: "FRAN" })],
  bodyComp: [scanRow("2026-04-01")],
  timeline: [{ id: "t", initiation: "changed", area: "nutrition", name: "Cut", startDate: "2024-03-01", endDate: null }],
};

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

describe("planTransfer", () => {
  it("writes nothing until flush, then applies the workout log last", () => {
    const { h, calls } = handlers();
    const plan = planTransfer(datasets, none, h);
    expect(calls).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    plan.flush();
    expect(calls).toEqual(["timeline", "bodyComp", "workout"]);
  });

  it("lists every dataset that would overwrite local data, with both counts", () => {
    const { h, calls } = handlers();
    const plan = planTransfer(datasets, { workout: 10, bodyComp: null, timeline: 2, weighIns: null }, h);
    expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([
      ["workout", 10, 1],
      ["timeline", 2, 1],
    ]);
    plan.flush();
    expect(calls).toEqual(["bodyComp"]);
  });

  it("applies a conflicting dataset only once its apply has run, still with the workout log last", () => {
    const { h, calls } = handlers();
    const plan = planTransfer(datasets, { workout: 10, bodyComp: 5, timeline: null, weighIns: null }, h);
    for (const conflict of plan.conflicts) conflict.apply();
    plan.flush();
    expect(calls).toEqual(["timeline", "bodyComp", "workout"]);
  });

  it("declining leaves the conflicting datasets alone", () => {
    const { h, calls } = handlers();
    planTransfer({ workout: datasets.workout }, { ...none, workout: 10 }, h);
    expect(calls).toEqual([]);
  });

  it("reports an unreadable dataset as skipped so the caller can refuse the whole transfer", () => {
    const { h } = handlers();
    const plan = planTransfer({ workout: datasets.workout }, none, h, ["timeline"]);
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["timeline"]);
  });

  it("reports an invalid dataset with a reason; the rest stay queued for the caller to drop", () => {
    const { h, calls } = handlers();
    const plan = planTransfer({ ...datasets, timeline: [{ nope: true }] }, none, h);
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["timeline"]);
    expect(calls).toEqual([]);
  });
});
