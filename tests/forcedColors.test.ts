import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Forced colors (Windows High Contrast) drops fills, box-shadows and the page's colours, so anything that says "selected", "pressed"
 * or "focused" with one of those disappears. jsdom has no forced-colors mode, so this pins the rules that were measured in Chromium
 * with `forcedColors: "active"` (tab underlines, toggles, Timeline's bars, swatches, focus). If one of these is removed, check the
 * view again in forced colors rather than just updating the string.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("forced colors", () => {
  const css = read("src/index.css");
  const block = css.slice(css.indexOf("@media (forced-colors: active)"));

  it("shows a pressed toggle and a keyboard focus with system colours", () => {
    expect(block).toMatch(/\[aria-pressed="true"\]\s*\{[^}]*forced-color-adjust:\s*none[^}]*background-color:\s*Highlight[^}]*color:\s*HighlightText/s);
    expect(block).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight/s);
  });

  it("marks the selected tab with a thicker Highlight underline, and lets an unselected sub-tab's transparent border vanish", () => {
    const nav = read("src/components/dashboard/SectionNav.tsx");
    expect(nav.match(/forced-colors:border-\[Highlight\] forced-colors:border-b-4/g)).toHaveLength(2);
    expect(nav).toContain("forced-colors:border-[Canvas]");
  });

  it("keeps a Timeline entry's span visible when its fill is dropped", () => {
    expect(read("src/components/dashboard/timeline/TimelineChart.tsx")).toContain("forced-colors:border-[CanvasText]");
  });

  it("keeps the accent swatches visible", () => {
    for (const f of ["src/components/theme/ThemeControls.tsx", "src/components/dashboard/SettingsSheet.tsx"]) {
      expect(read(f)).toContain("forced-colors:forced-color-adjust-none");
    }
  });
});
