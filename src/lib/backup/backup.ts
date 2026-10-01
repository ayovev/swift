/**
 * The backup file: one JSON document holding the athlete's own datasets, so a
 * cleared browser or a new computer doesn't mean starting over. Pure — no
 * React, no storage, no DOM. Parsing here only checks the envelope; each
 * dataset is validated afterwards by the same validators sync uses
 * (planTransfer.ts), so the two can't drift on what a valid row is.
 *
 * Which datasets: the ones sync carries, and only the athlete's data (never
 * theme, grouping or date range). `BackupDatasets` is keyed by `SyncDataset`,
 * so adding a new persisted dataset fails to compile here until backup is
 * updated, the same rule sync already has. A backup is written with the
 * workout log, InBody history and tags (an experiment is a tag of type
 * "experiment"); a file made before that has an `experiments` section, which
 * is still read and is folded into the tags on restore (receivedDatasets.ts).
 *
 * Encryption is optional. `encoding` says how the body is stored: "plain"
 * keeps `datasets` readable, "aes-256-gcm" replaces it with ciphertext of the
 * same JSON (see encryption.ts), so everything after the envelope (validation,
 * planTransfer) is shared. `readBackup` is async and returns `needs_passphrase`
 * for an encrypted file given none, `wrong_passphrase` when it can't be opened.
 * The passphrase is an argument and nothing more: never stored, never logged.
 */
import type { SyncDataset } from "@/lib/sync/chunking";
import { cryptoAvailable, decryptText, encryptText, type EncryptedPayload } from "./encryption";

export const BACKUP_FORMAT = "swift-backup";
export const BACKUP_VERSION = 1;

/** Each key holds the raw array sync would put on the wire for that dataset. */
export type BackupDatasets = Partial<Record<SyncDataset, unknown[]>>;

interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
}

export interface PlainBackupFile extends BackupEnvelope {
  encoding: "plain";
  datasets: BackupDatasets;
}

export interface EncryptedBackupFile extends BackupEnvelope, EncryptedPayload {
  encoding: typeof ENCRYPTED_ENCODING;
}

export type BackupFile = PlainBackupFile | EncryptedBackupFile;

export const ENCRYPTED_ENCODING = "aes-256-gcm";

export type ReadBackupResult =
  | { status: "ok"; datasets: BackupDatasets; exportedAt: string }
  | { status: "invalid"; reason: string }
  | { status: "needs_passphrase" }
  | { status: "wrong_passphrase" };

/** Authenticated with the ciphertext, so it can't be replayed under another header. */
const backupAad = (version: number, encoding: string) => `${BACKUP_FORMAT}:${version}:${encoding}`;

/**
 * An empty dataset is omitted rather than written as `[]`: a backup then
 * never tells a restore to clear something, it only ever replaces.
 */
function keepNonEmpty(datasets: BackupDatasets): BackupDatasets {
  const kept: BackupDatasets = {};
  for (const key of Object.keys(datasets) as SyncDataset[]) {
    const list = datasets[key];
    if (list && list.length > 0) kept[key] = list;
  }
  return kept;
}

export function serializeBackup(datasets: BackupDatasets, exportedAt: Date): string {
  const file: PlainBackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    encoding: "plain",
    datasets: keepNonEmpty(datasets),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Same content as `serializeBackup`, encrypted under `passphrase`. What stays
 * readable in the file: format, version, export time, the KDF parameters and
 * the approximate size. `options.iterations` exists so tests can run fast.
 */
export async function serializeEncryptedBackup(
  datasets: BackupDatasets,
  exportedAt: Date,
  passphrase: string,
  options: { iterations?: number } = {}
): Promise<string> {
  const payload = await encryptText(
    JSON.stringify(keepNonEmpty(datasets)),
    passphrase,
    backupAad(BACKUP_VERSION, ENCRYPTED_ENCODING),
    options
  );
  const file: EncryptedBackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    encoding: ENCRYPTED_ENCODING,
    ...payload,
  };
  return JSON.stringify(file, null, 2);
}

const DATASET_KEYS: Record<SyncDataset, true> = { workout: true, bodyComp: true, experiments: true, tags: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const NEWER_VERSION = "That backup was made by a newer version of Swift. Refresh this page and try again.";

const isString = (value: unknown): value is string => typeof value === "string";

/** The encrypted envelope's own fields, or null when any is missing or the wrong kind. */
function encryptedPayload(parsed: Record<string, unknown>): EncryptedPayload | null {
  const { kdf, iv, ciphertext } = parsed;
  if (!isRecord(kdf) || kdf.name !== "pbkdf2-sha256") return null;
  if (typeof kdf.iterations !== "number" || !isString(kdf.salt) || !isString(iv) || !isString(ciphertext)) return null;
  return { kdf: { name: "pbkdf2-sha256", iterations: kdf.iterations, salt: kdf.salt }, iv, ciphertext };
}

export async function readBackup(text: string, options: { passphrase?: string } = {}): Promise<ReadBackupResult> {
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

  let raw: unknown;
  if (parsed.encoding === "plain") {
    raw = parsed.datasets;
  } else if (parsed.encoding === ENCRYPTED_ENCODING) {
    const payload = encryptedPayload(parsed);
    if (!payload) return { status: "invalid", reason: "That backup's encryption details are damaged." };
    if (options.passphrase === undefined) return { status: "needs_passphrase" };
    if (!cryptoAvailable()) {
      return { status: "invalid", reason: "This browser can't open encrypted backups. Try another browser." };
    }
    const opened = await decryptText(payload, options.passphrase, backupAad(parsed.version, ENCRYPTED_ENCODING));
    if (opened.status !== "ok") return opened;
    try {
      raw = JSON.parse(opened.plaintext);
    } catch {
      return { status: "invalid", reason: "That backup opened but its contents are damaged." };
    }
  } else {
    return { status: "invalid", reason: NEWER_VERSION };
  }

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

/**
 * Whether a chosen, dropped or pasted file is meant as a backup rather than a
 * SugarWOD CSV. Judged by name and type only: the file is read, and rejected
 * with a reason if it isn't really a backup, by `readBackup`.
 */
export function looksLikeBackup(file: { name: string; type: string }): boolean {
  return file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
}

/** `swift-backup-2026-09-30.json`, in the athlete's local day. */
export function backupFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `swift-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
