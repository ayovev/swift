import { describe, expect, it, vi } from "vitest";
import { planTransfer } from "@/lib/sync/planTransfer";
import type { ExistingCounts, ReceivedHandlers } from "@/lib/sync/receivedDatasets";
import { scanRow, workoutRow } from "./fixtures/rows";

const none: ExistingCounts = { workout: null, bodyComp: null, experiments: null, tags: null };
const datasets = {
  workout: [workoutRow({ date: "03/05/2024", title: "FRAN" })],
  bodyComp: [scanRow("2026-04-01")],
  experiments: [{ id: "e", date: "2024-05-01", label: "5/3/1" }],
  tags: [{ id: "t", type: "cut", label: "Cut", startDate: "2024-03-01", endDate: null }],
};

function handlers() {
  const calls: string[] = [];
  const h: ReceivedHandlers = {
    workout: vi.fn(() => void calls.push("workout")),
    bodyComp: vi.fn(() => void calls.push("bodyComp")),
    experiments: vi.fn(() => void calls.push("experiments")),
    tags: vi.fn(() => void calls.push("tags")),
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
    expect(calls).toEqual(["tags", "experiments", "bodyComp", "workout"]);
  });

  it("lists every dataset that would overwrite local data, with both counts", () => {
    const { h, calls } = handlers();
    const plan = planTransfer(datasets, { workout: 10, bodyComp: null, experiments: 2, tags: null }, h);
    expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([
      ["workout", 10, 1],
      ["experiments", 2, 1],
    ]);
    plan.flush();
    expect(calls).toEqual(["tags", "bodyComp"]);
  });

  it("applies a conflicting dataset only once its apply has run, still with the workout log last", () => {
    const { h, calls } = handlers();
    const plan = planTransfer(datasets, { workout: 10, bodyComp: 5, experiments: null, tags: null }, h);
    for (const conflict of plan.conflicts) conflict.apply();
    plan.flush();
    expect(calls).toEqual(["tags", "experiments", "bodyComp", "workout"]);
  });

  it("declining leaves the conflicting datasets alone", () => {
    const { h, calls } = handlers();
    planTransfer({ workout: datasets.workout }, { ...none, workout: 10 }, h);
    expect(calls).toEqual([]);
  });

  it("reports an unreadable dataset as skipped so the caller can refuse the whole transfer", () => {
    const { h } = handlers();
    const plan = planTransfer({ workout: datasets.workout }, none, h, ["tags"]);
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["tags"]);
  });

  it("reports an invalid dataset with a reason; the rest stay queued for the caller to drop", () => {
    const { h, calls } = handlers();
    const plan = planTransfer({ ...datasets, tags: [{ nope: true }] }, none, h);
    expect(plan.skipped.map((s) => s.dataset)).toEqual(["tags"]);
    expect(calls).toEqual([]);
  });
});
