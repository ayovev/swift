/**
 * Turns a set of received datasets (from a sync or a backup file) into one
 * all-or-nothing transfer: which datasets would overwrite local data, which
 * were rejected, and a `flush()` that applies everything at once.
 *
 * A transfer is one thing. Either every dataset in it is applied or none is,
 * so there is no per-dataset prompt and no half-restored state. The caller
 * treats any `skipped` dataset as a reason to apply nothing, shows the
 * athlete one confirmation if `conflicts` is non-empty, and then runs each
 * conflict's `apply` and `flush()`.
 *
 * Why everything waits for `flush()` instead of applying as it goes: replacing
 * the workout log moves the app to its reveal screen, which unmounts the
 * dashboard and any dialog inside it. Anything still waiting on a
 * confirmation would be dropped. `flush()` applies the workout log last.
 */
import type { SyncDataset } from "./chunking";
import { planReceived, type ConflictItem, type ExistingCounts, type ReceivedHandlers, type SkippedDataset } from "./receivedDatasets";

export interface TransferPlan {
  /** Datasets that would replace data already on this device. Empty when nothing would be overwritten. */
  conflicts: ConflictItem[];
  /** Datasets rejected by validation or unreadable; a transfer with any of these must apply nothing. */
  skipped: SkippedDataset[];
  /** Applies every queued dataset (the no-conflict ones, plus any conflict whose `apply` has run). */
  flush: () => void;
}

const APPLY_ORDER: SyncDataset[] = ["tags", "experiments", "bodyComp", "workout"];

export function planTransfer(
  received: Partial<Record<SyncDataset, unknown>>,
  existing: ExistingCounts,
  handlers: ReceivedHandlers,
  /** Datasets whose payload wasn't valid JSON. */
  unreadable: readonly SyncDataset[] = []
): TransferPlan {
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

  const { conflicts, skipped } = planReceived(received, existing, collectors, unreadable);

  return {
    conflicts,
    skipped,
    flush: () => {
      // Non-conflicting datasets were queued by planReceived already; a
      // conflict queues itself when its `apply` runs.
      for (const dataset of APPLY_ORDER) queued.get(dataset)?.();
      queued.clear();
    },
  };
}
