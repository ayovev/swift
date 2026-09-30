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
 * The payload is Base45-encoded (RFC 9285), not base64. Base45's alphabet —
 * digits, uppercase letters, space, and `$%*+-./:` — is exactly the QR
 * "alphanumeric mode" character set (the same reason the EU's
 * COVID-certificate QR codes chose it), which the `qrcode` package can pack
 * at roughly 5.5 bits/character instead of the 8 bits/character byte mode
 * base64's mixed case and `+/=` force it into. Base45 needs ~12.5% more
 * characters than base64 for the same bytes, but produces a meaningfully
 * smaller QR symbol overall — measured at roughly 10-20% fewer modules per
 * side (i.e. noticeably faster for a camera to lock onto) for a realistic
 * pairing payload. It's a pure text-encoding swap: decoding still produces
 * the byte-identical original SDP, so it carries none of the interop risk
 * an SDP-restructuring approach would.
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

const PAIRING_PAYLOAD_VERSION = 2;

// Base45 needs ~12.5% more characters than base64 did for the same
// underlying bytes (2 bytes -> 3 Base45 chars vs. 4/3 base64 chars), so the
// same practical density ceiling now falls at a higher character count —
// the post-trim floor (MAX_HOST_CANDIDATES host candidates + one srflx
// candidate) measures ~1,223 Base45 characters, just under this, mirroring
// how 1100 used to sit just above the equivalent base64 floor (~1,088).
export const MAX_QR_PAYLOAD_BYTES = 1250;

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
  const encoded = toBase45(JSON.stringify(payload));
  if (byteLength(encoded) <= MAX_QR_PAYLOAD_BYTES) {
    return encoded;
  }

  return toBase45(JSON.stringify({ ...payload, sdp: trimCandidates(payload.sdp) }));
}

export function decodePairingPayload(text: string): RTCSessionDescriptionInit {
  let json: string;
  try {
    json = fromBase45(text);
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

const BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** RFC 9285 Base45: encodes 2 bytes as 3 characters (or 1 trailing byte as 2). */
export function toBase45(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let result = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i]! * 256 + bytes[i + 1]!;
      result +=
        BASE45_ALPHABET[n % 45]! + BASE45_ALPHABET[Math.floor(n / 45) % 45]! + BASE45_ALPHABET[Math.floor(n / 2025)]!;
    } else {
      const n = bytes[i]!;
      result += BASE45_ALPHABET[n % 45]! + BASE45_ALPHABET[Math.floor(n / 45)]!;
    }
  }
  return result;
}

function fromBase45(encoded: string): string {
  if (encoded.length % 3 === 1) {
    throw new Error("Invalid Base45 length.");
  }

  const bytes: number[] = [];
  let i = 0;
  for (; i + 3 <= encoded.length; i += 3) {
    const n = base45CharValue(encoded[i]!) + base45CharValue(encoded[i + 1]!) * 45 + base45CharValue(encoded[i + 2]!) * 2025;
    if (n > 0xffff) {
      throw new Error("Invalid Base45 value.");
    }
    bytes.push(Math.floor(n / 256), n % 256);
  }
  if (i < encoded.length) {
    const n = base45CharValue(encoded[i]!) + base45CharValue(encoded[i + 1]!) * 45;
    if (n > 0xff) {
      throw new Error("Invalid Base45 value.");
    }
    bytes.push(n);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function base45CharValue(char: string): number {
  const index = BASE45_ALPHABET.indexOf(char);
  if (index === -1) {
    throw new Error("Invalid Base45 character.");
  }
  return index;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
