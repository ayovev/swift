/**
 * The transport interface `syncSession.ts` sends and receives raw bytes
 * over, independent of whatever actually carries them. `webrtcTransport.ts`
 * wraps a real `RTCDataChannel` behind this interface; tests use a fake
 * in-memory implementation instead (`tests/fixtures/fakeSyncTransport.ts`),
 * so the pairing state machine and framing logic are fully testable without
 * a real WebRTC stack — jsdom has none (see webrtcTransport.ts's header
 * comment for what stays manually verified instead).
 */
export interface SyncTransport {
  send(data: Uint8Array): void;
  onMessage(callback: (data: Uint8Array) => void): () => void;
  onClose(callback: () => void): () => void;
  close(): void;
}
