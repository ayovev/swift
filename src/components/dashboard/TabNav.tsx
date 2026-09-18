import { useRef } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";
import { cn } from "@/lib/utils";

export const OVERVIEW_TAB = "overview";
export const BODY_COMP_TAB = "body-comp";

export interface TabDescriptor {
  value: string;
  label: string;
  group: "Overview" | "Domains" | "Modalities" | "Body composition";
}

/**
 * All 15 tabs: Overview, ten GPP domains, three modalities, and Body Comp —
 * the last one built from a wholly separate InBody upload, always present
 * in the nav even before any InBody data is loaded (see BodyCompTab).
 */
export const ALL_TABS: TabDescriptor[] = [
  { value: OVERVIEW_TAB, label: "Overview", group: "Overview" },
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
];

const GROUPS = ["Overview", "Domains", "Modalities", "Body composition"] as const;
type Group = (typeof GROUPS)[number];

const GROUP_LABELS: Record<Group, string> = {
  Overview: "Overview",
  Domains: "Domains",
  Modalities: "Modalities",
  "Body composition": "Body Comp",
};

/** Overview and Body Comp are single tabs; only these two have more than one. */
const EXPANDABLE_GROUPS: readonly Group[] = ["Domains", "Modalities"];

function groupOf(value: string): Group {
  return ALL_TABS.find((t) => t.value === value)?.group ?? "Overview";
}

/**
 * Fourteen tabs is too many for one undifferentiated strip, and far too many
 * for a phone. On wide viewports a single row of four group pills (Overview /
 * Domains / Modalities / Body Comp) is always visible; picking "Domains" or
 * "Modalities" expands a second row underneath with just that group's tabs,
 * so at most one ten-wide or three-wide row is ever showing instead of all
 * fourteen at once. On narrow viewports the whole thing collapses to a
 * native select with the same groups as `optgroup`s, which is both more
 * usable and better for assistive tech than a scroller.
 */
export function TabNav({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const activeGroup = groupOf(value);

  // Remembers the last sub-tab visited within each expandable group, so
  // switching back to "Domains" returns to where you left off rather than
  // always resetting to the first domain.
  const lastActive = useRef<Partial<Record<Group, string>>>({});
  if (EXPANDABLE_GROUPS.includes(activeGroup)) {
    lastActive.current[activeGroup] = value;
  }

  const selectGroup = (group: Group) => {
    if (group === "Overview") return onValueChange(OVERVIEW_TAB);
    if (group === "Body composition") return onValueChange(BODY_COMP_TAB);
    const fallback = ALL_TABS.find((t) => t.group === group)?.value ?? OVERVIEW_TAB;
    onValueChange(lastActive.current[group] ?? fallback);
  };

  const subTabs = EXPANDABLE_GROUPS.includes(activeGroup)
    ? ALL_TABS.filter((t) => t.group === activeGroup)
    : [];

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
      <div className="hidden sm:block">
        <div role="group" aria-label="View group" className="inline-flex gap-1 rounded-lg border border-border p-1">
          {GROUPS.map((group) => {
            const isActive = group === activeGroup;
            return (
              <button
                key={group}
                type="button"
                aria-pressed={isActive}
                onClick={() => selectGroup(group)}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent-subtle text-accent-link"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {GROUP_LABELS[group]}
              </button>
            );
          })}
        </div>

        {subTabs.length > 0 ? (
          <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
            <TabsList className="h-auto w-max gap-1 bg-transparent p-0">
              {subTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "shrink-0 rounded-md border border-transparent px-3 py-1.5 text-sm",
                    "data-[state=active]:border-accent-border data-[state=active]:bg-accent-subtle",
                    "data-[state=active]:text-accent-link data-[state=active]:shadow-none"
                  )}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        ) : null}
      </div>
    </>
  );
}
