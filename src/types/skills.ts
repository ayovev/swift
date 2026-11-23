/**
 * What the Skills report needs to know about a movement (docs/reports.md, "Skills report"). It lives on the movement's own lexicon
 * entries (`MovementEntry.skill`), so adding a movement and deciding whether it is a skill are one edit in one file.
 */
export type SkillLevel = "beginner" | "intermediate" | "advanced";

/** One skill: several movement ids can share it ("Pull-ups" counts strict, kipping and butterfly). Defined once, in `SKILLS` in the lexicon. */
export interface SkillRef {
  /** Stable, kebab-case. Every movement id under one skill carries this same ref. */
  key: string;
  /** Shown in the report. May differ from a movement's own label ("Chest-to-bar pull-ups"). */
  label: string;
  level: SkillLevel;
}
