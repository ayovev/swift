import { describe, expect, it } from "vitest";
import { classifyModality, findMovements, findRowMovements } from "@/lib/classify/classifyModality";
import { buildMovementData, implementBreakdown, selectionLabel, trendFor, workoutsFor } from "@/lib/analytics/buildMovementData";
import { parseRows } from "@/lib/analytics/buildDashboardData";
import { fireEvent, render, screen } from "@testing-library/react";
import { MovementsTab } from "@/components/dashboard/MovementsTab";
import { workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const implementOf = (text: string, id: string) => findMovements(text).find((m) => m.id === id)?.implement;

describe("implement, read from the words before a movement", () => {
  it.each([
    ["15 db snatches (20/35 lb)", "snatch", "dumbbell"],
    ["15 dumbbell snatches", "snatch", "dumbbell"],
    ["20 alternating db snatches", "snatch", "dumbbell"],
    ["single-db push jerks", "push-jerk", "dumbbell"],
    ["two dbs push press", "push-press", "dumbbell"],
    ["12 kb sumo deadlift high pulls", "sumo-deadlift-high-pull", "kettlebell"],
    ["10 kettlebell goblet squats", "goblet-squat", "kettlebell"],
    ["10 barbell lunges", "lunge", "barbell"],
  ] as const)("%s", (text, id, implement) => {
    expect(implementOf(text, id)).toBe(implement);
  });

  it("is absent when the workout does not say", () => {
    expect(implementOf("15 snatches", "snatch")).toBeUndefined();
    expect(findMovements("5 back squats")[0]).not.toHaveProperty("implement");
  });

  it("belongs to the movement right after it, not to a later line", () => {
    // The pull-ups are on another line: a digit sits between them and the db.
    expect(implementOf("15 db snatches 10 pull-ups", "pull-ups")).toBeUndefined();
    expect(implementOf("db snatches (20/35 lb) 21 pull-ups", "pull-ups")).toBeUndefined();
  });

  it("is not carried onto a movement that comes after another one", () => {
    // Glued lines: the implement is the squat's, and bar-facing burpees are not dumbbell burpees.
    expect(implementOf("dumbbell squatsbar-facing burpees", "squat")).toBe("dumbbell");
    expect(implementOf("dumbbell squatsbar-facing burpees", "burpees")).toBeUndefined();
  });

  it("ignores an implement used as a modifier of something else", () => {
    expect(implementOf("db-facing burpees", "burpees")).toBeUndefined();
  });

  it("does not match inside other words", () => {
    expect(implementOf("kbar snatch", "snatch")).toBeUndefined();
    expect(implementOf("adb snatch", "snatch")).toBeUndefined();
  });

  it("comes from the movement when it is defined by its implement", () => {
    expect(implementOf("20 swings", "kettlebell-swing")).toBe("kettlebell");
    expect(implementOf("10 dumbbell rows", "dumbbell-row")).toBe("dumbbell");
    // What is written outranks the default for the bare word.
    expect(implementOf("20 db swings", "kettlebell-swing")).toBe("dumbbell");
  });

  it("is barbell for a lift SugarWOD types in its barbell_lift field", () => {
    const hits = findRowMovements({ title: "Strength", description: "5x5", barbell_lift: "Back Squat" });
    expect(hits[0]).toMatchObject({ id: "back-squat", source: "barbell_lift", implement: "barbell" });
  });

  it("never adds a movement or moves a split: it only labels one that was found", () => {
    expect(findMovements("15 db snatches").map((m) => m.id)).toEqual(["snatch"]);
    expect(classifyModality("db snatches").split).toEqual(classifyModality("snatches").split);
  });

  it("labels a measured share of the sample export", async () => {
    // Text hits only: typed lifts are all barbell and are not counted here. Measured, so a
    // change to the lexicon or to the lookback that moves these should be looked at, not
    // loosened. (One dumbbell label is a stray "carry" in "use two dbs for the carry": the words
    // before it do name dumbbells, so it is left as read.)
    const counts = { dumbbell: 0, kettlebell: 0, barbell: 0 };
    for (const r of parseRows(await loadSampleRows())) {
      for (const m of r.movements) {
        if (m.source === "text" && m.implement !== undefined) counts[m.implement]++;
      }
    }
    expect(counts).toEqual({ dumbbell: 127, kettlebell: 66, barbell: 6 });
  });
});

describe("implement in the Movements view data", () => {
  const rows = [
    workoutRow({ date: "01/05/2024", title: "A", description: "15 db snatches 10 pull-ups" }),
    workoutRow({ date: "01/20/2024", title: "B", description: "5 snatch" }),
    workoutRow({ date: "02/03/2024", title: "C", description: "10 kb snatches" }),
    workoutRow({ date: "02/10/2024", title: "D", description: "20 dumbbell snatches" }),
  ];
  const data = buildMovementData(parseRows(rows));
  const snatch = { kind: "movement", id: "snatch" } as const;

  it("narrows a selection to one implement and leaves 'any' alone", () => {
    expect(workoutsFor(data, snatch).map((m) => m.workout.title)).toEqual(["A", "B", "C", "D"]);
    expect(workoutsFor(data, { ...snatch, implement: "dumbbell" }).map((m) => m.workout.title)).toEqual(["A", "D"]);
    expect(workoutsFor(data, { ...snatch, implement: "kettlebell" }).map((m) => m.workout.title)).toEqual(["C"]);
    expect(workoutsFor(data, { ...snatch, implement: "barbell" })).toEqual([]);
  });

  it("narrows a family the same way, and the trend with it", () => {
    const fam = { kind: "family", id: "snatch", implement: "dumbbell" } as const;
    expect(workoutsFor(data, fam)).toHaveLength(2);
    expect(trendFor(data, fam).map((p) => p.value)).toEqual([50, 50]);
  });

  it("counts each implement over the whole selection, and only those that appear", () => {
    expect(implementBreakdown(data, snatch)).toEqual([
      { implement: "dumbbell", count: 2 },
      { implement: "kettlebell", count: 1 },
    ]);
    // Counts do not shrink when the selection is already narrowed.
    expect(implementBreakdown(data, { ...snatch, implement: "kettlebell" })).toHaveLength(2);
    expect(implementBreakdown(data, { kind: "movement", id: "pull-ups" })).toEqual([]);
  });

  it("names the narrowed selection", () => {
    expect(selectionLabel({ ...snatch, implement: "dumbbell" })).toBe("Dumbbell snatch");
  });

  it("offers an Implement control for a movement that names one, and filters by it", () => {
    render(<MovementsTab data={data} granularity="monthly" />);
    fireEvent.change(screen.getByLabelText("Movement"), { target: { value: "movement:snatch" } });
    const implement = screen.getByLabelText("Implement");
    expect(implement).toHaveValue("");
    fireEvent.change(implement, { target: { value: "dumbbell" } });
    expect(screen.getByText(/workouts with dumbbell snatch in them/)).toBeInTheDocument();
    // A movement no workout names an implement for has no control.
    fireEvent.change(screen.getByLabelText("Movement"), { target: { value: "movement:pull-ups" } });
    expect(screen.queryByLabelText("Implement")).toBeNull();
  });
});
