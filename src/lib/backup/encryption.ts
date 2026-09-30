/**
 * The cryptography behind an encrypted backup. Pure: Web Crypto only, no
 * React, no storage, no dependency. `backup.ts` owns the file envelope; this
 * file turns a string and a passphrase into ciphertext and back.
 *
 * Key derivation is PBKDF2-HMAC-SHA-256 into an AES-256-GCM key. PBKDF2 is
 * chosen because it is native to Web Crypto: no library to ship or to be
 * abandoned before a backup is opened years from now, and the browser runs it
 * natively. Its weakness is that it needs almost no memory, so GPUs guess
 * faster against it than against a memory-hard KDF (scrypt, Argon2id); the
 * passphrase length floor in `passphrase.ts` is what makes up for that. The
 * KDF is named in the file (`kdf.name`), so moving to Argon2id later is a new
 * encoding, and PBKDF2 backups must stay readable forever.
 *
 * GCM authenticates the ciphertext and the additional data, and cannot tell a
 * wrong passphrase from a damaged or tampered file. Both come back as
 * `wrong_passphrase`, and the UI says so.
 */
import { normalizePassphrase } from "./passphrase";

/**
 * PBKDF2 work factor. 600,000 is OWASP's current minimum for PBKDF2-HMAC-SHA-256.
 * It is stored in each file, so raising it later never breaks an older backup.
 * Tunable: measure derive time on a mid-range phone before raising it (about
 * half a second on a laptop today).
 */
export const KDF_ITERATIONS = 600_000;

/** A stored iteration count above this is refused, so a crafted file can't hang the tab. */
export const MAX_KDF_ITERATIONS = 10_000_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedPayload {
  kdf: { name: "pbkdf2-sha256"; iterations: number; salt: string };
  iv: string;
  ciphertext: string;
}

export type DecryptResult =
  | { status: "ok"; plaintext: string }
  | { status: "wrong_passphrase" }
  | { status: "invalid"; reason: string };

/** Whether this browser can encrypt and decrypt (Web Crypto needs a secure context). */
export function cryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle?.importKey === "function";
}

export function toBase64(bytes: Uint8Array): string {
  // Chunked: spreading a ~600 KB array into fromCharCode overflows the stack.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** `aad` is authenticated but not encrypted: it binds the ciphertext to its file header. */
export async function encryptText(
  plaintext: string,
  passphrase: string,
  aad: string,
  options: { iterations?: number } = {}
): Promise<EncryptedPayload> {
  const iterations = options.iterations ?? KDF_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    kdf: { name: "pbkdf2-sha256", iterations, salt: toBase64(salt) },
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

const DAMAGED = "That backup's encryption details are damaged.";

export async function decryptText(payload: EncryptedPayload, passphrase: string, aad: string): Promise<DecryptResult> {
  const { kdf } = payload;
  if (!Number.isInteger(kdf.iterations) || kdf.iterations < 1 || kdf.iterations > MAX_KDF_ITERATIONS) {
    return { status: "invalid", reason: DAMAGED };
  }
  const salt = fromBase64(kdf.salt);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  if (!salt || !iv || !ciphertext || iv.length !== IV_BYTES) return { status: "invalid", reason: DAMAGED };

  try {
    const key = await deriveKey(passphrase, salt, kdf.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      ciphertext
    );
    return { status: "ok", plaintext: new TextDecoder().decode(plain) };
  } catch {
    return { status: "wrong_passphrase" };
  }
}
