import { describe, expect, it } from "vitest";
import { formatWorkoutDescription, isLevelLabel } from "@/lib/format/workoutDescription";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("formatWorkoutDescription — hand-written cases (documenting intent)", () => {
  it("spaces the glued example from matcher.ts's own header comment", () => {
    expect(formatWorkoutDescription("21-15-9DeadliftsPull-ups")).toEqual([
      "21-15-9 Deadlifts Pull-ups",
    ]);
  });

  it("does not space a lowercase-lowercase glue it has no signal for", () => {
    // Documented gap in matcher.ts too: no case-change or digit to hook on.
    expect(formatWorkoutDescription("25 burpeeswall-ball shots")).toEqual([
      "25 burpeeswall-ball shots",
    ]);
  });

  it("keeps compound words and units intact", () => {
    expect(formatWorkoutDescription("push-ups double-unders wall-ball")).toEqual([
      "push-ups double-unders wall-ball",
    ]);
    expect(formatWorkoutDescription("a 20-lb vest and a 400-m run")).toEqual([
      "a 20-lb vest and a 400-m run",
    ]);
  });

  it("keeps rep schemes intact", () => {
    expect(formatWorkoutDescription("Power snatch 5-5-5-5-5-5-5")).toEqual([
      "Power snatch 5-5-5-5-5-5-5",
    ]);
  });

  it("does not split rep-scheme-style single-letter notation", () => {
    expect(formatWorkoutDescription("Back squat 5x3")).toEqual(["Back squat 5x3"]);
  });

  it("splits scaling-level blocks into their own paragraphs", () => {
    expect(
      formatWorkoutDescription("- RX -AMRAP 20:5 pull-ups- INTERMEDIATE - Same as Rxd- BEGINNER -Rest")
    ).toEqual(["RX", "AMRAP 20:5 pull-ups", "INTERMEDIATE", "Same as Rxd", "BEGINNER", "Rest"]);
  });

  it("splits an inline note on its surrounding spaced hyphens", () => {
    expect(
      formatWorkoutDescription("5 sets:3 deadlifts - Maintain same load across all sets.")
    ).toEqual(["5 sets:3 deadlifts", "Maintain same load across all sets."]);
  });

  it("fixes glue at a closing paren", () => {
    expect(formatWorkoutDescription("Single DB lunges (35/50 lb)Double-unders")).toEqual([
      "Single DB lunges (35/50 lb) Double-unders",
    ]);
  });

  it("identifies scaling-level labels but not ordinary prose", () => {
    expect(isLevelLabel("RX")).toBe(true);
    expect(isLevelLabel("INTERMEDIATE")).toBe(true);
    expect(isLevelLabel("BEGINNER")).toBe(true);
    expect(isLevelLabel("Same as Rxd")).toBe(false);
    expect(isLevelLabel("AMRAP 20:5 pull-ups")).toBe(false);
  });

  it("drops empty paragraphs and never returns blank strings", () => {
    expect(formatWorkoutDescription("")).toEqual([]);
    expect(formatWorkoutDescription("- RX -- INTERMEDIATE -")).not.toContain("");
  });
});

describe("formatWorkoutDescription — measured against the real sample export", () => {
  it("eliminates glued case-boundary and paren-boundary text across every description", async () => {
    const rows = await loadSampleRows();
    for (const row of rows) {
      if (!row.description) continue;
      const joined = formatWorkoutDescription(row.description).join(" ");
      // The exact two boundaries this module fixes, both pinned by CLAUDE.md
      // and matcher.ts as the real shape of the export.
      expect(joined, row.description).not.toMatch(/[a-z0-9][A-Z]/);
      expect(joined, row.description).not.toMatch(/\)[A-Za-z0-9]/);
    }
  });

  it("never produces an empty or whitespace-only paragraph", async () => {
    const rows = await loadSampleRows();
    for (const row of rows) {
      for (const line of formatWorkoutDescription(row.description)) {
        expect(line.trim().length, row.description).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every known rep-scheme and compound-word shape intact", async () => {
    const rows = await loadSampleRows();
    const repSchemeShapes = ["5-5-5-5-5-5-5", "push-ups", "double-unders", "400-m", "20-lb"];
    for (const shape of repSchemeShapes) {
      const withShape = rows.find((r) => r.description.includes(shape));
      expect(withShape, `expected at least one row containing "${shape}"`).toBeDefined();
      if (!withShape) continue;
      expect(formatWorkoutDescription(withShape.description).join(" ")).toContain(shape);
    }
  });
});
