# Contributing

Swift is open source under the [MIT license](LICENSE). Forks, bug reports and
pull requests are welcome. This page covers the few rules that are easy to trip
over.

## Setup

```sh
npm install
cp .env.example .env   # leave the PostHog key empty
npm run dev
```

Use **npm**. The lockfile is `package-lock.json`; do not add a yarn or pnpm one.

Before you open a pull request:

```sh
npm run typecheck
npm test
npm run build
```

CI runs the build (which type-checks) and the whole test suite on every branch.

## Rules that are not negotiable

These are what the project promises, so a change that breaks one will not be
merged.

1. **No backend, no accounts, and training data never leaves the browser.** Do
   not add an API layer, an upload, or a request that carries workout data.
2. **Analytics is a closed vocabulary.** `src/lib/posthog.ts` defines every event
   Swift can send. Never add workout content, movement names, notes, filenames or
   exact counts to an event. `tests/analytics.test.ts` fails if a payload leaks
   a workout title, and that failure means the change is wrong, not the test.
3. **TypeScript only.** No `.js` or `.jsx` source, config files included.

## Classifier changes

The classifier is checked against a golden fixture generated from a reference
implementation. Any change to the keyword lists, exclusions or matching logic
moves `tests/buildDashboardData.parity.test.ts`. If you touch them:

- Measure the change against the bundled sample export first.
- Update `EXPECTED_DIFF` in that test entry by entry, with a reason for each.
- Do not loosen an assertion or drop a row to make the suite pass.

Read [How classification works](docs/classification.md) and the header comment
in `src/lib/classify/matcher.ts` before starting. Matching is deliberately plain
substring matching, because SugarWOD glues description lines together without
separators.

## Other conventions

- Tests live in `tests/`, written alongside the code they cover. Build hand-made
  rows with the helpers in `tests/fixtures/rows.ts` rather than a local builder.
- Thresholds for the InBody insights live in `src/lib/analytics/insightConfig.ts`,
  each with a note on how it was chosen. Do not put a bare number in an insight
  module.
- Theme colors are enforced by `tests/themeContrast.test.ts`. A new accent has to
  pass it; do not lower a threshold.
- A new persisted dataset that belongs to the athlete must be added to sync and
  backup in the same change. A new preference must not.
- UI copy is plain and declarative: state what is true, no exclamation points, no
  cheering. Use CrossFit's own vocabulary (RX, Scaled, PR, M/W/G) as it is.

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## Reporting bugs

Open an issue with the browser, what you did and what you expected. **Do not
paste your CSV or any of your training data.** If a bug needs data to reproduce,
describe the shape of the row (which columns, what the text looks like) instead.
Security issues go through [SECURITY.md](SECURITY.md).

## Not affiliated

Swift is an independent project. It is not affiliated with or endorsed by
SugarWOD, InBody or CrossFit.
