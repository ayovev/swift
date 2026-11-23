# Cross-device sync

Developer reference, extracted from CLAUDE.md so that file stays short. CLAUDE.md keeps the rules that apply everywhere and points here for the detail; read this before changing anything in `src/lib/sync/`, `src/components/sync/` or a dataset that travels between devices. Back to the [README](../README.md).

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
