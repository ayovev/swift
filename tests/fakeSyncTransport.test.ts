import { describe, expect, it, vi } from "vitest";
import { createFakeTransportPair } from "./fixtures/fakeSyncTransport";

describe("createFakeTransportPair", () => {
  it("delivers a message sent by one side to the other", async () => {
    const [a, b] = createFakeTransportPair();
    const received = vi.fn();
    b.onMessage(received);

    const payload = new Uint8Array([1, 2, 3]);
    a.send(payload);
    await Promise.resolve();

    expect(received).toHaveBeenCalledWith(payload);
  });

  it("does not deliver to an unsubscribed listener", async () => {
    const [a, b] = createFakeTransportPair();
    const received = vi.fn();
    const unsubscribe = b.onMessage(received);
    unsubscribe();

    a.send(new Uint8Array([1]));
    await Promise.resolve();

    expect(received).not.toHaveBeenCalled();
  });

  it("closing one side notifies both sides' onClose listeners", () => {
    const [a, b] = createFakeTransportPair();
    const aClosed = vi.fn();
    const bClosed = vi.fn();
    a.onClose(aClosed);
    b.onClose(bClosed);

    a.close();

    expect(aClosed).toHaveBeenCalledTimes(1);
    expect(bClosed).toHaveBeenCalledTimes(1);
  });

  it("throws when sending on a closed transport", () => {
    const [a] = createFakeTransportPair();
    a.close();
    expect(() => a.send(new Uint8Array([1]))).toThrow();
  });

  it("does not deliver a message sent right before close", async () => {
    const [a, b] = createFakeTransportPair();
    const received = vi.fn();
    b.onMessage(received);

    a.send(new Uint8Array([1]));
    a.close();
    await Promise.resolve();

    expect(received).not.toHaveBeenCalled();
  });
});
