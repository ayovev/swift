# The bundle split

Developer reference, extracted from CLAUDE.md so that file stays short. CLAUDE.md keeps the rules that apply everywhere and points here for the detail; read this before changing an import that touches the upload screen, the dashboard, a view, the sync wizard or the classify/analytics pipeline. Back to the [README](../README.md).

The production build used to be one 1.73 MB chunk (535 kB gzipped) that every visit paid for in full. It is now split along who actually
needs what, and `tests/lazySplit.test.ts` fails if a static import undoes any of it. Before changing an import that touches these, read this.

- **The upload screen does not load the dashboard.** `App.tsx` reaches `Dashboard` only through `lazyComponent()`, so Recharts and every view
  stay out of the first load of a new visitor. The fetch starts early for whoever will need it: a returning athlete as soon as storage says
  there is a log, a first-time visitor in idle time on the landing page, an upload or the sample the moment it begins (so the parse and the
  download overlap).
- **Overview is in the Dashboard chunk; the other views are their own chunks** (`dashboard/lazyViews.ts`: Workouts, Lifts, the domain and modality
  pages, Movements, Body Comp, Progress, Timeline). `preloadViews()` fetches them in idle time once the dashboard has mounted, so by the time one is
  opened it is already here. Add a new view to `lazyViews.ts` and render it inside `<LazyView>`, never as a static import in `Dashboard.tsx`.
- **`lazyComponent()` (`components/ui/lazyComponent.tsx`) is used instead of bare `React.lazy` on purpose.** `React.lazy` always suspends on its
  first render, even for a chunk the browser already has, and React then holds the real content back for ~300ms after committing the fallback.
  Measured with plain `React.lazy`: every view opened 300 to 500 ms slower than before the split, preloaded or not. `lazyComponent` renders a
  chunk that has arrived synchronously, as a static import would, and only a mount that really has to wait suspends. Which one a mount uses is
  fixed at mount, so a mount that waited keeps its state. Do not swap it for `React.lazy`.
- **The sync wizard is fetched on first use.** `SyncEntryPoint` mounts `SyncDialog` (the only importer of `jsqr`, `qrcode` and real WebRTC, ~175 kB)
  after the press has waited on the chunk (`whenLoaded()`, with the button `aria-busy`, not behind a Suspense fallback), and starts the fetch on hover and
  focus. Backup is not split: it is ~30 kB of source, shares its validators with sync's planner, and the landing page needs it.
- **PostHog loads after the first paint** (`posthog.ts`: `import("posthog-js")` in idle time; about a third of the old bundle). `capture()` keeps its
  signature; events fired before the library is up are held in memory with their time and sent in order once it is. The privacy config is untouched and
  `tests/analytics.test.ts` still pins it. If the chunk can't load, held events are dropped: analytics is never a requirement. The chunk is served from our
  own origin, so the CSP's `script-src 'self'` covers it and every lazy chunk; no host was added (`tests/securityHeaders.test.ts` pins that).
- **Loading and failure states** (`components/ui/LazyView.tsx`): a lazily loaded view shows one plain line, invisible for the first 300ms (`.loading-note`,
  `index.css`) so a fast connection never flashes it, in a box that reserves a view's height so the footer doesn't jump. A chunk that fails to load
  (usually a tab left open across a deploy) gets a plain notice and a Reload button rather than a blank page.
- **`vite.config.ts` names a `react` chunk and nothing else.** Left to itself Rolldown lays chunks out by who imports what, and with a PostHog key set about
  70 kB of dialog and Radix code landed in the entry chunk. A named group for Recharts was tried and dropped: it pulled Recharts into the entry chunk's
  static imports, which is exactly what the split avoids. Check the result with a build that has `VITE_PUBLIC_POSTHOG_KEY` set (as Vercel does); without a
  key PostHog is dead-code-eliminated and the numbers flatter the build.
- **The classify/analytics pipeline is its own chunk** (`buildInsights`, the movement lexicon, keyword lists and aggregators, ~40 kB; the entry chunk went
  from 228 to 189 kB). `lib/analytics/pipeline.ts` is the one seam: `loadPipeline()` is a dynamic import that `App.tsx` starts as an upload or the sample
  begins (it overlaps the parse), and a returning athlete stays on the loading screen until it has arrived, as does a reveal from sync or backup restore.
  A chunk that fails to load shows `ChunkFailedNotice` (Reload), never the upload screen, because that screen's error dismisses through `reset()`, which
  wipes storage. `tests/lazySplit.test.ts` walks the entry point's static imports and fails if `lib/classify/*`, `buildInsights` or the aggregators are
  reachable. That chain was real once: `weighIns` -> `bodyContext` -> `display` -> `sessions` -> `liftSubjects` -> `buildDashboardData` -> the lexicon,
  broken by moving `REPS_PER_ROUND` and `parseRoundsReps` into `insights/roundsReps.ts`. Keep that file, and anything the upload screen imports, free of
  imports from the pipeline.
- **Not split, left for later:** `react-day-picker` and `date-fns` ride in the Dashboard chunk with the Settings sheet and date picker.
