# Swift

Swift turns a SugarWOD training-history CSV export into an interactive dashboard. You drop in the CSV your gym's training log gives you, and Swift reads back what years of workouts actually add up to: how consistently you showed up month over month, how your named lifts progressed, your history on named benchmark workouts, a timeline of logged PRs, how your training emphasis is spread across the ten CrossFit general physical skills (the GPP domains), and the proportional mix of metabolic conditioning, weightlifting and gymnastics work in your log. It is for an individual athlete who already has a SugarWOD export and wants to see the shape of their own training — there are no coach views, no multi-athlete comparisons, and nothing to set up.

## Privacy

Nothing you upload leaves your browser.

Swift has no backend, no database, and no accounts. The CSV is read through the browser's File API, parsed with PapaParse, classified, and aggregated entirely in the page you have open. There is no server to receive it, so there is nothing to delete afterwards — closing the tab is the end of it.

The app does send anonymous product-usage events to PostHog (page opened, upload attempted / succeeded / failed, sample data used, tab viewed, theme changed) when a PostHog key is configured. Those payloads carry only fixed strings and coarse buckets — never workout text, filenames, row counts, or any identifier. `src/lib/posthog.ts` types the entire event surface deliberately narrowly so it stays that way, and `tests/analytics.test.ts` asserts it.

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

## Project structure

```
src/lib/csv/         CSV parsing and validation (PapaParse), with plain-language errors
src/lib/classify/    the two classifiers and the shared text matcher they both use
src/lib/analytics/   turns classified rows into everything the charts and tabs need
src/lib/theme/       the accent-colour system: OKLCH ramp derivation and contrast maths
src/components/      landing page, dashboard, charts, theme controls, shadcn/ui primitives
src/types/           the SugarWOD row shape, and the domain/modality data contracts
tests/               vitest suites, plus fixtures including the Python reference output
public/sample/       the bundled sample export that powers demo mode
scripts/             dev-only: regenerates the parity fixture (not part of the build)
```

- **`src/lib/classify`** — `matcher.ts` is the single text-matching engine; `domainKeywords.ts` holds the GPP keyword rules; `movementLexicon.ts` and `classifyModality.ts` hold the M/W/G movement vocabulary and the proportional split.
- **`src/lib/analytics`** — `buildInsights.ts` is the entry point: rows are parsed and classified once, then `buildDashboardData.ts` (GPP domains, lifts, benchmarks, PRs, monthly counts) and `buildModalityData.ts` (M/W/G aggregates) both read the same parsed rows.
- **`src/lib/theme`** — the base UI is black and white in matching light and dark modes; a single user-chosen accent colour is derived into a full 50–950 shade ramp so it holds contrast in both modes.
- **`src/components`** — `landing/` for the upload path and explainer, `dashboard/` for the Overview tab plus the ten per-domain and three per-modality tabs, `ui/` for the shadcn/ui primitives the rest builds on.

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

`scripts/generate_parity_fixture.py` regenerated the Python reference fixture once, against the proof-of-concept implementation. It is dev-only and never bundled; the committed fixture means the test suite needs no Python.

## Deployment

Static SPA on Vercel. `vercel.json` is already configured — `npm run build`, output in `dist`, with a catch-all rewrite to `index.html`. There is no backend to deploy or operate. If PostHog is wanted in production, set `VITE_PUBLIC_POSTHOG_KEY` (and optionally `VITE_PUBLIC_POSTHOG_HOST`) as build-time environment variables; without them the deployed app simply runs without analytics.
