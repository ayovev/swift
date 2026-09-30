import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDataset } from "@/lib/sync/chunking";
import type { SyncSessionState } from "@/lib/sync/syncSession";
import { scanRow, workoutRow } from "./fixtures/rows";

/**
 * SyncDialog's receive path, with only the WebRTC hook stubbed: the test
 * plays the part of the session by delivering datasets through the callback
 * the dialog registered, then flips the state to "done" — the order a real
 * transfer follows.
 */
const hook = vi.hoisted(() => ({
  state: { status: "idle" } as SyncSessionState,
  deliver: null as null | ((dataset: SyncDataset, json: string) => void),
}));

vi.mock("@/components/sync/useSyncSession", () => ({
  useSyncSession: (onDatasetReceived: (dataset: SyncDataset, json: string) => void) => {
    hook.deliver = onDatasetReceived;
    return { state: hook.state, startHost: vi.fn(), startJoiner: vi.fn(), submitAnswer: vi.fn(), reset: vi.fn() };
  },
}));

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", async (orig) => ({ ...(await orig<typeof import("@/lib/posthog")>()), capture: posthog.capture }));

import { SyncDialog } from "@/components/sync/SyncDialog";

const good = {
  workout: JSON.stringify([workoutRow({ date: "03/05/2024", title: "FRAN" })]),
  bodyComp: JSON.stringify([scanRow("2026-04-01", { "Weight(lb)": "180" })]),
};

function setup(existing: { workout?: number | null } = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    role: "joiner" as const,
    existingWorkoutCount: existing.workout ?? null,
    existingBodyCompCount: null,
    existingExperimentsCount: null,
    existingTagsCount: null,
    onSyncedWorkoutData: vi.fn(),
    onSyncedBodyCompData: vi.fn(),
    onSyncedExperiments: vi.fn(),
    onSyncedTags: vi.fn(),
  };
  const ui = () => <SyncDialog {...props} />;
  const utils = render(ui());
  const finish = (deliveries: Array<[SyncDataset, string]>) => {
    act(() => deliveries.forEach(([d, j]) => hook.deliver!(d, j)));
    hook.state = { status: "done" };
    utils.rerender(ui());
  };
  return { props, finish };
}

beforeEach(() => {
  hook.state = { status: "transferring", dataset: "workout", receivedBytes: 0, totalBytes: 1 };
  posthog.capture.mockClear();
});

describe("SyncDialog — receiving", () => {
  it("applies valid datasets and closes, counting a success", () => {
    const { props, finish } = setup();
    finish([["workout", good.workout], ["bodyComp", good.bodyComp]]);
    expect(props.onSyncedWorkoutData).toHaveBeenCalledTimes(1);
    expect(props.onSyncedBodyCompData).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(posthog.capture).toHaveBeenCalledWith(expect.objectContaining({ name: "sync_succeeded" }));
  });

  it("does not touch the local log when the received one fails validation, says why, and stays open", () => {
    const bad = JSON.stringify([workoutRow({ date: "not a date", title: "FRAN" })]);
    const { props, finish } = setup({ workout: 900 });
    finish([["workout", bad]]);
    expect(props.onSyncedWorkoutData).not.toHaveBeenCalled();
    expect(screen.getByText(/The workout log from the other device was rejected\. Row 1 of the workout log has an unreadable date\. Your workout log on this device is unchanged\./)).toBeInTheDocument();
    // No overwrite prompt for data that was rejected.
    expect(screen.queryByText(/Replace your workout log/)).not.toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("counts a rejected transfer as a failure with the fixed reason only, never as a success", () => {
    const { finish } = setup();
    finish([["workout", "[]"]]);
    expect(posthog.capture).toHaveBeenCalledWith({ name: "sync_failed", props: { role: "joiner", reason: "invalid_data" } });
    expect(posthog.capture).not.toHaveBeenCalledWith(expect.objectContaining({ name: "sync_succeeded" }));
  });

  it("applies the datasets that are fine even when another is rejected", () => {
    const { props, finish } = setup();
    finish([["workout", "[]"], ["bodyComp", good.bodyComp]]);
    expect(props.onSyncedBodyCompData).toHaveBeenCalledTimes(1);
    expect(props.onSyncedWorkoutData).not.toHaveBeenCalled();
  });

  it("survives a payload that isn't valid JSON, and reports it as damaged", () => {
    const { props, finish } = setup();
    expect(() => finish([["workout", "{not json"]])).not.toThrow();
    expect(props.onSyncedWorkoutData).not.toHaveBeenCalled();
    expect(screen.getByText(/The workout log arrived damaged and couldn't be read\./)).toBeInTheDocument();
  });

  it("closes from the notice", () => {
    const { props, finish } = setup();
    finish([["workout", "[]"]]);
    // The dialog has its own X button also named "Close"; use the notice's.
    const notice = screen.getByText(/The workout log from the other device was rejected/).parentElement!;
    fireEvent.click(within(notice).getByRole("button", { name: "Close" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("still asks before replacing existing data with valid data", () => {
    const { props, finish } = setup({ workout: 5 });
    finish([["workout", good.workout]]);
    expect(props.onSyncedWorkoutData).not.toHaveBeenCalled();
    expect(screen.getByText(/Replace your workout log\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(props.onSyncedWorkoutData).toHaveBeenCalledTimes(1);
  });
});
