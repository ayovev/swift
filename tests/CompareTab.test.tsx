import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompareTab } from "@/components/dashboard/CompareTab";
import { liftRow, scanRow } from "./fixtures/rows";

const md = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const workouts = [
  liftRow(md("2026-01-05"), "Back Squat", 200),
  liftRow(md("2026-01-20"), "Back Squat", 210),
  liftRow(md("2026-02-05"), "Back Squat", 220),
  liftRow(md("2026-02-20"), "Back Squat", 230),
];
const scans = [
  scanRow("2026-01-10", { "Weight(lb)": "180", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "25", "Percent Body Fat(%)": "14" }),
  scanRow("2026-02-10", { "Weight(lb)": "181", "Soft Lean Mass(lb)": "142", "Body Fat Mass(lb)": "24", "Percent Body Fat(%)": "13.3" }),
];
const B = { start: "2026-02-01", end: "2026-02-28" };

describe("CompareTab", () => {
  it("compares window B with the equal-length window before it and shows both tables", () => {
    render(<CompareTab workouts={workouts} scans={scans} tags={[]} initialWindowB={B} onSaveAsExperiment={vi.fn()} />);
    expect(screen.getByText(/Jan 4, 2026 – Jan 31, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Back Squat (RX)")).toBeInTheDocument();
    expect(screen.getByText("Better", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Lean mass")).toBeInTheDocument();
    // +2 lb lean is inside the default 3 lb band with only two scans.
    expect(screen.getAllByText(/within normal scan variation/).length).toBeGreaterThan(0);
  });

  it("lists subjects without enough entries collapsed, with the reason and no numbers", () => {
    const rows = [...workouts, liftRow(md("2026-01-06"), "Deadlift", 300), liftRow(md("2026-02-06"), "Deadlift", 320)];
    render(<CompareTab workouts={rows} scans={scans} tags={[]} initialWindowB={B} onSaveAsExperiment={vi.fn()} />);
    expect(screen.queryByText(/window A needs 1 more logged entry/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Not enough entries to compare \(1\)/));
    expect(screen.getByText(/Deadlift \(RX\)/)).toBeInTheDocument();
    expect(screen.getByText(/window A needs 1 more logged entry \(has 1, needs 2\)/)).toBeInTheDocument();
  });

  it("states why, and shows no numbers, when there is nothing to compare", () => {
    render(<CompareTab workouts={[]} scans={[]} tags={[]} initialWindowB={B} onSaveAsExperiment={vi.fn()} />);
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByText(/Nothing to compare: no lift or benchmark was logged in either window/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("re-runs when the dates are edited by keyboard", () => {
    render(<CompareTab workouts={workouts} scans={scans} tags={[]} initialWindowB={B} onSaveAsExperiment={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Range starts"), { target: { value: "2026-02-10" } });
    // Window B now holds one squat entry, and the shifted window A has none of the scans:
    // below the two-entry minimum, so nothing is left to compare.
    expect(screen.getByText(/no lift or benchmark has 2 logged entries in both windows/)).toBeInTheDocument();
  });

  it("lets the earlier range be edited", () => {
    render(<CompareTab workouts={workouts} scans={scans} tags={[]} initialWindowB={B} onSaveAsExperiment={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose the earlier range" }));
    expect(screen.getByLabelText("Earlier range starts")).toHaveValue("2026-01-04");
    fireEvent.change(screen.getByLabelText("Earlier range starts"), { target: { value: "2026-01-10" } });
    expect(screen.getByText(/Jan 10, 2026 – Jan 31, 2026/)).toBeInTheDocument();
  });

  it("saves window B as an experiment with its start and end, and says how that differs", () => {
    const save = vi.fn();
    render(<CompareTab workouts={workouts} scans={scans} tags={[]} initialWindowB={B} onSaveAsExperiment={save} />);
    expect(screen.getByText(/compares its days against everything logged before its start date/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New program" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as experiment" }));
    expect(save).toHaveBeenCalledWith("New program", "2026-02-01", "2026-02-28");
    expect(screen.getByRole("button", { name: "Saved as experiment" })).toBeDisabled();
  });

  it("names an overlapping tag in the caveats", () => {
    const tags = [{ id: "t", type: "travel" as const, label: "Lisbon", startDate: "2026-02-10", endDate: "2026-02-14" }];
    render(<CompareTab workouts={workouts} scans={scans} tags={tags} initialWindowB={B} onSaveAsExperiment={vi.fn()} />);
    expect(screen.getByText(/Window B overlaps "Lisbon"/)).toBeInTheDocument();
  });
});
