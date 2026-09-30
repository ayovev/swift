import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";

export const OVERVIEW_TAB = "overview";
export const WORKOUTS_TAB = "workouts";
export const BODY_COMP_TAB = "body-comp";
export const LIFTS_TAB = "lifts";
export const PERIODS_TAB = "periods";
export const TAGS_TAB = "tags";

export interface TabDescriptor {
  value: string;
  label: string;
  group:
    | "Overview"
    | "Workouts"
    | "Domains"
    | "Modalities"
    | "Body composition"
    | "Lifts"
    | "Tags"
    | "Periods";
}

/**
 * Every view the dashboard can show, flat. How they're grouped into
 * sections for navigation lives in SectionNav.tsx; this list is the
 * identity of each view (its value and short label), which analytics
 * (`tab_viewed`) and the tab content in Dashboard.tsx key off.
 *
 * All 19 tabs: Overview, the running Workouts list, ten GPP domains, three
 * modalities, Body Comp — built from a wholly separate InBody upload,
 * always present in the nav even before any InBody data is loaded (see
 * BodyCompTab) — Lifts, which needs both datasets and is likewise always
 * present: the whole-athlete Alignment read, a plateau row per lift or
 * benchmark, and each lift's estimated 1RM per unit of body mass (see
 * LiftsTab), Periods, which sets any range against the one before it and is
 * also where saved experiments and training blocks live (see PeriodsTab), and
 * Tags, the athlete's own labelled stretches of time (see TagsTab).
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
  { value: LIFTS_TAB, label: "Lifts", group: "Lifts" },
  { value: PERIODS_TAB, label: "Periods", group: "Periods" },
  { value: TAGS_TAB, label: "Tags", group: "Tags" },
];
