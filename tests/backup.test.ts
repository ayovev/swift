import { describe, expect, it } from "vitest";
import { backupFilename, looksLikeBackup, readBackup, serializeBackup } from "@/lib/backup/backup";
import { loadSampleRows } from "./fixtures/sampleRows";
import { scanRow, workoutRow } from "./fixtures/rows";

const wRow = workoutRow({ date: "03/05/2024", title: "FRAN" });
const now = new Date("2026-09-30T14:05:00.000Z");
const envelope = (over: Record<string, unknown>) => JSON.stringify({ format: "swift-backup", version: 1, encoding: "plain", datasets: { workout: [wRow] }, ...over });

describe("serializeBackup / readBackup", () => {
  it("round-trips the real sample export through the wire", async () => {
    const rows = await loadSampleRows();
    const read = await readBackup(serializeBackup({ workout: rows }, now));
    expect(read).toEqual({ status: "ok", datasets: { workout: rows }, exportedAt: now.toISOString() });
  });

  it("keeps every dataset it is given", async () => {
    const tag = { id: "t", type: "cut", label: "Cut", startDate: "2024-03-01", endDate: null };
    const datasets = { workout: [wRow], bodyComp: [scanRow("2026-04-01")], experiments: [{ id: "e", date: "2024-05-01", label: "x" }], tags: [tag] };
    const read = await readBackup(serializeBackup(datasets, now));
    expect(read.status === "ok" && read.datasets).toEqual(datasets);
  });

  it("omits empty datasets so a backup never tells an import to clear something", () => {
    const file = JSON.parse(serializeBackup({ workout: [wRow], tags: [], experiments: [] }, now));
    expect(Object.keys(file.datasets)).toEqual(["workout"]);
  });

  it("names the format, version and encoding", () => {
    const file = JSON.parse(serializeBackup({ workout: [wRow] }, now));
    expect(file).toMatchObject({ format: "swift-backup", version: 1, encoding: "plain", exportedAt: now.toISOString() });
  });

  it("ignores a dataset it doesn't know", async () => {
    const read = await readBackup(envelope({ datasets: { workout: [wRow], preferences: [1] } }));
    expect(read.status === "ok" && Object.keys(read.datasets)).toEqual(["workout"]);
  });

  it.each([
    ["not JSON", "{nope", /isn't valid JSON/],
    ["a bare array", "[]", /isn't a Swift backup/],
    ["a newer version", envelope({ version: 2 }), /newer version of Swift/],
    ["an unknown encoding", envelope({ encoding: "aes-gcm-pbkdf2" }), /newer version of Swift/],
    ["a missing version", envelope({ version: undefined }), /no readable version/],
    ["no datasets", envelope({ datasets: undefined }), /no datasets/],
    ["a dataset that isn't a list", envelope({ datasets: { workout: { a: 1 } } }), /workout section.*isn't a list/],
    ["no workout log", envelope({ datasets: { tags: [] } }), /no workout log/],
    ["an empty workout log", envelope({ datasets: { workout: [] } }), /no workout log/],
  ])("rejects %s", async (_name, text, reason) => {
    const read = await readBackup(text);
    expect(read.status).toBe("invalid");
    expect(read.status === "invalid" && read.reason).toMatch(reason);
  });
});

describe("backupFilename", () => {
  it("uses the local day", () => {
    expect(backupFilename(new Date(2026, 8, 3))).toBe("swift-backup-2026-09-03.json");
  });
});

describe("looksLikeBackup", () => {
  it.each([
    [{ name: "swift-backup-2026-09-30.json", type: "application/json" }, true],
    [{ name: "backup.JSON", type: "" }, true],
    [{ name: "export.csv", type: "text/csv" }, false],
    [{ name: "export", type: "" }, false],
  ])("judges %j as %s", (file, expected) => {
    expect(looksLikeBackup(file)).toBe(expected);
  });
});
