import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { readBackup, serializeEncryptedBackup } from "@/lib/backup/backup";
import { idbClearAll } from "@/lib/storage/idbStore";
import { loadTags, saveTags } from "@/lib/storage/tagsStorage";
import { loadWorkoutRows, saveWorkoutRows } from "@/lib/storage/workoutStorage";
import type { ContextTag } from "@/types/tag";
import { workoutRow } from "./fixtures/rows";

const posthog = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/posthog", async (orig) => ({ ...(await orig<typeof import("@/lib/posthog")>()), capture: posthog.capture }));

const rowsA = [workoutRow({ date: "03/05/2024", title: "FRAN" }), workoutRow({ date: "03/06/2024", title: "GRACE" })];
const rowsB = [workoutRow({ date: "01/02/2025", title: "CINDY" })];
const tags: ContextTag[] = [{ id: "t1", type: "cut", label: "Spring cut", startDate: "2024-03-01", endDate: null }];
const PASS = "correct horse battery";
const now = new Date("2026-09-30T12:00:00Z");

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

const encryptedFile = async (datasets: Parameters<typeof serializeEncryptedBackup>[0], pass = PASS) =>
  new File([await serializeEncryptedBackup(datasets, now, pass, { iterations: 1000 })], "backup.json", {
    type: "application/json",
  });

function pickBackup(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]');
  if (!input) throw new Error("no backup input");
  fireEvent.change(input, { target: { files: [file] } });
}

async function pickWhenReady(file: File) {
  await waitFor(() => expect(screen.getByRole("button", { name: /restore from a backup/i })).toBeEnabled());
  pickBackup(file);
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => posthog.capture.mockClear());
afterEach(async () => {
  await idbClearAll();
});

describe("restoring an encrypted backup", () => {
  it("asks for the passphrase, keeps the prompt open on a wrong one, then restores on the right one", { timeout: 20000 }, async () => {
    renderApp();
    await pickWhenReady(await encryptedFile({ workout: rowsA, tags }));

    const dialog = await screen.findByRole("dialog", { name: /this backup is encrypted/i });
    // Nothing is written while it is locked.
    expect(await loadWorkoutRows()).toBeUndefined();

    type("Passphrase", "not the passphrase");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/didn't work, or the file is damaged/i);
    expect(screen.getByRole("dialog", { name: /this backup is encrypted/i })).toBeInTheDocument();
    expect(await loadWorkoutRows()).toBeUndefined();

    type("Passphrase", PASS);
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await screen.findByRole("button", { name: "Settings" }, { timeout: 5000 });
    await waitFor(async () => {
      expect(await loadWorkoutRows()).toEqual(rowsA);
      expect(await loadTags()).toEqual(tags);
    });
  });

  it("restores nothing when the prompt is cancelled", { timeout: 15000 }, async () => {
    renderApp();
    await pickWhenReady(await encryptedFile({ workout: rowsA }));
    const dialog = await screen.findByRole("dialog", { name: /this backup is encrypted/i });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent("Nothing was restored.");
    expect(await loadWorkoutRows()).toBeUndefined();
  });

  it("takes an encrypted backup dropped on the upload area the same way", { timeout: 20000 }, async () => {
    renderApp();
    const dropzone = await screen.findByRole("button", { name: /upload your sugarwod csv export/i });
    await waitFor(() => expect(screen.getByRole("button", { name: /restore from a backup/i })).toBeEnabled());
    fireEvent.drop(dropzone, { dataTransfer: { files: [await encryptedFile({ workout: rowsA })] } });
    await screen.findByRole("dialog", { name: /this backup is encrypted/i });
    type("Passphrase", PASS);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await screen.findByRole("button", { name: "Settings" }, { timeout: 5000 });
  });

  it("asks for the passphrase before the overwrite confirmation when data already exists", { timeout: 20000 }, async () => {
    await saveWorkoutRows(rowsA);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await screen.findByRole("dialog", { name: "Settings" });
    pickBackup(await encryptedFile({ workout: rowsB }));

    await screen.findByRole("dialog", { name: /this backup is encrypted/i });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    type("Passphrase", PASS);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/workout log: 2 entries now, 1 in the backup/i)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Replace" }));
    await waitFor(async () => expect(await loadWorkoutRows()).toEqual(rowsB));
  });

  it("shows and hides the passphrase from the toggle inside the field", { timeout: 15000 }, async () => {
    renderApp();
    await pickWhenReady(await encryptedFile({ workout: rowsA }));
    await screen.findByRole("dialog", { name: /this backup is encrypted/i });
    const input = screen.getByLabelText("Passphrase");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show passphrase" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide passphrase" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("downloading an encrypted backup", () => {
  const createObjectURL = vi.fn(() => "blob:mock");
  const revokeObjectURL = vi.fn();
  let click: ReturnType<typeof vi.spyOn>;
  let downloaded: string[];

  beforeEach(() => {
    downloaded = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push(this.download);
    });
  });
  afterEach(() => {
    click.mockRestore();
    vi.unstubAllGlobals();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  async function openBackupSection() {
    await saveWorkoutRows(rowsA);
    await saveTags(tags);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await screen.findByRole("dialog", { name: "Settings" });
    return screen.getByRole("region", { name: "Backup" });
  }

  it("is off by default, and a plain download is still one click", { timeout: 15000 }, async () => {
    const backup = await openBackupSection();
    expect(within(backup).getByRole("checkbox", { name: /protect with a passphrase/i })).not.toBeChecked();
    expect(within(backup).queryByLabelText("Passphrase")).not.toBeInTheDocument();
    fireEvent.click(within(backup).getByRole("button", { name: "Download" }));
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(JSON.parse(await blob.text())).toMatchObject({ encoding: "plain" });
  });

  it("won't download until the passphrase is long enough and matches", { timeout: 15000 }, async () => {
    const backup = await openBackupSection();
    fireEvent.click(within(backup).getByRole("checkbox", { name: /protect with a passphrase/i }));
    const download = within(backup).getByRole("button", { name: "Download" });
    expect(download).toBeDisabled();

    type("Passphrase", "short");
    expect(within(backup).getByRole("alert")).toHaveTextContent("Use at least 8 characters.");
    expect(within(backup).getByText(/too short/i)).toBeInTheDocument();
    expect(download).toBeDisabled();

    type("Passphrase", PASS);
    type("Confirm passphrase", "correct horse battery!");
    expect(within(backup).getByRole("alert")).toHaveTextContent("The two passphrases don't match.");
    expect(download).toBeDisabled();

    type("Confirm passphrase", PASS);
    expect(within(backup).getByText(/strong/i)).toBeInTheDocument();
    expect(download).toBeEnabled();
  });

  it("downloads a file that is encrypted, opens only with the passphrase, and clears the form", { timeout: 20000 }, async () => {
    const backup = await openBackupSection();
    fireEvent.click(within(backup).getByRole("checkbox", { name: /protect with a passphrase/i }));
    type("Passphrase", PASS);
    type("Confirm passphrase", PASS);
    fireEvent.click(within(backup).getByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloaded).toHaveLength(1));
    const text = await (createObjectURL.mock.calls[0] as unknown as [Blob])[0].text();
    expect(JSON.parse(text)).toMatchObject({ encoding: "aes-256-gcm", kdf: { name: "pbkdf2-sha256" } });
    expect(text).not.toMatch(/FRAN|GRACE|Spring cut/);
    expect(text).not.toContain(PASS);
    expect(await readBackup(text)).toEqual({ status: "needs_passphrase" });
    const read = await readBackup(text, { passphrase: PASS });
    expect(read.status === "ok" && read.datasets).toEqual({ workout: rowsA, tags });

    // Cleared once the file is saved.
    await waitFor(() => expect(within(backup).getByLabelText("Passphrase")).toHaveValue(""));
    expect(within(backup).getByLabelText("Confirm passphrase")).toHaveValue("");
  });

  it("toggles each field's visibility on its own", { timeout: 15000 }, async () => {
    const backup = await openBackupSection();
    fireEvent.click(within(backup).getByRole("checkbox", { name: /protect with a passphrase/i }));
    fireEvent.click(within(backup).getByRole("button", { name: "Show passphrase" }));
    expect(within(backup).getByLabelText("Passphrase")).toHaveAttribute("type", "text");
    expect(within(backup).getByLabelText("Confirm passphrase")).toHaveAttribute("type", "password");
  });

  it("forgets what was typed when the box is unticked", { timeout: 15000 }, async () => {
    const backup = await openBackupSection();
    const box = within(backup).getByRole("checkbox", { name: /protect with a passphrase/i });
    fireEvent.click(box);
    type("Passphrase", PASS);
    fireEvent.click(box);
    fireEvent.click(box);
    expect(within(backup).getByLabelText("Passphrase")).toHaveValue("");
  });

  it("keeps the passphrase and whether a backup was encrypted out of analytics", { timeout: 20000 }, async () => {
    const backup = await openBackupSection();
    fireEvent.click(within(backup).getByRole("checkbox", { name: /protect with a passphrase/i }));
    type("Passphrase", PASS);
    type("Confirm passphrase", PASS);
    fireEvent.click(within(backup).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(downloaded).toHaveLength(1));
    const payloads = JSON.stringify(posthog.capture.mock.calls);
    expect(posthog.capture).toHaveBeenCalledWith({ name: "interaction_used", props: { interaction: "backup_exported" } });
    expect(payloads).not.toContain(PASS);
    expect(payloads).not.toMatch(/encrypt|aes|passphrase/i);
  });
});
