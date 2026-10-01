# Testing

Back to the [README](../README.md).

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
- `bodyCompNoise.test.ts` — the InBody noise band: the paired-scans, rolling-median and default methods, the fallback ladder between them, and the within-noise flags the three insights read.
- `relativeStrength.test.ts` — e1RM series, lift-name variants, body-comp matching (exact, interpolated, nearest, unmatched, never extrapolated), the attribution table, and the eligibility gates.
- `tagTypes.test.ts` — the period types: every type in exactly one kind and one area, a catch-all in each area, and that exactly the types in "something you changed" are the ones judged by a verdict.
- `compareWindows.test.ts`, `contextTags.test.ts`, `insightTags.test.ts`, `chartInteraction.test.tsx`, `CompareTab.test.tsx`, `PeriodsTab.test.tsx` — window comparison (no partial numbers, noise gating, RX/Scaled), period overlap/open-ended/out-of-range, periods leaving results unchanged and only adding notes that name them, drag selection, and the Compare and Periods views (range filled from a saved period, saving a range as a period, the grouped type picker, experiments with their earlier-range start and verdict).
- `cycleReport.test.ts` — cycles from periods, focus lifts, the report built from relative strength and the noise band, insufficient states, and a summary that describes without judging.
- `alignment.test.ts` — the whole-athlete rollup: its own eligibility gate, the four-way aligned/tension classification table, and null-delta handling when an InBody field is unmeasured.
- `parseInBodyCsv.test.ts` — InBody's own required-columns/empty/malformed-date failure paths.
- `idbStore.test.ts` — the generic IndexedDB primitives: get/set/delete/clear round trips, isolated per test with a `fake-indexeddb` polyfill since jsdom has no native IndexedDB.
- `workoutStorage.test.ts` / `bodyCompStorage.test.ts` / `viewPreferencesStorage.test.ts` — save/load/clear round trips for each persisted dataset, using real parsed rows.
- `App.test.tsx` — the app shell end to end: restoring persisted data (including the selected date range and granularity) on mount, persisting a fresh upload, persisting range/granularity changes across a remount, "Start over" requiring confirmation before it clears storage (and only for real uploaded data — sample mode still resets in one click), the Settings sheet's workout "Replace file" control replacing the workout log without disturbing anything else, Insights views stating that the date range doesn't apply to them, and sample mode being announced by exactly one full-width strip above the header.
- `domainDefinitions.test.tsx` — every GPP domain page shows CrossFit's definition of that skill under its heading, separately from the app's own description, and no other view gets a subtitle.
- `sectionNav.test.tsx` — every view lands in exactly one of the four sections, sections open on their first view, and Breakdown shows all ten domains and three modalities at once as two groups, each headed by its label above the tabs.
- `backup.test.ts`, `backupEncryption.test.ts`, `passphrase.test.ts`, `planTransfer.test.ts`, `backupRestore.test.tsx`, `backupPassphrase.test.tsx`, `legacyExperiments.test.ts`, `experimentToTag.test.ts` — the backup file's format and rejections, the plan that applies the workout log last, and download/restore end to end, including encrypted backups (tampering, wrong passphrase, the passphrase prompt and the download form) and (landing-page restore, including a backup dropped or pasted on the upload area, persisting every dataset, older backups and stored lists whose experiments are folded into the tags, confirmation and Cancel from Settings).
- `settingsSheet.test.tsx` — the Settings sheet's five groups, sync enabled on uploaded data and disabled (with the reason) on sample data, accent/mode changes, and sample-mode Start over resetting without a confirmation.
- `BodyCompTab.test.tsx` — the empty-state upload dropzone and the ready-state "Replace file" control both forward a newly picked file to the same handler.
- `validateReceived.test.ts` / `receivedDatasets.test.ts` / `SyncDialog.test.tsx` — what a joiner does with what arrives: every dataset validated before anything is written (the real sample exports accepted, all-or-nothing rejection with a reason naming the row), one confirmation for the whole transfer, all-or-nothing application (one rejected or damaged dataset means nothing is applied, and it is reported instead of silently skipped), and damaged payloads survived.
- `generateSampleTags.test.ts` — the seeded demo periods: anchored to the first logged workout, ordered blocks, valid under the same validation sync and backup restore use.
- `chunking.test.ts` / `pairingCode.test.ts` — cross-device sync's wire framing (chunk/reassemble round trips, corrupted/truncated data) and QR pairing-code encoding (round trips, oversized-SDP trimming, malformed input), both pure logic with no WebRTC involved.
- `fakeSyncTransport.test.ts` / `syncSession.test.ts` — the pairing/transfer state machine driven end to end through a fake in-memory transport standing in for a real `RTCDataChannel`: the full host-to-joiner handshake, multi-dataset transfers, and every failure path (invalid pairing code, a peer disconnecting mid-transfer, an unsupported browser). Real two-device WebRTC/ICE negotiation and camera-based QR scanning aren't covered here — see [Architecture](#architecture) — and are verified manually instead.
- `syncAnalytics.test.ts` — the sync event payloads carry only a role and a closed-vocabulary reason, never a device identifier, session token, or SDP fragment.

`scripts/generate_parity_fixture.py` regenerated the Python reference fixture once, against the proof-of-concept implementation. It is dev-only and never bundled; the committed fixture means the test suite needs no Python.

