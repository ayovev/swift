import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ALL_TABS, BODY_COMP_TAB, OVERVIEW_TAB, PLATEAU_TAB, WORKOUTS_TAB, TabNav } from "@/components/dashboard/TabNav";
import { DOMAIN_LIST } from "@/types/dashboard";
import { MODALITY_LIST } from "@/types/modality";

// Radix's DropdownMenuTrigger opens on pointerdown, not click (so it can
// preventDefault the following click from re-closing the menu) — a plain
// fireEvent.click never fires it.
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0 });
}

const strengthTab = ALL_TABS.find((t) => t.group === "Domains" && t.label === "Strength")!;
const flexibilityTab = ALL_TABS.find((t) => t.group === "Domains" && t.label === "Flexibility")!;
const gymnasticsTab = ALL_TABS.find((t) => t.group === "Modalities" && t.label === "Gymnastics")!;

describe("TabNav — ALL_TABS", () => {
  it("has one entry per Overview, Workouts, GPP domain, modality, Body Comp and Plateaus", () => {
    expect(ALL_TABS).toHaveLength(1 + 1 + DOMAIN_LIST.length + MODALITY_LIST.length + 1 + 1);
    expect(ALL_TABS.filter((t) => t.group === "Domains")).toHaveLength(DOMAIN_LIST.length);
    expect(ALL_TABS.filter((t) => t.group === "Modalities")).toHaveLength(MODALITY_LIST.length);
    expect(ALL_TABS.filter((t) => t.group === "Overview")).toHaveLength(1);
    expect(ALL_TABS.filter((t) => t.group === "Workouts")).toHaveLength(1);
    expect(ALL_TABS.filter((t) => t.group === "Body composition")).toHaveLength(1);
    expect(ALL_TABS.filter((t) => t.group === "Plateaus")).toHaveLength(1);
  });
});

describe("TabNav — desktop group pills", () => {
  it("selects Overview, Workouts, Body Comp and Plateaus directly, with no menu", () => {
    const onValueChange = vi.fn();
    render(<TabNav value={strengthTab.value} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onValueChange).toHaveBeenCalledWith(OVERVIEW_TAB);

    fireEvent.click(screen.getByRole("button", { name: "Workouts" }));
    expect(onValueChange).toHaveBeenCalledWith(WORKOUTS_TAB);

    fireEvent.click(screen.getByRole("button", { name: "Body Comp" }));
    expect(onValueChange).toHaveBeenCalledWith(BODY_COMP_TAB);

    fireEvent.click(screen.getByRole("button", { name: "Plateaus" }));
    expect(onValueChange).toHaveBeenCalledWith(PLATEAU_TAB);
  });

  it("shows the active domain's own name on the Domains pill", () => {
    render(<TabNav value={strengthTab.value} onValueChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Strength/ })).toBeInTheDocument();
    // The generic group name only shows when no domain is active.
    expect(screen.queryByRole("button", { name: /^Domains/ })).not.toBeInTheDocument();
  });

  it("falls back to the generic group name when that group isn't active", () => {
    render(<TabNav value={OVERVIEW_TAB} onValueChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Domains/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Modalities/ })).toBeInTheDocument();
  });

  it("opens the Domains menu and selects a domain from it", async () => {
    const onValueChange = vi.fn();
    render(<TabNav value={OVERVIEW_TAB} onValueChange={onValueChange} />);

    openMenu(screen.getByRole("button", { name: /^Domains/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(DOMAIN_LIST.length);

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: flexibilityTab.label }));
    expect(onValueChange).toHaveBeenCalledWith(flexibilityTab.value);
  });

  it("opens the Modalities menu and selects a modality from it", async () => {
    const onValueChange = vi.fn();
    render(<TabNav value={OVERVIEW_TAB} onValueChange={onValueChange} />);

    openMenu(screen.getByRole("button", { name: /^Modalities/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(MODALITY_LIST.length);

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: gymnasticsTab.label }));
    expect(onValueChange).toHaveBeenCalledWith(gymnasticsTab.value);
  });

  it("marks the current tab as checked when its menu is reopened", async () => {
    render(<TabNav value={strengthTab.value} onValueChange={vi.fn()} />);

    openMenu(screen.getByRole("button", { name: /^Strength/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitemradio", { name: "Strength" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});

describe("TabNav — mobile select", () => {
  it("lists every tab, grouped into optgroups for everything but Overview", () => {
    render(<TabNav value={OVERVIEW_TAB} onValueChange={vi.fn()} />);
    const select = screen.getByLabelText("Choose a view") as HTMLSelectElement;

    expect(within(select).getAllByRole("option")).toHaveLength(ALL_TABS.length);
    expect(within(select).getByRole("group", { name: "Workouts" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Domains" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Modalities" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Body composition" })).toBeInTheDocument();
    expect(within(select).getByRole("group", { name: "Plateaus" })).toBeInTheDocument();
  });

  it("changing the select calls onValueChange with the chosen tab's value", () => {
    const onValueChange = vi.fn();
    render(<TabNav value={OVERVIEW_TAB} onValueChange={onValueChange} />);
    const select = screen.getByLabelText("Choose a view");

    fireEvent.change(select, { target: { value: gymnasticsTab.value } });
    expect(onValueChange).toHaveBeenCalledWith(gymnasticsTab.value);
  });
});
