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
- **components**: `Dashboard.tsx` renders 19 views (`tabs.ts` → `ALL_TABS`): Overview,
  Workouts, the ten GPP domains, the three modalities, Body Comp, and the Insights views
  (Progress, Compare, Tags), grouped for navigation into
  four sections (see "Architecture: dashboard layout" below). The views that need an InBody export
  all share one empty state, `InBodyUploadPrompt.tsx`. A
  single `DomainTab` drives all ten domain tabs and a single `ModalityTab` all three modality
  tabs — they differ in data, not structure. Body Comp is its own component (`BodyCompTab.tsx`),
  always present in the nav even before any InBody data is loaded, and Progress follows
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
  props, rendered together on the Progress view (`LiftsTab.tsx`): `AlignmentSummary.tsx` on top, then
  `PlateauSection.tsx`. Alignment is a summary above the plateau table, not a tab of its own,
  because it is only a rollup of that table's output.

## Architecture: InBody noise band

`src/lib/analytics/bodyCompNoise.ts` answers "is this change between two scans bigger than
scan-to-scan noise?" so no body-composition claim rests on sign alone. `getBodyCompNoiseBand()`
estimates a band per metric (`weight`, `leanMass`, `fatMass`, `bodyFatPct`) on a ladder — scans
within a week of each other (`paired-scans`), else spread around a rolling median (`residual`),
else a labelled per-metric `default` — and returns `status: "insufficient"` only when no scan
reports the metric at all. `isMeaningfulChange(delta, band)` is the one comparison.

- Every threshold lives in `insightConfig.ts` with a comment on how it was chosen, and every one
  is *tunable, validate against real data*: the repo bundles no real InBody history. Do not put a
  bare number in an insight module; add it there.
- The seam is `computeBodyCompTrend(start, end, bands?)`. With bands it sets `withinNoise` flags
  on the trend (delta values stay untouched), and `isBodyCompDeclining`/`isBodyCompImproving`
  treat a within-noise delta as not having moved. Plateaus, Alignment and Experiments all go
  through those, so none has its own threshold. `describeWithinNoise()` is the one sentence the
  three tabs show ("... within normal scan variation.").
- Bands are estimated from the athlete's whole scan history as of `asOfDate`, never from a
  per-subject window (too few scans). `NO_NOISE_BANDS` (all zero) reproduces the old sign-only
  behaviour exactly.

## Architecture: Relative strength

`src/lib/analytics/relativeStrength.ts` (`getRelativeStrength(workouts, scans, { asOfDate })`)
divides each load-scored lift's per-session estimated 1RM by body mass, to tell "got stronger"
from "got bigger". It reuses the Plateau Detector's lift grouping (`buildLiftSubjects`, same
name normalisation, same RX/Scaled split, Load-scored rows only) and `estimateOneRepMax`; the
one difference is the rep cap (`RS_MAX_REPS`, any scheme up to it, versus Plateaus' 1/2/3/5RM).
Body mass at a session is the scan that day, else a straight line between bracketing scans no
further apart than `RS_MAX_INTERPOLATION_GAP_DAYS`, else the nearest scan within
`RS_MAX_NEAREST_SCAN_DAYS`, else `unmatched` — never extrapolated. The mass change over the
window is judged with the noise band, so a change inside normal scan variation is never blamed
for a lift change. Attribution is `strength-driven | mass-driven | mixed | flat | declined`
(`declined` is an addition to the original plan's four, which had nowhere to put a fall). Lifts
failing a gate keep their series and carry a `reason` naming the gate and the shortfall.
Wired in `App.tsx` behind the same both-uploads gate as Plateaus; rendered by `StrengthSection.tsx`, the third section of the Progress view. `LiftsTab` owns the
both-uploads gate for all three sections (one upload prompt), and a lift's plateau row carries its
strength attribution with the strength window named (`RS_WINDOW_DAYS`), because the plateau read
windows by session count and the strength read by a fixed year and the two must not read as one.

## Architecture: window comparison and context tags

`compareWindows.ts` (`compareWindows(workouts, scans, windowA, windowB, options)`) is "select a
range, see what changed". It reuses the Plateau Detector's subject building unchanged and the
noise band for body-comp deltas. A lift/benchmark needs `CMP_MIN_OBSERVATIONS_PER_WINDOW` entries
in *each* window or its row is `comparable: false` with a reason and **no numbers** (never a
partial comparison); overlapping or inverted windows are `insufficient`. `defaultWindowA()` is
the equal-length window immediately before B.

- **One data model.** "Save as experiment" writes window B to an `Experiment`'s `date`/`endDate`
  and window A's start to its optional `baselineStart` (`windowsToExperimentFields`).
  `getExperimentInsight` then compares `[baselineStart, date)` against the experiment's own range,
  so the saved verdict is built on the earlier range the Compare table showed. An experiment with
  no `baselineStart` (everything made before the field existed, and anything added directly)
  compares against all history before its start date, exactly as before. `baselineStart` must be
  strictly before `date`; otherwise it is ignored, the same defensiveness as an inverted `endDate`.
  An experiment's "before" side always runs up to its start date, so a custom window A that ends
  earlier than the day before window B gains the gap when saved; `PeriodsTab` says so
  (`windowAIsContiguous`).
- **Dragging is a convenience, never the only way.** `charts/chartInteraction.tsx` gives a chart a
  drag-to-select (`useChartInteraction`, fed by a `ChartInteractionProvider` in `Dashboard.tsx`)
  and shaded tag bands. A selection offers "Compare with the N days before" and "Tag this range";
  every path also exists as date inputs on the Compare and Tags views. Wired into
  `ConsistencyChart`, `BodyCompLineChart` and `RelativeStrengthChart`; `LiftChart` (a numeric-axis
  scatter) has neither bands nor drag.
- **One view, not three.** The former Compare, Experiments and Cycles views are one Compare view (`PeriodsTab.tsx`; its page title reads "Compare periods")
  because they answer one question about a range and differ only in how the range was named. The
  range (window B, plus the earlier window A) is the only input: typed, dragged out on a chart, or
  filled in from a saved experiment (its dates and `baselineStart`) or a block tag. Every range gets
  the same three things: a `getCycleReport` for it (`CycleReportBody`), the `compareWindows`
  tables (`ComparisonTables`), and, when the range came from a saved experiment, that experiment's
  `ExperimentVerdict`. Typing a date drops the saved-experiment framing, since the verdict no longer
  describes what is on screen. The experiment verdict compares against all history before the start
  date when there is no `baselineStart`, while the tables use the equal-length window before it;
  the verdict card states which. Compare does **not** gate on InBody: the comparison and the report
  degrade on their own (body composition says why it can't be compared), and only the experiment
  verdict waits on both uploads, at which point it shows `InBodyUploadPrompt` in its place.
- **Tags** (`types/tag.ts`, `contextTags.ts`, `storage/tagsStorage.ts`, key `"context-tags"`) are
  user-authored, persist only when `source === "upload"`, are wiped by Start over, and have
  JSON export/import (strict validation, merge by id), and sync between devices (see "Architecture:
  cross-device sync"). Sample mode seeds a set of them (`generateSampleTags.ts`) so the Tags, Cycles
  and chart-band views aren't empty; they are in memory only, never persisted or synced.
- **Tags never change a result.** `getPlateauInsights`/`getAlignment` take `options.tags` and, when
  a plateaued result's (or the alignment) window overlaps a cut or injury tag, add a `tagNotes`
  sentence naming the tag. With no tags, or none overlapping, the output is identical to the
  untagged one (the field is absent, not empty); `tests/insightTags.test.ts` pins that.
- Analytics: `interaction_used` with a closed `InteractionName` union in `posthog.ts` — a name
  from that list, never a value.

## Architecture: cycle reports

`cycleReport.ts` gives a retrospective per training block. **Cycles are user-defined only**:
`getCycles()` turns tags of type bulk/cut/maintain/other into cycles (injury and travel are
context, not blocks) and `customCycle()` takes typed dates. Automatic segmentation by lift-exposure
share is *not* built — the plan requires prototyping it on a multi-year history and reviewing it by
eye first, and none is in the repo. `Cycle.source` keeps `"detected"` so adding it changes no type.

`getCycleReport()` does not recompute earlier phases: lift changes and their attribution come from
`getRelativeStrength` (window = the cycle), and whether a body-comp change beats scan noise comes
from `getBodyCompNoiseBands`/`isMeaningfulChange`. Volume is logged workouts per week. A cycle
under `CYCLE_MIN_DAYS`, empty, or inverted is `insufficient` with a reason. The summary states
volume, lift changes, then body composition; it never grades them (a test rejects judgement words).
Injury/travel tags inside the cycle add a sentence naming them. Rendered by `CycleReportBody.tsx` inside the Compare view: a block tag fills the range in, and
any range gets the same report (a typed range is the same as a block with no tag).

## Open items: what is unvalidated or undecided

The insight pipelines above (noise band, relative strength, compare, tags, cycles) were built
against the bundled sample and synthetic InBody data. The repo holds no real InBody history, so
**none of the `insightConfig.ts` thresholds has been checked against a real athlete.** Treat them
as starting points and check them against real exports before trusting a number. Specifically:

- **Noise band.** On the synthetic sample the bands came from the `residual` method (weight
  ±2.9 lb, lean ±2.1, fat mass ±2.3, body fat ±1.3 points) and no existing output changed. The
  `paired-scans` method needs scans within 7 days of each other, so anyone scanning monthly or
  less lands on `residual` or `default`; expect `default` under about 8 scans. Lean mass uses Soft
  Lean Mass where present else Skeletal Muscle Mass; the band is estimated on that same field but
  `computeBodyCompTrend` chooses per pair of scans, so an export mixing the two would judge a
  delta in one field against a band from the other. The one behaviour change from bands: a +3 lb fat-mass case that used to read
  `plateaued_body_comp` is now within the default 3 lb band (the test uses +4 lb and a new case
  pins the within-band result).
- **Relative strength.** Not spot-checked by hand against raw CSVs (compute the e1RM from
  `best_result_raw` and the rep scheme in the title/description, average of Epley and Brzycki,
  and compare with the chart tooltip; `tests/relativeStrength.test.ts` pins the same arithmetic).
  On the sample only 4 of 32 lift series qualify — Back Squat has 29 sessions but 2 in the last
  year — so `RS_WINDOW_DAYS` may be too strict for lifts tested rarely. RX and Scaled are split
  per lift, as on Plateaus, which halves sessions for anyone who switches; merging load lifts is
  an open question. A title naming a different scheme than the athlete did will be mis-estimated;
  that is inherent to the export.
- **Compare and Experiments.** There is no touch dragging on charts (date inputs are the fallback).
- **Sync.** Tags sync, but like everything in sync they are verified by unit tests and by hand on two
  devices, not by an automated two-device test. A joiner running an older cached build rejects a
  manifest naming a dataset it doesn't know (`tags`), so both devices need the current build; a
  refresh fixes it.
- **Backup encryption.** The iteration count (600,000) and the strength bands are first drafts: measure
  derive time on a mid-range phone before raising the former. The strength hint is length-only by design
  (character classes are ignored on purpose, since composition rules reward `Password1!`), with one
  guard for fewer than 5 distinct characters. The known gap, pinned in `tests/passphrase.test.ts`, is that
  long predictable passphrases (`passwordpasswordpassword`, `1234567890123456`) rate "Strong". Left as is
  because encrypted backups are optional and the hint is not a gate; if it needs to be smarter, the options
  are cheap pattern checks (repeated chunks, sequences, a short common-passwords list) or a real estimator
  such as zxcvbn loaded only when the checkbox is ticked. Argon2id would be stronger against GPUs but needs a library; the upgrade path is
  a new `encoding` via `kdf.name`. There is no passphrase recovery, by design. Not tested by hand on a real
  password manager beyond the `autocomplete` attributes.
- **Cycles.** Automatic detection is deferred. First prototype worth trying: a rolling share of
  lift sessions per lift (about an 8-week window) with a boundary where the leading lifts change,
  reviewed by eye on a multi-year history before committing to it. A lift can show a change with
  no attribution when too few scans fall inside its window, and a cycle report only looks inside
  the cycle (Compare is the before/after).
- **Copy.** The tag sentences (cut, injury) and the cycle-summary phrases ("not explained by body
  mass", "partly body mass") are first drafts; check them against the voice rules below.

## Architecture: Experiments

`src/lib/analytics/experimentInsight.ts` is a third pipeline in the same family as Plateau
Detector and Alignment above — same before/after performance-vs-body-comp comparison, same two
datasets required — but anchored to an athlete-logged date instead of a rolling recent/prior
window.

- **`Experiment`** (`src/types/experiment.ts`) is user-authored, not derived from either upload:
  a `date` ("when I tried this"), a free-text `label` ("what I tried"), an optional `endDate` and
  an optional `baselineStart` (where the "before" side starts; unset means all earlier history). It's its own
  IndexedDB-backed dataset (`src/lib/storage/experimentsStorage.ts`, key `"experiments"`, same
  thin-wrapper pattern as `workoutStorage.ts`/`bodyCompStorage.ts`) — added, edited and deleted from the
  Experiments list on the Compare view (`PeriodsTab.tsx`; the same `ExperimentForm` adds and edits — an edit keeps
  the `id`, and clearing the end date makes it ongoing again), persisted only when `state.source === "upload"` in
  `App.tsx`, same sample-mode exclusion as everything else logged while browsing demo data. Experiments
  that arrive by sync or backup restore are different: they are uploads by definition, so
  `handleSyncedExperiments` always persists them (see "Write points" below).
- **`getExperimentInsight(experiment, workouts, inbodyScans, asOfDate)`** reuses #1's subject
  identification and body-comp-trend helpers unchanged (`buildLiftSubjects`/
  `buildBenchmarkSubjects`, `parseWorkoutDate`/`parseInBodyDate`, `computeBodyCompTrend`,
  `isBodyCompDeclining`/`isBodyCompImproving`) — the normalization rules must not drift between
  the three pipelines — but computes its own before/after split around the experiment's own
  `date`, since #1's session-count windowing has no reason to land on either side of a date an
  athlete picked. Its eligibility gate (≥3 subjects with data on both sides, ≥2 InBody scans on
  each side) is checked independently per side, so `insufficient_data`'s `reason` names exactly
  which side is thin — same `formatGateShortfall()` convention as #1/#2.
- Classification is `improved`/`declined`/`no_change`/`mixed`/`insufficient_data` — `mixed` is a
  strict-majority miss (no more than half of classified subjects agree), the same "informative,
  not an error state" treatment Plateau Detector/Alignment give their own ambiguous cases.
- Sample mode seeds a couple of plausible experiments (`src/lib/sample/generateSampleExperiments.ts`)
  at fixed month-offsets from the athlete's first logged workout (never hardcoded calendar dates),
  chosen only when they leave enough history on both sides to pass the eligibility gate above —
  the classification itself is never biased toward a rosy outcome; it falls out of whatever the
  real sample data shows.
- Wired into `App.tsx` behind the same gate as Plateau Detector/Alignment — neither runs until
  both uploads are `"ready"` — and rendered by `ExperimentVerdict.tsx` when an experiment is picked on the Compare view, not part of
  `Insights`/`buildInsights.ts`'s return shape.

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
  datasets it's about to send — some subset of `["workout", "bodyComp", "experiments", "tags"]`,
  never assumed, since a device might not have InBody data, experiments or tags — then for each
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
- **What syncs: the athlete's data, and only their data.** The workout log, the InBody history,
  experiments and context tags. Preferences and configuration deliberately do **not** sync: theme
  (accent, light/dark mode), grouping and date range stay per device, since a phone and a laptop
  reasonably want different ones. PostHog's anonymous id in `localStorage` doesn't either — it is an
  analytics identifier. This is enforced at the wire, not by convention: `SyncDataset` has exactly
  four members and `decodeHeader` rejects any other name (`tests/chunking.test.ts` pins that
  `preferences` and `theme` are rejected). **A new persisted dataset that is the athlete's data must
  be added to sync in the same change** (a `SyncDataset`, an outgoing entry in `Dashboard.tsx`, a
  case in `planReceived`, an `onSynced*` handler in `App.tsx`), which also adds it to backup, since
  `BackupDatasets` is keyed by `SyncDataset`; a new preference or setting must not.
  **Everything that arrives is validated before anything is written**, to the shape its own parser
  produces (`validateReceived.ts` for the workout log, InBody history and experiments,
  `validateTagList` for tags). Validation is all-or-nothing for the whole transfer: one bad row rejects
  its dataset with a reason naming the row, and then nothing at all is applied, the local copy is
  left exactly as it was, and a rejected dataset never becomes an overwrite prompt. Cells must be text (a parsed CSV has nothing else),
  columns the app doesn't read are kept, and a payload that isn't valid JSON is reported as
  damaged (an unreadable dataset also means nothing is applied). `SyncDialog` then says which
  dataset was rejected and why, states that nothing was synced, stays open on that notice, and counts
  the transfer as `sync_failed` with the fixed reason `invalid_data`. Datasets that were fine are
  not applied either.
- **Wired into `App.tsx`** as `handleSyncedWorkoutData`/`handleSyncedBodyCompData` (and
  `handleSyncedExperiments`/`handleSyncedTags`) — all are
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
**experiments and context tags**. It reuses sync's validators and planner rather than growing its
own, so the two can't drift on what a valid row is.

- **Format (v1)**: `{ format: "swift-backup", version, exportedAt, encoding: "plain", datasets }`, or
  for an encrypted one `encoding: "aes-256-gcm"` with `kdf`, `iv` and `ciphertext` in place of
  `datasets`. `datasets` (or the decrypted plaintext) holds the same bare arrays sync puts on the wire,
  keyed by `SyncDataset`. Athlete data
  only: never theme, grouping or date range. Empty `experiments`/`tags` are omitted from the file, so a
  backup only ever replaces, never tells a restore to clear something. Unknown dataset keys are
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
  because "Export" already means the SugarWOD CSV on the landing page. Tags keep their own
  Export/Import (that one does merge). Sample data can't be backed up and has nothing to confirm on
  restore (it is never stored). Restore errors stay inline: `Landing`'s own error alert dismisses through `reset()`, which wipes storage. Both reuse
  the `onSynced*` handlers. `handleSyncedExperiments` must not look at `state`: on the landing page
  it is still the previous screen, which used to make received experiments vanish on reload.
- **Analytics**: `interaction_used` with `backup_exported`/`backup_imported` (the event names predate the Download/Restore labels and stay as
  they are: a closed vocabulary, not copy), nothing else: no
  filename, counts or failure text, and not whether a backup was encrypted (`tests/backupPassphrase.test.tsx` pins that the passphrase and the word "encrypted" never reach a payload).

## Architecture: dashboard layout

The dashboard's controls are sorted by how often an athlete touches them, and each tier has one
home. Read the header comments of the files named here before moving anything between tiers.

- **Navigate** (every visit) — `SectionNav.tsx`. Four sections in the page header, at its true
  centre from `lg` up (a three-column grid with equal outer tracks; narrower screens wrap them
  onto their own row). Training (Overview, Workouts), Breakdown (the ten GPP domains and three
  modalities — a classification of the same workouts, not separate data), Body (Body Comp) and
  Insights (Progress, Compare, Tags). The views
  inside a section are a plain row of tabs under the page title, never a dropdown, so every
  sibling is visible; a one-view section shows no second row. Where a section mixes two kinds of
  view (Breakdown's Domains and Modalities), each group's label sits *above* its tabs as a
  header — in line with them it read as one more tab. `tabs.ts` stays the flat identity list
  (`ALL_TABS`) that analytics and the tab content key off; `SECTIONS` only groups it, and
  `tests/sectionNav.test.tsx` asserts every tab lands in exactly one section. The Progress and Compare
  views keep their earlier internal names (tab ids `lifts`/`periods`, `LiftsTab.tsx`/`PeriodsTab.tsx`);
  only the labels and page titles changed.
- **Scope** (most visits) — `ScopeLine.tsx`. Date range and grouping, written as one sentence
  under the page title ("Showing all time, grouped by month"), next to the charts they change
  rather than in the global header. It sits in its own row under a thin rule (with "Stored in
  this browser only" on the right, for uploaded data), so the heading block (title and, on
  domain pages, CrossFit's definition) ends visibly before the view controls begin. Insights
  views show a plain "uses your full history" sentence instead, because `App.tsx` computes them
  from the whole unfiltered log as of today — a date control there would silently do nothing.
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
- **`workoutStorage.ts`** / **`bodyCompStorage.ts`** / **`viewPreferencesStorage.ts`** /
  **`experimentsStorage.ts`** are thin typed wrappers, one key each (`"workout-rows"`,
  `"body-comp-rows"`, `"view-preferences"`, `"experiments"`, plus `tagsStorage.ts` with `"context-tags"`
  — see "Architecture: Experiments" and "window comparison and context tags" above). Nothing outside `src/lib/storage/` calls `idbGet`/`idbSet`/`idbDelete`
  directly — a new dataset gets its own wrapper file, not a call site that reaches past it.
- **Restore-on-mount**: `App.tsx` starts in `{ status: "loading" }` (reusing `Landing`'s
  existing loading UI — no new component) and a mount-only effect loads all five datasets
  (workout rows, body-comp rows, view preferences, experiments, tags) from storage in parallel before
  deciding whether to show the dashboard or the upload screen.
- **Write points**: a successful SugarWOD parse persists only when `source === "upload"` — the
  bundled sample file is deliberately never cached, so demo mode never leaves anything behind. A
  successful InBody parse always persists (there's no sample-data concept for it). Data that arrives
  by sync or backup restore (the `handleSynced*` handlers) always persists too, since it is an upload
  by definition; those handlers must never look at `state`, because on the landing page it is still the
  previous screen, and checking it once made restored experiments vanish on reload. `range` and
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
  uses, so a re-upload fully replaces only its own dataset — `experiments` and the other dataset
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
  what gets deleted (workout log, body composition history, experiments, context tags) so this is the one
  place all three are named together.
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
- `REQUIRED_COLUMNS` (`src/types/sugarwod.ts`) deliberately omits `set_details` and `notes`
  because nothing reads them — a slim export must not be rejected for missing them.
- User-facing parse errors are plain language, mapped in `plainParseMessage()`. PapaParse's
  own developer-facing wording must never reach the UI; `tests/parseCsv.test.ts` guards that.
