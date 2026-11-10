import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DomainStrip, ModalityStrip } from "@/components/dashboard/charts/ComparisonStrip";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { DOMAIN_LIST, DOMAIN_SHORT_LABELS } from "@/types/dashboard";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * All ten domains, or all three modalities, side by side (ComparisonStrip.tsx): domains as separate bars on one shared 0 to 100%
 * scale (they are tags and add up to about 300%), modalities as one stacked bar (a split that adds to 100). Each is a link to its view.
 */

const insights = buildInsights(await loadSampleRows());
const width = (el: Element) => parseFloat((el as HTMLElement).style.width);

describe("the domain strip", () => {
  it("draws all ten on one shared scale, most trained first, with the current one marked", () => {
    const { container } = render(<DomainStrip data={insights.dashboard} current="Strength" onOpen={vi.fn()} />);
    const buttons = within(container.querySelector("[data-strip=domains]") as HTMLElement).getAllByRole("button");
    expect(buttons).toHaveLength(DOMAIN_LIST.length);
    const bars = [...container.querySelectorAll("[data-bar]")];
    // One scale for all: each bar's width is its own share of 100, not scaled to the largest.
    DOMAIN_LIST.forEach((d) => {
      const i = buttons.findIndex((b) => b.textContent!.startsWith(DOMAIN_SHORT_LABELS[d]));
      expect(width(bars[i]!)).toBeCloseTo(insights.dashboard.overall[d].pct, 5);
    });
    const widths = bars.map(width);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    expect(screen.getByRole("button", { current: "page" }).textContent).toMatch(/^Strength/);
    expect(screen.getAllByRole("button", { current: "page" })).toHaveLength(1);
    expect(screen.getByText(/add up to more than 100%/)).toBeInTheDocument();
  });

  it("opens a domain's own view", () => {
    const onOpen = vi.fn();
    render(<DomainStrip data={insights.dashboard} current="Strength" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /^Flexibility/ }));
    expect(onOpen).toHaveBeenCalledWith("domain:Flexibility");
  });

  it("gives each domain's change in points, and none over a range too short to compare halves", () => {
    const { unmount } = render(<DomainStrip data={insights.dashboard} current="Strength" onOpen={vi.fn()} />);
    const d = insights.dashboard.trend_direction.Strength.delta;
    expect(screen.getByRole("button", { name: /^Strength/ }).textContent).toContain(`${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(0)} pts`);
    unmount();
    const short = { ...insights.dashboard, trend_halves: { early: { from: "2026-10-01", to: "2026-10-10" }, late: { from: "2026-10-11", to: "2026-10-20" } } };
    render(<DomainStrip data={short} current="Strength" onOpen={vi.fn()} />);
    expect(screen.queryByText(/pts$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/first half/)).not.toBeInTheDocument();
  });
});

describe("the modality strip", () => {
  it("is one bar that adds to 100, in the bar order used everywhere, and opens each modality", () => {
    const onOpen = vi.fn();
    const { container } = render(<ModalityStrip data={insights.modality} current="G" onOpen={onOpen} />);
    const bars = [...container.querySelectorAll("[data-bar]")];
    expect(bars.map((b) => b.getAttribute("data-bar"))).toEqual(["W", "G", "M"]);
    expect(Math.round(bars.map(width).reduce((a, b) => a + b, 0))).toBe(100);
    expect(screen.getByRole("button", { current: "page" }).textContent).toMatch(/^G · Gymnastics/);
    fireEvent.click(screen.getByRole("button", { name: /^M · Cardio/ }));
    expect(onOpen).toHaveBeenCalledWith("modality:M");
    expect(screen.getByText(/Adds to 100%/)).toBeInTheDocument();
  });
});
