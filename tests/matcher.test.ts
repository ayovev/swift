import { describe, expect, it } from "vitest";
import {
  classifiableText,
  findAllMatches,
  findMatch,
  matches,
  searchForms,
} from "@/lib/classify/matcher";

describe("matcher — substring mode (the default)", () => {
  it("matches a plain occurrence", () => {
    expect(matches("400-m run for time", { phrase: "run" })).toBe(true);
  });

  it("matches inflections, because substring matching is prefix-tolerant", () => {
    expect(matches("rowing 2000m", { phrase: "row" })).toBe(true);
    expect(matches("30 thrusters", { phrase: "thruster" })).toBe(true);
    expect(matches("shoulder presses", { phrase: "press" })).toBe(true);
  });

  it("matches words glued to their neighbours, which real exports are full of", () => {
    // Verbatim shapes from the validation export — SugarWOD concatenates
    // description lines with no separator. A word-boundary rule would miss
    // every one of these.
    expect(matches("21-15-9deadliftspull-ups", { phrase: "deadlift" })).toBe(true);
    expect(matches("25 burpeeswall-ball shots", { phrase: "wall-ball" })).toBe(true);
    expect(matches("20 squatshandstand walk", { phrase: "handstand" })).toBe(true);
    expect(matches("50 box step-ups400-m run", { phrase: "400-m run" })).toBe(true);
    expect(matches("strengthemom 12", { phrase: "emom" })).toBe(true);
  });

  it("reports the index of the first match", () => {
    expect(findMatch("row, then row again", { phrase: "row" })).toBe(0);
    expect(findMatch("no match here", { phrase: "snatch" })).toBe(-1);
  });

  it("ignores an empty phrase rather than matching everywhere", () => {
    expect(findMatch("anything", { phrase: "" })).toBe(-1);
    expect(findAllMatches("anything", { phrase: "" })).toEqual([]);
  });
});

describe("matcher — exclusions", () => {
  it("rejects a match that is only there because of a longer word", () => {
    expect(matches("throw & sit up", { phrase: "row", exclude: ["throw"] })).toBe(false);
    expect(matches("carryover day", { phrase: "carry", exclude: ["carryover"] })).toBe(false);
    expect(matches("partner pressure", { phrase: "press", exclude: ["pressure"] })).toBe(false);
  });

  it("still matches a genuine occurrence elsewhere in the same text", () => {
    // "throw" blocks its own "row", but the rower is a real match.
    expect(matches("med ball throw then 500m row", { phrase: "row", exclude: ["throw"] })).toBe(true);
    expect(findMatch("med ball throw then 500m row", { phrase: "row", exclude: ["throw"] })).toBe(25);
  });

  it("does not let an exclusion swallow a longer legitimate match", () => {
    expect(matches("rowing machine", { phrase: "row", exclude: ["throw"] })).toBe(true);
  });
});

describe("matcher — stem-changing inflection (consonant + y)", () => {
  // Substring matching already covers everything that APPENDS to the keyword.
  // The one gap is English's y -> i stem change, handled once here rather than
  // by hand-adding surface forms to every keyword list.

  it("reaches the y -> i forms of a keyword", () => {
    expect(matches("double kb oh carries", { phrase: "carry" })).toBe(true);
    expect(matches("suitcase carried for 50m", { phrase: "carry" })).toBe(true);
    expect(matches("build to your heaviest set", { phrase: "heavy" })).toBe(true);
    expect(matches("go heavier than last week", { phrase: "heavy" })).toBe(true);
  });

  it("still reaches the plain and appended forms", () => {
    expect(matches("farmer carry", { phrase: "carry" })).toBe(true);
    expect(matches("spend 2:00 carrying it", { phrase: "carry" })).toBe(true);
    expect(matches("heavy singles", { phrase: "heavy" })).toBe(true);
  });

  it("only applies after a consonant, never a vowel", () => {
    // "day" must not become "dai", which would match "daily".
    expect(searchForms("day")).toEqual(["day"]);
    expect(searchForms("carry")).toEqual(["carry", "carri"]);
    expect(searchForms("heavy")).toEqual(["heavy", "heavi"]);
  });

  it("leaves keywords without a trailing y alone", () => {
    expect(searchForms("run")).toEqual(["run"]);
    expect(searchForms("wall ball")).toEqual(["wall ball"]);
    expect(searchForms(" cal ")).toEqual([" cal "]);
  });

  it("does not let the stem bypass an exclusion", () => {
    const rule = { phrase: "carry", exclude: ["carryover"] } as const;
    expect(matches("carryover day", rule)).toBe(false);
    // ...while the genuine inflected form still matches.
    expect(matches("kb carries", rule)).toBe(true);
  });

  it("reports the earliest match across all forms", () => {
    // "carries" appears before "carry" here; the index must be the earlier one.
    expect(findMatch("kb carries then a farmer carry", { phrase: "carry" })).toBe(3);
  });

  it("does not double-count a phrase and its stem in the same text", () => {
    // "carrying" contains "carry"; the stem must not add a second overlapping hit.
    expect(findAllMatches("carrying", { phrase: "carry" })).toEqual([[0, 5]]);
  });
});

describe("matcher — token mode (short abbreviations)", () => {
  const du = { phrase: "du", mode: "token" } as const;

  it("matches a standalone abbreviation", () => {
    expect(matches("50 du", du)).toBe(true);
    expect(matches("du, then run", du)).toBe(true);
  });

  it("matches when glued to digits, which is how reps are written", () => {
    expect(matches("50du unbroken", du)).toBe(true);
  });

  it("matches a simple plural", () => {
    expect(matches("100 dus", du)).toBe(true);
  });

  it("does NOT match inside a longer word", () => {
    expect(matches("double-unders", du)).toBe(false);
    expect(matches("during the workout", du)).toBe(false);
    expect(matches("individual scores", du)).toBe(false);
    expect(matches("dusty", du)).toBe(false);
  });

  it("guards the other abbreviations the same way", () => {
    expect(matches("21 kb swings", { phrase: "kb", mode: "token" })).toBe(true);
    expect(matches("kettlebell", { phrase: "kb", mode: "token" })).toBe(false);
    expect(matches("15 t2b", { phrase: "t2b", mode: "token" })).toBe(true);
    expect(matches("db snatch", { phrase: "db", mode: "token" })).toBe(true);
  });
});

describe("matcher — findAllMatches", () => {
  it("returns non-overlapping ranges left to right", () => {
    expect(findAllMatches("row row row", { phrase: "row" })).toEqual([
      [0, 3],
      [4, 7],
      [8, 11],
    ]);
  });

  it("skips excluded occurrences but keeps the rest", () => {
    expect(findAllMatches("throw row", { phrase: "row", exclude: ["throw"] })).toEqual([[6, 9]]);
  });
});

describe("classifiableText", () => {
  it("joins the three read fields and lowercases them", () => {
    expect(
      classifiableText({ title: "Back Squat", description: "5-5-3", barbell_lift: "Back Squat" })
    ).toBe("back squat 5-5-3 back squat");
  });

  it("tolerates missing and null fields", () => {
    expect(classifiableText({ title: "FRAN" })).toBe("fran  ");
    expect(classifiableText({ title: null, description: "row", barbell_lift: null })).toBe(" row ");
  });
});
