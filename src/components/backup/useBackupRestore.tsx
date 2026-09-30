import { useCallback, useState, type ReactNode } from "react";
import { ReplaceConfirmDialog } from "@/components/sync/ReplaceConfirmDialog";
import { readBackup } from "@/lib/backup/backup";
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
  /** Render once, anywhere: the overwrite confirmation. */
  dialog: ReactNode;
}

/**
 * The file half of "Backup": read a chosen file, check it, and either apply
 * it or ask first. Shared by the Settings sheet and the landing page, so a
 * backup behaves the same whether it is replacing data or restoring onto an
 * empty browser.
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

  const finish = useCallback((plan: TransferPlan) => {
    plan.flush();
    capture({ name: "interaction_used", props: { interaction: "backup_imported" } });
    setMessage("Backup restored.");
  }, []);

  const restoreFile = useCallback(
    (file: File) => {
      setMessage(null);
      void (async () => {
        const read = await readBackup(await file.text());
        if (read.status === "needs_passphrase") {
          setMessage("Nothing was restored. That backup is encrypted.");
          return;
        }
        if (read.status === "invalid") {
          setMessage(`Nothing was restored. ${read.reason}`);
          return;
        }
        const plan = planTransfer(read.datasets, existing, handlers);
        const rejected = plan.skipped[0];
        if (rejected) {
          setMessage(`Nothing was restored. The ${DATASET_LABEL[rejected.dataset]} in that backup was rejected. ${rejected.reason}`);
          return;
        }
        if (plan.conflicts.length > 0) setPending(plan);
        else finish(plan);
      })();
    },
    [existing, handlers, finish]
  );

  const confirm = () => {
    if (!pending) return;
    for (const conflict of pending.conflicts) conflict.apply();
    const plan = pending;
    setPending(null);
    finish(plan);
  };

  const dialog = pending ? (
    <ReplaceConfirmDialog
      conflicts={pending.conflicts}
      source="backup"
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { restoreFile, message, dialog };
}
