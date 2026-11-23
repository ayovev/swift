# Testing

Back to the [README](../README.md).

```sh
npm test
```

Vitest, jsdom environment, suites in `tests/`. Coverage is on the logic rather than the UI: there are no end-to-end browser tests, and jsdom has no layout, canvas, WebRTC or camera. What jsdom cannot show is checked by hand in a real browser (see "Checked by hand" below).

## How the suites are organized

This page used to list every suite. It does not any more, because the list was the first thing to go stale. The names and header comments carry that information instead:

- One suite per module or behavior, named after it (`matcher.test.ts`, `weighIns.test.tsx`, `TimelineTab.test.tsx`). Open the file: its header comment says what it pins and why.
- Hand-made rows come from `tests/fixtures/rows.ts`; real exports come from `tests/fixtures/sampleRows.ts`, which loads the bundled sample through the real production parser.
- A deliberate deviation or a known limitation is pinned as a test rather than left implicit, so it changes visibly instead of silently.
- Write the tests alongside the code they cover.

## The suites that are not self-evident

- **`buildDashboardData.parity.test.ts`** compares the GPP pipeline row by row against the output of the original validated Python reference implementation, committed as a fixture in `tests/fixtures/`. Structural output is compared exactly, and every intentional divergence is enumerated in the test itself, so any unintended change fails. Those divergences are a rounding-mode difference, a few substring false positives the reference got wrong, and the inflected forms it missed. Read that file for the current specifics. The suite needs no Python.
- **`analytics.test.ts` and `syncAnalytics.test.ts`** are the privacy guarantee: analytics stays off without a key, and no event payload can carry workout content (the first rebuilds real workout titles from the sample and fails if any appears in a payload). If one fails, the change is wrong, not the test.
- **`themeContrast.test.ts`** holds every accent swatch to the contrast rules in both modes, and the brand color is held to the same rules in `brand.test.ts`. Adding a swatch means the suite must still pass; a threshold is never lowered.
- **`lazySplit.test.ts` and `securityHeaders.test.ts`** keep the bundle split and the CSP honest: a static import that undoes the split, or an inline script whose hash changed, fails them.
- **`docs.test.ts`** checks the Markdown against the code: file paths, links, cited headings and event names must exist.
- **The sync suites** (`chunking`, `pairingCode`, `fakeSyncTransport`, `syncSession`) drive the pairing and transfer state machine through a fake in-memory transport standing in for a real `RTCDataChannel`, covering the full host-to-joiner handshake, multi-dataset transfers and every failure path.

## Checked by hand

- Real two-device WebRTC and ICE negotiation, and camera-based QR scanning, before any change to sync ships.
- Anything that needs layout or a canvas (chart drag gestures, logo re-encoding, the header at phone width), in Chromium.
- Accessibility: axe-core in Chromium over every view and the states that render different markup, in light, dark and forced colors. A real screen reader pass has not been done.

`scripts/generate_parity_fixture.py` regenerated the Python reference fixture once, against the proof-of-concept implementation. It is dev-only and never bundled; the committed fixture means the test suite needs no Python.
