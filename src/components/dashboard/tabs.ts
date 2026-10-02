import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";

export const OVERVIEW_TAB = "overview";
export const WORKOUTS_TAB = "workouts";
export const BODY_COMP_TAB = "body-comp";
export const LIFTS_TAB = "lifts";
export const COMPARE_TAB = "compare";
export const PERIODS_TAB = "periods";
export const MOVEMENTS_TAB = "movements";

export interface TabDescriptor {
  value: string;
  label: string;
  group:
    | "Overview"
    | "Workouts"
    | "Domains"
    | "Modalities"
    | "Movements"
    | "Body composition"
    | "Progress"
    | "Periods"
    | "Compare";
}

/**
 * Every view the dashboard can show, flat. How they're grouped into
 * sections for navigation lives in SectionNav.tsx; this list is the
 * identity of each view (its value and short label), which analytics
 * (`tab_viewed`) and the tab content in Dashboard.tsx key off.
 *
 * All 20 tabs: Overview, the running Workouts list, ten GPP domains, three
 * modalities, Movements (any one movement, or a family of them, across the
 * log; see MovementsTab), Body Comp — built from a wholly separate InBody upload,
 * always present in the nav even before any InBody data is loaded (see
 * BodyCompTab) — Progress, which needs both datasets and is likewise always
 * present: the whole-athlete Alignment read, a plateau row per lift or
 * benchmark, and each lift's estimated 1RM per unit of body mass (see
 * LiftsTab), Compare, which sets any range against the one before it and is
 * also where saved periods (the ones for something you changed) are opened
 * (see CompareTab), and Periods, the athlete's own labelled stretches of time —
 * experiments included — (see PeriodsTab; stored as "tags" under the hood).
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
  { value: MOVEMENTS_TAB, label: "Movements", group: "Movements" },
  { value: BODY_COMP_TAB, label: "Body Comp", group: "Body composition" },
  { value: LIFTS_TAB, label: "Progress", group: "Progress" },
  { value: COMPARE_TAB, label: "Compare", group: "Compare" },
  { value: PERIODS_TAB, label: "Periods", group: "Periods" },
];
