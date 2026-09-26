import type { SyncTransport } from "./syncTransport";

/**
 * One side of a WebRTC handshake, abstracted so `syncSession.ts` never
 * constructs an `RTCPeerConnection` itself. `webrtcTransport.ts`'s
 * `webrtcConnectionFactory` (real `RTCPeerConnection`) is the production
 * implementation; tests use a fake pair instead
 * (`tests/fixtures/fakePeerConnection.ts`).
 *
 * The host and joiner shapes are identical on purpose — both just produce a
 * local description, accept a remote one, and eventually hand back an open
 * transport. Which SDP type goes where (offer vs. answer) is entirely
 * `syncSession.ts`'s concern, not something this interface enforces.
 */
export interface PeerConnection {
  /**
   * Resolves once this side's SDP is ready to encode as a QR code — after
   * ICE gathering completes, since there is no channel to trickle
   * candidates over before the QR is shown.
   */
  localDescriptionReady: Promise<RTCSessionDescriptionInit>;
  /** Applies the other side's scanned SDP (host: an answer; joiner: an offer). */
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  /** Resolves once the data channel is open and ready to send/receive. */
  transport: Promise<SyncTransport>;
  close(): void;
}

export interface PeerConnectionFactory {
  createHost(): PeerConnection;
  createJoiner(): PeerConnection;
}

/**
 * Thrown by `webrtcTransport.ts` when ICE gathering doesn't finish in time.
 * Lives here (not in webrtcTransport.ts) so `syncSession.ts` can recognize
 * it and report the precise `"ice_timeout"` failure reason without
 * importing anything WebRTC-specific.
 */
export class IceGatheringTimeoutError extends Error {
  constructor() {
    super("Couldn't find a way to connect the two devices in time.");
    this.name = "IceGatheringTimeoutError";
  }
}

/** Thrown by `webrtcTransport.ts` when the browser has no WebRTC support. */
export class WebrtcUnsupportedError extends Error {
  constructor() {
    super("This browser doesn't support the technology sync needs (WebRTC).");
    this.name = "WebrtcUnsupportedError";
  }
}
