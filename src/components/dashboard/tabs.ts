import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";

export const OVERVIEW_TAB = "overview";
export const WORKOUTS_TAB = "workouts";
export const BODY_COMP_TAB = "body-comp";
export const PLATEAU_TAB = "plateaus";
export const ALIGNMENT_TAB = "alignment";
export const EXPERIMENTS_TAB = "experiments";
export const STRENGTH_TAB = "relative-strength";
export const COMPARE_TAB = "compare";
export const TAGS_TAB = "tags";
export const CYCLES_TAB = "cycles";

export interface TabDescriptor {
  value: string;
  label: string;
  group:
    | "Overview"
    | "Workouts"
    | "Domains"
    | "Modalities"
    | "Body composition"
    | "Plateaus"
    | "Alignment"
    | "Experiments"
    | "Relative strength"
    | "Compare"
    | "Tags"
    | "Cycles";
}

/**
 * Every view the dashboard can show, flat. How they're grouped into
 * sections for navigation lives in SectionNav.tsx; this list is the
 * identity of each view (its value and short label), which analytics
 * (`tab_viewed`) and the tab content in Dashboard.tsx key off.
 *
 * All 23 tabs: Overview, the running Workouts list, ten GPP domains, three
 * modalities, Body Comp — built from a wholly separate InBody upload,
 * always present in the nav even before any InBody data is loaded (see
 * BodyCompTab) — Plateaus, which needs both datasets and is likewise always
 * present (see PlateauTab), Alignment, the whole-athlete rollup of
 * Plateaus + InBody (see AlignmentTab), same always-present treatment, and
 * Experiments, which re-anchors the same before/after comparison around a
 * user-logged intervention date and needs both datasets the same way (see
 * ExperimentsTab), and Strength, which divides each lift's estimated 1RM by body
 * mass to tell a stronger lift from a heavier athlete (see RelativeStrengthTab),
 * Compare, which sets any range against the one before it (see CompareTab), and
 * Cycles, a retrospective per training block (see CyclesTab), and Tags, the athlete's
 * own labelled stretches of time (see TagsTab).
 */
export const ALL_TABS: TabDescriptor[] = [
  { value: OVERVIEW_TAB, label: "Overview", group: "Overview" },
  { value: WORKOUTS_TAB, label: "Workouts", group: "Workouts" },
  ...DOMAIN_LIST.map((d) => ({
    value: `domain:${d}`,
    label: DOMAIN_SHORT_LABELS[d],
    group: "Domains" as const,
  })),
  ...MODALITY_LIST.map((m) => ({
    value: `modality:${m}`,
    label: MODALITY_SHORT_LABELS[m],
    group: "Modalities" as const,
  })),
  { value: BODY_COMP_TAB, label: "Body Comp", group: "Body composition" },
  { value: PLATEAU_TAB, label: "Plateaus", group: "Plateaus" },
  { value: ALIGNMENT_TAB, label: "Alignment", group: "Alignment" },
  { value: EXPERIMENTS_TAB, label: "Experiments", group: "Experiments" },
  { value: STRENGTH_TAB, label: "Strength", group: "Relative strength" },
  { value: COMPARE_TAB, label: "Compare", group: "Compare" },
  { value: CYCLES_TAB, label: "Cycles", group: "Cycles" },
  { value: TAGS_TAB, label: "Tags", group: "Tags" },
];
