import { describe, expect, it } from "vitest";
import { classifyModality, findMovements } from "@/lib/classify/classifyModality";
import { classifiableText } from "@/lib/classify/matcher";
import { MOVEMENT_LEXICON } from "@/lib/classify/movementLexicon";
import { MODALITY_LIST, type ModalitySplit } from "@/types/modality";

/** Classify from raw workout fields, the way the pipeline does. */
function classify(title: string, description = "", barbellLift = "") {
  return classifyModality(classifiableText({ title, description, barbell_lift: barbellLift }));
}

/** Sum the three shares, rounded to a tenth — raw float addition of values
 *  like 33.4 + 33.3 + 33.3 lands on 99.99999999999999. */
const sumOf = (split: ModalitySplit) =>
  Math.round(MODALITY_LIST.reduce((n, m) => n + split[m], 0) * 10) / 10;

const labels = (title: string, description = "") =>
  findMovements(classifiableText({ title, description })).map((m) => m.label);

describe("modality classifier — single-modality workouts", () => {
  it("a barbell lift is 100% Weightlifting", () => {
    const { split } = classify("BACK SQUAT", "Back Squat 5-5-3-3-1", "Back Squat");
    expect(split).toEqual({ M: 0, W: 100, G: 0 });
  });

  it("an erg piece is 100% Metabolic Conditioning", () => {
    expect(classify("ROW", "2000m row for time").split).toEqual({ M: 100, W: 0, G: 0 });
  });

  it("bodyweight gymnastics is 100% Gymnastics", () => {
    expect(classify("CINDY", "20:00 AMRAP: 5 pull-ups, 10 push-ups, 15 air squats").split).toEqual({
      M: 0,
      W: 0,
      G: 100,
    });
  });

  it("treats a bare squat as weightlifting but an air squat as gymnastics", () => {
    expect(classify("FRONT SQUAT", "5x3 front squat").split.W).toBe(100);
    expect(classify("BODYWEIGHT", "50 air squats").split.G).toBe(100);
  });
});

describe("modality classifier — blended workouts", () => {
  it("scores Fran as 50 W / 50 G / 0 M, per canonical CrossFit", () => {
    // The decisive case: Fran is brutal metabolic work, but it is not
    // monostructural, so M is zero. Thrusters (W) + pull-ups (G).
    const { split, movements } = classify("FRAN", "21-15-9 Thrusters (95/65) Pull-ups for time");
    expect(split).toEqual({ M: 0, W: 50, G: 50 });
    expect(movements.map((m) => m.label).sort()).toEqual(["Pull-ups", "Thruster"]);
  });

  it("splits a three-modality triplet evenly and still sums to 100", () => {
    const { split } = classify("TRIPLET", "400m run, 21 kettlebell swings, 12 pull-ups");
    for (const m of MODALITY_LIST) {
      expect(split[m], `${m}: ${JSON.stringify(split)}`).toBeCloseTo(33.3, 0);
    }
    // One share carries the leftover tenth so the set sums to 100.0 exactly.
    expect(sumOf(split)).toBe(100);
    expect(new Set(MODALITY_LIST.map((m) => split[m])).size).toBe(2);
  });

  it("weights by distinct movements, so a two-movement couplet is a clean half", () => {
    expect(classify("COUPLET", "500m row, 20 burpees").split).toEqual({ M: 50, W: 0, G: 50 });
  });

  it("counts a movement once however many times it is named", () => {
    const repeated = classify("CLEANS", "power clean, then clean, then more cleans, then a run");
    // Clean and Power clean are separate movements; the point is that naming
    // "clean" three times does not make it three times the weight.
    expect(repeated.split.M).toBeGreaterThan(0);
    expect(repeated.movements.filter((m) => m.label === "Clean").length).toBeLessThanOrEqual(1);
  });

  it("always produces shares that sum to exactly 100 for a classified workout", () => {
    const cases = [
      ["FOR TIME", "400m run, 30 box jumps, 30 wall-ball shots, 30 double-unders"],
      ["CHIPPER", "100 pull-ups, 100 push-ups, 100 sit-ups, 100 air squats, 1 mile run"],
      ["AMRAP", "5 deadlifts, 10 toes-to-bar, 15 cal row"],
      ["COUPLET", "thrusters and burpees"],
      ["MURPH", "1 mile run, 100 pull-ups, 200 push-ups, 300 air squats, 1 mile run"],
    ] as const;
    for (const [title, description] of cases) {
      const { split } = classify(title, description);
      expect(sumOf(split), `${title}: ${JSON.stringify(split)}`).toBe(100);
    }
  });
});

describe("modality classifier — longest-phrase-first precedence", () => {
  it('"power clean" claims the text, so bare "clean" does not double-count', () => {
    expect(labels("POWER CLEAN", "3x3 power clean")).toEqual(["Power clean"]);
  });

  it('"ring row" is gymnastics, not a rowing erg', () => {
    const { split } = classify("ACCESSORY", "3 sets of 10 ring rows");
    expect(split).toEqual({ M: 0, W: 0, G: 100 });
  });

  it('"db row" is weightlifting, not a rowing erg', () => {
    const { split } = classify("ACCESSORY", "10 db row per arm");
    expect(split.M).toBe(0);
    expect(split.W).toBe(100);
  });

  it('"box jump" is gymnastics rather than any generic jump', () => {
    expect(labels("3 ROUNDS", "20 box jumps")).toEqual(["Box jumps"]);
  });

  it('"overhead squat" is one movement, not squat plus something', () => {
    expect(labels("OHS", "overhead squat 3x3")).toEqual(["Overhead squat"]);
  });
});

describe("modality classifier — the substring traps", () => {
  it('"SKILL WORK" is not skiing — the single most common title in the sample', () => {
    const { split, movements } = classify("SKILL WORK", "skill work on kipping");
    expect(movements.some((m) => m.label === "Ski erg")).toBe(false);
    expect(split.M).toBe(0);
  });

  it("still recognises a real ski erg piece", () => {
    expect(classify("SKI", "1000m ski erg").split).toEqual({ M: 100, W: 0, G: 0 });
  });

  it('"throw" is not a row', () => {
    const { movements } = classify("THROW & SIT UP", "50 wall-ball shots, 50 sit-ups");
    expect(movements.some((m) => m.label === "Row")).toBe(false);
  });

  it('"carryover" is not a loaded carry', () => {
    const { movements } = classify("CARRYOVER", "400m row, max box step-overs");
    expect(movements.some((m) => m.label === "Loaded carry")).toBe(false);
    expect(movements.some((m) => m.label === "Row")).toBe(true);
  });

  it('"pressure" is not a press', () => {
    const { movements } = classify("PARTNER PRESSURE", "10 rounds: 16 cal row");
    expect(movements.some((m) => m.label === "Press")).toBe(false);
  });

  it('"double-unders" does not fire the "du" abbreviation as a separate movement', () => {
    const found = labels("DOUBLE UNDERS", "100 double-unders");
    expect(found).toEqual(["Double-unders"]);
  });

  it("does recognise the DU abbreviation when it stands alone", () => {
    expect(labels("DU TEST", "2 minutes max dus")).toEqual(["Double-unders"]);
  });

  it("reaches stem-changing inflections like carry/carries", () => {
    // Handled by the shared matcher's consonant+y -> i rule, not by a
    // hand-added "carries" entry in the lexicon.
    const { movements } = classify("ACCESSORY", "3 sets of double kb oh carries");
    expect(movements.some((m) => m.label === "Loaded carry")).toBe(true);
  });
});

describe("modality classifier — unclassified workouts", () => {
  it("marks a non-workout entry unclassified rather than zero-everything", () => {
    const result = classify("DAILY LAZY MACROS POINTS", "week 1 points, 7 possible per day");
    expect(result.classified).toBe(false);
    expect(result.movements).toEqual([]);
    expect(result.split).toEqual({ M: 0, W: 0, G: 0 });
  });

  it("marks an empty entry unclassified", () => {
    expect(classify("", "").classified).toBe(false);
  });
});

describe("modality classifier — transparency", () => {
  it("reports which movement drove each modality", () => {
    const { movements } = classify("TRIPLET", "400m run, 21 kb swings, 12 pull-ups");
    const byModality = Object.fromEntries(movements.map((m) => [m.modality, m.label]));
    expect(byModality.M).toBe("Run");
    expect(byModality.W).toBe("Kettlebell swing");
    expect(byModality.G).toBe("Pull-ups");
  });

  it("reports movements in the order they appear in the workout text", () => {
    expect(labels("FOR TIME", "20 burpees then 400m run then 10 deadlifts")).toEqual([
      "Burpees",
      "Run",
      "Deadlift",
    ]);
  });
});

describe("movement lexicon — integrity", () => {
  it("has every phrase lowercase, so matching against lowercased text works", () => {
    for (const entry of MOVEMENT_LEXICON) {
      expect(entry.phrase, entry.phrase).toBe(entry.phrase.toLowerCase());
    }
  });

  it("assigns every entry one of the three modalities", () => {
    for (const entry of MOVEMENT_LEXICON) {
      expect(MODALITY_LIST, entry.phrase).toContain(entry.modality);
    }
  });

  it("has no duplicate phrases", () => {
    const phrases = MOVEMENT_LEXICON.map((e) => e.phrase);
    expect(phrases.length).toBe(new Set(phrases).size);
  });

  it("covers all three modalities", () => {
    const covered = new Set(MOVEMENT_LEXICON.map((e) => e.modality));
    expect([...covered].sort()).toEqual([...MODALITY_LIST].sort());
  });
});
