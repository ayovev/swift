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
import { DATASET_LABEL } from "@/lib/sync/datasetLabels";
import type { ConflictItem } from "@/lib/sync/receivedDatasets";

const COPY = {
  backup: { title: "Replace what's stored here with this backup?", incoming: "in the backup" },
  device: { title: "Replace what's stored here with the synced data?", incoming: "coming from the other device" },
} as const;

interface ReplaceConfirmDialogProps {
  conflicts: ConflictItem[];
  source: keyof typeof COPY;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one confirmation a transfer (sync or backup import) ever shows. It
 * names every dataset that would be replaced and both counts, and there is
 * no per-dataset choice: Replace applies the whole transfer, Cancel none of it.
 */
export function ReplaceConfirmDialog({ conflicts, source, onConfirm, onCancel }: ReplaceConfirmDialogProps) {
  const copy = COPY[source];
  return (
    <AlertDialog open onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <ul className="list-disc pl-5">
                {conflicts.map((c) => (
                  <li key={c.dataset}>
                    Your {DATASET_LABEL[c.dataset]}: {c.existingCount.toLocaleString()} entries now,{" "}
                    {c.incomingCount.toLocaleString()} {copy.incoming}.
                  </li>
                ))}
              </ul>
              <p>Replacing them can't be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Replace</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
