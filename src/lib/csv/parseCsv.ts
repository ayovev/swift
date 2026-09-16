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

const EMPTY_MESSAGE = "That file is empty — there's nothing in it to read.";

/**
 * PapaParse's own error text is written for developers ("Unable to auto-detect
 * delimiting character; defaulted to ','"), which is not something to show an
 * athlete who just picked the wrong file. Map the codes we can anticipate to
 * plain language and fall back to a generic sentence rather than leaking
 * parser internals into the UI.
 */
function plainParseMessage(error: Papa.ParseError | undefined): string {
  switch (error?.code) {
    case "UndetectableDelimiter":
      return "That file doesn't look like a CSV — Swift couldn't find any columns in it.";
    case "TooFewFields":
    case "TooManyFields":
      return "That CSV's rows don't all have the same number of columns, so it can't be read reliably.";
    case "MissingQuotes":
      return "That CSV has an unclosed quote in it, so it can't be read reliably.";
    default:
      return "Swift couldn't read that file as a CSV. Re-export it from SugarWOD and try again.";
  }
}

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
        if (results.data.length === 0) {
          const fields = results.meta.fields ?? [];
          // No rows AND no header means there was nothing there at all.
          if (fields.length === 0) {
            throw new CsvValidationError(
              results.errors.length > 0 ? "malformed" : "empty",
              results.errors.length > 0 ? plainParseMessage(results.errors[0]) : EMPTY_MESSAGE
            );
          }
        }
        resolve(validate(results.data, results.meta.fields ?? []));
      } catch (err) {
        reject(err);
      }
    };

    if (typeof input === "string") {
      if (input.trim() === "") {
        reject(new CsvValidationError("empty", EMPTY_MESSAGE));
        return;
      }
      handle(Papa.parse<SugarWodRow>(input, config));
      return;
    }

    // A zero-byte file never reaches the parser — checking size up front gives
    // a straight answer instead of a delimiter-detection complaint.
    if (input.size === 0) {
      reject(new CsvValidationError("empty", EMPTY_MESSAGE));
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
