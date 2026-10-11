import type { MatchRule } from "./matcher";
import type { Implement, Modality } from "@/types/modality";

/**
 * The movement vocabulary behind the M/W/G modality classifier.
 *
 * This is new work for Swift — no validated reference implementation exists
 * for it. It follows CANONICAL CrossFit semantics:
 *
 *   M — Metabolic conditioning, MONOSTRUCTURAL ONLY. Running, rowing, biking,
 *       skiing, jumping rope. Not "anything that makes you breathe hard".
 *   W — Weightlifting. An external load moved by you.
 *   G — Gymnastics. Your own bodyweight moved through space.
 *
 * So Fran (thrusters + pull-ups) is 50 W / 50 G / 0 M, exactly as CrossFit
 * defines it — punishing metabolic work, but not monostructural.
 *
 * EXTENDING THIS LEXICON
 * ----------------------
 * Add an entry with its phrase (lowercase), modality, and display label.
 * Ordering in this array does NOT matter: the classifier claims character
 * ranges longest-phrase-first, so "power clean" always wins over "clean"
 * regardless of where each sits here. Use `mode: "token"` for short
 * abbreviations, and `exclude` for a phrase that is a substring of an
 * unrelated word. Both are handled by the shared matcher, the same engine
 * the GPP classifier uses.
 */
export interface MovementEntry extends MatchRule {
  /**
   * Stable identifier (kebab-case), the key anything that stores or filters by
   * movement should use. Every alias of one movement shares one id. Never
   * derived from `label` at runtime: relabelling must not change what a saved
   * or filtered movement means.
   */
  id: string;
  modality: Modality;
  /** Shown to the athlete in the drill-down list. */
  label: string;
  /** Set only where the movement is defined by its implement ("kettlebell swing"). */
  implement?: Implement;
}

export const MOVEMENT_LEXICON: readonly MovementEntry[] = [
  // ---------------------------------------------------------------- M ----
  // Monostructural / cardio. Note "row" and "ski" both need guarding:
  // "row" is a substring of "throw", and "ski" of "skill" — and SKILL WORK is
  // the single most common title in the validation export (89 occurrences).
  // "store run" is a title's errand, not a workout.
  { id: "run", phrase: "run", modality: "M", label: "Run", exclude: ["store run"] },
  { id: "row", phrase: "row", modality: "M", label: "Row", exclude: ["throw", "slow your row", "ring row", "db row", "dumbbell row", "bent over row", "barbell row", "arrow", "narrow"] },
  { id: "row", phrase: "rower", modality: "M", label: "Row" },
  { id: "bike", phrase: "bike", modality: "M", label: "Bike" },
  { id: "assault-bike", phrase: "assault bike", modality: "M", label: "Assault bike" },
  { id: "echo-bike", phrase: "echo bike", modality: "M", label: "Echo bike" },
  { id: "ski-erg", phrase: "ski", modality: "M", label: "Ski erg", exclude: ["skill", "skin"] },
  { id: "ski-erg", phrase: "ski erg", modality: "M", label: "Ski erg" },
  { id: "ski-erg", phrase: "skierg", modality: "M", label: "Ski erg" },
  { id: "double-unders", phrase: "double-under", modality: "M", label: "Double-unders" },
  { id: "double-unders", phrase: "double under", modality: "M", label: "Double-unders" },
  { id: "double-unders", phrase: "du", modality: "M", label: "Double-unders", mode: "token" },
  { id: "single-unders", phrase: "single-under", modality: "M", label: "Single-unders" },
  { id: "single-unders", phrase: "single under", modality: "M", label: "Single-unders" },
  { id: "jump-rope", phrase: "jump rope", modality: "M", label: "Jump rope" },
  { id: "shuttle-run", phrase: "shuttle run", modality: "M", label: "Shuttle run" },
  { id: "sprint", phrase: "sprint", modality: "M", label: "Sprint" },
  { id: "swim", phrase: "swim", modality: "M", label: "Swim" },

  // ---------------------------------------------------------------- W ----
  // Barbell.
  { id: "snatch", phrase: "snatch", modality: "W", label: "Snatch" },
  { id: "power-snatch", phrase: "power snatch", modality: "W", label: "Power snatch" },
  { id: "hang-snatch", phrase: "hang snatch", modality: "W", label: "Hang snatch" },
  // Named lifts SugarWOD types in `barbell_lift`. Without these the generic word inside them
  // (snatch in "snatch grip deadlift", snatch in "snatch balance") read as the wrong lift.
  { id: "muscle-snatch", phrase: "muscle snatch", modality: "W", label: "Muscle snatch" },
  { id: "snatch-balance", phrase: "snatch balance", modality: "W", label: "Snatch balance" },
  { id: "snatch-grip-deadlift", phrase: "snatch grip deadlift", modality: "W", label: "Snatch grip deadlift" },
  { id: "power-clean-and-jerk", phrase: "power clean & jerk", modality: "W", label: "Power clean & jerk" },
  { id: "power-clean-and-jerk", phrase: "power clean and jerk", modality: "W", label: "Power clean & jerk" },
  { id: "back-squat", phrase: "back pause squat", modality: "W", label: "Back squat" },
  { id: "front-squat", phrase: "front pause squat", modality: "W", label: "Front squat" },
  { id: "squat-snatch", phrase: "squat snatch", modality: "W", label: "Squat snatch" },
  { id: "snatch-pull", phrase: "snatch pull", modality: "W", label: "Snatch pull" },
  { id: "clean", phrase: "clean", modality: "W", label: "Clean" },
  { id: "power-clean", phrase: "power clean", modality: "W", label: "Power clean" },
  { id: "hang-clean", phrase: "hang clean", modality: "W", label: "Hang clean" },
  { id: "hang-power-clean", phrase: "hang power clean", modality: "W", label: "Hang power clean" },
  { id: "hang-power-snatch", phrase: "hang power snatch", modality: "W", label: "Hang power snatch" },
  { id: "goblet-squat", phrase: "goblet squat", modality: "W", label: "Goblet squat" },
  { id: "squat-clean", phrase: "squat clean", modality: "W", label: "Squat clean" },
  { id: "clean-pull", phrase: "clean pull", modality: "W", label: "Clean pull" },
  // Named on CrossFit's movement list. Each would otherwise read as its generic
  // parent (a medicine-ball clean as a clean, a high pull as a sumo deadlift).
  { id: "medicine-ball-clean", phrase: "medicine-ball clean", modality: "W", label: "Medicine-ball clean" },
  { id: "medicine-ball-clean", phrase: "medicine ball clean", modality: "W", label: "Medicine-ball clean" },
  { id: "medicine-ball-clean", phrase: "med ball clean", modality: "W", label: "Medicine-ball clean" },
  { id: "sumo-deadlift-high-pull", phrase: "sumo deadlift high pull", modality: "W", label: "Sumo deadlift high pull" },
  { id: "sumo-deadlift-high-pull", phrase: "sdhp", modality: "W", label: "Sumo deadlift high pull", mode: "token" },
  { id: "squat-clean-and-jerk", phrase: "squat clean and jerk", modality: "W", label: "Squat clean & jerk" },
  { id: "squat-clean-and-jerk", phrase: "squat clean & jerk", modality: "W", label: "Squat clean & jerk" },
  // A snatch deadlift is a deadlift with the snatch grip, one movement and not a snatch and a deadlift.
  { id: "snatch-grip-deadlift", phrase: "snatch deadlift", modality: "W", label: "Snatch grip deadlift" },
  { id: "snatch-grip-deadlift", phrase: "snatch-grip deadlift", modality: "W", label: "Snatch grip deadlift" },
  { id: "snatch-grip-deadlift", phrase: "snatch-grip-deadlift", modality: "W", label: "Snatch grip deadlift" },
  { id: "clean-grip-deadlift", phrase: "clean grip deadlift", modality: "W", label: "Clean grip deadlift" },
  { id: "clean-and-jerk", phrase: "clean and jerk", modality: "W", label: "Clean & jerk" },
  { id: "clean-and-jerk", phrase: "c&j", modality: "W", label: "Clean & jerk" },
  // SugarWOD titles use the ampersand about as often as "and"; without this the
  // lift reads as a separate Clean and Jerk.
  { id: "clean-and-jerk", phrase: "clean & jerk", modality: "W", label: "Clean & jerk" },
  { id: "jerk", phrase: "jerk", modality: "W", label: "Jerk" },
  { id: "split-jerk", phrase: "split jerk", modality: "W", label: "Split jerk" },
  { id: "push-jerk", phrase: "push jerk", modality: "W", label: "Push jerk" },
  { id: "deadlift", phrase: "deadlift", modality: "W", label: "Deadlift" },
  { id: "sumo-deadlift", phrase: "sumo deadlift", modality: "W", label: "Sumo deadlift" },
  { id: "back-squat", phrase: "back squat", modality: "W", label: "Back squat" },
  { id: "front-squat", phrase: "front squat", modality: "W", label: "Front squat" },
  { id: "overhead-squat", phrase: "overhead squat", modality: "W", label: "Overhead squat" },
  { id: "overhead-squat", phrase: "ohs", modality: "W", label: "Overhead squat", mode: "token" },
  // Bare "squat" is weightlifting by default; "air squat" below claims the
  // bodyweight case first because it is the longer phrase.
  { id: "squat", phrase: "squat", modality: "W", label: "Squat" },
  { id: "thruster", phrase: "thruster", modality: "W", label: "Thruster" },
  { id: "press", phrase: "press", modality: "W", label: "Press", exclude: ["impress", "pressure"] },
  { id: "shoulder-press", phrase: "shoulder press", modality: "W", label: "Shoulder press" },
  { id: "push-press", phrase: "push press", modality: "W", label: "Push press" },
  { id: "bench-press", phrase: "bench press", modality: "W", label: "Bench press" },
  // "use bench" is a split squat's prop, not a press.
  { id: "bench-press", phrase: "bench", modality: "W", label: "Bench press", exclude: ["use bench"] },
  { id: "shoulder-to-overhead", phrase: "shoulder-to-overhead", modality: "W", label: "Shoulder-to-overhead" },
  { id: "shoulder-to-overhead", phrase: "shoulder to overhead", modality: "W", label: "Shoulder-to-overhead" },
  { id: "lunge", phrase: "lunge", modality: "W", label: "Lunge" },
  // Style and loading variants from CrossFit's movement list. A variant is its own id so an
  // athlete can pick "Split clean" alone; its family (movementFamilies.ts) still holds it, so picking
  // "Clean" keeps finding it. The longer phrase wins the range, so the generic id no longer fires.
  { id: "split-clean", phrase: "split clean", modality: "W", label: "Split clean" },
  { id: "split-snatch", phrase: "split snatch", modality: "W", label: "Split snatch" },
  // A prefixed complex ("power clean and push jerk") is a different lift, so it falls through
  // to its parts instead of being swallowed by the plain one.
  { id: "clean-and-push-jerk", phrase: "clean and push jerk", modality: "W", label: "Clean & push jerk", exclude: ["power clean and push jerk", "squat clean and push jerk"] },
  { id: "clean-and-push-jerk", phrase: "clean & push jerk", modality: "W", label: "Clean & push jerk", exclude: ["power clean & push jerk", "squat clean & push jerk"] },
  { id: "hang-clean-and-push-jerk", phrase: "hang clean and push jerk", modality: "W", label: "Hang clean & push jerk" },
  { id: "hang-clean-and-push-jerk", phrase: "hang clean & push jerk", modality: "W", label: "Hang clean & push jerk" },
  { id: "power-clean-and-split-jerk", phrase: "power clean and split jerk", modality: "W", label: "Power clean & split jerk" },
  { id: "power-clean-and-split-jerk", phrase: "power clean & split jerk", modality: "W", label: "Power clean & split jerk" },
  { id: "zercher-squat", phrase: "zercher squat", modality: "W", label: "Zercher squat" },
  { id: "sots-press", phrase: "sots press", modality: "W", label: "Sots press" },
  { id: "walking-lunges", phrase: "walking lunge", modality: "W", label: "Walking lunges" },
  { id: "front-rack-lunges", phrase: "front-rack lunge", modality: "W", label: "Front-rack lunges" },
  { id: "front-rack-lunges", phrase: "front rack lunge", modality: "W", label: "Front-rack lunges" },
  { id: "overhead-walking-lunges", phrase: "overhead walking lunge", modality: "W", label: "Overhead walking lunges" },
  { id: "good-morning", phrase: "good morning", modality: "W", label: "Good morning" },
  { id: "barbell-row", phrase: "barbell row", modality: "W", label: "Barbell row", implement: "barbell" },
  { id: "bent-over-row", phrase: "bent over row", modality: "W", label: "Bent-over row" },
  { id: "bent-over-row", phrase: "bent-over row", modality: "W", label: "Bent-over row" },
  { id: "clean-pull", phrase: "clean pull to toes", modality: "W", label: "Clean pull" },

  // Dumbbell / kettlebell / odd object.
  // No bare "dumbbell"/"db"/"kettlebell"/"kb" entries: they name the implement, not
  // the movement, and counted as one, so a db snatch read as two W movements.
  // Measured on the sample export: dropping them changed 104 rows' shares and
  // left 2 rows (an implement-only title) unclassified.
  { id: "dumbbell-row", phrase: "db row", modality: "W", label: "Dumbbell row", implement: "dumbbell" },
  { id: "dumbbell-row", phrase: "dumbbell row", modality: "W", label: "Dumbbell row", implement: "dumbbell" },
  { id: "kettlebell-swing", phrase: "kettlebell swing", modality: "W", label: "Kettlebell swing", implement: "kettlebell" },
  { id: "kettlebell-swing", phrase: "kb swing", modality: "W", label: "Kettlebell swing", implement: "kettlebell" },
  // Titles like "Tire Swing" and "Swing State" are names, not kettlebell work.
  { id: "kettlebell-swing", phrase: "swing", modality: "W", label: "Kettlebell swing", implement: "kettlebell", exclude: ["tire swing", "swing state", "swing high", "swing to backward roll"] },
  { id: "turkish-get-up", phrase: "turkish get-up", modality: "W", label: "Turkish get-up" },
  { id: "wall-balls", phrase: "wall ball", modality: "W", label: "Wall balls" },
  { id: "wall-balls", phrase: "wall-ball", modality: "W", label: "Wall balls" },
  { id: "wall-balls", phrase: "wallball", modality: "W", label: "Wall balls" },
  { id: "slam-ball", phrase: "slam ball", modality: "W", label: "Slam ball" },
  { id: "medicine-ball", phrase: "medicine ball", modality: "W", label: "Medicine ball" },
  { id: "medicine-ball", phrase: "med ball", modality: "W", label: "Medicine ball" },
  { id: "sandbag", phrase: "sandbag", modality: "W", label: "Sandbag" },
  { id: "sled", phrase: "sled", modality: "W", label: "Sled" },
  { id: "farmer-carry", phrase: "farmer", modality: "W", label: "Farmer carry" },
  // The longer phrase claims "carry", so a farmers carry is one movement and not also a loaded carry.
  { id: "farmer-carry", phrase: "farmers carry", modality: "W", label: "Farmer carry" },
  { id: "farmer-carry", phrase: "farmer carry", modality: "W", label: "Farmer carry" },
  { id: "farmer-carry", phrase: "farmer's carry", modality: "W", label: "Farmer carry" },
  { id: "farmer-carry", phrase: "farmers' carry", modality: "W", label: "Farmer carry" },
  // "carries" needs no separate entry: the shared matcher also searches the
  // consonant+y -> i stem, so "carry" reaches carries/carried. See matcher.ts.
  { id: "loaded-carry", phrase: "carry", modality: "W", label: "Loaded carry", exclude: ["carryover"] },
  { id: "box-step-over", phrase: "step-over", modality: "W", label: "Box step-over" },
  { id: "box-step-up", phrase: "step-up", modality: "W", label: "Box step-up" },
  { id: "devil-press", phrase: "devil press", modality: "W", label: "Devil press" },
  { id: "devil-press", phrase: "devils press", modality: "W", label: "Devil press" },

  // ---------------------------------------------------------------- G ----
  { id: "pull-ups", phrase: "pull-up", modality: "G", label: "Pull-ups" },
  { id: "pull-ups", phrase: "pull up", modality: "G", label: "Pull-ups" },
  { id: "pull-ups", phrase: "pullup", modality: "G", label: "Pull-ups" },
  { id: "chin-ups", phrase: "chin-up", modality: "G", label: "Chin-ups" },
  { id: "chest-to-bar", phrase: "chest-to-bar", modality: "G", label: "Chest-to-bar" },
  { id: "chest-to-bar", phrase: "chest to bar", modality: "G", label: "Chest-to-bar" },
  { id: "chest-to-bar", phrase: "c2b", modality: "G", label: "Chest-to-bar", mode: "token" },
  { id: "muscle-ups", phrase: "muscle-up", modality: "G", label: "Muscle-ups" },
  { id: "muscle-ups", phrase: "muscle up", modality: "G", label: "Muscle-ups" },
  { id: "bar-muscle-ups", phrase: "bar muscle", modality: "G", label: "Bar muscle-ups" },
  { id: "ring-muscle-ups", phrase: "ring muscle", modality: "G", label: "Ring muscle-ups" },
  { id: "muscle-ups", phrase: "mu", modality: "G", label: "Muscle-ups", mode: "token" },
  { id: "push-ups", phrase: "push-up", modality: "G", label: "Push-ups" },
  { id: "push-ups", phrase: "push up", modality: "G", label: "Push-ups" },
  { id: "push-ups", phrase: "pushup", modality: "G", label: "Push-ups" },
  { id: "handstand-work", phrase: "handstand", modality: "G", label: "Handstand work" },
  { id: "handstand-walk", phrase: "handstand walk", modality: "G", label: "Handstand walk" },
  { id: "handstand-hold", phrase: "handstand hold", modality: "G", label: "Handstand hold" },
  { id: "wall-walks", phrase: "wall walk", modality: "G", label: "Wall walks" },
  { id: "pike-push-ups", phrase: "pike push", modality: "G", label: "Pike push-ups" },
  { id: "russian-twists", phrase: "russian twist", modality: "G", label: "Russian twists" },
  { id: "bear-crawls", phrase: "bear crawl", modality: "G", label: "Bear crawls" },
  { id: "handstand-push-ups", phrase: "handstand push-up", modality: "G", label: "Handstand push-ups" },
  { id: "handstand-push-ups", phrase: "hspu", modality: "G", label: "Handstand push-ups", mode: "token" },
  // "jerk dip" and "dip position" are the lift's own phase, not the gymnastics dip.
  { id: "dips", phrase: "dip", modality: "G", label: "Dips", exclude: ["jerk dip", "dip position"] },
  { id: "ring-rows", phrase: "ring row", modality: "G", label: "Ring rows" },
  { id: "ring-dips", phrase: "ring dip", modality: "G", label: "Ring dips" },
  { id: "toes-to-bar", phrase: "toes-to-bar", modality: "G", label: "Toes-to-bar" },
  { id: "toes-to-bar", phrase: "toes to bar", modality: "G", label: "Toes-to-bar" },
  { id: "toes-to-bar", phrase: "t2b", modality: "G", label: "Toes-to-bar", mode: "token" },
  { id: "toes-to-bar", phrase: "ttb", modality: "G", label: "Toes-to-bar", mode: "token" },
  { id: "knees-to-elbows", phrase: "knees-to-elbow", modality: "G", label: "Knees-to-elbows" },
  { id: "knee-raises", phrase: "knee raise", modality: "G", label: "Knee raises" },
  { id: "burpees", phrase: "burpee", modality: "G", label: "Burpees" },
  { id: "box-jumps", phrase: "box jump", modality: "G", label: "Box jumps" },
  { id: "broad-jumps", phrase: "broad jump", modality: "G", label: "Broad jumps" },
  { id: "air-squats", phrase: "air squat", modality: "G", label: "Air squats" },
  { id: "pistols", phrase: "pistol", modality: "G", label: "Pistols" },
  { id: "rope-climbs", phrase: "rope climb", modality: "G", label: "Rope climbs" },
  { id: "sit-ups", phrase: "sit-up", modality: "G", label: "Sit-ups" },
  { id: "sit-ups", phrase: "sit up", modality: "G", label: "Sit-ups" },
  { id: "sit-ups", phrase: "situp", modality: "G", label: "Sit-ups" },
  { id: "ghd-work", phrase: "ghd", modality: "G", label: "GHD work", mode: "token" },
  { id: "l-sit", phrase: "l-sit", modality: "G", label: "L-sit" },
  { id: "plank", phrase: "plank", modality: "G", label: "Plank" },
  { id: "hollow-hold", phrase: "hollow", modality: "G", label: "Hollow hold" },
  { id: "hollow-rocks", phrase: "hollow rock", modality: "G", label: "Hollow rocks" },
  { id: "v-ups", phrase: "v-up", modality: "G", label: "V-ups" },
  { id: "bar-hang", phrase: "bar hang", modality: "G", label: "Bar hang" },
  { id: "pull-overs", phrase: "pull over", modality: "G", label: "Pull-overs" },
  { id: "pull-overs", phrase: "pull-over", modality: "G", label: "Pull-overs" },
  // Variants named on CrossFit's movement list (see the note above the barbell variants).
  { id: "strict-pull-ups", phrase: "strict pull-up", modality: "G", label: "Strict pull-ups" },
  { id: "strict-pull-ups", phrase: "strict pull up", modality: "G", label: "Strict pull-ups" },
  { id: "strict-pull-ups", phrase: "strict pullup", modality: "G", label: "Strict pull-ups" },
  { id: "kipping-pull-ups", phrase: "kipping pull-up", modality: "G", label: "Kipping pull-ups" },
  { id: "kipping-pull-ups", phrase: "kipping pull up", modality: "G", label: "Kipping pull-ups" },
  { id: "kipping-pull-ups", phrase: "kipping pullup", modality: "G", label: "Kipping pull-ups" },
  { id: "butterfly-pull-ups", phrase: "butterfly pull-up", modality: "G", label: "Butterfly pull-ups" },
  { id: "butterfly-pull-ups", phrase: "butterfly pull up", modality: "G", label: "Butterfly pull-ups" },
  { id: "butterfly-pull-ups", phrase: "butterfly pullup", modality: "G", label: "Butterfly pull-ups" },
  { id: "l-pull-ups", phrase: "l pull-up", modality: "G", label: "L pull-ups", mode: "token" },
  { id: "l-pull-ups", phrase: "l pull up", modality: "G", label: "L pull-ups", mode: "token" },
  { id: "strict-chest-to-bar", phrase: "strict chest-to-bar pull-up", modality: "G", label: "Strict chest-to-bar" },
  { id: "strict-chest-to-bar", phrase: "strict chest to bar pull-up", modality: "G", label: "Strict chest-to-bar" },
  { id: "strict-chest-to-bar", phrase: "strict chest-to-bar", modality: "G", label: "Strict chest-to-bar" },
  { id: "strict-chest-to-bar", phrase: "strict chest to bar", modality: "G", label: "Strict chest-to-bar" },
  { id: "strict-muscle-ups", phrase: "strict muscle-up", modality: "G", label: "Strict muscle-ups" },
  { id: "strict-muscle-ups", phrase: "strict muscle up", modality: "G", label: "Strict muscle-ups" },
  { id: "strict-bar-muscle-ups", phrase: "strict bar muscle-up", modality: "G", label: "Strict bar muscle-ups" },
  { id: "strict-bar-muscle-ups", phrase: "strict bar muscle up", modality: "G", label: "Strict bar muscle-ups" },
  { id: "strict-handstand-push-ups", phrase: "strict handstand push-up", modality: "G", label: "Strict handstand push-ups" },
  { id: "strict-handstand-push-ups", phrase: "strict handstand push up", modality: "G", label: "Strict handstand push-ups" },
  { id: "strict-handstand-push-ups", phrase: "strict handstand pushup", modality: "G", label: "Strict handstand push-ups" },
  { id: "kipping-chest-to-bar", phrase: "kipping chest-to-bar pull-up", modality: "G", label: "Kipping chest-to-bar" },
  { id: "kipping-chest-to-bar", phrase: "kipping chest to bar pull-up", modality: "G", label: "Kipping chest-to-bar" },
  { id: "kipping-chest-to-bar", phrase: "kipping chest-to-bar", modality: "G", label: "Kipping chest-to-bar" },
  { id: "kipping-chest-to-bar", phrase: "kipping chest to bar", modality: "G", label: "Kipping chest-to-bar" },
  { id: "kipping-muscle-ups", phrase: "kipping muscle-up", modality: "G", label: "Kipping muscle-ups" },
  { id: "kipping-muscle-ups", phrase: "kipping muscle up", modality: "G", label: "Kipping muscle-ups" },
  { id: "kipping-bar-muscle-ups", phrase: "kipping bar muscle-up", modality: "G", label: "Kipping bar muscle-ups" },
  { id: "kipping-bar-muscle-ups", phrase: "kipping bar muscle up", modality: "G", label: "Kipping bar muscle-ups" },
  { id: "kipping-handstand-push-ups", phrase: "kipping handstand push-up", modality: "G", label: "Kipping handstand push-ups" },
  { id: "kipping-handstand-push-ups", phrase: "kipping handstand push up", modality: "G", label: "Kipping handstand push-ups" },
  { id: "kipping-handstand-push-ups", phrase: "kipping handstand pushup", modality: "G", label: "Kipping handstand push-ups" },
  { id: "kipping-handstand-push-ups", phrase: "kipping hspu", modality: "G", label: "Kipping handstand push-ups", mode: "token" },
  { id: "strict-handstand-push-ups", phrase: "strict hspu", modality: "G", label: "Strict handstand push-ups", mode: "token" },
  { id: "deficit-handstand-push-ups", phrase: "deficit handstand push-up", modality: "G", label: "Deficit handstand push-ups" },
  { id: "deficit-handstand-push-ups", phrase: "deficit handstand push up", modality: "G", label: "Deficit handstand push-ups" },
  { id: "deficit-handstand-push-ups", phrase: "kipping deficit handstand push-up", modality: "G", label: "Deficit handstand push-ups" },
  { id: "deficit-handstand-push-ups", phrase: "kipping deficit handstand push up", modality: "G", label: "Deficit handstand push-ups" },
  { id: "freestanding-handstand-push-ups", phrase: "freestanding handstand push-up", modality: "G", label: "Freestanding handstand push-ups" },
  { id: "freestanding-handstand-push-ups", phrase: "freestanding handstand push up", modality: "G", label: "Freestanding handstand push-ups" },
  { id: "chest-to-wall-handstand-push-ups", phrase: "chest-to-wall handstand push-up", modality: "G", label: "Chest-to-wall handstand push-ups" },
  { id: "chest-to-wall-handstand-push-ups", phrase: "chest to wall handstand push up", modality: "G", label: "Chest-to-wall handstand push-ups" },
  { id: "handstand-pirouette", phrase: "handstand pirouette", modality: "G", label: "Handstand pirouette" },
  { id: "straddle-press-to-handstand", phrase: "straddle press to handstand", modality: "G", label: "Straddle press to handstand" },
  { id: "strict-toes-to-bar", phrase: "strict toes-to-bar", modality: "G", label: "Strict toes-to-bar" },
  { id: "strict-toes-to-bar", phrase: "strict toes to bar", modality: "G", label: "Strict toes-to-bar" },
  { id: "kipping-toes-to-bar", phrase: "kipping toes-to-bar", modality: "G", label: "Kipping toes-to-bar" },
  { id: "kipping-toes-to-bar", phrase: "kipping toes to bar", modality: "G", label: "Kipping toes-to-bar" },
  { id: "strict-knees-to-elbows", phrase: "strict knees-to-elbow", modality: "G", label: "Strict knees-to-elbows" },
  { id: "strict-knees-to-elbows", phrase: "strict knees to elbow", modality: "G", label: "Strict knees-to-elbows" },
  { id: "ring-push-ups", phrase: "ring push-up", modality: "G", label: "Ring push-ups" },
  { id: "ring-push-ups", phrase: "ring push up", modality: "G", label: "Ring push-ups" },
  { id: "abmat-sit-ups", phrase: "abmat sit-up", modality: "G", label: "AbMat sit-ups" },
  { id: "abmat-sit-ups", phrase: "abmat sit up", modality: "G", label: "AbMat sit-ups" },
  { id: "ghd-sit-ups", phrase: "ghd sit-up", modality: "G", label: "GHD sit-ups" },
  { id: "ghd-sit-ups", phrase: "ghd sit up", modality: "G", label: "GHD sit-ups" },
  { id: "ghd-sit-ups", phrase: "ghd situp", modality: "G", label: "GHD sit-ups" },
  { id: "ghd-back-extensions", phrase: "ghd back extension", modality: "G", label: "GHD back extensions" },
  { id: "ghd-hip-extensions", phrase: "ghd hip extension", modality: "G", label: "GHD hip extensions" },
  { id: "ghd-hip-and-back-extensions", phrase: "ghd hip and back extension", modality: "G", label: "GHD hip and back extensions" },
  { id: "ghd-hip-and-back-extensions", phrase: "ghd hip & back extension", modality: "G", label: "GHD hip and back extensions" },
  { id: "ghd-hip-and-back-extensions", phrase: "ghd hip, back, and hip-back extension", modality: "G", label: "GHD hip and back extensions" },
  { id: "legless-rope-climbs", phrase: "legless rope climb", modality: "G", label: "Legless rope climbs" },
  { id: "l-sit-rope-climbs", phrase: "l-sit rope climb", modality: "G", label: "L-sit rope climbs" },
  { id: "l-sit-rope-climbs", phrase: "l sit rope climb", modality: "G", label: "L-sit rope climbs" },
  { id: "hanging-l-sit", phrase: "hanging l-sit", modality: "G", label: "Hanging L-sit" },
  { id: "l-sit-on-rings", phrase: "l-sit on rings", modality: "G", label: "L-sit on rings" },
  { id: "l-sit-to-shoulder-stand", phrase: "l-sit to shoulder stand", modality: "G", label: "L-sit to shoulder stand" },
  { id: "inverted-burpees", phrase: "inverted burpee", modality: "G", label: "Inverted burpees" },
  // A burpee that ends in a pull-up is one movement; "jumping" is how SugarWOD words the pull-up.
  { id: "burpee-pull-ups", phrase: "burpee pull-up", modality: "G", label: "Burpee pull-ups" },
  { id: "burpee-pull-ups", phrase: "burpee pull up", modality: "G", label: "Burpee pull-ups" },
  { id: "burpee-pull-ups", phrase: "burpee pullup", modality: "G", label: "Burpee pull-ups" },
  { id: "burpee-pull-ups", phrase: "burpee jumping pull-up", modality: "G", label: "Burpee pull-ups" },
  { id: "burpee-pull-ups", phrase: "burpee jumping pull up", modality: "G", label: "Burpee pull-ups" },
  // The bar here is stepped over by the athlete; without this it reads as a box step-over (W).
  { id: "lateral-burpee-bar-step-overs", phrase: "lateral burpee bar step-over", modality: "G", label: "Lateral burpee bar step-overs" },
  { id: "burpee-box-jump-overs", phrase: "burpee box jump-over", modality: "G", label: "Burpee box jump-overs" },
  { id: "burpee-box-jump-overs", phrase: "burpee box jump over", modality: "G", label: "Burpee box jump-overs" },
  { id: "burpee-box-jump-overs", phrase: "burpee box over", modality: "G", label: "Burpee box jump-overs" },
  { id: "pistols", phrase: "single-leg squat", modality: "G", label: "Pistols" },
  { id: "pistols", phrase: "single leg squat", modality: "G", label: "Pistols" },
  { id: "handstand-push-ups", phrase: "handstand push up", modality: "G", label: "Handstand push-ups" },
  { id: "handstand-push-ups", phrase: "handstand pushup", modality: "G", label: "Handstand push-ups" },
  { id: "knees-to-elbows", phrase: "knees to elbow", modality: "G", label: "Knees-to-elbows" },
  { id: "chest-to-bar", phrase: "chest-to-bar pull-up", modality: "G", label: "Chest-to-bar" },
  { id: "chest-to-bar", phrase: "chest-to-bar pull up", modality: "G", label: "Chest-to-bar" },
  { id: "chest-to-bar", phrase: "chest to bar pull-up", modality: "G", label: "Chest-to-bar" },
  { id: "chest-to-bar", phrase: "chest to bar pull up", modality: "G", label: "Chest-to-bar" },
  // Ring and bar skills named on CrossFit's movement list.
  { id: "skin-the-cat", phrase: "skin the cat", modality: "G", label: "Skin the cat" },
  { id: "swing-to-backward-roll", phrase: "swing to backward roll", modality: "G", label: "Swing to backward roll" },
  { id: "forward-roll", phrase: "forward roll", modality: "G", label: "Forward roll" },
  { id: "back-scale", phrase: "back scale", modality: "G", label: "Back scale" },
  { id: "front-scale", phrase: "front scale", modality: "G", label: "Front scale" },
  { id: "glide-kip", phrase: "glide kip", modality: "G", label: "Glide kip" },
  { id: "shoot-through", phrase: "shoot-through", modality: "G", label: "Shoot-through" },
  { id: "shoot-through", phrase: "shoot through", modality: "G", label: "Shoot-through" },
  { id: "toes-to-rings", phrase: "toes-to-rings", modality: "G", label: "Toes-to-rings" },
  { id: "toes-to-rings", phrase: "toes to rings", modality: "G", label: "Toes-to-rings" },
  { id: "windshield-wipers", phrase: "windshield wiper", modality: "G", label: "Windshield wipers" },
];

/** Longest phrase first — the order the classifier claims text ranges in. */
export const LEXICON_BY_SPECIFICITY: readonly MovementEntry[] = [...MOVEMENT_LEXICON].sort(
  (a, b) => b.phrase.length - a.phrase.length
);
