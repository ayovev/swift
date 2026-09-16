import { describe, expect, it } from "vitest";
import { classifyDomains, classifyWithReasons } from "@/lib/classify/domainKeywords";
import { classifiableText } from "@/lib/classify/matcher";
import { DOMAIN_LIST, type Domain } from "@/types/dashboard";

/** Classify from raw workout fields, the way the pipeline does. */
function classify(title: string, description = "", barbellLift = "") {
  return classifyWithReasons(
    classifiableText({ title, description, barbell_lift: barbellLift })
  );
}

function domainsOf(title: string, description = "", barbellLift = ""): Domain[] {
  return [...classifyDomains(classifiableText({ title, description, barbell_lift: barbellLift }))];
}

describe("GPP classifier — each of the ten domains (TR-1)", () => {
  it("Cardiovascular/Respiratory Endurance", () => {
    expect(classify("FOR TIME", "Row 2000m")).toHaveProperty(
      "Cardiovascular/Respiratory Endurance"
    );
    expect(classify("ECHO BIKE", "20 calorie echo bike")).toHaveProperty(
      "Cardiovascular/Respiratory Endurance"
    );
  });

  it("Stamina", () => {
    expect(classify("20:00 AMRAP", "as many rounds as possible")).toHaveProperty("Stamina");
    expect(classify("MURPH", "1 mile run, 100 pull-ups")).toHaveProperty("Stamina");
    expect(classify("EMOM 12", "every minute on the minute")).toHaveProperty("Stamina");
  });

  it("Strength", () => {
    expect(classify("BACK SQUAT", "Back Squat 5-5-3-3-1", "Back Squat")).toHaveProperty("Strength");
    expect(classify("DEADLIFT", "Deadlift 3RM")).toHaveProperty("Strength");
  });

  it("Flexibility", () => {
    expect(classify("MOBILITY", "hip opener and foam roll")).toHaveProperty("Flexibility");
    expect(classify("ACCESSORY", "pigeon stretch")).toHaveProperty("Flexibility");
  });

  it("Power", () => {
    expect(classify("POWER CLEAN", "Power Clean 3-3-3", "Power Clean")).toHaveProperty("Power");
    expect(classify("KB SWING", "50 kettlebell swings")).toHaveProperty("Power");
  });

  it("Speed", () => {
    expect(classify("SPRINT INTERVALS", "8 x 100m sprint")).toHaveProperty("Speed");
    expect(classify("TIME TRIAL", "1-mile run for time")).toHaveProperty("Speed");
  });

  it("Coordination", () => {
    expect(classify("MUSCLE-UPS", "12 muscle-ups")).toHaveProperty("Coordination");
    expect(classify("DOUBLE UNDERS: 2 MINUTE TEST", "max double-unders")).toHaveProperty(
      "Coordination"
    );
  });

  it("Agility", () => {
    expect(classify("3 ROUNDS", "20 burpees")).toHaveProperty("Agility");
    expect(classify("SHUTTLE RUN", "lateral shuttle runs")).toHaveProperty("Agility");
  });

  it("Balance", () => {
    expect(classify("HANDSTAND WALK", "50ft handstand walk")).toHaveProperty("Balance");
    expect(classify("ACCESSORY", "3 sets of pistols and rope climbs")).toHaveProperty("Balance");
  });

  it("Accuracy", () => {
    expect(classify("KAREN", "150 wall-ball shots")).toHaveProperty("Accuracy");
    expect(classify("SKILL", "practice double-unders at a target")).toHaveProperty("Accuracy");
  });

  it("covers all ten domains across the suite", () => {
    // Guards against a domain silently losing every keyword.
    const seen = new Set<Domain>();
    const corpus = [
      "row 2000m", "20:00 amrap", "back squat 5rm", "mobility stretch",
      "power clean", "100m sprint", "muscle-up practice", "20 burpees",
      "handstand hold", "150 wall-ball shots",
    ];
    for (const text of corpus) {
      for (const d of classifyDomains(text)) seen.add(d);
    }
    expect([...seen].sort()).toEqual([...DOMAIN_LIST].sort());
  });
});

describe("GPP classifier — multi-domain workouts (TR-1)", () => {
  it("tags Fran across strength, power, gymnastics-adjacent and conditioning domains", () => {
    const hits = classify("FRAN", "21-15-9 Thrusters (95/65) Pull-ups for time");
    // thruster -> Strength + Power; for time -> Cardio, Stamina, Speed;
    // pull-up -> Strength; fran -> Stamina
    expect(Object.keys(hits).length).toBeGreaterThanOrEqual(4);
    expect(hits).toHaveProperty("Strength");
    expect(hits).toHaveProperty("Power");
    expect(hits).toHaveProperty("Cardiovascular/Respiratory Endurance");
    expect(hits).toHaveProperty("Stamina");
  });

  it("tags a mixed-modal chipper broadly", () => {
    const domains = domainsOf(
      "FOR TIME",
      "400-m run, 30 box jumps, 30 wall-ball shots, 30 double-unders"
    );
    expect(domains).toEqual(
      expect.arrayContaining([
        "Cardiovascular/Respiratory Endurance",
        "Speed",
        "Power",
        "Agility",
        "Accuracy",
        "Coordination",
      ])
    );
  });

  it("leaves a genuinely unclassifiable entry with no domains", () => {
    expect(domainsOf("DAILY LAZY MACROS POINTS", "week 1 points")).toEqual([]);
  });
});

describe("GPP classifier — matched-on keyword is the first in list order", () => {
  it("reports the earliest matching keyword, not the most specific one", () => {
    // Power's list is [clean, snatch, jerk, ...] then later [power clean].
    // "clean" comes first, so that is what the athlete is shown.
    expect(classify("POWER CLEAN", "Power Clean 3x3").Power).toBe("clean");
  });

  it("reports the correct keyword per domain independently", () => {
    const hits = classify("FOR TIME", "Row 1000m");
    expect(hits["Cardiovascular/Respiratory Endurance"]).toBe("row");
    expect(hits.Stamina).toBe("for time");
  });
});

describe("GPP classifier — substring false-positive corrections", () => {
  // Deliberate, measured deviation from the Python reference. Exactly these
  // three rows of the 1,209-row validation export change.

  it('"CARRYOVER" is no longer wrongly tagged Balance and Strength via "carry"', () => {
    const domains = domainsOf("CARRYOVER", "");
    expect(domains).not.toContain("Balance");
    expect(domains).not.toContain("Strength");
  });

  it('"THROW & SIT UP" is no longer wrongly matched on "row"', () => {
    expect(classify("THROW & SIT UP", "")["Cardiovascular/Respiratory Endurance"]).toBeUndefined();
  });

  it('"PARTNER PRESSURE" is no longer wrongly matched on "press"', () => {
    expect(classify("PARTNER PRESSURE", "").Strength).toBeUndefined();
  });

  it("still matches the real movements those exclusions guard", () => {
    expect(classify("ROW", "500m row")["Cardiovascular/Respiratory Endurance"]).toBe("row");
    expect(classify("SHOULDER PRESS", "5x5", "Shoulder Press").Strength).toBe("press");
    expect(classify("FARMER CARRY", "3 sets of farmer carry").Strength).toBe("carry");
    expect(classify("FARMER CARRY", "3 sets of farmer carry").Balance).toBe("carry");
  });

  it('" cal " stays space-guarded, so "SCALED" never reads as calories', () => {
    expect(classify("SCALED WORKOUT", "scaled version")).not.toHaveProperty(
      "Cardiovascular/Respiratory Endurance"
    );
  });
});

describe("GPP classifier — stem-changing inflections (consonant + y)", () => {
  // Substring matching covers every inflection that appends to the keyword
  // (carry/carrying, run/running, press/presses). The stem-changing y -> i
  // rule is handled by the shared matcher, so keyword lists stay clean.

  it('"carries" matches the keyword "carry"', () => {
    expect(classify("ACCESSORY", "3 sets of double kb oh carries").Strength).toBe("carry");
    expect(classify("ACCESSORY", "3 sets of double kb oh carries").Balance).toBe("carry");
  });

  it('"heaviest" and "heavier" match the keyword "heavy"', () => {
    expect(classify("BUILD", "build to your heaviest set").Strength).toBe("heavy");
    expect(classify("BUILD", "go heavier than last week").Strength).toBe("heavy");
  });

  it('still matches the plain and appended forms', () => {
    expect(classify("FARMER CARRY", "3 sets of farmer carry").Balance).toBe("carry");
    expect(classify("CARRYING", "spend 2:00 carrying the kettlebells").Balance).toBe("carry");
    expect(classify("HEAVY DAY", "heavy singles").Strength).toBe("heavy");
  });

  it('does not let the stem resurrect an excluded false positive', () => {
    // "carryover" is excluded; the stem must not smuggle it back in.
    expect(classify("CARRYOVER", "")).not.toHaveProperty("Balance");
  });
});

describe("GPP classifier — known limitations, pinned deliberately", () => {
  // These are inherited from the Python reference's keyword lists. They are
  // NOT bugs introduced by the port, and fixing them would mean widening the
  // keyword lists — a much larger behavioral change than the false-positive
  // corrections above, and out of scope for the agreed deviation. Pinned here
  // so the limitation is visible and any future change is deliberate.

  it("Flexibility is under-represented because mobility work is rarely logged", () => {
    // Noted in the reference's caveat #5 and surfaced as a UI caveat.
    expect(classify("CONDITIONING", "400-m run and 20 burpees")).not.toHaveProperty("Flexibility");
  });
});
