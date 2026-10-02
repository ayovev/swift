import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MovementsTab } from "@/components/dashboard/MovementsTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import {
  buildMovementData,
  buildMovementOptions,
  memberBreakdown,
  trendFor,
  workoutsFor,
} from "@/lib/analytics/buildMovementData";
import { parseRows } from "@/lib/analytics/buildDashboardData";
import { workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const rows = [
  workoutRow({ date: "01/05/2024", title: "A", description: "5 hang power clean 10 pull-ups" }),
  workoutRow({ date: "01/20/2024", title: "B", description: "3 power clean 400m run" }),
  workoutRow({ date: "02/03/2024", title: "C", description: "50 air squats 30 sit-ups" }),
  workoutRow({ date: "02/10/2024", title: "D", description: "5 clean & jerk" }),
];
const data = buildMovementData(parseRows(rows));

describe("movements view data", () => {
  it("counts a family by every variant and a movement by itself", () => {
    expect(workoutsFor(data, { kind: "family", id: "clean" }).map((m) => m.workout.title)).toEqual(["A", "B", "D"]);
    expect(workoutsFor(data, { kind: "movement", id: "power-clean" }).map((m) => m.workout.title)).toEqual(["B"]);
    expect(workoutsFor(data, { kind: "movement", id: "clean" })).toEqual([]);
  });

  it("lists only what appears, families by use and movements A to Z", () => {
    const { families, movements } = buildMovementOptions(data);
    expect(families[0]).toMatchObject({ id: "clean", count: 3 });
    expect(families.some((f) => f.id === "snatch")).toBe(false);
    const labels = movements.map((m) => m.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(movements.find((m) => m.id === "hang-power-clean")?.count).toBe(1);
  });

  it("shares each bucket's workouts, zero-filled", () => {
    expect(trendFor(data, { kind: "family", id: "clean" })).toEqual([
      { bucket: "2024-01", value: 100 },
      { bucket: "2024-02", value: 50 },
    ]);
    expect(trendFor(data, { kind: "movement", id: "run" })).toEqual([
      { bucket: "2024-01", value: 50 },
      { bucket: "2024-02", value: 0 },
    ]);
  });

  it("breaks a family down by member, and a single movement not at all", () => {
    expect(memberBreakdown(data, { kind: "family", id: "clean" }).map((m) => [m.id, m.count])).toEqual([
      ["clean-and-jerk", 1],
      ["hang-power-clean", 1],
      ["power-clean", 1],
    ]);
    expect(memberBreakdown(data, { kind: "movement", id: "run" })).toEqual([]);
  });

  it("is part of the pipeline's output, from the same parsed rows", async () => {
    const insights = buildInsights(await loadSampleRows());
    expect(insights.movements.workouts).toHaveLength(insights.dashboard.summary.total_logged);
  });
});

describe("MovementsTab", () => {
  it("opens on the most-used family and shows the matched phrase", () => {
    render(<MovementsTab data={data} granularity="monthly" />);
    expect(screen.getByLabelText("Movement")).toHaveValue("family:clean");
    expect(screen.getByText(/workouts with clean in them/)).toBeInTheDocument();
  });

  it("switches to a single movement", () => {
    render(<MovementsTab data={data} granularity="monthly" />);
    fireEvent.change(screen.getByLabelText("Movement"), { target: { value: "movement:run" } });
    expect(screen.getByText(/workouts with run in them/)).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("says so when nothing in range was recognised", () => {
    const empty = buildMovementData(parseRows([workoutRow({ date: "01/05/2024", title: "MACROS" })]));
    render(<MovementsTab data={empty} granularity="monthly" />);
    expect(screen.getByText(/No movements were recognised/)).toBeInTheDocument();
  });
});
