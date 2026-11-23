import { beforeAll, describe, expect, it } from "vitest";
import { buildInsights, type Insights } from "@/lib/analytics/buildInsights";
import { hasVersions, rxVersionText } from "@/lib/analytics/rxVersion";
import { findRowMovements } from "@/lib/classify/classifyModality";
import { SKILL_LEVELS, SKILL_LIST, SKILL_MODALITY_ORDER, buildSkills, highestNewSkills } from "@/lib/analytics/skills";
import { MOVEMENT_FAMILIES } from "@/lib/classify/movementFamilies";
import { MOVEMENT_LEXICON } from "@/lib/classify/movementLexicon";
import { workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

const entriesById = new Map<string, typeof MOVEMENT_LEXICON[number][]>();
for (const e of MOVEMENT_LEXICON) entriesById.set(e.id, [...(entriesById.get(e.id) ?? []), e]);

describe("the skills on the lexicon", () => {
  it("is derived from the lexicon, so there is one list: every skill id is a lexicon id carrying that skill", () => {
    for (const s of SKILL_LIST) {
      expect(s.ids.length, s.key).toBeGreaterThan(0);
      for (const id of s.ids) for (const e of entriesById.get(id)!) expect(e.skill?.key, `${id} (${e.phrase})`).toBe(s.key);
    }
  });

  it("gives every alias of one movement the same skill decision, so a line cannot disagree with its siblings", () => {
    for (const [id, entries] of entriesById) {
      const first = entries[0]!.skill;
      for (const e of entries) expect(e.skill, `${id} (${e.phrase})`).toBe(first);
    }
  });

  it("gives every movement of one skill the skill's modality, and one label and level per skill key", () => {
    for (const s of SKILL_LIST) for (const id of s.ids) for (const e of entriesById.get(id)!) expect(e.modality, `${s.key}: ${id}`).toBe(s.modality);
    const refs = new Map<string, unknown>();
    for (const e of MOVEMENT_LEXICON) {
      if (!e.skill) continue;
      const seen = refs.get(e.skill.key);
      if (seen) expect(e.skill, e.skill.key).toBe(seen);
      refs.set(e.skill.key, e.skill);
    }
    expect(new Set(SKILL_LIST.map((s) => s.label)).size).toBe(SKILL_LIST.length);
  });

  it("makes a variant of a listed skill decide: a movement in a family with a skill says skill or null, never nothing", () => {
    // Without this, a new movement added to a family (a new muscle-up variant) would silently not count toward the skill it belongs to.
    const skillIds = new Set(SKILL_LIST.flatMap((s) => s.ids));
    const undecided: string[] = [];
    for (const family of MOVEMENT_FAMILIES) {
      if (!family.members.some((m) => skillIds.has(m))) continue;
      for (const id of family.members) if (entriesById.get(id)?.[0]?.skill === undefined) undecided.push(`${id} (in the ${family.id} family)`);
    }
    expect(undecided, `decide with skill: SKILLS.x or skill: null on each entry of: ${undecided.join(", ")}`).toEqual([]);
  });

  it("uses only the three named levels, and offers each of W and G at every level", () => {
    for (const s of SKILL_LIST) expect(SKILL_LEVELS).toContain(s.level);
    for (const m of ["W", "G"] as const) {
      for (const level of SKILL_LEVELS) expect(SKILL_LIST.some((s) => s.modality === m && s.level === level), `${m} ${level}`).toBe(true);
    }
    // M has no Advanced skill, by decision (docs/reports.md): the lexicon's monostructural movements have none.
    expect(SKILL_LIST.some((s) => s.modality === "M" && s.level === "advanced")).toBe(false);
  });

  it("lists skills by modality, then level, then label", () => {
    const rank = (s: (typeof SKILL_LIST)[number]) => [SKILL_MODALITY_ORDER.indexOf(s.modality), SKILL_LEVELS.indexOf(s.level)];
    for (let i = 1; i < SKILL_LIST.length; i++) {
      const [pm, pl] = rank(SKILL_LIST[i - 1]!);
      const [cm, cl] = rank(SKILL_LIST[i]!);
      expect(pm! < cm! || (pm === cm && (pl! < cl! || (pl === cl && SKILL_LIST[i - 1]!.label.localeCompare(SKILL_LIST[i]!.label) <= 0)))).toBe(true);
    }
  });
});

describe("buildSkills", () => {
  let all: Insights;
  beforeAll(async () => {
    all = buildInsights(await loadSampleRows());
  });

  /** A small log of hand-made rows through the real pipeline. */
  const log = (rows: ReturnType<typeof workoutRow>[]) => buildInsights(rows).allRows;
  const row = (date: string, title: string, description: string, rx: string) => workoutRow({ date, title, description, rx_or_scaled: rx });

  it("checks a skill only for a workout flagged RX, and never for a scaled or unflagged one", () => {
    const rows = log([
      row("01/10/2025", "A", "10 Pull-ups", "SCALED"),
      row("01/12/2025", "B", "10 Toes-to-bar", ""),
      row("01/14/2025", "C", "10 Chest-to-bar", "RX"),
    ]);
    const d = buildSkills(rows, null, "2025-12-31");
    const result = (key: string) => d.groups.flatMap((g) => g.results).find((r) => r.skill.key === key)!;
    expect(result("pull-ups").through).toBe(false);
    expect(result("toes-to-bar").through).toBe(false);
    expect(result("chest-to-bar").through).toBe(true);
    expect(result("chest-to-bar").first).toEqual({ date: "2025-01-14", title: "C" });
  });

  it("takes the earliest RX workout as the first, and counts any of a skill's movements", () => {
    const rows = log([
      row("03/01/2025", "Later", "5 Strict pull-ups", "RX"),
      row("02/01/2025", "Earlier", "5 Kipping pull-ups", "RX"),
    ]);
    const pull = buildSkills(rows, null, "2025-12-31").groups.flatMap((g) => g.results).find((r) => r.skill.key === "pull-ups")!;
    expect(pull.first).toEqual({ date: "2025-02-01", title: "Earlier" });
  });

  it("marks a skill done before the start, new inside the period, or not yet, and counts nothing after the end", () => {
    const rows = log([
      row("01/10/2025", "Old", "10 Pull-ups", "RX"),
      row("03/10/2025", "Inside", "5 Toes-to-bar", "RX"),
      row("08/10/2025", "After", "5 Chest-to-bar", "RX"),
    ]);
    const d = buildSkills(rows, "2025-02-01", "2025-06-30");
    const result = (key: string) => d.groups.flatMap((g) => g.results).find((r) => r.skill.key === key)!;
    expect(result("pull-ups")).toMatchObject({ before: true, through: true, isNew: false });
    expect(result("toes-to-bar")).toMatchObject({ before: false, through: true, isNew: true });
    expect(result("chest-to-bar")).toMatchObject({ before: false, through: false, isNew: false, first: null });
    expect(d.newCount).toBe(1);
    expect(d.lastLogged).toBe("2025-03-10");
  });

  it("names the new skills at the highest level any new skill has, capped, and nothing when none is new", () => {
    const rows = log([
      row("03/01/2025", "Pull", "10 Pull-ups", "RX"),
      row("03/02/2025", "T2B", "5 Toes-to-bar", "RX"),
      row("03/03/2025", "Back squat", "5 Back squat", "RX"),
      row("03/04/2025", "Muscle", "3 Ring muscle-ups", "RX"),
      row("03/05/2025", "Snatch", "3 Snatch", "RX"),
      row("03/06/2025", "Clean", "3 Clean", "RX"),
      row("03/07/2025", "Pistol", "3 Pistols", "RX"),
    ]);
    const top = highestNewSkills(buildSkills(rows, "2025-02-01", "2025-06-30"), 3)!;
    expect(top.level).toBe("advanced");
    expect(top.labels).toHaveLength(3);
    expect(top.more).toBe(1);
    // The same log with the period starting after it: nothing is new.
    expect(highestNewSkills(buildSkills(rows, "2025-04-01", "2025-06-30"))).toBeNull();
    // All time has no start, so nothing is new either.
    expect(highestNewSkills(buildSkills(rows, null, "2025-06-30"))).toBeNull();
  });

  it("reads only the RX version of a workout that spells out several, so an easier version's movement is not credited", () => {
    const rows = log([
      row("04/20/2025", "10 Rounds", "- RX -10 rounds for time:1 legless rope climb200-m row- INTERMEDIATE -10 rounds for time:1 rope climb200-m row- BEGINNER -10 rounds for time:3 pull-to-stands150-m row", "RX"),
      row("05/02/2025", "Cindy", "- RX -AMRAP 20:5 pull-ups10 push-ups15 air squats- INTERMEDIATE - Same as Rxd- BEGINNER -Every 2:00 x 10 rounds:5 ring rows10 knee push-ups15 air squats", "RX"),
    ]);
    const d = buildSkills(rows, null, "2025-12-31");
    const result = (key: string) => d.groups.flatMap((g) => g.results).find((r) => r.skill.key === key)!;
    expect(result("legless-rope-climbs").through).toBe(true);
    expect(result("rope-climbs").through).toBe(false);
    expect(result("pull-ups").through).toBe(true);
    expect(result("ring-rows").through).toBe(false);
  });

  it("still reads a workout with no versions from its own movements, and a SCALED one not at all", () => {
    const rows = log([
      row("01/10/2025", "Plain", "10 Pull-ups", "RX"),
      row("01/12/2025", "Scaled versions", "- RX -5 muscle-ups- BEGINNER -5 ring rows", "SCALED"),
    ]);
    const d = buildSkills(rows, null, "2025-12-31");
    const result = (key: string) => d.groups.flatMap((g) => g.results).find((r) => r.skill.key === key)!;
    expect(result("pull-ups").through).toBe(true);
    expect(result("ring-muscle-ups").through).toBe(false);
    expect(result("ring-rows").through).toBe(false);
  });

  it("never names, as the workout behind a check, one whose RX version lacks the skill", () => {
    const d = buildSkills(all.allRows, null, "2026-09-11");
    const bySkill = new Map(SKILL_LIST.map((s) => [s.key, new Set(s.ids)]));
    for (const r of d.groups.flatMap((g) => g.results)) {
      if (!r.first) continue;
      const row = all.allRows.find((x) => x.dateParsed.format("YYYY-MM-DD") === r.first!.date && x.raw.title === r.first!.title && x.raw.rx_or_scaled === "RX")!;
      const text = hasVersions(row.raw.description) ? rxVersionText(row.raw.description) : row.raw.description;
      const ids = findRowMovements({ title: row.raw.title, description: text, barbell_lift: row.raw.barbell_lift }).map((m) => m.id);
      expect(ids.some((id) => bySkill.get(r.skill.key)!.has(id)), `${r.skill.key} via ${r.first.title}`).toBe(true);
    }
  });

  it("treats the start day as inside the period, and has no 'before' or 'new' for all time", () => {
    const rows = log([row("02/01/2025", "On the day", "10 Pull-ups", "RX")]);
    const onStart = buildSkills(rows, "2025-02-01", "2025-06-30").groups.flatMap((g) => g.results).find((r) => r.skill.key === "pull-ups")!;
    expect(onStart).toMatchObject({ before: false, isNew: true });
    const allTime = buildSkills(rows, null, "2025-06-30").groups.flatMap((g) => g.results).find((r) => r.skill.key === "pull-ups")!;
    expect(allTime).toMatchObject({ before: false, through: true, isNew: false });
  });

  it("groups M, W and G in that order, each by level, with counts that add up", () => {
    // The sample athlete has every listed skill by the end of the log, so a mid-log end is where some are still open.
    const d = buildSkills(all.allRows, "2023-01-01", "2023-12-31");
    expect(d.groups.map((g) => g.modality)).toEqual([...SKILL_MODALITY_ORDER]);
    for (const g of d.groups) {
      const ranks = g.results.map((r) => SKILL_LEVELS.indexOf(r.skill.level));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      expect(g.done).toBe(g.results.filter((r) => r.through).length);
    }
    expect(d.done).toBe(d.groups.reduce((n, g) => n + g.done, 0));
    expect(d.total).toBe(SKILL_LIST.length);
    expect(d.done).toBeGreaterThan(0);
    expect(d.done).toBeLessThan(d.total);
  });

  it("finds, on the sample, only skills whose first RX workout is real: every check names a workout flagged RX", () => {
    const d = buildSkills(all.allRows, null, "2026-09-11");
    for (const r of d.groups.flatMap((g) => g.results)) {
      if (!r.first) continue;
      const hit = all.allRows.find((row) => row.dateParsed.format("YYYY-MM-DD") === r.first!.date && row.raw.title === r.first!.title && row.raw.rx_or_scaled === "RX");
      expect(hit, r.skill.key).toBeDefined();
    }
  });

  it("is never more than it was: a later end can only add checks", () => {
    const early = buildSkills(all.allRows, null, "2024-06-30");
    const late = buildSkills(all.allRows, null, "2026-09-11");
    expect(late.done).toBeGreaterThanOrEqual(early.done);
    const doneEarly = new Set(early.groups.flatMap((g) => g.results).filter((r) => r.through).map((r) => r.skill.key));
    for (const r of late.groups.flatMap((g) => g.results)) if (doneEarly.has(r.skill.key)) expect(r.through).toBe(true);
  });
});
