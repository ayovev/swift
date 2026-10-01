import { useCallback, useEffect, useRef, useState } from "react";
import { ReplaceConfirmDialog } from "./ReplaceConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bucketRowCount, capture, type SyncRole } from "@/lib/posthog";
import type { SyncDataset } from "@/lib/sync/chunking";
import { DATASET_LABEL } from "@/lib/sync/datasetLabels";
import { planTransfer, type TransferPlan } from "@/lib/sync/planTransfer";
import type { SkippedDataset } from "@/lib/sync/receivedDatasets";
import type { OutgoingDataset, SyncFailureReason } from "@/lib/sync/syncSession";
import type { InBodyRow } from "@/types/inbody";
import type { ContextTag } from "@/types/tag";
import type { SugarWodRow } from "@/types/sugarwod";
import { HostQrView } from "./HostQrView";
import { JoinerScanView } from "./JoinerScanView";
import { useSyncSession } from "./useSyncSession";

export interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: SyncRole;
  /** Host role only: what to offer, built from this device's own current data. */
  outgoing?: OutgoingDataset[];
  /** Joiner role only: existing local counts, so a conflicting dataset can be confirmed before overwriting. `null` means nothing local to conflict with. */
  existingWorkoutCount: number | null;
  existingBodyCompCount: number | null;
  existingTagsCount: number | null;
  onSyncedWorkoutData: (rows: SugarWodRow[]) => void;
  onSyncedBodyCompData: (rows: InBodyRow[]) => void;
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
    case "invalid_data":
      return "The other device sent data this one couldn't read.";
  }
}

/** A finished joiner transfer, counted by the size bucket of the first dataset present. */
function captureJoinerSuccess(received: Partial<Record<SyncDataset, unknown>>) {
  const count = (raw: unknown) => (Array.isArray(raw) ? raw.length : 0);
  capture({
    name: "sync_succeeded",
    props: {
      role: "joiner",
      rows: bucketRowCount(count(received.workout) || count(received.bodyComp) || count(received.tags)),
    },
  });
}

/**
 * The pairing wizard shell. Owns one SyncSession (via useSyncSession) for
 * the dialog's lifetime, renders the host or joiner half of the handshake,
 * and — once a joiner's transfer finishes — treats it as all or nothing:
 * any rejected dataset means none is applied, and anything that would
 * overwrite local data is confirmed once for the whole transfer before
 * onSyncedWorkoutData/onSyncedBodyCompData/onSyncedTags
 * are called (planTransfer.ts). See CLAUDE.md's "Architecture: app state and local
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
  existingTagsCount,
  onSyncedWorkoutData,
  onSyncedBodyCompData,
  onSyncedTags,
}: SyncDialogProps) {
  const [received, setReceived] = useState<Partial<Record<SyncDataset, unknown>>>({});
  // The one confirmation for the whole transfer, when anything would be overwritten.
  const [pending, setPending] = useState<TransferPlan | null>(null);
  // Datasets whose payload wasn't even valid JSON, and datasets that arrived
  // but failed validation. Both are told to the athlete and leave the local
  // copy untouched, and either one means nothing at all is applied (see planTransfer).
  const [unreadable, setUnreadable] = useState<SyncDataset[]>([]);
  const [skipped, setSkipped] = useState<SkippedDataset[]>([]);
  const processedRef = useRef(false);
  const attemptedRef = useRef(false);

  const handleDatasetReceived = useCallback((dataset: SyncDataset, json: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setUnreadable((prev) => [...prev, dataset]);
      return;
    }
    setReceived((prev) => ({ ...prev, [dataset]: parsed }));
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
    setPending(null);
    setUnreadable([]);
    setSkipped([]);
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

    // A sync is all or nothing: one rejected or unreadable dataset means none
    // of them is applied, and everything that would overwrite is confirmed
    // together (see planTransfer).
    const plan = planTransfer(
      received,
      {
        workout: existingWorkoutCount,
        bodyComp: existingBodyCompCount,
        tags: existingTagsCount,
      },
      {
        workout: onSyncedWorkoutData,
        bodyComp: onSyncedBodyCompData,
        tags: onSyncedTags,
      },
      unreadable
    );

    // A transfer that delivered something unusable is a failure worth
    // counting: the fixed reason only, never which dataset or why (see posthog.ts).
    if (plan.skipped.length > 0) {
      capture({ name: "sync_failed", props: { role: "joiner", reason: "invalid_data" } });
      setSkipped(plan.skipped);
      return;
    }
    if (plan.conflicts.length > 0) {
      setPending(plan);
      return;
    }
    plan.flush();
    captureJoinerSuccess(received);
    onOpenChange(false);
  }, [
    state,
    role,
    outgoing,
    received,
    unreadable,
    existingWorkoutCount,
    existingBodyCompCount,
    existingTagsCount,
    onSyncedWorkoutData,
    onSyncedBodyCompData,
    onSyncedTags,
    onOpenChange,
  ]);

  const confirmReplace = () => {
    if (!pending) return;
    for (const conflict of pending.conflicts) conflict.apply();
    pending.flush();
    captureJoinerSuccess(received);
    setPending(null);
    onOpenChange(false);
  };

  const declineReplace = () => {
    capture({ name: "sync_failed", props: { role: "joiner", reason: "declined_overwrite" } });
    setPending(null);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && !pending} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{role === "host" ? "Sync to another device" : "Sync from another device"}</DialogTitle>
            <DialogDescription>
              Connects directly to your other device. Nothing is ever sent through a server.
            </DialogDescription>
          </DialogHeader>

          {skipped.length > 0 ? (
            <div className="flex flex-col gap-3">
              {skipped.map((item) => (
                <p key={item.dataset} className="text-sm leading-relaxed">
                  The {DATASET_LABEL[item.dataset]} from the other device was rejected. {item.reason}
                </p>
              ))}
              <p className="text-sm leading-relaxed">Nothing was synced. Your data on this device is unchanged.</p>
              <Button variant="outline" size="sm" className="self-start" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : state.status === "failed" ? (
            <p className="text-sm text-muted-foreground">{failureMessage(state.reason)}</p>
          ) : role === "host" ? (
            <HostQrView state={state} onScanAnswer={submitAnswer} />
          ) : (
            <JoinerScanView state={state} onScanOffer={handleScanOffer} />
          )}
        </DialogContent>
      </Dialog>

      {pending ? (
        <ReplaceConfirmDialog
          conflicts={pending.conflicts}
          source="device"
          onConfirm={confirmReplace}
          onCancel={declineReplace}
        />
      ) : null}
    </>
  );
}
