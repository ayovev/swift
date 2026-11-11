import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERDICT_STYLE, headlineLabelClass } from "@/components/dashboard/progress/verdictMark";
import { CONTRAST_TEXT, contrastRatio, isOutOfGamut, type Oklch } from "@/lib/theme/contrast";

/**
 * A verdict that went the athlete's way is a fixed green (--positive, index.css), not the accent: with the red accent, Up in the
 * accent sat beside Down in red. These read the real tokens in both modes.
 */

const CSS = readFileSync(join(process.cwd(), "src/index.css"), "utf8");
function tokens(name: string): { light: Oklch; dark: Oklch } {
  const found = [...CSS.matchAll(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`, "g"))].map((m) => ({ l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) }));
  expect(found).toHaveLength(2);
  return { light: found[0]!, dark: found[1]! };
}
const PAGE = { light: { l: 1, c: 0, h: 0 }, dark: { l: 0.145, c: 0, h: 0 } };
const CARD = { light: { l: 1, c: 0, h: 0 }, dark: { l: 0.205, c: 0, h: 0 } };

describe("the positive green", () => {
  const text = tokens("positive");
  const subtle = tokens("positive-subtle");

  for (const mode of ["light", "dark"] as const) {
    it(`reads as text on its pill, the page and a card in ${mode} mode`, () => {
      expect(isOutOfGamut(text[mode])).toBe(false);
      expect(isOutOfGamut(subtle[mode])).toBe(false);
      expect(contrastRatio(text[mode], subtle[mode])).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      expect(contrastRatio(text[mode], PAGE[mode])).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      expect(contrastRatio(text[mode], CARD[mode])).toBeGreaterThanOrEqual(CONTRAST_TEXT);
    });
  }

  it("colours Up and a move up to RX, never the accent; Down stays red, the neutral verdicts grey", () => {
    expect(VERDICT_STYLE.up.pill).toBe("bg-positive-subtle text-positive");
    expect(VERDICT_STYLE["move-up"].pill).toBe("bg-positive-subtle text-positive");
    for (const k of Object.keys(VERDICT_STYLE) as (keyof typeof VERDICT_STYLE)[]) expect(VERDICT_STYLE[k].pill).not.toMatch(/accent/);
    expect(VERDICT_STYLE.down.pill).toMatch(/destructive/);
  });

  it("colours the Progress headline the same way", () => {
    expect(headlineLabelClass("Improving")).toBe("text-positive");
    expect(headlineLabelClass("Declining")).toBe("text-destructive");
    expect(headlineLabelClass("Steady")).toBe("text-foreground");
  });
});
