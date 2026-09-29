import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { CyclesTab } from "@/components/dashboard/CyclesTab";
import type { ContextTag } from "@/types/tag";
import { liftRow, scanRow } from "./fixtures/rows";

const day = (n: number) => dayjs("2026-03-01").add(n, "day").format("YYYY-MM-DD");
const md = (iso: string) => dayjs(iso).format("MM/DD/YYYY");
const workouts = [200, 205, 212, 218, 224, 230].map((v, i) => liftRow(md(day(i * 7)), "Back Squat", v));
const scans = [
  scanRow(day(1), { "Weight(lb)": "190", "Soft Lean Mass(lb)": "140", "Body Fat Mass(lb)": "30" }),
  scanRow(day(20), { "Weight(lb)": "187", "Soft Lean Mass(lb)": "140.2", "Body Fat Mass(lb)": "27" }),
  scanRow(day(40), { "Weight(lb)": "184", "Soft Lean Mass(lb)": "140.5", "Body Fat Mass(lb)": "24" }),
];
const cut: ContextTag = { id: "c", type: "cut", label: "Spring cut", startDate: day(0), endDate: day(42) };

describe("CyclesTab", () => {
  it("points to the Tags view when there are no blocks", () => {
    render(<CyclesTab workouts={workouts} scans={scans} tags={[]} />);
    expect(screen.getByText(/No blocks yet/)).toBeInTheDocument();
  });

  it("shows a report per block tag: summary, focus lifts and a lift table", () => {
    render(<CyclesTab workouts={workouts} scans={scans} tags={[cut]} />);
    expect(screen.getByText("Spring cut", { selector: "[data-slot=card-title]" })).toBeInTheDocument();
    expect(screen.getByText(/Focus: Back Squat/)).toBeInTheDocument();
    expect(screen.getByText(/Back Squat estimated 1RM rose 15% \(200 to 230\)/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });

  it("ignores injury and travel tags as blocks", () => {
    render(<CyclesTab workouts={workouts} scans={scans} tags={[{ ...cut, type: "injury" }]} />);
    expect(screen.getByText(/No blocks yet/)).toBeInTheDocument();
  });

  it("reports a typed range, and states why a too-short one has nothing", () => {
    render(<CyclesTab workouts={workouts} scans={scans} tags={[]} />);
    fireEvent.change(screen.getByLabelText("Range starts"), { target: { value: day(0) } });
    fireEvent.change(screen.getByLabelText("Range ends"), { target: { value: day(5) } });
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByText(/needs 8 more days in this cycle \(has 6, needs 14\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Range ends"), { target: { value: day(42) } });
    expect(screen.getByText(/Custom range, /)).toBeInTheDocument();
  });
});
