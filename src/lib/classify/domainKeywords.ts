import { DOMAIN_LIST, type Domain } from "@/types/dashboard";
import { findMatch, type MatchRule } from "./matcher";

/**
 * Keyword rules ported from the validated Python reference
 * (classification_reference.py). A workout hits a domain if ANY of that
 * domain's keywords appear in the combined, lowercased
 * title + description + barbell_lift text.
 *
 * ORDER WITHIN EACH LIST IS SIGNIFICANT. The keyword reported as the
 * "matched on" value — shown to the athlete in the per-domain drill-down —
 * is whichever keyword is checked FIRST and hits. Reordering a list changes
 * what the UI says a workout matched on, even though it cannot change
 * whether the domain matched. Preserve the reference's order exactly.
 *
 * Domains are NOT mutually exclusive: most workouts hit three or more.
 */
export const DOMAIN_KEYWORDS: Record<Domain, readonly string[]> = {
  "Cardiovascular/Respiratory Endurance": [
    "run", "row", "bike", "ski erg", "ski 1000", "assault bike", "echo bike",
    "amrap", "for time", "calorie", " cal ", "metcon", "double-under", "double under",
    "jump rope", "shuttle run", "tabata",
  ],
  Stamina: [
    "amrap", "for time", "emom", "chipper", "murph", "chief", "fran", "helen",
    "metcon", "partner wod", "rounds for time", "as many rounds", "tabata",
  ],
  Strength: [
    "squat", "deadlift", "press", "clean", "snatch", "jerk", "bench", "thruster",
    "1rm", "3rm", "5rm", "max load", "for load", "heavy", "rep max", "lunge",
    "c&j", "good morning", "carry", "pull-up", "pull up", "chin-up", "dip",
    "accessory", "hip extension", "skill work", "l-sit", "hold",
  ],
  Flexibility: [
    "mobility", "stretch", "overhead squat", "pigeon", "hip opener", "shoulder opener",
    "foam roll",
  ],
  Power: [
    "clean", "snatch", "jerk", "box jump", "broad jump", "kettlebell swing", "kb swing",
    "medicine ball", "wall-ball", "wall ball", "thruster", "power clean", "power snatch",
    "c&j",
  ],
  Speed: [
    "sprint", "for time", "1-mile run", "run 1 mile", "fastest", "time trial",
    "400-m run", "200-m run", "100-m",
  ],
  Coordination: [
    "double-under", "double under", "muscle-up", "muscle up", "handstand",
    "turkish get-up", "clean and jerk", "snatch", "overhead squat", "pistol",
    "c&j",
  ],
  Agility: [
    "burpee", "shuttle run", "box jump", "lateral", "agility", "broad jump",
    "jump-over", "jump over",
  ],
  Balance: [
    "handstand", "pistol", "single-leg", "single leg", "overhead squat",
    "turkish get-up", "rope climb", "balance", "carry", "plank",
  ],
  Accuracy: [
    "wall-ball", "wall ball", "target", "double-under", "double under",
    "free throw", "darts",
  ],
};

/**
 * Substring false positives, corrected.
 *
 * DELIBERATE DEVIATION from the Python reference (REQUIREMENTS.md FR-2.5 asks
 * for behavioral consistency with it). Each entry below was found by scanning
 * the 1,209-row validation export for keyword matches whose surrounding word
 * is not the movement the keyword names. The complete measured effect is
 * THREE rows out of 1,209, and every one is the reference being wrong:
 *
 *   "CARRYOVER"        — "carry" wrongly tagged it Balance + Strength
 *   "THROW & SIT UP"   — "row" wrongly reported as the Cardio match
 *   "PARTNER PRESSURE" — "press" wrongly reported as the Strength match
 *
 * Zero legitimate matches are lost. Anything added here must be justified the
 * same way: measured against the sample export, not assumed.
 *
 * Note " cal " is already space-guarded in the reference (which is why it does
 * not fire on "scaled"), so it needs nothing here.
 */
const KEYWORD_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  row: ["throw"],
  press: ["impress", "pressure"],
  carry: ["carryover"],
};

/** Build the shared-engine rule for a raw keyword string. */
export function ruleForKeyword(keyword: string): MatchRule {
  const exclude = KEYWORD_EXCLUSIONS[keyword];
  return exclude ? { phrase: keyword, exclude } : { phrase: keyword };
}

/**
 * Classify one workout's text against the ten domains.
 *
 * @param text lowercased title + description + barbell_lift (use
 *             classifiableText() so both classifiers read the same string).
 * @returns { domain: matchedKeyword } for every domain that hit.
 */
export function classifyWithReasons(text: string): Partial<Record<Domain, string>> {
  const hits: Partial<Record<Domain, string>> = {};
  for (const domain of DOMAIN_LIST) {
    for (const keyword of DOMAIN_KEYWORDS[domain]) {
      if (findMatch(text, ruleForKeyword(keyword)) !== -1) {
        hits[domain] = keyword;
        break;
      }
    }
  }
  return hits;
}

/** The set of domains a workout touches. */
export function classifyDomains(text: string): Set<Domain> {
  return new Set(Object.keys(classifyWithReasons(text)) as Domain[]);
}
