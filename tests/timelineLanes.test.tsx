import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineChart } from "@/components/dashboard/timeline/TimelineChart";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * A Timeline verdict lane draws the two windows its verdict compared, not a line from one best to the other (TimelineChart.tsx):
 * a joining line's length read as the size of the change, so Power Snatch (+16.8%) looked like the biggest gain on the page and
 * Bench Press (+24.2%) a small one. Length now means only how long each window lasted.
 */

const ASOF = "2026-09-11";
const START = "2022-11-01";
const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, ASOF);
const pctOf = (iso: string) => {
  const d = (s: string) => Date.parse(s) / 86_400_000;
  return Math.min(100, Math.max(0, ((d(iso) - d(START)) / (d(ASOF) - d(START))) * 100));
};
const left = (el: Element) => parseFloat((el as HTMLElement).style.left);
const width = (el: Element) => parseFloat((el as HTMLElement).style.width);

describe("a verdict lane", () => {
  it("draws each window from its first session to its last, the best of each inside it, and nothing between them", () => {
    render(<TimelineChart entries={[]} rows={rows} start={START} end={ASOF} asOf={ASOF} selected={null} onSelect={() => {}} onAddAt={() => {}} />);
    let checked = 0;
    for (const lane of screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-lane"))) {
      const row = rows.find((r) => r.subject.key === lane.getAttribute("data-lane"))!;
      if (!row.verdict) continue;
      const prev = lane.querySelector("[data-window=previous]");
      const recent = lane.querySelector("[data-window=recent]");
      if (!prev || !recent) continue;
      checked++;
      const dates = (l: { date: string }[]) => l.map((x) => x.date).sort();
      const [p0, p1] = [dates(row.verdict.previous)[0]!, dates(row.verdict.previous).at(-1)!];
      const [r0, r1] = [dates(row.verdict.recent)[0]!, dates(row.verdict.recent).at(-1)!];
      expect(left(prev)).toBeCloseTo(pctOf(p0), 3);
      expect(left(recent)).toBeCloseTo(pctOf(r0), 3);
      expect(left(prev) + width(prev)).toBeCloseTo(Math.max(pctOf(p1), pctOf(p0) + 0.6), 3);
      expect(left(recent) + width(recent)).toBeCloseTo(Math.max(pctOf(r1), pctOf(r0) + 0.6), 3);
      // Nothing spans the gap: the only drawn segments are the two windows.
      expect(lane.querySelectorAll("[data-windows] > span[data-window]")).toHaveLength(2);
      const best = lane.querySelector("[data-best=previous]");
      if (best) expect(left(best)).toBeCloseTo(pctOf(row.verdict.previousBest.date), 3);
    }
    expect(checked).toBeGreaterThan(5);
    expect(screen.getByText(/previous in grey and recent in the verdict's mark/)).toBeInTheDocument();
  });
});
