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
 * QR codes have a practical size ceiling: past roughly a kilobyte, the
 * symbol needs enough modules that a phone or laptop camera stops resolving
 * it reliably at arm's length — a real complaint, not a theoretical one
 * (a laptop with a few virtual adapters from a VPN client, Docker, or
 * Hyper-V/WSL gathers a host candidate per interface, and `MAX_QR_PAYLOAD_BYTES`
 * used to be generous enough to let all of them through, producing a QR that
 * was correct but unscannable). A full ICE candidate list (every host and
 * server-reflexive/relay candidate a browser gathers) can push an SDP well
 * past the ceiling, so once the encoded payload exceeds
 * `MAX_QR_PAYLOAD_BYTES` it's re-encoded with `trimCandidates`, which keeps
 * only the `MAX_HOST_CANDIDATES` most useful "host" candidates (same
 * device/network — cheapest to connect over) plus the first "srflx"
 * (STUN-discovered public address) candidate, and drops the rest — including
 * any "relay" (TURN) candidates, which this feature never uses (see
 * webrtcTransport.ts: no TURN fallback is offered, on purpose). Only one
 * candidate ever needs to succeed, so keeping every host candidate a
 * multi-adapter laptop happens to gather bought nothing but QR density —
 * `candidatePriority()` ranks a private IPv4 address (an actual LAN address,
 * the case this feature is built for) above an mDNS-obfuscated `.local`
 * hostname (which needs local mDNS resolution to work at all) above anything
 * else, and the cap keeps the top-ranked ones.
 */

export const PAIRING_PAYLOAD_VERSION = 1;

export const MAX_QR_PAYLOAD_BYTES = 1100;

/**
 * How many "host" candidates survive trimming. Two gives a fallback if the
 * top-ranked one turns out to be on the wrong interface, without letting a
 * laptop with many virtual adapters drag the payload back up.
 */
export const MAX_HOST_CANDIDATES = 2;

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
  const lines = sdp.split("\r\n");

  const hostLines = lines.filter((line) => line.startsWith("a=candidate:") && line.includes(" typ host "));
  const keptHostLines = new Set(rankByPriority(hostLines).slice(0, MAX_HOST_CANDIDATES));

  let keptReflexive = false;
  return lines
    .filter((line) => {
      if (!line.startsWith("a=candidate:")) {
        return true;
      }
      if (line.includes(" typ host ")) {
        return keptHostLines.has(line);
      }
      if (line.includes(" typ srflx ") && !keptReflexive) {
        keptReflexive = true;
        return true;
      }
      return false;
    })
    .join("\r\n");
}

/** Highest first: a private IPv4 LAN address, then an mDNS-obfuscated `.local` host, then anything else. */
function candidatePriority(candidateLine: string): number {
  const address = candidateLine.split(" ")[4] ?? "";
  if (isPrivateIPv4(address)) return 0;
  if (address.endsWith(".local")) return 1;
  return 2;
}

function isPrivateIPv4(address: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+$/.test(address);
}

/** Stable sort by `candidatePriority`, keeping original order within a tier. */
function rankByPriority(candidateLines: string[]): string[] {
  return candidateLines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => candidatePriority(a.line) - candidatePriority(b.line) || a.index - b.index)
    .map((entry) => entry.line);
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
