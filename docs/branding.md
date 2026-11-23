# PRD: Custom branding (co-branding) for coaches

Status: draft v0.1 for review. Doc updates to land with the build are listed in section 11.

## 1. Context

A coach who reviews an athlete's SugarWOD export in Swift today gets the same product an athlete gets; "coach" is only a copy variant (`src/lib/audience.ts`, `Splash.tsx`, `Landing.tsx`, Settings "Role"). Coaches are the people most likely to hand something back to an athlete, and what they hand back should carry their gym's identity. This feature lets a coach set a gym logo, name and brand colour once, and have them appear in the web app and in reports they generate.

Two facts shape everything:

- **No backend, no accounts, data never leaves the browser** (CLAUDE.md hard constraint 1). So branding is stored on the coach's device, and the athlete only ever sees it inside material the coach sends (a PDF or image), not through the app.
- **No report material exists today.** There is no print stylesheet, PDF, image export or share card; the only download is the backup JSON. "Reports" are therefore new work and are specified here (section 6), not just decorated.

## 2. Decisions already made (with the owner)

| Question | Decision |
|---|---|
| How athletes see the brand | Coach-only, local. Brand lives in the coach's browser; athletes receive it through generated material only. |
| Report material | Both a printable/PDF report and shareable images, phased. |
| Brand scope | Logo, gym name and brand colour. No fonts or layout theming. |

## 3. Goals and non-goals

Goals
1. A coach sets up their brand in under two minutes and it persists across visits.
2. The brand appears in the app header and on every generated report/image.
3. No change to the privacy promise: no logo, name or colour ever leaves the browser or enters analytics.
4. No regression in accessibility or contrast; brand colour cannot make the UI unreadable.

Non-goals (v1)
- Athletes seeing a coach's brand inside the app (needs sync or a server; revisit later).
- Multi-athlete or roster views, accounts, hosted brand links.
- Removing the Swift mark (white-label). Co-branding means both appear.
- SVG logos, custom fonts, favicon/PWA icon/`<title>` changes, email delivery of reports, a report template builder.

## 4. User and scenarios

Persona: the coach (`Audience = "coach"`), loading one athlete's export at a time.

1. Coach opens Settings, adds a logo, types the gym name, picks a brand colour. The header now shows their logo beside the Swift wordmark and the accent follows the brand colour.
2. Coach loads an athlete's CSV, opens the report view, adds an optional athlete label, and saves a PDF with their logo in the header.
3. Coach saves a PR or chart image with the gym logo in a footer and sends it to the athlete.
4. Coach switches athletes (Replace file or Start over); branding is still there.
5. Coach removes branding; everything returns to stock Swift.

## 5. Functional requirements: brand profile and web app

Brand profile = `{ logo (raster, normalised), name (<= 60 chars), color (hex) }`, each optional.

- **FR-1 Setup** lives in a "Branding" section of `SettingsSheet.tsx`. Shown to coaches; for an athlete audience the section is hidden, not deleted (switching role never loses the brand).
- **FR-2 Logo upload** accepts PNG, JPEG, WebP, up to 5 MB on input. **SVG is rejected in v1** (script risk if ever inlined; raster is enough). The file is decoded and **re-encoded through a canvas** to a max 512 px long edge, which strips EXIF (including GPS) and bounds storage to well under 100 KB. Errors are plain sentences (e.g. "That file isn't a PNG, JPEG or WebP image"), per the `plainParseMessage()` voice. Use `FilePickerButton` and the `aria-hidden` file-input pattern.
- **FR-3 Name** is plain text, rendered as text only. It becomes the logo's alt text; with no name, alt is "Gym logo".
- **FR-4 Colour** is a free hex picker. It feeds the existing accent pipeline (`palette.ts`: `deriveRamp`, `clampToGamut`, `ROLE_SHADES`, `pickForeground`) as a custom swatch. If the colour fails any contrast rule in `themeContrast.test.ts` terms (button text, link, focus ring 3:1), it is adjusted programmatically and the adjustment is shown; thresholds are never lowered. It must stay at least 8 OKLab-x100 from `--destructive` (CLAUDE.md open item). The athlete/coach can still choose a stock accent; choosing one replaces the brand colour use, and "Use brand colour" restores it.
- **FR-5 Placement.** Dashboard header lockup (`Dashboard.tsx` ~line 266: logo beside `SwiftMark`, max 40 px tall and 160 px wide so the `lg` three-column grid and section nav do not move) and the landing header for returning visitors. Not in the favicon, manifest or `<title>`.
- **FR-6 Dark mode.** One logo is uploaded. At upload, measure luminance of its opaque pixels; in the mode where contrast would be poor, draw it on a neutral plate. (Open question Q1: optional second dark-mode logo.)
- **FR-7 Persistence.** `localStorage` key `swift.brand`, try/catch with an in-memory fallback, same as theme and audience. Reasons: it is a per-device preference, it must be readable before first paint to avoid a colour flash, and it must **survive "Start over"** (which calls `idbClearAll()`), or a coach would re-enter it for every athlete. It is not a `SyncDataset`, so it is never synced or backed up (CLAUDE.md: preferences must not sync). Consequence to state in the UI once: "Branding stays on this device."
- **FR-8 Remove branding** is a single action with its own confirmation. "Start over" copy is unchanged and states it does not remove branding.
- **FR-9 Sample mode** may be branded (it is a preference, not athlete data), so coaches can preview before loading a real file.
- **FR-10 Co-branding rule.** The Swift mark is always present beside the gym logo, in the app and on reports.

## 6. Functional requirements: reports and images

Report material is new, so v1 defines the minimum useful report.

- **FR-11 Printable report (Phase 2).** A "Report" view (lazy chunk, registered in `lazyViews.ts`, rendered in `<LazyView>`) assembled from existing pure outputs: totals row, consistency, M/W/G mix, Progress verdict rows, PRs, for the full history or the current range. Output is produced with `@media print` styles and `window.print()` (Save as PDF): no new dependency, selectable text, no upload. Header: gym logo, gym name, "Swift" mark, report date, date range. Footer: "Made with Swift".
- **FR-12 Athlete label.** An optional free-text field on the report form. It is **never persisted and never sent anywhere**; it exists only in the printed output.
- **FR-13 Image cards (Phase 3).** PNG export of a chart or PR snapshot with a logo footer, rasterised in the browser (SVG to canvas, no server). Spec detail deferred to its own review once Phase 2 ships.
- **FR-14 Brand on reports** respects the brand colour for accents but keeps verdict colours fixed (`--positive`, `--negative`, rep-max and M/W/G tokens are deliberately independent of the accent).
- **FR-15 Print accessibility.** Headings step by one, charts keep their text alternatives and table twins, logo alt as in FR-3, and the print view is checked in light and with forced colours.

## 7. Privacy, security and analytics

- Logo, name, colour and athlete label never leave the browser. No upload, no remote logo URLs (the CSP already blocks them: `img-src 'self' data: blob:`). **No CSP change is needed** for local logos; `tests/securityHeaders.test.ts` stays as is.
- Analytics stay closed-vocabulary. New `SwiftEvent`s, value-free: `brand_saved`, `brand_removed`, `report_generated`, `image_exported`. No filenames, no names, no colours, no sizes. `tests/analytics.test.ts` is extended to assert no brand value appears in any payload.
- `docs/privacy.md` gains one paragraph on the stored logo and states it is local-only.

## 8. Accessibility and voice

- axe clean on Settings (with Branding) and on the report, light and dark; keyboard path for every control; no drag-only interaction.
- Brand colour is tested like any swatch (FR-4). Forced-colors behaviour checked for the header lockup and the print view.
- Copy follows the voice rules: plain statements, no exclamation points, no "Oops".

## 9. Success criteria

- A coach completes setup in under two minutes (task-test with 3 to 5 coaches; fits the planned usability study, issue #67).
- Report opens and prints within the existing 5-second performance budget on the sample export.
- Zero network requests carry brand or report content (verified in the browser's network panel as a manual check, and by the unchanged CSP).
- Existing suites stay green: parity, lazySplit, themeContrast, securityHeaders, analytics.

## 10. Phasing

1. **Phase 1: brand profile + web app** (FR-1 to FR-10). Small; no new dependency; unlocks the rest.
2. **Phase 2: printable report** (FR-11, 12, 14, 15). The bulk of the work.
3. **Phase 3: image cards** (FR-13).

## 11. Implementation notes (for the build phase)

Reuse: `FilePickerButton`, `SettingsSheet.tsx` sections, `palette.ts`/`contrast.ts`, the `useTheme()` / `swift.audience` localStorage pattern, `download.ts` (`downloadTextFile` pattern for PNG blobs), `ReplaceConfirmDialog`/`AlertDialog` for removal. New: `src/lib/brand/` (normalise image, storage, colour derivation as pure functions), `src/components/dashboard/BrandMark.tsx`, a report view. Tests: pure-function tests for image sizing and colour adjustment (jsdom has no canvas, so decoding is verified in Chromium), brand storage fallback, themeContrast over brand colours, analytics payload check, lazySplit unchanged.

Docs to update with the build: README line 35 (it says "no coach views"; reword to say coach is a framing and one athlete's file is still loaded at a time) and Known limitations; `docs/privacy.md`; `docs/guide.md`; `docs/architecture.md`; CLAUDE.md (new brand section and the "Start over does not clear branding" rule).

## 12. Open questions

- **Q1** Dark-mode logos: auto plate (proposed) or an optional second upload?
- **Q2** Should "Made with Swift" ever be removable (white-label tier)? Proposed: no.
- **Q3** Should the brand travel in backup for coaches changing browsers? Proposed: no (re-upload is cheap and preferences do not back up).
- **Q4** Report contents: is the proposed set (totals, consistency, mix, Progress verdicts, PRs) right, and does a coach want body composition included? Proposed: exclude body data by default, since it is health data going into a document the coach shares.
- **Q5** Does the athlete-facing audience ever need a brand of their own? Proposed: no, coach-only for v1.
- **Q6** Later path for athletes to see co-branding in-app: via a brand file, or via the existing sync channel as a new dataset (which the sync rules would need to allow)?

