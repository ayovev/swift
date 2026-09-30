/**
 * The backup file: one JSON document holding the athlete's own datasets, so a
 * cleared browser or a new computer doesn't mean starting over. Pure — no
 * React, no storage, no DOM. Parsing here only checks the envelope; each
 * dataset is validated afterwards by the same validators sync uses
 * (planTransfer.ts), so the two can't drift on what a valid row is.
 *
 * Which datasets: exactly the four sync carries, and only the athlete's data
 * (never theme, grouping or date range). `BackupDatasets` is keyed by
 * `SyncDataset`, so adding a fifth persisted dataset fails to compile here
 * until backup is updated, the same rule sync already has.
 *
 * Encryption is not built, but the format leaves room for it: `encoding`
 * says how the body is stored. Only "plain" exists today; an encrypted
 * encoding would replace `datasets` with ciphertext of the same JSON, so
 * everything after the envelope is shared. `readBackup` is async, and its
 * result already has a `needs_passphrase` outcome, for that reason: the UI
 * won't need re-plumbing when Web Crypto arrives.
 */
import type { SyncDataset } from "@/lib/sync/chunking";

export const BACKUP_FORMAT = "swift-backup";
export const BACKUP_VERSION = 1;

/** Each key holds the raw array sync would put on the wire for that dataset. */
export type BackupDatasets = Partial<Record<SyncDataset, unknown[]>>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  encoding: "plain";
  datasets: BackupDatasets;
}

export type ReadBackupResult =
  | { status: "ok"; datasets: BackupDatasets; exportedAt: string }
  | { status: "invalid"; reason: string }
  | { status: "needs_passphrase" };

/**
 * An empty dataset is omitted rather than written as `[]`: a backup then
 * never tells an import to clear something, it only ever replaces.
 */
export function serializeBackup(datasets: BackupDatasets, exportedAt: Date): string {
  const kept: BackupDatasets = {};
  for (const key of Object.keys(datasets) as SyncDataset[]) {
    const list = datasets[key];
    if (list && list.length > 0) kept[key] = list;
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    encoding: "plain",
    datasets: kept,
  };
  return JSON.stringify(file, null, 2);
}

const DATASET_KEYS: Record<SyncDataset, true> = { workout: true, bodyComp: true, experiments: true, tags: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const NEWER_VERSION = "That backup was made by a newer version of Swift. Refresh this page and try again.";

export async function readBackup(text: string): Promise<ReadBackupResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "invalid", reason: "That file isn't valid JSON." };
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { status: "invalid", reason: "That file isn't a Swift backup." };
  }
  if (typeof parsed.version !== "number" || !Number.isInteger(parsed.version) || parsed.version < 1) {
    return { status: "invalid", reason: "That backup has no readable version." };
  }
  if (parsed.version > BACKUP_VERSION) return { status: "invalid", reason: NEWER_VERSION };
  if (parsed.encoding !== "plain") return { status: "invalid", reason: NEWER_VERSION };

  const raw = parsed.datasets;
  if (!isRecord(raw)) return { status: "invalid", reason: "That backup has no datasets." };

  const datasets: BackupDatasets = {};
  for (const key of Object.keys(raw)) {
    // A dataset this build doesn't know is ignored, not fatal: nothing reads it.
    if (!(key in DATASET_KEYS)) continue;
    const list = raw[key];
    if (!Array.isArray(list)) {
      return { status: "invalid", reason: `The ${key} section of that backup isn't a list.` };
    }
    datasets[key as SyncDataset] = list;
  }
  if (!datasets.workout || datasets.workout.length === 0) {
    return { status: "invalid", reason: "That backup has no workout log." };
  }
  const exportedAt = typeof parsed.exportedAt === "string" ? parsed.exportedAt : "";
  return { status: "ok", datasets, exportedAt };
}

/** `swift-backup-2026-09-30.json`, in the athlete's local day. */
export function backupFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `swift-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
