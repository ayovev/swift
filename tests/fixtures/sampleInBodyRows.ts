import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import type { InBodyRow } from "@/types/inbody";

// Resolved from the repo root rather than import.meta.url: these tests run in
// the jsdom environment, where import.meta.url is an http:// URL.
const SAMPLE_CSV_PATH = resolve(process.cwd(), "tests/fixtures/inbody-sample-export.csv");

/**
 * A synthetic export shaped exactly like a real InBody app export (same 44
 * columns, same YYYYMMDDHHmmss timestamps, "-" for unmeasured cells) but
 * with fabricated numbers — not bundled as a demo file the way
 * sugarwod-sample-export.csv is, since body-composition history is a real
 * person's health data and shouldn't be committed to the repo.
 */
export function loadSampleInBodyCsvText(): string {
  return readFileSync(SAMPLE_CSV_PATH, "utf8");
}

/** Parsed through the real production parser, not a test-only shortcut. */
export function loadSampleInBodyRows(): Promise<InBodyRow[]> {
  return parseInBodyCsv(loadSampleInBodyCsvText());
}
