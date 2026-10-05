# Architecture

How Swift is put together. Back to the [README](../README.md).


Data flows through four stages, entirely in the browser: **parse** (`src/lib/csv`) turns your CSV into typed rows and rejects anything malformed with a plain-language error; **classify** (`src/lib/classify`) tags each workout against the ten GPP domains and splits it proportionally across the three CrossFit modalities; **analytics** (`src/lib/analytics`) buckets classified rows by your chosen time granularity and builds everything the charts need; and the **dashboard** (`src/components/dashboard`) renders it. `buildInsights.ts` is the single entry point tying the last three stages together, so classification only ever runs once per upload even though several charts read the result.

**Local persistence** (`src/lib/storage`) sits alongside this pipeline rather than inside it. Your uploaded SugarWOD rows, and separately any InBody body-composition export, are cached in the browser's own IndexedDB the moment they're parsed, so reopening the app restores your dashboard instead of asking you to re-upload. It's a plain key/value cache — one browser-local database, cleared in full by **Start over** (which now asks you to confirm before it does, once there's real data to lose) — with no query engine and no schema beyond "one key per dataset." Sample data is deliberately excluded from it, so demo mode never leaves anything behind.

**A second, independent pipeline** compares your SugarWOD log against your InBody history: `src/lib/analytics/plateauDetector.ts` classifies each lift and named benchmark as improving, plateaued, or not-yet-enough-history by comparing recent performance to InBody scans over the same window; `src/lib/analytics/alignment.ts` rolls those per-lift reads up into one whole-athlete read of whether performance and body composition currently agree. Both are pure functions over the same two already-parsed datasets — no extra parsing, no new persistence — and both require an InBody upload to run at all.

**Cross-device sync** (`src/lib/sync`) is a third, self-contained piece: two browsers negotiate a WebRTC connection directly, with the SDP handshake exchanged via displayed/scanned QR codes instead of a signaling server, then transfer a dataset peer-to-peer once connected. `webrtcTransport.ts` is the only file that touches real WebRTC APIs and `src/components/sync/QrDisplay.tsx`/`QrScanner.tsx` the only ones that touch a QR library or the camera — everything else (wire framing, pairing-code encoding, the pairing/transfer state machine) is plain, WebRTC-free logic, which is what lets it be unit-tested with a fake in-memory transport even though the browser test environment has no real WebRTC or camera support.

## Project structure

```
src/lib/csv/         CSV parsing and validation (PapaParse), with plain-language errors
src/lib/classify/    the two classifiers and the shared text matcher they both use
src/lib/analytics/   turns classified rows into everything the charts and tabs need
src/lib/theme/       the accent-colour system: OKLCH ramp derivation and contrast maths
src/lib/storage/     IndexedDB-backed local persistence for uploaded rows and view preferences
src/lib/sync/        cross-device sync engine: WebRTC transport, QR pairing codes, wire framing,
                     and the all-or-nothing transfer plan shared with backup restore
src/lib/backup/      the backup file: format, serialising and reading it
src/components/      landing page, dashboard, sync UI, charts, theme controls, shadcn/ui primitives
src/types/           the SugarWOD row shape, and the domain/modality data contracts
tests/               vitest suites, plus fixtures including the Python reference output
public/sample/       the bundled sample export that powers demo mode
scripts/             dev-only: regenerates the parity fixture (not part of the build)
```

- **`src/lib/classify`** — `matcher.ts` is the single text-matching engine; `domainKeywords.ts` holds the GPP keyword rules; `movementLexicon.ts` and `classifyModality.ts` hold the M/W/G movement vocabulary and the proportional split.
- **`src/lib/analytics`** — `buildInsights.ts` is the entry point: rows are parsed and classified once, then `buildDashboardData.ts` (GPP domains, lifts, benchmarks, PRs, monthly counts) and `buildModalityData.ts` (M/W/G aggregates) both read the same parsed rows.
- **`src/lib/theme`** — the base UI is black and white in matching light and dark modes; a single user-chosen accent colour is derived into a full 50–950 shade ramp so it holds contrast in both modes.
- **`src/lib/storage`** — one IndexedDB database, one key per uploaded dataset plus one for the selected date range/granularity; wraps the raw API so the rest of the app only ever calls typed save/load/clear functions.
- **`src/lib/sync`** — `chunking.ts` (wire framing), `pairingCode.ts` (SDP ↔ QR-code encoding), `syncSession.ts` (the pairing/transfer state machine), `webrtcTransport.ts` (the real `RTCPeerConnection` implementation, and the only file that touches it), `planTransfer.ts` (the all-or-nothing plan that decides what a received transfer applies; backup restore uses it too).
- **`src/lib/backup`** — `backup.ts` reads and writes the backup file (a versioned envelope around the same datasets sync carries), `encryption.ts` does the optional passphrase encryption with Web Crypto, and `passphrase.ts` holds the passphrase rules. It is pure; the Download and Restore controls live in `src/components/backup/`.
- **`src/components`** — `landing/` for the upload path and explainer, `dashboard/` for the dashboard shell (`SectionNav.tsx` for the four sections and their views, `ScopeLine.tsx` for the date range and grouping, `SettingsSheet.tsx` for files, backup, sync, appearance and Start over) and every view inside it — Overview, the ten per-domain and three per-modality views, the independent Body Comp view, and the Insights views (Progress, Compare, Periods) that compare the SugarWOD and InBody datasets together, all sharing one InBody-upload empty state (`InBodyUploadPrompt.tsx`) — `backup/` for the backup download button and restore hook, `sync/` for the QR-pairing dialog and its host/joiner views, `ui/` for the shadcn/ui primitives the rest builds on.

Stack: Vite, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, PapaParse, dayjs, WebRTC (native browser API). No plain `.js`/`.jsx` source files.
