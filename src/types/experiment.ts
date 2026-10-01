/**
 * The retired experiment record. An experiment is a period of type "experiment" now
 * (`ContextTag`, `tag.ts`), so this shape survives only where it is genuinely the old
 * record: what an older device or an older backup file still sends, and what the stored list
 * under the retired `"experiments"` key held. It is read once and converted by
 * `experimentToTag` (`lib/analytics/experimentToTag.ts`); nothing new is ever written in it.
 *
 * `date` is an ISO string ("YYYY-MM-DD"), the same convention every persisted date follows.
 */
export interface Experiment {
  id: string;
  /** When the experiment started, "YYYY-MM-DD". */
  date: string;
  /** When the experiment ended, "YYYY-MM-DD". Unset means still ongoing. */
  endDate?: string;
  label: string;
  /** Where the "before" side started, "YYYY-MM-DD". Unset means all earlier history. */
  baselineStart?: string;
}
