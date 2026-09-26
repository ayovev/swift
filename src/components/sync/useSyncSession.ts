import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncDataset } from "@/lib/sync/chunking";
import { SyncSession, type OutgoingDataset, type SyncSessionState } from "@/lib/sync/syncSession";
import { webrtcConnectionFactory } from "@/lib/sync/webrtcTransport";

export interface UseSyncSessionResult {
  state: SyncSessionState;
  startHost: (outgoing: OutgoingDataset[]) => void;
  startJoiner: (offerCode: string) => void;
  submitAnswer: (answerCode: string) => void;
  /** Tears down the current session (if any) and returns to idle. */
  reset: () => void;
}

/**
 * A thin React adapter over SyncSession, always backed by the real
 * webrtcConnectionFactory — SyncSession itself stays framework- and
 * WebRTC-agnostic (see syncSession.ts) so it can be unit-tested with a fake
 * factory instead. A fresh SyncSession is created on every startHost/
 * startJoiner call, matching one instance per pairing attempt.
 */
export function useSyncSession(onDatasetReceived: (dataset: SyncDataset, json: string) => void): UseSyncSessionResult {
  const [state, setState] = useState<SyncSessionState>({ status: "idle" });
  const sessionRef = useRef<SyncSession | null>(null);

  // Kept current in a ref so a new inline callback from the caller never
  // forces a new SyncSession to be constructed.
  const onDatasetReceivedRef = useRef(onDatasetReceived);
  onDatasetReceivedRef.current = onDatasetReceived;

  const createSession = useCallback((): SyncSession => {
    sessionRef.current?.close();
    const session = new SyncSession(webrtcConnectionFactory, {
      onStateChange: setState,
      onDatasetReceived: (dataset, json) => onDatasetReceivedRef.current(dataset, json),
    });
    sessionRef.current = session;
    return session;
  }, []);

  const startHost = useCallback(
    (outgoing: OutgoingDataset[]) => {
      void createSession().startHost(outgoing);
    },
    [createSession]
  );

  const startJoiner = useCallback(
    (offerCode: string) => {
      void createSession().startJoiner(offerCode);
    },
    [createSession]
  );

  const submitAnswer = useCallback((answerCode: string) => {
    void sessionRef.current?.submitAnswer(answerCode);
  }, []);

  const reset = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => sessionRef.current?.close(), []);

  return { state, startHost, startJoiner, submitAnswer, reset };
}
