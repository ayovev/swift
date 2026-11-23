import {
  BLACK,
  CONTRAST_TEXT,
  CONTRAST_UI,
  WHITE,
  clampToGamut,
  contrastRatio,
  formatOklch,
  pickForeground,
  type Oklch,
} from "./contrast";

/**
 * The accent system.
 *
 * Swift's base UI is pure black-and-white. The accent is the only chromatic
 * element, so it has to carry every interactive affordance — buttons, links,
 * focus rings, active tabs, chart series — in BOTH light and dark mode, for
 * whichever swatch the athlete picked.
 *
 * Each swatch is stored as a hue + peak chroma, not a list of hex values, and
 * the full 50–950 ramp is derived from a fixed perceptual lightness scale.
 * That is what makes "renders correctly with sufficient contrast in both
 * modes" a property we can test rather than a claim (themeContrast.test.ts).
 *
 * v1 is a curated set of swatches, deliberately not a free color picker.
 */

export type AccentId =
  | "slate"
  | "blue"
  | "violet"
  | "magenta"
  | "red"
  | "amber"
  | "green"
  | "teal";

export interface AccentSwatch {
  id: AccentId;
  /** Shown in the picker. */
  name: string;
  /** OKLCH hue angle. */
  hue: number;
  /** Peak chroma at mid-lightness. Tapered toward both ends of the ramp. */
  chroma: number;
  /**
   * The color's own OKLCH lightness. Set only for a coach's brand color (the stock swatches leave it out and keep their fixed shades). When it is set,
   * the interactive roles keep this lightness and move it only as far as each one's contrast rule needs (see `minimalShiftRoles`), so a color that
   * already works in a mode is shown as it is.
   */
  lightness?: number;
}

export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  { id: "slate", name: "Slate", hue: 255, chroma: 0.045 },
  { id: "blue", name: "Blue", hue: 256, chroma: 0.16 },
  { id: "violet", name: "Violet", hue: 292, chroma: 0.16 },
  { id: "magenta", name: "Magenta", hue: 348, chroma: 0.16 },
  { id: "red", name: "Red", hue: 27, chroma: 0.16 },
  { id: "amber", name: "Amber", hue: 75, chroma: 0.14 },
  { id: "green", name: "Green", hue: 145, chroma: 0.14 },
  { id: "teal", name: "Teal", hue: 190, chroma: 0.11 },
];

export const DEFAULT_ACCENT: AccentId = "blue";

export function getSwatch(id: AccentId): AccentSwatch {
  return ACCENT_SWATCHES.find((s) => s.id === id) ?? ACCENT_SWATCHES[1]!;
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];

/**
 * Perceptual lightness per shade. Evenly spaced in OKLCH, so the ramp reads as
 * even steps rather than bunching up the way an HSL ramp does.
 */
const SHADE_LIGHTNESS: Record<Shade, number> = {
  50: 0.971,
  100: 0.936,
  200: 0.885,
  300: 0.808,
  400: 0.72,
  500: 0.637,
  600: 0.556,
  700: 0.47,
  800: 0.398,
  900: 0.339,
  950: 0.26,
};

/**
 * Chroma taper. Color has to fall away at both ends or the pale shades look
 * muddy and the dark ones leave the sRGB gamut.
 */
const SHADE_CHROMA_SCALE: Record<Shade, number> = {
  50: 0.14,
  100: 0.26,
  200: 0.44,
  300: 0.68,
  400: 0.9,
  500: 1,
  600: 1,
  700: 0.92,
  800: 0.8,
  900: 0.68,
  950: 0.52,
};

export type AccentRamp = Record<Shade, Oklch>;

/** Derive a swatch's full shade range. */
export function deriveRamp(swatch: AccentSwatch): AccentRamp {
  const ramp = {} as AccentRamp;
  for (const shade of SHADES) {
    // Clamped so a light, highly-chromatic hue (blue near white) cannot
    // silently clip to a different color than the one we reasoned about.
    ramp[shade] = clampToGamut({
      l: SHADE_LIGHTNESS[shade],
      c: swatch.chroma * SHADE_CHROMA_SCALE[shade],
      h: swatch.hue,
    });
  }
  return ramp;
}

export type ThemeMode = "light" | "dark";

/**
 * Which shade plays which role, per mode.
 *
 * Light mode puts the accent on a white ground, so it needs to be dark enough
 * for 4.5:1 text. Dark mode puts it on near-black, so it has to go the other
 * way. Using the same shade for both is the usual reason custom accents look
 * broken in one mode.
 */
const ROLE_SHADES: Record<ThemeMode, { primary: Shade; hover: Shade; link: Shade; ring: Shade; subtle: Shade; border: Shade }> = {
  light: { primary: 600, hover: 700, link: 700, ring: 600, subtle: 50, border: 200 },
  dark: { primary: 400, hover: 300, link: 300, ring: 400, subtle: 950, border: 800 },
};

export interface AccentRoles {
  primary: Oklch;
  primaryForeground: Oklch;
  primaryHover: Oklch;
  link: Oklch;
  ring: Oklch;
  subtle: Oklch;
  border: Oklch;
}

/** Resolve a swatch to its role colors for one mode. */
export function accentRoles(swatch: AccentSwatch, mode: ThemeMode): AccentRoles {
  const ramp = deriveRamp(swatch);
  if (swatch.lightness !== undefined) return minimalShiftRoles(swatch, swatch.lightness, mode, ramp);
  const roles = ROLE_SHADES[mode];
  const primary = ramp[roles.primary];
  const whiteLabel = pickForeground(primary) === "white";
  // The hover fill is drawn under the same label as the primary fill, so it has to move the way that keeps the label readable: a white label
  // goes darker in light mode and a dark label goes lighter, never the other way (a darker green under black text fell to 3.3:1).
  const hover: Shade = whiteLabel ? (mode === "light" ? roles.hover : roles.primary) : mode === "light" ? 500 : roles.hover;

  return {
    primary,
    // Chosen by measured contrast, not assumed — a light amber button needs
    // black text where a blue one needs white.
    primaryForeground: pickForeground(primary) === "white" ? WHITE : BLACK,
    primaryHover: ramp[hover],
    link: ramp[roles.link],
    ring: ramp[roles.ring],
    subtle: ramp[roles.subtle],
    border: ramp[roles.border],
  };
}

/** The page the accent sits on, per mode: white, and the near-black the dark theme uses. */
const SURFACE: Record<ThemeMode, Oklch> = { light: WHITE, dark: { l: 0.145, c: 0, h: 0 } };
/** The roles keep to this lightness range, so a role is never black or white whatever the brand color. */
const ROLE_L_MIN = 0.2;
const ROLE_L_MAX = 0.92;
const ROLE_L_STEP = 0.005;
/** How far the hover fill sits from the primary fill, in lightness. */
const HOVER_L_STEP = 0.07;

/**
 * The roles for a swatch that carries its own lightness (a brand color). Hue and chroma are the color's own. Each role starts at the color's own
 * lightness and moves away from the page (darker on white, lighter on near-black) one small step at a time, stopping as soon as its contrast rule
 * holds, so a color that already passes is unchanged and one that does not moves no further than it has to. Compare the fixed shade steps the
 * stock swatches use, which land the same color darker (light mode) or paler (dark mode) than any rule needs.
 *
 * The rules are the stock ones (themeContrast.test.ts): the fill and the focus ring 3:1 against the page, a link 4.5:1, and the label on both the
 * fill and its hover 4.5:1. The subtle and border surfaces and the chart series stay on the hue-based ramp, which is what keeps them separable.
 */
function minimalShiftRoles(swatch: AccentSwatch, ownLightness: number, mode: ThemeMode, ramp: AccentRamp): AccentRoles {
  const clampL = (l: number): number => Math.min(ROLE_L_MAX, Math.max(ROLE_L_MIN, l));
  const at = (l: number): Oklch => clampToGamut({ l, c: swatch.chroma, h: swatch.hue });
  const away = mode === "light" ? -1 : 1;

  // A role has to hold its contrast on every surface it is drawn on, not only the page.
  const shifted = (need: number, surfaces: readonly Oklch[] = [SURFACE[mode]]): Oklch => {
    let l = clampL(ownLightness);
    for (;;) {
      const color = at(l);
      if (surfaces.every((surface) => contrastRatio(color, surface) >= need)) return color;
      const next = l + away * ROLE_L_STEP;
      if (next < ROLE_L_MIN || next > ROLE_L_MAX) return color;
      l = next;
    }
  };

  const subtle = ramp[ROLE_SHADES[mode].subtle];
  const primary = shifted(CONTRAST_UI);
  const whiteLabel = pickForeground(primary) === "white";
  const foreground = whiteLabel ? WHITE : BLACK;
  // The hover fill is drawn under the same label as the primary fill, so it moves the way that raises the label's contrast: darker under a white
  // label, lighter under a dark one. That cannot lower it (the label was picked as the better of the two), and the grid test holds it.
  const primaryHover = at(clampL(primary.l + (whiteLabel ? -1 : 1) * HOVER_L_STEP));

  return {
    primary,
    primaryForeground: foreground,
    primaryHover,
    // A link is also drawn on the accent's own tint (the sample strip's "Use your own"), which is a little darker than white, so it must hold on both.
    link: shifted(CONTRAST_TEXT, [SURFACE[mode], subtle]),
    ring: primary,
    subtle,
    border: ramp[ROLE_SHADES[mode].border],
  };
}

/**
 * Chart series colors, derived along the accent's own hue rather than a
 * rainbow palette. A ten-domain stacked chart cannot be ten accents, but it
 * can be ten steps of one — which keeps the whole app reading as black, white,
 * and the athlete's one chosen color.
 */
export function chartSeries(swatch: AccentSwatch, mode: ThemeMode, count: number): Oklch[] {
  if (count <= 0) return [];
  // Light mode runs dark-to-light; dark mode runs light-to-dark, so the first
  // series always has the most contrast against the page.
  const [from, to] = mode === "light" ? [0.42, 0.86] : [0.86, 0.42];
  const out: Oklch[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const l = from + (to - from) * t;
    // Vary chroma slightly too, so adjacent bands separate by more than
    // lightness alone — which matters for anyone with low vision.
    const c = swatch.chroma * (0.95 - 0.45 * Math.abs(0.5 - t) * 2);
    out.push(clampToGamut({ l, c: Math.max(c, 0.02), h: swatch.hue }));
  }
  return out;
}

/** CSS custom properties for one swatch in one mode. */
export function accentCssVars(
  swatch: AccentSwatch,
  mode: ThemeMode,
  chartSeriesCount = 10
): Record<string, string> {
  const roles = accentRoles(swatch, mode);
  const ramp = deriveRamp(swatch);

  const vars: Record<string, string> = {
    "--primary": formatOklch(roles.primary),
    "--primary-foreground": formatOklch(roles.primaryForeground),
    "--primary-hover": formatOklch(roles.primaryHover),
    "--accent-link": formatOklch(roles.link),
    "--ring": formatOklch(roles.ring),
    "--accent-subtle": formatOklch(roles.subtle),
    "--accent-border": formatOklch(roles.border),
  };

  for (const shade of SHADES) {
    vars[`--accent-${shade}`] = formatOklch(ramp[shade]);
  }

  chartSeries(swatch, mode, chartSeriesCount).forEach((color, i) => {
    vars[`--chart-${i + 1}`] = formatOklch(color);
  });

  return vars;
}
