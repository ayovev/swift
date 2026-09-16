import type { MatchRule } from "./matcher";
import type { Modality } from "@/types/modality";

/**
 * The movement vocabulary behind the M/W/G modality classifier.
 *
 * This is new work for Swift — no validated reference exists (REQUIREMENTS.md
 * §2). It follows CANONICAL CrossFit semantics:
 *
 *   M — Metabolic conditioning, MONOSTRUCTURAL ONLY. Running, rowing, biking,
 *       skiing, jumping rope. Not "anything that makes you breathe hard".
 *   W — Weightlifting. An external load moved by you.
 *   G — Gymnastics. Your own bodyweight moved through space.
 *
 * So Fran (thrusters + pull-ups) is 50 W / 50 G / 0 M, exactly as CrossFit
 * defines it — punishing metabolic work, but not monostructural.
 *
 * EXTENDING THIS LEXICON (FR-3.4)
 * -------------------------------
 * Add an entry with its phrase (lowercase), modality, and display label.
 * Ordering in this array does NOT matter: the classifier claims character
 * ranges longest-phrase-first, so "power clean" always wins over "clean"
 * regardless of where each sits here. Use `mode: "token"` for short
 * abbreviations, and `exclude` for a phrase that is a substring of an
 * unrelated word. Both are handled by the shared matcher, the same engine
 * the GPP classifier uses.
 */
export interface MovementEntry extends MatchRule {
  modality: Modality;
  /** Shown to the athlete in the drill-down list. */
  label: string;
}

export const MOVEMENT_LEXICON: readonly MovementEntry[] = [
  // ---------------------------------------------------------------- M ----
  // Monostructural / cardio. Note "row" and "ski" both need guarding:
  // "row" is a substring of "throw", and "ski" of "skill" — and SKILL WORK is
  // the single most common title in the validation export (89 occurrences).
  { phrase: "run", modality: "M", label: "Run" },
  { phrase: "row", modality: "M", label: "Row", exclude: ["throw", "ring row", "db row", "dumbbell row", "bent over row", "barbell row", "arrow", "narrow"] },
  { phrase: "rower", modality: "M", label: "Row" },
  { phrase: "bike", modality: "M", label: "Bike" },
  { phrase: "assault bike", modality: "M", label: "Assault bike" },
  { phrase: "echo bike", modality: "M", label: "Echo bike" },
  { phrase: "ski", modality: "M", label: "Ski erg", exclude: ["skill"] },
  { phrase: "ski erg", modality: "M", label: "Ski erg" },
  { phrase: "skierg", modality: "M", label: "Ski erg" },
  { phrase: "double-under", modality: "M", label: "Double-unders" },
  { phrase: "double under", modality: "M", label: "Double-unders" },
  { phrase: "du", modality: "M", label: "Double-unders", mode: "token" },
  { phrase: "single-under", modality: "M", label: "Single-unders" },
  { phrase: "single under", modality: "M", label: "Single-unders" },
  { phrase: "jump rope", modality: "M", label: "Jump rope" },
  { phrase: "shuttle run", modality: "M", label: "Shuttle run" },
  { phrase: "sprint", modality: "M", label: "Sprint" },
  { phrase: "swim", modality: "M", label: "Swim" },

  // ---------------------------------------------------------------- W ----
  // Barbell.
  { phrase: "snatch", modality: "W", label: "Snatch" },
  { phrase: "power snatch", modality: "W", label: "Power snatch" },
  { phrase: "hang snatch", modality: "W", label: "Hang snatch" },
  { phrase: "squat snatch", modality: "W", label: "Squat snatch" },
  { phrase: "snatch pull", modality: "W", label: "Snatch pull" },
  { phrase: "clean", modality: "W", label: "Clean" },
  { phrase: "power clean", modality: "W", label: "Power clean" },
  { phrase: "hang clean", modality: "W", label: "Hang clean" },
  { phrase: "squat clean", modality: "W", label: "Squat clean" },
  { phrase: "clean pull", modality: "W", label: "Clean pull" },
  { phrase: "clean and jerk", modality: "W", label: "Clean & jerk" },
  { phrase: "c&j", modality: "W", label: "Clean & jerk" },
  { phrase: "jerk", modality: "W", label: "Jerk" },
  { phrase: "split jerk", modality: "W", label: "Split jerk" },
  { phrase: "push jerk", modality: "W", label: "Push jerk" },
  { phrase: "deadlift", modality: "W", label: "Deadlift" },
  { phrase: "sumo deadlift", modality: "W", label: "Sumo deadlift" },
  { phrase: "back squat", modality: "W", label: "Back squat" },
  { phrase: "front squat", modality: "W", label: "Front squat" },
  { phrase: "overhead squat", modality: "W", label: "Overhead squat" },
  { phrase: "ohs", modality: "W", label: "Overhead squat", mode: "token" },
  // Bare "squat" is weightlifting by default; "air squat" below claims the
  // bodyweight case first because it is the longer phrase.
  { phrase: "squat", modality: "W", label: "Squat" },
  { phrase: "thruster", modality: "W", label: "Thruster" },
  { phrase: "press", modality: "W", label: "Press", exclude: ["impress", "pressure"] },
  { phrase: "shoulder press", modality: "W", label: "Shoulder press" },
  { phrase: "push press", modality: "W", label: "Push press" },
  { phrase: "bench press", modality: "W", label: "Bench press" },
  { phrase: "bench", modality: "W", label: "Bench press" },
  { phrase: "shoulder-to-overhead", modality: "W", label: "Shoulder-to-overhead" },
  { phrase: "shoulder to overhead", modality: "W", label: "Shoulder-to-overhead" },
  { phrase: "lunge", modality: "W", label: "Lunge" },
  { phrase: "good morning", modality: "W", label: "Good morning" },
  { phrase: "barbell row", modality: "W", label: "Barbell row" },
  { phrase: "bent over row", modality: "W", label: "Bent-over row" },
  { phrase: "clean pull to toes", modality: "W", label: "Clean pull" },

  // Dumbbell / kettlebell / odd object.
  { phrase: "dumbbell", modality: "W", label: "Dumbbell work" },
  { phrase: "db", modality: "W", label: "Dumbbell work", mode: "token" },
  { phrase: "db row", modality: "W", label: "Dumbbell row" },
  { phrase: "dumbbell row", modality: "W", label: "Dumbbell row" },
  { phrase: "kettlebell", modality: "W", label: "Kettlebell work" },
  { phrase: "kb", modality: "W", label: "Kettlebell work", mode: "token" },
  { phrase: "kettlebell swing", modality: "W", label: "Kettlebell swing" },
  { phrase: "kb swing", modality: "W", label: "Kettlebell swing" },
  { phrase: "swing", modality: "W", label: "Kettlebell swing" },
  { phrase: "turkish get-up", modality: "W", label: "Turkish get-up" },
  { phrase: "wall ball", modality: "W", label: "Wall balls" },
  { phrase: "wall-ball", modality: "W", label: "Wall balls" },
  { phrase: "wallball", modality: "W", label: "Wall balls" },
  { phrase: "medicine ball", modality: "W", label: "Medicine ball" },
  { phrase: "med ball", modality: "W", label: "Medicine ball" },
  { phrase: "sandbag", modality: "W", label: "Sandbag" },
  { phrase: "sled", modality: "W", label: "Sled" },
  { phrase: "farmer", modality: "W", label: "Farmer carry" },
  // "carries" needs no separate entry: the shared matcher also searches the
  // consonant+y -> i stem, so "carry" reaches carries/carried. See matcher.ts.
  { phrase: "carry", modality: "W", label: "Loaded carry", exclude: ["carryover"] },
  { phrase: "step-over", modality: "W", label: "Box step-over" },
  { phrase: "step-up", modality: "W", label: "Box step-up" },
  { phrase: "devil press", modality: "W", label: "Devil press" },

  // ---------------------------------------------------------------- G ----
  { phrase: "pull-up", modality: "G", label: "Pull-ups" },
  { phrase: "pull up", modality: "G", label: "Pull-ups" },
  { phrase: "pullup", modality: "G", label: "Pull-ups" },
  { phrase: "chin-up", modality: "G", label: "Chin-ups" },
  { phrase: "chest-to-bar", modality: "G", label: "Chest-to-bar" },
  { phrase: "chest to bar", modality: "G", label: "Chest-to-bar" },
  { phrase: "c2b", modality: "G", label: "Chest-to-bar", mode: "token" },
  { phrase: "muscle-up", modality: "G", label: "Muscle-ups" },
  { phrase: "muscle up", modality: "G", label: "Muscle-ups" },
  { phrase: "bar muscle", modality: "G", label: "Bar muscle-ups" },
  { phrase: "mu", modality: "G", label: "Muscle-ups", mode: "token" },
  { phrase: "push-up", modality: "G", label: "Push-ups" },
  { phrase: "push up", modality: "G", label: "Push-ups" },
  { phrase: "pushup", modality: "G", label: "Push-ups" },
  { phrase: "handstand", modality: "G", label: "Handstand work" },
  { phrase: "handstand push-up", modality: "G", label: "Handstand push-ups" },
  { phrase: "hspu", modality: "G", label: "Handstand push-ups", mode: "token" },
  { phrase: "dip", modality: "G", label: "Dips" },
  { phrase: "ring row", modality: "G", label: "Ring rows" },
  { phrase: "ring dip", modality: "G", label: "Ring dips" },
  { phrase: "toes-to-bar", modality: "G", label: "Toes-to-bar" },
  { phrase: "toes to bar", modality: "G", label: "Toes-to-bar" },
  { phrase: "t2b", modality: "G", label: "Toes-to-bar", mode: "token" },
  { phrase: "ttb", modality: "G", label: "Toes-to-bar", mode: "token" },
  { phrase: "knees-to-elbow", modality: "G", label: "Knees-to-elbows" },
  { phrase: "knee raise", modality: "G", label: "Knee raises" },
  { phrase: "burpee", modality: "G", label: "Burpees" },
  { phrase: "box jump", modality: "G", label: "Box jumps" },
  { phrase: "broad jump", modality: "G", label: "Broad jumps" },
  { phrase: "air squat", modality: "G", label: "Air squats" },
  { phrase: "pistol", modality: "G", label: "Pistols" },
  { phrase: "rope climb", modality: "G", label: "Rope climbs" },
  { phrase: "sit-up", modality: "G", label: "Sit-ups" },
  { phrase: "sit up", modality: "G", label: "Sit-ups" },
  { phrase: "situp", modality: "G", label: "Sit-ups" },
  { phrase: "ghd", modality: "G", label: "GHD work", mode: "token" },
  { phrase: "l-sit", modality: "G", label: "L-sit" },
  { phrase: "plank", modality: "G", label: "Plank" },
  { phrase: "hollow", modality: "G", label: "Hollow hold" },
  { phrase: "v-up", modality: "G", label: "V-ups" },
  { phrase: "bar hang", modality: "G", label: "Bar hang" },
  { phrase: "pull over", modality: "G", label: "Pull-overs" },
];

/** Longest phrase first — the order the classifier claims text ranges in. */
export const LEXICON_BY_SPECIFICITY: readonly MovementEntry[] = [...MOVEMENT_LEXICON].sort(
  (a, b) => b.phrase.length - a.phrase.length
);
