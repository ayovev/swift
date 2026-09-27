/**
 * The real WebRTC implementation of `PeerConnection`/`PeerConnectionFactory`
 * (see peerConnection.ts). The only file in this feature that touches
 * `RTCPeerConnection`/`RTCDataChannel` directly — the same "one seam"
 * discipline `idbStore.ts` uses for `indexedDB`.
 *
 * Trickle ICE is deliberately not used: there is no side channel to trickle
 * candidates over before the offer/answer is shown as a QR code, so each
 * side waits for `iceGatheringState === "complete"` before its
 * `localDescriptionReady` resolves. If gathering doesn't finish within
 * `ICE_GATHERING_TIMEOUT_MS`, the honest answer is "get on the same Wi-Fi" —
 * this file surfaces that as an `IceGatheringTimeoutError` rejection rather
 * than hanging indefinitely; the UI layer turns it into that plain-language
 * message.
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
const DATA_CHANNEL_LABEL = "swift-sync";

function assertSupported(): void {
  if (typeof RTCPeerConnection === "undefined") {
    throw new WebrtcUnsupportedError();
  }
}

function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onChange);
      reject(new IceGatheringTimeoutError());
    }, ICE_GATHERING_TIMEOUT_MS);

    function onChange() {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", onChange);
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
