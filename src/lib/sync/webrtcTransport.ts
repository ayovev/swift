/**
 * The real WebRTC implementation of `PeerConnection`/`PeerConnectionFactory`
 * (see peerConnection.ts). The only file in this feature that touches
 * `RTCPeerConnection`/`RTCDataChannel` directly — the same "one seam"
 * discipline `idbStore.ts` uses for `indexedDB`.
 *
 * Trickle ICE is deliberately not used: there is no side channel to trickle
 * candidates over before the offer/answer is shown as a QR code, so each
 * side waits for `iceGatheringState === "complete"` — or, failing that, for
 * a candidate to already be in hand once `ICE_GATHERING_FAST_PATH_MS`
 * elapses, or, failing even that, for a candidate to show up by
 * `ICE_GATHERING_TIMEOUT_MS` — before its `localDescriptionReady` resolves.
 *
 * That two-tier fallback exists because "complete" and "stalled forever" are
 * not the only two outcomes — a device with several virtual network
 * adapters (a VPN client, Docker, Hyper-V/WSL) can take a genuinely long
 * time to reach `"complete"` even though it isn't stuck: the browser still
 * has to individually time out a STUN request on every dead adapter before
 * it calls gathering done, and each of those internal timeouts is a real
 * multi-second wait for nothing useful. Host candidates (this device's own
 * local addresses) don't need any of that — they're pure local interface
 * enumeration, no network round trip, so they're all gathered almost
 * immediately regardless of how many adapters exist. `ICE_GATHERING_FAST_PATH_MS`
 * (measured generously above that "almost immediate" figure, but well below
 * a multi-adapter machine's typical full-completion time) lets the app
 * proceed as soon as it has *something* to offer, rather than sitting
 * through STUN timeouts on interfaces the joiner will never touch anyway —
 * this is exactly the fast case on a phone (one real interface, "complete"
 * fires almost immediately, so this fast path never even engages) versus the
 * slow case on a laptop (several dead interfaces, "complete" is what's slow,
 * not candidate-gathering itself). `ICE_GATHERING_TIMEOUT_MS` remains the
 * true last resort for the case the fast path can't help with — gathering
 * genuinely produced nothing at all — and is unchanged from before: this
 * change can only make `localDescriptionReady` resolve *sooner* than it did,
 * never later, so it doesn't reduce patience for a slow-but-eventually-fine
 * connection.
 *
 * `ICE_GATHERING_FAST_PATH_MS`'s value is a reasoned estimate, not something
 * measured on real hardware — this file's own next paragraph explains why it
 * can't be unit-tested, so validate it (ideally on a laptop with an active
 * VPN or Docker running, to reproduce the slow case directly) before relying
 * on it.
 *
 * A public STUN server is used for NAT traversal — it sees only each
 * device's public IP address during connection setup, never the workout
 * data itself. No TURN server is configured, on purpose: a TURN relay would
 * see the (encrypted) bytes in transit, which this feature's zero-relay
 * design explicitly avoids. If STUN can't punch through, sync simply
 * doesn't connect, and the UI says so rather than silently falling back to
 * a relay.
 *
 * NOT covered by automated tests: jsdom has no WebRTC implementation, and
 * this repo has no Playwright/e2e infrastructure. This file is verified
 * manually, across two real browser tabs/devices — see syncSession.ts's
 * header comment for what IS unit-tested (everything except this file).
 */

import { IceGatheringTimeoutError, WebrtcUnsupportedError, type PeerConnection, type PeerConnectionFactory } from "./peerConnection";
import type { SyncTransport } from "./syncTransport";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_GATHERING_TIMEOUT_MS = 10_000;
// See this file's header comment for what this trades off and why 1.5s.
const ICE_GATHERING_FAST_PATH_MS = 1_500;
const DATA_CHANNEL_LABEL = "swift-sync";

function assertSupported(): void {
  if (typeof RTCPeerConnection === "undefined") {
    throw new WebrtcUnsupportedError();
  }
}

/** Whether the browser has attached at least one ICE candidate to the local description yet. */
function hasGatheredCandidate(pc: RTCPeerConnection): boolean {
  return pc.localDescription?.sdp.includes("a=candidate:") ?? false;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const hardTimer = window.setTimeout(() => {
      cleanup();
      if (hasGatheredCandidate(pc)) {
        resolve();
      } else {
        reject(new IceGatheringTimeoutError());
      }
    }, ICE_GATHERING_TIMEOUT_MS);

    // Fires once, well before the hard timeout — only resolves early if a
    // candidate is already in hand; otherwise it's a no-op and hardTimer
    // stays the last resort, so this can only ever resolve sooner, never
    // fail sooner.
    const fastTimer = window.setTimeout(() => {
      if (hasGatheredCandidate(pc)) {
        cleanup();
        resolve();
      }
    }, ICE_GATHERING_FAST_PATH_MS);

    function cleanup() {
      window.clearTimeout(hardTimer);
      window.clearTimeout(fastTimer);
      pc.removeEventListener("icegatheringstatechange", onChange);
    }

    function onChange() {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

function readLocalDescription(pc: RTCPeerConnection): RTCSessionDescriptionInit {
  const description = pc.localDescription;
  if (!description) {
    throw new Error("No local description after ICE gathering completed.");
  }
  return { type: description.type, sdp: description.sdp };
}

function toSyncTransport(channel: RTCDataChannel): SyncTransport {
  channel.binaryType = "arraybuffer";
  return {
    send(data) {
      // Every Uint8Array this feature ever constructs (TextEncoder output,
      // plain `new Uint8Array(n)` allocations) is backed by a real
      // ArrayBuffer, never a SharedArrayBuffer — RTCDataChannel.send()'s
      // stricter overload just needs that spelled out for the type checker.
      channel.send(data as Uint8Array<ArrayBuffer>);
    },
    onMessage(callback) {
      const handler = (event: MessageEvent) => {
        callback(event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new Uint8Array());
      };
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
    onClose(callback) {
      channel.addEventListener("close", callback);
      return () => channel.removeEventListener("close", callback);
    },
    close() {
      channel.close();
    },
  };
}

function waitForChannelOpen(channel: RTCDataChannel): Promise<SyncTransport> {
  if (channel.readyState === "open") {
    return Promise.resolve(toSyncTransport(channel));
  }
  return new Promise((resolve, reject) => {
    channel.addEventListener("open", () => resolve(toSyncTransport(channel)), { once: true });
    channel.addEventListener("error", () => reject(new Error("The data channel failed to open.")), { once: true });
  });
}

function createHost(): PeerConnection {
  assertSupported();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const channel = pc.createDataChannel(DATA_CHANNEL_LABEL);

  const localDescriptionReady = (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    return readLocalDescription(pc);
  })();

  return {
    localDescriptionReady,
    setRemoteDescription: (description) => pc.setRemoteDescription(description),
    transport: waitForChannelOpen(channel),
    close: () => pc.close(),
  };
}

function createJoiner(): PeerConnection {
  assertSupported();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // createAnswer() requires the remote offer to already be applied, but
  // localDescriptionReady is handed out before setRemoteDescription is
  // necessarily called — so its work waits on this gate, which
  // setRemoteDescription below opens once the offer is actually applied.
  let markRemoteDescriptionSet!: () => void;
  const remoteDescriptionSet = new Promise<void>((resolve) => {
    markRemoteDescriptionSet = resolve;
  });

  const transport: Promise<SyncTransport> = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener("datachannel", (event) => resolve(event.channel), { once: true });
  }).then(waitForChannelOpen);

  const localDescriptionReady = (async () => {
    await remoteDescriptionSet;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    return readLocalDescription(pc);
  })();

  return {
    localDescriptionReady,
    setRemoteDescription: async (description) => {
      await pc.setRemoteDescription(description);
      markRemoteDescriptionSet();
    },
    transport,
    close: () => pc.close(),
  };
}

export const webrtcConnectionFactory: PeerConnectionFactory = { createHost, createJoiner };
