import type { ReactNode } from "react";
import { ThemeContext, useThemeState } from "@/lib/theme/useTheme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeState();
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
