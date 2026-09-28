import {
  ALIGNMENT_TAB,
  ALL_TABS,
  BODY_COMP_TAB,
  EXPERIMENTS_TAB,
  OVERVIEW_TAB,
  PLATEAU_TAB,
  WORKOUTS_TAB,
} from "./tabs";
import { CROSSFIT_DEFINITIONS, DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_NAMES } from "@/types/modality";
import { cn } from "@/lib/utils";

export type Section = "Training" | "Breakdown" | "Body" | "Insights";

interface SubGroup {
  /** Shown as a small label ahead of its tabs — only where a section mixes two kinds of view. */
  label?: string;
  values: string[];
}

/**
 * Nineteen views, grouped the way an athlete actually moves between them:
 * what I did (Training), what it was made of (Breakdown — the ten GPP
 * domains and three modalities, which are a *classification* of the same
 * workouts rather than separate data), what my body did (Body), and what
 * the two datasets say together (Insights — Plateaus, Alignment and
 * Experiments, the three pipelines that need both uploads).
 *
 * Two levels, never a dropdown: the section row sits in the page header and
 * the views inside a section are a plain row of tabs under the page title,
 * so every sibling is visible without opening anything. A section with one
 * view (Body) shows no second row at all.
 */
export const SECTIONS: { id: Section; groups: SubGroup[] }[] = [
  { id: "Training", groups: [{ values: [OVERVIEW_TAB, WORKOUTS_TAB] }] },
  {
    id: "Breakdown",
    groups: [
      { label: "Domains", values: ALL_TABS.filter((t) => t.group === "Domains").map((t) => t.value) },
      { label: "Modalities", values: ALL_TABS.filter((t) => t.group === "Modalities").map((t) => t.value) },
    ],
  },
  { id: "Body", groups: [{ values: [BODY_COMP_TAB] }] },
  { id: "Insights", groups: [{ values: [PLATEAU_TAB, ALIGNMENT_TAB, EXPERIMENTS_TAB] }] },
];

export function sectionOf(value: string): Section {
  return SECTIONS.find((s) => s.groups.some((g) => g.values.includes(value)))?.id ?? "Training";
}

/** The view's short label, as its tab shows it. */
export function labelOf(value: string): string {
  return ALL_TABS.find((t) => t.value === value)?.label ?? value;
}

/**
 * The view's page heading. Tabs use short labels to fit a row ("Cardio",
 * "Body Comp"); the heading has room for the full name, so domains and
 * modalities use theirs.
 */
export function pageTitleOf(value: string): string {
  const domain = DOMAIN_LIST.find((d) => value === `domain:${d}`);
  if (domain) return domain;
  const modality = MODALITY_LIST.find((m) => value === `modality:${m}`);
  if (modality) return MODALITY_NAMES[modality];
  if (value === BODY_COMP_TAB) return "Body composition";
  return labelOf(value);
}

/** A line of subtext under the page heading: CrossFit's definition, on a domain page only. */
export function pageSubtitleOf(value: string): string | null {
  const domain = DOMAIN_LIST.find((d) => value === `domain:${d}`);
  return domain ? CROSSFIT_DEFINITIONS[domain] : null;
}

/** Top-level sections, rendered in the page header. Selecting one opens its first view. */
export function SectionLinks({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const active = sectionOf(value);
  return (
    <nav aria-label="Sections" className="flex h-12 items-stretch gap-6 sm:h-16 sm:gap-7">
      {SECTIONS.map((s) => {
        const isActive = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onValueChange(s.groups[0]!.values[0]!)}
            className={cn(
              "-mb-px flex items-center border-b-2 text-sm transition-colors",
              isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s.id}
          </button>
        );
      })}
    </nav>
  );
}

/** The views inside the current section. Renders nothing for a single-view section. */
export function SubNav({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const section = SECTIONS.find((s) => s.id === sectionOf(value))!;
  const total = section.groups.reduce((n, g) => n + g.values.length, 0);
  if (total < 2) return null;
  return (
    <nav
      aria-label={`${section.id} views`}
      className="flex items-end gap-10 overflow-x-auto border-b border-border"
    >
      {section.groups.map((g, i) => (
        // A labelled group puts its label *above* its tabs, as a header —
        // inline with them it read as one more (dead) tab.
        <div key={g.label ?? i} role="group" aria-label={g.label} className="flex shrink-0 flex-col gap-0.5">
          {g.label ? (
            <span aria-hidden="true" className="text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase">
              {g.label}
            </span>
          ) : null}
          <div className="flex items-stretch gap-5">
            {g.values.map((v) => {
              const isActive = v === value;
              return (
                <button
                  key={v}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onValueChange(v)}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 py-3 text-sm whitespace-nowrap transition-colors",
                    isActive
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {labelOf(v)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
