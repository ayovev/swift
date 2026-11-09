# The Overview page

Acceptance criteria for the redesigned Overview, and the reasons behind them. Back to the [README](../README.md).

**Status: built.** All three steps of the build order are done. Once a part ships, its reasons move into the code
comments and tests next to it, as with everything else in this repo, and this page is trimmed to what stays useful.

## What the page is for

Overview is the front door: it answers **"where do things stand now?"** across training, body and insights, and links
into each section for the detail. It is computed from the athlete's **full history, as of today**, the same way the
Insights views are. Exploring a chosen date range is what the Training section is for.

Why not "what happened in the selected range": the Progress headline can't honestly follow a date range (a verdict
needs at least 6 sessions and a before and after), so a range-driven Overview would either drop Insights or mix two
scopes on one page.

## Scope sentence and controls

1. Overview shows no date range or grouping control.
2. The scope row under the title reads: *"Uses your full history, as of today. Last workout logged ⟨Mon D⟩."*
   - The year is added when the last workout is not in the current year.
   - Why: athletes re-upload exports occasionally, so an old export shows low recent numbers. This sentence explains
     them without a stat of its own.
3. "Stored in this browser only" stays on the right of that row for uploaded data, as on every other view.

## The recent window

4. "Recent" means **the last 90 days, ending today**, compared with **the 90 days before that**.
5. It is one named constant with a comment explaining the choice, next to the other thresholds in `insightConfig.ts`.
   It is never a bare number in a component.
   - Why 90: long enough to absorb a travel week, short enough to show a change.
6. The window is anchored to today, never to the last logged workout, so "last 90 days" always means the same dates
   on a given day.

## Totals row

A ruled row, as today, with four stats in this order. Each has a large figure and one or two muted lines under it.

```
 412 days trained        Back Squat 3RM           183.4 lb                Improving
 31 in the last 90       285 lb · Oct 28          −2.1 lb in 90 days      5 of 8 lifts and
 (24 the 90 before)      9 PRs in the last 90     −9.6 lb since first     benchmarks up
```

### Days trained

7. Large figure: distinct days with at least one logged workout, all time.
8. Under it: *"⟨n⟩ in the last 90 days (⟨m⟩ the 90 before)"*.
   - The parenthetical is left out when the earlier window is entirely before the first logged workout.
9. Why days, not workouts logged: one session often produces several SugarWOD entries (a strength piece and a
   metcon), so days is the more honest consistency number.

### Most recent PR

10. Source: SugarWOD's PR flag (`pr === "PR"`).
    - This is a deliberate exception to "Progress never reads the PR flag". The exception covers this stat only;
      verdicts are unchanged. A PR is a logged fact in the sport's own words, not a verdict, so it does not compete
      with the Progress stat beside it.
    - The code carries a comment saying so.
11. Large figure: the PR's workout title as logged (for example, "Back Squat 3RM").
12. Under it: the score as SugarWOD displays it, and the date (*"285 lb · Oct 28"*).
    - When several PRs share the latest date, show the first in log order and add *"and ⟨n⟩ more that day"*.
13. Second line: *"⟨n⟩ PRs in the last 90 days"*, or *"None in the last 90 days"*.
14. With no PR ever logged, the large figure reads *"No PRs logged"* and there are no lines under it.
15. The stat links to Training → Lifts, where the full PR timeline now lives.

### Body weight

16. Large figure: the latest body weight from the pooled series (InBody scans and manual weigh-ins, `weighIns.ts`),
    in lb.
17. Line one, the 90-day change: from the last reading on or before the start of the window to the latest reading.
    - Left out when there is no reading that old.
18. Line two, the change since the first reading.
19. A change within the noise band (`weightBandLb`) reads *"within normal scan variation"* instead of a signed number.
    This is the same rule the Insights views use.
20. Only weight appears on Overview. Lean mass, fat mass and body fat stay on Body Comp.
    - Why: weight is the one body measurement with a noise band, so it is the only one whose change can be qualified
      rather than read from its direction alone.
21. With no scans or weigh-ins: *"No body data yet"*, linking to Body Comp.
22. With exactly one reading: the reading and its date, with no change lines.

### Progress

23. Large figure: the Progress headline label (Improving, Steady or Declining), computed exactly as Progress computes
    it. There is no separate logic.
24. Under it: the counts behind the label, in the same terms Progress uses (for example, *"5 of 8 lifts and benchmarks
    up"*). The exact copy is pinned by a test when it is built.
25. With no label yet: *"No headline yet"*, and under it what it is waiting for, in Progress's existing wording.
26. The stat links to Insights → Progress.
27. Body weight never feeds this stat, as everywhere else.

## Panels

Each panel is the evidence behind one totals stat: one visual and one link into its section. A panel never repeats
its stat's number. Most recent PR has no panel, because its evidence is the PR timeline on Training → Lifts.

Layout: Training is full width. Insights and Body sit side by side below it from `md` up, and stack in that order on
a phone.

### Training panel

28. **Showing up:** days trained per calendar month, as bars, over **the last 12 months**.
29. The panel header carries a small muted caption: *"Last 12 months, by month"*.
    - This is the one place on the page that doesn't use full history, so it says so where it applies.
30. The current month's bar is drawn with a diagonal hatch (one direction of 45° lines) in the accent, outlined, with a small key under the
    chart ("This month so far") and "so far" in its tooltip, so a partial month doesn't read as a drop. A pattern
    rather than a lighter shade, so it reads as a different kind of bar rather than a smaller amount, without relying
    on colour. One direction of lines was chosen over a diamond cross-hatch (busier, harder to read the bar's top) and a
    fine pinstripe (blurred into a flat tint at phone width and in the 12px key), after comparing them side by side.
31. With under 12 months of history, bars start at the first logged month. No empty months are drawn before it.
32. No 90-day marker on the chart. 90 days rarely falls on a month boundary, so shading whole bars would mark a
    different period from the one the totals count.
33. **What it was made of**, one line under the chart, for the recent window:
    - The M/W/G split for the last 90 days as one stacked bar, beside the 90 days before. The bars use the fixed
      modality colours, as on today's Overview.
    - The three most-trained GPP domains: *"Most trained: Strength, Stamina, Power."*
    - Least-trained domains are **not** shown for now. They can be added later if they prove useful.
34. With nothing classified in the last 90 days, the line reads *"No workouts in the last 90 days"*. With nothing in
    the earlier window, the recent bar shows without a comparison.
35. Link: *"See workouts"* → Training → Workouts.

### Insights panel

36. **What moved:** lifts and benchmarks whose Progress verdict is up or down, including moves up to RX. At most five,
    most recently logged first.
    - Each row shows the name, the verdict and the change, all in Progress's own words.
    - Each row opens that subject's row on Progress.
37. With nothing up or down, one line says no lift or benchmark has changed enough to call, linking to Progress.
38. **Latest Timeline entry:** the ongoing entry that started most recently. With none ongoing, the entry that ended
    most recently. Shown with its name, area and dates (*"Ongoing since Sep 2: Cut, Nutrition"*).
    - With more than one ongoing, add *"and ⟨n⟩ more ongoing"*.
39. With no Timeline entries: *"No timeline entries yet"*, linking to Timeline.
    - Kept as a line rather than hidden, so Overview always shows Timeline exists.
40. Link: *"See progress"* → Insights → Progress.

### Body panel

41. **Weight over time:** the pooled weight series (scans and weigh-ins) as one line, over the athlete's whole body
    history.
42. With no data, the chart is replaced by one line: *"Upload an InBody export or add a weigh-in"*, linking to Body
    Comp.
43. With exactly one reading: that reading and its date, with no line.
44. Link: *"See body composition"* → Body → Body Comp.

## What moves out of Overview

45. **A new Training view, "Lifts"** (page title "Lifts and benchmarks", tab id `lift-history`), placed straight after
    Workouts in the same unlabelled group.
    - It holds three cards moved unchanged, in this order: What got heavier (with its rep-max filter), Benchmarks,
      revisited, and Personal records.
    - It follows the date range, like the rest of Training.
    - The id is not `lifts`: that id belongs to Progress, and reusing it would mix up `tab_viewed` history.
46. **Workouts gets a summary line** at the top: workouts logged, % RX and the scaled count, for the selected range.
    These are the stats that left the totals row.
47. Nothing is deleted. Every card and stat that leaves Overview has a new home.

## Data

48. Overview's numbers come from the full, unfiltered log as of today.
    - `buildInsights()` already parses every row once and only then filters by range. The full-history build for
      Overview comes from that same parsed set, so there is no second `parseRows()` call and no second
      classification path, as the architecture requires.
    - The Training panel's monthly bars derive the month from each row's date, not from `ParsedRow.bucket`. The
      bucket follows the athlete's chosen grouping, and Overview's chart is monthly whatever that is.
49. The reference date is passed in, never read from the clock inside an analytics module, as with the Progress
    engine.

## Voice

50. Stats and panel lines state facts. No praise, no streak language, no exclamation points.
51. Empty states say what is missing in one line and where to fix it. A panel never disappears without saying why.

## Analytics

52. No new events. Following a link from Overview fires the existing `tab_viewed`, and no Overview content (titles,
    scores, weights, entry names) reaches any payload.

## Sample mode

53. Everything works on the sample, including Body: sample mode generates InBody readings and Timeline entries in
    memory (`generateSampleBodyComp`, `generateSampleTimeline`), so every stat and panel has something to show.
    - Weigh-ins added in sample mode appear as usual and are kept in memory only.
54. Sample mode is still announced only by the strip above the header.

## Build order

1. **Moves:** the Lifts view and the Workouts summary line. Overview loses those cards but keeps working. *Done.*
2. **Full-history data, scope sentence and the new totals row.** *Done.*
3. **The three panels.** *Done.*

Each step ships with its tests and updates CLAUDE.md, the guide, the README screenshots' alt text and this page.

## Out of scope for now

- Least-trained domains in the Training panel.
- Lean mass, fat mass and body fat on Overview.
- A link from a Lifts chart to its Progress verdict.
- A third navigation level for Training's 16 tabs.
