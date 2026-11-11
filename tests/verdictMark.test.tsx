import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen } from "@testing-library/react";
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
  it("gives every verdict its own glyph, so none depends on colour", () => {
    // A move up to RX is an Up vote and shares its arrow; its own words ("Moved up to RX") say which.
    const kinds = KINDS.filter((k) => k !== "move-up");
    expect(new Set(kinds.map((k) => VERDICT_STYLE[k].Glyph)).size).toBe(kinds.length);
    expect(VERDICT_STYLE["move-up"].Glyph).toBe(VERDICT_STYLE.up.Glyph);
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

  it("names each Timeline row's verdict with its glyph on the sample", async () => {
    const ASOF = "2026-09-11";
    const { rows } = classifySubjects(buildProgressSubjects(await loadSampleRows()).subjects, ASOF);
    render(<TimelineChart entries={[]} rows={rows} start="2022-11-01" end={ASOF} asOf={ASOF} selected={null} onSelect={() => {}} onAddAt={() => {}} />);
    const lanes = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-lane"));
    const seen = new Set<string>();
    for (const lane of lanes) {
      const row = rows.find((r) => r.subject.key === lane.getAttribute("data-lane"))!;
      const kind: VerdictKind = !row.verdict && row.moveUp ? "move-up" : row.verdict!.state;
      seen.add(kind);
      const glyph = lane.querySelector("svg[data-glyph]");
      expect(glyph?.getAttribute("data-glyph"), row.subject.key).toBe(kind === "move-up" ? "up" : kind);
    }
    expect(seen.has("up") && seen.has("down")).toBe(true);
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
