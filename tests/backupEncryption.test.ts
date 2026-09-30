import { describe, expect, it } from "vitest";
import {
  backupFilename,
  readBackup,
  serializeBackup,
  serializeEncryptedBackup,
  type EncryptedBackupFile,
} from "@/lib/backup/backup";
import { decryptText, encryptText, fromBase64, KDF_ITERATIONS, MAX_KDF_ITERATIONS, toBase64 } from "@/lib/backup/encryption";
import { loadSampleRows } from "./fixtures/sampleRows";
import { scanRow, workoutRow } from "./fixtures/rows";

const now = new Date("2026-09-30T14:05:00.000Z");
const FAST = { iterations: 1000 }; // the real work factor is exercised once, below
const PASS = "correct horse battery";
const wRow = workoutRow({ date: "03/05/2024", title: "FRAN" });
const datasets = { workout: [wRow], bodyComp: [scanRow("2026-04-01")] };

const encrypted = (over: Partial<Record<string, unknown>> = {}, pass = PASS) =>
  serializeEncryptedBackup(datasets, now, pass, FAST).then((text) => ({ ...JSON.parse(text), ...over }));

describe("encrypted backup round trip", () => {
  it("restores the real sample export under the right passphrase", async () => {
    const rows = await loadSampleRows();
    const text = await serializeEncryptedBackup({ workout: rows }, now, PASS, FAST);
    const read = await readBackup(text, { passphrase: PASS });
    expect(read).toEqual({ status: "ok", datasets: { workout: rows }, exportedAt: now.toISOString() });
  });

  it("works at the real work factor", async () => {
    const text = await serializeEncryptedBackup(datasets, now, PASS);
    expect(JSON.parse(text).kdf.iterations).toBe(KDF_ITERATIONS);
    const read = await readBackup(text, { passphrase: PASS });
    expect(read.status).toBe("ok");
  });

  it("omits empty datasets, like a plain backup", async () => {
    const text = await serializeEncryptedBackup({ workout: [wRow], tags: [], experiments: [] }, now, PASS, FAST);
    const read = await readBackup(text, { passphrase: PASS });
    expect(read.status === "ok" && Object.keys(read.datasets)).toEqual(["workout"]);
  });

  it("still restores a plain backup, with or without a passphrase in hand", async () => {
    const plain = serializeBackup(datasets, now);
    expect((await readBackup(plain)).status).toBe("ok");
    expect((await readBackup(plain, { passphrase: "ignored" })).status).toBe("ok");
  });
});

describe("what the file gives away", () => {
  it("names the format and key derivation, and nothing about the contents", async () => {
    const text = await serializeEncryptedBackup(datasets, now, PASS, FAST);
    const file = JSON.parse(text) as EncryptedBackupFile;
    expect(Object.keys(file).sort()).toEqual(["ciphertext", "encoding", "exportedAt", "format", "iv", "kdf", "version"]);
    expect(file).toMatchObject({ format: "swift-backup", version: 1, encoding: "aes-256-gcm" });
    expect(file.kdf).toMatchObject({ name: "pbkdf2-sha256", iterations: 1000 });
    expect(text).not.toMatch(/FRAN|datasets|workout|bodyComp|Weight/);
  });

  it("never contains the passphrase", async () => {
    expect(await serializeEncryptedBackup(datasets, now, PASS, FAST)).not.toContain(PASS);
  });

  it("uses a fresh salt and IV every export", async () => {
    const a = JSON.parse(await serializeEncryptedBackup(datasets, now, PASS, FAST));
    const b = JSON.parse(await serializeEncryptedBackup(datasets, now, PASS, FAST));
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe("opening an encrypted backup", () => {
  it("asks for a passphrase when none is given, without trying to read it", async () => {
    expect(await readBackup(JSON.stringify(await encrypted()))).toEqual({ status: "needs_passphrase" });
  });

  it("reports a wrong passphrase, including a different case or trailing space", async () => {
    const text = JSON.stringify(await encrypted());
    for (const wrong of ["wrong passphrase", PASS.toUpperCase(), `${PASS} `, ""]) {
      expect(await readBackup(text, { passphrase: wrong })).toEqual({ status: "wrong_passphrase" });
    }
  });

  it("derives the same key for composed and decomposed accents", async () => {
    const text = await serializeEncryptedBackup(datasets, now, "café au lait", FAST);
    expect((await readBackup(text, { passphrase: "café au lait" })).status).toBe("ok");
  });

  it("treats a changed ciphertext byte as a failed open, not a crash", async () => {
    const file = await encrypted();
    const bytes = fromBase64(file.ciphertext)!;
    const at = bytes.length >> 1;
    bytes[at] = (bytes[at] ?? 0) ^ 0xff;
    const text = JSON.stringify({ ...file, ciphertext: toBase64(bytes) });
    expect(await readBackup(text, { passphrase: PASS })).toEqual({ status: "wrong_passphrase" });
  });

  it("fails authentication when the iteration count or salt is edited", async () => {
    const file = await encrypted();
    const more = JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: file.kdf.iterations + 1 } });
    expect(await readBackup(more, { passphrase: PASS })).toEqual({ status: "wrong_passphrase" });
    const salted = JSON.stringify({ ...file, kdf: { ...file.kdf, salt: toBase64(new Uint8Array(16)) } });
    expect(await readBackup(salted, { passphrase: PASS })).toEqual({ status: "wrong_passphrase" });
  });

  it("won't open a ciphertext lifted out of a differently labelled file", async () => {
    // Same key, same ciphertext, but sealed against another header.
    const payload = await encryptText(JSON.stringify({ workout: [wRow] }), PASS, "swift-backup:1:plain", FAST);
    const text = JSON.stringify({ format: "swift-backup", version: 1, exportedAt: "", encoding: "aes-256-gcm", ...payload });
    expect(await readBackup(text, { passphrase: PASS })).toEqual({ status: "wrong_passphrase" });
  });

  it("refuses an absurd iteration count before doing any work", async () => {
    const file = await encrypted();
    const text = JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: MAX_KDF_ITERATIONS + 1 } });
    const read = await readBackup(text, { passphrase: PASS });
    expect(read).toMatchObject({ status: "invalid", reason: expect.stringMatching(/damaged/) });
  });

  it.each([
    ["a missing kdf", { kdf: undefined }, /encryption details are damaged/],
    ["an unknown kdf", { kdf: { name: "argon2id", iterations: 1, salt: "AAAA" } }, /encryption details are damaged/],
    ["a non-numeric iteration count", { kdf: { name: "pbkdf2-sha256", iterations: "1000", salt: "AAAA" } }, /damaged/],
    ["an iv that isn't base64", { iv: "***" }, /damaged/],
    ["a short iv", { iv: toBase64(new Uint8Array(4)) }, /damaged/],
    ["a ciphertext that isn't a string", { ciphertext: 7 }, /damaged/],
    ["a newer version", { version: 2 }, /newer version of Swift/],
    ["an unknown encoding", { encoding: "xchacha20" }, /newer version of Swift/],
  ])("rejects %s with a plain reason", async (_name, over, reason) => {
    const text = JSON.stringify(await encrypted(over as Record<string, unknown>));
    const read = await readBackup(text, { passphrase: PASS });
    expect(read.status).toBe("invalid");
    expect(read.status === "invalid" && read.reason).toMatch(reason);
  });

  it("rejects a backup that opens but holds no workout log", async () => {
    const payload = await encryptText(JSON.stringify({ tags: [] }), PASS, "swift-backup:1:aes-256-gcm", FAST);
    const text = JSON.stringify({ format: "swift-backup", version: 1, exportedAt: "", encoding: "aes-256-gcm", ...payload });
    expect(await readBackup(text, { passphrase: PASS })).toMatchObject({ status: "invalid", reason: /no workout log/ });
  });
});

describe("encryption primitives", () => {
  it("round-trips text and reports a wrong passphrase without throwing", async () => {
    const payload = await encryptText("hello", PASS, "aad", FAST);
    expect(await decryptText(payload, PASS, "aad")).toEqual({ status: "ok", plaintext: "hello" });
    expect(await decryptText(payload, "nope nope nope", "aad")).toEqual({ status: "wrong_passphrase" });
    expect(await decryptText(payload, PASS, "other aad")).toEqual({ status: "wrong_passphrase" });
  });

  it("base64 survives a payload far larger than one fromCharCode spread", () => {
    const big = new Uint8Array(700_000).map((_, i) => i % 251);
    expect(fromBase64(toBase64(big))).toEqual(big);
    expect(fromBase64("***")).toBeNull();
  });
});

describe("filenames are unchanged by encryption", () => {
  it("still ends in .json so the landing page routes it to restore", () => {
    expect(backupFilename(new Date(2026, 8, 3))).toBe("swift-backup-2026-09-03.json");
  });
});
