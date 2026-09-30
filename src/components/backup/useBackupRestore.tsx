import { useCallback, useState, type ReactNode } from "react";
import { ReplaceConfirmDialog } from "@/components/sync/ReplaceConfirmDialog";
import { PassphraseDialog } from "./PassphraseDialog";
import { readBackup, type ReadBackupResult } from "@/lib/backup/backup";
import { capture } from "@/lib/posthog";
import { DATASET_LABEL } from "@/lib/sync/datasetLabels";
import { planTransfer, type TransferPlan } from "@/lib/sync/planTransfer";
import type { ExistingCounts, ReceivedHandlers } from "@/lib/sync/receivedDatasets";

interface UseBackupRestoreOptions {
  /** What this device already holds, per dataset; null where nothing would be overwritten. */
  existing: ExistingCounts;
  handlers: ReceivedHandlers;
}

export interface BackupRestore {
  /** Hand this to a file picker. */
  restoreFile: (file: File) => void;
  /** The last outcome as a sentence, or null. Render it near the picker. */
  message: string | null;
  /** Render once, anywhere: the passphrase prompt and the overwrite confirmation. */
  dialog: ReactNode;
}

/**
 * The file half of "Backup": read a chosen file, check it, and either apply
 * it or ask first. Shared by the Settings sheet and the landing page, so a
 * backup behaves the same whether it is replacing data or restoring onto an
 * empty browser.
 *
 * An encrypted backup asks for its passphrase first. The passphrase lives in
 * `PassphraseDialog` only while it is on screen and is handed straight to
 * `readBackup`; this hook keeps the file's text (ciphertext) and nothing else.
 * A wrong passphrase leaves the prompt open for another try.
 *
 * Nothing is written until the whole backup is known to be usable. Any
 * dataset that fails validation aborts the import: a backup is one file, and
 * a half-restored one (a workout log but no tags) would be harder to reason
 * about than one that says plainly why it wasn't restored. Errors stay here
 * rather than going through the landing page's own error alert, whose
 * dismiss button is "Start over".
 */
export function useBackupRestore({ existing, handlers }: UseBackupRestoreOptions): BackupRestore {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<TransferPlan | null>(null);
  // An encrypted file waiting for its passphrase: its text, and how the last try went.
  const [locked, setLocked] = useState<{ text: string; error: string | null; busy: boolean } | null>(null);

  const finish = useCallback((plan: TransferPlan) => {
    plan.flush();
    capture({ name: "interaction_used", props: { interaction: "backup_imported" } });
    setMessage("Backup restored.");
  }, []);

  const proceed = useCallback(
    (read: Extract<ReadBackupResult, { status: "ok" }>) => {
      const plan = planTransfer(read.datasets, existing, handlers);
      const rejected = plan.skipped[0];
      if (rejected) {
        setMessage(`Nothing was restored. The ${DATASET_LABEL[rejected.dataset]} in that backup was rejected. ${rejected.reason}`);
        return;
      }
      if (plan.conflicts.length > 0) setPending(plan);
      else finish(plan);
    },
    [existing, handlers, finish]
  );

  const restoreFile = useCallback(
    (file: File) => {
      setMessage(null);
      void (async () => {
        const text = await file.text();
        const read = await readBackup(text);
        if (read.status === "needs_passphrase") {
          setLocked({ text, error: null, busy: false });
        } else if (read.status === "ok") {
          proceed(read);
        } else if (read.status === "invalid") {
          setMessage(`Nothing was restored. ${read.reason}`);
        }
      })();
    },
    [proceed]
  );

  const tryPassphrase = (passphrase: string) => {
    if (!locked) return;
    const { text } = locked;
    setLocked({ text, error: null, busy: true });
    void (async () => {
      const read = await readBackup(text, { passphrase });
      if (read.status === "wrong_passphrase" || read.status === "needs_passphrase") {
        setLocked({ text, error: "That passphrase didn't work, or the file is damaged.", busy: false });
        return;
      }
      setLocked(null);
      if (read.status === "invalid") setMessage(`Nothing was restored. ${read.reason}`);
      else proceed(read);
    })();
  };

  const cancelPassphrase = () => {
    setLocked(null);
    setMessage("Nothing was restored.");
  };

  const confirm = () => {
    if (!pending) return;
    for (const conflict of pending.conflicts) conflict.apply();
    const plan = pending;
    setPending(null);
    finish(plan);
  };

  const dialog = (
    <>
      {locked ? (
        <PassphraseDialog
          error={locked.error}
          busy={locked.busy}
          onSubmit={tryPassphrase}
          onCancel={cancelPassphrase}
        />
      ) : null}
      {pending ? (
        <ReplaceConfirmDialog
          conflicts={pending.conflicts}
          source="backup"
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );

  return { restoreFile, message, dialog };
}
