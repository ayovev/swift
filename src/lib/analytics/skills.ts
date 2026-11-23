import type { ParsedRow } from "./buildDashboardData";
import { hasVersions, rxVersionText } from "./rxVersion";
import { findRowMovements } from "@/lib/classify/classifyModality";
import { MOVEMENT_LEXICON } from "@/lib/classify/movementLexicon";
import type { Modality } from "@/types/modality";
import type { SkillLevel, SkillRef } from "@/types/skills";

/**
 * The Skills report's list and its checklist (docs/reports.md, "Skills report"): which movements an athlete has done as prescribed.
 *
 * A skill is *done as prescribed* on a date when the athlete has logged, on or before it, a workout flagged RX whose recognized movements
 * include one of the skill's ids. The RX flag belongs to the whole workout (a scaled movement inside an RX workout is invisible), and
 * movements are read from the workout's text by the same classifier every view uses, so a check is the log's claim, not a measurement.
 * A SCALED workout, or one with no flag, never counts. Movements come from `ParsedRow.movements` (barbell_lift first). The one exception: an RX
 * workout whose description spells out several versions (RX, Intermediate, Beginner) is read for its RX version only (`rxVersion.ts`), because
 * a movement named only in an easier version was not prescribed or done. That re-reads the RX text once with the same classifier, cached per row.
 *
 * The list lives on the lexicon's own entries (`MovementEntry.skill`, the `SKILLS` table in `movementLexicon.ts`), and its levels are a
 * judgment, not computed: a level derived from how often a gym's athletes scale a movement would describe that gym's programming.
 * `tests/skills.test.ts` pins that every alias of an id agrees, and that a variant of a listed skill must decide.
 */
export type { SkillLevel };
export const SKILL_LEVELS: readonly SkillLevel[] = ["beginner", "intermediate", "advanced"];
export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

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

export const SKILL_MODALITY_ORDER: readonly Modality[] = ["M", "W", "G"];
const LEVEL_RANK = new Map<SkillLevel, number>(SKILL_LEVELS.map((l, i) => [l, i]));

/**
 * The skills, derived from the lexicon: every entry that carries `skill: SKILLS.x` counts toward that skill, so there is no second list to
 * keep in sync (`MovementEntry.skill`). In display order: modality (M, W, G), then level, then label.
 */
function deriveSkills(): Skill[] {
  const byKey = new Map<string, { ref: SkillRef; modality: Modality; ids: Set<string> }>();
  for (const e of MOVEMENT_LEXICON) {
    if (!e.skill) continue;
    const found = byKey.get(e.skill.key);
    if (found) found.ids.add(e.id);
    else byKey.set(e.skill.key, { ref: e.skill, modality: e.modality, ids: new Set([e.id]) });
  }
  return [...byKey.values()]
    .map(({ ref, modality, ids }): Skill => ({ key: ref.key, label: ref.label, level: ref.level, modality, ids: [...ids] }))
    .sort(
      (a, b) =>
        SKILL_MODALITY_ORDER.indexOf(a.modality) - SKILL_MODALITY_ORDER.indexOf(b.modality) ||
        LEVEL_RANK.get(a.level)! - LEVEL_RANK.get(b.level)! ||
        a.label.localeCompare(b.label)
    );
}

export const SKILL_LIST: readonly Skill[] = deriveSkills();

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

/**
 * The headline's "newest at" line: the new skills at the highest level any new skill has, in display order, capped at `cap` names with
 * the rest counted in `more`. A fact lifted from the table, not a rating: 12 new Beginner skills and 2 new Advanced ones are different stories.
 * Null when nothing is new.
 */
export function highestNewSkills(data: SkillsData, cap = 3): { level: SkillLevel; labels: string[]; more: number } | null {
  const fresh = data.groups.flatMap((g) => g.results).filter((r) => r.isNew);
  if (fresh.length === 0) return null;
  const rank = (l: SkillLevel) => SKILL_LEVELS.indexOf(l);
  const level = fresh.reduce((best, r) => (rank(r.skill.level) > rank(best) ? r.skill.level : best), fresh[0]!.skill.level);
  const labels = fresh.filter((r) => r.skill.level === level).map((r) => r.skill.label);
  return { level, labels: labels.slice(0, cap), more: Math.max(0, labels.length - cap) };
}

const rxMovements = new WeakMap<ParsedRow, readonly { id: string }[]>();

/** The movements an RX row's athlete was prescribed: the RX version's, when the description has versions, else the row's own. */
function prescribedMovements(r: ParsedRow): readonly { id: string }[] {
  if (!hasVersions(r.raw.description)) return r.movements;
  let found = rxMovements.get(r);
  if (!found) {
    found = findRowMovements({ title: r.raw.title, description: rxVersionText(r.raw.description), barbell_lift: r.raw.barbell_lift });
    rxMovements.set(r, found);
  }
  return found;
}

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
    for (const m of prescribedMovements(r)) {
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
