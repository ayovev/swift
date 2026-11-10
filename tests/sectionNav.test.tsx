import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SECTIONS,
  SectionLinks,
  SubNav,
  pageTitleOf,
  sectionOf,
} from "@/components/dashboard/SectionNav";
import {
  ALL_TABS,
  BODY_COMP_TAB,
  LIFT_HISTORY_TAB,
  LIFTS_TAB,
  MOVEMENTS_TAB,
  OVERVIEW_TAB,
  TIMELINE_TAB,
  WORKOUTS_TAB,
} from "@/components/dashboard/tabs";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_NAMES } from "@/types/modality";

const strengthTab = ALL_TABS.find((t) => t.group === "Domains" && t.label === "Strength")!;
const gymnasticsTab = ALL_TABS.find((t) => t.group === "Modalities" && t.label === "Gymnastics")!;

describe("ALL_TABS", () => {
  it("has one entry per Overview, Workouts, Lifts, GPP domain, modality, Movements, Body Comp, Progress and Timeline", () => {
    expect(ALL_TABS).toHaveLength(1 + 1 + 1 + DOMAIN_LIST.length + MODALITY_LIST.length + 1 + 1 + 1 + 1);
  });

  it("never gives two tabs the same label", () => {
    // The Cardio domain and the M modality were both "Cardio", side by side in Training's row: a tag and a share under one name.
    const labels = ALL_TABS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("SECTIONS", () => {
  it("places every tab in exactly one section, with nothing extra", () => {
    const placed = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.values));
    expect([...placed].sort()).toEqual(ALL_TABS.map((t) => t.value).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("groups views by what they're about", () => {
    expect(sectionOf(OVERVIEW_TAB)).toBe("Overview");
    expect(sectionOf(WORKOUTS_TAB)).toBe("Training");
    expect(sectionOf(LIFT_HISTORY_TAB)).toBe("Training");
    expect(sectionOf(strengthTab.value)).toBe("Training");
    expect(sectionOf(gymnasticsTab.value)).toBe("Training");
    expect(sectionOf(MOVEMENTS_TAB)).toBe("Training");
    expect(sectionOf("not-a-tab")).toBe("Overview");
    expect(sectionOf(BODY_COMP_TAB)).toBe("Body");
    expect(sectionOf(LIFTS_TAB)).toBe("Insights");
    expect(sectionOf(TIMELINE_TAB)).toBe("Insights");
  });
});

describe("pageTitleOf", () => {
  it("uses full names where the tab label is a short form", () => {
    expect(pageTitleOf("domain:Cardiovascular/Respiratory Endurance")).toBe(
      "Cardiovascular/Respiratory Endurance"
    );
    expect(pageTitleOf(gymnasticsTab.value)).toBe(MODALITY_NAMES.G);
    expect(pageTitleOf(BODY_COMP_TAB)).toBe("Body composition");
    expect(pageTitleOf(LIFT_HISTORY_TAB)).toBe("Lifts and benchmarks");
    expect(pageTitleOf(OVERVIEW_TAB)).toBe("Overview");
    expect(pageTitleOf(TIMELINE_TAB)).toBe("Timeline");
    expect(pageTitleOf(LIFTS_TAB)).toBe("Progress");
  });
});

describe("SectionLinks", () => {
  it("marks the current section and opens a section on its first view", () => {
    const onValueChange = vi.fn();
    render(<SectionLinks value={strengthTab.value} onValueChange={onValueChange} />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Overview",
      "Training",
      "Body",
      "Insights",
    ]);
    expect(screen.getByRole("button", { name: "Training" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "Training" }));
    expect(onValueChange).toHaveBeenCalledWith(WORKOUTS_TAB);
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onValueChange).toHaveBeenCalledWith(OVERVIEW_TAB);

    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    expect(onValueChange).toHaveBeenCalledWith(LIFTS_TAB);
    fireEvent.click(screen.getByRole("button", { name: "Body" }));
    expect(onValueChange).toHaveBeenCalledWith(BODY_COMP_TAB);
  });
});

describe("SubNav", () => {
  it("shows Workouts and Lifts first in Training, then every domain and modality at once as two labelled groups, then Movements", () => {
    const onValueChange = vi.fn();
    render(<SubNav value={strengthTab.value} onValueChange={onValueChange} />);

    const domains = screen.getByRole("group", { name: "Domains" });
    const modalities = screen.getByRole("group", { name: "Modalities" });
    expect(within(domains).getAllByRole("button")).toHaveLength(DOMAIN_LIST.length);
    expect(within(modalities).getAllByRole("button")).toHaveLength(MODALITY_LIST.length);
    expect(within(domains).getByRole("button", { name: "Strength" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(modalities).getByRole("button", { name: "Gymnastics" }));
    expect(onValueChange).toHaveBeenCalledWith(gymnasticsTab.value);

    const nav = screen.getByRole("navigation", { name: "Training views" });
    const all = within(nav).getAllByRole("button").map((b) => b.textContent);
    expect(all.slice(0, 2)).toEqual(["Workouts", "Lifts"]);
    expect(all.at(-1)).toBe("Movements");
    expect(all).toHaveLength(2 + DOMAIN_LIST.length + MODALITY_LIST.length + 1);
  });

  it("puts each group's label above its tabs, not in line with them", () => {
    render(<SubNav value={strengthTab.value} onValueChange={vi.fn()} />);
    for (const name of ["Domains", "Modalities"]) {
      const group = screen.getByRole("group", { name });
      const [label, tabs] = Array.from(group.children);
      expect(label).toHaveTextContent(name);
      expect(label!.tagName).toBe("SPAN");
      // The label is a header, never one of the clickable tabs.
      expect(within(tabs as HTMLElement).getAllByRole("button").every((b) => b.textContent !== name)).toBe(true);
    }
  });

  it("lists the Insights views", () => {
    render(<SubNav value={LIFTS_TAB} onValueChange={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Insights views" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Progress",
      "Timeline",
    ]);
  });

  it("renders nothing for a single-view section", () => {
    for (const value of [OVERVIEW_TAB, BODY_COMP_TAB]) {
      const { container, unmount } = render(<SubNav value={value} onValueChange={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
