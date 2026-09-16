import { describe, expect, it } from "vitest";
import { CsvValidationError } from "@/lib/csv/parseCsv";
import { parseInBodyCsv } from "@/lib/csv/parseInBodyCsv";
import { loadSampleInBodyCsvText } from "./fixtures/sampleInBodyRows";

const HEADER = "date,Weight(lb),Skeletal Muscle Mass(lb),Percent Body Fat(%),BMI(kg/m²),InBody Score";

async function failure(input: string | File): Promise<CsvValidationError> {
  try {
    await parseInBodyCsv(input);
  } catch (err) {
    if (err instanceof CsvValidationError) return err;
    throw err;
  }
  throw new Error("expected the parse to fail, but it succeeded");
}

describe("parseInBodyCsv — valid input", () => {
  it("parses the synthetic sample export", async () => {
    const rows = await parseInBodyCsv(loadSampleInBodyCsvText());
    expect(rows).toHaveLength(5);
    // Newest-first, as InBody's own export orders it — sorting oldest-first
    // is the analytics layer's job, same division as parseSugarWodCsv/parseRows.
    expect(rows[0]?.date).toBe("20260701093000");
  });

  it("accepts an export missing every column but date and Weight(lb)", async () => {
    const rows = await parseInBodyCsv(`date,Weight(lb)\n20260701093000,180.2`);
    expect(rows).toHaveLength(1);
  });

  it("drops a trailing blank line rather than rejecting the whole file", async () => {
    const rows = await parseInBodyCsv(`${HEADER}\n20260701093000,180.2,88.5,11.2,24.6,88\n\n`);
    expect(rows).toHaveLength(1);
  });

  it("tolerates '-' as InBody's own missing-value sentinel", async () => {
    const rows = await parseInBodyCsv(`${HEADER}\n20260701093000,180.2,-,-,-,-`);
    expect(rows[0]?.["Skeletal Muscle Mass(lb)"]).toBe("-");
  });
});

describe("parseInBodyCsv — plain-language failures", () => {
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
    expect(err.message).toContain("doesn't look like an InBody export");
    expect(err.message).toContain("Weight(lb)");
  });

  it("explains a header-only export", async () => {
    const err = await failure(HEADER);
    expect(err.category).toBe("empty");
    expect(err.message).toBe("That CSV doesn't have any measurements in it.");
  });

  it("explains an export whose dates are unreadable", async () => {
    const err = await failure(`${HEADER}\n2026-07-01,180.2,88.5,11.2,24.6,88`);
    expect(err.category).toBe("no_valid_rows");
  });

  it("never surfaces PapaParse's own wording", async () => {
    for (const input of ["", "   ", "\n\n"]) {
      const err = await failure(input);
      expect(err.message).not.toMatch(/delimit|auto-detect|defaulted/i);
    }
  });

  it("carries the same closed-vocabulary category as parseSugarWodCsv", async () => {
    const err = await failure("name,age\nbob,42");
    expect(["unreadable", "malformed", "missing_columns", "empty", "no_valid_rows"]).toContain(
      err.category
    );
  });
});
