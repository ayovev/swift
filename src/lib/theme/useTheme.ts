import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT,
  accentCssVars,
  getSwatch,
  type AccentId,
  type ThemeMode,
} from "./palette";

/** What the user picked. "system" follows the OS, and keeps following it. */
export type ModePreference = ThemeMode | "system";

export interface ThemeState {
  mode: ModePreference;
  /** The mode actually being rendered, after resolving "system". */
  resolvedMode: ThemeMode;
  accent: AccentId;
  setMode: (mode: ModePreference) => void;
  setAccent: (accent: AccentId) => void;
}

/** Shared with the pre-hydration script in index.html — keep both in step. */
const STORAGE_KEY = "swift.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface StoredTheme {
  mode?: ModePreference;
  accent?: AccentId;
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

const isAccentId = (value: unknown): value is AccentId =>
  ACCENT_SWATCHES.some((s) => s.id === value);

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
  const [accent, setAccentState] = useState<AccentId>(() => {
    const stored = readStored().accent;
    return isAccentId(stored) ? stored : DEFAULT_ACCENT;
  });
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

    const vars = accentCssVars(getSwatch(accent), resolvedMode);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }, [resolvedMode, accent]);

  const setMode = useCallback((next: ModePreference) => {
    setModeState(next);
    writeStored({ ...readStored(), mode: next });
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    writeStored({ ...readStored(), accent: next });
  }, []);

  return useMemo(
    () => ({ mode, resolvedMode, accent, setMode, setAccent }),
    [mode, resolvedMode, accent, setMode, setAccent]
  );
}

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
