import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { SkillsTab } from "@/components/reports/SkillsTab";
import { buildInsights } from "@/lib/analytics/buildInsights";
import { SKILL_LIST } from "@/lib/analytics/skills";
import { workoutRow } from "./fixtures/rows";

const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({ capture: (e: unknown) => capture(e) }));

const AS_OF = "2026-09-11";
const rows = buildInsights([
  workoutRow({ date: "01/10/2025", title: "Old pull", description: "10 Pull-ups", rx_or_scaled: "RX" }),
  workoutRow({ date: "03/10/2025", title: "Inside T2B", description: "5 Toes-to-bar", rx_or_scaled: "RX" }),
  workoutRow({ date: "03/12/2025", title: "Scaled rope", description: "3 Rope climbs", rx_or_scaled: "SCALED" }),
  workoutRow({ date: "08/10/2025", title: "After", description: "5 Chest-to-bar", rx_or_scaled: "RX" }),
]).allRows;

function renderReport() {
  return render(
    <ThemeProvider>
      <SkillsTab parsedRows={rows} asOf={AS_OF} />
    </ThemeProvider>
  );
}
const sheet = (): HTMLElement => screen.getByRole("article", { name: "Skills report" });
const closedPeriod = (from: string, to: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Custom" }));
  fireEvent.change(screen.getByLabelText("From"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
};
const rowOf = (label: string): HTMLElement => within(sheet()).getByRole("rowheader", { name: new RegExp(`^${label}`) }).closest("tr") as HTMLElement;

beforeEach(() => {
  capture.mockClear();
  window.print = vi.fn();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("the Skills report", () => {
  it("groups the list under M, W and G with a count each, and opens with the totals", () => {
    renderReport();
    const page = within(sheet());
    expect(page.getByTestId("skills-summary")).toHaveTextContent(`of ${SKILL_LIST.length} skills done as prescribed through Sep 11, 2026.`);
    for (const m of ["M", "W", "G"]) expect(page.getByTestId(`skills-${m}`)).toBeInTheDocument();
    expect(within(page.getByTestId("skills-G")).getByRole("heading", { name: "G · Gymnastics" })).toBeInTheDocument();
    expect(page.getByTestId("skills-G")).toHaveTextContent(/\d+ of \d+ done as prescribed\./);
  });

  it("names the three levels Beginner, Intermediate and Advanced", () => {
    renderReport();
    const levels = new Set(within(sheet()).getAllByRole("cell").map((c) => c.textContent).filter((t) => /^(Beginner|Intermediate|Advanced|Foundation)$/.test(t ?? "")));
    expect([...levels].sort()).toEqual(["Advanced", "Beginner", "Intermediate"]);
  });

  it("checks a skill for an RX workout only, with the date of the first workout behind it (not its title), and not a scaled one", () => {
    renderReport();
    const pull = rowOf("Pull-ups");
    expect(within(pull).getByText("Done")).toBeInTheDocument();
    expect(pull).toHaveTextContent("Jan 10, 2025");
    expect(pull).not.toHaveTextContent("Old pull");
    const rope = rowOf("Rope climbs");
    expect(within(rope).getByText("Not yet")).toBeInTheDocument();
    expect(rope).not.toHaveTextContent("Scaled rope");
  });

  it("has one mark for all time, and no 'new'", () => {
    renderReport();
    // One table per group, so one such header each for M, W and G.
    expect(within(sheet()).getAllByRole("columnheader", { name: "Done as prescribed" })).toHaveLength(3);
    expect(within(sheet()).queryByRole("columnheader", { name: /^Before / })).toBeNull();
    expect(within(sheet()).queryByTestId("skill-new")).toBeNull();
  });

  it("shows what was done before a period's start and what is new in it, through its end", () => {
    renderReport();
    closedPeriod("2025-02-01", "2025-06-30");
    const page = within(sheet());
    expect(page.getAllByRole("columnheader", { name: "Before Feb 1, 2025" })).toHaveLength(3);
    expect(page.getAllByRole("columnheader", { name: "Through Jun 30, 2025" })).toHaveLength(3);

    const pull = rowOf("Pull-ups");
    expect(within(pull).getAllByText("Done")).toHaveLength(2);
    expect(within(pull).queryByTestId("skill-new")).toBeNull();

    const t2b = rowOf("Toes-to-bar");
    expect(within(t2b).getAllByText(/^(Done|Not yet)$/).map((e) => e.textContent)).toEqual(["Not yet", "Done"]);
    const chip = within(t2b).getByTestId("skill-new");
    // A terse chip: "New" is what shows, the rest is for a screen reader, and it takes the sheet's accent.
    expect(chip).toHaveTextContent("New in this period");
    expect(chip.querySelector(".sr-only")).toHaveTextContent("in this period");
    expect(chip.className).toMatch(/bg-accent-subtle/);
    expect(chip.className).toMatch(/text-accent-link/);

    // Done after the end, so not counted.
    expect(within(rowOf("Chest-to-bar")).getAllByText("Not yet")).toHaveLength(2);
    expect(page.getByTestId("skills-summary")).toHaveTextContent(/2 of \d+ skills done as prescribed through Jun 30, 2025\. 1 new since Feb 1, 2025\./);
    expect(page.getByText(/Report covers through Jun 30, 2025\./)).toBeInTheDocument();
  });

  it("prints only what was done when 'Show skills not yet done' is off, and leaves out an empty group", () => {
    renderReport();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show skills not yet done" }));
    expect(within(sheet()).queryByRole("rowheader", { name: /^Rope climbs/ })).toBeNull();
    expect(within(sheet()).getByRole("rowheader", { name: /^Pull-ups/ })).toBeInTheDocument();
    // Nothing in M or W was logged, so those groups are gone.
    expect(within(sheet()).queryByTestId("skills-M")).toBeNull();
    expect(within(sheet()).queryByTestId("skills-W")).toBeNull();
    expect(within(sheet()).getByTestId("skills-G")).toBeInTheDocument();
  });

  it("gives a mark as a shape and words, never color alone, and keeps the one note on what a check means", () => {
    renderReport();
    const marks = within(sheet()).getAllByText(/^(Done|Not yet)$/);
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) expect(m.parentElement!.querySelector("svg")).not.toBeNull();
    expect(within(sheet()).getByTestId("skills-note")).toHaveTextContent("No check means none was logged RX, not that the athlete cannot do it.");
    // No score, grade or badge.
    expect(sheet()).not.toHaveTextContent(/score|grade|badge|streak|mastered|unlocked/i);
  });
});

describe("the coach's report and printing", () => {
  it("has a coach note only for a coach, printed at the end", () => {
    renderReport();
    expect(screen.queryByLabelText(/^Coach note/)).toBeNull();
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "First toes-to-bar this block." } });
    const articles = screen.getAllByRole("article", { name: "Skills report" });
    expect(within(articles[1]!).getByTestId("report-note")).toHaveTextContent("First toes-to-bar this block.");
  });

  it("reports only that a Skills report was generated, and for whom", () => {
    localStorage.setItem("swift.audience", "coach");
    renderReport();
    fireEvent.change(screen.getByLabelText(/^Coach note/), { target: { value: "A private note" } });
    fireEvent.click(screen.getByRole("button", { name: /Print or save as PDF/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({ name: "report_generated", props: { report_kind: "skills", audience: "coach" } });
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(/private|pull|toes|rope/i);
  });

  it("keeps the controls out of print, so the sheet is all that prints", () => {
    renderReport();
    expect(screen.getByRole("button", { name: /Print or save as PDF/ }).closest("div.print\\:hidden")).not.toBeNull();
    expect(sheet().closest(".print\\:hidden")).toBeNull();
  });
});
