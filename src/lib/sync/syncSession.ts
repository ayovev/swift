/**
 * The pairing/transfer state machine for cross-device sync (issue #15).
 * Moves one host's dataset set (workout, optionally + body comp) to a
 * joiner device over a `SyncTransport` (see syncTransport.ts), with the SDP
 * handshake driven by scanned/displayed QR codes rather than a signaling
 * server (see pairingCode.ts). This module never constructs an
 * `RTCPeerConnection` itself — it depends on an injected
 * `PeerConnectionFactory` (see peerConnection.ts) — so it's fully
 * unit-testable with a fake connection/transport pair
 * (tests/fixtures/fakePeerConnection.ts) and carries no WebRTC or QR-library
 * imports of its own.
 *
 * Wire protocol, once the transport is open: the host sends one small
 * manifest message naming the datasets it's about to send, then for each
 * dataset in order, a chunkPayload() header followed by its chunks (see
 * chunking.ts). The joiner reads the manifest first, then feeds every
 * subsequent message into a fresh `Reassembler` per dataset until each
 * reports done. Real `RTCDataChannel`s (and the fake transport used in
 * tests) preserve message boundaries, so "one transport message = one
 * framing unit" holds without extra bookkeeping.
 */

import { Reassembler, SyncFramingError, chunkPayload, type SyncDataset } from "./chunking";
import { PairingCodeError, decodePairingPayload, encodePairingPayload } from "./pairingCode";
import {
  IceGatheringTimeoutError,
  WebrtcUnsupportedError,
  type PeerConnection,
  type PeerConnectionFactory,
} from "./peerConnection";
import type { SyncTransport } from "./syncTransport";

// Stays comfortably under the ~16KB cross-browser RTCDataChannel message cap.
const MAX_CHUNK_BYTES = 15000;

/**
 * Closed vocabulary shared with `posthog.ts`'s `sync_failed` event. Only
 * "invalid_qr" and "connection_dropped" are ever set by this state machine
 * directly; "camera_denied", "declined_overwrite" and "unsupported_browser"
 * are set by the UI layer (camera access, the conflict prompt, and
 * `webrtcTransport.ts`'s feature-detection respectively) but share this
 * type since they're the same closed set for analytics purposes.
 */
export type SyncFailureReason =
  | "ice_timeout"
  | "camera_denied"
  | "invalid_qr"
  | "connection_dropped"
  | "declined_overwrite"
  | "unsupported_browser"
  | "invalid_data";

export interface OutgoingDataset {
  dataset: SyncDataset;
  json: string;
}

export type SyncSessionState =
  | { status: "idle" }
  | { status: "generating-offer" }
  | { status: "awaiting-answer"; offerCode: string }
  | { status: "generating-answer" }
  | { status: "awaiting-connection"; answerCode: string }
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "transferring"; dataset: SyncDataset; receivedBytes: number; totalBytes: number }
  | { status: "done" }
  | { status: "failed"; reason: SyncFailureReason };

export interface SyncSessionCallbacks {
  onStateChange?: (state: SyncSessionState) => void;
  onDatasetReceived?: (dataset: SyncDataset, json: string) => void;
}

interface Manifest {
  v: number;
  datasets: SyncDataset[];
}

const MANIFEST_VERSION = 1;

export class SyncSession {
  #factory: PeerConnectionFactory;
  #callbacks: SyncSessionCallbacks;
  #state: SyncSessionState = { status: "idle" };
  #connection: PeerConnection | undefined;
  #transport: SyncTransport | undefined;

  constructor(factory: PeerConnectionFactory, callbacks: SyncSessionCallbacks = {}) {
    this.#factory = factory;
    this.#callbacks = callbacks;
  }

  getState(): SyncSessionState {
    return this.#state;
  }

  /** Host role: generate an offer and show it (via the returned state's `offerCode`) as a QR. */
  async startHost(outgoing: OutgoingDataset[]): Promise<void> {
    if (this.#state.status !== "idle") {
      throw new Error("startHost can only be called from idle.");
    }
    this.#setState({ status: "generating-offer" });

    const connection = this.#factory.createHost();
    this.#connection = connection;

    let offer: RTCSessionDescriptionInit;
    try {
      offer = await connection.localDescriptionReady;
    } catch (err) {
      this.#fail(classifyConnectionError(err));
      return;
    }
    this.#setState({ status: "awaiting-answer", offerCode: encodePairingPayload(offer) });

    void this.#awaitTransportThenSend(connection, outgoing);
  }

  /** Host role: apply the joiner's scanned answer QR. */
  async submitAnswer(answerCode: string): Promise<void> {
    const connection = this.#connection;
    if (!connection || this.#state.status !== "awaiting-answer") {
      throw new Error("submitAnswer can only be called while awaiting an answer.");
    }

    let answer: RTCSessionDescriptionInit;
    try {
      answer = decodePairingPayload(answerCode);
    } catch (err) {
      if (err instanceof PairingCodeError) {
        this.#fail("invalid_qr");
        return;
      }
      throw err;
    }

    this.#setState({ status: "connecting" });
    try {
      await connection.setRemoteDescription(answer);
    } catch (err) {
      this.#fail(classifyConnectionError(err));
    }
  }

  /** Joiner role: apply the host's scanned offer QR and generate an answer to show as a QR. */
  async startJoiner(offerCode: string): Promise<void> {
    if (this.#state.status !== "idle") {
      throw new Error("startJoiner can only be called from idle.");
    }

    let offer: RTCSessionDescriptionInit;
    try {
      offer = decodePairingPayload(offerCode);
    } catch (err) {
      if (err instanceof PairingCodeError) {
        this.#fail("invalid_qr");
        return;
      }
      throw err;
    }

    this.#setState({ status: "generating-answer" });
    const connection = this.#factory.createJoiner();
    this.#connection = connection;

    let answer: RTCSessionDescriptionInit;
    try {
      await connection.setRemoteDescription(offer);
      answer = await connection.localDescriptionReady;
    } catch (err) {
      this.#fail(classifyConnectionError(err));
      return;
    }
    this.#setState({ status: "awaiting-connection", answerCode: encodePairingPayload(answer) });

    void this.#awaitTransportThenReceive(connection);
  }

  close(): void {
    this.#connection?.close();
    this.#transport?.close();
  }

  async #awaitTransportThenSend(connection: PeerConnection, outgoing: OutgoingDataset[]): Promise<void> {
    let transport: SyncTransport;
    try {
      transport = await connection.transport;
    } catch {
      this.#fail("connection_dropped");
      return;
    }
    this.#transport = transport;
    this.#setState({ status: "connected" });

    // Set once the peer disconnects. Checked before every chunk send so a
    // mid-transfer drop is reported rather than left to throw out of
    // `transport.send()`. The host's own eventual `transport.close()` below
    // also flips this, but only after the send loop has already finished.
    let peerDisconnected = false;
    transport.onClose(() => {
      peerDisconnected = true;
    });

    const manifest: Manifest = { v: MANIFEST_VERSION, datasets: outgoing.map((entry) => entry.dataset) };
    transport.send(new TextEncoder().encode(JSON.stringify(manifest)));

    for (const { dataset, json } of outgoing) {
      const payload = chunkPayload(dataset, json, MAX_CHUNK_BYTES);
      this.#setState({ status: "transferring", dataset, receivedBytes: 0, totalBytes: payload.header.byteLength });
      transport.send(payload.headerBytes);

      for (const chunk of payload.chunks) {
        if (peerDisconnected) {
          this.#fail("connection_dropped");
          return;
        }
        transport.send(chunk);
        // Yield so a peer disconnection (or any other pending microtask) is
        // observed between chunks instead of blasting the whole dataset in
        // one synchronous burst.
        await Promise.resolve();
      }
    }

    transport.close();
    this.#setState({ status: "done" });
  }

  async #awaitTransportThenReceive(connection: PeerConnection): Promise<void> {
    let transport: SyncTransport;
    try {
      transport = await connection.transport;
    } catch {
      this.#fail("connection_dropped");
      return;
    }
    this.#transport = transport;
    this.#setState({ status: "connected" });

    let remaining: SyncDataset[] = [];
    let haveManifest = false;
    let reassembler: Reassembler | undefined;

    transport.onClose(() => {
      // A close after every dataset was received is the expected end of a
      // successful transfer (the host closes once it's done sending); the
      // `#fail` guard below no-ops once state is already "done".
      this.#fail("connection_dropped");
    });

    transport.onMessage((bytes) => {
      if (!haveManifest) {
        let manifest: Manifest;
        try {
          manifest = decodeManifest(bytes);
        } catch {
          this.#fail("connection_dropped");
          return;
        }
        haveManifest = true;
        remaining = [...manifest.datasets];
        if (remaining.length === 0) {
          this.#setState({ status: "done" });
        }
        return;
      }

      if (!reassembler) {
        reassembler = new Reassembler();
      }

      let result: ReturnType<Reassembler["feed"]>;
      try {
        result = reassembler.feed(bytes);
      } catch (err) {
        if (err instanceof SyncFramingError) {
          this.#fail("connection_dropped");
          return;
        }
        throw err;
      }

      // Safe: feed()'s first call always decodes and sets the header (or
      // throws), so by the time a result comes back, header is set.
      const header = reassembler.header!;

      if (!result.done) {
        this.#setState({
          status: "transferring",
          dataset: header.dataset,
          receivedBytes: reassembler.receivedBytes,
          totalBytes: header.byteLength,
        });
        return;
      }

      // One last progress update at 100% before moving on — reassembler.feed()
      // only returns `done` once every declared byte has arrived, so
      // receivedBytes and byteLength are already equal here.
      this.#setState({
        status: "transferring",
        dataset: header.dataset,
        receivedBytes: reassembler.receivedBytes,
        totalBytes: header.byteLength,
      });

      this.#callbacks.onDatasetReceived?.(result.dataset, result.json);
      remaining = remaining.slice(1);
      reassembler = undefined;

      if (remaining.length === 0) {
        this.#setState({ status: "done" });
      }
    });
  }

  #setState(state: SyncSessionState): void {
    this.#state = state;
    this.#callbacks.onStateChange?.(state);
  }

  #fail(reason: SyncFailureReason): void {
    if (this.#state.status === "failed" || this.#state.status === "done") return;
    this.#setState({ status: "failed", reason });
  }
}

function decodeManifest(bytes: Uint8Array): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Manifest is not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Manifest is not a JSON object.");
  }

  const { v, datasets } = parsed as Record<string, unknown>;
  if (v !== MANIFEST_VERSION || !Array.isArray(datasets)) {
    throw new Error("Manifest is malformed.");
  }

  return { v, datasets: datasets as SyncDataset[] };
}

function classifyConnectionError(err: unknown): SyncFailureReason {
  if (err instanceof IceGatheringTimeoutError) return "ice_timeout";
  if (err instanceof WebrtcUnsupportedError) return "unsupported_browser";
  return "connection_dropped";
}
