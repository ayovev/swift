import { beforeAll, describe, expect, it } from "vitest";
import { buildInsights, type Insights } from "@/lib/analytics/buildInsights";
import { hasVersions, rxVersionText } from "@/lib/analytics/rxVersion";
import { loadSampleRows } from "./fixtures/sampleRows";

/** The shapes are the sample export's own: SugarWOD glues every version of a workout into one description. */
describe("rxVersionText", () => {
  it("keeps only the RX version of a workout that spells out three", () => {
    const d = "- RX -10 rounds for time:1 legless rope climb (15 ft)200/250-m row- Rest 1:00 between rounds.- INTERMEDIATE -10 rounds for time:1 rope climb (15 ft)200/250-m row- Rest 1:00 between rounds.- BEGINNER -10 rounds for time:3 pull-to-stands150-m row- Rest 1:00 between rounds.";
    const rx = rxVersionText(d);
    expect(rx).toContain("legless rope climb");
    expect(rx).toContain("Rest 1:00 between rounds");
    expect(rx).not.toContain("1 rope climb");
    expect(rx).not.toContain("pull-to-stands");
  });

  it("stops at SCALED and FOUNDATIONS as it does at INTERMEDIATE", () => {
    const d = "- RX -Complete as many reps as possible in 15 minutes of:5 burpee pull-ups- SCALED -5 burpees- FOUNDATIONS -5 burpees";
    expect(rxVersionText(d)).toContain("burpee pull-ups");
    expect(rxVersionText(d)).not.toMatch(/- SCALED|5 burpees/);
  });

  it("reads a description with no markers whole, and has no versions to speak of", () => {
    const d = "21-15-9DeadliftsPull-ups";
    expect(rxVersionText(d)).toBe(d);
    expect(hasVersions(d)).toBe(false);
    expect(hasVersions("- RX -AMRAP 20- INTERMEDIATE - Same as Rxd")).toBe(true);
  });

  it("keeps text before the first marker, which every version shares", () => {
    expect(rxVersionText("Time cap 12 minutes. - RX -5 muscle-ups- BEGINNER -5 ring rows")).toContain("Time cap 12 minutes.");
  });

  it("keeps only the shared preface when there is no RX version to read", () => {
    const rx = rxVersionText("Warm up first. - INTERMEDIATE -5 rope climbs- BEGINNER -3 pull-to-stands");
    expect(rx).toContain("Warm up first.");
    expect(rx).not.toContain("rope climbs");
  });

  it("does not take a lowercase word between hyphens for a marker", () => {
    // A real hyphen or a note, never a level name.
    expect(hasVersions("5 deadlifts - Maintain same load across all sets.")).toBe(false);
    expect(hasVersions("400-m run - rx weight - scaled weight")).toBe(false);
  });
});

describe("on the sample export", () => {
  let all: Insights;
  beforeAll(async () => {
    all = buildInsights(await loadSampleRows());
  });

  it("finds versions in a third of the workouts, and always leaves the RX section in what it keeps", () => {
    const sectioned = all.allRows.filter((r) => hasVersions(r.raw.description));
    expect(sectioned.length).toBeGreaterThan(400);
    for (const r of sectioned) {
      const rx = rxVersionText(r.raw.description);
      expect(rx.length, r.raw.title).toBeLessThanOrEqual(r.raw.description.length + 1);
      // Never the lower versions' marker words.
      expect(rx, r.raw.title).not.toMatch(/-\s*(INTERMEDIATE|BEGINNER|SCALED|FOUNDATIONS|JUST MOVE)\s*-/);
    }
  });

  it("reads Cindy's RX version without the Beginner ring rows", () => {
    const cindy = all.allRows.find((r) => r.raw.title === "CINDY" && /RING ROWS|ring rows/i.test(r.raw.description) && r.raw.description.includes("- RX -"))!;
    const rx = rxVersionText(cindy.raw.description);
    expect(rx).toContain("pull-ups");
    expect(rx.toLowerCase()).not.toContain("ring rows");
  });
});
