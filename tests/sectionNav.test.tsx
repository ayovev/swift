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
  EXPERIMENTS_TAB,
  OVERVIEW_TAB,
  PLATEAU_TAB,
  WORKOUTS_TAB,
} from "@/components/dashboard/tabs";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_NAMES } from "@/types/modality";

const strengthTab = ALL_TABS.find((t) => t.group === "Domains" && t.label === "Strength")!;
const gymnasticsTab = ALL_TABS.find((t) => t.group === "Modalities" && t.label === "Gymnastics")!;

describe("ALL_TABS", () => {
  it("has one entry per Overview, Workouts, GPP domain, modality, Body Comp, Plateaus, Alignment, Strength and Experiments", () => {
    expect(ALL_TABS).toHaveLength(1 + 1 + DOMAIN_LIST.length + MODALITY_LIST.length + 1 + 1 + 1 + 1 + 1);
  });
});

describe("SECTIONS", () => {
  it("places every tab in exactly one section, with nothing extra", () => {
    const placed = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.values));
    expect([...placed].sort()).toEqual(ALL_TABS.map((t) => t.value).sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("groups views by what they're about", () => {
    expect(sectionOf(OVERVIEW_TAB)).toBe("Training");
    expect(sectionOf(WORKOUTS_TAB)).toBe("Training");
    expect(sectionOf(strengthTab.value)).toBe("Breakdown");
    expect(sectionOf(gymnasticsTab.value)).toBe("Breakdown");
    expect(sectionOf(BODY_COMP_TAB)).toBe("Body");
    expect(sectionOf(PLATEAU_TAB)).toBe("Insights");
    expect(sectionOf(EXPERIMENTS_TAB)).toBe("Insights");
  });
});

describe("pageTitleOf", () => {
  it("uses full names where the tab label is a short form", () => {
    expect(pageTitleOf("domain:Cardiovascular/Respiratory Endurance")).toBe(
      "Cardiovascular/Respiratory Endurance"
    );
    expect(pageTitleOf(gymnasticsTab.value)).toBe(MODALITY_NAMES.G);
    expect(pageTitleOf(BODY_COMP_TAB)).toBe("Body composition");
    expect(pageTitleOf(OVERVIEW_TAB)).toBe("Overview");
  });
});

describe("SectionLinks", () => {
  it("marks the current section and opens a section on its first view", () => {
    const onValueChange = vi.fn();
    render(<SectionLinks value={strengthTab.value} onValueChange={onValueChange} />);

    expect(screen.getByRole("button", { name: "Breakdown" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Training" })).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    expect(onValueChange).toHaveBeenCalledWith(PLATEAU_TAB);
    fireEvent.click(screen.getByRole("button", { name: "Body" }));
    expect(onValueChange).toHaveBeenCalledWith(BODY_COMP_TAB);
  });
});

describe("SubNav", () => {
  it("shows every domain and modality at once in Breakdown, as two labelled groups", () => {
    const onValueChange = vi.fn();
    render(<SubNav value={strengthTab.value} onValueChange={onValueChange} />);

    const domains = screen.getByRole("group", { name: "Domains" });
    const modalities = screen.getByRole("group", { name: "Modalities" });
    expect(within(domains).getAllByRole("button")).toHaveLength(DOMAIN_LIST.length);
    expect(within(modalities).getAllByRole("button")).toHaveLength(MODALITY_LIST.length);
    expect(within(domains).getByRole("button", { name: "Strength" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(modalities).getByRole("button", { name: "Gymnastics" }));
    expect(onValueChange).toHaveBeenCalledWith(gymnasticsTab.value);
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
    render(<SubNav value={PLATEAU_TAB} onValueChange={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Insights views" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Plateaus",
      "Alignment",
      "Strength",
      "Experiments",
    ]);
  });

  it("renders nothing for a single-view section", () => {
    const { container } = render(<SubNav value={BODY_COMP_TAB} onValueChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
