import { clampToGamut, contrastRatio, WHITE, BLACK, CONTRAST_TEXT, CONTRAST_UI, type Oklch } from "@/lib/theme/contrast";
import { accentRoles, type AccentSwatch, type ThemeMode } from "@/lib/theme/palette";

/**
 * A coach's brand colour, turned into an accent swatch.
 *
 * The accent system derives every shade from a hue and a peak chroma at fixed
 * lightness steps, so a free colour is reduced to those two numbers. Contrast
 * then comes from the fixed lightness, but the rules in themeContrast.test.ts
 * are still checked here for the real colour, and a colour that fails is
 * adjusted (chroma first, then hue away from the destructive red) rather than
 * any threshold being lowered. `adjusted` says so, so the form can.
 */

export const BRAND_ACCENT_ID = "brand" as const;

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX.test(value);

/** The same chroma ceiling the stock swatches use. */
const MAX_CHROMA = 0.16;
/** Below this a colour is effectively grey and its hue is noise. */
const MIN_CHROMA = 0.03;
/** OKLab distance x100 a brand button must keep from --destructive (CLAUDE.md, open items). */
export const MIN_DESTRUCTIVE_DISTANCE = 8;

const DESTRUCTIVE: Record<ThemeMode, Oklch> = {
  light: { l: 0.577, c: 0.245, h: 27.325 },
  dark: { l: 0.704, c: 0.191, h: 22.216 },
};
const SURFACE: Record<ThemeMode, Oklch> = { light: WHITE, dark: { l: 0.145, c: 0, h: 0 } };
const MODES: ThemeMode[] = ["light", "dark"];

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** "#rrggbb" to OKLCH (Ottosson). Null when the string is not a six-digit hex. */
export function hexToOklch(hex: string): Oklch | null {
  if (!isHexColor(hex)) return null;
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLab distance x100 between two OKLCH colours. */
export function oklabDistance(x: Oklch, y: Oklch): number {
  const ax = x.c * Math.cos((x.h * Math.PI) / 180);
  const bx = x.c * Math.sin((x.h * Math.PI) / 180);
  const ay = y.c * Math.cos((y.h * Math.PI) / 180);
  const by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.hypot(x.l - y.l, ax - ay, bx - by) * 100;
}

/** Every rule the stock swatches are held to, for both modes. Empty when the swatch passes. */
export function swatchProblems(swatch: AccentSwatch): string[] {
  const problems: string[] = [];
  for (const mode of MODES) {
    const roles = accentRoles(swatch, mode);
    const surface = SURFACE[mode];
    if (contrastRatio(roles.primary, roles.primaryForeground) < CONTRAST_TEXT) problems.push(`${mode}: button text`);
    if (contrastRatio(roles.link, surface) < CONTRAST_TEXT) problems.push(`${mode}: link`);
    if (contrastRatio(roles.ring, surface) < CONTRAST_UI) problems.push(`${mode}: focus ring`);
    if (contrastRatio(roles.primary, surface) < CONTRAST_UI) problems.push(`${mode}: primary surface`);
    if (contrastRatio(roles.subtle, mode === "light" ? BLACK : WHITE) < CONTRAST_TEXT) problems.push(`${mode}: subtle background`);
    if (oklabDistance(roles.primary, DESTRUCTIVE[mode]) < MIN_DESTRUCTIVE_DISTANCE) problems.push(`${mode}: too close to destructive`);
  }
  return problems;
}

export interface BrandSwatch {
  swatch: AccentSwatch;
  /** True when the colour had to move to pass; the form says so. */
  adjusted: boolean;
}

/** Null for an invalid hex. Chroma is capped, then adjusted until every rule passes. */
export function brandSwatch(hex: string): BrandSwatch | null {
  const base = hexToOklch(hex);
  if (!base) return null;
  const start: AccentSwatch = {
    id: "slate",
    name: "Brand",
    hue: base.h,
    chroma: Math.min(Math.max(base.c, MIN_CHROMA), MAX_CHROMA),
  };
  const swatch: AccentSwatch = { ...start, chroma: Math.min(start.chroma, clampToGamut({ l: 0.637, c: start.chroma, h: start.hue }).c) };
  let adjusted = false;

  // Hue first (the destructive rule is about hue), nearest step away from red; chroma second.
  for (const chromaScale of [1, 0.85, 0.7, 0.55]) {
    for (const step of [0, 4, -4, 8, -8, 12, -12, 16, -16, 20, -20, 30, -30, 40, -40]) {
      const candidate: AccentSwatch = {
        ...swatch,
        hue: (start.hue + step + 360) % 360,
        chroma: swatch.chroma * chromaScale,
      };
      if (swatchProblems(candidate).length === 0) {
        if (step !== 0 || chromaScale !== 1) adjusted = true;
        return { swatch: candidate, adjusted };
      }
    }
  }
  // Nothing passed: fall back to the quiet end of the range, which always does.
  return { swatch: { ...swatch, chroma: MIN_CHROMA }, adjusted: true };
}
