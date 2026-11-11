import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/** Only the WebRTC hook is stubbed (jsdom has none); the dialog, its chunk and the entry point are the real ones. */
vi.mock("@/components/sync/useSyncSession", () => ({
  useSyncSession: () => ({ state: { status: "idle" }, startHost: vi.fn(), startJoiner: vi.fn(), submitAnswer: vi.fn(), reset: vi.fn() }),
}));

import { SyncEntryPoint } from "@/components/sync/SyncEntryPoint";

const props = {
  role: "joiner" as const,
  existingWorkoutCount: null,
  existingBodyCompCount: null,
  existingTimelineCount: null,
  existingWeighInsCount: null,
  onSyncedWorkoutData: vi.fn(),
  onSyncedBodyCompData: vi.fn(),
  onSyncedTimeline: vi.fn(),
  onSyncedWeighIns: vi.fn(),
};

describe("SyncEntryPoint", () => {
  it("does not mount the pairing wizard until the button is pressed", async () => {
    render(<SyncEntryPoint {...props}>Sync from another device</SyncEntryPoint>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sync from another device" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("waits on the button, not behind a fallback, while the wizard's code arrives", async () => {
    render(<SyncEntryPoint {...props}>Send to a device</SyncEntryPoint>);
    const button = screen.getByRole("button", { name: "Send to a device" });
    fireEvent.click(button);
    // Pressed once: the button is marked busy and cannot be pressed twice while the chunk loads.
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    await screen.findByRole("dialog");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toBeEnabled();
  });
});
