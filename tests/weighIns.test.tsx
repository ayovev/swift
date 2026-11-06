import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { idbClearAll } from "@/lib/storage/idbStore";
import { WeighInsPanel } from "@/components/dashboard/WeighInsPanel";
import { getBodyCompNoiseBand } from "@/lib/analytics/bodyCompNoise";
import { bodyContextLines, type BodyReading } from "@/lib/analytics/insights/bodyContext";
import { readingsFromInBody } from "@/lib/analytics/insights/bodyReadings";
import { bodyWeightRows, pooledReadings, pooledScanRows, removeWeighIn, upsertWeighIn, validateWeighIn, validateWeighInList } from "@/lib/analytics/weighIns";
import { readBackup, serializeBackup } from "@/lib/backup/backup";
import { Reassembler, chunkPayload } from "@/lib/sync/chunking";
import { planTransfer } from "@/lib/sync/planTransfer";
import { planReceived, type ExistingCounts, type ReceivedHandlers } from "@/lib/sync/receivedDatasets";
import { loadWeighIns, saveWeighIns } from "@/lib/storage/weighInsStorage";
import type { WeighIn } from "@/types/weighIn";
import { scanRow, workoutRow } from "./fixtures/rows";

/** Manual weigh-ins (docs: A1-WGH-01 to A1-WGH-14): validation, one per day, pooling with scans, sync, backup, storage and the panel. */

afterEach(async () => {
  await idbClearAll();
});

const TODAY = "2026-09-11";
const w = (date: string, weightLb: number, notes?: string): WeighIn => ({ date, weightLb, ...(notes ? { notes } : {}), source: "manual" });

describe("a weigh-in (WGH-01 to WGH-04)", () => {
  it("WGH-01 saves a date, a weight and a note", () => {
    expect(validateWeighIn({ date: "2026-09-01", weightLb: 182.4, notes: "after a long run" }, TODAY)).toEqual({ status: "ok", value: w("2026-09-01", 182.4, "after a long run") });
  });

  it("WGH-02 rejects a future date, a weight outside 50 to 600 lb and a missing weight, and accepts the limits", () => {
    const reasons = (input: Parameters<typeof validateWeighIn>[0]) => (validateWeighIn(input, TODAY) as { reasons?: string[] }).reasons;
    expect(reasons({ date: "2026-09-12", weightLb: 180 })).toEqual(["The date is after today."]);
    expect(reasons({ date: "2026-09-01", weightLb: 49.9 })).toEqual(["The weight must be between 50 and 600 lb."]);
    expect(reasons({ date: "2026-09-01", weightLb: 600.1 })).toEqual(["The weight must be between 50 and 600 lb."]);
    expect(reasons({ date: "2026-09-01", weightLb: null })).toEqual(["Enter your weight in pounds."]);
    expect(reasons({ date: "", weightLb: null })).toEqual(["Add a date.", "Enter your weight in pounds."]);
    expect(validateWeighIn({ date: "2026-09-11", weightLb: 50 }, TODAY).status).toBe("ok");
    expect(validateWeighIn({ date: "2026-09-01", weightLb: 600 }, TODAY).status).toBe("ok");
  });

  it("WGH-04 trims a note, stores a blank one as absent, and allows 200 characters but not 201", () => {
    expect(validateWeighIn({ date: "2026-09-01", weightLb: 180, notes: "  steady  " }, TODAY)).toMatchObject({ value: { notes: "steady" } });
    expect((validateWeighIn({ date: "2026-09-01", weightLb: 180, notes: "   " }, TODAY) as { value: WeighIn }).value).not.toHaveProperty("notes");
    expect(validateWeighIn({ date: "2026-09-01", weightLb: 180, notes: "x".repeat(200) }, TODAY).status).toBe("ok");
    expect(validateWeighIn({ date: "2026-09-01", weightLb: 180, notes: "x".repeat(201) }, TODAY)).toMatchObject({ reasons: ["The note is over 200 characters."] });
  });

  it("WGH-03 saves one per day: a second for a date replaces the first, note included", () => {
    const list = upsertWeighIn(upsertWeighIn([], w("2026-09-01", 182.4, "after a run")), w("2026-09-01", 183));
    expect(list).toEqual([w("2026-09-01", 183)]);
    expect(upsertWeighIn(list, w("2026-08-30", 181)).map((x) => x.date)).toEqual(["2026-08-30", "2026-09-01"]);
    expect(removeWeighIn(list, "2026-09-01")).toEqual([]);
  });
});

describe("a list from sync or backup", () => {
  it("accepts a valid list and checks shape only, not the date against today", () => {
    expect(validateWeighInList([w("2099-01-01", 180)])).toEqual({ status: "ok", weighIns: [w("2099-01-01", 180)] });
  });

  it("rejects the whole list on one bad record, naming it", () => {
    expect(validateWeighInList([w("2026-09-01", 180), { date: "2026-09-02", weightLb: 700, source: "manual" }])).toEqual({
      status: "invalid",
      reason: "Weigh-in 2 has a weight outside 50 to 600 lb.",
    });
    expect(validateWeighInList([{ date: "2026-09-01", weightLb: 180, source: "inbody" }])).toMatchObject({ status: "invalid" });
    expect(validateWeighInList([w("2026-09-01", 180), w("2026-09-01", 181)])).toMatchObject({ status: "invalid" });
    expect(validateWeighInList("nope")).toMatchObject({ status: "invalid" });
  });
});

describe("pooling with InBody scans (WGH-05 to WGH-08)", () => {
  const scans: BodyReading[] = [{ date: "2026-08-01", weightLb: 184 }, { date: "2026-09-01", weightLb: 186 }];

  it("WGH-05 lists scans (read-only) and weigh-ins together, newest first", () => {
    const rows = bodyWeightRows(scans, [w("2026-08-15", 185), w("2026-09-05", 187)]);
    expect(rows.map((r) => `${r.date} ${r.kind}`)).toEqual(["2026-09-05 entered", "2026-09-01 scan", "2026-08-15 entered", "2026-08-01 scan"]);
  });

  it("WGH-06 uses the scan on a day with both, keeps the weigh-in listed as not used, and uses it again without the scan", () => {
    const both = [w("2026-09-01", 182)];
    expect(pooledReadings(scans, both).find((r) => r.date === "2026-09-01")?.weightLb).toBe(186);
    expect(bodyWeightRows(scans, both).find((r) => r.kind === "entered")?.used).toBe(false);
    expect(pooledReadings([], both)).toEqual([{ date: "2026-09-01", weightLb: 182 }]);
  });

  it("WGH-07 gives the body-context line from weigh-ins alone, with no lean and fat form", () => {
    const readings = pooledReadings([], [w("2024-04-08", 178), w("2026-03-30", 184)]);
    const lines = bodyContextLines(
      { subject: { key: "front squat|RX", movement: "front squat", name: "Front Squat", status: "RX", kind: "lift", format: "load", lowerIsBetter: false, sessions: [], entries: [] }, state: "up", change: 8.8, from: "2024-04-08", to: "2026-03-30", bests: { previous: 184, recent: 200 } },
      readings,
      3
    );
    expect(lines?.first).toBe("Body weight 178 to 184 lb (+6 lb) over the same span.");
  });

  it("WGH-08 reaches a measured noise band with frequent weigh-ins, where scans months apart used the default", () => {
    const weekly = Array.from({ length: 12 }, (_, i) => w(`2026-0${i < 4 ? 6 : i < 8 ? 7 : 8}-${String((i % 4) * 7 + 1).padStart(2, "0")}`, 180 + (i % 2 ? 0.8 : -0.8)));
    const rows = pooledScanRows([], weekly);
    expect(getBodyCompNoiseBand(rows, "weight").method).not.toBe("default");
    const sparse = pooledScanRows([scanRow("2026-01-01", { "Weight(lb)": "180" }), scanRow("2026-05-01", { "Weight(lb)": "182" })], []);
    expect(getBodyCompNoiseBand(sparse, "weight").method).toBe("default");
  });

  it("reads InBody scans as readings with lean and fat", () => {
    const r = readingsFromInBody([scanRow("2026-08-01", { "Weight(lb)": "184", "Soft Lean Mass(lb)": "150", "Body Fat Mass(lb)": "20" })]);
    expect(r).toEqual([{ date: "2026-08-01", weightLb: 184, leanLb: 150, fatLb: 20 }]);
  });
});

describe("sync and backup (WGH-11 to WGH-13)", () => {
  const none: ExistingCounts = { workout: null, bodyComp: null, tags: null, weighIns: null };
  const handlers = (): ReceivedHandlers => ({ workout: vi.fn(), bodyComp: vi.fn(), tags: vi.fn(), weighIns: vi.fn() });

  it("carries weighIns on the wire", () => {
    const json = JSON.stringify([w("2026-09-01", 180)]);
    const payload = chunkPayload("weighIns", json, 1024);
    const r = new Reassembler();
    r.feed(payload.headerBytes);
    const results = payload.chunks.map((c) => r.feed(c));
    expect(results.at(-1)).toEqual({ done: true, dataset: "weighIns", json });
  });

  it("WGH-11 applies a valid list straight away when nothing local conflicts, and asks first when something would be replaced", () => {
    const h = handlers();
    const plan = planReceived({ weighIns: [w("2026-09-01", 180)] }, none, h);
    expect(plan.skipped).toEqual([]);
    expect(h.weighIns).toHaveBeenCalledWith([w("2026-09-01", 180)]);
    const h2 = handlers();
    const conflict = planReceived({ weighIns: [w("2026-09-01", 180)] }, { ...none, weighIns: 3 }, h2);
    expect(conflict.conflicts).toMatchObject([{ dataset: "weighIns", existingCount: 3, incomingCount: 1 }]);
    expect(h2.weighIns).not.toHaveBeenCalled();
  });

  it("WGH-11 one invalid record rejects the dataset and applies nothing from the transfer", () => {
    const h = handlers();
    const plan = planTransfer({ workout: [workoutRow({ date: "03/05/2024", title: "FRAN" })], weighIns: [{ date: "2026-09-01", weightLb: 700, source: "manual" }] }, none, h);
    expect(plan.skipped).toMatchObject([{ dataset: "weighIns", reason: "Weigh-in 1 has a weight outside 50 to 600 lb." }]);
    plan.flush();
    expect(h.weighIns).not.toHaveBeenCalled();
  });

  it("WGH-12 a backup holds weigh-ins with their notes, and omits them when there are none", async () => {
    const list = [w("2026-09-01", 180, "morning")];
    const read = await readBackup(serializeBackup({ workout: [workoutRow({ date: "03/05/2024", title: "FRAN" })], weighIns: list }, new Date("2026-09-30T14:05:00.000Z")));
    expect(read.status === "ok" && read.datasets.weighIns).toEqual(list);
    const empty = JSON.parse(serializeBackup({ workout: [workoutRow({ date: "03/05/2024", title: "FRAN" })], weighIns: [] }, new Date()));
    expect(Object.keys(empty.datasets)).toEqual(["workout"]);
  });

  it("is stored under its own key and round-trips", async () => {
    const list = [w("2026-09-01", 180, "morning")];
    await saveWeighIns(list);
    expect(await loadWeighIns()).toEqual(list);
  });
});

describe("the Weigh-ins panel", () => {
  const scans: BodyReading[] = [{ date: "2026-09-01", weightLb: 186 }];

  it("WGH-01 saves a weigh-in from the form and clears it", () => {
    const onSave = vi.fn();
    render(<WeighInsPanel scans={[]} weighIns={[]} onSave={onSave} onDelete={vi.fn()} today={TODAY} />);
    fireEvent.change(screen.getByLabelText("Weight (lb)"), { target: { value: "182.4" } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "after a long run" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weigh-in" }));
    expect(onSave).toHaveBeenCalledWith(w(TODAY, 182.4, "after a long run"));
    expect(screen.getByLabelText("Weight (lb)")).toHaveValue(null);
  });

  it("WGH-02 lists each failing rule and saves nothing", () => {
    const onSave = vi.fn();
    render(<WeighInsPanel scans={[]} weighIns={[]} onSave={onSave} onDelete={vi.fn()} today={TODAY} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weigh-in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The date is after today.");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your weight in pounds.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("WGH-05 shows scans read-only and weigh-ins with Edit and Delete, and marks a same-day weigh-in not used", () => {
    const onDelete = vi.fn();
    render(<WeighInsPanel scans={scans} weighIns={[w("2026-09-01", 182), w("2026-09-05", 187, "evening")]} onSave={vi.fn()} onDelete={onDelete} today={TODAY} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const scan = items.find((i) => within(i).queryByText("InBody scan")) as HTMLElement;
    expect(within(scan).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Not used: an InBody scan the same day")).toBeInTheDocument();
    const entered = items.find((i) => within(i).queryByText("evening")) as HTMLElement;
    fireEvent.click(within(entered).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Weight (lb)")).toHaveValue(187);
    fireEvent.click(within(entered).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("2026-09-05");
  });
});
