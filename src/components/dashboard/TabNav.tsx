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

/**
 * Fourteen tabs is too many for one undifferentiated strip, and far too many
 * for a phone. On wide viewports they are clustered into labeled groups
 * (Domains / Modalities / Body composition) with a divider and a small
 * uppercase caption above each, so the strip reads as three sections instead
 * of one long row; on narrow ones the whole thing collapses to a native
 * select with the same groups as `optgroup`s, which is both more usable and
 * better for assistive tech than a 14-wide scroller.
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
        <TabsList className="h-auto w-max items-start gap-1 bg-transparent p-0">
          {GROUPS.map((group, groupIndex) => (
            <div key={group} className="flex items-start gap-1">
              {groupIndex > 0 ? (
                <span
                  className="mx-2 hidden h-5 w-px shrink-0 self-center bg-border md:block"
                  aria-hidden="true"
                />
              ) : null}
              <div className="flex flex-col gap-1">
                {group === "Overview" ? (
                  <span className="h-[13px]" aria-hidden="true" />
                ) : (
                  <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {group}
                  </span>
                )}
                <div className="flex gap-1">
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
              </div>
            </div>
          ))}
        </TabsList>
      </div>
    </>
  );
}
