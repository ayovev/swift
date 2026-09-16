import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSugarWodCsv } from "@/lib/csv/parseCsv";
import type { SugarWodRow } from "@/types/sugarwod";

// Resolved from the repo root rather than import.meta.url: these tests run in
// the jsdom environment, where import.meta.url is an http:// URL.
const SAMPLE_CSV_PATH = resolve(process.cwd(), "public/sample/sugarwod-sample-export.csv");

/** The bundled demo export — the one validated real-world dataset. */
export function loadSampleCsvText(): string {
  return readFileSync(SAMPLE_CSV_PATH, "utf8");
}

/** Parsed through the real production parser, not a test-only shortcut. */
export function loadSampleRows(): Promise<SugarWodRow[]> {
  return parseSugarWodCsv(loadSampleCsvText());
}
