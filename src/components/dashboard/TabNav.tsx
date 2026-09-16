import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS } from "@/types/modality";
import { cn } from "@/lib/utils";

export const OVERVIEW_TAB = "overview";
export const BODY_COMP_TAB = "body-comp";

export interface TabDescriptor {
  value: string;
  label: string;
  group: "Overview" | "Physical skills" | "Modalities" | "Body composition";
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
    group: "Physical skills" as const,
  })),
  ...MODALITY_LIST.map((m) => ({
    value: `modality:${m}`,
    label: MODALITY_SHORT_LABELS[m],
    group: "Modalities" as const,
  })),
  { value: BODY_COMP_TAB, label: "Body Comp", group: "Body composition" },
];

const GROUPS = ["Overview", "Physical skills", "Modalities", "Body composition"] as const;

/**
 * Fourteen tabs is too many for one undifferentiated strip, and far too many
 * for a phone. On wide viewports they are grouped and horizontally scrollable;
 * on narrow ones the whole thing collapses to a native select, which is both
 * more usable and better for assistive tech than a 14-wide scroller.
 */
export function TabNav({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
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
      <div className="-mx-1 hidden overflow-x-auto px-1 pb-1 sm:block">
        <TabsList className="h-auto w-max gap-1 bg-transparent p-0">
          {GROUPS.map((group, groupIndex) => (
            <div key={group} className="flex items-center gap-1">
              {groupIndex > 0 ? (
                <span
                  className="mx-2 hidden h-5 w-px shrink-0 bg-border md:block"
                  aria-hidden="true"
                />
              ) : null}
              {ALL_TABS.filter((t) => t.group === group).map((tab) => (
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
            </div>
          ))}
        </TabsList>
      </div>
    </>
  );
}
