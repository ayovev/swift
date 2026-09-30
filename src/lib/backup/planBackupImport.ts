/**
 * Turns a read backup into a plan: which datasets would overwrite something,
 * which were rejected, and a `flush()` that applies everything at once.
 *
 * Why not apply as each dataset is confirmed, the way sync does: replacing the
 * workout log moves the app to its reveal screen, which unmounts the
 * dashboard (and any dialog inside it). Anything still waiting on a
 * confirmation would be dropped. So validation and confirmation happen first,
 * against `planReceived`, and nothing is written until `flush()`, which runs
 * the workout log last.
 */
import type { SyncDataset } from "@/lib/sync/chunking";
import { planReceived, type ConflictItem, type ExistingCounts, type ReceivedHandlers, type SkippedDataset } from "@/lib/sync/receivedDatasets";
import type { BackupDatasets } from "./backup";

export interface BackupImportPlan {
  /** Datasets that would replace data already on this device. Empty when nothing would be overwritten. */
  conflicts: ConflictItem[];
  /** Datasets rejected by validation; the local copy of each is left alone. */
  skipped: SkippedDataset[];
  /** Applies every queued dataset (the no-conflict ones, plus any conflict whose `apply` has run). */
  flush: () => void;
  /** True when at least one dataset is valid, so there is something to apply or confirm. */
  hasWork: boolean;
}

const APPLY_ORDER: SyncDataset[] = ["tags", "experiments", "bodyComp", "workout"];

export function planBackupImport(
  datasets: BackupDatasets,
  existing: ExistingCounts,
  handlers: ReceivedHandlers
): BackupImportPlan {
  const queued = new Map<SyncDataset, () => void>();
  const collect = <T,>(dataset: SyncDataset, apply: (value: T[]) => void) => (value: T[]) => {
    queued.set(dataset, () => apply(value));
  };
  const collectors: ReceivedHandlers = {
    workout: collect("workout", handlers.workout),
    bodyComp: collect("bodyComp", handlers.bodyComp),
    experiments: collect("experiments", handlers.experiments),
    tags: collect("tags", handlers.tags),
  };

  const { conflicts, skipped } = planReceived(datasets, existing, collectors);

  return {
    conflicts,
    skipped,
    hasWork: queued.size > 0 || conflicts.length > 0,
    flush: () => {
      // Non-conflicting datasets were queued by planReceived already; a
      // conflict queues itself when its `apply` runs, so a caller accepting
      // the prompt runs each `apply` and then `flush`.
      for (const dataset of APPLY_ORDER) queued.get(dataset)?.();
      queued.clear();
    },
  };
}
