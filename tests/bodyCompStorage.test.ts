import { afterEach, describe, expect, it } from "vitest";
import {
  clearBodyCompRows,
  loadBodyCompRows,
  saveBodyCompRows,
} from "@/lib/storage/bodyCompStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadSampleInBodyRows } from "./fixtures/sampleInBodyRows";

afterEach(async () => {
  await idbClearAll();
});

describe("bodyCompStorage", () => {
  it("resolves undefined before anything has been saved", async () => {
    expect(await loadBodyCompRows()).toBeUndefined();
  });

  it("round-trips real parsed rows through save and load", async () => {
    const rows = await loadSampleInBodyRows();
    await saveBodyCompRows(rows);
    expect(await loadBodyCompRows()).toEqual(rows);
  });

  it("clears saved rows", async () => {
    const rows = await loadSampleInBodyRows();
    await saveBodyCompRows(rows);
    await clearBodyCompRows();
    expect(await loadBodyCompRows()).toBeUndefined();
  });
});
