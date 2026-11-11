import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineChart } from "@/components/dashboard/timeline/TimelineChart";
import { VERDICT_STYLE, VerdictPill, type VerdictKind } from "@/components/dashboard/progress/verdictMark";
import { classifySubjects } from "@/lib/analytics/insights/headline";
import { buildProgressSubjects } from "@/lib/analytics/insights/sessions";
import { loadSampleRows } from "./fixtures/sampleRows";

/**
 * A verdict reads without its colour (verdictMark.tsx): the accent is the athlete's choice, so with the red accent an Up mark marked by
 * the accent alone looked like Down.
 */
const KINDS = Object.keys(VERDICT_STYLE) as VerdictKind[];

describe("verdict marks", () => {
  it("gives every verdict its own glyph and end mark, so none depends on colour", () => {
    const signatures = KINDS.map((k) => `${VERDICT_STYLE[k].Glyph.displayName}|${VERDICT_STYLE[k].end}|${VERDICT_STYLE[k].line.dash}`);
    expect(new Set(signatures).size).toBe(KINDS.length);
    // Up and Down in particular differ in every channel, colour aside.
    expect(VERDICT_STYLE.up.Glyph).not.toBe(VERDICT_STYLE.down.Glyph);
    expect(VERDICT_STYLE.up.end).not.toBe(VERDICT_STYLE.down.end);
    expect(VERDICT_STYLE.up.line.dash).not.toBe(VERDICT_STYLE.down.line.dash);
  });

  it("puts a glyph beside the word in every pill", () => {
    for (const kind of KINDS) {
      const { container, unmount } = render(<VerdictPill kind={kind} />);
      const pill = container.querySelector(`[data-verdict="${kind}"]`) as HTMLElement;
      expect(pill).toHaveTextContent(VERDICT_STYLE[kind].label);
      expect(pill.querySelector("svg[data-glyph]")).not.toBeNull();
      unmount();
    }
  });

  it("marks each Timeline lane by its verdict's shape on the sample", async () => {
    const ASOF = "2026-09-11";
    const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, ASOF);
    render(<TimelineChart entries={[]} rows={rows} start="2022-11-01" end={ASOF} asOf={ASOF} selected={null} onSelect={() => {}} onAddAt={() => {}} />);
    const lanes = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-lane"));
    const seen = new Set<string>();
    let checked = 0;
    for (const lane of lanes) {
      const row = rows.find((r) => r.subject.key === lane.getAttribute("data-lane"))!;
      const kind: VerdictKind = !row.verdict && row.moveUp ? "move-up" : row.verdict!.state;
      seen.add(kind);
      const end = lane.querySelector("[data-end]");
      if (!end) continue; // the recent end falls outside the axis
      checked++;
      expect(end.getAttribute("data-end"), row.subject.key).toBe(VERDICT_STYLE[kind].end);
      // The recent window carries the verdict's dash; a move up to RX has no windows, only its two marks.
      if (kind === "move-up") expect(lane.querySelector("[data-line]")).toBeNull();
      else expect(lane.querySelector("[data-window=recent]")?.getAttribute("data-line")).toBe(VERDICT_STYLE[kind].line.dash);
      expect(within(lane).getAllByText((_, el) => el?.getAttribute("data-glyph") !== null && el?.tagName.toLowerCase() === "svg").length).toBeGreaterThan(0);
    }
    // The sample has ups, a down and no-clear-change lanes, so the check above covered more than one kind.
    expect(seen.has("up") && seen.has("down")).toBe(true);
    expect(checked).toBeGreaterThan(5);
  });
});

describe("theme colours in components", () => {
  /** The achromatic base plus one accent (CLAUDE.md, Theming): no component reaches for a Tailwind palette colour. */
  const CHROMATIC = /\b(?:bg|text|border|fill|stroke|ring|from|to|via|outline|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
    });
  }

  it("uses theme tokens, never a fixed palette class", () => {
    const root = join(process.cwd(), "src");
    const hits = files(root).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (CHROMATIC.test(line) ? [`${relative(root, f)}:${i + 1}: ${line.trim()}`] : []))
    );
    expect(hits).toEqual([]);
  });
});
