import { DOMAIN_LIST, DOMAIN_SHORT_LABELS, type Domain } from "@/types/dashboard";
import { MODALITY_LIST, MODALITY_SHORT_LABELS, type Modality } from "@/types/modality";
import type { ChartConfig } from "@/components/ui/chart";

/** "2025-03" -> "Mar '25" */
export function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  if (!year || !month) return ym;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return `${date.toLocaleString("en-US", { month: "short" })} '${year.slice(2)}`;
}

/** "2025-03-14" -> "14 Mar 2025" */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** "25-03-14" (the workout-list format) -> "14 Mar 2025" */
export function formatShortDate(yyMmDd: string): string {
  const [yy, mm, dd] = yyMmDd.split("-");
  if (!yy || !mm || !dd) return yyMmDd;
  return formatDate(`20${yy}-${mm}-${dd}`);
}

/** Recharts renders a tick per point by default; at 47 months that's a smear. */
export function monthTickInterval(pointCount: number): number {
  if (pointCount <= 12) return 0;
  return Math.max(1, Math.ceil(pointCount / 10) - 1);
}

/**
 * The ten domain series, coloured along the accent's own hue rather than a
 * rainbow — see chartSeries() in lib/theme/palette.ts.
 */
export const DOMAIN_CHART_CONFIG: ChartConfig = Object.fromEntries(
  DOMAIN_LIST.map((domain, i) => [
    domain,
    { label: DOMAIN_SHORT_LABELS[domain], color: `var(--chart-${i + 1})` },
  ])
);

export const MODALITY_CHART_CONFIG: ChartConfig = Object.fromEntries(
  MODALITY_LIST.map((modality, i) => [
    modality,
    // Spread across the ramp so the three bands are clearly distinct.
    { label: MODALITY_SHORT_LABELS[modality], color: `var(--chart-${i * 4 + 1})` },
  ])
);

export function domainColor(domain: Domain): string {
  return `var(--chart-${DOMAIN_LIST.indexOf(domain) + 1})`;
}

export function modalityColor(modality: Modality): string {
  return `var(--chart-${MODALITY_LIST.indexOf(modality) * 4 + 1})`;
}

/** Shared axis styling — muted, small, and out of the way of the data. */
export const AXIS_PROPS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Y-axis widths, sized for the LONGEST label each axis can produce.
 *
 * Recharts renders axis labels inside the SVG canvas, so a negative left chart
 * margin tuned for short labels ("25") silently clips longer ones ("100%") off
 * the edge — the values are in the DOM the whole time, just painted outside the
 * viewBox, which makes it look like a data bug rather than a layout one.
 * Chart margins therefore stay at left: 0 and the axis reserves its own space.
 */
export const PCT_AXIS_WIDTH = 48;
export const NUM_AXIS_WIDTH = 52;
