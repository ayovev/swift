import { clampToGamut, contrastRatio, oklchToRgb, WHITE, BLACK, CONTRAST_TEXT, CONTRAST_UI, type Oklch } from "@/lib/theme/contrast";
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

/** sRGB (0 to 255 per channel) to OKLCH (Ottosson). */
export function rgbToOklch(red: number, green: number, blue: number): Oklch {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** "#rrggbb" to OKLCH. Null when the string is not a six-digit hex. */
export function hexToOklch(hex: string): Oklch | null {
  if (!isHexColor(hex)) return null;
  return rgbToOklch(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
}

/** An OKLCH colour as "#rrggbb", pulled into the sRGB gamut first so it is the colour that would be drawn. */
export function oklchToHex(color: Oklch): string {
  const { r, g, b } = oklchToRgb(clampToGamut(color));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
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
    if (contrastRatio(roles.primaryHover, roles.primaryForeground) < CONTRAST_TEXT) problems.push(`${mode}: hovered button text`);
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

/** Hue buckets the logo's colours are grouped into (15 degrees each). */
const HUE_BUCKETS = 24;
/** A pixel needs at least this chroma to count as a colour: below it is text, an outline or a background. */
const COLOUR_CHROMA = 0.04;
/** Opacity (0 to 255) a pixel needs to count. Anti-aliased edges blend the logo with whatever was behind it, so they are skipped. */
const OPAQUE = 230;
/** A second or third candidate must carry at least this share of the logo's colour, or it is noise. */
const MIN_CANDIDATE_SHARE = 0.08;
/** Fewer coloured pixels than this share of the visible ones, and the logo is treated as having no colour. */
const MIN_COLOUR_PIXEL_SHARE = 0.005;
/** At most this many suggestions. */
export const MAX_PALETTE = 3;

/**
 * The colours a logo is made of, most prominent first, as "#rrggbb": up to three, for the coach to pick from. It is a suggestion, never applied by
 * itself: the dominant colour is a guess at the brand colour, and the accent recolours the whole interface.
 *
 * From RGBA bytes (a canvas `getImageData().data`). Grey, near-white, near-black, see-through and edge pixels are skipped, so a black and white logo
 * returns nothing. The rest are grouped by hue and scored by chroma times area, so a small vivid mark outweighs a large pale tint. A colour is the
 * chroma-weighted average of its hue bucket and the two beside it (a colour near a bucket edge is not split in two), and once chosen, the hues within
 * 30 degrees of it are used up so the next candidate is a different colour. Deterministic: the same pixels give the same colours.
 */
export function dominantColors(rgba: ArrayLike<number>, max: number = MAX_PALETTE): string[] {
  const weight = new Array<number>(HUE_BUCKETS).fill(0);
  const sumL = new Array<number>(HUE_BUCKETS).fill(0);
  const sumA = new Array<number>(HUE_BUCKETS).fill(0);
  const sumB = new Array<number>(HUE_BUCKETS).fill(0);
  let visible = 0;
  let coloured = 0;
  const pixels = Math.floor(rgba.length / 4);
  for (let i = 0; i < pixels; i++) {
    if (rgba[i * 4 + 3]! < OPAQUE) continue;
    visible++;
    const { l, c, h } = rgbToOklch(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
    if (c < COLOUR_CHROMA) continue;
    coloured++;
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((h / 360) * HUE_BUCKETS));
    const rad = (h * Math.PI) / 180;
    // Each pixel is weighted by its chroma, so a vivid pixel counts for more than a pale one of the same hue.
    weight[bucket]! += c;
    sumL[bucket]! += l * c;
    sumA[bucket]! += c * Math.cos(rad) * c;
    sumB[bucket]! += c * Math.sin(rad) * c;
  }
  if (visible === 0 || coloured < Math.max(1, visible * MIN_COLOUR_PIXEL_SHARE)) return [];

  const total = weight.reduce((a, b) => a + b, 0);
  const free = new Array<boolean>(HUE_BUCKETS).fill(true);
  const wrap = (n: number): number => (n + HUE_BUCKETS) % HUE_BUCKETS;
  const out: string[] = [];
  while (out.length < max) {
    let best = -1;
    for (let k = 0; k < HUE_BUCKETS; k++) {
      if (free[k] && weight[k]! > 0 && (best === -1 || weight[k]! > weight[best]!)) best = k;
    }
    if (best === -1 || (out.length > 0 && weight[best]! < MIN_CANDIDATE_SHARE * total)) break;
    let w = 0;
    let l = 0;
    let a = 0;
    let b = 0;
    for (const d of [-1, 0, 1]) {
      const k = wrap(best + d);
      if (!free[k]) continue;
      w += weight[k]!;
      l += sumL[k]!;
      a += sumA[k]!;
      b += sumB[k]!;
    }
    // `a` and `b` carry the chroma weight once more than `l` does, so each is divided by the weight sum to give the weighted average.
    const colour: Oklch = { l: l / w, c: Math.hypot(a / w, b / w), h: ((Math.atan2(b / w, a / w) * 180) / Math.PI + 360) % 360 };
    const hex = oklchToHex(colour);
    if (!out.includes(hex)) out.push(hex);
    for (const d of [-2, -1, 0, 1, 2]) free[wrap(best + d)] = false;
  }
  return out;
}
