import Papa from "papaparse";
import { REQUIRED_COLUMNS, type SugarWodRow } from "@/types/sugarwod";

/**
 * Why a parse failed. Used verbatim as a PostHog event property — it is a
 * fixed vocabulary, never derived from file contents, so no workout data or
 * filename can leak through it (FR-9.2).
 */
export type CsvErrorCategory =
  | "unreadable"
  | "malformed"
  | "missing_columns"
  | "empty"
  | "no_valid_rows";

export class CsvValidationError extends Error {
  readonly category: CsvErrorCategory;

  constructor(category: CsvErrorCategory, message: string) {
    super(message);
    this.name = "CsvValidationError";
    this.category = category;
  }
}

/** A date cell SugarWOD writes as MM/DD/YYYY. Cheap shape check only. */
const DATE_SHAPE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

function validate(
  rows: SugarWodRow[],
  fields: readonly string[]
): SugarWodRow[] {
  const missing = REQUIRED_COLUMNS.filter((col) => !fields.includes(col));
  if (missing.length > 0) {
    throw new CsvValidationError(
      "missing_columns",
      `This doesn't look like a SugarWOD export — it's missing the ` +
        `${missing.length > 1 ? "columns" : "column"} ${missing.join(", ")}. ` +
        `In SugarWOD, use Export Workouts from your training log and upload that file.`
    );
  }

  if (rows.length === 0) {
    throw new CsvValidationError("empty", "That CSV doesn't have any workouts in it.");
  }

  // Drop rows with no usable date rather than letting one bad line throw out
  // the whole upload — exports occasionally carry a trailing summary line.
  const usable = rows.filter((r) => DATE_SHAPE.test((r.date ?? "").trim()));
  if (usable.length === 0) {
    throw new CsvValidationError(
      "no_valid_rows",
      "None of the rows in that CSV have a readable date, so there's nothing to chart. " +
        "Swift expects SugarWOD's own export format, where dates look like 03/14/2025."
    );
  }

  return usable;
}

/**
 * Parse and validate a SugarWOD "Export Workouts" CSV.
 *
 * Runs entirely in the browser — the file is read via the File API and never
 * transmitted anywhere (FR-1.4, Privacy NFR).
 *
 * @param input a picked/dropped File, or raw CSV text (used by demo mode and tests).
 */
export function parseSugarWodCsv(input: File | string): Promise<SugarWodRow[]> {
  return new Promise((resolve, reject) => {
    const config: Papa.ParseConfig<SugarWodRow> = {
      header: true,
      skipEmptyLines: "greedy",
    };

    const handle = (results: Papa.ParseResult<SugarWodRow>): void => {
      try {
        // PapaParse reports recoverable quirks (a short row, a stray quote)
        // as errors. Only give up when nothing parsed at all; otherwise a
        // single odd line would reject an otherwise-fine 1,200-row export.
        if (results.data.length === 0 && results.errors.length > 0) {
          const [first] = results.errors;
          throw new CsvValidationError(
            "malformed",
            `Couldn't read that CSV${first ? `: ${first.message}` : "."}`
          );
        }
        resolve(validate(results.data, results.meta.fields ?? []));
      } catch (err) {
        reject(err);
      }
    };

    if (typeof input === "string") {
      handle(Papa.parse<SugarWodRow>(input, config));
      return;
    }

    Papa.parse<SugarWodRow, File>(input, {
      ...config,
      complete: handle,
      error: (err: Error) =>
        reject(new CsvValidationError("unreadable", `Couldn't read that file: ${err.message}`)),
    });
  });
}
