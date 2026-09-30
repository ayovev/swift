import { describe, expect, it, vi } from "vitest";
import { planReceived, type ExistingCounts, type ReceivedHandlers } from "@/lib/sync/receivedDatasets";

const none: ExistingCounts = { workout: null, bodyComp: null, experiments: null, tags: null };
const tag = { id: "t", type: "cut", label: "Spring cut", startDate: "2024-03-01", endDate: null };

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

describe("planReceived", () => {
  it("applies everything straight away when nothing local would be overwritten", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [{}], bodyComp: [{}], experiments: [{}], tags: [tag] }, none, h);
    expect(plan).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual(["workout", "bodyComp", "experiments", "tags"]);
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

  it("skips a tags payload that fails validation and says so, applying nothing from it", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ tags: [{ id: "x", type: "nap", startDate: "2024-03-01", endDate: null }] }, none, h);
    expect(plan.skipped).toEqual(["tags"]);
    expect(calls).toEqual([]);
    expect(planReceived({ tags: "nope" }, none, h).skipped).toEqual(["tags"]);
  });

  it("applies the validated tags, not the raw payload (unknown keys dropped)", () => {
    const { h } = handlers();
    planReceived({ tags: [{ ...tag, secret: "x" }] }, none, h);
    expect(h.tags).toHaveBeenCalledWith([tag]);
  });

  it("ignores anything that isn't one of the four datasets, so a preferences payload from a newer or odd peer applies nothing", () => {
    const { h, calls } = handlers();
    const plan = planReceived({ workout: [{}], preferences: { theme: { mode: "dark", accent: "teal" } } } as never, none, h);
    expect(calls).toEqual(["workout"]);
    expect(plan.skipped).toEqual([]);
  });

  it("does nothing for datasets that weren't sent", () => {
    const { h, calls } = handlers();
    expect(planReceived({}, none, h)).toEqual({ conflicts: [], skipped: [] });
    expect(calls).toEqual([]);
  });
});
