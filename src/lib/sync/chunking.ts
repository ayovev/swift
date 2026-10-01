/**
 * Wire framing for cross-device sync (see App.tsx's sync entry points and
 * syncSession.ts). `RTCDataChannel` messages cap around 16KB cross-browser,
 * so a dataset's JSON is split into fixed-size binary chunks preceded by a
 * small JSON header naming the dataset, its total byte length and chunk
 * count. Pure and transport-agnostic on purpose — no WebRTC types appear
 * here — so the framing logic is unit-testable without a real connection.
 */

/**
 * `experiments` is receive-only: an experiment is a tag of type "experiment"
 * now, so nothing sends this dataset, but an older device (or an older backup
 * file) still does, and the header is accepted so it can be converted to tags
 * (receivedDatasets.ts) instead of being refused.
 */
export type SyncDataset = "workout" | "bodyComp" | "experiments" | "tags";

const SYNC_DATASETS: readonly SyncDataset[] = ["workout", "bodyComp", "experiments", "tags"];

export interface FrameHeader {
  dataset: SyncDataset;
  byteLength: number;
  chunkCount: number;
}

export interface ChunkedPayload {
  header: FrameHeader;
  /** The header, already encoded as the first message to send. */
  headerBytes: Uint8Array;
  /** The fixed-size chunks to send after the header, in order. */
  chunks: Uint8Array[];
}

export class SyncFramingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncFramingError";
  }
}

export function chunkPayload(dataset: SyncDataset, json: string, maxChunkBytes: number): ChunkedPayload {
  if (maxChunkBytes <= 0) {
    throw new RangeError("maxChunkBytes must be positive");
  }

  const bytes = new TextEncoder().encode(json);
  const chunkCount = bytes.byteLength === 0 ? 0 : Math.ceil(bytes.byteLength / maxChunkBytes);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < chunkCount; i++) {
    chunks.push(bytes.slice(i * maxChunkBytes, (i + 1) * maxChunkBytes));
  }

  const header: FrameHeader = { dataset, byteLength: bytes.byteLength, chunkCount };
  return { header, headerBytes: encodeHeader(header), chunks };
}

function encodeHeader(header: FrameHeader): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(header));
}

function decodeHeader(bytes: Uint8Array): FrameHeader {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SyncFramingError("Header is not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new SyncFramingError("Header is not a JSON object.");
  }

  const { dataset, byteLength, chunkCount } = parsed as Record<string, unknown>;

  if (typeof dataset !== "string" || !SYNC_DATASETS.includes(dataset as SyncDataset)) {
    throw new SyncFramingError(`Header names an unknown dataset: "${String(dataset)}".`);
  }
  if (typeof byteLength !== "number" || !Number.isInteger(byteLength) || byteLength < 0) {
    throw new SyncFramingError("Header has an invalid byteLength.");
  }
  if (typeof chunkCount !== "number" || !Number.isInteger(chunkCount) || chunkCount < 0) {
    throw new SyncFramingError("Header has an invalid chunkCount.");
  }

  return { dataset: dataset as SyncDataset, byteLength, chunkCount };
}

export type ReassemblyResult = { done: false } | { done: true; dataset: SyncDataset; json: string };

/**
 * Consumes one header message followed by that header's declared chunk
 * count, in order, and reassembles the original JSON string. One instance
 * handles exactly one dataset transfer — `syncSession.ts` creates a fresh
 * `Reassembler` per dataset.
 */
export class Reassembler {
  #header: FrameHeader | undefined;
  #chunks: Uint8Array[] = [];
  #receivedBytes = 0;

  /** The parsed header, once the first `feed()` call has decoded it. */
  get header(): FrameHeader | undefined {
    return this.#header;
  }

  /** Bytes received so far across all chunk `feed()` calls (excludes the header itself). */
  get receivedBytes(): number {
    return this.#receivedBytes;
  }

  feed(bytes: Uint8Array): ReassemblyResult {
    if (!this.#header) {
      this.#header = decodeHeader(bytes);
      return this.#header.chunkCount === 0
        ? { done: true, dataset: this.#header.dataset, json: "" }
        : { done: false };
    }

    this.#chunks.push(bytes);
    this.#receivedBytes += bytes.byteLength;

    if (this.#chunks.length < this.#header.chunkCount) {
      return { done: false };
    }

    if (this.#receivedBytes !== this.#header.byteLength) {
      throw new SyncFramingError(
        `Expected ${this.#header.byteLength} bytes but received ${this.#receivedBytes}.`
      );
    }

    const combined = new Uint8Array(this.#receivedBytes);
    let offset = 0;
    for (const chunk of this.#chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { done: true, dataset: this.#header.dataset, json: new TextDecoder().decode(combined) };
  }
}
