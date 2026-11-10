# Swift

Client-side web app that turns an athlete's SugarWOD training-history CSV export into a
dashboard: consistency over time, lift/benchmark progression, PRs, a breakdown across the
10 CrossFit GPP domains, and a proportional M/W/G modality mix. Vite + React 19 +
TypeScript 7, Tailwind v4, shadcn/ui, Recharts, Vitest. Deployed as a static SPA on Vercel.

This file covers *how* the code works and which parts must not be "improved". `README.md`
covers what the product is and how to run it, and `docs/` holds the longer reference
(guide, privacy, architecture, classification, testing). Between them they are now the whole written
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

## Deployment headers

`vercel.json` sends a CSP (`connect-src` limited to our origin and PostHog, so the "data never leaves the
browser" promise is also enforced by the browser), `frame-ancestors 'none'`, nosniff, HSTS and a
Permissions-Policy that grants the camera to our own origin (QR sync) and turns off microphone, geolocation and payment (features it doesn't name keep browser defaults). The one inline script (theme, `index.html`) is
allowed by hash; `tests/securityHeaders.test.ts` fails if the script changes without the hash. A new
third-party host or inline script needs the CSP updated in the same change. `posthog.ts` pins the PostHog host to the US endpoints the CSP allows, and pins PostHog's
remote-config features (exception capture, dead clicks, heatmaps, surveys) off in code.

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
- **components**: `Dashboard.tsx` renders 20 views (`tabs.ts` → `ALL_TABS`): Overview,
  Workouts, Lifts (`LiftHistoryTab.tsx`, tab id `lift-history`: the lift, benchmark and PR cards,
  for the selected range), the ten GPP domains, the three modalities, Movements, Body Comp, and the Insights views
  (Progress, Timeline), grouped for navigation into
  four sections (see "Architecture: dashboard layout" below). A
  single `DomainTab` drives all ten domain tabs and a single `ModalityTab` all three modality
  tabs — they differ in data, not structure. Body Comp is its own component (`BodyCompTab.tsx`),
  always present in the nav even before any InBody data is loaded, and Progress and Timeline follow
  the same always-present treatment (they need only the SugarWOD log).
  `buildModalityData`'s output shape deliberately mirrors `buildDashboardData`'s so those two
  components stay near-identical; keep that symmetry.

The **Movements** view (`MovementsTab.tsx`, under Training) lists what the lexicon can recognise: families
(`movementFamilies.ts`, every variant counts) and single movements, picked by id. It reads
`Insights.movements` (`buildMovementData.ts`), a thin reduction of the same `ParsedRow.movements`
`buildModalityData` uses, so nothing is classified twice. The workout list shows the phrase that matched,
because the matcher is a heuristic. Its analytics events are the value-free `movement_selected` and `implement_selected`.

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

**Share-over-time charts draw each bucket for what it is** (`charts/ShareAreaChart.tsx`, `shareRows`): a bucket with fewer than
`THIN_BUCKET_WORKOUTS` (5) workouts is a hollow dot off the line, a first or last bucket the range or the log only partly covers
(`coverage`, from `Dashboard.tsx`; `bucketBounds` in `granularity.ts`) stays shaded but its line is dashed, with a "from" or "to" day in its tooltip, the line
is straight, every tooltip names its denominator ("9 of 15 workouts"), a key names the marks when they appear, and under three
buckets the chart is a sentence. The grouping menu says weekly is noisy over a range longer than a year.

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
times it is named. Workouts where nothing is recognised are marked `classified: false` and
**excluded from every average**, not counted as zeroes (otherwise a logged non-workout drags
every modality's share down); the count is surfaced as `unclassified_count` so the UI can
caveat it honestly.

Movements have **stable ids**, not just labels: every `MOVEMENT_LEXICON` entry carries an `id`
(kebab-case, shared by all aliases of one movement, one label and one modality per id — pinned in
`tests/modalityClassifier.test.ts`), and `MovementHit` carries it. Anything that stores or filters by
movement uses the id; labels are display text and may be reworded. `movementFamilies.ts` groups ids
("Clean" = clean, power clean, hang clean, ...) as a deliberate list, never a prefix match, so a new
lexicon entry cannot silently join a family. `parseRows()` runs `findMovements` once per row into
`ParsedRow.movements`, and `buildModalityData` classifies from that rather than re-reading the text.
**`barbell_lift` outranks the text.** It is the one column that names a movement as data, so
`findRowMovements()` (`classifyModality.ts`) reads it first through the same lexicon (aliases and spellings
resolve to the same ids, no separate table) and those hits come first, tagged `source: "barbell_lift"`. The text is
still searched for other movements, but a family's *generic* bare word (`MovementFamily.generic`: "squat",
"clean", "snatch", ...) is dropped when the typed lift is a more specific member of that family, so a front squat
session is not also a vague squat. Rows with no recognised typed lift behave exactly as before. Measured on the
sample: 279 of 1,209 rows have the field, 25 rows' identities changed and no modality split moved (all typed lifts
are W). Known and left alone: a `% of snatch` reference in a description still reads as a snatch (about 70 rows
in the export name a lift only as a percentage base); fixing that is a lexicon `exclude` decision of its own.
**Variants are their own ids, and their family keeps them.** CrossFit's movement list separates strict, kipping and
butterfly pull-ups, the GHD movements, legless and L-sit rope climbs, walking and front-rack lunges and so on, so each
is a lexicon id (`strict-pull-ups`) and a member of its family (`pull-up`); picking the family still finds every variant,
picking the plain `pull-ups` id finds only the unqualified ones. The longer phrase wins the range, which also ends the
double count (`chest-to-bar pull-ups` is one movement, not `chest-to-bar` plus `pull-ups`). A variant phrase must
carry any suffix a shorter phrase could claim (`strict chest-to-bar pull-up`), or the shorter one claims the range
first and the qualifier is lost. A prefixed complex stays split into its parts via `exclude` (`power clean and push
jerk` is not a `clean-and-push-jerk`). Measured on the sample: 117 rows' movements changed and 40 modality splits
moved, from three causes: double counts merged (9), `single-leg squat` read as a pistol and so G rather than W (13),
and variants newly recognised (18). Dumbbell and kettlebell versions of lifts are deliberately **not** separate ids:
that is an implement axis, not 14 more ids that duplicate the barbell ones.
A double count is found by auditing the sample for two different movements whose matched text touches (or sits a
few letters apart) in one row, then asking whether the sport names that as one movement: a farmers carry, a burpee
pull-up, a snatch deadlift, a clean grip deadlift, a squat clean & jerk and a lateral burpee bar step-over are, so
each is one entry whose longer phrase claims the range. A complex written with `+` ("clean + front squat") and glued
lines are several movements and stay several. Left as two on purpose and pinned in `tests/modalityClassifier.test.ts`:
burpee deadlifts, squat clean thrusters and wall ball sit-ups. Measured on the sample: 30 rows' movements changed and
17 splits moved (farmers carry 13 rows no longer also a loaded carry; burpee pull-ups; a lateral burpee bar step-over
moves from W to G; a hyphenated `bent-over rows` stops reading as a rower, M to W). Not done: a lift named only as a percentage base ("75% of snatch", about 70 rows, see above) still reads as
that lift.
Movement and family labels are in sentence case (pinned in `tests/modalityClassifier.test.ts`); a name keeps its capitals
(`GHD`, `AbMat`, `L-sit`, `Turkish`). Inside a sentence use `labelInSentence()` (`buildMovementData.ts`), which lowers only the
first letter and only when it starts an ordinary word, never `toLowerCase()`, which turned `Hanging L-sit` into `hanging l-sit`.
A brand or a pace is not a movement: `assault bike` and `echo bike` are aliases of `bike`, and `sprint` is an alias of `run` (a
workout naming both counts the movement once). The aliases keep the phrase the workout used for the "matched on" text.
A sprint on a bike or rower would also read as a run; no exclusion is added until a real export shows one. Measured on
the sample: 7 rows' movements changed and 4 splits moved, all from two ids merging into one.
Bare equipment words (`db`, `kb`, `dumbbell`, `kettlebell`) are deliberately **not** lexicon entries: they name the
implement, not the movement, and counting them inflated W.
**Implement is a label on a movement, not a movement.** `MovementHit.implement` (`barbell | dumbbell | kettlebell`,
absent when the workout does not say, which is not "bodyweight") is read by `implement.ts` from the words written
directly before the first mention of a movement: at most two plain words between, and nothing else. SugarWOD glues
lines together, so a digit or punctuation mark, another claimed movement in between (`dumbbell squatsbar-facing
burpees`), or a hyphen straight after the implement (`db-facing burpees`) all end it. An implement named once for a
list is not carried forward. A lexicon entry defined by its implement (`kettlebell-swing`, `dumbbell-row`,
`barbell-row`) carries it as `MovementEntry.implement`, and what is written outranks it. A lift from the `barbell_lift`
field is barbell. It never adds a movement and never moves a modality split. The Movements view narrows a selection
with `MovementSelection.implement` (the "Implement" control appears only when a workout names one for the selection;
`implement_selected` is the value-free analytics name). Measured on the sample: 127 dumbbell, 66 kettlebell and 6
barbell labels from the text (one of the dumbbell labels is a stray "carry" in "use two dbs for the carry").

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

- **`sessions.ts`**: a *subject* is one lift or named benchmark with RX and Scaled kept separate; a *session* is one subject on one day (the best
  of the day). A lift's value is its estimated 1RM (average of Epley and Brzycki) from any 1 to 8 rep scheme; SugarWOD's PR flag is deliberately
  not read (Overview's "most recent PR" stat is the one reader of the flag, as a logged fact, and feeds nothing here). It builds on `liftSubjects.ts` (name normalisation, RX/Scaled split, the 1RM estimate; a test pins the parity) and also keeps
  per-entry max-effort facts and the reason each Load row went unused.
- **`verdict.ts`**: session-based. The best of the recent N sessions against the best of the N before them, N = min(4, floor(n / 2)), at least 6
  sessions. `up` (change of 5% or more, or a record: the recent best 2% above everything before the recent window), `down` (5% or more worse
  with a max effort in the recent window), `not-tested-since` (the same without one: mid-cycle, never a decline), else `no-clear-change`.
- **`headline.ts`**: six groups, move-ups to RX (an up vote for 12 months), the label (`Improving`, `Steady`, `Declining` from the counts) and the
  reference date, always passed in and never read from the clock.
- **`display.ts`**, **`bodyContext.ts`**, **`period.ts`**, **`chart.ts`**: the words (RX unmarked, Scaled as a qualifier), the body-context lines,
  the "last logged in" filter (labelled "Show lifts and benchmarks last logged in": it only hides rows) and the evidence chart's numbers. Body composition never feeds a verdict or a count.
- **A lift's pounds are always called an estimate.** Every lift sentence carries "est. 1RM" (or "est." on a facts line), a record names the
  logged set it came from ("from 225 × 5", `ProgressSession.logged`), and the evidence chart is titled "Est. 1RM". Without it, "New best:
  258 lb" on Progress read as a lift one tab away from a logged best of 230 on Lifts. `tests/progressDisplay.test.ts` (DSP-12) checks it
  over the sample.

- **A verdict never rests on colour.** `progress/verdictMark.tsx` is the one place a verdict's look is defined (Progress pills, Overview's
  What moved, Timeline lanes): each verdict has its own glyph (↑, ↓, –, a dashed circle) and its own lane end (dot, ring, diamond, small
  dot) and line dash, and colour only repeats it. Up had been the accent alone, so with the red accent Up and Down were both red.
  `tests/verdictMark.test.tsx` checks the marks stay distinct, and that no component uses a fixed Tailwind palette colour (the old
  "Not tested since" amber).

The weight noise band (`weightNoiseBand.ts`) is the one older pipeline that remains: `weightBandLb` uses it to decide whether a body-weight change
is "within normal variation".

## Architecture: the weight noise band

`src/lib/analytics/weightNoiseBand.ts` answers "is this change in body weight between two readings bigger than reading-to-reading noise?" so no
body-weight sentence rests on sign alone. `getWeightNoiseBand()` estimates one band on a ladder — readings within a week of each other
(`paired-scans`), else spread around a rolling median (`residual`), else a labelled `default` (3 lb) — and returns `status: "insufficient"` only
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
- **RX and Scaled for lifts** are judged separately; whether to merge them needs an athlete who logs Scaled lifts.
- **Noise band.** `weightNoiseBand.ts`'s band comes from `paired-scans`, `residual` or `default`; anyone scanning monthly or less lands on `residual` or
  `default` (3 lb for weight), which is why manual weigh-ins exist.
- **Weigh-in delete has no confirmation; it has Undo** for ten seconds (`WeighInsPanel.tsx`, `weigh_in_delete_undone`). An entry delete
  has a confirmation.
- **Entries reach a before and after rarely on sparse logs** (3 of 8 demo entries on the sample), so the facts lines carry weight.
- **Chart drag-to-select and period bands are gone** with Compare; nothing replaces them on the date-range charts.
- **Sync.** Verified by unit tests and by hand on two devices, not by an automated two-device test.
- **Backup encryption.** The iteration count (600,000) and the strength bands are first drafts: measure derive time on a mid-range phone before
  raising the former. The strength hint is length-only by design, with one guard for fewer than 5 distinct characters; long predictable
  passphrases rate "Strong" (pinned in `tests/passphrase.test.ts`). Argon2id would be a new `encoding` via `kdf.name`. There is no passphrase
  recovery, by design.

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
  verdict, laid out as HTML by percentages (so text keeps its size on a phone), lanes packed by measured pixel width so labels never collide, one
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

`src/lib/sync/` moves a dataset from one device to another (issue #15) without ever relaxing
hard constraint #1: no backend, and training data never leaves the browser. Two browsers
negotiate a WebRTC `RTCDataChannel` directly; the SDP offer/answer is exchanged by
displaying/scanning QR codes instead of over a signaling server, so the *only* things that ever
cross a QR code or a public STUN server are connection metadata (ICE candidates, DTLS
fingerprints) — never a row of workout data. No TURN server is configured, on purpose: a TURN
relay would see the (encrypted) bytes in transit, and this feature has no relay-of-last-resort —
if STUN can't punch through, the UI says "get on the same Wi-Fi" rather than silently falling
back to one.

- **The engine is entirely WebRTC- and framework-agnostic**, mirroring the classify → analytics
  → components split elsewhere in this codebase: `chunking.ts` (wire framing — a small JSON
  header naming the dataset and byte count, then fixed-size binary chunks, since
  `RTCDataChannel` messages cap around 16KB cross-browser), `pairingCode.ts` (SDP ↔ QR-payload
  encoding, with its own size budget and candidate-trimming for QR scannability), `syncTransport.ts`
  (the `SyncTransport` send/receive interface), `peerConnection.ts` (the `PeerConnection`/
  `PeerConnectionFactory` interface, plus the `IceGatheringTimeoutError`/`WebrtcUnsupportedError`
  types), and `syncSession.ts` (the pairing/transfer state machine, `idle → generating-offer →
  awaiting-answer → connecting → connected → transferring → done | failed`). None of these five
  files import `RTCPeerConnection` or a QR library — `webrtcTransport.ts` is the *only* file that
  touches real WebRTC APIs (the same "one seam" discipline `idbStore.ts` uses for `indexedDB`),
  and `src/components/sync/QrDisplay.tsx`/`QrScanner.tsx` are the only files that import
  `qrcode`/`jsqr` or call `getUserMedia`. This is what makes the pairing/transfer logic fully
  unit-testable (`tests/chunking.test.ts`, `tests/pairingCode.test.ts`, `tests/syncSession.test.ts`)
  with a fake in-memory transport (`tests/fixtures/fakeSyncTransport.ts`,
  `tests/fixtures/fakePeerConnection.ts`) even though jsdom has no WebRTC or camera stack at all.
- **What's deliberately *not* automated**: real two-device `RTCPeerConnection`/ICE/STUN
  negotiation and real camera-based QR scanning. This repo has no Playwright/e2e infrastructure,
  and adding one was scoped out of this feature — see `webrtcTransport.ts`'s header comment.
  Those two paths are verified manually, across two real devices, before any change here ships.
- **The wire protocol**, once connected: the host sends one small manifest naming which
  datasets it's about to send — some subset of `["workout", "bodyComp", "weighIns", "timeline"]`, never
  assumed, since a device might not have InBody data or entries — then for each
  dataset in order, `chunkPayload()`'s header followed by its chunks; once every dataset is sent,
  the host closes the channel. The joiner feeds every message after the manifest into a fresh
  `Reassembler` per dataset until each reports done.
- **`SyncDialog.tsx`** (`src/components/sync/`) is the pairing wizard shell — the one place that
  owns a `SyncSession` (via the `useSyncSession` hook, always backed by the real
  `webrtcConnectionFactory`) for the dialog's lifetime, and the one place that decides whether a
  received data needs confirmation before it's applied. **A sync is all or nothing: there is no
  per-dataset prompt.** If the joining device already has any of the incoming datasets, one
  `AlertDialog` (`ReplaceConfirmDialog.tsx`, shared with backup restore; same register as "Start
  over") names every dataset that would be replaced with both entry counts, and Replace applies the
  whole transfer while Cancel applies none of it. Only after that (or immediately, if there's nothing
  to conflict with) does it call the `onSynced*` handlers. The pure `planTransfer()` in
  `src/lib/sync/planTransfer.ts` (over `planReceived()` in `receivedDatasets.ts`) decides this; it
  queues every write and `flush()` applies them with the workout log last, because applying the
  workout log moves `App` to its reveal screen, which unmounts the dashboard and this dialog with it.
  Backup restore uses the same plan.
- **What syncs: the athlete's data, and only their data.** The workout log, the InBody history, manual weigh-ins
  and timeline entries. Preferences and configuration deliberately do **not** sync: theme
  (accent, light/dark mode), grouping and date range stay per device, since a phone and a laptop
  reasonably want different ones. PostHog's anonymous id in `localStorage` doesn't either — it is an
  analytics identifier. This is enforced at the wire, not by convention: `SyncDataset` has exactly
  four members and `decodeHeader` rejects any other name (`tests/chunking.test.ts` pins that
  `preferences` and `theme` are rejected). **A new persisted dataset that is the athlete's data must
  be added to sync in the same change** (a `SyncDataset`, an outgoing entry in `Dashboard.tsx`, a
  case in `planReceived`, an `onSynced*` handler in `App.tsx`), which also adds it to backup, since
  `BackupDatasets` is keyed by `SyncDataset`; a new preference or setting must not.
  **Everything that arrives is validated before anything is written**, to the shape its own parser
  produces (`validateReceived.ts` for the workout log and InBody history, `validateWeighIns`,
  `validateEntryList` for the timeline). Validation is all-or-nothing for the whole transfer: one bad row rejects
  its dataset with a reason naming the row, and then nothing at all is applied, the local copy is
  left exactly as it was, and a rejected dataset never becomes an overwrite prompt. Cells must be text (a parsed CSV has nothing else),
  columns the app doesn't read are kept, and a payload that isn't valid JSON is reported as
  damaged (an unreadable dataset also means nothing is applied). `SyncDialog` then says which
  dataset was rejected and why, states that nothing was synced, stays open on that notice, and counts
  the transfer as `sync_failed` with the fixed reason `invalid_data`. Datasets that were fine are
  not applied either.
- **Wired into `App.tsx`** as `handleSyncedWorkoutData`/`handleSyncedBodyCompData` (and
  `handleSyncedTimeline`) — all are
  unconditional writers, exactly like `handleFile`/`handleBodyCompFile` are today, because
  `SyncDialog` is what gates the call, not the handler. Synced data always carries
  `source: "upload"` (sync's entry points in the dashboard's Settings sheet, `SettingsSheet.tsx`,
  are disabled unless `source === "upload"` — sample data was never meant to sync anywhere), so
  it persists and participates in "Start over" identically to a direct upload.
  `handleSyncedWorkoutData` reuses `run()`'s shared post-parse tail
  (`finishSuccessfulLoad`, extracted from `run()` for exactly this reason) rather than
  duplicating the reset-range/persist/reveal sequence, since sync hands over already-parsed rows
  (read from the host's own storage) rather than raw CSV text.
- **Analytics**: `sync_attempted`/`sync_succeeded`/`sync_failed` in `src/lib/posthog.ts`, same
  closed-vocabulary discipline as every other `SwiftEvent` — `role` (`"host" | "joiner"`) and,
  for failures, a fixed `SyncFailureReason` (`ice_timeout`, `camera_denied`, `invalid_qr`,
  `connection_dropped`, `declined_overwrite`, `unsupported_browser`, `invalid_data`). No device identifiers, no
  session/pairing tokens, no SDP fragments — the payload types make that structurally
  impossible, not just a convention (`tests/syncAnalytics.test.ts`).

## Architecture: backup

`src/lib/backup/` and `src/components/backup/` let an athlete download everything they have in
the app as one JSON file and restore it later, after clearing the browser or on another computer.
The workout and InBody CSVs are already their own backups; what only a backup file preserves is
**timeline entries and weigh-ins**. It reuses sync's validators and planner rather than growing its
own, so the two can't drift on what a valid row is.

- **Format (v1)**: `{ format: "swift-backup", version, exportedAt, encoding: "plain", datasets }`, or
  for an encrypted one `encoding: "aes-256-gcm"` with `kdf`, `iv` and `ciphertext` in place of
  `datasets`. `datasets` (or the decrypted plaintext) holds the same bare arrays sync puts on the wire,
  keyed by `SyncDataset`. Athlete data
  only: never theme, grouping or date range. Empty datasets are omitted from the file, so a
  backup only ever replaces, never tells a restore to clear something. A file is written with
  `workout`, `bodyComp`, `weighIns` and `timeline`. Unknown dataset keys are
  ignored; a newer `version` or unknown `encoding` is refused with "made by a newer version".
- **Encryption is optional and off by default** (`encryption.ts`, `passphrase.ts`). PBKDF2-HMAC-SHA-256
  (`KDF_ITERATIONS` = 600,000, OWASP's floor for it) into an AES-256-GCM key, a fresh random 16-byte salt
  and 12-byte IV per export, all through Web Crypto: **no dependency**. PBKDF2 was chosen because it is
  native (nothing to ship, and nothing to be abandoned before a backup is opened years later), not
  because it is the strongest: it needs almost no memory, so GPUs guess faster against it than against
  scrypt or Argon2id, and the 8-character floor and the strength hint are what make up for that. The KDF
  is named in the file (`kdf.name`), so Argon2id is a new `encoding`, not a rewrite, and PBKDF2 backups
  must stay readable forever. The plaintext encrypted is exactly the plain `datasets` JSON, so
  validation and `planTransfer` are shared. The additional authenticated data
  (`swift-backup:<version>:<encoding>`) binds the ciphertext to its header. The iteration count is stored
  per file and bounds-checked on read (`MAX_KDF_ITERATIONS`) so a crafted file can't hang the tab. The
  passphrase is NFKC-normalised before deriving (so accents typed on two devices match) and is otherwise
  untouched: not trimmed, not case-folded. **The passphrase is never stored, logged, sent or put in
  analytics**: it is a function argument, held in component state only until the download or restore
  finishes. AES-GCM can't tell a wrong passphrase from a damaged or tampered file, so `readBackup`
  returns `wrong_passphrase` for both and the UI says so. There is no recovery: Swift has no account and
  no server, and the form says so once. What the file still shows: format, version, export time, KDF
  parameters and the approximate size, never dataset names or counts. `readBackup` returns
  `needs_passphrase` for an encrypted file given none. A plain backup is plaintext health data; the
  Settings copy says so once.
- **Restore replaces per dataset, never merges**, and a missing dataset leaves the local copy alone.
  A backup must contain a workout log (Download always writes one), so a half-restored state where
  InBody data persists but the app lands on the upload screen can't happen.
- **Nothing is written until the whole file is usable.** It uses the same all-or-nothing
  `planTransfer()` as sync (see the sync section for why the workout log is applied last): any
  dataset that fails validation aborts the restore with a reason, and the athlete confirms once for
  everything that would overwrite through the shared `ReplaceConfirmDialog`. An encrypted file asks for
  its passphrase first (`PassphraseDialog`, which stays open on a wrong one), before any overwrite
  confirmation; nothing is written while it is locked.
- **Wiring**: Download (`DownloadBackupButton`, with `BackupPassphraseForm`: a "Protect with a
  passphrase" checkbox, the passphrase typed twice, a length-band strength hint and a show/hide toggle
  inside each field) and Restore (`useBackupRestore`) sit in Settings'
  Backup section; restore is also on the landing page ("Restore from a backup", grouped with sync under "Already use
  Swift?"), the only place a new browser can reach. The landing page's dropzone and paste handler
  route a `.json` file (`looksLikeBackup`) to restore instead of the CSV parser, which would reject it. The labels are Backup/Restore, not Export/Import, because the athlete's
  goal is getting their data back, because "Import" suggests adding rather than replacing, and
  because "Export" already means the SugarWOD CSV on the landing page. Timeline entries have no separate
  export or import: they travel in the backup like everything else, which is all-or-nothing and replaces
  rather than merges. Sample data can't be backed up and has nothing to confirm on
  restore (it is never stored). Restore errors stay inline: `Landing`'s own error alert dismisses through `reset()`, which wipes storage. Both reuse
  the `onSynced*` handlers. `handleSyncedTimeline` must not look at `state`: on the landing page
  it is still the previous screen, which used to make received entries vanish on reload.
- **Analytics**: `interaction_used` with `backup_exported`/`backup_imported` (the event names predate the Download/Restore labels and stay as
  they are: a closed vocabulary, not copy), nothing else: no
  filename, counts or failure text, and not whether a backup was encrypted (`tests/backupPassphrase.test.tsx` pins that the passphrase and the word "encrypted" never reach a payload).

## Architecture: dashboard layout

The dashboard's controls are sorted by how often an athlete touches them, and each tier has one
home. Read the header comments of the files named here before moving anything between tiers.

- **Navigate** (every visit) — `SectionNav.tsx`. Four sections in the page header, at its true
  centre from `lg` up (a three-column grid with equal outer tracks; narrower screens wrap them
  onto their own row). Overview (the front page, on its own), Training (Workouts and Lifts, then the ten GPP
  domains, three modalities and Movements — a classification of those same workouts, not separate
  data, which is what their group headers are there to say), Body (Body Comp) and Insights
  (Progress, Timeline). The views
  inside a section are a plain row of tabs under the page title, never a dropdown, so every
  sibling is visible; a one-view section shows no second row. Where a section mixes two kinds of
  view (Training's Domains and Modalities), each group's label sits *above* its tabs as a
  header — in line with them it read as one more tab. Workouts and Lifts share an unlabelled
  group (the record of what was done) and Movements is a group of one, so neither has a header;
  Workouts comes first, so selecting Training opens the log. Training is the long row (16 tabs): it fits at 1280px with
  the gaps tightened from `lg`, and below that scrolls sideways, with a fade (and on a pointer device a button) at each edge that
  has more tabs past it and the selected tab scrolled into view. The Cardio domain and the M modality are both labelled "Cardio" on
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
red, and the `--repmax-1/2/3/5` tokens (red/orange/green/blue). The `--repmax-*` tokens colour the
lift-chart dots and legend by rep scheme (`FIXED_REPMAX_COLORS` in `chartUtils.ts`), and the
Overview and per-row M/W/G bars reuse three of them (`FIXED_MODALITY_COLORS`). On Workouts each bar's colours are named beside it: a dot before each letter in the sticky column header and before each
value under the bar (`ModalityHeaderKey`, `SplitLine` in `ModalityBar.tsx`), since the page key scrolls away. Those bars are drawn in
`MODALITY_DRAW_ORDER` (W, G, M), never `MODALITY_LIST`'s M, W, G: the canonical order stacks red onto green, which
deuteranopia can barely tell apart, and `tests/modalityColors.test.ts` measures every adjacent pair from the real tokens.
Overview's days-trained bars sit in the same card, so they use neutral ink rather than the accent, which matched one of the
three modality colours for half the swatches. They are fixed on
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
