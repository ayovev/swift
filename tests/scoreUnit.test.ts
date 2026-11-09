import { describe, expect, it } from "vitest";
import { withScoreUnit } from "@/lib/format/scoreUnit";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { loadSampleRows } from "./fixtures/sampleRows";

describe("withScoreUnit", () => {
  it("adds the unit for each numeric score type, loads always in pounds", () => {
    expect(withScoreUnit("205", "Load")).toBe("205 lb");
    expect(withScoreUnit("139", "Reps")).toBe("139 reps");
    expect(withScoreUnit("85", "Calories")).toBe("85 cal");
    expect(withScoreUnit("2708", "Meters")).toBe("2708 m");
    expect(withScoreUnit("49.5", "Inches")).toBe("49.5 in");
    expect(withScoreUnit("360", "Points")).toBe("360 pts");
  });

  it("leaves scores the sport already writes in full exactly as logged", () => {
    expect(withScoreUnit("3:45", "")).toBe("3:45"); // a time
    expect(withScoreUnit("19+16", "Rounds + Reps")).toBe("19+16");
    expect(withScoreUnit('25 6"', "Feet")).toBe('25 6"');
    expect(withScoreUnit("done", "Other / Text")).toBe("done");
    expect(withScoreUnit("Yes", "Checkbox")).toBe("Yes");
    expect(withScoreUnit("", "Load")).toBe("");
  });

  it("covers every PR score in the sample export: a unit, or a form that needs none", async () => {
    const prs = buildInsights(await loadSampleRows()).dashboard.pr_timeline;
    for (const pr of prs) {
      const shown = withScoreUnit(pr.display, pr.score_type);
      if (["Load", "Reps", "Calories", "Meters", "Inches", "Points"].includes(pr.score_type) && /^\d+(\.\d+)?$/.test(pr.display)) {
        expect(shown).toMatch(/ (lb|reps|cal|m|in|pts)$/);
      } else {
        expect(shown).toBe(pr.display);
      }
    }
  });
});
