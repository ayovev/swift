import dayjs from "dayjs";

/** "Mar 1, 2026" — the one date shape used in insight sentences, matching the UI's `formatDate`. */
export function formatDay(iso: string): string {
  return dayjs(iso).format("MMM D, YYYY");
}

