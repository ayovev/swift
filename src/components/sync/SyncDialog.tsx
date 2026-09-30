import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bucketRowCount, capture, type SyncRole } from "@/lib/posthog";
import type { SyncDataset } from "@/lib/sync/chunking";
import { planReceived, type ConflictItem } from "@/lib/sync/receivedDatasets";
import type { OutgoingDataset, SyncFailureReason } from "@/lib/sync/syncSession";
import type { Experiment } from "@/types/experiment";
import type { InBodyRow } from "@/types/inbody";
import type { ContextTag } from "@/types/tag";
import type { SugarWodRow } from "@/types/sugarwod";
import { HostQrView } from "./HostQrView";
import { JoinerScanView } from "./JoinerScanView";
import { useSyncSession } from "./useSyncSession";

const DATASET_LABEL: Record<SyncDataset, string> = {
  workout: "workout log",
  bodyComp: "body composition history",
  experiments: "list of experiments",
  tags: "list of context tags",
};

export interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: SyncRole;
  /** Host role only: what to offer, built from this device's own current data. */
  outgoing?: OutgoingDataset[];
  /** Joiner role only: existing local counts, so a conflicting dataset can be confirmed before overwriting. `null` means nothing local to conflict with. */
  existingWorkoutCount: number | null;
  existingBodyCompCount: number | null;
  existingExperimentsCount: number | null;
  existingTagsCount: number | null;
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
  onSyncedExperiments: (experiments: Experiment[]) => void;
  onSyncedTags: (tags: ContextTag[]) => void;
}

function failureMessage(reason: SyncFailureReason): string {
  switch (reason) {
    case "ice_timeout":
      return "Couldn't find a way to connect the two devices. Try getting on the same Wi-Fi network and starting again.";
    case "camera_denied":
      return "Camera access was denied, so the code couldn't be scanned. Allow camera access and try again.";
    case "invalid_qr":
      return "That code didn't look like a valid pairing code. Try scanning it again.";
    case "connection_dropped":
      return "The connection was lost partway through. Try again.";
    case "unsupported_browser":
      return "This browser doesn't support the technology sync needs. Try a different browser.";
    case "declined_overwrite":
      return "Sync was cancelled.";
  }
}

/**
 * The pairing wizard shell. Owns one SyncSession (via useSyncSession) for
 * the dialog's lifetime, renders the host or joiner half of the handshake,
 * and — once a joiner's transfer finishes — checks each received dataset
 * against what's already stored locally, confirming an overwrite per
 * dataset before ever calling onSyncedWorkoutData/onSyncedBodyCompData/
 * onSyncedExperiments. See CLAUDE.md's "Architecture: app state and local
 * persistence" for why those handlers are unconditional writers: this
 * dialog is what gates them.
 */
export function SyncDialog({
  open,
  onOpenChange,
  role,
  outgoing,
  existingWorkoutCount,
  existingBodyCompCount,
  existingExperimentsCount,
  existingTagsCount,
  onSyncedWorkoutData,
  onSyncedBodyCompData,
  onSyncedExperiments,
  onSyncedTags,
}: SyncDialogProps) {
  const [received, setReceived] = useState<Partial<Record<SyncDataset, unknown>>>({});
  const [conflicts, setConflicts] = useState<ConflictItem[] | null>(null);
  const processedRef = useRef(false);
  const attemptedRef = useRef(false);

  const handleDatasetReceived = useCallback((dataset: SyncDataset, json: string) => {
    setReceived((prev) => ({ ...prev, [dataset]: JSON.parse(json) as unknown }));
  }, []);

  const { state, startHost, startJoiner, submitAnswer, reset } = useSyncSession(handleDatasetReceived);

  // Host role: begin as soon as the dialog opens with data to offer.
  useEffect(() => {
    if (open && role === "host" && state.status === "idle" && outgoing && !attemptedRef.current) {
      attemptedRef.current = true;
      capture({ name: "sync_attempted", props: { role: "host" } });
      startHost(outgoing);
    }
  }, [open, role, state.status, outgoing, startHost]);

  const handleScanOffer = useCallback(
    (offerCode: string) => {
      if (attemptedRef.current) return;
      attemptedRef.current = true;
      capture({ name: "sync_attempted", props: { role: "joiner" } });
      startJoiner(offerCode);
    },
    [startJoiner]
  );

  // Reset everything when the dialog closes, so reopening starts fresh.
  useEffect(() => {
    if (open) return;
    reset();
    setReceived({});
    setConflicts(null);
    processedRef.current = false;
    attemptedRef.current = false;
  }, [open, reset]);

  useEffect(() => {
    if (state.status !== "failed") return;
    capture({ name: "sync_failed", props: { role, reason: state.reason } });
  }, [state, role]);

  useEffect(() => {
    if (state.status !== "done") return;

    if (role === "host") {
      const workoutJson = outgoing?.find((entry) => entry.dataset === "workout")?.json;
      const rowCount = workoutJson ? (JSON.parse(workoutJson) as unknown[]).length : 0;
      capture({ name: "sync_succeeded", props: { role: "host", rows: bucketRowCount(rowCount) } });
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    const workoutRows = received.workout as SugarWodRow[] | undefined;
    const bodyCompRows = received.bodyComp as InBodyRow[] | undefined;
    const experimentsRows = received.experiments as Experiment[] | undefined;
    capture({
      name: "sync_succeeded",
      props: {
        role: "joiner",
        rows: bucketRowCount(workoutRows?.length ?? bodyCompRows?.length ?? experimentsRows?.length ?? 0),
      },
    });

    const { conflicts: items } = planReceived(
      received,
      {
        workout: existingWorkoutCount,
        bodyComp: existingBodyCompCount,
        experiments: existingExperimentsCount,
        tags: existingTagsCount,
      },
      {
        workout: onSyncedWorkoutData,
        bodyComp: onSyncedBodyCompData,
        experiments: onSyncedExperiments,
        tags: onSyncedTags,
      }
    );

    if (items.length > 0) {
      setConflicts(items);
    } else {
      onOpenChange(false);
    }
  }, [
    state,
    role,
    outgoing,
    received,
    existingWorkoutCount,
    existingBodyCompCount,
    existingExperimentsCount,
    existingTagsCount,
    onSyncedWorkoutData,
    onSyncedBodyCompData,
    onSyncedExperiments,
    onSyncedTags,
    onOpenChange,
  ]);

  const currentConflict = conflicts?.[0] ?? null;

  const resolveConflict = useCallback(
    (apply: boolean) => {
      if (!currentConflict) return;
      if (apply) {
        currentConflict.apply();
      } else {
        capture({ name: "sync_failed", props: { role: "joiner", reason: "declined_overwrite" } });
      }
      setConflicts((prev) => {
        const rest = (prev ?? []).slice(1);
        if (rest.length === 0) {
          onOpenChange(false);
          return null;
        }
        return rest;
      });
    },
    [currentConflict, onOpenChange]
  );

  return (
    <>
      <Dialog open={open && !currentConflict} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{role === "host" ? "Sync to another device" : "Sync from another device"}</DialogTitle>
            <DialogDescription>
              Connects directly to your other device. Nothing is ever sent through a server.
            </DialogDescription>
          </DialogHeader>

          {state.status === "failed" ? (
            <p className="text-sm text-muted-foreground">{failureMessage(state.reason)}</p>
          ) : role === "host" ? (
            <HostQrView state={state} onScanAnswer={submitAnswer} />
          ) : (
            <JoinerScanView state={state} onScanOffer={handleScanOffer} />
          )}
        </DialogContent>
      </Dialog>

      {currentConflict ? (
        <AlertDialog
          open
          onOpenChange={(next) => {
            if (!next) resolveConflict(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace your {DATASET_LABEL[currentConflict.dataset]}?</AlertDialogTitle>
              <AlertDialogDescription>
                This device already has a {DATASET_LABEL[currentConflict.dataset]} with{" "}
                {currentConflict.existingCount} entries. Replacing it with the synced data (
                {currentConflict.incomingCount} entries) can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => resolveConflict(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resolveConflict(true)}>Replace</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
