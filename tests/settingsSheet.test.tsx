import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsSheet } from "@/components/dashboard/SettingsSheet";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import type { DataSource } from "@/App";

afterEach(() => {
  localStorage.removeItem("swift.theme");
});

function renderSheet(source: DataSource, onReset = vi.fn()) {
  render(
    <ThemeProvider>
      <SettingsSheet
        source={source}
        workoutRows={[]}
        onWorkoutFile={vi.fn()}
        bodyComp={{ status: "idle" }}
        onBodyCompFile={vi.fn()}
        experiments={[]}
        tags={[]}
        syncOutgoing={[]}
        onSyncedWorkoutData={vi.fn()}
        onSyncedBodyCompData={vi.fn()}
        onSyncedExperiments={vi.fn()}
        onSyncedTags={vi.fn()}
        onSyncedPreferences={vi.fn()}
        onReset={onReset}
      />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  return onReset;
}

describe("SettingsSheet", () => {
  it("groups data, devices, appearance and start over in one sheet", async () => {
    renderSheet("upload");
    await screen.findByRole("dialog", { name: "Settings" });
    for (const name of ["Your data", "Other devices", "Appearance", "Start over"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Replace workout log" })).toBeInTheDocument();
    // No InBody data loaded yet, so the same slot offers to add one.
    expect(screen.getByRole("button", { name: "Add InBody file" })).toBeInTheDocument();
  });

  it("offers sync on uploaded data", async () => {
    renderSheet("upload");
    expect(await screen.findByRole("button", { name: /send to a device/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /receive from a device/i })).toBeEnabled();
  });

  it("shows sync disabled, with the reason, on sample data", async () => {
    renderSheet("sample");
    expect(await screen.findByRole("button", { name: /send to a device/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /receive from a device/i })).toBeDisabled();
    expect(screen.getByText(/available once you've uploaded your own log/i)).toBeInTheDocument();
  });

  it("changes accent and mode from the Appearance section", async () => {
    renderSheet("upload");
    fireEvent.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Amber" }));
    expect(screen.getByRole("radio", { name: "Amber" })).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem("swift.theme")).toContain("amber");
  });

  it("resets sample data immediately, with no confirmation", async () => {
    const onReset = renderSheet("sample");
    fireEvent.click(await screen.findByRole("button", { name: /start over/i }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByText(/this can't be undone/i)).not.toBeInTheDocument();
  });
});
