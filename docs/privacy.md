# Privacy: the details

The short version is in the [README](../README.md#privacy). This is the full account.

Nothing you upload leaves your browser.

Swift has no backend, no database and no accounts. The CSV is read through the
browser's File API, parsed, classified and aggregated entirely in the page you
have open. Nothing you upload is sent anywhere.

- **The local cache.** Uploaded rows (SugarWOD and, if you add it, InBody), your
  weigh-ins and timeline entries, and your selected date range and grouping are
  kept in the browser's IndexedDB so closing the tab doesn't force a re-upload.
  It never leaves your browser. **Replace file** in Settings swaps in a fresh CSV
  for one dataset without touching anything else. **Start over** clears
  everything at once, so it asks you to confirm once real data is loaded (sample
  mode resets in one click, since nothing from the sample is ever stored).
  Clearing your browser's site data does the same, which is why Settings also has
  a file backup.
- **Branding (coaches).** A gym logo, name and brand colour are kept in the
  browser's localStorage on this device only. The logo is re-drawn in the browser
  so only its pixels are kept, with no embedded location or camera data. None of
  it is uploaded, synced, included in a backup or sent to analytics. **Start
  over** does not remove it; **Remove branding** in Settings does.
- **Device sync.** **Send to a device** and **Receive from a device** (Settings;
  the landing page offers **Sync from another device**) connect two browsers
  directly over WebRTC, with a QR code standing in for a signaling server. Nothing
  passes through a server Swift controls. Only connection setup, never your
  workout data, briefly touches a public STUN server, the same as a peer-to-peer
  video call. The workout log, body composition history, weigh-ins and timeline
  entries come across; accent, light or dark mode, grouping and date range stay
  on each device. If the receiving device already has data you confirm once before
  anything is replaced. A sync is all or nothing, and if any part of what arrives
  is unusable nothing is applied. Both devices need the current version.
- **Analytics.** When a PostHog key is configured, Swift sends anonymous
  usage events: page opened, upload attempted, succeeded or failed, sample data
  used, sync attempted, succeeded or failed, tab viewed, a few named interactions
  (a backup downloaded or restored, branding saved), theme, date range and
  grouping changed. The payloads carry only fixed strings and coarse buckets,
  never workout text, filenames, row counts or any identifier. `SwiftEvent` in
  `src/lib/posthog.ts` types the whole surface narrowly, and
  `tests/analytics.test.ts` and `tests/syncAnalytics.test.ts` assert it.
