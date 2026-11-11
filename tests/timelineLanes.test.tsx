import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineChart } from "@/components/dashboard/timeline/TimelineChart";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { monthSpan, monthYear } from "@/lib/analytics/insights/display";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * A Timeline verdict row says when, in words, and draws nothing (TimelineChart.tsx). A line between the two bests read as the size of
 * the change, and bands with the bests as dots put a dot anywhere in its band; until a drawing reads true, the row names the months
 * its verdict compared.
 */

const ASOF = "2026-09-11";
const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, ASOF);
const span = (l: { date: string }[]) => {
  const d = l.map((x) => x.date).sort();
  return monthSpan(d[0]!, d[d.length - 1]!);
};

describe("a verdict row", () => {
  it("names the months each verdict compared, or a move up's two sessions, and draws no lane", () => {
    const { container } = render(<TimelineChart entries={[]} rows={rows} start="2022-11-01" end={ASOF} asOf={ASOF} selected={null} onSelect={() => {}} onAddAt={() => {}} />);
    let checked = 0;
    for (const lane of screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-lane"))) {
      const row = rows.find((r) => r.subject.key === lane.getAttribute("data-lane"))!;
      const line = lane.querySelector("[data-compared]");
      if (!line) continue;
      checked++;
      if (row.verdict) expect(line.textContent).toBe(`Compared ${span(row.verdict.previous)} with ${span(row.verdict.recent)}`);
      else expect(line.textContent).toBe(`Last Scaled ${monthYear(row.moveUp!.scaledDate)}, first RX ${monthYear(row.moveUp!.date)}`);
      // Each row carries the same verdict pill as Progress; a move up to RX names itself in the pill.
      const pill = lane.querySelector("[data-verdict]");
      if (!row.verdict) expect(pill?.textContent).toBe("Moved up to RX");
      else expect(pill).not.toBeNull();
    }
    expect(checked).toBeGreaterThan(5);
    expect(container.querySelector("section[aria-label=Verdicts] [data-window], section[aria-label=Verdicts] [data-end]")).toBeNull();
  });
});
