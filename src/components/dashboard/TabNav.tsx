import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";
import { cn } from "@/lib/utils";

export const OVERVIEW_TAB = "overview";
export const WORKOUTS_TAB = "workouts";
export const BODY_COMP_TAB = "body-comp";
export const PLATEAU_TAB = "plateaus";
export const ALIGNMENT_TAB = "alignment";

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
    | "Alignment";
}

/**
 * All 18 tabs: Overview, the running Workouts list, ten GPP domains, three
 * modalities, Body Comp — built from a wholly separate InBody upload,
 * always present in the nav even before any InBody data is loaded (see
 * BodyCompTab) — Plateaus, which needs both datasets and is likewise always
 * present (see PlateauTab), and Alignment, the whole-athlete rollup of
 * Plateaus + InBody (see AlignmentTab), same always-present treatment.
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
];

const GROUPS = [
  "Overview",
  "Workouts",
  "Domains",
  "Modalities",
  "Body composition",
  "Plateaus",
  "Alignment",
] as const;
type Group = (typeof GROUPS)[number];

const GROUP_LABELS: Record<Group, string> = {
  Overview: "Overview",
  Workouts: "Workouts",
  Domains: "Domains",
  Modalities: "Modalities",
  "Body composition": "Body Comp",
  Plateaus: "Plateaus",
  Alignment: "Alignment",
};

/** Overview, Workouts, Body Comp, Plateaus and Alignment are single tabs and select directly; the other two open a menu. */
const DIRECT_VALUES: Partial<Record<Group, string>> = {
  Overview: OVERVIEW_TAB,
  Workouts: WORKOUTS_TAB,
  "Body composition": BODY_COMP_TAB,
  Plateaus: PLATEAU_TAB,
  Alignment: ALIGNMENT_TAB,
};

function groupOf(value: string): Group {
  return ALL_TABS.find((t) => t.value === value)?.group ?? "Overview";
}

/**
 * Eighteen tabs is too many for one undifferentiated strip, and far too many
 * for a phone. On wide viewports the nav is a single row of pills — Overview,
 * Workouts, Body Comp, Plateaus and Alignment select directly since
 * each is one tab, while Domains and Modalities open a dropdown of their own
 * tabs instead of expanding a second row underneath. That keeps the nav's height constant
 * (no row that appears/disappears and shifts the page) without reserving
 * blank space for it either — the menu overlays instead of taking up
 * layout. The active pill shows the current tab's own name (e.g. "Strength")
 * so which one you're on is visible without opening the menu. On narrow
 * viewports the whole thing collapses to a native select with the same
 * groups as `optgroup`s, which is both more usable and better for
 * assistive tech than a scroller.
 */
export function TabNav({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const activeGroup = groupOf(value);

  return (
    <>
      {/* Mobile */}
      <div className="sm:hidden">
        <label htmlFor="tab-select" className="sr-only">
          Choose a view
        </label>
        <select
          id="tab-select"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn(
            "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          )}
        >
          {GROUPS.map((group) => {
            const tabs = ALL_TABS.filter((t) => t.group === group);
            return group === "Overview" ? (
              tabs.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))
            ) : (
              <optgroup key={group} label={group}>
                {tabs.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* Desktop / tablet */}
      <div
        role="group"
        aria-label="View"
        className="hidden w-fit gap-1 rounded-lg border border-border p-1 sm:inline-flex"
      >
        {GROUPS.map((group) => {
          const isActive = group === activeGroup;
          const directValue = DIRECT_VALUES[group];
          const pillClass = cn(
            "flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive ? "bg-accent-subtle text-accent-link" : "text-muted-foreground hover:text-foreground"
          );

          if (directValue !== undefined) {
            return (
              <button
                key={group}
                type="button"
                aria-pressed={isActive}
                onClick={() => onValueChange(directValue)}
                className={pillClass}
              >
                {GROUP_LABELS[group]}
              </button>
            );
          }

          const groupTabs = ALL_TABS.filter((t) => t.group === group);
          const current = groupTabs.find((t) => t.value === value);

          return (
            <DropdownMenu key={group}>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-pressed={isActive} className={pillClass}>
                  {current?.label ?? GROUP_LABELS[group]}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
                  {groupTabs.map((tab) => (
                    <DropdownMenuRadioItem key={tab.value} value={tab.value}>
                      {tab.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </>
  );
}
