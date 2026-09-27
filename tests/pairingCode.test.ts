import { describe, expect, it } from "vitest";
import {
  MAX_HOST_CANDIDATES,
  MAX_QR_PAYLOAD_BYTES,
  PairingCodeError,
  decodePairingPayload,
  encodePairingPayload,
} from "@/lib/sync/pairingCode";

function candidateLine(typ: string, index: number, address = `192.0.2.${index % 250}`): string {
  return `a=candidate:${index} 1 udp 2122260223 ${address} ${50000 + index} typ ${typ} generation 0`;
}

const SDP_PREAMBLE = ["v=0", "o=- 1 1 IN IP4 127.0.0.1", "s=-", "t=0 0"];

describe("encodePairingPayload / decodePairingPayload", () => {
  it("round-trips a small offer unchanged", () => {
    const sdp = [...SDP_PREAMBLE, candidateLine("host", 1)].join("\r\n");
    const encoded = encodePairingPayload({ type: "offer", sdp });

    expect(decodePairingPayload(encoded)).toEqual({ type: "offer", sdp });
  });

  it("round-trips a small answer unchanged", () => {
    const sdp = [...SDP_PREAMBLE, candidateLine("host", 1)].join("\r\n");
    const encoded = encodePairingPayload({ type: "answer", sdp });

    expect(decodePairingPayload(encoded)).toEqual({ type: "answer", sdp });
  });

  it("trims to host candidates plus the first srflx candidate when the payload is too large", () => {
    const hostLines = [candidateLine("host", 1), candidateLine("host", 2)];
    const srflxLines = Array.from({ length: 6 }, (_, i) => candidateLine("srflx", 10 + i));
    const relayLines = Array.from({ length: 20 }, (_, i) => candidateLine("relay", 100 + i));
    const sdp = [...SDP_PREAMBLE, ...hostLines, ...srflxLines, ...relayLines].join("\r\n");
    const rawEncoded = Buffer.from(JSON.stringify({ v: 1, type: "offer", sdp })).length;
    expect(rawEncoded).toBeGreaterThan(MAX_QR_PAYLOAD_BYTES);

    const encoded = encodePairingPayload({ type: "offer", sdp });
    const decoded = decodePairingPayload(encoded);

    expect(decoded.sdp).toContain(hostLines[0]);
    expect(decoded.sdp).toContain(hostLines[1]);
    expect(decoded.sdp).toContain(srflxLines[0]);
    for (const line of srflxLines.slice(1)) {
      expect(decoded.sdp).not.toContain(line);
    }
    for (const line of relayLines) {
      expect(decoded.sdp).not.toContain(line);
    }
  });

  it("caps host candidates and prefers a private IPv4 address over other host candidates", () => {
    const publicHostLines = Array.from({ length: 10 }, (_, i) => candidateLine("host", i, `198.51.100.${i}`));
    const privateHostLine = candidateLine("host", 100, "192.168.1.42");
    const mdnsHostLine = candidateLine("host", 101, "9f8c9c9e-1234-4a5b-8c9d-abcdef012345.local");
    const srflxLines = Array.from({ length: 3 }, (_, i) => candidateLine("srflx", 10 + i));
    const sdp = [
      ...SDP_PREAMBLE,
      ...publicHostLines,
      privateHostLine,
      mdnsHostLine,
      ...srflxLines,
    ].join("\r\n");
    const rawEncoded = Buffer.from(JSON.stringify({ v: 1, type: "offer", sdp })).length;
    expect(rawEncoded).toBeGreaterThan(MAX_QR_PAYLOAD_BYTES);

    const decoded = decodePairingPayload(encodePairingPayload({ type: "offer", sdp }));
    const keptHostLines = (decoded.sdp ?? "")
      .split("\r\n")
      .filter((line) => line.includes(" typ host "));

    expect(keptHostLines).toHaveLength(MAX_HOST_CANDIDATES);
    // The private LAN address outranks every public-looking host candidate,
    // and the mDNS-obfuscated one outranks those too, so it fills the
    // second slot even though it was listed last in the source SDP.
    expect(keptHostLines[0]).toBe(privateHostLine);
    expect(keptHostLines[1]).toBe(mdnsHostLine);
    expect(decoded.sdp).toContain(srflxLines[0]);
  });

  it("throws PairingCodeError for text that isn't base64", () => {
    expect(() => decodePairingPayload("not-base64!!!")).toThrow(PairingCodeError);
  });

  it("throws PairingCodeError for base64 that isn't JSON", () => {
    const encoded = btoa("this is not json");
    expect(() => decodePairingPayload(encoded)).toThrow(PairingCodeError);
  });

  it("throws PairingCodeError for a payload from a different version", () => {
    const encoded = btoa(JSON.stringify({ v: 999, type: "offer", sdp: "v=0" }));
    expect(() => decodePairingPayload(encoded)).toThrow(PairingCodeError);
  });

  it("throws PairingCodeError for a payload with an invalid type", () => {
    const encoded = btoa(JSON.stringify({ v: 1, type: "rollback", sdp: "v=0" }));
    expect(() => decodePairingPayload(encoded)).toThrow(PairingCodeError);
  });

  it("throws PairingCodeError for a payload with a missing sdp", () => {
    const encoded = btoa(JSON.stringify({ v: 1, type: "offer" }));
    expect(() => decodePairingPayload(encoded)).toThrow(PairingCodeError);
  });

  it("refuses to encode a description that isn't an offer or answer", () => {
    expect(() => encodePairingPayload({ type: "rollback", sdp: "v=0" })).toThrow(PairingCodeError);
  });
});
