import { describe, expect, it, vi } from "vitest";
import { IceGatheringTimeoutError, WebrtcUnsupportedError, type PeerConnectionFactory } from "@/lib/sync/peerConnection";
import { SyncSession, type SyncSessionState } from "@/lib/sync/syncSession";
import { createFakeConnectionFactoryPair } from "./fixtures/fakePeerConnection";

function assertStatus<S extends SyncSessionState["status"]>(
  state: SyncSessionState,
  status: S
): asserts state is Extract<SyncSessionState, { status: S }> {
  if (state.status !== status) {
    throw new Error(`Expected status "${status}" but got "${state.status}".`);
  }
}

describe("SyncSession", () => {
  it("completes a full host-to-joiner handshake and transfers one dataset", async () => {
    const { hostFactory, joinerFactory } = createFakeConnectionFactoryPair();
    const received: Array<{ dataset: string; json: string }> = [];

    const host = new SyncSession(hostFactory);
    const joiner = new SyncSession(joinerFactory, {
      onDatasetReceived: (dataset, json) => received.push({ dataset, json }),
    });

    const workoutJson = JSON.stringify([{ id: 1 }, { id: 2 }]);
    await host.startHost([{ dataset: "workout", json: workoutJson }]);

    const offerState = host.getState();
    assertStatus(offerState, "awaiting-answer");

    await joiner.startJoiner(offerState.offerCode);

    const answerState = joiner.getState();
    assertStatus(answerState, "awaiting-connection");

    await host.submitAnswer(answerState.answerCode);

    await vi.waitFor(() => {
      assertStatus(host.getState(), "done");
      assertStatus(joiner.getState(), "done");
    });

    expect(received).toEqual([{ dataset: "workout", json: workoutJson }]);
  });

  it("transfers workout, body comp, and experiments, in order, when the host offers all three", async () => {
    const { hostFactory, joinerFactory } = createFakeConnectionFactoryPair();
    const received: Array<{ dataset: string; json: string }> = [];

    const host = new SyncSession(hostFactory);
    const joiner = new SyncSession(joinerFactory, {
      onDatasetReceived: (dataset, json) => received.push({ dataset, json }),
    });

    const workoutJson = JSON.stringify([{ id: 1 }]);
    const bodyCompJson = JSON.stringify([{ scanDate: "2024-01-01" }]);
    const experimentsJson = JSON.stringify([{ id: "1", date: "2024-01-01", label: "Started 5/3/1" }]);
    await host.startHost([
      { dataset: "workout", json: workoutJson },
      { dataset: "bodyComp", json: bodyCompJson },
      { dataset: "experiments", json: experimentsJson },
    ]);

    const offerState = host.getState();
    assertStatus(offerState, "awaiting-answer");
    await joiner.startJoiner(offerState.offerCode);

    const answerState = joiner.getState();
    assertStatus(answerState, "awaiting-connection");
    await host.submitAnswer(answerState.answerCode);

    await vi.waitFor(() => {
      assertStatus(host.getState(), "done");
      assertStatus(joiner.getState(), "done");
    });

    expect(received).toEqual([
      { dataset: "workout", json: workoutJson },
      { dataset: "bodyComp", json: bodyCompJson },
      { dataset: "experiments", json: experimentsJson },
    ]);
  });

  it("reports transferring progress on the joiner while a multi-chunk dataset is in flight", async () => {
    const { hostFactory, joinerFactory } = createFakeConnectionFactoryPair();
    const joinerStates: SyncSessionState[] = [];

    const host = new SyncSession(hostFactory);
    const joiner = new SyncSession(joinerFactory, { onStateChange: (s) => joinerStates.push(s) });

    // Sized to force many chunks well past MAX_CHUNK_BYTES (15000).
    const rows = Array.from({ length: 1209 }, (_, i) => ({ workout_id: `w${i}`, title: `Workout ${i}` }));
    const workoutJson = JSON.stringify(rows);
    await host.startHost([{ dataset: "workout", json: workoutJson }]);

    const offerState = host.getState();
    assertStatus(offerState, "awaiting-answer");
    await joiner.startJoiner(offerState.offerCode);

    const answerState = joiner.getState();
    assertStatus(answerState, "awaiting-connection");
    await host.submitAnswer(answerState.answerCode);

    await vi.waitFor(() => {
      assertStatus(joiner.getState(), "done");
    });

    const transferringStates = joinerStates.filter((s) => s.status === "transferring");
    expect(transferringStates.length).toBeGreaterThan(1);
    const last = transferringStates.at(-1);
    expect(last?.receivedBytes).toBe(last?.totalBytes);
  });

  it("fails with invalid_qr when the joiner is started with garbage instead of a scanned offer", async () => {
    const { joinerFactory } = createFakeConnectionFactoryPair();
    const joiner = new SyncSession(joinerFactory);

    await joiner.startJoiner("not a real pairing code");

    assertStatus(joiner.getState(), "failed");
    expect(joiner.getState()).toEqual({ status: "failed", reason: "invalid_qr" });
  });

  it("fails with invalid_qr when the host receives garbage instead of a scanned answer", async () => {
    const { hostFactory } = createFakeConnectionFactoryPair();
    const host = new SyncSession(hostFactory);

    await host.startHost([{ dataset: "workout", json: "[]" }]);
    await host.submitAnswer("not a real pairing code");

    expect(host.getState()).toEqual({ status: "failed", reason: "invalid_qr" });
  });

  it("fails with connection_dropped on the host when the peer disconnects mid-transfer", async () => {
    const { hostFactory, joinerFactory, joinerTransport } = createFakeConnectionFactoryPair();
    const hostStates: SyncSessionState[] = [];

    const host = new SyncSession(hostFactory, { onStateChange: (s) => hostStates.push(s) });
    const joiner = new SyncSession(joinerFactory, {
      onStateChange: (s) => {
        if (s.status === "transferring" && s.receivedBytes > 0) {
          joinerTransport.close();
        }
      },
    });

    const rows = Array.from({ length: 1209 }, (_, i) => ({ workout_id: `w${i}`, title: `Workout ${i}` }));
    await host.startHost([{ dataset: "workout", json: JSON.stringify(rows) }]);

    const offerState = host.getState();
    assertStatus(offerState, "awaiting-answer");
    await joiner.startJoiner(offerState.offerCode);

    const answerState = joiner.getState();
    assertStatus(answerState, "awaiting-connection");
    await host.submitAnswer(answerState.answerCode);

    await vi.waitFor(() => {
      expect(host.getState()).toEqual({ status: "failed", reason: "connection_dropped" });
    });

    expect(hostStates.some((s) => s.status === "done")).toBe(false);
  });

  it("fails with ice_timeout when the connection factory reports ICE gathering timed out", async () => {
    const timeoutFactory: PeerConnectionFactory = {
      createHost: () => ({
        localDescriptionReady: Promise.reject(new IceGatheringTimeoutError()),
        setRemoteDescription: () => Promise.resolve(),
        transport: new Promise(() => {}),
        close: () => {},
      }),
      createJoiner: () => {
        throw new Error("not used");
      },
    };

    const host = new SyncSession(timeoutFactory);
    await host.startHost([{ dataset: "workout", json: "[]" }]);

    expect(host.getState()).toEqual({ status: "failed", reason: "ice_timeout" });
  });

  it("fails with unsupported_browser when the connection factory reports no WebRTC support", async () => {
    const unsupportedFactory: PeerConnectionFactory = {
      createHost: () => {
        throw new Error("not used");
      },
      createJoiner: () => ({
        localDescriptionReady: Promise.reject(new WebrtcUnsupportedError()),
        setRemoteDescription: () => Promise.resolve(),
        transport: new Promise(() => {}),
        close: () => {},
      }),
    };

    const joiner = new SyncSession(unsupportedFactory);
    const { hostFactory } = createFakeConnectionFactoryPair();
    const host = new SyncSession(hostFactory);
    await host.startHost([{ dataset: "workout", json: "[]" }]);
    const offerState = host.getState();
    assertStatus(offerState, "awaiting-answer");

    await joiner.startJoiner(offerState.offerCode);

    expect(joiner.getState()).toEqual({ status: "failed", reason: "unsupported_browser" });
  });
});
