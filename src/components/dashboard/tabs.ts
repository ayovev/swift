import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";

export const OVERVIEW_TAB = "overview";
export const WORKOUTS_TAB = "workouts";
/** Training → Lifts. Not `lifts`: that id is Progress's, kept from before its rename. */
export const LIFT_HISTORY_TAB = "lift-history";
export const BODY_COMP_TAB = "body-comp";
export const LIFTS_TAB = "lifts";
export const TIMELINE_TAB = "timeline";
export const MOVEMENTS_TAB = "movements";

export interface TabDescriptor {
  value: string;
  label: string;
  group:
    | "Overview"
    | "Workouts"
    | "Lifts"
    | "Domains"
    | "Modalities"
    | "Movements"
    | "Body composition"
    | "Progress"
    | "Timeline";
}

/**
 * Every view the dashboard can show, flat. How they're grouped into
 * sections for navigation lives in SectionNav.tsx; this list is the
 * identity of each view (its value and short label), which analytics
 * (`tab_viewed`) and the tab content in Dashboard.tsx key off.
 *
 * All 20 tabs: Overview, the running Workouts list, Lifts (every lift and
 * benchmark session and every PR, for the selected range; see LiftHistoryTab), ten GPP domains, three
 * modalities, Movements (any one movement, or a family of them, across the
 * log; see MovementsTab), Body Comp — built from a wholly separate InBody upload,
 * always present in the nav even before any InBody data is loaded (see
 * BodyCompTab) — Progress, the verdict on each lift and benchmark (see LiftsTab,
 * `lib/analytics/insights`), and Timeline, the athlete's own entries laid beside
 * those verdicts (see TimelineTab).
 */
export const ALL_TABS: TabDescriptor[] = [
  { value: OVERVIEW_TAB, label: "Overview", group: "Overview" },
  { value: WORKOUTS_TAB, label: "Workouts", group: "Workouts" },
  { value: LIFT_HISTORY_TAB, label: "Lifts", group: "Lifts" },
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
  { value: TIMELINE_TAB, label: "Timeline", group: "Timeline" },
];
