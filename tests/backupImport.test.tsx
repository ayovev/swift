import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { backupFilename, readBackup, serializeBackup } from "@/lib/backup/backup";
import { loadBodyCompRows, saveBodyCompRows } from "@/lib/storage/bodyCompStorage";
import { loadExperiments, saveExperiments } from "@/lib/storage/experimentsStorage";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadTags, saveTags } from "@/lib/storage/tagsStorage";
import { loadWorkoutRows, saveWorkoutRows } from "@/lib/storage/workoutStorage";
import type { ContextTag } from "@/types/tag";
import { scanRow, workoutRow } from "./fixtures/rows";

const rowsA = [workoutRow({ date: "03/05/2024", title: "FRAN" }), workoutRow({ date: "03/06/2024", title: "GRACE" })];
const rowsB = [workoutRow({ date: "01/02/2025", title: "CINDY" })];
const scans = [scanRow("2026-04-01")];
const experiments = [{ id: "e1", date: "2024-05-01", label: "5/3/1" }];
const tags: ContextTag[] = [{ id: "t1", type: "cut", label: "Spring cut", startDate: "2024-03-01", endDate: null }];

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

const backupFile = (datasets: Parameters<typeof serializeBackup>[0]) =>
  new File([serializeBackup(datasets, new Date("2026-09-30T12:00:00Z"))], "backup.json", { type: "application/json" });

/** The button stays disabled while the app restores from storage, so a real pick can't race it. */
async function pickBackupWhenReady(file: File) {
  await waitFor(() => expect(screen.getByRole("button", { name: /import a backup/i })).toBeEnabled());
  pickBackup(file);
}

function pickBackup(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]');
  if (!input) throw new Error("no backup input");
  fireEvent.change(input, { target: { files: [file] } });
}

afterEach(async () => {
  await idbClearAll();
});

describe("backup import from the landing page", () => {
  it("restores every dataset, and a reload still has them", { timeout: 15000 }, async () => {
    renderApp();
    await pickBackupWhenReady(backupFile({ workout: rowsA, bodyComp: scans, experiments, tags }));

    await screen.findByRole("button", { name: "Settings" }, { timeout: 5000 });
    await waitFor(async () => {
      expect(await loadWorkoutRows()).toEqual(rowsA);
      expect(await loadBodyCompRows()).toEqual(scans);
      // Experiments used to be dropped here: the handler checked a screen that hadn't changed yet.
      expect(await loadExperiments()).toEqual(experiments);
      expect(await loadTags()).toEqual(tags);
    });
  });

  it("names the problem inline and leaves storage alone when the file is wrong", async () => {
    await saveTags(tags);
    renderApp();
    await screen.findByRole("button", { name: /upload your sugarwod csv export/i });
    await pickBackupWhenReady(new File(["{nope"], "backup.json", { type: "application/json" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nothing was imported. That file isn't valid JSON.");
    expect(await loadTags()).toEqual(tags);
    expect(screen.getByRole("button", { name: /import a backup/i })).toBeEnabled();
  });

  it("imports nothing when one dataset in the file is invalid", async () => {
    renderApp();
    await pickBackupWhenReady(backupFile({ workout: rowsA, tags: [{ nope: true }] }));
    expect(await screen.findByRole("status")).toHaveTextContent(/nothing was imported.*list of context tags/i);
    expect(await loadWorkoutRows()).toBeUndefined();
  });
});

describe("backup import from Settings", () => {
  async function openSettingsWithData() {
    await saveWorkoutRows(rowsA);
    await saveExperiments(experiments);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    return screen.findByRole("dialog", { name: "Settings" });
  }

  it("asks before replacing, and Cancel changes nothing", { timeout: 15000 }, async () => {
    await openSettingsWithData();
    pickBackup(backupFile({ workout: rowsB, experiments: [{ id: "e2", date: "2025-01-01", label: "new" }] }));

    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/workout log: 2 entries now, 1 in the backup/i)).toBeInTheDocument();
    expect(within(confirm).getByText(/list of experiments: 1 entry now, 1 in the backup/i)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await loadWorkoutRows()).toEqual(rowsA);
    expect(await loadExperiments()).toEqual(experiments);
  });

  it("replaces everything in the file on Replace, with the workout log last", { timeout: 15000 }, async () => {
    await openSettingsWithData();
    const newExperiments = [{ id: "e2", date: "2025-01-01", label: "new" }];
    pickBackup(backupFile({ workout: rowsB, experiments: newExperiments, tags }));

    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Replace" }));

    await waitFor(async () => expect(await loadWorkoutRows()).toEqual(rowsB));
    expect(await loadExperiments()).toEqual(newExperiments);
    expect(await loadTags()).toEqual(tags);
  });
});

describe("backup export", () => {
  const createObjectURL = vi.fn(() => "blob:mock");
  const revokeObjectURL = vi.fn();
  let click: ReturnType<typeof vi.spyOn>;
  let names: string[];

  beforeEach(() => {
    names = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
  });
  afterEach(() => {
    click.mockRestore();
    vi.unstubAllGlobals();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("downloads a file that reads back as the same data, named for today", { timeout: 15000 }, async () => {
    await saveWorkoutRows(rowsA);
    await saveBodyCompRows(scans);
    await saveExperiments(experiments);
    await saveTags(tags);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Export" }));

    expect(names).toEqual([backupFilename(new Date())]);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    const read = await readBackup(await blob.text());
    expect(read.status === "ok" && read.datasets).toEqual({ workout: rowsA, bodyComp: scans, experiments, tags });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
