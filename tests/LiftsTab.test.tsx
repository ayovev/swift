import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiftsTab } from "@/components/dashboard/LiftsTab";
import { scanRow, workoutRow } from "./fixtures/rows";
import { loadSampleRows } from "./fixtures/sampleRows";

/** The Insights front door on the bundled sample. Counts and strings are the ones recorded for it in the design. */

const rows = await loadSampleRows();

function renderSample(asOf = "2026-09-11", scans: Parameters<typeof LiftsTab>[0]["scans"] = []) {
  return render(<LiftsTab workouts={rows} scans={scans} asOf={asOf} />);
}

const group = (name: string): HTMLElement => {
  const heading = screen.getByRole("heading", { name: new RegExp(`^${name}`) });
  return heading.closest("section") as HTMLElement;
};

describe("the Insights front door", () => {
  it("reads the headline and what it left out", () => {
    renderSample();
    expect(screen.getByText("Improving")).toBeInTheDocument();
    expect(screen.getByText("Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down).")).toBeInTheDocument();
    expect(screen.getByText(/Includes 2 that moved up to RX\. Left out: 31 with under 6 sessions\. 2 compare sessions over 24 months apart\. As of Sep 11, 2026\./)).toBeInTheDocument();
  });

  it("lists Up and Down as separate open groups with their counts, and collapses the rest", () => {
    renderSample();
    expect(within(group("Up")).getAllByRole("listitem")).toHaveLength(8);
    expect(within(group("Down")).getAllByRole("listitem")).toHaveLength(1);
    for (const [title, n] of [["No clear change", "5"], ["Fewer than 6 sessions", "11"], ["Not recent", "20"]] as const) {
      const trigger = screen.getByRole("button", { name: new RegExp(`^${title}`) });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveTextContent(n);
    }
  });

  it("names RX unmarked and Scaled as the qualifier", () => {
    renderSample();
    expect(within(group("Up")).getByText("Power Snatch")).toBeInTheDocument();
    expect(within(group("Down")).getByText("Nancy (Scaled)")).toBeInTheDocument();
    expect(screen.queryByText(/Power Snatch RX/)).not.toBeInTheDocument();
  });

  it("writes a verdict with its change in pounds first", () => {
    renderSample();
    const row = within(group("Up")).getByText("Power Snatch").closest("li") as HTMLElement;
    expect(within(row).getByText("+21 lb (124 to 145 lb), +16.8%")).toBeInTheDocument();
    const nancy = within(group("Down")).getByText("Nancy (Scaled)").closest("li") as HTMLElement;
    expect(within(nancy).getByText("0:50 slower (13:47 to 14:37), 6.0% slower")).toBeInTheDocument();
  });

  it("explains a move up to RX and does not open it", () => {
    renderSample();
    const fran = within(group("Up")).getByText("Fran").closest("li") as HTMLElement;
    expect(within(fran).getByText("Moved up to RX in Dec 2025, after 3 Scaled sessions.")).toBeInTheDocument();
    expect(within(fran).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a row to its chart", () => {
    renderSample();
    const row = within(group("Up")).getByText("Front Squat").closest("li") as HTMLElement;
    expect(within(row).queryByRole("figure")).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button"));
    expect(within(row).getByRole("figure")).toBeInTheDocument();
    expect(within(row).getByText(/Each dot is the best result of a day\. Dark dots are the 4 sessions before the recent 4/)).toBeInTheDocument();
  });

  it("shows a tooltip with the value and date when a dot is hovered, and hides it on leaving the chart", () => {
    renderSample();
    const row = within(group("Up")).getByText("Front Squat").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button"));
    const figure = within(row).getByRole("figure");
    expect(within(row).queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(figure.querySelectorAll("circle[fill='transparent']")[0] as Element);
    const tip = within(row).getByRole("tooltip");
    expect(tip).toHaveTextContent(/\d+ lb est\./);
    expect(tip).toHaveTextContent(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
    fireEvent.mouseLeave(figure.querySelector("div.relative") as Element);
    expect(within(row).queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens a facts-line subject to dots alone", () => {
    renderSample();
    fireEvent.click(screen.getByRole("button", { name: /^Fewer than 6 sessions/ }));
    const row = screen.getByText(/^Hang Power Clean: 5 sessions\./).closest("li") as HTMLElement;
    expect(within(row).getByText(/Needs 1 more session for a verdict\./)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button"));
    expect(within(row).getByText("Each dot is the best result of a day.")).toBeInTheDocument();
  });

  it("shows no body-context line without body data and one with it", () => {
    const { unmount } = renderSample();
    expect(screen.queryByText(/Body weight|No body weight/)).not.toBeInTheDocument();
    unmount();
    renderSample("2026-09-11", [scanRow("2023-02-06", { "Weight(lb)": "170" }), scanRow("2026-03-10", { "Weight(lb)": "172" })]);
    expect(screen.getAllByText(/Body weight 170 to 172 lb, within normal scan variation\./).length).toBeGreaterThan(0);
  });

  it("draws the body-weight lines from manual weigh-ins alone", () => {
    render(
      <LiftsTab
        workouts={rows}
        scans={[]}
        weighIns={[
          { date: "2023-02-06", weightLb: 170, source: "manual" },
          { date: "2026-03-10", weightLb: 180, source: "manual" },
        ]}
        asOf="2026-09-11"
      />
    );
    const row = within(group("Up")).getByText("Power Snatch").closest("li") as HTMLElement;
    expect(within(row).getByText("Body weight 170 to 180 lb (+10 lb) over the same span.")).toBeInTheDocument();
    expect(within(row).getByText("About half of this change is body weight.")).toBeInTheDocument();
  });

  it("filters the list without changing the headline", () => {
    renderSample("2026-09-09");
    fireEvent.click(screen.getByRole("button", { name: "Last 3 months" }));
    expect(screen.getByText("Showing 15 of 45 subjects.")).toBeInTheDocument();
    expect(screen.getByText("Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1 down).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Last month" }));
    expect(screen.getByText("Showing 5 of 45 subjects.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it("says so when a custom period lists nothing, and rejects a start after the end", () => {
    renderSample();
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const [from, to] = screen.getAllByDisplayValue(/^$|2026-09-11/);
    fireEvent.change(from as HTMLElement, { target: { value: "2020-01-01" } });
    fireEvent.change(to as HTMLElement, { target: { value: "2020-01-31" } });
    expect(screen.getByText("No lift or benchmark was logged in this period.")).toBeInTheDocument();
    fireEvent.change(from as HTMLElement, { target: { value: "2021-01-01" } });
    expect(screen.getByText("The start date is after the end date.")).toBeInTheDocument();
  });

  it("says nothing moved when neither Up nor Down has a row", () => {
    const flat = ["01", "02", "03", "04", "05", "06"].map((m) =>
      workoutRow({ date: `${m}/10/2026`, title: "BACK SQUAT", description: "Back Squat 1RM", barbell_lift: "Back Squat", score_type: "Load", best_result_raw: "200" })
    );
    render(<LiftsTab workouts={flat} scans={[]} asOf="2026-09-11" />);
    expect(screen.getByText("No lift or benchmark has moved clearly.")).toBeInTheDocument();
    expect(screen.getByText(/^No headline yet: needs 3 lifts or benchmarks with a verdict, has 1\./)).toBeInTheDocument();
  });

  it("reads the empty states", () => {
    const { unmount } = render(<LiftsTab workouts={[]} scans={[]} asOf="2026-09-11" />);
    expect(screen.getByText("No lift or benchmark has been logged yet.")).toBeInTheDocument();
    unmount();
    const old = workoutRow({ date: "01/10/2024", title: "BACK SQUAT", description: "Back Squat 1RM", barbell_lift: "Back Squat", score_type: "Load", best_result_raw: "200" });
    render(<LiftsTab workouts={[old]} scans={[]} asOf="2026-09-11" />);
    expect(screen.getByText("No lift or benchmark was logged in the last 12 months.")).toBeInTheDocument();
  });
});
