# Swift

[![CI](https://github.com/ayovev/swift/actions/workflows/ci.yml/badge.svg)](https://github.com/ayovev/swift/actions/workflows/ci.yml)

Swift turns a SugarWOD training-history CSV export into an interactive dashboard. You drop in the CSV your gym's training log gives you, and Swift reads back what years of workouts actually add up to: how consistently you showed up month over month, how your named lifts progressed, your history on named benchmark workouts, a timeline of logged PRs, how your training emphasis is spread across the ten CrossFit general physical skills (the GPP domains), and the proportional mix of metabolic conditioning, weightlifting and gymnastics work in your log. Add an InBody body-composition export alongside it, and Swift also flags which lifts and benchmarks have plateaued — and whether that's happening alongside a change in body composition or on its own — plus a whole-athlete read on whether your performance and body composition are currently telling a consistent story. It is for an individual athlete who already has a SugarWOD export and wants to see the shape of their own training — there are no coach views, no multi-athlete comparisons, and nothing to set up.

## Privacy

Nothing you upload leaves your browser.

Swift has no backend, no database, and no accounts. The CSV is read through the browser's File API, parsed with PapaParse, classified, and aggregated entirely in the page you have open. There is no server to receive it — nothing you upload is ever sent anywhere.

Your data does stick around locally, though: Swift caches your uploaded rows — SugarWOD and, if you add it, InBody — in the browser's own IndexedDB storage so closing the tab and coming back doesn't force a re-upload. Your selected date range and chart granularity are cached alongside it, so the dashboard reopens the way you left it. That cache never leaves your browser — it's not transmitted or synced anywhere. You can bring in a fresh export any time without losing anything else: **Update workout data** and **Replace file** (in the Body Comp tab) each swap in a new CSV for just that one dataset. **Start over** is the one control that clears everything at once — your uploaded rows, body composition history, and anything else you've logged — so it asks you to confirm first, once there's real data loaded (sample mode still resets in a single click, since nothing persisted is at risk). You can also just clear your browser's site data yourself. The bundled sample export is never cached this way, so trying it out never leaves anything behind.

The app does send anonymous product-usage events to PostHog (page opened, upload attempted / succeeded / failed, sample data used, tab viewed, theme changed, date range changed, granularity changed) when a PostHog key is configured. Those payloads carry only fixed strings and coarse buckets — never workout text, filenames, row counts, or any identifier. `src/lib/posthog.ts` types the entire event surface deliberately narrowly so it stays that way, and `tests/analytics.test.ts` asserts it.

## Quick start

Requires Node and npm. Use npm — not yarn or pnpm.

```sh
npm install
cp .env.example .env
npm run dev
```

Other scripts:

```sh
npm run build      # tsc -b && vite build, output in dist/
npm run preview    # serve the production build locally
npm test           # vitest run
npm run test:watch # vitest in watch mode
npm run typecheck  # tsc -b --noEmit
```

`.env.example` has an empty `VITE_PUBLIC_POSTHOG_KEY`. Leave it empty: analytics is optional and no-ops cleanly without a key, so the app runs normally. `.env` is gitignored; `.env.example` is committed with no real value in it.

## Getting your data in

**Your own export.** In SugarWOD, open your training log and choose **Export Workouts**. That gives you a CSV. Drop it on Swift's upload area, or pick it with the file picker.

Swift expects SugarWOD's own export schema — the columns `date`, `title`, `description`, `best_result_raw`, `best_result_display`, `score_type`, `barbell_lift`, `rx_or_scaled`, `pr`. If a file is missing columns, is empty, isn't really a CSV, or has no readable dates, you get a plain-language message saying which, rather than a parser error.

**Sample data.** The landing page has an "Or try it with sample data" option that loads a bundled real export and renders the full dashboard with no upload. Sample mode keeps a banner at the top of the dashboard the whole time so it is never mistaken for your own results.

**Body composition, optionally.** Swift also accepts an InBody scan-history export — a separate upload, entirely optional, with its own Body Comp tab. It expects InBody's own export columns (`date`, `Weight(lb)`, and whichever body-composition metrics your InBody tier reports); only `date` and weight are required, so a slimmer export still works. Uploading it also unlocks two more tabs: **Plateaus**, which checks whether a given lift or named benchmark has stalled and, if so, whether body composition is a plausible contributor, and **Alignment**, a whole-athlete rollup of that same comparison — are performance and body composition pointing the same direction, or not.

**Updating your data.** Got a fresher export? You don't need to start over. **Update workout data**, in the dashboard header, swaps in a new SugarWOD CSV; **Replace file**, in the Body Comp tab, does the same for your InBody history. Each replaces only that one dataset — your other upload and anything else you've logged stay put.

## Architecture

Data flows through four stages, entirely in the browser: **parse** (`src/lib/csv`) turns your CSV into typed rows and rejects anything malformed with a plain-language error; **classify** (`src/lib/classify`) tags each workout against the ten GPP domains and splits it proportionally across the three CrossFit modalities; **analytics** (`src/lib/analytics`) buckets classified rows by your chosen time granularity and builds everything the charts need; and the **dashboard** (`src/components/dashboard`) renders it. `buildInsights.ts` is the single entry point tying the last three stages together, so classification only ever runs once per upload even though several charts read the result.

**Local persistence** (`src/lib/storage`) sits alongside this pipeline rather than inside it. Your uploaded SugarWOD rows, and separately any InBody body-composition export, are cached in the browser's own IndexedDB the moment they're parsed, so reopening the app restores your dashboard instead of asking you to re-upload. It's a plain key/value cache — one browser-local database, cleared in full by **Start over** (which now asks you to confirm before it does, once there's real data to lose) — with no query engine and no schema beyond "one key per dataset." Sample data is deliberately excluded from it, so demo mode never leaves anything behind.

**A second, independent pipeline** compares your SugarWOD log against your InBody history: `src/lib/analytics/plateauDetector.ts` classifies each lift and named benchmark as improving, plateaued, or not-yet-enough-history by comparing recent performance to InBody scans over the same window; `src/lib/analytics/alignment.ts` rolls those per-lift reads up into one whole-athlete read of whether performance and body composition currently agree. Both are pure functions over the same two already-parsed datasets — no extra parsing, no new persistence — and both require an InBody upload to run at all.

## Project structure

```
src/lib/csv/         CSV parsing and validation (PapaParse), with plain-language errors
src/lib/classify/    the two classifiers and the shared text matcher they both use
src/lib/analytics/   turns classified rows into everything the charts and tabs need
src/lib/theme/       the accent-colour system: OKLCH ramp derivation and contrast maths
src/lib/storage/     IndexedDB-backed local persistence for uploaded rows and view preferences
src/components/      landing page, dashboard, charts, theme controls, shadcn/ui primitives
src/types/           the SugarWOD row shape, and the domain/modality data contracts
tests/               vitest suites, plus fixtures including the Python reference output
public/sample/       the bundled sample export that powers demo mode
scripts/             dev-only: regenerates the parity fixture (not part of the build)
```

- **`src/lib/classify`** — `matcher.ts` is the single text-matching engine; `domainKeywords.ts` holds the GPP keyword rules; `movementLexicon.ts` and `classifyModality.ts` hold the M/W/G movement vocabulary and the proportional split.
- **`src/lib/analytics`** — `buildInsights.ts` is the entry point: rows are parsed and classified once, then `buildDashboardData.ts` (GPP domains, lifts, benchmarks, PRs, monthly counts) and `buildModalityData.ts` (M/W/G aggregates) both read the same parsed rows.
- **`src/lib/theme`** — the base UI is black and white in matching light and dark modes; a single user-chosen accent colour is derived into a full 50–950 shade ramp so it holds contrast in both modes.
- **`src/lib/storage`** — one IndexedDB database, one key per uploaded dataset plus one for the selected date range/granularity; wraps the raw API so the rest of the app only ever calls typed save/load/clear functions.
- **`src/components`** — `landing/` for the upload path and explainer, `dashboard/` for the Overview tab, the ten per-domain and three per-modality tabs, the independent Body Comp tab, and the Plateaus/Alignment tabs that compare the SugarWOD and InBody datasets together, `ui/` for the shadcn/ui primitives the rest builds on.

Stack: Vite, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, PapaParse, dayjs. No plain `.js`/`.jsx` source files.

## How classification works

Both classifiers read the same input: the workout's `title`, `description` and `barbell_lift` fields concatenated and lowercased. That is all they see. There is no lookup table of known workouts and no model — it is keyword and phrase matching over free text.

Matching is plain substring containment by default, not word-boundary matching. This is deliberate: SugarWOD descriptions frequently concatenate lines with no separator at all (`21-15-9DeadliftsPull-ups-200m run after each round`), so the character before a genuine movement name is often a letter, and a boundary rule would silently drop real matches. The cost is the occasional false positive, which a small measured exclusion list handles surgically (`carry` inside `carryover`, `press` inside `pressure`). Very short abbreviations like `du` or `kb` opt into a stricter token mode instead.

Substring matching also gets most inflections for free — `run` finds `runs` and `running`, `press` finds `presses`. The one case it cannot reach is where the stem itself changes, so the matcher additionally searches the English consonant-plus-`y` → `i` form of every keyword: `carry` finds `carries` and `carried`, `heavy` finds `heavier` and `heaviest`. That is a rule in one place rather than plural spellings scattered through the keyword lists, so it holds for exports this project has never seen.

**The ten GPP domains** — Cardiovascular/Respiratory Endurance, Stamina, Strength, Flexibility, Power, Speed, Coordination, Agility, Balance, Accuracy — each have a keyword list, and a workout hits a domain if any of that domain's keywords appear in its text. **Domains are not mutually exclusive**: most workouts hit several, which is the point. Because of that overlap, a single month's domain percentages sum to well over 100%, so the normalized stacked chart divides by total tags rather than total workouts. Swift keeps the specific keyword that triggered each match and shows it in the per-domain drill-down, so you can always check the reasoning. Keyword order within each list matters — the first keyword that hits is the one reported to you.

**The M/W/G modality mix** is proportional rather than a single label, and it follows canonical CrossFit semantics:

- **M — Metabolic conditioning**: monostructural work only. Running, rowing, biking, skiing, jumping rope. Not "anything that makes you breathe hard".
- **W — Weightlifting**: an external load moved by you. Barbell, dumbbell, kettlebell, odd objects.
- **G — Gymnastics**: your own bodyweight moved through space.

Each distinct movement named in a workout contributes equal weight to its modality, and a movement counts once however many times it appears. So Fran (thrusters and pull-ups) is 50% weightlifting / 50% gymnastics / 0% cardio — punishing metabolically, but with nothing monostructural in it. The three shares are rounded by largest remainder so they always sum to exactly 100. Movement phrases are claimed longest-first, so `power clean` beats bare `clean`, `air squat` (G) beats bare `squat` (W), and `ring row` (G) beats bare `row` (M) — adding a movement to the lexicon never requires re-tuning the order of anything else. Workouts where no movement is recognised at all are reported as unclassified and excluded from every average rather than counted as zeroes, and the dashboard footer says how many those were.

**This is a heuristic, not ground truth.** It is automated inference over free text your gym wrote, so a workout can land somewhere surprising if things are named unusually. Flexibility in particular reads low for almost everyone, because mobility work rarely gets logged as its own entry — not because nobody stretches. Every tab shows what it matched on so you can judge for yourself.

## Testing

```sh
npm test
```

Vitest, jsdom environment, suites in `tests/`. Coverage is on the logic rather than the UI — there are no end-to-end browser tests. Broadly:

- `matcher.test.ts` — the shared matching engine: substring vs. token mode, exclusions, glued-together text.
- `domainClassifier.test.ts` — each of the ten GPP domains, multi-domain workouts, which keyword gets reported, the measured false-positive corrections, and known limitations pinned deliberately so they change visibly rather than silently.
- `modalityClassifier.test.ts` / `buildModalityData.test.ts` — single- and multi-modality splits, the rounding invariant, aggregation, drill-down lists, and behaviour against the real sample export.
- `buildDashboardData.parity.test.ts` — the GPP pipeline compared row by row against the output of the original validated Python reference implementation, committed as a fixture in `tests/fixtures/`. Structural output is compared exactly; every intentional divergence is enumerated in the test itself, so any unintended change fails. Those divergences are a rounding-mode difference, a few substring false positives the reference got wrong, and the inflected forms it missed. Read that file for the current specifics.
- `parseCsv.test.ts` — the failure paths and their plain-language messages.
- `themeContrast.test.ts` — every accent swatch holds adequate contrast in both light and dark mode.
- `analytics.test.ts` — analytics stays off without a key, and no event payload can carry workout content.
- `plateauDetector.test.ts` — the plateau eligibility gates (entry count, InBody-scan count) and their `reason` messages, the improving/plateaued classification, and windowing behaviour against real sample data.
- `alignment.test.ts` — the whole-athlete rollup: its own eligibility gate, the four-way aligned/tension classification table, and null-delta handling when an InBody field is unmeasured.
- `parseInBodyCsv.test.ts` — InBody's own required-columns/empty/malformed-date failure paths.
- `idbStore.test.ts` — the generic IndexedDB primitives: get/set/delete/clear round trips, isolated per test with a `fake-indexeddb` polyfill since jsdom has no native IndexedDB.
- `workoutStorage.test.ts` / `bodyCompStorage.test.ts` / `viewPreferencesStorage.test.ts` — save/load/clear round trips for each persisted dataset, using real parsed rows.
- `App.test.tsx` — the app shell end to end: restoring persisted data (including the selected date range and granularity) on mount, persisting a fresh upload, persisting range/granularity changes across a remount, "Start over" requiring confirmation before it clears storage (and only for real uploaded data — sample mode still resets in one click), and the in-dashboard "Update workout data" control replacing the workout log without disturbing anything else.
- `BodyCompTab.test.tsx` — the empty-state upload dropzone and the ready-state "Replace file" control both forward a newly picked file to the same handler.

`scripts/generate_parity_fixture.py` regenerated the Python reference fixture once, against the proof-of-concept implementation. It is dev-only and never bundled; the committed fixture means the test suite needs no Python.

## Deployment

Static SPA on Vercel. `vercel.json` is already configured — `npm run build`, output in `dist`, with a catch-all rewrite to `index.html`. There is no backend to deploy or operate. If PostHog is wanted in production, set `VITE_PUBLIC_POSTHOG_KEY` (and optionally `VITE_PUBLIC_POSTHOG_HOST`) as build-time environment variables; without them the deployed app simply runs without analytics.
