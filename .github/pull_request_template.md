## What and why

<!-- What this changes, and the reason. -->

## Checks

- [ ] `npm run typecheck`, `npm test` and `npm run build` pass
- [ ] Tests added or updated alongside the change
- [ ] No workout content, filenames or exact counts added to any analytics event (`src/lib/posthog.ts`)
- [ ] Classifier changes: measured against the sample export, and `EXPECTED_DIFF` in `tests/buildDashboardData.parity.test.ts` updated entry by entry with a reason (delete if not applicable)
- [ ] UI copy follows the voice in `CONTRIBUTING.md` (plain, no exclamation points)
