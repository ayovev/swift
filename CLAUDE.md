# Swift

Client-side web app that turns an athlete's SugarWOD training-history CSV export into a
dashboard: consistency over time, lift/benchmark progression, PRs, a breakdown across the
10 CrossFit GPP domains, and a proportional M/W/G modality mix. Vite + React 19 +
TypeScript 7, Tailwind v4, shadcn/ui, Recharts, Vitest. Deployed as a static SPA on Vercel.

This file covers *how* the code works and which parts must not be "improved". `README.md`
covers what the product is and how to run it. Between them they are now the whole written
record: the original v1 requirements document has been retired, so where a behaviour is
deliberate, the reason lives in a comment or a test next to it rather than in a spec
elsewhere. Keep it that way — if you change something load-bearing, move its reason with it.

## Commands

npm only. Never yarn, never pnpm — the lockfile is `package-lock.json`.

```
npm install
npm run dev         # vite dev server
npm run build       # tsc -b (type-checks app + node configs) then vite build
npm test            # vitest run — the whole suite, jsdom
npm run test:watch
npm run typecheck   # tsc -b --noEmit
```

Run tests from the repo root: `tests/fixtures/sampleRows.ts` resolves the sample CSV from
`process.cwd()` (not `import.meta.url`, which is an `http://` URL under jsdom).

## Hard constraints — do not break these

1. **No backend, no accounts. Training data never leaves the browser.** Parsing, classification
   and aggregation all run in the browser (`src/lib/csv/parseCsv.ts` reads a `File`/string; the
   pipeline is pure functions). **No training data may ever leave the browser.** There is no
   API layer to add one to, and this promise is the product. The only request that carries
   workout data is the app *downloading* its own bundled demo file
   (`public/sample/sugarwod-sample-export.csv`) in `src/App.tsx` — that's a download from our
   own origin, not an upload of anyone's log.

   The one deliberate exception to "nothing persists" is still local-only: an athlete's
   uploaded rows (SugarWOD and, separately, InBody) are cached in the browser's own IndexedDB
   (`src/lib/storage/`) purely so a reload doesn't force a re-upload. It doesn't relax the rule
   above — the data still never leaves the browser, and there is still no backend or account
   behind it. `App.tsx`'s "Start over" control wipes it via `idbClearAll()`, and the bundled
   sample file is deliberately never written to this store, so demo mode never leaves anything
   behind. This does not extend to analytics — constraint 2 below is unaffected.
2. **Analytics may only send closed-vocabulary usage events.** See `src/lib/posthog.ts`: the
   `SwiftEvent` union *is* the entire analytics surface, and it is deliberately narrow rather
   than `Record<string, unknown>`. Never add workout content, movement names, athlete notes,
   filenames, exact row counts or anything else derived from a member's CSV — row counts go
   through `bucketRowCount()` and timings through `bucketDuration()` because an exact number
   is closer to a fingerprint. `CsvErrorCategory` (`parseCsv.ts`) is a fixed vocabulary for
   the same reason. The privacy config is load-bearing, not boilerplate: `person_profiles:
   "never"`, `disable_session_recording` (recording would capture the athlete's workouts on
   screen), `autocapture: false` (it would send the text of whatever was clicked), and
   `identify()` is never called. `tests/analytics.test.ts` reconstructs real workout titles
   from the sample export and asserts none of them appear in any payload — if that test fails,
   the change is wrong, not the test.
3. **The whole codebase is TypeScript.** No `.js`/`.jsx` source anywhere, config included
   (`vite.config.ts`, `tsconfig.*.json`). The one exception is `scripts/generate_parity_fixture.py`,
   a dev-only run-once script that is not application code and is never bundled.
4. **The classifier is validated against a golden fixture.** `tests/fixtures/python_reference_output.json`
   was generated from the Python reference implementation in the Stride PoC over the
   1,209-row sample export. Any change to the GPP keyword lists, the exclusion list, or the
   matching logic **will** move `tests/buildDashboardData.parity.test.ts`. The required
   workflow: measure the change against the real sample export, then update that test's
   `EXPECTED_DIFF` (and the bounds/comments) deliberately, entry by entry, with the reason
   for each. **Never loosen an assertion, widen a tolerance, or drop a row from the diff list
   to make the suite go green.** The test's value is that it asserts the diff is *exactly*
   the intended list and nothing else.

## The shared matching engine — read before touching classification

Both classifiers run on **one** engine: `src/lib/classify/matcher.ts`. Read its header
comment before changing anything. One engine is the design: a fix or a quirk applies to both
classifiers instead of two sets of ad-hoc matching drifting apart. Both also read exactly the
same input string, `classifiableText(row)` = lowercased `title + description + barbell_lift`.

**It uses plain substring matching, not word boundaries, and that is deliberate.** SugarWOD
concatenates description lines with no separator at all, so real exported text looks like
`21-15-9DeadliftsPull-ups` and `25 burpeeswall-ball shots` — the character before a genuine
match is very often a letter. A `\b`/leading-letter-boundary rule was measured against the
real export: it silently drops many legitimate tags and gains nothing. Substring matching is
correct *for this data*. Do not "tighten" it; `tests/matcher.test.ts` pins the glued-word
shapes verbatim from the export.

The cost is a small number of genuine false positives, handled **surgically, per keyword**:

- `exclude: [...]` rejects an occurrence that falls inside a longer string (e.g. `carry`
  inside `carryover`). GPP exclusions live in `KEYWORD_EXCLUSIONS` in
  `src/lib/classify/domainKeywords.ts`; lexicon entries carry their own. Every entry there was
  found by scanning the sample export, and anything added must be justified the same way —
  measured, not assumed.
- `mode: "token"` is for short abbreviations (`du`, `kb`, `t2b`, `db`, …) where no exclusion
  list could ever be complete: requires a non-letter or string edge to the left, and allows
  only an optional trailing `s`. So `50du` and `dus` match, `double` and `individual` do not.

`findMatch` returns the first real match (drives the "matched on" keyword shown in the UI);
`findAllMatches` returns non-overlapping ranges (drives modality range-claiming).

**Inflection belongs in the engine, not in the lists.** Substring matching already covers any
inflection that merely appends to the keyword (run/runs/running, press/presses, burpee/burpees).
The one class it cannot reach is a changing stem, so `searchForms()` in `matcher.ts` also
searches the English consonant + `y` → `i` form of every rule: `carry` reaches
carries/carried, `heavy` reaches heavier/heaviest. The vowel check matters — `day` must not
become `dai` and match `daily`. Exclusions still apply to the stem, so a stem cannot smuggle
back a false positive that `exclude` rejects.

If another form is being missed, fix it here so the fix holds for every keyword and every
athlete's future export — do not hand-add one more surface form to a keyword list, which
fixes this export and nothing else. `movementLexicon.ts` deliberately has **no** `carries`
entry for this reason. Whatever the engine grows, measure it against the sample export first:
a broadening rule must land only on genuine inflections, and it will move the parity diff.

## Architecture: classify → analytics → components

`src/lib/classify` → `src/lib/analytics` → `src/components/dashboard`.

- **classify**: `matcher.ts` (engine), `domainKeywords.ts` (`classifyWithReasons`,
  `classifyDomains` → GPP domains), `movementLexicon.ts` + `classifyModality.ts`
  (`findMovements`, `classifyModality`, `sharesTo100` → M/W/G).
- **analytics**: `buildInsights.ts` is the whole pipeline entry point. It calls `parseRows()`
  from `buildDashboardData.ts` **once** and hands the same `ParsedRow[]` to
  `buildFromParsedRows()` and `buildModalityData()`. Rows are date-parsed, text-built and
  GPP-classified exactly once and shared, because at ~1,200 rows doing it twice is the
  difference between comfortably inside the 5-second performance budget and not. Do not make
  `buildModalityData` re-parse the file, and do not add a second `parseRows()` call path.
  `parseRows()` also takes the selected `Granularity` (`granularity.ts`; daily/weekly/monthly/
  quarterly/yearly, monthly by default) and bakes each row's aggregation bucket key into
  `ParsedRow.bucket` once, up front — the aggregators below never see or choose a granularity
  themselves, they just group by whatever `bucket` already says. Similarly, both aggregators
  pre-group rows by bucket into a `Map` rather than re-filtering the full set per domain per
  bucket (10 domains × ~47 monthly buckets is noticeably slow otherwise, and daily/weekly
  buckets are more numerous still).
- **components**: `Dashboard.tsx` renders 18 tabs (`TabNav.tsx` → `ALL_TABS`): Overview,
  Workouts, the ten GPP domains, the three modalities, Body Comp, Plateaus, and Alignment. A
  single `DomainTab` drives all ten domain tabs and a single `ModalityTab` all three modality
  tabs — they differ in data, not structure. Body Comp is its own component (`BodyCompTab.tsx`),
  always present in the nav even before any InBody data is loaded, and Plateaus/Alignment follow
  the same always-present treatment (see "Architecture: Plateau Detector and Alignment" below).
  `buildModalityData`'s output shape deliberately mirrors `buildDashboardData`'s so those two
  components stay near-identical; keep that symmetry.

Two things that look like the same idea but are not — don't unify them:

- **The 10 GPP domains are independent, non-exclusive tags.** Most workouts hit three or
  more, so `domain_trends[d].pct` (share of workouts in that bucket) sums to ~300% across
  domains. `stacked.bucket_shares` is the separate normalized view that divides by *total
  tags*, not total workouts, so it sums to 100.
- **The 3 modalities are a proportional split of one workout, summing to 100.** Each distinct
  movement contributes equal weight to its modality; `sharesTo100()` uses largest-remainder
  rounding so a three-way split reads 33.3 / 33.3 / 33.4 and a stacked chart sums to exactly
  100 (independently rounded thirds give 99.9, which looks broken). Shares are tenths-exact,
  so compare a rounded sum, never a raw float sum.

Modality semantics are canonical CrossFit, documented at the top of `movementLexicon.ts`:
**M is monostructural only** (run/row/bike/ski/rope), not "anything that makes you breathe
hard" — so Fran is 50 W / 50 G / 0 M. Collisions resolve *structurally*, not by hand-tuned
ordering: `findMovements` claims character ranges longest-phrase-first, so a specific movement
always beats the generic one inside it. Array order in `MOVEMENT_LEXICON` is irrelevant;
adding an entry never requires reordering anything else. A movement counts once however many
times it is named. Workouts where nothing is recognised are marked `classified: false` and
**excluded from every average**, not counted as zeroes (otherwise a logged non-workout drags
every modality's share down); the count is surfaced as `unclassified_count` so the UI can
caveat it honestly.

Order *is* significant in `DOMAIN_KEYWORDS` (`domainKeywords.ts`): the keyword reported as
"matched on" in the drill-down is whichever is checked first and hits. Reordering a list
changes what the UI says a workout matched on — and the parity fixture records it — even
though it cannot change *whether* the domain matched.

`repMax.ts` parses rep-max notation out of lift titles; it is additive to the Python
reference, so the parity test strips it before comparing lift series.

## Architecture: Plateau Detector and Alignment

`src/lib/analytics/plateauDetector.ts` and `src/lib/analytics/alignment.ts` are a second
insights pipeline, deliberately standalone from `buildInsights.ts` above — they need the
InBody dataset, which the SugarWOD-only pipeline never touches. Read each file's own header
comment before changing anything; this section is a map, not a restatement.

- **`getPlateauInsights(workouts, inbodyScans, asOfDate)`** classifies each lift/named-benchmark
  (split by RX/Scaled) as `improving`, `plateaued_body_comp`, `plateaued_other`, or
  `insufficient_data`, by comparing a recent session-count window against the previous one (not
  a calendar lookback — real benchmark logging is too sparse for that) and diffing the InBody
  scans nearest that window's boundaries. `insufficient_data` always carries a `reason` string
  naming which eligibility gate failed and by how much (`formatGateShortfall()`) — never a
  silent "not enough data."
- **`getAlignment(plateauInsights, inbodyScans, asOfDate)`** rolls that per-subject output up
  into one whole-athlete read: `aligned` or `tension` (or `insufficient_data`, same `reason`
  convention). It has its own eligibility gate on top of #1's (at least 3 classified subjects,
  at least 2 InBody scans in range) and its own window — the union of every classified
  subject's window, since #1 computes an independent window per subject rather than one shared
  window. `tension` is reserved for when the two signals contradict each other; a performance
  decline alongside a declining body comp reads as `aligned` (a consistent, if undesirable,
  story), never as bad.
- Both share `isBodyCompDeclining()` (lean mass down and fat mass up) so "declining body comp"
  means exactly the same thing at the per-lift and whole-athlete level.
- Both are wired into `App.tsx` behind the same gate: neither runs until both a SugarWOD upload
  and an InBody upload are `"ready"`. Neither is part of `Insights`/`buildInsights.ts`'s return
  shape — they're computed separately in `App.tsx` and passed to `Dashboard.tsx` as their own
  props, rendered by `PlateauTab.tsx`/`AlignmentTab.tsx`.

## Architecture: app state and local persistence

`src/App.tsx` owns two independent state machines — `AppState` (SugarWOD rows) and
`BodyCompState` (InBody rows, from `BodyCompTab.tsx`) — that are deliberately never joined as
one row shape (see the comment above `handleBodyCompFile`). The Plateau Detector and Alignment
rollup above do read both together, but as two separate inputs to a pure function, never merged
into one row. Both now sit on top of a browser-local persistence layer, `src/lib/storage/`,
added after the app initially held everything in memory only.

- **`idbStore.ts`** is the only file that touches `indexedDB` directly: one database
  (`"swift"`), one object store (`"csv-uploads"`), keyed by string. A single store rather than
  one per dataset means a future dataset is just a new key — never a version bump or an
  `onupgradeneeded` migration. Every exported function (`idbGet`/`idbSet`/`idbDelete`/
  `idbClearAll`) swallows its own failures and resolves to a safe default, mirroring
  `readStored`/`writeStored` in `src/lib/theme/useTheme.ts` — persistence is a convenience,
  never a requirement, so a blocked or disabled database must not break the app.
- **`workoutStorage.ts`** / **`bodyCompStorage.ts`** / **`viewPreferencesStorage.ts`** are thin
  typed wrappers, one key each (`"workout-rows"`, `"body-comp-rows"`, `"view-preferences"`).
  Nothing outside `src/lib/storage/` calls `idbGet`/`idbSet`/`idbDelete` directly — a new
  dataset gets its own wrapper file, not a call site that reaches past it.
- **Restore-on-mount**: `App.tsx` starts in `{ status: "loading" }` (reusing `Landing`'s
  existing loading UI — no new component) and a mount-only effect loads all three from storage
  in parallel before deciding whether to show the dashboard or the upload screen.
- **Write points**: a successful SugarWOD parse persists only when `source === "upload"` — the
  bundled sample file is deliberately never cached, so demo mode never leaves anything behind.
  A successful InBody parse always persists (there's no sample-data concept for it). `range` and
  `granularity` persist from exactly two call sites in `App.tsx` — `persistRangeSelection`
  (passed to `DateRangePicker` as `onSelect`) and `persistGranularity` (passed to
  `GranularityPicker`/the daily-auto-downgrade effect as `onGranularityChange`) — rather than a
  `useEffect` mirroring every state change into storage. That's deliberate, not an oversight: a
  blanket mirror would also fire on `run()`'s and `reset()`'s own internal `setRange`/
  `setGranularity` calls, racing "Start over"'s `idbClearAll()` and re-saving the very defaults
  the clear just removed. A fresh upload (`source === "upload"` in `run()`) explicitly persists
  its own reset to `monthly`/`all_time` for the same reason a fresh upload persists its rows —
  otherwise a reload right after would restore the *previous* file's leftover view prefs over
  the new file's fresh state.
- **What's actually stored isn't the date range** — it's the *preset id* (`DateRangePreset`,
  `dateRange.ts`) plus concrete dates only for the `"custom"` case. Presets are anchored to
  today's real-world date (see `DateRangePicker.tsx`), so restoring "Last 3 months" recomputes
  against the day the athlete reopens the app rather than replaying a frozen window from last
  session. `DateRangePicker`'s `preset` is a controlled prop for this reason — it used to be the
  component's own `useState`, but a persisted preset has to be set from outside on restore. Its
  `onSelect` reports the new range and preset together in one call (not two separate callbacks)
  so the one write in `viewPreferencesStorage.ts` never observes one without the other. A Dayjs
  instance also doesn't survive IndexedDB's structured clone with its prototype methods intact,
  so a custom range's dates are stored as ISO strings and rehydrated with `dayjs(...)` on load.
- **Clear point**: `reset()` calls `idbClearAll()` alongside its existing state resets. This
  isn't just UX — without it, "Start over" would only reset in-memory state, and a reload would
  silently restore the data the button just appeared to discard. This also clears `range` and
  `granularity` back to their in-memory defaults (`null`/`monthly`) on the next restore, same as
  the two uploaded datasets.
- The theme preference remains on its own `localStorage` key (see Theming below), not this
  layer — it needs to be read synchronously before first paint to avoid a flash of the wrong
  mode, which IndexedDB's async API can't do.

This doesn't relax hard constraint #1 above — the cache is still local-only and still wiped by
"Start over"; see that section for the actual invariant.

## Theming

Black-and-white base in both modes, plus **one** user-selected accent — the only chromatic
element the athlete controls. Every token in `src/index.css` is achromatic (chroma exactly 0),
with two fixed exceptions that never derive from the accent: `--destructive`, the error/delete-action
red, and the `--repmax-1/2/3/5` tokens (red/orange/green/blue). The `--repmax-*` tokens colour the
lift-chart dots and legend by rep scheme (`FIXED_REPMAX_COLORS` in `chartUtils.ts`), and the
Overview and per-row M/W/G bars reuse three of them (`FIXED_MODALITY_COLORS`). They are fixed on
purpose: an accent-derived alternative was tried side by side and dropped, so there is no colour-mode
toggle and no `accentRepMaxColors()`; don't reintroduce one. The accent itself arrives as CSS custom
properties written to `:root` by `src/lib/theme/useTheme.ts`, so shadcn primitives, focus rings
and Recharts series pick it up with no per-component wiring.

- A swatch in `ACCENT_SWATCHES` (`src/lib/theme/palette.ts`) is an **OKLCH hue + peak chroma**,
  not a list of hex values. `deriveRamp()` derives the 50–950 ramp from fixed perceptual
  lightness steps with a chroma taper at both ends. OKLCH because stepping lightness there
  gives an even ramp; HSL bunches up.
- `ROLE_SHADES` assigns different shades per mode (light mode needs the accent dark enough
  for 4.5:1 on white; dark mode needs the opposite). Using one shade for both is the usual
  reason custom accents look broken in one mode.
- `pickForeground()` chooses button text by **measured** contrast, so a light amber button
  gets black text where blue gets white. Never hardcode a foreground.
- Out-of-gamut colours are clamped **programmatically** — `clampToGamut()` binary-searches
  chroma down while preserving lightness and hue. Don't hand-tune per-swatch constants to
  stop clipping; that breaks the moment a swatch is added.
- **Contrast is enforced by tests, not by eye.** `tests/themeContrast.test.ts` asserts, for
  every swatch × both modes: button text ≥ 4.5:1, links ≥ 4.5:1 on the page, focus ring and
  primary surface ≥ 3:1, body text on the subtle background ≥ 4.5:1, chart bands in gamut,
  distinct, and separable. **Adding a swatch means that suite must still pass** — tune the
  swatch's hue/chroma until it does; do not lower a threshold.
- `chartSeries()` derives N steps along the accent's own hue rather than a rainbow, which is
  what keeps a ten-series stacked chart reading as black, white and the athlete's one colour.
  (The rep-max dots and M/W/G bars above are the exception: they use fixed colours.)
- The pre-hydration script in `index.html` duplicates the mode logic and the `swift.theme`
  localStorage key from `useTheme.ts` to avoid a flash of the wrong mode. **Change both together.**
  Theme reads/writes are wrapped in try/catch — private browsing must never break the app.

## Voice & personality

The copy in this app reads like a training partner who's good with data, not a coach trying
to motivate you. That's a deliberate stance, not an accident: the person exporting a SugarWOD
CSV already tracks their own training and doesn't need to be sold on why it matters, so the
UI never performs enthusiasm on their behalf. The landing page's own tagline is the whole
thesis in one line: "The workout ends. The work doesn't."

- **State what's true; don't cheer for it.** `OverviewTab.tsx`'s stat labels ("workouts
  logged", "personal records") and `HowItWorks.tsx`'s steps describe what happened in plain
  terms, never "Great job!" or "You're crushing it." The numbers and charts do the motivating.
- **Use the sport's own vocabulary, verbatim.** RX, Scaled, PR, the ten GPP domain names,
  M/W/G — these come from CrossFit/SugarWOD and are never softened or renamed for
  friendliness. See `DOMAIN_BLURBS`/`MODALITY_BLURBS` (`types/dashboard.ts`,
  `types/modality.ts`) and the tab labels in `TabNav.tsx`.
- **Plain language over clever language.** `plainParseMessage()` (`src/lib/csv/parseCsv.ts`)
  set this precedent for errors; it applies everywhere else too — empty states, hints, button
  labels. If a sentence needs a second read, rewrite it.
- **No gamification affect.** No streaks, no badges, no confetti-toned copy, no exclamation
  points as a default register. There are zero exclamation points in the app's UI copy today
  ("`!important`" Tailwind modifiers in generated class strings don't count) — that's the bar.
- **Respect the athlete's competence.** Don't explain CrossFit to CrossFitters, and don't
  over-hedge a limitation — state it once and move on, the way `unclassified_count` is
  surfaced honestly rather than apologized for (see Architecture: classify → analytics →
  components above).
- **Privacy is a stated fact, not a marketed feature.** "Your file never leaves this browser.
  There's no account and no server." (`Landing.tsx`) is the model: plain declarative sentence,
  no trust-badge styling, no "we take your privacy seriously."
- **Errors are stated, not apologized for.** No "Oops," no "Sorry about that." A failure gets
  a direct sentence naming what's wrong, per `plainParseMessage()` and `CsvValidationError`
  messages in `parseCsv.ts`.

This isn't a green light for a copy pass — the existing strings above already hold this line
and don't need rewriting on this basis alone. Treat it as the filter new copy should pass
through, not a backlog of fixes.

## Testing conventions

- Tests live in `tests/`, Vitest with jsdom (`vite.config.ts`, `tests/setup.ts`); only
  `tests/**/*.test.ts(x)` are collected. Shared fixtures go in `tests/fixtures/`.
- **Write tests alongside the code, not at the end.** Every commit in this repo's history adds
  the tests for what it adds; the suite is the argument that the deviations are intentional.
- `tests/fixtures/sampleRows.ts` loads the bundled export through the **real** production
  parser, not a test-only shortcut. Use `loadSampleRows()` / `loadSampleCsvText()`.
- **Classification changes must be measured against the real sample export**, not just
  hand-written cases. Hand-written cases are for documenting intent; the export is what tells
  you the true effect. The parity fixture is committed, so the suite needs neither Python nor
  the PoC — `scripts/generate_parity_fixture.py` is only for regenerating it if the *reference*
  itself changes.
- Deliberate deviations and known limitations are **pinned as tests** rather than left
  implicit — see the "known limitations, pinned deliberately" block in
  `tests/domainClassifier.test.ts` (limitations inherited from the reference's keyword lists)
  and the lexicon-integrity block in `tests/modalityClassifier.test.ts` (lowercase phrases,
  no duplicates, valid modality). If you fix a pinned limitation, move the test rather than
  deleting it, and update the parity expectations in the same commit.
- Known benign divergences from the Python reference, already documented in the parity test:
  `Math.round` vs Python's round-half-even (tenth-of-a-percent cell differences on exact
  `.x5` ties), delta computed from rounded percentages, and pandas' unstable quicksort making
  same-date ordering arbitrary (our sort is stable and preserves CSV order). Percentage bounds
  in that test are *measured* maxima, not guesses — a real regression moves them by whole
  points, not tenths.

## TypeScript conventions and gotchas

- Import with the `@/` alias (`@/lib/...`, `@/types/...`); it is configured in both
  `vite.config.ts` and `tsconfig.app.json`.
- `tsconfig.app.json` is strict and then some: `noUncheckedIndexedAccess` (index access is
  `T | undefined` — the existing code guards or `!`-asserts deliberately),
  `exactOptionalPropertyTypes` (build the object conditionally rather than passing
  `undefined`, as `ruleForKeyword()` does), `verbatimModuleSyntax` (use `import type`),
  `erasableSyntaxOnly` (no enums, no parameter properties), `noUnusedLocals`/`noUnusedParameters`.
- Every `SugarWodRow` field arrives from PapaParse as a string and empty cells are `""`, so
  consumers must tolerate `""`. Dates are `MM/DD/YYYY` — parse with dayjs `customParseFormat`
  strictly (`parseDate()` in `buildDashboardData.ts`), never `new Date(str)`, which is
  locale-inconsistent for that format. `pr` is the literal `"PR"` and `rx_or_scaled` the
  literals `"RX"`/`"SCALED"`; anything else counts as neither.
- `REQUIRED_COLUMNS` (`src/types/sugarwod.ts`) deliberately omits `set_details` and `notes`
  because nothing reads them — a slim export must not be rejected for missing them.
- User-facing parse errors are plain language, mapped in `plainParseMessage()`. PapaParse's
  own developer-facing wording must never reach the UI; `tests/parseCsv.test.ts` guards that.
