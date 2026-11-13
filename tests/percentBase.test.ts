import { describe, expect, it } from "vitest";
import { findMovements } from "@/lib/classify/classifyModality";
import { classifiableText, findAllMatches, findPercentBases } from "@/lib/classify/matcher";
import { LEXICON_BY_SPECIFICITY } from "@/lib/classify/movementLexicon";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * A lift named only as the base of a percentage ("75% of snatch") is a reference, not a movement the athlete performed. See the
 * "PERCENTAGE BASES" note in matcher.ts. The sample has 146 rows with a percent phrase, 78 of them "% of"; the rule is deliberately
 * narrow (needs "of"), and it applies to the movement classifier only.
 */
const ids = (text: string) => findMovements(text.toLowerCase()).map((m) => m.id);

describe("the engine", () => {
  const snatch = { phrase: "snatch" };
  const on = { skipPercentBases: true };

  it("is off unless asked for, so the domain keywords are untouched", () => {
    expect(findAllMatches("5x2 at 75% of snatch", snatch)).toHaveLength(1);
    expect(findAllMatches("5x2 at 75% of snatch", snatch, on)).toHaveLength(0);
  });

  it.each([
    "75% of snatch",
    "75 % of snatch",
    "75%of snatch",
    "75% of your snatch",
    "75% of your 1rm snatch",
    "75% of 3-rep max snatch",
    "75% of the snatch",
    "75 percent of snatch",
  ])("treats %s as a base", (text) => {
    expect(findAllMatches(text, snatch, on)).toHaveLength(0);
    expect(findPercentBases(text, snatch)).toHaveLength(1);
  });

  it("keeps the same lift when it is also named somewhere else", () => {
    expect(findAllMatches("snatch 5x2 at 75% of snatch", snatch, on)).toEqual([[0, 6]]);
  });

  it.each(["75% snatch", "snatch at 75%", "75% of 1rm", "of snatch", "% of the day snatch"])("does not touch %s", (text) => {
    expect(findPercentBases(text, snatch)).toHaveLength(0);
  });
});

describe("the movement classifier", () => {
  it("does not read a percentage base as a movement", () => {
    expect(ids("Back Squat 5x5 @ 80% of your clean")).toEqual(["back-squat"]);
    expect(ids("Front squat 3x3 at 85% of snatch")).not.toContain("snatch");
  });

  it("claims the whole base, so a shorter phrase inside it cannot match in its place", () => {
    // "jerk" and "clean" are both inside "clean and jerk"; neither may come back.
    expect(ids("Front squat 4x3 @ 70% of clean and jerk")).toEqual(["front-squat"]);
    // "power clean" is one base, not a power clean plus a clean.
    expect(ids("Front squat @ 75% of power clean")).toEqual(["front-squat"]);
  });

  it("still counts a lift that is named as a movement as well", () => {
    expect(ids("Snatch 5x2 @ 75% of snatch")).toEqual(["snatch"]);
    expect(ids("Clean pulls 3x3 @ 90% of clean")).not.toContain("clean");
  });

  it("leaves '75% back squat' alone: with no 'of' it is as likely to be the lift being performed", () => {
    expect(ids("Deadlift 5x3 @ 75% back squat")).toContain("back-squat");
  });
});

describe("on the sample export", () => {
  // Measured against the old engine: 70 rows name a lift as a base; in 51 of them the movement list changes (the rest also name it
  // elsewhere, or a longer phrase had already claimed it), 1 modality split moves (below), and no domain tag moves.
  it("finds 70 rows that name a lift as the base of a percentage", async () => {
    const rows = await loadSampleRows();
    let changed = 0;
    for (const r of rows) {
      const text = classifiableText(r);
      const differs = LEXICON_BY_SPECIFICITY.some(
        (e) => findAllMatches(text, e).length !== findAllMatches(text, e, { skipPercentBases: true }).length
      );
      if (differs) changed++;
    }
    expect(changed).toBe(CHANGED_ROWS);
  });

  it("moves one modality split: 'Power Cean ... @ 67% of clean' has no other movement, so it is now unclassified", async () => {
    const row = (await loadSampleRows()).find((r) => r.title === "Power Cean")!;
    expect(findMovements(classifiableText(row))).toEqual([]);
  });
});

const CHANGED_ROWS = 70;
