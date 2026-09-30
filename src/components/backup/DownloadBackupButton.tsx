import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import { backupFilename, serializeBackup, serializeEncryptedBackup } from "@/lib/backup/backup";
import { downloadTextFile } from "@/lib/download";
import { capture } from "@/lib/posthog";
import type { Experiment } from "@/types/experiment";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";

interface DownloadBackupButtonProps {
  workoutRows: SugarWodRow[];
  bodyComp: BodyCompState;
  experiments: Experiment[];
  tags: ContextTag[];
  /** When set, the file is encrypted under it. Held only for the length of the click. */
  passphrase?: string | undefined;
  /** Called once the file has been handed to the browser, so the form can clear the passphrase. */
  onDownloaded?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

/**
 * Downloads the athlete's datasets as one backup file, plain or encrypted.
 * Built from what the dashboard already holds in memory; the download is a
 * local Blob, so nothing leaves the browser. The event carries only the
 * interaction name: never whether it was encrypted, and never the passphrase.
 * Deriving the key takes about half a second, so the button says so.
 */
export function DownloadBackupButton({
  workoutRows,
  bodyComp,
  experiments,
  tags,
  passphrase,
  onDownloaded,
  disabled,
}: DownloadBackupButtonProps) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const datasets = {
        workout: workoutRows,
        bodyComp: bodyComp.status === "ready" ? bodyComp.rows : [],
        experiments,
        tags,
      };
      const text =
        passphrase === undefined
          ? serializeBackup(datasets, now)
          : await serializeEncryptedBackup(datasets, now, passphrase);
      downloadTextFile(backupFilename(now), text);
      capture({ name: "interaction_used", props: { interaction: "backup_exported" } });
      onDownloaded?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="h-8" onClick={() => void download()} disabled={disabled || busy}>
      {busy ? "Encrypting…" : "Download"}
    </Button>
  );
}
