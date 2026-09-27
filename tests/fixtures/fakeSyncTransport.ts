import type { SyncTransport } from "@/lib/sync/syncTransport";

/**
 * A fake SyncTransport pair for tests: whatever one side sends, the other
 * receives on its next microtask turn (mirroring a real data channel's
 * asynchronous delivery), with no network or WebRTC involved. Closing either
 * side closes both.
 */
class FakeSyncTransport implements SyncTransport {
  peer: FakeSyncTransport | undefined;
  #messageCallbacks = new Set<(data: Uint8Array) => void>();
  #closeCallbacks = new Set<() => void>();
  #closed = false;

  send(data: Uint8Array): void {
    if (this.#closed) {
      throw new Error("Cannot send on a closed transport.");
    }
    const peer = this.peer;
    if (!peer) {
      throw new Error("This fake transport has no peer — use createFakeTransportPair().");
    }
    queueMicrotask(() => {
      if (peer.#closed) return;
      for (const callback of peer.#messageCallbacks) callback(data);
    });
  }

  onMessage(callback: (data: Uint8Array) => void): () => void {
    this.#messageCallbacks.add(callback);
    return () => this.#messageCallbacks.delete(callback);
  }

  onClose(callback: () => void): () => void {
    this.#closeCallbacks.add(callback);
    return () => this.#closeCallbacks.delete(callback);
  }

  close(): void {
    if (this.#closed) return;
    this.#markClosed();
    if (this.peer) {
      this.peer.#markClosed();
    }
  }

  #markClosed(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const callback of this.#closeCallbacks) callback();
  }
}

export function createFakeTransportPair(): [SyncTransport, SyncTransport] {
  const a = new FakeSyncTransport();
  const b = new FakeSyncTransport();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
