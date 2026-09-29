import { describe, expect, it, vi } from "vitest";
import { planReceived, type ExistingCounts, type ReceivedHandlers } from "@/lib/sync/receivedDatasets";

const none: ExistingCounts = { workout: null, bodyComp: null, experiments: null, tags: null };
const tag = { id: "t", type: "cut", label: "Spring cut", startDate: "2024-03-01", endDate: null };
const prefs = { view: { granularity: "weekly", rangePreset: "all_time", customRange: null }, theme: { mode: "dark", accent: "teal" } };

function handlers() {
  const calls: string[] = [];
  const h: ReceivedHandlers = {
    workout: vi.fn(() => void calls.push("workout")),
    bodyComp: vi.fn(() => void calls.push("bodyComp")),
    experiments: vi.fn(() => void calls.push("experiments")),
    tags: vi.fn(() => void calls.push("tags")),
    preferences: vi.fn(() => void calls.push("preferences")),
  };
  return { h, calls };
}

describe("planReceived", () => {
  it("applies everything straight away when nothing local would be overwritten", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [{}], bodyComp: [{}], experiments: [{}], tags: [tag], preferences: prefs }, none, h);
    expect(plan).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual(["workout", "preferences", "bodyComp", "experiments", "tags"]);
  });

  it("applies preferences straight after the workout log, never before it", () => {
    const { h, calls } = handlers();
    planReceived({ preferences: prefs, workout: [{}] }, none, h);
    expect(calls).toEqual(["workout", "preferences"]);
  });

  it("holds each existing dataset back as its own conflict, and applies nothing for it yet", () => {
    const { h, calls } = handlers();
    const plan = planReceived(
      { workout: [{}, {}], bodyComp: [{}], experiments: [{}], tags: [tag] },
      { workout: 10, bodyComp: null, experiments: 3, tags: 2 },
      h
    );
    expect(calls).toEqual(["bodyComp"]);
    expect(plan.conflicts.map((c) => [c.dataset, c.existingCount, c.incomingCount])).toEqual([
      ["workout", 10, 2],
      ["experiments", 3, 1],
      ["tags", 2, 1],
    ]);
  });

  it("accepting one conflict applies only that dataset", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ experiments: [{}], tags: [tag] }, { ...none, experiments: 1, tags: 1 }, h);
    plan.conflicts.find((c) => c.dataset === "tags")!.apply();
    expect(calls).toEqual(["tags"]);
  });

  it("applies preferences with the workout log when its overwrite is accepted, and not before or otherwise", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [{}], preferences: prefs }, { ...none, workout: 5 }, h);
    expect(calls).toEqual([]);
    plan.conflicts[0]!.apply();
    expect(calls).toEqual(["workout", "preferences"]);
  });

  it("applies preferences immediately when the transfer has no workout log", () => {
    const { h, calls } = handlers();
    planReceived({ preferences: prefs }, none, h);
    expect(calls).toEqual(["preferences"]);
  });

  it("skips a tags payload that fails validation and says so, applying nothing from it", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ tags: [{ id: "x", type: "nap", startDate: "2024-03-01", endDate: null }] }, none, h);
    expect(plan.skipped).toEqual(["tags"]);
    expect(calls).toEqual([]);
    expect(planReceived({ tags: "nope" }, none, h).skipped).toEqual(["tags"]);
  });

  it("skips a preferences payload with nothing usable in it", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [{}], preferences: { view: { granularity: "hourly" } } }, none, h);
    expect(plan.skipped).toEqual(["preferences"]);
    expect(calls).toEqual(["workout"]);
  });

  it("applies the validated tags, not the raw payload (unknown keys dropped)", () => {
    const { h } = handlers();
    planReceived({ tags: [{ ...tag, secret: "x" }] }, none, h);
    expect(h.tags).toHaveBeenCalledWith([tag]);
  });

  it("does nothing for datasets that weren't sent", () => {
    const { h, calls } = handlers();
    expect(planReceived({}, none, h)).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual([]);
  });
});
