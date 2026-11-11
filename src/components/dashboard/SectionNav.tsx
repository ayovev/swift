import {
  ALL_TABS,
  BODY_COMP_TAB,
  LIFT_HISTORY_TAB,
  LIFTS_TAB,
  MOVEMENTS_TAB,
  OVERVIEW_TAB,
  TIMELINE_TAB,
  WORKOUTS_TAB,
} from "./tabs";
import { CROSSFIT_DEFINITIONS, DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_NAMES } from "@/types/modality";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Section = "Overview" | "Training" | "Body" | "Insights";

interface SubGroup {
  /** Shown as a small label ahead of its tabs — only where a section mixes two kinds of view. */
  label?: string;
  values: string[];
}

/**
 * Twenty views, grouped the way an athlete actually moves between them:
 * the front page (Overview), what I did and what it was made of (Training —
 * the workout list and the lift and benchmark record, then the ten GPP domains, three modalities and the
 * movements themselves, which are a *classification* of those same workouts
 * rather than separate data, hence their group headers), what my body did
 * (Body), and what the two datasets say together (Insights — Progress and
 * Timeline: whether each lift and benchmark is moving, and the things the
 * athlete changed or that happened, laid beside those verdicts).
 *
 * Two levels, never a dropdown: the section row sits in the page header and
 * the views inside a section are a plain row of tabs under the page title,
 * so every sibling is visible without opening anything. A section with one
 * view (Overview, Body) shows no second row at all.
 */
export const SECTIONS: { id: Section; groups: SubGroup[] }[] = [
  { id: "Overview", groups: [{ values: [OVERVIEW_TAB] }] },
  {
    id: "Training",
    groups: [
      { values: [WORKOUTS_TAB, LIFT_HISTORY_TAB] },
      { label: "Domains", values: ALL_TABS.filter((t) => t.group === "Domains").map((t) => t.value) },
      { label: "Modalities", values: ALL_TABS.filter((t) => t.group === "Modalities").map((t) => t.value) },
      { values: [MOVEMENTS_TAB] },
    ],
  },
  { id: "Body", groups: [{ values: [BODY_COMP_TAB] }] },
  { id: "Insights", groups: [{ values: [LIFTS_TAB, TIMELINE_TAB] }] },
];

export function sectionOf(value: string): Section {
  return SECTIONS.find((s) => s.groups.some((g) => g.values.includes(value)))?.id ?? "Overview";
}

/** The view's short label, as its tab shows it. */
function labelOf(value: string): string {
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
  if (value === LIFT_HISTORY_TAB) return "Lifts and benchmarks";
  return labelOf(value);
}

/** A line of subtext under the page heading: CrossFit's definition, on a domain page only. */
export function pageSubtitleOf(value: string): string | null {
  const domain = DOMAIN_LIST.find((d) => value === `domain:${d}`);
  return domain ? CROSSFIT_DEFINITIONS[domain] : null;
}

/**
 * A label that reserves its bold width. The active link is `font-medium` and
 * the rest are regular, so without this each link's width — and every sibling's
 * position — shifts a pixel or two when the selection moves. A hidden bold copy
 * of the text (via `::after`) sizes the box for both weights.
 */
function StableLabel({ children }: { children: string }) {
  return (
    <span
      data-label={children}
      className="flex flex-col items-center after:invisible after:block after:h-0 after:overflow-hidden after:font-medium after:content-[attr(data-label)]"
    >
      {children}
    </span>
  );
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
            <StableLabel>{s.id}</StableLabel>
          </button>
        );
      })}
    </nav>
  );
}

/** Whether the row has more tabs past its left or right edge. */
function useOverflowEdges(ref: RefObject<HTMLElement | null>, deps: readonly unknown[]) {
  const [edges, setEdges] = useState({ left: false, right: false, overflow: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      // A pixel of slack: sub-pixel layout leaves scrollLeft a hair short of max at the far end.
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1, overflow: max > 1 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, deps);
  return edges;
}

/** The fade at one edge of a row that scrolls: the cue that more tabs lie past it. It takes no clicks. */
function OverflowEdge({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 w-12",
        side === "left" ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l",
        "from-background via-background/80 to-transparent"
      )}
    />
  );
}

/**
 * The scroll button at one end of the row, on a mouse or trackpad only (on touch the row scrolls under a finger and the fade is the
 * whole cue). It sits in its own slot beside the row, not over it: laid over the fade it covered the last visible tab, and on a
 * touch laptop, which reports a fine pointer too, a tap meant for that tab scrolled the row instead. Disabled, not removed, at the
 * end it can't scroll past, so the row doesn't change width as it scrolls. Hidden from assistive tech and the tab order, since every
 * tab it scrolls to is already reachable by Tab.
 */
function ScrollButton({ side, enabled, onScroll }: { side: "left" | "right"; enabled: boolean; onScroll: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-scroll-button={side}
      disabled={!enabled}
      onClick={onScroll}
      className={cn(
        "hidden size-8 shrink-0 self-center items-center justify-center rounded-full text-muted-foreground ring-1 ring-border hover:text-foreground disabled:opacity-30 pointer-fine:flex",
        side === "left" ? "mr-1" : "ml-1"
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/**
 * The views inside the current section. Renders nothing for a single-view section.
 *
 * Training's sixteen tabs can be wider than the row, even on a 1280px window, so the row scrolls sideways; the hidden part is
 * never silent. A fade marks each edge with more tabs past it (and on a pointer device a button sits beside each end), a group's
 * label stays in view while any of its tabs do, and the selected tab is
 * scrolled into view whenever it changes, so arriving at Movements from a link doesn't leave Workouts as the only visible tab.
 * From `lg` up the gaps tighten, which is what fits the whole row at 1280px: measured, it was 1293px in a 1216px row before
 * and is 1216px after, with no room to spare, so a longer tab label would bring the fades back.
 */
export function SubNav({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const section = SECTIONS.find((s) => s.id === sectionOf(value))!;
  const total = section.groups.reduce((n, g) => n + g.values.length, 0);
  const ref = useRef<HTMLElement | null>(null);
  const edges = useOverflowEdges(ref, [section.id]);

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    // jsdom has no scrollIntoView; a browser always does.
    active?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);

  if (total < 2) return null;
  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  };
  return (
    <div className="flex items-end">
    {edges.overflow ? <ScrollButton side="left" enabled={edges.left} onScroll={() => scrollBy(-1)} /> : null}
    <div className="relative min-w-0 flex-1" data-overflow-left={edges.left || undefined} data-overflow-right={edges.right || undefined}>
      {edges.left ? <OverflowEdge side="left" /> : null}
      <nav
        ref={ref}
        aria-label={`${section.id} views`}
        // overflow-x-auto makes the y axis scroll too; the tabs' -mb-px overhangs the
        // bottom edge by 1px, which is what made this row scroll vertically.
        className="flex items-end gap-10 overflow-x-auto overflow-y-hidden border-b border-border lg:gap-6"
      >
        {section.groups.map((g, i) => (
          // A labelled group puts its label *above* its tabs, as a header —
          // inline with them it read as one more (dead) tab.
          <div key={g.label ?? i} role="group" aria-label={g.label} className="flex shrink-0 flex-col gap-0.5">
            {g.label ? (
              // Sticky inside the scrolling row, so a group's label stays in view while any of its tabs are: on a phone, scrolled to
              // the modalities, "Modalities" used to scroll away and leave the Cardio modality looking like the Cardio domain. Above
              // the fade (z-20), on the page colour.
              <span aria-hidden="true" data-group-label className="sticky left-0 z-20 self-start bg-background pr-2 text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase">
                {g.label}
              </span>
            ) : null}
            <div className="flex items-stretch gap-5 lg:gap-4">
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
                    <StableLabel>{labelOf(v)}</StableLabel>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {edges.right ? <OverflowEdge side="right" /> : null}
    </div>
    {edges.overflow ? <ScrollButton side="right" enabled={edges.right} onScroll={() => scrollBy(1)} /> : null}
    </div>
  );
}
