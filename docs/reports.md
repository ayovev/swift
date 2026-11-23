# PRD: Reports

Status: v0.4. The report shell and all three launch reports are built (see "Build status"). Phase 1 and 2 of the phasing are done; what is left is checks and polish. Requirements below are the target, and "Build status" says which are met.

## Summary

Reports turns what Swift already computes into a document an athlete or coach can save and hand over. We recommend three reports: two that need only a SugarWOD export (**Progress report**, **Training mix report**) and one that needs SugarWOD plus InBody (**Body and training report**). The Progress report can cover the period since a date you choose, such as the last report, and it includes a review of the changes an athlete made when they have Timeline entries.

The first version is built on the browser's print-to-PDF, so no file is uploaded, no backend is added and no dependency is needed. Coaches get their gym's logo, name and color from the existing branding feature; the Swift mark stays on every report.

## Problem and goals

Swift answers an athlete's questions on screen, but nothing leaves the screen in a form that can be handed to a coach, an athlete or a gym owner. Today the only options are a screenshot or the live app. There is no print stylesheet, PDF, image export or share card in the codebase (`docs/branding.md` records this and leaves reports to their own PRD, which this is).

**Goals**

1. A coach or athlete produces a clean, readable report from data already loaded, in under a minute and without leaving the browser.
2. Reports state what the data shows and how sure it is, in the app's voice, so a coach can hand one to an athlete without explaining it.
3. Value without InBody: two of the three launch reports work from a SugarWOD export alone.
4. A coach's brand (logo, name, color) appears on the report through `useBrand()`, with the Swift mark always present.
5. Hard constraints 1 and 2 are unchanged: no training data leaves the browser except as a file the person saves themselves, and analytics stay closed-vocabulary.

**Non-goals**

- Rosters, multi-athlete reports or hosted report links (no backend, no accounts).
- Reports that give advice, targets or programming (the app states what happened; it does not coach).
- New analysis. A report only arranges numbers the dashboard already computes.

## Users and jobs to be done

| User | Job | What they hold |
| --- | --- | --- |
| Athlete, SugarWOD only | Show a coach, training partner or themselves a period of training and where lifts stand | Workout log |
| Athlete, SugarWOD + InBody | Put body composition beside training over the same months | Workout log, scans, manual weigh-ins |
| Coach | Hand an athlete a branded review at the end of a block, or before a check-in | One athlete's export at a time, plus brand |

A coach is a framing, not a separate account: one athlete's file is loaded at a time, and branding lives on the coach's device only. Reports follow the same rule. The athlete audience gets the same reports, unbranded.

## What the data can support

The strongest reports lean on analysis that is already built and tested, and say nothing the data cannot back.

| Source | Fields | What it supports | What it cannot |
| --- | --- | --- | --- |
| SugarWOD | Date, title, description, score, barbell lift, RX or Scaled, PR flag | Consistency, lift and benchmark progression (est. 1RM verdicts), PRs, GPP domain tags, M/W/G split, movements | Intensity, sleep, nutrition, why a number moved. Notes are never read |
| InBody | Weight, skeletal muscle mass, soft lean mass, body fat mass, body fat %, BMI, InBody score | Body weight, lean and fat trends, scan-to-scan change | Anything about performance. Only date and weight are guaranteed on every export tier |
| Weigh-ins | Date, weight in lb, optional note | More frequent weight points, pooled with scans | Lean or fat mass |
| Timeline entries | Kind, area, dates, name, note | Context for a period; a before and after for something the athlete changed | A cause. An entry never changes a number or verdict |

Three existing rules carry straight into reports:

- **Verdicts use the full history as of the end of the report's period** (today unless a custom period ends earlier), not the Training date range, so a report states its basis rather than implying a range.
- **A lift's pounds are always an estimate** ("est. 1RM"), and a record names the logged set it came from.
- **Body composition never feeds a verdict or count.** A report may show it beside training; it never relates the two in a sentence.

## Recommended reports

The order is by value to the person receiving it. Progress is the one report only Swift can produce, because it rests on the verdict engine; the rest arrange views that already exist.

| Report | Needs | For | Contents |
| --- | --- | --- | --- |
| 1. Progress report | SugarWOD | Coach to athlete, athlete to self | Headline (Improving, Steady, Declining) with counts. Each lift and benchmark with its verdict, est. 1RM change, and the logged set a record came from. PRs in the period. Subjects moved up to RX. A subject with too few sessions is listed as such, not judged. **Since a chosen date:** each subject's verdict then and now, PRs and sessions logged since. **Changes you made:** for each Timeline entry the athlete changed, before and after verdicts, with entries that merely happened shown as context |
| 2. Training mix report | SugarWOD | Coach to athlete, athlete to self | Days trained per month, M/W/G split per month, the ten GPP domains on one shared axis (tags, not a share of 100), most-trained movements, workouts with no recognized movement counted once in a footer |
| 3. Body and training report | SugarWOD + InBody | Coach to athlete, athlete to self | Pooled body weight line with its noise band, lean and fat mass from scans, scan dates, and over the same months days trained per month beside them, with the Progress headline as of today. Timeline entries marked on the axis |

**Why these three first**

- **Progress** answers the question both audiences ask most ("am I getting stronger?") using logic that is already thresholded and tested. It is also the most sensitive report, so it ships with its basis and caveats printed on the page.
- **Training mix** is the one a coach uses to talk about programming balance ("this block was 60% G"). It reuses the comparison-strip idea: ten domains as separate bars, three modalities as one stacked bar. They must stay two different forms.
- **Body and training** is the reason to add InBody. Put side by side and never causally linked, it is the view neither source gives alone. Without scans it can still run on weigh-ins, and with neither it is not offered.

**What we considered and left out**

- A single "everything" report. It duplicates the dashboard and answers no one question.
- Anything scored, graded or compared to a norm (body fat targets, percentile lifts). The app does not claim what it cannot validate.
- Workout descriptions and athlete notes. Notes are never read; descriptions bulk the page and add privacy exposure without adding a number.

## Requirements

**Flow**

- **R-1** A "Reports" entry in the dashboard header lists the reports, with those that need unavailable data shown disabled and a plain reason ("Needs an InBody file or weigh-ins").
- **R-2** Choosing a report opens a preview in the app. One period control serves every report, and it offers the app's own presets and nothing else: All time, Last month, Last 3 months, Last 6 months, Last 9 months, Last year, and Custom with a From and a To (the same list as the Training date range and the Progress filter; `tests/presets.test.ts` pins it). A preset ends today; a custom period may end earlier, so a closed block can be reported on after the fact. The period is the report's own: it is not the Training range, and it is not stored. On Progress it frames what changed (R-14); verdicts always use history up to the end of the period.
- **R-3** Each section has an on/off switch. Body composition sections are **off by default** in every report that can include them.
- **R-4** An optional coach note (plain text, up to 500 characters) appears at the **end** of the report, after the data, under a "Coach note" heading. It is never stored, synced or backed up, and never enters analytics. It always starts empty.

**Progress report: period and changes**

- **R-14** A period compares Progress at its end (today, or the chosen To) with Progress as of its start: each subject's verdict then and now ("Steady to Up"), PRs and sessions logged in the period, and subjects that moved up to RX. All time has no start, so it prints Progress as of today and no comparison. A state "as of then" uses only rows on or before its date, run through the same verdict engine with that date as its reference (the engine takes its reference date as an argument and never reads the clock). Checked against the sample export (see "As-of-date findings"). A subject without enough sessions then is shown as "not judged then".
- **R-15** Nothing is stored for the period. It is chosen in the preview each time: no marker, no storage key, nothing synced or backed up. Swift cannot tell whose file is loaded (an export carries no athlete id), so a stored date could attach to the wrong athlete when a coach changes files; this avoids that and works for any number of athletes.
- **R-16** The report prints "Compared since `<date>`" (or "Compared from `<date>` to `<date>`" for a closed period) under the headline, and its own report date in the footer with "Report covers through `<date>`" when the period ended earlier, so a coach can read the dates off the previous PDF and enter them next time.
- **R-17** The default period is All time: Progress as of today, with no comparison. There is no "since the last report" default.
- **R-18** "Changes you made" appears when Timeline entries exist. For each entry the athlete changed, it shows the name, span and the before and after verdicts from the existing entry rules, or the shortfall sentence when fewer than 3 subjects qualify. Entries that happened show as context lines with no verdict. Body weight over an entry's span appears only when the body section is on, with no sentence relating it to a verdict. This section needs no InBody data.

**Output**

- **R-5** v1 output is the browser's print dialog with a print stylesheet (Letter and A4), always on a white page in light mode, one report per print. A report ignores the app's light or dark mode in the preview as well as in print. The person saves a PDF from the dialog. No PDF or canvas library is added.
- **R-6** Every chart has its table twin and text alternative in the preview, as elsewhere in the app. In print, each chart is followed by its summary sentence, so the report reads without the picture.
- **R-7** A verdict never rests on color: the existing glyph and word appear beside every verdict, which also survives black and white printing.
- **R-8** Every report footer carries the as-of date, the data basis ("Workout log through Nov 6. InBody scans through Oct 28") and the Swift mark.

**Brand**

- **R-9** For the coach audience, the report header shows the gym logo, name and brand color through `useBrand()`, with the Swift mark beside them (never removable). The athlete audience prints the Swift mark only.
- **R-10** Brand color is used for rules and headings only. Chart series keep their existing fixed and derived colors.

**Quality**

- **R-11** The reports view is its own lazy chunk (`dashboard/lazyViews.ts`), so the upload screen and the dashboard do not load it until first use. `tests/lazySplit.test.ts` must stay green.
- **R-12** Every figure comes from the existing `Insights` output, with no second `parseRows()` call and no new classification. The parity fixture is untouched.
- **R-13** The preview and print layout pass axe in light, dark and forced colors, at 375px, with the print preview checked in Chromium.

## Constraints

- **Data stays in the browser (hard constraint 1).** The report is built and printed locally. The only way it leaves is a file the person saves and sends themselves. There is no upload, hosted link or email-from-app. A saved report can hold health data (body weight), so the Body sections stay opt-in and the preview says the saved file is theirs to protect.
- **Analytics are closed-vocabulary (hard constraint 2).** Add one usage event for generating a report, `report_generated`, carrying only a fixed report kind (progress, training-mix or body-training) and the audience. No period, section list, row count, note text, brand value or filename. `tests/analytics.test.ts` is extended to assert none of it appears.
- **No new classification.** Reports read `Insights`. Any change to keyword lists or matching moves the parity test and is out of scope here.
- **The Swift mark is never removable** and the coach brand is a local preference. A report does not store or sync the brand, and does not add a `SyncDataset`.
- **Voice.** State what the data shows; no cheering, no advice, no "you should". Sentences name their denominator and their basis.
- **TypeScript only, npm only, no new runtime dependency in v1.** If image cards are added later, canvas export is the preferred route over a library; the CSP (`img-src 'self' data: blob:`) already allows it.
- **Docs are checked against code** (`tests/docs.test.ts`): a document may only name paths and events that exist.

## Print prototype findings

A dev-only prototype (since replaced by the shell in `src/components/reports/`) printed a Progress-style page to Letter PDF in Chromium, in light and dark mode. What it showed:

- **Recharts in print works.** A `ResponsiveContainer` chart sizes to the page width and prints sharp, with animation off.
- **Page numbers work in Chromium** through `@page` margin boxes ("Page 1 of 2"). Other browsers will ignore them, so nothing depends on them.
- **A repeating footer needs a table footer group.** A `position: fixed` footer overlapped content on page 2. A `<tfoot>` repeats on every page, takes up room, and can hold the Swift mark.
- **Rows and cards stay whole** with `break-inside: avoid`, and a heading stays with what follows with `break-after: avoid`.
- **A dark app printed a black page margin** because `color-scheme: dark` is set inline on `html`. The print stylesheet resets it to light.
- **Reports are always light, by decision.** The sheet redefines its tokens (`.report-sheet` shares the `:root` token block in `src/index.css`), takes the light-mode accent roles from `accentCssVars(swatch, "light")`, and the `dark` variant is switched off inside it, so `SwiftMark` and any `dark:` class show their light form. Checked: a dark app prints and previews the same white report as a light one.
- **Not yet checked:** Safari and Firefox, multi-page flow with the Timeline and body sections, and a brand logo in the header.

## Build status

Built (Phase 1, first part):

- **One set of presets.** The report's period control, the Progress "last logged in" filter and the Training date range all use `PRESET_OPTIONS` in `src/lib/analytics/dateRange.ts`; the Progress filter had its own list that lacked Last 9 months and said "All" for "All time". The Timeline's zoom (All, 1 year, 6 months) is the one deliberate exception, because it is a zoom and "Last year" there read as the date range it is not.
- **Navigation and view.** A "Reports" section with one view, the Progress report (`src/components/reports/ReportsTab.tsx`), loaded as its own chunk. The app around the sheet is hidden in print, so only the sheet prints (R-1, R-11).
- **Sheet.** `src/components/reports/ReportSheet.tsx`: always the light page, a coach's logo and name beside the Swift mark, the coach note at the end, and a footer with the basis, the report date and the Swift mark that repeats on every printed page (R-4, R-5, R-8, R-9).
- **Progress report.** Headline, the period's comparison from `src/lib/analytics/insights/sinceDate.ts` (listing only subjects that carry a verdict or a vote on either date) with "Compared since" or "Compared from … to …" printed, every verdict with its change and windows, and a "Not judged" list (R-2, R-3, R-14, R-15, R-16, R-17).
- **Analytics.** `report_generated` with the kind and the audience only (`tests/analytics.test.ts`).

- **Training mix report.** `src/components/reports/TrainingMixTab.tsx` over `src/lib/analytics/trainingMix.ts`: workouts and training days for the period, days trained per month, the M/W/G split per month, the ten domains on one shared axis, the most-used movements, and one line for the entries outside the M/W/G split. It reads `Insights.allRows` (the one parse), filters it to the period once, and runs the Training views' own builders over the result, so a number matches the matching Training view for that range (`tests/trainingMix.test.ts`). The domains stay separate bars that add to more than 100% and the modalities stay one split that adds to 100. Months run from the period's first workout to its end, with a cut first or last month marked "(part)". Charts follow the app's chart-or-table preference, so a table twin is one switch away and prints when chosen, and each chart is followed by its summary sentence (R-6, met here). The controls every report shares (period, coach note, print button) are in `src/components/reports/reportShared.tsx`.
- **Body and training report.** `src/components/reports/BodyTrainingTab.tsx` over `src/lib/analytics/bodyTraining.ts`. Body weight from the pooled scans and weigh-ins on a real date axis (a gap in readings is a gap on the chart, every reading is a dot, nothing is smoothed), with its noise band in words and the first-to-last change by the same rule every other view uses; Timeline entries that touch the period shaded and numbered on the chart, with a numbered list under it; lean and fat mass as two charts on their own scales (scans only); days trained per month (the same block as the Training mix report); and the Progress headline as of the end of the period. It runs on weigh-ins alone, and with neither scans nor weigh-ins the tab says it needs an InBody file or weigh-ins and draws nothing (R-1). The footer names the basis of each source and where the period stops (R-8). The report says in a line that it does not relate body data to Progress, and body readings never change the headline (`tests/bodyTraining.test.ts`).
- **PRs and Changes you made.** "PRs" lists SugarWOD's PR flag as logged, within the period only, so not for All time (a report states no recent window of its own), newest first and capped with "N more not shown". "Changes you made" (R-18) lists the Timeline entries that touch the period: an entry the athlete changed gets the Timeline's own before and after (`insights/entryVerdict.ts`), something that happened gets a context line, and body weight over an entry's span is off by default and offered only with readings. An entry's note is not printed. Both are built from `src/lib/analytics/insights/progressReport.ts` (`tests/progressReport.test.ts`).

Checked in Chromium (R-13): axe over all three reports, in light, dark, charts and tables, with a coach brand and a coach note set, finds nothing. At 375px wide the reports and their controls do not scroll sideways, and the sheet header wraps (the title takes the row and the marks sit under it) rather than breaking a long title one word to a line. In emulated forced colors the controls read, the sheet stays its own light page (it is a paper preview), and the Print button reads as a button because the shared `Button` keeps a border on its filled variants there. Windows High Contrast and a screen reader have not been tried, as everywhere else in the app.

Not built yet:

- **The verdict rows' "logged set"** for a record ("from 225 × 5").
- **A chart in the Progress report** (it has none, so R-6 has nothing to apply to there yet).
- **Print in Safari and Firefox**, checked by hand. Chromium is the one browser measured.
- **The athlete-audience path through a real role split.**

## As-of-date findings

`tests/asOfDate.test.ts` runs Progress at past reference dates across the whole sample export and compares it with Progress over a log that stops on that date, which is what "Progress as of then" must equal (R-14).

- **A real leak, now fixed.** `classifySubjects` found move-ups over the whole history, so a move up to RX dated after the reference date counted as an Up vote at an earlier date (a back squat that moved up in Aug 2023 read as Up in Jan 2023). Move-ups are now found over the sessions up to the reference date. The test fails without that change.
- **Verdicts and votes match.** With the fix, every subject that carries a verdict or a vote, and the headline counts, are identical across the sweep.
- **Subjects with fewer than 6 sessions can differ and are never judged.** A lift named only by its title is folded in once the whole log shows the lift exists, so a past-dated run over the whole log can list a subject that a truncated log would not. Reports state nothing about these subjects, so the test compares only judged rows.
- **Not covered:** Timeline entries' before and after verdicts, which use their own windows (R-18), and a log with a different athlete's data.

## Success, phasing, risks and decisions

**Success.** Analytics can only count uses, so the measures are narrow: the share of sessions with data loaded that generate a report (by kind), whether reports are used by coaches and athletes in similar proportion, and repeat generation within 30 days. Quality is judged qualitatively in the planned usability study (issue #67): can a coach produce a Progress report and an athlete understand it without help?

**Phasing**

1. Report shell (menu, preview, print stylesheet, brand header, footer, coach note, analytics) with the Progress report, including the period, the chosen comparison date and Changes you made. Gate: axe clean and print checked in Chromium.
2. Training mix report, then Body and training report. Gate: body sections off by default and covered by tests.
3. Image cards for a single stat (canvas export). Gate: v1 usage shows demand.

**Risks**

- **Verdicts carry more weight on paper.** The `PV_*` thresholds were validated on one athlete, and a coach may hand the page over as a judgment. Mitigation: print the basis and the "est." wording, never judge a subject with too few sessions, and check them on a second athlete's export before a wider release.
- **The coach supplies a custom period.** A forgotten or mistyped date gives the wrong comparison, and a past-dated verdict is a new code path for the engine. Mitigation: the app's presets, the dates printed on the report, and the engine tested at past dates against the sample export.
- **Body data on a handed-over page.** Weight and body fat can land badly. Mitigation: opt-in, no targets or comparisons, and no sentence tying body change to performance.
- **Print is uneven across browsers.** Chart sizing and page breaks differ. Mitigation: fixed print widths, `break-inside: avoid` on cards, and a Chromium check; Safari and Firefox checked by hand.
- **Saved PDFs are not tagged for screen readers by every browser.** The on-screen preview is the accessible form; this is stated in the report menu.

**Decided**

- v1 output is print-to-PDF. A one-click PDF download is deferred.
- The coach note is in v1, at the end of the report, and always starts empty. A remembered note could land on the next athlete's report.
- Progress supports a period, with a start and an end, and stores nothing. A saved last-report date was dropped: Start over would wipe it, Replace file would carry it to the wrong athlete, and an export has no athlete id.
- Change review is a section of Progress, not its own report.
- Body and training shows one Progress headline as of today beside days trained per month, not a headline per month. A per-month headline would need Progress computed at many past dates.
- v1 is a beta tested with gym members. Checking the Progress thresholds on a second athlete's export is deferred until a wider release.
- A coach-typed athlete label that remembers a date per athlete is deferred, not built.
- On Body and training, choosing the report is the opt-in to print body weight, so weight is on by default; lean and fat mass, which are more sensitive, are a separate section and off by default. This reads R-3 as "a body section a coach has not asked for is off", and can be tightened to weight off by default if you prefer.

**Open questions**

None blocking v1.
