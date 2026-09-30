import type { StrengthAttribution } from "@/lib/analytics/relativeStrength";

/** How each strength attribution reads on screen; the one list the Lifts view and the cycle report share. */
export const ATTRIBUTION_LABEL: Record<StrengthAttribution, string> = {
  "strength-driven": "Strength",
  "mass-driven": "Mass",
  mixed: "Strength and mass",
  flat: "Flat",
  declined: "Down",
};
