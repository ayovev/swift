import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BodyCompState } from "@/components/dashboard/BodyCompTab";
import { backupFilename, serializeBackup } from "@/lib/backup/backup";
import { downloadTextFile } from "@/lib/download";
import { capture } from "@/lib/posthog";
import type { Experiment } from "@/types/experiment";
import type { SugarWodRow } from "@/types/sugarwod";
import type { ContextTag } from "@/types/tag";

interface ExportBackupButtonProps {
  workoutRows: SugarWodRow[];
  bodyComp: BodyCompState;
  experiments: Experiment[];
  tags: ContextTag[];
  disabled?: boolean;
}

/**
 * Downloads the athlete's datasets as one backup file. Built from what the
 * dashboard already holds in memory; the download is a local Blob, so nothing
 * leaves the browser. The event carries only the interaction name.
 */
export function ExportBackupButton({ workoutRows, bodyComp, experiments, tags, disabled }: ExportBackupButtonProps) {
  const exportBackup = () => {
    const now = new Date();
    const text = serializeBackup(
      {
        workout: workoutRows,
        bodyComp: bodyComp.status === "ready" ? bodyComp.rows : [],
        experiments,
        tags,
      },
      now
    );
    downloadTextFile(backupFilename(now), text);
    capture({ name: "interaction_used", props: { interaction: "backup_exported" } });
  };

  return (
    <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportBackup} disabled={disabled}>
      <Download className="size-3.5" aria-hidden="true" />
      Export
    </Button>
  );
}
