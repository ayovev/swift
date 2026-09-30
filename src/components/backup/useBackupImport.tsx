import { useCallback, useState, type ReactNode } from "react";
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
import { readBackup } from "@/lib/backup/backup";
import { planBackupImport, type BackupImportPlan } from "@/lib/backup/planBackupImport";
import { capture } from "@/lib/posthog";
import { DATASET_LABEL } from "@/lib/sync/datasetLabels";
import type { ExistingCounts, ReceivedHandlers } from "@/lib/sync/receivedDatasets";

interface UseBackupImportOptions {
  /** What this device already holds, per dataset; null where nothing would be overwritten. */
  existing: ExistingCounts;
  handlers: ReceivedHandlers;
}

export interface BackupImport {
  /** Hand this to a file picker. */
  importFile: (file: File) => void;
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
 * about than one that says plainly why it wasn't imported. Errors stay here
 * rather than going through the landing page's own error alert, whose
 * dismiss button is "Start over".
 */
export function useBackupImport({ existing, handlers }: UseBackupImportOptions): BackupImport {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupImportPlan | null>(null);

  const finish = useCallback((plan: BackupImportPlan) => {
    plan.flush();
    capture({ name: "interaction_used", props: { interaction: "backup_imported" } });
    setMessage("Backup imported.");
  }, []);

  const importFile = useCallback(
    (file: File) => {
      setMessage(null);
      void (async () => {
        const read = await readBackup(await file.text());
        if (read.status === "needs_passphrase") {
          setMessage("Nothing was imported. That backup is encrypted.");
          return;
        }
        if (read.status === "invalid") {
          setMessage(`Nothing was imported. ${read.reason}`);
          return;
        }
        const plan = planBackupImport(read.datasets, existing, handlers);
        const rejected = plan.skipped[0];
        if (rejected) {
          setMessage(`Nothing was imported. The ${DATASET_LABEL[rejected.dataset]} in that backup was rejected. ${rejected.reason}`);
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
    <AlertDialog open onOpenChange={(next) => !next && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace what's stored here with this backup?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <ul className="list-disc pl-5">
                {pending.conflicts.map((c) => (
                  <li key={c.dataset}>
                    Your {DATASET_LABEL[c.dataset]}: {c.existingCount.toLocaleString()} entries now,{" "}
                    {c.incomingCount.toLocaleString()} in the backup.
                  </li>
                ))}
              </ul>
              <p>Replacing them can't be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm}>Replace</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { importFile, message, dialog };
}
