# Swift

Client-side web app that turns an athlete's SugarWOD training-history CSV export into a
dashboard: consistency over time, lift/benchmark progression, PRs, a breakdown across the
10 CrossFit GPP domains, and a proportional M/W/G modality mix. Vite + React 19 +
TypeScript 7, Tailwind v4, shadcn/ui, Recharts, Vitest. Deployed as a static SPA on Vercel.

This file covers *how* the code works and which parts must not be "improved". `README.md`
covers what the product is and how to run it, and `docs/` holds the longer reference
(guide, privacy, architecture, classification, testing). Between them they are now the whole written
record: the original v1 requirements document has been retired, so where a behavior is
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

   The one deliberate exception to "nothing persists" is still local-only: an athlete's uploaded
   rows (SugarWOD and, separately, InBody) are cached in the browser's own IndexedDB
   (`src/lib/storage/`) purely so a reload doesn't force a re-upload. It doesn't relax the rule
   above — the data still never leaves the browser, and there is still no backend or account
   behind it. "Start over" (in the dashboard's Settings sheet, calling `App.tsx`'s `reset()`)
   wipes it via `idbClearAll()` — gated behind a confirmation dialog whenever real data is
   loaded, since it's the one control that clears everything at once (see "Architecture: app
   state and local persistence" below) — and the bundled sample file is deliberately never
   written to this store, so demo mode never leaves anything behind. Two narrower controls —
   "Replace file" for the workout log and for InBody, both in the dashboard's Settings sheet
   (the InBody one also on the Body Comp view) — let an athlete bring in a fresh CSV without
   wiping anything else. They call the exact same upload handlers a first upload uses, so only
   the one dataset being replaced changes. Backup download/restore (Settings; restore also on the
   landing page) is the same stance: Download saves a file to the athlete's own disk and Restore
   reads a local `File`, so nothing is uploaded ("Architecture: backup" below). This does not
   extend to analytics — constraint 2 below is unaffected.
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
   sample export. Any change to the GPP keyword lists, the exclusion list, or the
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

**A percentage base is a reference, not a movement** (movement classifier only). `findAllMatches(..., { skipPercentBases: true })` in `matcher.ts`,
which `findMovements` passes, rejects an occurrence directly after "% of" (with "your", "my", "the", "1RM", "5-rep max" allowed between), and
`findPercentBases` claims the whole base phrase so a shorter phrase inside it cannot match in its place (`% of clean and jerk` is not a jerk). It needs
the word "of": `75% back squat` is as likely to be the lift performed, so it is left alone. The same lift named anywhere else still counts. Its effect on the sample
is pinned by the tests: a front squat session "at 80% of your clean" is no longer also a clean, a clean pull or a snatch grip deadlift is no longer also a clean or a snatch, a typo'd
`Power Cean 4x3 @ 67% of clean` with no other movement becomes unclassified, and no domain tag moves. **The GPP domain keywords deliberately do not use it**: they have no claiming, so rejecting
"clean and jerk" would let the keyword "jerk" match inside it (measured: it adds Power and Strength tags to real rows), and the parity fixture pins them. So a
domain tag can still come from a base (pinned in `tests/domainClassifier.test.ts`); fixing that needs claiming in the domain classifier first.

## Deployment headers

`vercel.json` sends a CSP (`connect-src` limited to our origin and PostHog, so the "data never leaves the
browser" promise is also enforced by the browser), `frame-ancestors 'none'`, nosniff, HSTS and a
Permissions-Policy that grants the camera to our own origin (QR sync) and turns off microphone, geolocation and payment (features it doesn't name keep browser defaults). The one inline script (theme, `index.html`) is
allowed by hash; `tests/securityHeaders.test.ts` fails if the script changes without the hash. A new
third-party host or inline script needs the CSP updated in the same change. `posthog.ts` pins the PostHog host to the US endpoints the CSP allows, and pins PostHog's
remote-config features (exception capture, dead clicks, heatmaps, surveys) off in code.

## Architecture: the bundle split

The production build used to be one 1.73 MB chunk that every visit paid for in full; it is now split along who needs what, and `tests/lazySplit.test.ts` fails if a static import
undoes any of it. The rules that hold everywhere (the full account, with the measurements, is in `docs/bundle-split.md`; read it before changing an import in these areas):

- **The upload screen does not load the dashboard.** `App.tsx` reaches `Dashboard` only through `lazyComponent()`. Other views are their own chunks (`dashboard/lazyViews.ts`, rendered
  inside `<LazyView>`); add a new view there, never as a static import in `Dashboard.tsx`.
- **Use `lazyComponent()`, never bare `React.lazy`**: `React.lazy` always suspends on first render and held every view back 300 to 500 ms even when preloaded.
- **The classify/analytics pipeline is its own chunk behind one seam**, `lib/analytics/pipeline.ts` (`loadPipeline()`). Keep anything the upload screen imports free of imports from
  `lib/classify/*`, `buildInsights` or the aggregators (that chain was real once; `REPS_PER_ROUND` and `parseRoundsReps` live in `insights/roundsReps.ts` for this reason). A chunk that fails to
  load shows `ChunkFailedNotice` (Reload), never the upload screen, whose error dismisses through `reset()` and wipes storage.
- **The sync wizard and PostHog are fetched on first use or after first paint.** Lazy chunks come from our own origin, so the CSP's `script-src 'self'` covers them and no host is added.
- **`vite.config.ts` names a `react` chunk and nothing else** (a named Recharts group pulled Recharts into the entry chunk). Check bundle changes with a build that has
  `VITE_PUBLIC_POSTHOG_KEY` set, as Vercel does; without a key PostHog is dead-code-eliminated and the numbers flatter the build.

## Architecture: classify → analytics → components

`src/lib/classify` → `src/lib/analytics` → `src/components/dashboard`.

- **classify**: `matcher.ts` (engine), `domainKeywords.ts` (`classifyWithReasons`,
  `classifyDomains` → GPP domains), `movementLexicon.ts` + `classifyModality.ts`
  (`findMovements`, `classifyModality`, `sharesTo100` → M/W/G).
- **analytics**: `buildInsights.ts` is the whole pipeline entry point. It calls `parseRows()`
  from `buildDashboardData.ts` **once** and hands the same `ParsedRow[]` to
  `buildFromParsedRows()` and `buildModalityData()`. Rows are date-parsed, text-built and
  GPP-classified exactly once and shared, because on a real log doing it twice is the
  difference between comfortably inside the 5-second performance budget and not. Do not make
  `buildModalityData` re-parse the file, and do not add a second `parseRows()` call path.
  `parseRows()` also takes the selected `Granularity` (`granularity.ts`; daily/weekly/monthly/
  quarterly/yearly, monthly by default) and bakes each row's aggregation bucket key into
  `ParsedRow.bucket` once, up front — the aggregators below never see or choose a granularity
  themselves, they just group by whatever `bucket` already says. Similarly, both aggregators
  pre-group rows by bucket into a `Map` rather than re-filtering the full set per domain per
  bucket (10 domains × ~47 monthly buckets is noticeably slow otherwise, and daily/weekly
  buckets are more numerous still).
- **components**: `Dashboard.tsx` renders every view (`tabs.ts` → `ALL_TABS`): Overview,
  Workouts, Lifts (`LiftHistoryTab.tsx`, tab id `lift-history`: the lift, benchmark and PR cards,
  for the selected range), the ten GPP domains, the three modalities, Movements, Body Comp, and the Insights views
  (Progress, Timeline), grouped for navigation into
  five sections (see "Architecture: dashboard layout" below). A
  single `DomainTab` drives all ten domain tabs and a single `ModalityTab` all three modality
  tabs — they differ in data, not structure. Body Comp is its own component (`BodyCompTab.tsx`),
  always present in the nav even before any InBody data is loaded, and Progress and Timeline follow
  the same always-present treatment (they need only the SugarWOD log).
  `buildModalityData`'s output shape deliberately mirrors `buildDashboardData`'s so those two
  components stay near-identical; keep that symmetry.
  Each opens with a comparison strip (`charts/ComparisonStrip.tsx`): all ten domains as separate bars on one shared 0 to 100%
  axis, sorted, since they are tags that add up to about 300%, and the three modalities as one stacked bar that adds to 100. The
  two forms are the point, so don't unify them. Each bar opens its own view through the same tab change as the nav.

The **Movements** view (`MovementsTab.tsx`, under Training) lists what the lexicon can recognize: families
(`movementFamilies.ts`, every variant counts) and single movements, picked by id. It reads
`Insights.movements` (`buildMovementData.ts`), a thin reduction of the same `ParsedRow.movements`
`buildModalityData` uses, so nothing is classified twice. The workout list shows the phrase that matched,
because the matcher is a heuristic. Every such list (`WorkoutList.tsx`, also under each domain and modality chart) shows its first
`INITIAL_ROWS` (10) without a click, and a row opens to the workout's description with the matched text in a `<mark>`; descriptions
come from `all_workouts` by day and title (`Dashboard.tsx`'s `describe`), so `workout_lists` keeps the shape the parity test pins. Its analytics events are the value-free `movement_selected` and `implement_selected`.

**Picking a chart point** (`charts/ChartPick.tsx`) is the one way into the workouts behind a chart. A click, a tap or Enter on a
focused chart picks a point and a line under the chart says what it is, with an action and Clear; Escape clears. It is the same on
every input on purpose: a tap picks rather than navigating, because a phone's first tap is also what shows the tooltip. Where the
workouts are on the same page (the domain, modality and Movements charts) the list narrows to the picked bucket and opens
(`useBucketPick`, `WorkoutList`'s `scope`), and a new grouping or range clears the pick. Where they are on another view (Overview's
months, a lift's dot) the line links there, and `Dashboard.tsx`'s `openWorkouts` sets a custom date range through the same handler
the date picker uses, so the scope line says what is showing. Picking reads the point from the tooltip (Recharts moves it with the
pointer, a finger, or the arrow keys) on pointer up, two frames late, because a tap briefly activates the first point; a lift dot
names its own point (`data-pick`, a 24px hit circle), because a scatter hides its tooltip before a tap's pointer up. Both timings
were measured in Chromium with touch; Recharts' own `onClick` reports no point for a tap. Analytics: `chart_point_selected` and
`chart_point_opened`, value-free.

**Drag across a chart to set the date range** (`charts/RangeDrag.tsx`, on `ShareAreaChart` via `onRangeSelect`, so the domain, modality and
Movements charts, on `LiftChart`/`LiftGrid`, so the Lifts view, and on Body Comp's `ConsistencyChart`, `BodyCompLineChart` and one strip in `BodyCompTab`). It sets the same custom range the date picker sets, through `Dashboard.tsx`'s `selectRange` (no change of view), so the scope line
says what is showing and the picker undoes it. A mouse or pen drags on the chart (after 6px, so a click that does not move still picks a point, and the
release of a drag is never also a pick); a finger drags on a strip under the chart that only a coarse pointer shows (`pointer-coarse:`), because a drag
on the chart itself is how a phone scrolls. The lift charts are small multiples on one shared date domain and plot width, so a touch screen gets one strip
above the whole grid (not one per chart), measured from the grid and drawing its band in itself. One gesture core (`useRangeGesture`) serves both mappings: a share
chart's points are buckets spaced evenly (`useRangeDrag`, whole buckets), a lift chart's x axis is a continuous date scale (`useTimeRangeDrag`, any two
days). A bucket mapping has a layout: share and line charts draw buckets as points spaced evenly (a line chart's x axis padding insets them, 12px
on Body Comp), a bar chart as equal slices of the plot (`BucketLayout`, `indexAt`, `bucketBand`). Body Comp's line charts draw only the buckets a scan
measured, so each maps a drag over its own rows; its strip stands for the bar chart (every bucket with a scan). Positions map from the plot area measured off the chart's grid lines when a drag starts. On a share chart the range runs from the
first bucket's first day to the last bucket's last day, held inside the days the chart covers; on a lift chart it is the two days under the pointer
(logged dates are UTC midnight, so UTC is the day). Escape abandons a drag. A drag is never the only way (WCAG 2.5.7): the picker sets the same range by keyboard. Measured in Chromium
with a mouse and with touch; jsdom has no layout, so `tests/rangeDrag.test.tsx` pins the arithmetic and what the chart offers. Analytics:
`chart_range_dragged`, value-free.

**Share-over-time charts draw each bucket for what it is** (`charts/ShareAreaChart.tsx`, `shareRows`): a bucket with fewer than
`THIN_BUCKET_WORKOUTS` (5) workouts is a hollow dot off the line, a first or last bucket the range or the log only partly covers
(`coverage`, from `Dashboard.tsx`; `bucketBounds` in `granularity.ts`) stays shaded but its line is dashed, with a "from" or "to" day in its tooltip, the line
is straight, every tooltip names its denominator ("9 of 15 workouts"), a key names the marks when they appear, and under three
buckets the chart is a sentence. The grouping menu says weekly is noisy over a range longer than a year.

**Every time axis is angled the same way** (`TIME_AXIS_PROPS` in `chartUtils.ts`, -35 degrees): angled so labels don't collide as the
grouping gets finer, and one angle on every chart (flat labels were tried and dropped); `tests/timeAxis.test.ts`
fails if an `<XAxis>` sets its own angle or leaves the shared setting out.

**Every chart has a table twin and a text alternative** (`charts/ChartTable.tsx`). One "Table" switch, shown in each chart card's
header, flips every chart to its table at once, because whoever wants tables wants them everywhere; it is a per-device preference in
`localStorage` (`swift.chartView`, try/catch, in-memory only when storage throws), never synced or backed up, and its analytics name
`chart_view_toggled` says only that it was used. Tables list their newest row first. Each chart's accessible name (and svg `title` or
`desc`) is a `seriesSummary()` sentence: span, lowest, highest and latest. The evidence chart is one tab stop whose arrow keys, Home,
End and Escape walk its sessions with the hover tooltip and an `aria-live` announcement.

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
times it is named. Workouts where nothing is recognized are marked `classified: false` and
**excluded from every average**, not counted as zeroes (otherwise a logged non-workout drags
every modality's share down); the count is kept as `unclassified_count` (the page footer says
how many; no chart prints a note about it).

Movements have **stable ids**, not just labels (the full account of variants, families, the double-count audit, the `barbell_lift` column, implement labels and the measured effect of each rule on the
sample is in `docs/movement-lexicon.md`; read it before changing `movementLexicon.ts`, `movementFamilies.ts` or `implement.ts`). The rules that apply everywhere:

- Every `MOVEMENT_LEXICON` entry carries a kebab-case `id`, shared by all aliases of one movement, with one label and one modality per id (pinned in `tests/modalityClassifier.test.ts`). Anything that
  stores or filters by movement uses the id; labels are display text and may be reworded. `parseRows()` runs `findMovements` once per row into `ParsedRow.movements`, and `buildModalityData`
  classifies from that rather than re-reading the text.
- **Variants are their own ids and their family keeps them** (`strict-pull-ups` is in the `pull-up` family). `movementFamilies.ts` is a deliberate list, never a prefix match, so a new entry cannot
  silently join a family. The longer phrase wins the range, which also ends double counts; a variant phrase must carry any suffix a shorter phrase could claim.
- **`barbell_lift` outranks the text**: `findRowMovements()` reads it first through the same lexicon, and a family's generic bare word ("squat", "clean") is dropped when the typed lift is a more
  specific member. A lift named only as the base of a percentage is not read as that movement.
- **A brand or a pace is not a movement** (`assault bike`, `echo bike` are aliases of `bike`; `sprint` of `run`). Bare equipment words (`db`, `kb`, `dumbbell`, `kettlebell`) are deliberately **not**
  lexicon entries, and dumbbell and kettlebell versions of lifts are not separate ids.
- **Implement is a label on a movement, not a movement** (`MovementHit.implement`, read from the words directly before the first mention). It never adds a movement or moves a split.
- **A double count is found by auditing the sample**, then asking whether the sport names the touching pair as one movement; a `+` complex and glued lines stay several. Measure every change against the
  sample export and record the effect, as the parity workflow requires.
- Movement and family labels are sentence case (pinned in `tests/modalityClassifier.test.ts`); inside a sentence use `labelInSentence()` (`buildMovementData.ts`), never `toLowerCase()`.

Order *is* significant in `DOMAIN_KEYWORDS` (`domainKeywords.ts`): the keyword reported as
"matched on" in the drill-down is whichever is checked first and hits. Reordering a list
changes what the UI says a workout matched on — and the parity fixture records it — even
though it cannot change *whether* the domain matched.

`repMax.ts` parses rep-max notation out of lift titles; it is additive to the Python
reference, so the parity test strips it before comparing lift series.

## Architecture: the progress verdict (Insights front door)

`src/lib/analytics/insights/` is the engine behind the Progress view (`LiftsTab.tsx`, tab id `lifts`, over `components/dashboard/progress/`).
Read each file's header comment before changing it; the cases are `tests/progressVerdict.test.ts`, `tests/progressDisplay.test.ts` and
`tests/LiftsTab.test.tsx`, and every threshold is a `PV_*` constant in `insightConfig.ts`.

- **`sessions.ts`**: a *subject* is one lift or named benchmark with RX and Scaled kept separate (decided, not open: a Scaled lift is a different load or movement, and merging would blur a verdict); a *session* is one subject on one day (the best
  of the day). A lift's value is its estimated 1RM (average of Epley and Brzycki) from any 1 to 8 rep scheme; SugarWOD's PR flag is deliberately
  not read (Overview's "most recent PR" stat is the one reader of the flag, as a logged fact, and feeds nothing here). It builds on `liftSubjects.ts` (name normalization, RX/Scaled split, the 1RM estimate; a test pins the parity) and also keeps
  per-entry max-effort facts and the reason each Load row went unused.
- **`verdict.ts`**: session-based. The best of the recent N sessions against the best of the N before them, N = min(4, floor(n / 2)), at least 6
  sessions. `up` (change of 5% or more, or a record: the recent best 2% above everything before the recent window), `down` (5% or more worse
  with a max effort in the recent window), `not-tested-since` (the same without one: mid-cycle, never a decline), else `no-clear-change`.
- **`headline.ts`**: six groups, move-ups to RX (an up vote for 12 months), the label (`Improving`, `Steady`, `Declining` from the counts) and the
  reference date, always passed in and never read from the clock.
- **`display.ts`**, **`bodyContext.ts`**, **`period.ts`**, **`chart.ts`**: the words (RX unmarked, Scaled as a qualifier), the body-context lines,
  the "last logged in" filter (labeled "Show lifts and benchmarks last logged in": it only hides rows) and the evidence chart's numbers. Body composition never feeds a verdict or a count.
- **A lift's pounds are always called an estimate.** Every lift sentence carries "est. 1RM" (or "est." on a facts line), a record names the
  logged set it came from ("from 225 × 5", `ProgressSession.logged`), and the evidence chart is titled "Est. 1RM". Without it, "New best:
  258 lb" on Progress read as a lift one tab away from a logged best of 230 on Lifts. `tests/progressDisplay.test.ts` (DSP-12) checks it
  over the sample.

- **A verdict never rests on color.** `progress/verdictMark.tsx` is the one place a verdict's look is defined (Progress pills, Overview's
  What moved, Timeline rows): each verdict has its own glyph (↑, ↓, –, a dashed circle) beside its word, and color only repeats it: green (`--positive`) for Up
  and a move up to RX, the destructive red for Down, gray for the neutral two. `headlineLabelClass` colors the Progress headline the same
  way (Improving green, Declining red, Steady plain). Up had been the accent alone, so with the red accent Up and Down were both red.
  `tests/verdictMark.test.tsx` checks the marks stay distinct, and that no component uses a fixed Tailwind palette color (the old
  "Not tested since" amber).

The weight noise band (`weightNoiseBand.ts`) is the one older pipeline that remains: `weightBandLb` uses it to decide whether a body-weight change
is "within normal variation".

## Architecture: the weight noise band

`src/lib/analytics/weightNoiseBand.ts` answers "is this change in body weight between two readings bigger than reading-to-reading noise?" so no
body-weight sentence rests on sign alone. `getWeightNoiseBand()` estimates one band on a ladder — readings within a week of each other
(`paired-scans`), else spread around a rolling median (`residual`), else a labeled `default` (3 lb) — and returns `status: "insufficient"` only
when no reading reports a weight. Only weight is estimated: it is the one body measurement the Insights views state. Lean mass, fat mass and
body fat have no band, because nothing compares them.

- Every threshold lives in `insightConfig.ts` with a comment on how it was chosen, and every one is *tunable, validate against real data*: the
  repo bundles no real InBody history. Do not put a bare number in an insight module; add it there.
- `insights/bodyReadings.ts` (`weightBandLb`) is the one reader of the band: a body-weight change no bigger than it reads "within normal
  variation" (`bodyContext.ts`, `entryDisplay.ts`, `overview.ts`). It is fed the pooled scans and weigh-ins (`weighIns.ts`), so frequent weigh-ins reach a measured
  band where scans months apart fall to the default. The words name no source ("scan variation" read wrong on weigh-ins): the band is the
  swing between readings taken close together, whatever took them.
- The band is estimated from the athlete's whole history as of today, never from a per-subject window (too few readings).

## Open items: what is unvalidated or undecided

- **One athlete.** The `PV_*` thresholds were validated on the bundled sample and one real export, which is the same athlete (the real export
  contains the sample's rows plus newer ones). Check them on another athlete's export before trusting them.
- **Noise band.** `weightNoiseBand.ts`'s band comes from `paired-scans`, `residual` or `default`; anyone scanning monthly or less lands on `residual` or
  `default` (3 lb for weight), which is why manual weigh-ins exist.
- **Weigh-in delete has no confirmation; it has Undo** for ten seconds (`WeighInsPanel.tsx`, `weigh_in_delete_undone`). An entry delete
  has a confirmation.
- **Entries reach a before and after rarely on sparse logs** (3 of 8 demo entries on the sample), so the facts lines carry weight.
- **Period bands (Compare) are still gone.** Drag-to-select is built for every chart the date range scopes (share, lift and Body Comp); Overview and Progress use the full history.
- **Design decisions kept for now, by the owner** (from the 2026 design critique, since deleted; its reasons now live next to the code):
  the fixed M/W/G colors stay red, green and blue (red sits beside green on the Workouts bars; a color-blind-safe set such as blue,
  orange and a dark neutral is the alternative, and `tests/modalityColors.test.ts` pins the one pair below target); Training keeps
  its long tab row (folding the ten domains into one view, with the comparison strip as its picker, is the alternative); and the red accent
  stays as it is, a known overlap with `--destructive` (the red swatch's button color is under 8 OKLab x100 from it in dark mode, where every other swatch is clear; moving its hue
  away cleared the distance but read as pink or rust, not red). A later redesign of the swatches, or a free color picker, should keep the button and link colors at least 8 from
  `--destructive` in both modes, as a test (`brand.test.ts` does this for a brand color and pins the red swatch as the one exception).
- **Overview's days-trained bars follow the accent**, chosen by the owner over a neutral ink that avoided matching the M/W/G colors under it (the default blue, green and dark-mode red come within 8 OKLab x100 of one of them; teal, slate, violet, magenta and amber are clear). If it reads as one series in practice, the alternatives are the neutral ink again, or neutral only for the colliding accents. No chart prints a note about workouts with no recognized movement (neither Overview's M/W/G chart nor the modality pages); `unclassified` and `unclassified_count` stay in the data, the page footer still says how many entries sit outside the split, and the gray "Not classified" key on Workouts rows stays because it names a mark that is drawn.
- **Timeline verdict rows have no drawing** (see "Architecture: the Timeline"); shading an entry's span on Progress's evidence chart
  is a separate, unbuilt idea.
- **Assistive technology is unverified.** No real screen reader pass has been done, and forced colors was checked only by Chromium's emulation, not on Windows High Contrast
  (what axe covers is in "Accessibility conventions"). The usability study plan (five tasks on the core questions) is issue #67.
- **Backup encryption is settled as it is.** The iteration count (600,000, OWASP's floor) and the strength bands stay; derive time has not been
  measured on a mid-range phone, so measure it before ever raising the count. The strength hint is length-only by design, with one guard for
  fewer than 5 distinct characters; long predictable passphrases rate "Strong" (pinned in `tests/passphrase.test.ts`). Argon2id would be a new
  `encoding` via `kdf.name`. There is no passphrase recovery, by design.

## Architecture: the Timeline

An entry (`types/timeline.ts`) is something the athlete changed or something that happened: a kind (`initiation`: "changed" or "happened"), an area
(Training, Nutrition, Health, Travel, Other), an optional name and note (up to 200 characters), a start date and an end date that is null when
ongoing. In the app they are "entries" on the "Timeline"; "period", "tag", "experiment", "cycle" and "block" do not appear in copy.
Periods and experiments from earlier builds are not read: nothing migrates them, and a stored list under the old keys is ignored.
`lib/analytics/timeline.ts` holds the form's rules (`validateEntryInput`: every failing rule as a plain sentence, nothing pre-selected), the check on
a received list (`validateEntryList`, shape only so another device's clock cannot make a good list unreadable), names, spans, overlap and lanes.

- **An entry never changes a number, a gate, a label or a verdict anywhere.** The only thing a rule reads is the kind: `insights/entryVerdict.ts`
  gives an entry the athlete changed a before and after (the last N sessions during it against the last N before its start, N = min(4, during,
  before), at least 3 per side, with `judgeWindows`' own state rules; a move up to RX inside it is one Up vote); something that happened gets
  none. With fewer than 3 counted subjects it shows a shortfall sentence and facts lines, never a weaker claim. Body weight appears once over the
  entry's span (`entryDisplay.ts`), with no sentence relating it to the verdict.
- **The view** (`TimelineTab.tsx`, tab id `timeline`, over `components/dashboard/timeline/`): entries as bars stacked in lanes above one lane per
  verdict, laid out as HTML by percentages (so text keeps its size on a phone), lanes packed by measured pixel width so labels never collide. A
  verdict row is words only for now: name, the verdict pill (as on Progress) and change, then "Compared Jan to Jun 2024 with Jul 2024 to Oct 2026" (the months of
  the two windows). Two drawings were tried and dropped (a line between the two bests read as the size of the change; windows as bands with a dot looked irregular). One
  Selected panel, the entry form in a dialog, delete behind a confirmation. A row on Progress opens its lane through "See on timeline" under its
  opened chart (not for a subject without a lane, nor a move up to RX).
- **Storage and names.** Key `"timeline-entries"` (`storage/timelineStorage.ts`), persisted only when `source === "upload"`, wiped by Start over,
  synced and backed up as the `timeline` dataset. An older build rejects a manifest naming `timeline`, so both devices need the
  current build.
- Sample mode seeds entries (`sample/generateSampleTimeline.ts`, at fixed offsets from the first logged workout); they are in memory only.
- Analytics: `entry_added`, `entry_edited`, `entry_deleted`, `timeline_range_changed`, `timeline_subject_opened`, all value-free.

## Architecture: manual weigh-ins

A weigh-in (`types/weighIn.ts`) is a date and a weight in pounds (50 to 600), an optional note (up to 200 characters) and `source: "manual"`; one per
day, so saving a date that has one replaces it. It is a persisted athlete dataset: its own IndexedDB key (`storage/weighInsStorage.ts`, `"weigh-ins"`),
written only when the data source is an upload (sample mode keeps it in memory, like timeline entries), wiped by Start over, and carried by sync and backup as
the `weighIns` dataset (validated all-or-nothing by `validateWeighInList`, which checks shape only, so another device's clock cannot make a good list
unreadable; the form alone refuses a date after today). An older build rejects a manifest naming `weighIns`, so both devices need the current build.
The entry panel is on the Body Comp view (`WeighInsPanel.tsx`), which lists InBody scans (read-only) and weigh-ins together.

`lib/analytics/weighIns.ts` pools weigh-ins with InBody scans into one body-weight series: on a day with both, the scan is used and the weigh-in is kept,
listed as "Not used: an InBody scan the same day". Lean and fat mass come from scans only. The noise band is measured from the pooled series (as scan
rows carrying only a weight, `pooledScanRows`), so frequent weigh-ins reach a measured band where scans months apart fell to the 3 lb default. No
smoothing. Analytics: `weigh_in_saved`, `weigh_in_deleted` and `weigh_in_delete_undone`, value-free like every other interaction. A delete has ten seconds of Undo rather than a confirmation.

## Architecture: cross-device sync

`src/lib/sync/` moves the athlete's data from one device to another (issue #15) without relaxing hard constraint 1: two browsers negotiate a WebRTC `RTCDataChannel` directly, with the
SDP exchanged by displaying and scanning QR codes instead of a signaling server, so only connection metadata ever crosses a QR code or a public STUN server. No TURN server is configured, on
purpose (a relay would see the bytes in transit). The full account (engine layout, wire protocol, dialog behavior, wiring) is in `docs/sync.md`; read it before changing anything here. The rules
that apply everywhere:

- **One WebRTC seam.** `webrtcTransport.ts` is the only file that touches real WebRTC, and `components/sync/QrDisplay.tsx` and `QrScanner.tsx` are the only files that import `qrcode`/`jsqr` or call
  `getUserMedia`, so the engine is unit-tested with fakes. Real two-device negotiation and camera scanning are not automated; they are checked by hand across two devices before a change here ships.
- **What syncs is the athlete's data, and only that**: `SyncDataset` is exactly `workout`, `bodyComp`, `weighIns` and `timeline`, and `decodeHeader` rejects any other name. Theme, grouping, date range,
  branding and PostHog's id never sync. **A new persisted dataset that is the athlete's data must be added to sync in the same change** (a `SyncDataset`, an outgoing entry in `Dashboard.tsx`, a case in
  `planReceived`, an `onSynced*` handler in `App.tsx`), which also adds it to backup; a new preference or setting must not.
- **A sync is all or nothing.** Everything that arrives is validated before anything is written (`validateReceived.ts`, `validateWeighIns`, `validateEntryList`); one bad row rejects its dataset with a
  reason, nothing is applied, and a rejected dataset never becomes an overwrite prompt. One `AlertDialog` (`ReplaceConfirmDialog.tsx`, shared with backup restore) covers every dataset that would be
  replaced. `planTransfer()` queues every write and `flush()` applies the workout log last, because applying it moves `App` to its reveal screen and unmounts the dialog.
- **The `handleSynced*` handlers in `App.tsx` are unconditional writers and must never look at `state`**: on the landing page it is still the previous screen. Synced data always carries
  `source: "upload"`, so sync's Settings entry points are disabled in sample mode.
- **Analytics** are `sync_attempted`, `sync_succeeded` and `sync_failed` with a role and a fixed `SyncFailureReason`, never a device id, token or SDP fragment (`tests/syncAnalytics.test.ts`).

## Architecture: backup

`src/lib/backup/` and `src/components/backup/` let an athlete download everything they have as one JSON file and restore it later, in another browser or after clearing site data. It reuses sync's
validators and `planTransfer()` rather than growing its own. The format, the encryption design and the wiring are in `docs/backup.md`; read it before changing any of them. The rules that apply everywhere:

- **Athlete data only**: the same four datasets sync carries (never theme, grouping, date range or branding). Empty datasets are omitted, so a backup only ever replaces. A newer `version` or unknown
  `encoding` is refused.
- **Restore replaces per dataset, never merges**, and a missing dataset leaves the local copy alone. A backup must contain a workout log, so a half-restored state cannot happen.
- **Nothing is written until the whole file is usable**: the same all-or-nothing plan as sync (workout log applied last), one confirmation through `ReplaceConfirmDialog`, and an encrypted file asks for its
  passphrase before any confirmation.
- **Encryption is optional and off by default**: PBKDF2-HMAC-SHA-256 at 600,000 iterations into AES-256-GCM through Web Crypto, no dependency. The KDF is named in the file, so a stronger one is a new
  `encoding`, and PBKDF2 backups must stay readable forever. **The passphrase is never stored, logged, sent or put in analytics.** There is no recovery, by design, and a wrong passphrase is
  indistinguishable from a damaged file (`wrong_passphrase`).
- **Labels are Backup and Restore**, not Export and Import ("Import" suggests adding, and "Export" already means the SugarWOD CSV). Restore errors stay inline on the landing page, because its own error
  alert dismisses through `reset()`, which wipes storage.
- **Analytics** are `interaction_used` with `backup_exported` or `backup_imported` and nothing else: no filename, counts, failure text, or whether the file was encrypted
  (`tests/backupPassphrase.test.tsx`).

## Architecture: dashboard layout

The dashboard's controls are sorted by how often an athlete touches them, and each tier has one
home. Read the header comments of the files named here before moving anything between tiers.

- **Navigate** (every visit) — `SectionNav.tsx`. Five sections in the page header, at its true
  center from `lg` up (a three-column grid with equal outer tracks; narrower screens wrap them
  onto their own row). Overview (the front page, on its own), Training (Workouts and Lifts, then the ten GPP
  domains, three modalities and Movements — a classification of those same workouts, not separate
  data, which is what their group headers are there to say), Body (Body Comp) and Insights
  (Progress, Timeline) and Reports (the Progress report, a printable page; see "Architecture: reports"). The views
  inside a section are a plain row of tabs under the page title, never a dropdown, so every
  sibling is visible; a one-view section shows no second row. Where a section mixes two kinds of
  view (Training's Domains and Modalities), each group's label sits *above* its tabs as a
  header — in line with them it read as one more tab. Workouts and Lifts share an unlabeled
  group (the record of what was done) and Movements is a group of one, so neither has a header;
  Workouts comes first, so selecting Training opens the log. Training is the long row: it fits at 1280px with
  the gaps tightened from `lg`, and below that scrolls sideways, with a fade (and on a pointer device a button) at each edge that
  has more tabs past it and the selected tab scrolled into view. The Cardio domain and the M modality are both labeled "Cardio" on
  purpose: the Domains and Modalities headers tell them apart (`MODALITY_NAMES`, pinned in `tests/sectionNav.test.tsx`). A third nav level for it would break "never a dropdown", so it hasn't
  been added. `tabs.ts` stays the flat identity list
  (`ALL_TABS`) that analytics and the tab content key off; `SECTIONS` only groups it, and
  `tests/sectionNav.test.tsx` asserts every tab lands in exactly one section. The Progress view
  keeps its earlier internal names (tab id `lifts`, `LiftsTab.tsx`); only its label and page title changed.
  Timeline is `timeline`/`TimelineTab.tsx`. Lifts is `lift-history`/`LiftHistoryTab.tsx` (not `lifts`,
  which is Progress's id); its page title is "Lifts and benchmarks". It is the record (every session,
  SugarWOD's PR flag as logged), Progress is the verdict, and neither restates the other.
  Overview is the full-history front door (`docs/overview.md` holds the acceptance criteria and their
  reasons). A totals row (days trained, most recent PR, body weight, the Progress headline), then three
  panels (`overview/OverviewPanels.tsx`), each the evidence for one stat with a link into its section:
  Training (days trained per calendar month over the last 12 months, the current month drawn with a diagonal hatch and a key,
  then each month's M/W/G split over the same 12 months, column for column under it, from
  `monthlyModalityMix`; no domain list), Insights (Progress's up and down rows, at most five, most recently
  logged first, each opening its own row on Progress through `focusSubjectKey`, plus the latest Timeline
  entry) and Body (the pooled weight line). The numbers come from `lib/analytics/overview.ts` (pure,
  `today` passed in, the recent window is `OVERVIEW_RECENT_DAYS` in `insightConfig.ts`), which reads
  `Insights.allRows`, the same parse as every other view with no range applied, never a second
  `parseRows()`; the chart's months come from row dates, not `ParsedRow.bucket`, so Overview ignores the
  grouping too. The Progress label and rows come from `classifySubjects` exactly as Progress computes
  them, and body weight uses the pooled series and its noise band, as the Insights views do.
- **Scope** (most visits) — `ScopeLine.tsx`. Date range and grouping, written as one sentence
  under the page title ("Showing all time, grouped by month"), next to the charts they change
  rather than in the global header. It sits in its own row under a thin rule (with "Stored in
  this browser only" on the right, for uploaded data), so the heading block (title and, on
  domain pages, CrossFit's definition) ends visibly before the view controls begin. Insights
  views show a plain sentence instead ("Verdicts use your full history, as of today. The Training date range doesn't apply here."), because `App.tsx` computes them
  from the whole unfiltered log as of today — a date control there would silently do nothing.
  Overview does the same, adding the last logged date ("Uses your full history, as of today. Last
  workout logged Nov 6."), so an old export explains its own low recent numbers.
- **Manage** and **Preferences** (monthly at most / once) — `SettingsSheet.tsx`, behind the
  header's single Settings button (a ghost button in muted text, so it never out-weighs the
  section links): replace either file, back up to or restore from a file, send/receive to another
  device, accent and mode, Start over. Every control there calls the same handler it did when it lived in the header; moving
  them changed where they live, not what they do. The accent/mode UI there is a second rendering
  of the same `useTheme()` state `ThemeControls.tsx` renders on the landing page.

Sample mode is announced exactly once, by the full-width strip above the header — never by a
chip in the header or a second note on the page; `tests/App.test.tsx` checks there's one and
only one. Its copy is deliberately one line at phone width ("Sample data · Use your own"), and
"Use your own" is the same `reset()` as Settings' Start over, which sample mode runs without a
confirmation since nothing from the sample is stored. The totals on Overview are a ruled row
rather than a card (they're the page's headline, not one panel among several), and a view's
first card doesn't repeat the page title above it.

## Architecture: branding

`docs/branding.md` is the requirements document; this is how it is built and what not to undo. A coach (Settings, shown only while the audience is
`coach`) can set a gym logo, a name and a brand color, each optional. Reports (see "Architecture: reports") read the brand; image cards are a separate, unbuilt feature that will also read the brand
through `useBrand()`.

- **A preference, not a dataset.** `lib/brand/brandStore.ts`, `localStorage` key `swift.brand` (try/catch, in memory when storage throws, read through
  `useSyncExternalStore`). It is **not** in IndexedDB, so "Start over" (`idbClearAll()`) leaves it, on purpose: a coach moves from athlete to athlete. It is **not** a
  `SyncDataset`, so it never syncs or backs up (`tests/brand.test.ts` pins that the wire rejects a `brand` dataset). Components read it only through `useBrand()`.
- **The logo is re-drawn, never stored as chosen** (`lib/brand/image.ts`). Raster only (PNG, JPEG, WebP, found by magic bytes, not name or type); **SVG is refused**. The
  file is decoded, drawn on a canvas at most 512px on the long edge and written back out as WebP (PNG where the browser can't), which drops EXIF/GPS and keeps the
  stored data URL under `MAX_STORED_CHARS`. `parseBrand()` re-validates whatever is in storage and drops anything that isn't a base64 PNG/JPEG/WebP data URL. jsdom has no
  canvas, so `normalizeLogo` is checked in Chromium; the pure parts are tested.
- **The brand color goes through the accent pipeline** (`lib/brand/color.ts` -> `useTheme()`). `accent` is an `AccentChoice` (a stock id or `"brand"`) and `swatch` is the
  resolved swatch. `brandSwatch()` reduces the color to hue and capped chroma, then holds it to every rule `themeContrast.test.ts` holds the stock swatches to, plus an
  OKLab distance of 8 from `--destructive`, by nudging chroma and hue; a threshold is never lowered. It reports `adjusted` so the form says so. **The color keeps its own lightness** (`AccentSwatch.lightness`, set only for a brand color; the stock swatches keep their fixed shade steps): `minimalShiftRoles()` in `palette.ts` starts each role (fill and ring 3:1, link 4.5:1) at that lightness and moves it away from the page only as far as the rule needs, so a color that already works in a mode is shown as it is. A bright teal is its exact hex in dark mode and only as dark as 3:1 and 4.5:1 require in light mode, where the fixed steps made it darker than either needs. Chroma is still capped at the stock ceiling (0.16) and the chart series and subtle surfaces stay on the hue ramp. The known red-swatch
  overlap is pinned in `tests/brand.test.ts`. "brand" with no brand color falls back to the default accent.
- **A logo's colors are suggested, never applied.** `dominantColors()` (`lib/brand/color.ts`, a pure function over the same RGBA bytes `measureTone` reads) groups visible, chromatic pixels by hue,
  scores them by chroma times area, and returns at most three hex colors, stored as `Brand.palette` (`[]` means the logo has none; absent means it was never looked for) and removed with the logo.
  `BrandingControls` shows them as buttons; picking one is the same as choosing the color, so `brandSwatch()`'s adjustment applies, and a color the coach already chose is never overwritten.
  Its tests are mutation-checked (the hue-edge merge, the chroma weighting and the neighbor suppression each have a test that fails without them): keep them that way.
- **The Swift mark is never removable.** `BrandMark.tsx` only adds a logo beside `SwiftMark` (Dashboard and Landing headers); alt text is the gym name, else "Gym logo". A see-through
  logo the page would swallow sits on a fixed light or dark plate (`plateFor`, from a tone measured at upload).
- **Analytics:** `brand_saved` and `brand_removed` are bare `interaction_used` names; no logo, name or color, and not which field.

## Architecture: reports

`docs/reports.md` is the requirements document and its "Build status" says what is built; read it before changing anything here. A report is a printable page built from data the dashboard already
computes (`src/components/reports/`), reached from the Reports section (one view, so no second row; `REPORTS_TAB`). The rules that apply everywhere:

- **Print-to-PDF, no dependency.** `ReportsTab.tsx` calls `window.print()`; the browser saves the PDF. `Dashboard.tsx` marks its own chrome `print:hidden` on the Reports view, so only the sheet prints. A PDF
  or canvas library is a new decision, not a default.
- **A report is always the light page**, whatever the app's mode, in the preview as in print: `.report-sheet` shares the `:root` token block in `index.css`, the `dark` variant is switched off inside it
  (`@custom-variant dark`), the accent comes from `accentCssVars(swatch, "light")`, and `report.css` resets `color-scheme` for print. Anything inside the sheet that needs a mode must follow the sheet, not the app.
- **The footer is a table footer group** (`ReportSheet.tsx`), because `position: fixed` overlapped content on page two and a table footer repeats on every printed page. Page numbers use `@page` margin boxes,
  which only Chromium honors, so nothing depends on them.
- **Nothing about a report is stored or synced.** The comparison date is chosen each time, the coach note is state in the view, and neither reaches storage, sync, backup or analytics. A stored "last report" date
  was rejected because an export carries no athlete id, so it could attach to the wrong athlete (see "Decided" in `docs/reports.md`).
- **A report's period uses the app's one set of date presets** (`PRESET_OPTIONS` in `lib/analytics/dateRange.ts`, through `insights/period.ts` and `insights/reportPeriod.ts`): a preset ends today, a custom period has a From and a To and may end
  in the past, and All time means no comparison. The Progress "last logged in" filter derives from the same list. Never retype a preset; `tests/presets.test.ts` fails if a list drifts. The Timeline zoom is the one deliberate exception.
- **Progress as of a date is the verdict engine with a past reference date** (`insights/sinceDate.ts`). `classifySubjects` finds move-ups over the sessions up to that date only; before, a later move up to RX
  voted Up at an earlier date. `tests/asOfDate.test.ts` sweeps the sample export and fails if the future leaks into the past: keep it passing, and do not read anything dated after the reference date.
- **Changes you made and PRs reuse existing engines** (`insights/progressReport.ts`): `entryVerdict` for the Timeline's before and after, `entryBodyWeightLine` for body weight (off by default in a report), and SugarWOD's PR flag as logged,
  listed only after a chosen date. An entry's note is not printed. A report never computes a verdict of its own.
- **The Training mix report reads `Insights.allRows`, never a second parse** (`lib/analytics/trainingMix.ts`): it filters the rows to the period once and runs the Training views' own builders over them, so it cannot disagree with them
  (`tests/trainingMix.test.ts`). Its charts follow the app's chart-or-table preference (`useChartView`), and the controls every report shares are in `components/reports/reportShared.tsx`.
- **The Body and training report shows body data beside training and never relates them** (`lib/analytics/bodyTraining.ts`): weight comes from the pooled series with its noise band, lean and fat mass from scans only
  (off by default), and the Progress headline is Progress as of the period's end, unchanged by any body reading (`tests/bodyTraining.test.ts`). It needs an InBody file or weigh-ins and says so when there are none.
- **The Skills report counts only an RX workout** (`lib/analytics/skills.ts`): a skill is done when the earliest workout flagged RX that includes one of its movement ids falls on or before the period's end; a SCALED or unflagged workout never counts,
  and the check names the workout behind it. The skill list and its levels are curated, not computed; `tests/skills.test.ts` pins every id against the lexicon and each skill's modality. It shows counts only, never a score, grade or badge.
- **A report reads the brand through `useBrand()`** and shows it only for the coach audience; the Swift mark is always there. The logo's plate is computed for the light page.
- **Analytics** are `report_generated` with a fixed kind and the audience, nothing else (`tests/analytics.test.ts`, `tests/ReportsTab.test.tsx`).

## Architecture: the stale-log nudge

When the stored workout log is old, Overview and the Insights views show one quiet line (`StaleLogNudge.tsx`) with "Replace file" (the same
`handleFile` Settings uses) and "Remind me later". `lib/analytics/staleness.ts` decides: stale means the **upload** is `STALE_LOG_DAYS` (30) old,
measured from `uploadedAt`, **not** from the last workout, because a layoff leaves an old last workout in a perfectly current file. Only a cache
saved before `uploadedAt` existed falls back to the last workout's age. `today` and `now` are passed in, never read from the clock.

- `uploadedAt` and the snooze live in `workout-meta` (`workoutStorage.ts`), a separate key from the rows so sync and backup keep validating bare
  rows. `finishSuccessfulLoad` stamps it, so a sync or backup restore is stamped when it **arrived**, not when the export was made (neither format
  carries the date; an old backup can look fresher than it is). A new file clears the snooze; Start over wipes the key. Sample data gets none
  and never nags.
- The sentence leads with the upload's age; the last workout's date is added only where the page does not already print it (Insights, not Overview).
  A replacement's reveal says how many entries it added (`countNewRows`, `lib/analytics/newRows.ts`: a multiset on day, title, description and
  score, so an edited score counts as new) and says "No new workouts" when none; a first upload has no such line.
- Per-device, so it does not sync or back up. Analytics: `stale_log_replace_clicked` and `stale_log_snoozed`, value-free.

## Architecture: app state and local persistence

`src/App.tsx` owns two independent state machines — `AppState` (SugarWOD rows) and
`BodyCompState` (InBody rows, from `BodyCompTab.tsx`) — that are deliberately never joined as
one row shape (see the comment above `handleBodyCompFile`). The Insights views
do read both together, but as separate inputs to pure functions, never merged into one row. Both now sit on top of a browser-local persistence layer, `src/lib/storage/`,
added after the app initially held everything in memory only.

- **`idbStore.ts`** is the only file that touches `indexedDB` directly: one database
  (`"swift"`), one object store (`"csv-uploads"`), keyed by string. A single store rather than
  one per dataset means a future dataset is just a new key — never a version bump or an
  `onupgradeneeded` migration. Every exported function (`idbGet`/`idbSet`/
  `idbClearAll`) swallows its own failures and resolves to a safe default, mirroring
  `readStored`/`writeStored` in `src/lib/theme/useTheme.ts` — persistence is a convenience,
  never a requirement, so a blocked or disabled database must not break the app.
- **`workoutStorage.ts`** / **`bodyCompStorage.ts`** / **`viewPreferencesStorage.ts`** /
  are thin typed wrappers, one key each (`"workout-rows"`, `"body-comp-rows"`, `"view-preferences"`,
  `timelineStorage.ts` with `"timeline-entries"`, `weighInsStorage.ts` with `"weigh-ins"`). Nothing outside `src/lib/storage/` calls `idbGet`/`idbSet`
  directly — a new dataset gets its own wrapper file, not a call site that reaches past it.
- **Restore-on-mount**: `App.tsx` starts in `{ status: "loading" }` (reusing `Landing`'s
  existing loading UI — no new component) and a mount-only effect loads all five datasets
  (workout rows, body-comp rows, view preferences, timeline entries, weigh-ins) from storage in parallel before
  deciding whether to show the dashboard or the upload screen.
- **Write points**: a successful SugarWOD parse persists only when `source === "upload"` — the
  bundled sample file is deliberately never cached, so demo mode never leaves anything behind. A
  successful InBody parse always persists (there's no sample-data concept for it). Data that arrives
  by sync or backup restore (the `handleSynced*` handlers) always persists too, since it is an upload
  by definition; those handlers must never look at `state`, because on the landing page it is still the
  previous screen, and checking it once made restored entries vanish on reload. `range` and
  `granularity` persist from exactly two call sites in `App.tsx` — `persistRangeSelection`
  (passed to `DateRangePicker` as `onSelect`) and `persistGranularity` (passed to `ScopeLine`'s
  grouping menu/the daily-auto-downgrade effect as `onGranularityChange`) — rather than a
  `useEffect` mirroring every state change into storage. That's deliberate, not an oversight: a
  blanket mirror would also fire on `run()`'s and `reset()`'s own internal `setRange`/
  `setGranularity` calls, racing "Start over"'s `idbClearAll()` and re-saving the very defaults
  the clear just removed. A fresh upload (`source === "upload"` in `run()`) explicitly persists
  its own reset to `monthly`/`all_time` for the same reason a fresh upload persists its rows —
  otherwise a reload right after would restore the *previous* file's leftover view prefs over
  the new file's fresh state.
- **Updating in place**: two controls let an athlete bring in a fresh CSV without touching
  anything else. "Replace file" for each dataset in the Settings sheet (`SettingsSheet.tsx`),
  plus the InBody one repeated on `BodyCompTab.tsx`'s ready state, are all `FilePickerButton`
  (`src/components/dashboard/FilePickerButton.tsx`) — a plain click-to-browse trigger using the
  same hidden-`<input>` mechanics as `UploadDropzone` (including resetting the input's value so
  picking the same file twice still fires a change event), but without `UploadDropzone`'s
  drag-and-drop box, since this is a small utility action rather than the first-upload call to
  action. Both call the exact same `handleFile`/`handleBodyCompFile` handlers a first upload
  uses, so a re-upload fully replaces only its own dataset — the timeline and the other dataset
  are untouched, exactly as they already were before these controls existed; no new
  data-merging logic needed.
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
  the two uploaded datasets. `reset()` itself is unchanged, but the "Start over" button that
  calls it (in the Settings sheet) is now gated behind a confirmation `AlertDialog`
  (`src/components/ui/alert-dialog.tsx`) whenever `source === "upload"` — sample mode still
  resets in one click, since nothing persisted is at risk there. The dialog's copy names exactly
  what gets deleted (workout log, body composition history, weigh-ins, timeline entries) so this is the one
  place all of them are named together.
- The theme preference remains on its own `localStorage` key (see Theming below), not this
  layer — it needs to be read synchronously before first paint to avoid a flash of the wrong
  mode, which IndexedDB's async API can't do.

This doesn't relax hard constraint #1 above — the cache is still local-only and still wiped by
"Start over"; see that section for the actual invariant.

## Theming

Black-and-white base in both modes, plus **one** user-selected accent — the only chromatic
element the athlete controls. Every token in `src/index.css` is achromatic (chroma exactly 0),
with two fixed exceptions that never derive from the accent: `--destructive`, the error/delete-action
red, the `--repmax-1/2/3/5` tokens (red/orange/green/blue), `--negative`/`--negative-subtle` (the Down pill: `--destructive` on its own tint is 4.0:1, under 4.5, and `tests/positiveColor.test.ts` checks this pair), and `--positive`/`--positive-subtle`, the fixed green of a verdict that
went the athlete's way (Up, a move up to RX, the "Improving" headline on Progress and Overview). Verdicts used to take the accent for Up,
so with the red accent Up sat beside Down; now a verdict looks the same whatever the accent, and `tests/positiveColor.test.ts` checks the
green's contrast in both modes. The `--repmax-*` tokens color the
highlighted rep scheme on each lift chart (`FIXED_REPMAX_COLORS` in `chartUtils.ts`; one scheme per chart, with a step line of its best so far
and named in the chart's header, every other effort gray, so no two rep-max colors ever need telling apart), and the
Overview and per-row M/W/G bars reuse three of them (`FIXED_MODALITY_COLORS`). On Workouts each bar's colors are named beside it: a dot before each letter in the sticky column header and before each
value under the bar (`ModalityHeaderKey`, `SplitLine` in `ModalityBar.tsx`), since the page key scrolls away. Those bars are drawn in
`MODALITY_DRAW_ORDER` (W, G, M), never `MODALITY_LIST`'s M, W, G: the canonical order stacks red onto green, which
deuteranopia can barely tell apart, and `tests/modalityColors.test.ts` measures every adjacent pair from the real tokens.
Overview's days-trained bars use the accent (`--primary`, at full strength, so the accent's own 3:1 rule is what keeps them visible). The M/W/G chart below them uses the fixed colors, and the default blue (G), green (W) and red in dark mode (M) sit within 8 OKLab x100 of one of them, so an accent bar can read as the same series; the owner chose that knowingly, over the neutral ink that was there before (see "Open items"). The fixed colors are fixed on
purpose: an accent-derived alternative was tried side by side and dropped, so there is no color-mode
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
- Out-of-gamut colors are clamped **programmatically** — `clampToGamut()` binary-searches
  chroma down while preserving lightness and hue. Don't hand-tune per-swatch constants to
  stop clipping; that breaks the moment a swatch is added.
- **Contrast is enforced by tests, not by eye.** `tests/themeContrast.test.ts` asserts, for
  every swatch × both modes: button text ≥ 4.5:1, links ≥ 4.5:1 on the page, focus ring and
  primary surface ≥ 3:1, body text on the subtle background ≥ 4.5:1, chart bands in gamut,
  distinct, and separable. **Adding a swatch means that suite must still pass** — tune the
  swatch's hue/chroma until it does; do not lower a threshold.
- `chartSeries()` derives N steps along the accent's own hue rather than a rainbow, which is
  what keeps a ten-series stacked chart reading as black, white and the athlete's one color.
  (The rep-max dots and M/W/G bars above are the exception: they use fixed colors.)
- The pre-hydration script in `index.html` duplicates the mode logic and the `swift.theme`
  localStorage key from `useTheme.ts` to avoid a flash of the wrong mode. **Change both together.**
  Theme reads/writes are wrapped in try/catch — private browsing must never break the app.

## Accessibility conventions

Measured with axe-core (WCAG 2.2 AA and best-practice rules) in Chromium over every view, the landing and role-split screens, the Settings sheet (with
Branding) and the entry dialog, in light, dark and emulated forced colors, with a coach brand set, and at 375px wide, plus the states that render different markup: charts
as tables, an expanded workout row, an opened Progress row, a selected Timeline entry, Body Comp with data, a picked chart point and a hovered button. All clean. Scan those
states, not only each view's default, because the defaults missed real findings. Keep it that way:

- **The accessible name contains the visible text** (WCAG 2.5.3, axe `label-content-name-mismatch`). A button's `aria-label` starts with its visible word ("Replace file,
  workout log", "Table, show charts as tables"); the upload dropzone's name is its file description followed by its on-screen prompt and hint, which are separated by a real
  space in the markup because axe compares the two as strings.
- **A scrolling box is a focusable, named region** (`DataTable` in `ChartTable.tsx`: `role="region"`, `tabIndex={0}`, named by the caption), or a keyboard user cannot scroll it.
- **A filled button hovers to `--primary-hover`, never `bg-primary/90`**, which lightened the fill and took white on blue to 4.0:1. The hover shade moves the way that keeps
  the label readable (`accentRoles`), and `themeContrast.test.ts` and the brand-color check both hold it.
- **A long unbreakable title wraps** (`break-words` on the view `h1`) rather than widening the page at phone width.
- **Heading levels step by one.** A page's view title is the `h1`; a chart card's title is an `h2` (they were `h3`, which skipped a level on 30 views).
- **A file input is not a control.** The button or dropzone is; the `<input type="file">` it clicks is `aria-hidden`, and sits beside the dropzone, not inside
  its `role="button"` (axe: `label`, `nested-interactive`).
- **The role-split screen is a page**: `<main>` and one `sr-only` `h1`.
- **Forced colors** drops fills, box-shadows and the page's colors, which is how "selected", "pressed" and "focused" were drawn. `index.css` ends with a
  `forced-colors: active` block (a pressed toggle is Highlight on HighlightText with `forced-color-adjust: none`, because left to the browser the text gets a
  white backplate and vanishes; keyboard focus is a Highlight outline), and per-component `forced-colors:` classes cover the tab underlines (a transparent
  border is forced visible, so an unselected sub-tab sets its own to Canvas), Timeline's entry bars (a border), the accent swatches (`forced-color-adjust-none`) and the filled `Button` variants (default, secondary and
  destructive carry a `ButtonText` border, because a fill alone is just text there; ghost and link stay text on purpose).
  `tests/forcedColors.test.ts` pins them; jsdom cannot render the mode, so a change here is checked in Chromium with `forcedColors: "active"`.
- Still decorative in forced colors, and safe because the value is also text: the M/W/G bars on Workouts rows and the verdict pills' tint.

## Voice & personality

The copy in this app reads like a training partner who's good with data, not a coach trying
to motivate you. That's a deliberate stance, not an accident: the person exporting a SugarWOD
CSV already tracks their own training and doesn't need to be sold on why it matters, so the
UI never performs enthusiasm on their behalf. The landing page's own tagline (the Swift Design System's positioning line) says it
in one line: "Training insights, no strings attached."

- **State what's true; don't cheer for it.** `OverviewTab.tsx`'s stat labels ("days
  trained", "most recent PR") and `HowItWorks.tsx`'s steps describe what happened in plain
  terms, never "Great job!" or "You're crushing it." The numbers and charts do the motivating.
- **Use the sport's own vocabulary, verbatim.** RX, Scaled, PR, the ten GPP domain names,
  M/W/G — these come from CrossFit/SugarWOD and are never softened or renamed for
  friendliness. See `DOMAIN_BLURBS`/`MODALITY_BLURBS` (`types/dashboard.ts`,
  `types/modality.ts`) and the tab labels in `tabs.ts`. Each domain page also shows
  CrossFit's own definition of that skill as subtext under its heading (`CROSSFIT_DEFINITIONS`,
  `types/dashboard.ts`) — that's CrossFit's wording, so it's never reworded for house voice;
  the app's own words stay in `DOMAIN_BLURBS`.
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
- **Hand-made rows come from `tests/fixtures/rows.ts`** — `workoutRow`, `logRow` (positional),
  `liftRow`, `franRow` (the sample-generator default), `inbodyRow` (raw timestamp) and `scanRow`
  (ISO day). Don't define a local `row()` builder in a test file; extend the shared one.
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
- **Documentation is checked against the code** (`tests/docs.test.ts`): every relative link and its heading, every `src/`, `tests/` or `docs/` path in backticks, every
  quoted CLAUDE.md heading cited from a comment, and every analytics or sync event named on an event line must exist. Rename a file, heading or event and update the text in the
  same change. The test checks that things exist, not that prose is true, so keep figures that drift (counts, measurements, line numbers) out of documents: state the rule, and let a
  test pin the number if it matters.
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
- **Loads are always pounds.** SugarWOD stores weights in pounds and converts anything logged in
  kilograms before export, so the app reads every load as lb and never needs to detect a unit.
  Scores elsewhere are shown with their unit by `withScoreUnit()` (`src/lib/format/scoreUnit.ts`),
  from `score_type`; the display text itself is never rewritten.
- `REQUIRED_COLUMNS` (`src/types/sugarwod.ts`) deliberately omits `set_details` and `notes`
  because nothing reads them — a slim export must not be rejected for missing them.
- User-facing parse errors are plain language, mapped in `plainParseMessage()`. PapaParse's
  own developer-facing wording must never reach the UI; `tests/parseCsv.test.ts` guards that.
