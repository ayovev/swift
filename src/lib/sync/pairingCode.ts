/**
 * Encodes/decodes an `RTCSessionDescriptionInit` (an offer or answer) as the
 * text payload carried in a pairing QR code — the entire "signaling channel"
 * in this feature's zero-server design (see webrtcTransport.ts's header
 * comment). Pure string/JSON logic only; no `RTCPeerConnection` or other DOM
 * APIs appear here, so it's testable without a real WebRTC stack.
 *
 * The payload carries a version field so a future format change fails
 * loudly — a stale QR scanned by a newer build, or vice versa — instead of
 * silently misparsing.
 *
 * QR codes have a practical size ceiling: past a few KB, a code stops
 * scanning reliably at arm's length. A full ICE candidate list (every host
 * and server-reflexive/relay candidate a browser gathers) can push an SDP
 * well past that, so once the encoded payload exceeds `MAX_QR_PAYLOAD_BYTES`
 * it's re-encoded with `trimCandidates`, which keeps every "host" candidate
 * (same device/network — cheapest to connect over) plus the first "srflx"
 * (STUN-discovered public address) candidate, and drops the rest — including
 * any "relay" (TURN) candidates, which this feature never uses (see
 * webrtcTransport.ts: no TURN fallback is offered, on purpose).
 */

export const PAIRING_PAYLOAD_VERSION = 1;

export const MAX_QR_PAYLOAD_BYTES = 2000;

export class PairingCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingCodeError";
  }
}

interface PairingPayload {
  v: number;
  type: "offer" | "answer";
  sdp: string;
}

export function encodePairingPayload(description: RTCSessionDescriptionInit): string {
  if (description.type !== "offer" && description.type !== "answer") {
    throw new PairingCodeError("Only an offer or answer can be turned into a pairing code.");
  }

  const payload: PairingPayload = {
    v: PAIRING_PAYLOAD_VERSION,
    type: description.type,
    sdp: description.sdp ?? "",
  };
  const encoded = toBase64(JSON.stringify(payload));
  if (byteLength(encoded) <= MAX_QR_PAYLOAD_BYTES) {
    return encoded;
  }

  return toBase64(JSON.stringify({ ...payload, sdp: trimCandidates(payload.sdp) }));
}

export function decodePairingPayload(text: string): RTCSessionDescriptionInit {
  let json: string;
  try {
    json = fromBase64(text);
  } catch {
    throw new PairingCodeError("That doesn't look like a Swift pairing code.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PairingCodeError("That doesn't look like a Swift pairing code.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new PairingCodeError("That doesn't look like a Swift pairing code.");
  }

  const { v, type, sdp } = parsed as Record<string, unknown>;

  if (v !== PAIRING_PAYLOAD_VERSION) {
    throw new PairingCodeError("This pairing code was made by a different version of Swift.");
  }
  if (type !== "offer" && type !== "answer") {
    throw new PairingCodeError("That doesn't look like a Swift pairing code.");
  }
  if (typeof sdp !== "string" || sdp.length === 0) {
    throw new PairingCodeError("That doesn't look like a Swift pairing code.");
  }

  return { type, sdp };
}

function trimCandidates(sdp: string): string {
  let keptReflexive = false;
  return sdp
    .split("\r\n")
    .filter((line) => {
      if (!line.startsWith("a=candidate:")) {
        return true;
      }
      if (line.includes(" typ host ")) {
        return true;
      }
      if (line.includes(" typ srflx ") && !keptReflexive) {
        keptReflexive = true;
        return true;
      }
      return false;
    })
    .join("\r\n");
}

function toBase64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
