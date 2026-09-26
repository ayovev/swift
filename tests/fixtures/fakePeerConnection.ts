import type { PeerConnection, PeerConnectionFactory } from "@/lib/sync/peerConnection";
import type { SyncTransport } from "@/lib/sync/syncTransport";
import { createFakeTransportPair } from "./fakeSyncTransport";

export interface FakeConnectionFactoryPair {
  hostFactory: PeerConnectionFactory;
  joinerFactory: PeerConnectionFactory;
  hostTransport: SyncTransport;
  joinerTransport: SyncTransport;
}

/**
 * A matching pair of fake PeerConnectionFactorys for tests: `createHost()`
 * and `createJoiner()` produce connections pre-wired to the same underlying
 * fake transport pair, with placeholder (but shape-valid) SDP, so
 * SyncSession's pairing/transfer logic is testable end-to-end without any
 * real WebRTC. The real SDP exchange (webrtcTransport.ts) stays out of
 * scope for these tests — see that file's header comment.
 */
export function createFakeConnectionFactoryPair(): FakeConnectionFactoryPair {
  const [hostTransport, joinerTransport] = createFakeTransportPair();

  // A real data channel only opens once both sides have applied the full
  // offer/answer exchange. The joiner applies its remote description (the
  // offer) early, during startJoiner — well before the channel could
  // plausibly open — so the host applying ITS remote description (the
  // answer, via submitAnswer) is what this fake treats as "handshake
  // complete," gating both sides' `transport` so neither resolves early.
  let resolveHandshakeComplete!: () => void;
  const handshakeComplete = new Promise<void>((resolve) => {
    resolveHandshakeComplete = resolve;
  });

  const hostFactory: PeerConnectionFactory = {
    createHost(): PeerConnection {
      return {
        localDescriptionReady: Promise.resolve({ type: "offer", sdp: fakeSdp("offer") }),
        setRemoteDescription: () => {
          resolveHandshakeComplete();
          return Promise.resolve();
        },
        transport: handshakeComplete.then(() => hostTransport),
        close: () => hostTransport.close(),
      };
    },
    createJoiner(): PeerConnection {
      throw new Error("This factory only creates host connections.");
    },
  };

  const joinerFactory: PeerConnectionFactory = {
    createHost(): PeerConnection {
      throw new Error("This factory only creates joiner connections.");
    },
    createJoiner(): PeerConnection {
      return {
        localDescriptionReady: Promise.resolve({ type: "answer", sdp: fakeSdp("answer") }),
        setRemoteDescription: () => Promise.resolve(),
        transport: handshakeComplete.then(() => joinerTransport),
        close: () => joinerTransport.close(),
      };
    },
  };

  return { hostFactory, joinerFactory, hostTransport, joinerTransport };
}

function fakeSdp(kind: "offer" | "answer"): string {
  return [
    "v=0",
    "o=- 1 1 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    `a=fake-${kind}`,
    "a=candidate:1 1 udp 1 192.0.2.1 5000 typ host generation 0",
  ].join("\r\n");
}
