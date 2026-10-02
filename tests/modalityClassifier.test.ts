import { describe, expect, it } from "vitest";
import { classifyModality, findMovements } from "@/lib/classify/classifyModality";
import { classifiableText } from "@/lib/classify/matcher";
import { MOVEMENT_LEXICON } from "@/lib/classify/movementLexicon";
import { familiesOf, hasFamily, hasMovement, MOVEMENT_FAMILIES } from "@/lib/classify/movementFamilies";
import { parseRows } from "@/lib/analytics/buildDashboardData";
import { loadSampleRows } from "./fixtures/sampleRows";
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

describe("modality classifier — movement identity (measured on the sample export)", () => {
  it('reads "clean & jerk" as one lift, not a Clean plus a Jerk', () => {
    expect(labels("Clean & Jerk 3x2")).toEqual(["Clean & jerk"]);
    expect(labels("CLEAN AND JERK")).toEqual(["Clean & jerk"]);
  });

  it("keeps hang power variants distinct from the plain power lift", () => {
    expect(labels("EMOM", "1 hang power clean 1 hang power snatch")).toEqual([
      "Hang power clean",
      "Hang power snatch",
    ]);
  });

  it("splits out ring muscle-ups, handstand walks and wall walks", () => {
    expect(labels("GYM", "5 ring muscle-ups 20 ft handstand walk 9 wall walks")).toEqual([
      "Ring muscle-ups",
      "Handstand walk",
      "Wall walks",
    ]);
  });

  it("reads devils press as a devil press", () => {
    expect(labels("PARTNER", "4 devils press")).toEqual(["Devil press"]);
  });

  it("does not read names and props as movements", () => {
    expect(labels("TIRE SWING", "for time: 60 kb swings")).toEqual(["Kettlebell swing"]);
    expect(labels("SWING STATE", "4 x amrap 3:00")).toEqual([]);
    expect(labels("JERK DIP + 10 SEC RACK HOLD")).toEqual(["Jerk"]);
    expect(labels("ACCESSORY", "elevated split squat (use bench) 3 sets")).toEqual(["Squat"]);
    expect(labels("SLOW YOUR ROW!", "12:00 amrap")).toEqual([]);
    expect(labels("THANKSGIVING", "last minute store run")).toEqual([]);
  });

  it("still reads the real versions of those movements", () => {
    expect(labels("ring dips", "3 sets max ring dips")).toEqual(["Ring dips"]);
    expect(labels("HEAVY BENCH", "bench press 5x5")).toEqual(["Bench press"]);
    expect(labels("ROW", "400m row")).toEqual(["Row"]);
  });

  it("does not count equipment as a movement", () => {
    // "db" and "kb" name the implement, not what was done with it. Counting
    // them gave a db snatch two weightlifting movements.
    expect(labels("SKILL", "1 db power clean 1 db power snatch")).toEqual(["Power clean", "Power snatch"]);
    expect(labels("KB", "double kb oh carries")).toEqual(["Loaded carry"]);
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

describe("movement ids and families", () => {
  const ids = new Set(MOVEMENT_LEXICON.map((e) => e.id));

  it("gives every id kebab-case form", () => {
    for (const e of MOVEMENT_LEXICON) expect(e.id, e.phrase).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("keeps one label and one modality per id, so aliases cannot drift apart", () => {
    const seen = new Map<string, { label: string; modality: string }>();
    for (const e of MOVEMENT_LEXICON) {
      const prior = seen.get(e.id);
      if (prior) expect({ label: e.label, modality: e.modality }, e.phrase).toEqual(prior);
      else seen.set(e.id, { label: e.label, modality: e.modality });
    }
  });

  it("keeps one id per label", () => {
    const byLabel = new Map<string, string>();
    for (const e of MOVEMENT_LEXICON) {
      expect(byLabel.get(e.label) ?? e.id, e.label).toBe(e.id);
      byLabel.set(e.label, e.id);
    }
  });

  it("carries the id on every hit", () => {
    expect(findMovements("t2b and ttb and toes to bar").map((h) => h.id)).toEqual(["toes-to-bar"]);
  });

  it("only names real movement ids in families, and none with a single member", () => {
    for (const f of MOVEMENT_FAMILIES) {
      expect(f.members.length, f.id).toBeGreaterThan(1);
      for (const m of f.members) expect(ids.has(m), `${f.id}: ${m}`).toBe(true);
    }
    expect(new Set(MOVEMENT_FAMILIES.map((f) => f.id)).size).toBe(MOVEMENT_FAMILIES.length);
  });

  it("includes every variant when a family is chosen", () => {
    const hit = (text: string) => findMovements(text);
    expect(hasFamily(hit("5 hang power clean"), "clean")).toBe(true);
    expect(hasFamily(hit("squat clean thruster"), "clean")).toBe(true);
    expect(hasFamily(hit("bar muscle-ups"), "muscle-up")).toBe(true);
    expect(hasFamily(hit("back squat"), "clean")).toBe(false);
    expect(hasMovement(hit("hang power clean"), "clean")).toBe(false);
  });

  it("puts clean & jerk in both the clean and jerk families", () => {
    expect(familiesOf("clean-and-jerk").sort()).toEqual(["clean", "jerk"]);
    expect(familiesOf("run")).toEqual(["run"]);
    expect(familiesOf("burpees")).toEqual([]);
  });

  it("keeps loaded and bodyweight squats apart", () => {
    expect(hasFamily(findMovements("50 air squats"), "squat")).toBe(false);
  });

  it("computes each row's movements once, in parseRows", async () => {
    const parsed = parseRows(await loadSampleRows());
    expect(parsed.length).toBeGreaterThan(1000);
    for (const row of parsed) expect(row.movements).toEqual(findMovements(row.text));
  });
});
