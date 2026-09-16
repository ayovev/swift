import { describe, expect, it } from "vitest";
import {
  BLACK,
  CONTRAST_TEXT,
  CONTRAST_UI,
  WHITE,
  contrastRatio,
  isOutOfGamut,
  oklchToRgb,
  pickForeground,
} from "@/lib/theme/contrast";
import {
  ACCENT_SWATCHES,
  SHADES,
  accentRoles,
  chartSeries,
  accentCssVars,
  deriveRamp,
  type ThemeMode,
} from "@/lib/theme/palette";

const MODES: ThemeMode[] = ["light", "dark"];

/** The base surfaces. Swift's base UI is black-and-white by design. */
const SURFACE = {
  light: WHITE,
  dark: { l: 0.145, c: 0, h: 0 },
} as const;

describe("colour maths", () => {
  it("converts known OKLCH values to the expected sRGB", () => {
    expect(oklchToRgb(WHITE)).toEqual({ r: 255, g: 255, b: 255 });
    expect(oklchToRgb(BLACK)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("computes the textbook contrast ratio for black on white", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it("is symmetric", () => {
    const a = { l: 0.5, c: 0.1, h: 250 };
    expect(contrastRatio(a, WHITE)).toBeCloseTo(contrastRatio(WHITE, a), 10);
  });

  it("picks the readable foreground for light and dark surfaces", () => {
    expect(pickForeground(BLACK)).toBe("white");
    expect(pickForeground(WHITE)).toBe("black");
  });
});

describe("accent ramps", () => {
  it("derives every shade for every swatch", () => {
    for (const swatch of ACCENT_SWATCHES) {
      const ramp = deriveRamp(swatch);
      for (const shade of SHADES) {
        expect(ramp[shade], `${swatch.id} ${shade}`).toBeDefined();
        expect(ramp[shade].h).toBe(swatch.hue);
      }
    }
  });

  it("gets monotonically darker as the shade number rises", () => {
    for (const swatch of ACCENT_SWATCHES) {
      const lightness = SHADES.map((s) => deriveRamp(swatch)[s].l);
      for (let i = 1; i < lightness.length; i++) {
        expect(lightness[i]!, `${swatch.id} shade ${SHADES[i]}`).toBeLessThan(lightness[i - 1]!);
      }
    }
  });

  it("stays inside the sRGB gamut, so nothing gets silently clipped", () => {
    for (const swatch of ACCENT_SWATCHES) {
      const ramp = deriveRamp(swatch);
      for (const shade of SHADES) {
        expect(isOutOfGamut(ramp[shade]), `${swatch.id} ${shade} is out of gamut`).toBe(false);
      }
    }
  });
});

describe("accent contrast — every swatch, both modes (FR-8.3)", () => {
  // This is the automated half of the FR-8.1–8.5 acceptance criterion: a
  // user-selectable accent means contrast cannot be checked once by eye.

  it("keeps button text readable on every accent-filled surface", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const { primary, primaryForeground } = accentRoles(swatch, mode);
        expect(
          contrastRatio(primary, primaryForeground),
          `${swatch.id} / ${mode}: button label on primary`
        ).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
    }
  });

  it("keeps link text readable against the page background", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const { link } = accentRoles(swatch, mode);
        expect(
          contrastRatio(link, SURFACE[mode]),
          `${swatch.id} / ${mode}: link on page background`
        ).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
    }
  });

  it("keeps focus rings visible against the page background", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const { ring } = accentRoles(swatch, mode);
        expect(
          contrastRatio(ring, SURFACE[mode]),
          `${swatch.id} / ${mode}: focus ring on page background`
        ).toBeGreaterThanOrEqual(CONTRAST_UI);
      }
    }
  });

  it("keeps the primary surface itself distinguishable from the page", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const { primary } = accentRoles(swatch, mode);
        expect(
          contrastRatio(primary, SURFACE[mode]),
          `${swatch.id} / ${mode}: primary against page`
        ).toBeGreaterThanOrEqual(CONTRAST_UI);
      }
    }
  });

  it("gives the subtle background enough contrast to carry body text", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const { subtle } = accentRoles(swatch, mode);
        const bodyText = mode === "light" ? BLACK : WHITE;
        expect(
          contrastRatio(subtle, bodyText),
          `${swatch.id} / ${mode}: body text on subtle background`
        ).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
    }
  });
});

describe("chart series colours", () => {
  it("produces the requested number of distinct colours", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const series = chartSeries(swatch, mode, 10);
        expect(series).toHaveLength(10);
        const lightness = series.map((c) => c.l.toFixed(3));
        expect(new Set(lightness).size, `${swatch.id} / ${mode}`).toBe(10);
      }
    }
  });

  it("keeps every band visible against the chart background", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        for (const [i, color] of chartSeries(swatch, mode, 10).entries()) {
          expect(
            contrastRatio(color, SURFACE[mode]),
            `${swatch.id} / ${mode}: chart series ${i + 1}`
          ).toBeGreaterThanOrEqual(1.25);
        }
      }
    }
  });

  it("keeps adjacent bands separable, not just technically distinct", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        const series = chartSeries(swatch, mode, 10);
        for (let i = 1; i < series.length; i++) {
          expect(
            Math.abs(series[i]!.l - series[i - 1]!.l),
            `${swatch.id} / ${mode}: bands ${i} and ${i + 1}`
          ).toBeGreaterThan(0.03);
        }
      }
    }
  });

  it("stays in gamut", () => {
    for (const mode of MODES) {
      for (const swatch of ACCENT_SWATCHES) {
        for (const color of chartSeries(swatch, mode, 10)) {
          expect(isOutOfGamut(color), `${swatch.id} / ${mode}`).toBe(false);
        }
      }
    }
  });

  it("handles degenerate counts without throwing", () => {
    expect(chartSeries(ACCENT_SWATCHES[0]!, "light", 0)).toEqual([]);
    expect(chartSeries(ACCENT_SWATCHES[0]!, "light", 1)).toHaveLength(1);
  });
});

describe("CSS variable output", () => {
  it("emits every token the stylesheet expects", () => {
    const vars = accentCssVars(ACCENT_SWATCHES[1]!, "light");
    for (const key of [
      "--primary",
      "--primary-foreground",
      "--primary-hover",
      "--accent-link",
      "--ring",
      "--accent-subtle",
      "--accent-border",
      "--chart-1",
      "--chart-10",
      "--accent-500",
    ]) {
      expect(vars[key], key).toBeDefined();
    }
  });

  it("emits parseable oklch() values", () => {
    const vars = accentCssVars(ACCENT_SWATCHES[4]!, "dark");
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^oklch\(-?[\d.]+ [\d.]+ -?[\d.]+\)$/);
    }
  });
});
