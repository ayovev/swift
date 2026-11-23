import type { MatchRule } from "./matcher";
import type { Implement, Modality } from "@/types/modality";
import type { SkillLevel, SkillRef } from "@/types/skills";

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
  /**
   * The Skills report (docs/reports.md): the skill this movement counts toward (`SKILLS.pullUps`), or `null` for "decided, not a skill".
   * Absent means no decision, which is fine for a movement no skill is near. Every alias of one id carries the same value, and a movement
   * that shares a family with a skill must decide (tests/skills.test.ts), so a new variant of a listed skill cannot be missed silently.
   */
  skill?: SkillRef | null;
}

const skill = (level: SkillLevel, key: string, label: string): SkillRef => ({ key, label, level });

/**
 * The skills, defined once, and referenced from the entries below (`skill: SKILLS.pullUps`), so a label or a level is never retyped and a
 * misspelled skill is a compile error. Levels are a judgment, not computed: a level derived from how often a gym's athletes scale a
 * movement would describe that gym's programming. A bare "muscle-up" counts as a ring muscle-up (the sport's default meaning), and M has no
 * Advanced skill because the monostructural movements have none. The report lists them by modality, then level, then label.
 */
export const SKILLS = {
  // M
  run: skill("beginner", "run", "Run"),
  row: skill("beginner", "row", "Row"),
  bike: skill("beginner", "bike", "Bike"),
  skiErg: skill("beginner", "ski-erg", "Ski erg"),
  singleUnders: skill("beginner", "single-unders", "Single-unders"),
  doubleUnders: skill("intermediate", "double-unders", "Double-unders"),
  // W
  deadlift: skill("beginner", "deadlift", "Deadlift"),
  backSquat: skill("beginner", "back-squat", "Back squat"),
  frontSquat: skill("beginner", "front-squat", "Front squat"),
  shoulderPress: skill("beginner", "shoulder-press", "Shoulder press"),
  pushPress: skill("beginner", "push-press", "Push press"),
  benchPress: skill("beginner", "bench-press", "Bench press"),
  kettlebellSwing: skill("beginner", "kettlebell-swing", "Kettlebell swing"),
  lunge: skill("beginner", "lunge", "Lunge"),
  wallBalls: skill("beginner", "wall-balls", "Wall balls"),
  thruster: skill("intermediate", "thruster", "Thruster"),
  overheadSquat: skill("intermediate", "overhead-squat", "Overhead squat"),
  powerClean: skill("intermediate", "power-clean", "Power clean"),
  powerSnatch: skill("intermediate", "power-snatch", "Power snatch"),
  pushJerk: skill("intermediate", "push-jerk", "Push jerk"),
  splitJerk: skill("intermediate", "split-jerk", "Split jerk"),
  sumoDeadliftHighPull: skill("intermediate", "sumo-deadlift-high-pull", "Sumo deadlift high pull"),
  turkishGetUp: skill("intermediate", "turkish-get-up", "Turkish get-up"),
  clean: skill("advanced", "clean", "Clean"),
  snatch: skill("advanced", "snatch", "Snatch"),
  cleanAndJerk: skill("advanced", "clean-and-jerk", "Clean & jerk"),
  // G
  airSquats: skill("beginner", "air-squats", "Air squats"),
  pushUps: skill("beginner", "push-ups", "Push-ups"),
  sitUps: skill("beginner", "sit-ups", "Sit-ups"),
  burpees: skill("beginner", "burpees", "Burpees"),
  boxJumps: skill("beginner", "box-jumps", "Box jumps"),
  ringRows: skill("beginner", "ring-rows", "Ring rows"),
  pullUps: skill("intermediate", "pull-ups", "Pull-ups"),
  toesToBar: skill("intermediate", "toes-to-bar", "Toes-to-bar"),
  kneesToElbows: skill("intermediate", "knees-to-elbows", "Knees-to-elbows"),
  chestToBar: skill("intermediate", "chest-to-bar", "Chest-to-bar pull-ups"),
  handstandPushUps: skill("intermediate", "handstand-push-ups", "Handstand push-ups"),
  dips: skill("intermediate", "dips", "Dips"),
  ropeClimbs: skill("intermediate", "rope-climbs", "Rope climbs"),
  wallWalks: skill("intermediate", "wall-walks", "Wall walks"),
  lSit: skill("intermediate", "l-sit", "L-sit"),
  handstandHold: skill("intermediate", "handstand-hold", "Handstand hold"),
  pistols: skill("advanced", "pistols", "Pistols"),
  barMuscleUps: skill("advanced", "bar-muscle-ups", "Bar muscle-ups"),
  ringMuscleUps: skill("advanced", "ring-muscle-ups", "Ring muscle-ups"),
  handstandWalk: skill("advanced", "handstand-walk", "Handstand walk"),
  strictHandstandPushUps: skill("advanced", "strict-handstand-push-ups", "Strict handstand push-ups"),
  leglessRopeClimbs: skill("advanced", "legless-rope-climbs", "Legless rope climbs"),
} as const;

export const MOVEMENT_LEXICON: readonly MovementEntry[] = [
  // ---------------------------------------------------------------- M ----
  // Monostructural / cardio. Note "row" and "ski" both need guarding:
  // "row" is a substring of "throw", and "ski" of "skill" — and SKILL WORK is
  // the single most common title in the validation export (89 occurrences).
  // "store run" is a title's errand, not a workout.
  { id: "run", phrase: "run", modality: "M", label: "Run", exclude: ["store run"], skill: SKILLS.run },
  { id: "row", phrase: "row", modality: "M", label: "Row", exclude: ["throw", "slow your row", "ring row", "db row", "dumbbell row", "bent over row", "barbell row", "arrow", "narrow"], skill: SKILLS.row },
  { id: "row", phrase: "rower", modality: "M", label: "Row", skill: SKILLS.row },
  { id: "bike", phrase: "bike", modality: "M", label: "Bike", skill: SKILLS.bike },
  // Assault and Echo are brands of the same bike. The aliases are kept so the "matched on" phrase still
  // shows what the workout said, though the bare "bike" would claim them either way.
  { id: "bike", phrase: "assault bike", modality: "M", label: "Bike", skill: SKILLS.bike },
  { id: "bike", phrase: "echo bike", modality: "M", label: "Bike", skill: SKILLS.bike },
  { id: "ski-erg", phrase: "ski", modality: "M", label: "Ski erg", exclude: ["skill", "skin"], skill: SKILLS.skiErg },
  { id: "ski-erg", phrase: "ski erg", modality: "M", label: "Ski erg", skill: SKILLS.skiErg },
  { id: "ski-erg", phrase: "skierg", modality: "M", label: "Ski erg", skill: SKILLS.skiErg },
  { id: "double-unders", phrase: "double-under", modality: "M", label: "Double-unders", skill: SKILLS.doubleUnders },
  { id: "double-unders", phrase: "double under", modality: "M", label: "Double-unders", skill: SKILLS.doubleUnders },
  { id: "double-unders", phrase: "du", modality: "M", label: "Double-unders", mode: "token", skill: SKILLS.doubleUnders },
  { id: "single-unders", phrase: "single-under", modality: "M", label: "Single-unders", skill: SKILLS.singleUnders },
  { id: "single-unders", phrase: "single under", modality: "M", label: "Single-unders", skill: SKILLS.singleUnders },
  { id: "jump-rope", phrase: "jump rope", modality: "M", label: "Jump rope", skill: null },
  { id: "shuttle-run", phrase: "shuttle run", modality: "M", label: "Shuttle run", skill: SKILLS.run },
  // A sprint is a run at a different pace, not a different movement.
  { id: "run", phrase: "sprint", modality: "M", label: "Run", skill: SKILLS.run },
  { id: "swim", phrase: "swim", modality: "M", label: "Swim" },

  // ---------------------------------------------------------------- W ----
  // Barbell.
  { id: "snatch", phrase: "snatch", modality: "W", label: "Snatch", skill: SKILLS.snatch },
  { id: "power-snatch", phrase: "power snatch", modality: "W", label: "Power snatch", skill: SKILLS.powerSnatch },
  { id: "hang-snatch", phrase: "hang snatch", modality: "W", label: "Hang snatch", skill: SKILLS.snatch },
  // Named lifts SugarWOD types in `barbell_lift`. Without these the generic word inside them
  // (snatch in "snatch grip deadlift", snatch in "snatch balance") read as the wrong lift.
  { id: "muscle-snatch", phrase: "muscle snatch", modality: "W", label: "Muscle snatch", skill: null },
  { id: "snatch-balance", phrase: "snatch balance", modality: "W", label: "Snatch balance", skill: null },
  { id: "snatch-grip-deadlift", phrase: "snatch grip deadlift", modality: "W", label: "Snatch grip deadlift", skill: null },
  { id: "power-clean-and-jerk", phrase: "power clean & jerk", modality: "W", label: "Power clean & jerk", skill: null },
  { id: "power-clean-and-jerk", phrase: "power clean and jerk", modality: "W", label: "Power clean & jerk", skill: null },
  { id: "back-squat", phrase: "back pause squat", modality: "W", label: "Back squat", skill: SKILLS.backSquat },
  { id: "front-squat", phrase: "front pause squat", modality: "W", label: "Front squat", skill: SKILLS.frontSquat },
  { id: "squat-snatch", phrase: "squat snatch", modality: "W", label: "Squat snatch", skill: SKILLS.snatch },
  { id: "snatch-pull", phrase: "snatch pull", modality: "W", label: "Snatch pull", skill: null },
  { id: "clean", phrase: "clean", modality: "W", label: "Clean", skill: SKILLS.clean },
  { id: "power-clean", phrase: "power clean", modality: "W", label: "Power clean", skill: SKILLS.powerClean },
  { id: "hang-clean", phrase: "hang clean", modality: "W", label: "Hang clean", skill: SKILLS.clean },
  { id: "hang-power-clean", phrase: "hang power clean", modality: "W", label: "Hang power clean", skill: SKILLS.powerClean },
  { id: "hang-power-snatch", phrase: "hang power snatch", modality: "W", label: "Hang power snatch", skill: SKILLS.powerSnatch },
  { id: "goblet-squat", phrase: "goblet squat", modality: "W", label: "Goblet squat", skill: null },
  { id: "squat-clean", phrase: "squat clean", modality: "W", label: "Squat clean", skill: SKILLS.clean },
  { id: "clean-pull", phrase: "clean pull", modality: "W", label: "Clean pull", skill: null },
  // Named on CrossFit's movement list. Each would otherwise read as its generic
  // parent (a medicine-ball clean as a clean, a high pull as a sumo deadlift).
  { id: "medicine-ball-clean", phrase: "medicine-ball clean", modality: "W", label: "Medicine-ball clean", skill: null },
  { id: "medicine-ball-clean", phrase: "medicine ball clean", modality: "W", label: "Medicine-ball clean", skill: null },
  { id: "medicine-ball-clean", phrase: "med ball clean", modality: "W", label: "Medicine-ball clean", skill: null },
  { id: "sumo-deadlift-high-pull", phrase: "sumo deadlift high pull", modality: "W", label: "Sumo deadlift high pull", skill: SKILLS.sumoDeadliftHighPull },
  { id: "sumo-deadlift-high-pull", phrase: "sdhp", modality: "W", label: "Sumo deadlift high pull", mode: "token", skill: SKILLS.sumoDeadliftHighPull },
  { id: "squat-clean-and-jerk", phrase: "squat clean and jerk", modality: "W", label: "Squat clean & jerk", skill: SKILLS.cleanAndJerk },
  { id: "squat-clean-and-jerk", phrase: "squat clean & jerk", modality: "W", label: "Squat clean & jerk", skill: SKILLS.cleanAndJerk },
  // A snatch deadlift is a deadlift with the snatch grip, one movement and not a snatch and a deadlift.
  { id: "snatch-grip-deadlift", phrase: "snatch deadlift", modality: "W", label: "Snatch grip deadlift", skill: null },
  { id: "snatch-grip-deadlift", phrase: "snatch-grip deadlift", modality: "W", label: "Snatch grip deadlift", skill: null },
  { id: "snatch-grip-deadlift", phrase: "snatch-grip-deadlift", modality: "W", label: "Snatch grip deadlift", skill: null },
  { id: "clean-grip-deadlift", phrase: "clean grip deadlift", modality: "W", label: "Clean grip deadlift", skill: null },
  { id: "clean-and-jerk", phrase: "clean and jerk", modality: "W", label: "Clean & jerk", skill: SKILLS.cleanAndJerk },
  { id: "clean-and-jerk", phrase: "c&j", modality: "W", label: "Clean & jerk", skill: SKILLS.cleanAndJerk },
  // SugarWOD titles use the ampersand about as often as "and"; without this the
  // lift reads as a separate Clean and Jerk.
  { id: "clean-and-jerk", phrase: "clean & jerk", modality: "W", label: "Clean & jerk", skill: SKILLS.cleanAndJerk },
  { id: "jerk", phrase: "jerk", modality: "W", label: "Jerk", skill: SKILLS.pushJerk },
  { id: "split-jerk", phrase: "split jerk", modality: "W", label: "Split jerk", skill: SKILLS.splitJerk },
  { id: "push-jerk", phrase: "push jerk", modality: "W", label: "Push jerk", skill: SKILLS.pushJerk },
  { id: "deadlift", phrase: "deadlift", modality: "W", label: "Deadlift", skill: SKILLS.deadlift },
  { id: "sumo-deadlift", phrase: "sumo deadlift", modality: "W", label: "Sumo deadlift", skill: SKILLS.deadlift },
  { id: "back-squat", phrase: "back squat", modality: "W", label: "Back squat", skill: SKILLS.backSquat },
  { id: "front-squat", phrase: "front squat", modality: "W", label: "Front squat", skill: SKILLS.frontSquat },
  { id: "overhead-squat", phrase: "overhead squat", modality: "W", label: "Overhead squat", skill: SKILLS.overheadSquat },
  { id: "overhead-squat", phrase: "ohs", modality: "W", label: "Overhead squat", mode: "token", skill: SKILLS.overheadSquat },
  // Bare "squat" is weightlifting by default; "air squat" below claims the
  // bodyweight case first because it is the longer phrase.
  { id: "squat", phrase: "squat", modality: "W", label: "Squat", skill: null },
  { id: "thruster", phrase: "thruster", modality: "W", label: "Thruster", skill: SKILLS.thruster },
  { id: "press", phrase: "press", modality: "W", label: "Press", exclude: ["impress", "pressure"], skill: null },
  { id: "shoulder-press", phrase: "shoulder press", modality: "W", label: "Shoulder press", skill: SKILLS.shoulderPress },
  { id: "push-press", phrase: "push press", modality: "W", label: "Push press", skill: SKILLS.pushPress },
  { id: "bench-press", phrase: "bench press", modality: "W", label: "Bench press", skill: SKILLS.benchPress },
  // "use bench" is a split squat's prop, not a press.
  { id: "bench-press", phrase: "bench", modality: "W", label: "Bench press", exclude: ["use bench"], skill: SKILLS.benchPress },
  { id: "shoulder-to-overhead", phrase: "shoulder-to-overhead", modality: "W", label: "Shoulder-to-overhead" },
  { id: "shoulder-to-overhead", phrase: "shoulder to overhead", modality: "W", label: "Shoulder-to-overhead" },
  { id: "lunge", phrase: "lunge", modality: "W", label: "Lunge", skill: SKILLS.lunge },
  // Style and loading variants from CrossFit's movement list. A variant is its own id so an
  // athlete can pick "Split clean" alone; its family (movementFamilies.ts) still holds it, so picking
  // "Clean" keeps finding it. The longer phrase wins the range, so the generic id no longer fires.
  { id: "split-clean", phrase: "split clean", modality: "W", label: "Split clean", skill: null },
  { id: "split-snatch", phrase: "split snatch", modality: "W", label: "Split snatch", skill: SKILLS.snatch },
  // A prefixed complex ("power clean and push jerk") is a different lift, so it falls through
  // to its parts instead of being swallowed by the plain one.
  { id: "clean-and-push-jerk", phrase: "clean and push jerk", modality: "W", label: "Clean & push jerk", exclude: ["power clean and push jerk", "squat clean and push jerk"], skill: null },
  { id: "clean-and-push-jerk", phrase: "clean & push jerk", modality: "W", label: "Clean & push jerk", exclude: ["power clean & push jerk", "squat clean & push jerk"], skill: null },
  { id: "hang-clean-and-push-jerk", phrase: "hang clean and push jerk", modality: "W", label: "Hang clean & push jerk", skill: null },
  { id: "hang-clean-and-push-jerk", phrase: "hang clean & push jerk", modality: "W", label: "Hang clean & push jerk", skill: null },
  { id: "power-clean-and-split-jerk", phrase: "power clean and split jerk", modality: "W", label: "Power clean & split jerk", skill: null },
  { id: "power-clean-and-split-jerk", phrase: "power clean & split jerk", modality: "W", label: "Power clean & split jerk", skill: null },
  { id: "zercher-squat", phrase: "zercher squat", modality: "W", label: "Zercher squat", skill: null },
  { id: "sots-press", phrase: "sots press", modality: "W", label: "Sots press", skill: null },
  { id: "walking-lunges", phrase: "walking lunge", modality: "W", label: "Walking lunges", skill: SKILLS.lunge },
  { id: "front-rack-lunges", phrase: "front-rack lunge", modality: "W", label: "Front-rack lunges", skill: null },
  { id: "front-rack-lunges", phrase: "front rack lunge", modality: "W", label: "Front-rack lunges", skill: null },
  { id: "overhead-walking-lunges", phrase: "overhead walking lunge", modality: "W", label: "Overhead walking lunges", skill: null },
  { id: "good-morning", phrase: "good morning", modality: "W", label: "Good morning" },
  { id: "barbell-row", phrase: "barbell row", modality: "W", label: "Barbell row", implement: "barbell" },
  { id: "bent-over-row", phrase: "bent over row", modality: "W", label: "Bent-over row" },
  { id: "bent-over-row", phrase: "bent-over row", modality: "W", label: "Bent-over row" },
  { id: "clean-pull", phrase: "clean pull to toes", modality: "W", label: "Clean pull", skill: null },

  // Dumbbell / kettlebell / odd object.
  // No bare "dumbbell"/"db"/"kettlebell"/"kb" entries: they name the implement, not
  // the movement, and counted as one, so a db snatch read as two W movements.
  // Measured on the sample export: dropping them changed 104 rows' shares and
  // left 2 rows (an implement-only title) unclassified.
  { id: "dumbbell-row", phrase: "db row", modality: "W", label: "Dumbbell row", implement: "dumbbell" },
  { id: "dumbbell-row", phrase: "dumbbell row", modality: "W", label: "Dumbbell row", implement: "dumbbell" },
  { id: "kettlebell-swing", phrase: "kettlebell swing", modality: "W", label: "Kettlebell swing", implement: "kettlebell", skill: SKILLS.kettlebellSwing },
  { id: "kettlebell-swing", phrase: "kb swing", modality: "W", label: "Kettlebell swing", implement: "kettlebell", skill: SKILLS.kettlebellSwing },
  // Titles like "Tire Swing" and "Swing State" are names, not kettlebell work.
  { id: "kettlebell-swing", phrase: "swing", modality: "W", label: "Kettlebell swing", implement: "kettlebell", exclude: ["tire swing", "swing state", "swing high", "swing to backward roll"], skill: SKILLS.kettlebellSwing },
  { id: "turkish-get-up", phrase: "turkish get-up", modality: "W", label: "Turkish get-up", skill: SKILLS.turkishGetUp },
  { id: "wall-balls", phrase: "wall ball", modality: "W", label: "Wall balls", skill: SKILLS.wallBalls },
  { id: "wall-balls", phrase: "wall-ball", modality: "W", label: "Wall balls", skill: SKILLS.wallBalls },
  { id: "wall-balls", phrase: "wallball", modality: "W", label: "Wall balls", skill: SKILLS.wallBalls },
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
  { id: "pull-ups", phrase: "pull-up", modality: "G", label: "Pull-ups", skill: SKILLS.pullUps },
  { id: "pull-ups", phrase: "pull up", modality: "G", label: "Pull-ups", skill: SKILLS.pullUps },
  { id: "pull-ups", phrase: "pullup", modality: "G", label: "Pull-ups", skill: SKILLS.pullUps },
  { id: "chin-ups", phrase: "chin-up", modality: "G", label: "Chin-ups", skill: null },
  { id: "chest-to-bar", phrase: "chest-to-bar", modality: "G", label: "Chest-to-bar", skill: SKILLS.chestToBar },
  { id: "chest-to-bar", phrase: "chest to bar", modality: "G", label: "Chest-to-bar", skill: SKILLS.chestToBar },
  { id: "chest-to-bar", phrase: "c2b", modality: "G", label: "Chest-to-bar", mode: "token", skill: SKILLS.chestToBar },
  { id: "muscle-ups", phrase: "muscle-up", modality: "G", label: "Muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "muscle-ups", phrase: "muscle up", modality: "G", label: "Muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "bar-muscle-ups", phrase: "bar muscle", modality: "G", label: "Bar muscle-ups", skill: SKILLS.barMuscleUps },
  { id: "ring-muscle-ups", phrase: "ring muscle", modality: "G", label: "Ring muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "muscle-ups", phrase: "mu", modality: "G", label: "Muscle-ups", mode: "token", skill: SKILLS.ringMuscleUps },
  { id: "push-ups", phrase: "push-up", modality: "G", label: "Push-ups", skill: SKILLS.pushUps },
  { id: "push-ups", phrase: "push up", modality: "G", label: "Push-ups", skill: SKILLS.pushUps },
  { id: "push-ups", phrase: "pushup", modality: "G", label: "Push-ups", skill: SKILLS.pushUps },
  { id: "handstand-work", phrase: "handstand", modality: "G", label: "Handstand work", skill: null },
  { id: "handstand-walk", phrase: "handstand walk", modality: "G", label: "Handstand walk", skill: SKILLS.handstandWalk },
  { id: "handstand-hold", phrase: "handstand hold", modality: "G", label: "Handstand hold", skill: SKILLS.handstandHold },
  { id: "wall-walks", phrase: "wall walk", modality: "G", label: "Wall walks", skill: SKILLS.wallWalks },
  { id: "pike-push-ups", phrase: "pike push", modality: "G", label: "Pike push-ups", skill: null },
  { id: "russian-twists", phrase: "russian twist", modality: "G", label: "Russian twists" },
  { id: "bear-crawls", phrase: "bear crawl", modality: "G", label: "Bear crawls" },
  { id: "handstand-push-ups", phrase: "handstand push-up", modality: "G", label: "Handstand push-ups", skill: SKILLS.handstandPushUps },
  { id: "handstand-push-ups", phrase: "hspu", modality: "G", label: "Handstand push-ups", mode: "token", skill: SKILLS.handstandPushUps },
  // "jerk dip" and "dip position" are the lift's own phase, not the gymnastics dip.
  { id: "dips", phrase: "dip", modality: "G", label: "Dips", exclude: ["jerk dip", "dip position"], skill: SKILLS.dips },
  { id: "ring-rows", phrase: "ring row", modality: "G", label: "Ring rows", skill: SKILLS.ringRows },
  { id: "ring-dips", phrase: "ring dip", modality: "G", label: "Ring dips", skill: SKILLS.dips },
  { id: "toes-to-bar", phrase: "toes-to-bar", modality: "G", label: "Toes-to-bar", skill: SKILLS.toesToBar },
  { id: "toes-to-bar", phrase: "toes to bar", modality: "G", label: "Toes-to-bar", skill: SKILLS.toesToBar },
  { id: "toes-to-bar", phrase: "t2b", modality: "G", label: "Toes-to-bar", mode: "token", skill: SKILLS.toesToBar },
  { id: "toes-to-bar", phrase: "ttb", modality: "G", label: "Toes-to-bar", mode: "token", skill: SKILLS.toesToBar },
  { id: "knees-to-elbows", phrase: "knees-to-elbow", modality: "G", label: "Knees-to-elbows", skill: SKILLS.kneesToElbows },
  { id: "knee-raises", phrase: "knee raise", modality: "G", label: "Knee raises" },
  { id: "burpees", phrase: "burpee", modality: "G", label: "Burpees", skill: SKILLS.burpees },
  { id: "box-jumps", phrase: "box jump", modality: "G", label: "Box jumps", skill: SKILLS.boxJumps },
  { id: "broad-jumps", phrase: "broad jump", modality: "G", label: "Broad jumps" },
  { id: "air-squats", phrase: "air squat", modality: "G", label: "Air squats", skill: SKILLS.airSquats },
  { id: "pistols", phrase: "pistol", modality: "G", label: "Pistols", skill: SKILLS.pistols },
  { id: "rope-climbs", phrase: "rope climb", modality: "G", label: "Rope climbs", skill: SKILLS.ropeClimbs },
  { id: "sit-ups", phrase: "sit-up", modality: "G", label: "Sit-ups", skill: SKILLS.sitUps },
  { id: "sit-ups", phrase: "sit up", modality: "G", label: "Sit-ups", skill: SKILLS.sitUps },
  { id: "sit-ups", phrase: "situp", modality: "G", label: "Sit-ups", skill: SKILLS.sitUps },
  { id: "ghd-work", phrase: "ghd", modality: "G", label: "GHD work", mode: "token" },
  { id: "l-sit", phrase: "l-sit", modality: "G", label: "L-sit", skill: SKILLS.lSit },
  { id: "plank", phrase: "plank", modality: "G", label: "Plank" },
  { id: "hollow-hold", phrase: "hollow", modality: "G", label: "Hollow hold" },
  { id: "hollow-rocks", phrase: "hollow rock", modality: "G", label: "Hollow rocks" },
  { id: "v-ups", phrase: "v-up", modality: "G", label: "V-ups" },
  { id: "bar-hang", phrase: "bar hang", modality: "G", label: "Bar hang" },
  { id: "pull-overs", phrase: "pull over", modality: "G", label: "Pull-overs" },
  { id: "pull-overs", phrase: "pull-over", modality: "G", label: "Pull-overs" },
  // Variants named on CrossFit's movement list (see the note above the barbell variants).
  { id: "strict-pull-ups", phrase: "strict pull-up", modality: "G", label: "Strict pull-ups", skill: SKILLS.pullUps },
  { id: "strict-pull-ups", phrase: "strict pull up", modality: "G", label: "Strict pull-ups", skill: SKILLS.pullUps },
  { id: "strict-pull-ups", phrase: "strict pullup", modality: "G", label: "Strict pull-ups", skill: SKILLS.pullUps },
  { id: "kipping-pull-ups", phrase: "kipping pull-up", modality: "G", label: "Kipping pull-ups", skill: SKILLS.pullUps },
  { id: "kipping-pull-ups", phrase: "kipping pull up", modality: "G", label: "Kipping pull-ups", skill: SKILLS.pullUps },
  { id: "kipping-pull-ups", phrase: "kipping pullup", modality: "G", label: "Kipping pull-ups", skill: SKILLS.pullUps },
  { id: "butterfly-pull-ups", phrase: "butterfly pull-up", modality: "G", label: "Butterfly pull-ups", skill: SKILLS.pullUps },
  { id: "butterfly-pull-ups", phrase: "butterfly pull up", modality: "G", label: "Butterfly pull-ups", skill: SKILLS.pullUps },
  { id: "butterfly-pull-ups", phrase: "butterfly pullup", modality: "G", label: "Butterfly pull-ups", skill: SKILLS.pullUps },
  { id: "l-pull-ups", phrase: "l pull-up", modality: "G", label: "L pull-ups", mode: "token", skill: null },
  { id: "l-pull-ups", phrase: "l pull up", modality: "G", label: "L pull-ups", mode: "token", skill: null },
  { id: "strict-chest-to-bar", phrase: "strict chest-to-bar pull-up", modality: "G", label: "Strict chest-to-bar", skill: SKILLS.chestToBar },
  { id: "strict-chest-to-bar", phrase: "strict chest to bar pull-up", modality: "G", label: "Strict chest-to-bar", skill: SKILLS.chestToBar },
  { id: "strict-chest-to-bar", phrase: "strict chest-to-bar", modality: "G", label: "Strict chest-to-bar", skill: SKILLS.chestToBar },
  { id: "strict-chest-to-bar", phrase: "strict chest to bar", modality: "G", label: "Strict chest-to-bar", skill: SKILLS.chestToBar },
  { id: "strict-muscle-ups", phrase: "strict muscle-up", modality: "G", label: "Strict muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "strict-muscle-ups", phrase: "strict muscle up", modality: "G", label: "Strict muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "strict-bar-muscle-ups", phrase: "strict bar muscle-up", modality: "G", label: "Strict bar muscle-ups", skill: SKILLS.barMuscleUps },
  { id: "strict-bar-muscle-ups", phrase: "strict bar muscle up", modality: "G", label: "Strict bar muscle-ups", skill: SKILLS.barMuscleUps },
  { id: "strict-handstand-push-ups", phrase: "strict handstand push-up", modality: "G", label: "Strict handstand push-ups", skill: SKILLS.strictHandstandPushUps },
  { id: "strict-handstand-push-ups", phrase: "strict handstand push up", modality: "G", label: "Strict handstand push-ups", skill: SKILLS.strictHandstandPushUps },
  { id: "strict-handstand-push-ups", phrase: "strict handstand pushup", modality: "G", label: "Strict handstand push-ups", skill: SKILLS.strictHandstandPushUps },
  { id: "kipping-chest-to-bar", phrase: "kipping chest-to-bar pull-up", modality: "G", label: "Kipping chest-to-bar", skill: SKILLS.chestToBar },
  { id: "kipping-chest-to-bar", phrase: "kipping chest to bar pull-up", modality: "G", label: "Kipping chest-to-bar", skill: SKILLS.chestToBar },
  { id: "kipping-chest-to-bar", phrase: "kipping chest-to-bar", modality: "G", label: "Kipping chest-to-bar", skill: SKILLS.chestToBar },
  { id: "kipping-chest-to-bar", phrase: "kipping chest to bar", modality: "G", label: "Kipping chest-to-bar", skill: SKILLS.chestToBar },
  { id: "kipping-muscle-ups", phrase: "kipping muscle-up", modality: "G", label: "Kipping muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "kipping-muscle-ups", phrase: "kipping muscle up", modality: "G", label: "Kipping muscle-ups", skill: SKILLS.ringMuscleUps },
  { id: "kipping-bar-muscle-ups", phrase: "kipping bar muscle-up", modality: "G", label: "Kipping bar muscle-ups", skill: SKILLS.barMuscleUps },
  { id: "kipping-bar-muscle-ups", phrase: "kipping bar muscle up", modality: "G", label: "Kipping bar muscle-ups", skill: SKILLS.barMuscleUps },
  { id: "kipping-handstand-push-ups", phrase: "kipping handstand push-up", modality: "G", label: "Kipping handstand push-ups", skill: SKILLS.handstandPushUps },
  { id: "kipping-handstand-push-ups", phrase: "kipping handstand push up", modality: "G", label: "Kipping handstand push-ups", skill: SKILLS.handstandPushUps },
  { id: "kipping-handstand-push-ups", phrase: "kipping handstand pushup", modality: "G", label: "Kipping handstand push-ups", skill: SKILLS.handstandPushUps },
  { id: "kipping-handstand-push-ups", phrase: "kipping hspu", modality: "G", label: "Kipping handstand push-ups", mode: "token", skill: SKILLS.handstandPushUps },
  { id: "strict-handstand-push-ups", phrase: "strict hspu", modality: "G", label: "Strict handstand push-ups", mode: "token", skill: SKILLS.strictHandstandPushUps },
  { id: "deficit-handstand-push-ups", phrase: "deficit handstand push-up", modality: "G", label: "Deficit handstand push-ups", skill: null },
  { id: "deficit-handstand-push-ups", phrase: "deficit handstand push up", modality: "G", label: "Deficit handstand push-ups", skill: null },
  { id: "deficit-handstand-push-ups", phrase: "kipping deficit handstand push-up", modality: "G", label: "Deficit handstand push-ups", skill: null },
  { id: "deficit-handstand-push-ups", phrase: "kipping deficit handstand push up", modality: "G", label: "Deficit handstand push-ups", skill: null },
  { id: "freestanding-handstand-push-ups", phrase: "freestanding handstand push-up", modality: "G", label: "Freestanding handstand push-ups", skill: SKILLS.strictHandstandPushUps },
  { id: "freestanding-handstand-push-ups", phrase: "freestanding handstand push up", modality: "G", label: "Freestanding handstand push-ups", skill: SKILLS.strictHandstandPushUps },
  { id: "chest-to-wall-handstand-push-ups", phrase: "chest-to-wall handstand push-up", modality: "G", label: "Chest-to-wall handstand push-ups", skill: null },
  { id: "chest-to-wall-handstand-push-ups", phrase: "chest to wall handstand push up", modality: "G", label: "Chest-to-wall handstand push-ups", skill: null },
  { id: "handstand-pirouette", phrase: "handstand pirouette", modality: "G", label: "Handstand pirouette", skill: null },
  { id: "straddle-press-to-handstand", phrase: "straddle press to handstand", modality: "G", label: "Straddle press to handstand", skill: null },
  { id: "strict-toes-to-bar", phrase: "strict toes-to-bar", modality: "G", label: "Strict toes-to-bar", skill: SKILLS.toesToBar },
  { id: "strict-toes-to-bar", phrase: "strict toes to bar", modality: "G", label: "Strict toes-to-bar", skill: SKILLS.toesToBar },
  { id: "kipping-toes-to-bar", phrase: "kipping toes-to-bar", modality: "G", label: "Kipping toes-to-bar", skill: SKILLS.toesToBar },
  { id: "kipping-toes-to-bar", phrase: "kipping toes to bar", modality: "G", label: "Kipping toes-to-bar", skill: SKILLS.toesToBar },
  { id: "strict-knees-to-elbows", phrase: "strict knees-to-elbow", modality: "G", label: "Strict knees-to-elbows", skill: SKILLS.kneesToElbows },
  { id: "strict-knees-to-elbows", phrase: "strict knees to elbow", modality: "G", label: "Strict knees-to-elbows", skill: SKILLS.kneesToElbows },
  { id: "ring-push-ups", phrase: "ring push-up", modality: "G", label: "Ring push-ups", skill: null },
  { id: "ring-push-ups", phrase: "ring push up", modality: "G", label: "Ring push-ups", skill: null },
  { id: "abmat-sit-ups", phrase: "abmat sit-up", modality: "G", label: "AbMat sit-ups", skill: SKILLS.sitUps },
  { id: "abmat-sit-ups", phrase: "abmat sit up", modality: "G", label: "AbMat sit-ups", skill: SKILLS.sitUps },
  { id: "ghd-sit-ups", phrase: "ghd sit-up", modality: "G", label: "GHD sit-ups", skill: null },
  { id: "ghd-sit-ups", phrase: "ghd sit up", modality: "G", label: "GHD sit-ups", skill: null },
  { id: "ghd-sit-ups", phrase: "ghd situp", modality: "G", label: "GHD sit-ups", skill: null },
  { id: "ghd-back-extensions", phrase: "ghd back extension", modality: "G", label: "GHD back extensions" },
  { id: "ghd-hip-extensions", phrase: "ghd hip extension", modality: "G", label: "GHD hip extensions" },
  { id: "ghd-hip-and-back-extensions", phrase: "ghd hip and back extension", modality: "G", label: "GHD hip and back extensions" },
  { id: "ghd-hip-and-back-extensions", phrase: "ghd hip & back extension", modality: "G", label: "GHD hip and back extensions" },
  { id: "ghd-hip-and-back-extensions", phrase: "ghd hip, back, and hip-back extension", modality: "G", label: "GHD hip and back extensions" },
  { id: "legless-rope-climbs", phrase: "legless rope climb", modality: "G", label: "Legless rope climbs", skill: SKILLS.leglessRopeClimbs },
  { id: "l-sit-rope-climbs", phrase: "l-sit rope climb", modality: "G", label: "L-sit rope climbs", skill: null },
  { id: "l-sit-rope-climbs", phrase: "l sit rope climb", modality: "G", label: "L-sit rope climbs", skill: null },
  { id: "hanging-l-sit", phrase: "hanging l-sit", modality: "G", label: "Hanging L-sit", skill: SKILLS.lSit },
  { id: "l-sit-on-rings", phrase: "l-sit on rings", modality: "G", label: "L-sit on rings", skill: null },
  { id: "l-sit-to-shoulder-stand", phrase: "l-sit to shoulder stand", modality: "G", label: "L-sit to shoulder stand", skill: null },
  { id: "inverted-burpees", phrase: "inverted burpee", modality: "G", label: "Inverted burpees", skill: null },
  // A burpee that ends in a pull-up is one movement; "jumping" is how SugarWOD words the pull-up.
  { id: "burpee-pull-ups", phrase: "burpee pull-up", modality: "G", label: "Burpee pull-ups", skill: null },
  { id: "burpee-pull-ups", phrase: "burpee pull up", modality: "G", label: "Burpee pull-ups", skill: null },
  { id: "burpee-pull-ups", phrase: "burpee pullup", modality: "G", label: "Burpee pull-ups", skill: null },
  { id: "burpee-pull-ups", phrase: "burpee jumping pull-up", modality: "G", label: "Burpee pull-ups", skill: null },
  { id: "burpee-pull-ups", phrase: "burpee jumping pull up", modality: "G", label: "Burpee pull-ups", skill: null },
  // The bar here is stepped over by the athlete; without this it reads as a box step-over (W).
  { id: "lateral-burpee-bar-step-overs", phrase: "lateral burpee bar step-over", modality: "G", label: "Lateral burpee bar step-overs", skill: null },
  { id: "burpee-box-jump-overs", phrase: "burpee box jump-over", modality: "G", label: "Burpee box jump-overs", skill: null },
  { id: "burpee-box-jump-overs", phrase: "burpee box jump over", modality: "G", label: "Burpee box jump-overs", skill: null },
  { id: "burpee-box-jump-overs", phrase: "burpee box over", modality: "G", label: "Burpee box jump-overs", skill: null },
  { id: "pistols", phrase: "single-leg squat", modality: "G", label: "Pistols", skill: SKILLS.pistols },
  { id: "pistols", phrase: "single leg squat", modality: "G", label: "Pistols", skill: SKILLS.pistols },
  { id: "handstand-push-ups", phrase: "handstand push up", modality: "G", label: "Handstand push-ups", skill: SKILLS.handstandPushUps },
  { id: "handstand-push-ups", phrase: "handstand pushup", modality: "G", label: "Handstand push-ups", skill: SKILLS.handstandPushUps },
  { id: "knees-to-elbows", phrase: "knees to elbow", modality: "G", label: "Knees-to-elbows", skill: SKILLS.kneesToElbows },
  { id: "chest-to-bar", phrase: "chest-to-bar pull-up", modality: "G", label: "Chest-to-bar", skill: SKILLS.chestToBar },
  { id: "chest-to-bar", phrase: "chest-to-bar pull up", modality: "G", label: "Chest-to-bar", skill: SKILLS.chestToBar },
  { id: "chest-to-bar", phrase: "chest to bar pull-up", modality: "G", label: "Chest-to-bar", skill: SKILLS.chestToBar },
  { id: "chest-to-bar", phrase: "chest to bar pull up", modality: "G", label: "Chest-to-bar", skill: SKILLS.chestToBar },
  // Ring and bar skills named on CrossFit's movement list.
  { id: "skin-the-cat", phrase: "skin the cat", modality: "G", label: "Skin the cat" },
  { id: "swing-to-backward-roll", phrase: "swing to backward roll", modality: "G", label: "Swing to backward roll" },
  { id: "forward-roll", phrase: "forward roll", modality: "G", label: "Forward roll" },
  { id: "back-scale", phrase: "back scale", modality: "G", label: "Back scale" },
  { id: "front-scale", phrase: "front scale", modality: "G", label: "Front scale" },
  { id: "glide-kip", phrase: "glide kip", modality: "G", label: "Glide kip" },
  { id: "shoot-through", phrase: "shoot-through", modality: "G", label: "Shoot-through" },
  { id: "shoot-through", phrase: "shoot through", modality: "G", label: "Shoot-through" },
  { id: "toes-to-rings", phrase: "toes-to-rings", modality: "G", label: "Toes-to-rings", skill: null },
  { id: "toes-to-rings", phrase: "toes to rings", modality: "G", label: "Toes-to-rings", skill: null },
  { id: "windshield-wipers", phrase: "windshield wiper", modality: "G", label: "Windshield wipers" },
];

/** Longest phrase first — the order the classifier claims text ranges in. */
export const LEXICON_BY_SPECIFICITY: readonly MovementEntry[] = [...MOVEMENT_LEXICON].sort(
  (a, b) => b.phrase.length - a.phrase.length
);
