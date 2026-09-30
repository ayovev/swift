import dayjs from "dayjs";

/** "Mar 1, 2026" — the one date shape used in insight sentences, matching the UI's `formatDate`. */
export function formatDay(iso: string): string {
  return dayjs(iso).format("MMM D, YYYY");
}

/** "13%" for 0.13 or -0.13: whole percent, unsigned (the sentence says up or down). */
export function formatPercent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}
