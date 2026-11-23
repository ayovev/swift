# PRD: Custom branding (co-branding) for coaches

Status: draft v0.2. All open questions resolved (section 12). Doc updates to land with the build are listed in section 11.

## 1. Context

A coach who reviews an athlete's SugarWOD export in Swift today gets the same product an athlete gets; "coach" is only a copy variant (`src/lib/audience.ts`, `Splash.tsx`, `Landing.tsx`, Settings "Role"). This feature lets a coach set a gym logo, name and brand colour once, and have them appear in the web app. It also provides the brand to a future report/image feature, which is specified separately.

Two facts shape everything:

- **No backend, no accounts, data never leaves the browser** (CLAUDE.md hard constraint 1). So branding is stored on the coach's device only.
- **No report material exists today** (no print stylesheet, PDF, image export or share card). Reports are a separate feature with their own PRD. This PRD only guarantees the brand is ready for them (FR-11).

## 2. Decisions

| Question | Decision |
|---|---|
| How athletes see the brand | They don't, in-app, ever. Coach-only and local (Q6 dropped athlete in-app viewing entirely). |
| Report and image material | A separate feature. This PRD covers the brand and the web app only. |
| Brand scope | Logo, gym name and brand colour. No fonts or layout theming. |
| Dark-mode logos | One upload, with an automatic neutral plate when contrast is poor (Q1). |
| Swift mark | Never removable (Q2). |
| Backup and sync | Brand is excluded from both; re-upload on a new browser (Q3). |
| Athlete audience | No branding for athletes; the section is hidden for them (Q5). |

## 3. Goals and non-goals

Goals
1. A coach sets up their brand in under two minutes and it persists across visits.
2. The brand appears in the app header and the landing header.
3. No change to the privacy promise: no logo, name or colour ever leaves the browser or enters analytics.
4. No regression in accessibility or contrast; brand colour cannot make the UI unreadable.
5. The brand is exposed through one accessor so a future report feature can use it without new storage work.

Non-goals
- Report, PDF, print or image-card generation (separate feature).
- Athletes seeing a coach's brand inside the app, by any route (brand file, sync, hosted link).
- Multi-athlete or roster views, accounts.
- Removing the Swift mark (white-label).
- SVG logos, custom fonts, favicon/PWA icon/`<title>` changes.

## 4. User and scenarios

Persona: the coach (`Audience = "coach"`), loading one athlete's export at a time.

1. Coach opens Settings, adds a logo, types the gym name, picks a brand colour. The header shows their logo beside the Swift wordmark and the accent follows the brand colour.
2. Coach switches athletes (Replace file or Start over); branding is still there.
3. Coach opens the app in a new browser; branding is not there and is added again.
4. Coach removes branding; everything returns to stock Swift.

## 5. Functional requirements

Brand profile = `{ logo (raster, normalised), name (<= 60 chars), color (hex) }`, each optional.

- **FR-1 Setup** lives in a "Branding" section of `SettingsSheet.tsx`. Shown to coaches; for an athlete audience the section is hidden, not deleted (switching role never loses the brand).
- **FR-2 Logo upload** accepts PNG, JPEG, WebP, up to 5 MB on input. **SVG is rejected in v1** (script risk if ever inlined; raster is enough). The file is decoded and **re-encoded through a canvas** to a max 512 px long edge, which strips EXIF (including GPS) and bounds storage to well under 100 KB. Errors are plain sentences (e.g. "That file isn't a PNG, JPEG or WebP image"), per the `plainParseMessage()` voice. Use `FilePickerButton` and the `aria-hidden` file-input pattern.
- **FR-3 Name** is plain text, rendered as text only. It becomes the logo's alt text; with no name, alt is "Gym logo".
- **FR-4 Colour** is a free hex picker. It feeds the existing accent pipeline (`palette.ts`: `deriveRamp`, `clampToGamut`, `ROLE_SHADES`, `pickForeground`) as a custom swatch. If the colour fails any contrast rule in `themeContrast.test.ts` terms (button text, link, focus ring 3:1), it is adjusted programmatically and the adjustment is shown; thresholds are never lowered. It must stay at least 8 OKLab-x100 from `--destructive` (CLAUDE.md open item). A coach can still choose a stock accent; choosing one replaces the brand colour use, and "Use brand colour" restores it.
- **FR-5 Placement.** Dashboard header lockup (`Dashboard.tsx` ~line 266: logo beside `SwiftMark`, max 40 px tall and 160 px wide so the `lg` three-column grid and section nav do not move) and the landing header for returning visitors. Not in the favicon, manifest or `<title>`.
- **FR-6 Dark mode.** One logo is uploaded. At upload, measure luminance of its opaque pixels; in the mode where contrast would be poor, draw it on a neutral plate. No second upload.
- **FR-7 Persistence.** `localStorage` key `swift.brand`, try/catch with an in-memory fallback, same as theme and audience. Reasons: it is a per-device preference, it must be readable before first paint to avoid a colour flash, and it must **survive "Start over"** (which calls `idbClearAll()`), or a coach would re-enter it for every athlete. It is not a `SyncDataset`, so it is never synced or backed up (CLAUDE.md: preferences must not sync). The UI states once: "Branding stays on this device."
- **FR-8 Remove branding** is a single action with its own confirmation. "Start over" copy is unchanged and states it does not remove branding.
- **FR-9 Sample mode** may be branded (it is a preference, not athlete data), so coaches can preview before loading a real file.
- **FR-10 Co-branding rule.** The Swift mark is always present beside the gym logo, and is not removable.
- **FR-11 Single accessor.** One typed read path (a `useBrand()` hook over `src/lib/brand/`) returns the normalised logo as a data URL, the name and the colour. It is the only way components read the brand, so a future report feature needs no new storage or validation. The report feature owns its own layout, content and print behaviour.

## 6. Accessibility and voice

- axe clean on Settings (with Branding), light and dark; keyboard path for every control; no drag-only interaction.
- Brand colour is tested like any swatch (FR-4). Forced-colors behaviour checked for the header lockup.
- Copy follows the voice rules: plain statements, no exclamation points, no "Oops".

## 7. Privacy, security and analytics

- Logo, name and colour never leave the browser. No upload, no remote logo URLs (the CSP already blocks them: `img-src 'self' data: blob:`). **No CSP change is needed** for local logos; `tests/securityHeaders.test.ts` stays as is.
- Analytics stay closed-vocabulary. New `SwiftEvent`s, value-free: `brand_saved` and `brand_removed`. No filenames, names, colours or sizes. `tests/analytics.test.ts` is extended to assert no brand value appears in any payload.
- `docs/privacy.md` gains one paragraph on the stored logo and states it is local-only.

## 8. Success criteria

- A coach completes setup in under two minutes (task-test with 3 to 5 coaches; fits the planned usability study, issue #67).
- Zero network requests carry brand content (manual check in the browser's network panel, plus the unchanged CSP).
- Existing suites stay green: parity, lazySplit, themeContrast, securityHeaders, analytics.

## 9. Phasing

One phase: the brand profile and web app (FR-1 to FR-11). It adds no dependency. Reports and image cards follow as their own feature and PRD, built on FR-11.

## 10. Implementation notes (for the build phase)

Reuse: `FilePickerButton`, `SettingsSheet.tsx` sections, `palette.ts`/`contrast.ts`, the `useTheme()` and `swift.audience` localStorage pattern, `AlertDialog` for removal. New: `src/lib/brand/` (image normalisation, storage, colour derivation as pure functions, luminance check) and `src/components/dashboard/BrandMark.tsx`. Tests: pure-function tests for image sizing, luminance and colour adjustment (jsdom has no canvas, so decoding is verified in Chromium), brand storage fallback, themeContrast over brand colours, analytics payload check, lazySplit unchanged.

## 11. Docs to update with the build

README line 35 (it says "no coach views"; reword to say coach is a framing and one athlete's file is still loaded at a time) and Known limitations; `docs/privacy.md`; `docs/guide.md`; `docs/architecture.md`; CLAUDE.md (a brand section and the rule that "Start over" does not clear branding).

## 12. Open questions: resolved

| # | Question | Resolution |
|---|---|---|
| Q1 | Dark-mode logos | Auto plate, one upload. |
| Q2 | Is "Made with Swift" removable | No, never. |
| Q3 | Brand in backup | No; re-upload. |
| Q4 | Report contents | Out of scope here; the report is a separate feature. |
| Q5 | Athlete-set brand | No; coach-only. |
| Q6 | Athletes seeing brand in-app | Dropped entirely. |
