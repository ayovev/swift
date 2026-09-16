import {
  BLACK,
  WHITE,
  clampToGamut,
  formatOklch,
  pickForeground,
  type Oklch,
} from "./contrast";

/**
 * The accent system (FR-8.2, FR-8.3).
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
 * v1 is a curated set of swatches, deliberately not a free colour picker.
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
 * Chroma taper. Colour has to fall away at both ends or the pale shades look
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

/** Derive a swatch's full shade range (FR-8.3). */
export function deriveRamp(swatch: AccentSwatch): AccentRamp {
  const ramp = {} as AccentRamp;
  for (const shade of SHADES) {
    // Clamped so a light, highly-chromatic hue (blue near white) cannot
    // silently clip to a different colour than the one we reasoned about.
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

/** Resolve a swatch to its role colours for one mode. */
export function accentRoles(swatch: AccentSwatch, mode: ThemeMode): AccentRoles {
  const ramp = deriveRamp(swatch);
  const roles = ROLE_SHADES[mode];
  const primary = ramp[roles.primary];

  return {
    primary,
    // Chosen by measured contrast, not assumed — a light amber button needs
    // black text where a blue one needs white.
    primaryForeground: pickForeground(primary) === "white" ? WHITE : BLACK,
    primaryHover: ramp[roles.hover],
    link: ramp[roles.link],
    ring: ramp[roles.ring],
    subtle: ramp[roles.subtle],
    border: ramp[roles.border],
  };
}

/**
 * Chart series colours, derived along the accent's own hue rather than a
 * rainbow palette. A ten-domain stacked chart cannot be ten accents, but it
 * can be ten steps of one — which keeps the whole app reading as black, white,
 * and the athlete's one chosen colour.
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
