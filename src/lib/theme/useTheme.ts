import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BRAND_ACCENT_ID, brandSwatch } from "@/lib/brand/color";
import { useBrand } from "@/lib/brand/brandStore";
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT,
  accentCssVars,
  getSwatch,
  type AccentId,
  type AccentSwatch,
  type ThemeMode,
} from "./palette";

/** A stock swatch, or the coach's brand colour (only while one is set). */
export type AccentChoice = AccentId | typeof BRAND_ACCENT_ID;

/** What the user picked. "system" follows the OS, and keeps following it. */
export type ModePreference = ThemeMode | "system";

export interface ThemeState {
  mode: ModePreference;
  /** The mode actually being rendered, after resolving "system". */
  resolvedMode: ThemeMode;
  /** What is in effect: "brand" only while a valid brand colour is set, otherwise the stock accent it falls back to. */
  accent: AccentChoice;
  /** The swatch for `accent`, brand colour included. */
  swatch: AccentSwatch;
  setMode: (mode: ModePreference) => void;
  setAccent: (accent: AccentChoice) => void;
}

/** Shared with the pre-hydration script in index.html — keep both in step. */
const STORAGE_KEY = "swift.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface StoredTheme {
  mode?: ModePreference;
  accent?: AccentChoice;
}

function readStored(): StoredTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as StoredTheme;
  } catch {
    // Private browsing, blocked storage, or corrupt JSON. Defaults are fine —
    // a theme preference is never worth breaking the app over.
    return {};
  }
}

function writeStored(value: StoredTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

function systemMode(): ThemeMode {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

const isAccentChoice = (value: unknown): value is AccentChoice =>
  value === BRAND_ACCENT_ID || ACCENT_SWATCHES.some((s) => s.id === value);

const isModePreference = (value: unknown): value is ModePreference =>
  value === "light" || value === "dark" || value === "system";

/**
 * Theme state for the whole app.
 *
 * Defaults to the system colour scheme and a sensible accent; both persist to
 * localStorage so a return visit isn't reset. The accent's derived CSS
 * variables are written to the document element, so every component — shadcn
 * primitives, focus rings, Recharts series — picks them up without any
 * per-component wiring.
 */
export function useThemeState(): ThemeState {
  const [mode, setModeState] = useState<ModePreference>(() => {
    const stored = readStored().mode;
    return isModePreference(stored) ? stored : "system";
  });
  const [chosen, setAccentState] = useState<AccentChoice>(() => {
    const stored = readStored().accent;
    return isAccentChoice(stored) ? stored : DEFAULT_ACCENT;
  });
  const brandColor = useBrand().color;
  const brand = useMemo(() => (brandColor ? brandSwatch(brandColor) : null), [brandColor]);
  // "brand" with no brand colour (removed, or storage cleared) quietly falls back to the default.
  const accent: AccentChoice = chosen === BRAND_ACCENT_ID && !brand ? DEFAULT_ACCENT : chosen;
  const swatch: AccentSwatch = accent === BRAND_ACCENT_ID && brand ? brand.swatch : getSwatch(accent === BRAND_ACCENT_ID ? DEFAULT_ACCENT : accent);
  const [systemPreference, setSystemPreference] = useState<ThemeMode>(systemMode);

  // Keep following the OS while the preference is "system" — a user who
  // switches their laptop to dark at sunset should see Swift follow.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent): void => {
      setSystemPreference(e.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedMode: ThemeMode = mode === "system" ? systemPreference : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedMode === "dark");
    root.style.colorScheme = resolvedMode;
    root.setAttribute("data-accent", accent);

    const vars = accentCssVars(swatch, resolvedMode);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }, [resolvedMode, accent, swatch]);

  const setMode = useCallback((next: ModePreference) => {
    setModeState(next);
    writeStored({ ...readStored(), mode: next });
  }, []);

  const setAccent = useCallback((next: AccentChoice) => {
    setAccentState(next);
    writeStored({ ...readStored(), accent: next });
  }, []);

  return useMemo(
    () => ({ mode, resolvedMode, accent, swatch, setMode, setAccent }),
    [mode, resolvedMode, accent, swatch, setMode, setAccent]
  );
}

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
