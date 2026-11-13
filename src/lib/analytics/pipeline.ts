/**
 * The one lazy seam to the classify/analytics pipeline (`buildInsights` and everything it reaches: the movement lexicon, the GPP
 * keyword lists and the aggregators). A first-time visitor on the upload screen has no log to classify, so none of it is fetched
 * until a log is about to exist: `App.tsx` starts `loadPipeline()` as an upload or the sample begins (so the fetch overlaps the
 * parse) and a returning athlete awaits it before the dashboard is shown. `tests/lazySplit.test.ts` fails if anything but this file
 * imports `buildInsights` as a value. See CLAUDE.md, "Architecture: the bundle split".
 *
 * `import type` is erased at build time, so the types of `buildInsights` stay usable everywhere.
 */
type Pipeline = typeof import("@/lib/analytics/buildInsights");

let loaded: Pipeline | null = null;
let pending: Promise<Pipeline> | null = null;

/** Starts (or joins) the fetch. A failed fetch is forgotten, so the next call tries again rather than replaying the failure. */
export function loadPipeline(): Promise<Pipeline> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("@/lib/analytics/buildInsights").then(
    (m) => {
      loaded = m;
      return m;
    },
    (err: unknown) => {
      pending = null;
      throw err;
    }
  );
  return pending;
}

/** The pipeline if it has arrived, else null. */
export function getPipeline(): Pipeline | null {
  return loaded;
}
