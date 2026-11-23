import type { ParsedRow } from "./buildDashboardData";
import type { Modality } from "@/types/modality";

/**
 * The Skills report's list and its checklist (docs/reports.md, "Skills report"): which movements an athlete has done as prescribed.
 *
 * A skill is *done as prescribed* on a date when the athlete has logged, on or before it, a workout flagged RX whose recognized movements
 * include one of the skill's ids. The RX flag belongs to the whole workout (a scaled movement inside an RX workout is invisible), and
 * movements are read from the workout's text by the same classifier every view uses, so a check is the log's claim, not a measurement.
 * A SCALED workout, or one with no flag, never counts. Movements come from `ParsedRow.movements` (barbell_lift first); nothing is re-read.
 *
 * The list is curated, and its levels are a judgment, not computed: a level derived from how often a gym's athletes scale a movement
 * would describe that gym's programming. `tests/skills.test.ts` pins the list's integrity against the lexicon.
 */
export type SkillLevel = "foundation" | "intermediate" | "advanced";
export const SKILL_LEVELS: readonly SkillLevel[] = ["foundation", "intermediate", "advanced"];
export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = { foundation: "Foundation", intermediate: "Intermediate", advanced: "Advanced" };

export interface Skill {
  /** Stable, kebab-case. */
  key: string;
  label: string;
  level: SkillLevel;
  /** M, W or G as the lexicon defines them. Every id below has this modality. */
  modality: Modality;
  /** Movement ids (`MOVEMENT_LEXICON`); any one of them counts. */
  ids: readonly string[];
}

const skill = (modality: Modality, level: SkillLevel, key: string, label: string, ids: readonly string[]): Skill => ({ key, label, level, modality, ids });

/**
 * In display order: by modality (M, W, G as the report groups them), then level, then this order. Skills that name several ids count any
 * way the movement is done ("Pull-up" counts strict, kipping and butterfly). A bare "muscle-up" counts as a ring muscle-up, the sport's
 * default meaning. M has no Advanced skill because the lexicon's monostructural movements have none.
 */
export const SKILL_LIST: readonly Skill[] = [
  // M: monostructural.
  skill("M", "foundation", "run", "Run", ["run", "shuttle-run"]),
  skill("M", "foundation", "row", "Row", ["row"]),
  skill("M", "foundation", "bike", "Bike", ["bike"]),
  skill("M", "foundation", "ski-erg", "Ski erg", ["ski-erg"]),
  skill("M", "foundation", "single-unders", "Single-unders", ["single-unders"]),
  skill("M", "intermediate", "double-unders", "Double-unders", ["double-unders"]),

  // W: weightlifting.
  skill("W", "foundation", "deadlift", "Deadlift", ["deadlift", "sumo-deadlift"]),
  skill("W", "foundation", "back-squat", "Back squat", ["back-squat"]),
  skill("W", "foundation", "front-squat", "Front squat", ["front-squat"]),
  skill("W", "foundation", "shoulder-press", "Shoulder press", ["shoulder-press"]),
  skill("W", "foundation", "push-press", "Push press", ["push-press"]),
  skill("W", "foundation", "bench-press", "Bench press", ["bench-press"]),
  skill("W", "foundation", "kettlebell-swing", "Kettlebell swing", ["kettlebell-swing"]),
  skill("W", "foundation", "lunge", "Lunge", ["lunge", "walking-lunges"]),
  skill("W", "foundation", "wall-balls", "Wall balls", ["wall-balls"]),
  skill("W", "intermediate", "thruster", "Thruster", ["thruster"]),
  skill("W", "intermediate", "overhead-squat", "Overhead squat", ["overhead-squat"]),
  skill("W", "intermediate", "power-clean", "Power clean", ["power-clean", "hang-power-clean"]),
  skill("W", "intermediate", "power-snatch", "Power snatch", ["power-snatch", "hang-power-snatch"]),
  skill("W", "intermediate", "push-jerk", "Push jerk", ["push-jerk", "jerk"]),
  skill("W", "intermediate", "split-jerk", "Split jerk", ["split-jerk"]),
  skill("W", "intermediate", "sumo-deadlift-high-pull", "Sumo deadlift high pull", ["sumo-deadlift-high-pull"]),
  skill("W", "intermediate", "turkish-get-up", "Turkish get-up", ["turkish-get-up"]),
  skill("W", "advanced", "clean", "Clean", ["clean", "hang-clean", "squat-clean"]),
  skill("W", "advanced", "snatch", "Snatch", ["snatch", "hang-snatch", "squat-snatch", "split-snatch"]),
  skill("W", "advanced", "clean-and-jerk", "Clean & jerk", ["clean-and-jerk", "squat-clean-and-jerk"]),

  // G: gymnastics.
  skill("G", "foundation", "air-squats", "Air squats", ["air-squats"]),
  skill("G", "foundation", "push-ups", "Push-ups", ["push-ups"]),
  skill("G", "foundation", "sit-ups", "Sit-ups", ["sit-ups", "abmat-sit-ups"]),
  skill("G", "foundation", "burpees", "Burpees", ["burpees"]),
  skill("G", "foundation", "box-jumps", "Box jumps", ["box-jumps"]),
  skill("G", "foundation", "ring-rows", "Ring rows", ["ring-rows"]),
  skill("G", "intermediate", "pull-ups", "Pull-ups", ["pull-ups", "strict-pull-ups", "kipping-pull-ups", "butterfly-pull-ups"]),
  skill("G", "intermediate", "toes-to-bar", "Toes-to-bar", ["toes-to-bar", "strict-toes-to-bar", "kipping-toes-to-bar"]),
  skill("G", "intermediate", "knees-to-elbows", "Knees-to-elbows", ["knees-to-elbows", "strict-knees-to-elbows"]),
  skill("G", "intermediate", "chest-to-bar", "Chest-to-bar pull-ups", ["chest-to-bar", "strict-chest-to-bar", "kipping-chest-to-bar"]),
  skill("G", "intermediate", "handstand-push-ups", "Handstand push-ups", ["handstand-push-ups", "kipping-handstand-push-ups"]),
  skill("G", "intermediate", "dips", "Dips", ["dips", "ring-dips"]),
  skill("G", "intermediate", "rope-climbs", "Rope climbs", ["rope-climbs"]),
  skill("G", "intermediate", "wall-walks", "Wall walks", ["wall-walks"]),
  skill("G", "intermediate", "l-sit", "L-sit", ["l-sit", "hanging-l-sit"]),
  skill("G", "intermediate", "handstand-hold", "Handstand hold", ["handstand-hold"]),
  skill("G", "advanced", "pistols", "Pistols", ["pistols"]),
  skill("G", "advanced", "bar-muscle-ups", "Bar muscle-ups", ["bar-muscle-ups", "strict-bar-muscle-ups", "kipping-bar-muscle-ups"]),
  skill("G", "advanced", "ring-muscle-ups", "Ring muscle-ups", ["ring-muscle-ups", "muscle-ups", "strict-muscle-ups", "kipping-muscle-ups"]),
  skill("G", "advanced", "handstand-walk", "Handstand walk", ["handstand-walk"]),
  skill("G", "advanced", "strict-handstand-push-ups", "Strict handstand push-ups", ["strict-handstand-push-ups", "freestanding-handstand-push-ups"]),
  skill("G", "advanced", "legless-rope-climbs", "Legless rope climbs", ["legless-rope-climbs"]),
];

/** The first workout behind a check: the earliest RX workout on or before the end that includes the skill. */
export interface FirstDone {
  /** YYYY-MM-DD. */
  date: string;
  /** The workout's title as logged. */
  title: string;
}

export interface SkillResult {
  skill: Skill;
  first: FirstDone | null;
  /** Done as prescribed before the period's start. Always false for All time, which has no start. */
  before: boolean;
  /** Done as prescribed on or before the period's end. */
  through: boolean;
  /** Done for the first time inside the period. */
  isNew: boolean;
}

export interface SkillGroup {
  modality: Modality;
  results: SkillResult[];
  done: number;
  newCount: number;
}

export interface SkillsData {
  start: string | null;
  end: string;
  groups: SkillGroup[];
  done: number;
  total: number;
  newCount: number;
  /** The newest workout on or before the end, from the whole log, for the footer's basis. */
  lastLogged: string | null;
}

export const SKILL_MODALITY_ORDER: readonly Modality[] = ["M", "W", "G"];

const LEVEL_RANK = new Map<SkillLevel, number>(SKILL_LEVELS.map((l, i) => [l, i]));

/**
 * The checklist for a period. `allRows` is `Insights.allRows` (oldest first). A skill's first RX workout on or before `end` decides it:
 * done before the start when that is earlier than the start, new when it falls inside the period. All time (`start` null) has no
 * "before", so nothing is marked new. Dates are passed in, never read from the clock.
 */
export function buildSkills(allRows: readonly ParsedRow[], start: string | null, end: string): SkillsData {
  const bySkill = new Map<string, Skill[]>();
  for (const s of SKILL_LIST) for (const id of s.ids) bySkill.set(id, [...(bySkill.get(id) ?? []), s]);

  const first = new Map<string, FirstDone>();
  let lastLogged: string | null = null;
  for (const r of allRows) {
    const date = r.dateParsed.format("YYYY-MM-DD");
    if (date > end) continue;
    if (lastLogged === null || date > lastLogged) lastLogged = date;
    if (r.raw.rx_or_scaled !== "RX") continue;
    for (const m of r.movements) {
      for (const s of bySkill.get(m.id) ?? []) {
        if (!first.has(s.key)) first.set(s.key, { date, title: r.raw.title });
      }
    }
  }

  const resultFor = (s: Skill): SkillResult => {
    const f = first.get(s.key) ?? null;
    const before = f !== null && start !== null && f.date < start;
    return { skill: s, first: f, before, through: f !== null, isNew: f !== null && start !== null && !before };
  };

  const groups: SkillGroup[] = SKILL_MODALITY_ORDER.map((modality) => {
    const results = SKILL_LIST.filter((s) => s.modality === modality)
      .map(resultFor)
      .sort((a, b) => LEVEL_RANK.get(a.skill.level)! - LEVEL_RANK.get(b.skill.level)! || SKILL_LIST.indexOf(a.skill) - SKILL_LIST.indexOf(b.skill));
    return { modality, results, done: results.filter((r) => r.through).length, newCount: results.filter((r) => r.isNew).length };
  });

  return {
    start,
    end,
    groups,
    done: groups.reduce((n, g) => n + g.done, 0),
    total: SKILL_LIST.length,
    newCount: groups.reduce((n, g) => n + g.newCount, 0),
    lastLogged,
  };
}
