import { describe, expect, it } from "vitest";
import { CsvValidationError, parseSugarWodCsv } from "@/lib/csv/parseCsv";
import { loadSampleCsvText } from "./fixtures/sampleRows";

const HEADER =
  "date,title,description,best_result_raw,best_result_display,score_type,barbell_lift,set_details,notes,rx_or_scaled,pr";

async function failure(input: string | File): Promise<CsvValidationError> {
  try {
    await parseSugarWodCsv(input);
  } catch (err) {
    if (err instanceof CsvValidationError) return err;
    throw err;
  }
  throw new Error("expected the parse to fail, but it succeeded");
}

describe("parseSugarWodCsv — valid input", () => {
  it("parses the bundled sample export", async () => {
    const rows = await parseSugarWodCsv(loadSampleCsvText());
    expect(rows).toHaveLength(1209);
    expect(rows[0]?.date).toBe("11/21/2022");
  });

  it("accepts an export missing only the columns nothing reads", async () => {
    // set_details and notes are deliberately not required.
    const slim = "date,title,description,best_result_raw,best_result_display,score_type,barbell_lift,rx_or_scaled,pr";
    const rows = await parseSugarWodCsv(`${slim}\n11/21/2022,GRACE,for time,225,3:45,,,RX,PR`);
    expect(rows).toHaveLength(1);
  });

  it("drops a trailing summary row rather than rejecting the whole file", async () => {
    const rows = await parseSugarWodCsv(
      `${HEADER}\n11/21/2022,GRACE,for time,225,3:45,,,,,RX,\n,TOTAL,,,,,,,,,`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("GRACE");
  });
});

describe("parseSugarWodCsv — plain-language failures", () => {
  it("rejects an empty string without leaking parser internals", async () => {
    const err = await failure("");
    expect(err.category).toBe("empty");
    expect(err.message).toBe("That file is empty — there's nothing in it to read.");
  });

  it("rejects a whitespace-only file", async () => {
    expect((await failure("   \n  \n")).category).toBe("empty");
  });

  it("rejects a zero-byte File up front", async () => {
    const err = await failure(new File([], "empty.csv", { type: "text/csv" }));
    expect(err.category).toBe("empty");
  });

  it("names the missing columns when the schema is wrong", async () => {
    const err = await failure("name,age\nbob,42");
    expect(err.category).toBe("missing_columns");
    expect(err.message).toContain("doesn't look like a SugarWOD export");
    expect(err.message).toContain("date");
  });

  it("explains a header-only export", async () => {
    const err = await failure(HEADER);
    expect(err.category).toBe("empty");
    expect(err.message).toBe("That CSV doesn't have any workouts in it.");
  });

  it("explains an export whose dates are unreadable", async () => {
    const err = await failure(`${HEADER}\n2022-11-21,GRACE,for time,225,3:45,,,,,RX,`);
    expect(err.category).toBe("no_valid_rows");
    expect(err.message).toContain("03/14/2025");
  });

  it("never surfaces PapaParse's own wording to the athlete", async () => {
    // Guards the specific regression: an empty file used to report
    // "Unable to auto-detect delimiting character; defaulted to ','".
    for (const input of ["", "   ", "\n\n"]) {
      const err = await failure(input);
      expect(err.message).not.toMatch(/delimit|auto-detect|defaulted/i);
    }
  });

  it("carries a closed-vocabulary category for analytics, never file content", async () => {
    const err = await failure("name,age\nbob,42");
    expect(["unreadable", "malformed", "missing_columns", "empty", "no_valid_rows"]).toContain(
      err.category
    );
  });
});
