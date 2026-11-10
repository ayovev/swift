# Design critique: Swift

An evaluation of the whole app, weighted towards how it presents training data and how an athlete explores it.
Back to the [README](../README.md).

**Method.** I read `CLAUDE.md`, the README and `docs/`, ran the dev server on the bundled sample, and drove it with
Playwright Chromium at 390×844, 640×450 (equivalent to 200% zoom on a 1280 window), 768×1024, 1280×800/900 and 1920×1080.
I covered light and dark mode and five accents (blue, green, amber, magenta, red), plus reduced motion. I also tested
every grouping, the "Last month" range, uploading the sample as a real file (to see the no-InBody and no-entry states),
a malformed CSV, keyboard tabbing, hovering and tapping. I checked the fixed chart colours with the `dataviz` skill's
palette validator.

Screenshot names below (for example `1280-light-blue-01-Overview-Overview`) refer to captures made during this
session. They are not committed. Each finding names its viewport, mode, accent, grouping and range, so it can be
reproduced from the sample.

Severity: **Critical** misleads the athlete about their own data, **High** blocks or seriously slows a core question,
**Medium** causes friction or occasional misreads, **Low** is polish. Effort: **S** under a day, **M** a few days,
**L** a week or more.

---

## 1. Executive summary

Swift is a mature, unusually principled product. Its analytics are careful: the verdict engine has thresholds,
uses honest wording such as "not tested since" and "within normal variation", and modality shares sum exactly to 100.
The visual layer has not kept up with that care. Several displays state numbers with more certainty or less context
than the engine behind them.

**Data viz verdict: good foundations, honesty gaps, weak exploration.**

- The worst problem is that estimated 1RMs appear as plain pounds. "New best: 258 lb" sits one tab away from "best
  230".
- Two colour couplings break with some accents. Verdicts take the accent colour, so with the red accent Up and Down
  look the same. The fixed M/W/G stack puts red next to green.
- The share charts don't show bucket sizes or partial buckets.
- No chart can be clicked into its workouts, and nothing compares the ten domains.

**Preserve:**

- Overview's stat → evidence → section structure.
- The hatched "so far" month.
- The Progress engine's plain wording and the EvidenceChart's dark/accent/grey window encoding.
- The "matched on" chips.
- Reduced-motion support.
- Small multiples that share one time axis.

**Themes behind the problems:**

1. Display copy drifts from what the engine knows.
2. Colour is asked to carry meaning that the accent system can overwrite.
3. Charts are pictures, not entry points into the data.

---

## 2. Chart and data-display inventory

| # | View | Display | Question it answers | Form and encodings | Interactions | Rating |
|---|---|---|---|---|---|---|
| 1 | Overview | Totals row (4 stats) | Where do things stand? | Stat tiles: mono figure, muted lines | 3 of 4 open their section | **Works**. Clear hierarchy. The days stat alone isn't a link. |
| 2 | Overview | Showing up | Am I consistent? | Bars, accent; current month hatched with a key | Hover tooltip | **Works**. Model use of a partial-period mark. Its accent can collide with the M/W/G colours below. |
| 3 | Overview | Cardio, weightlifting, gymnastics | What was my training made of? | 100% stacked bars, fixed red/green/blue | Hover tooltip, legend | **Needs work**. Red sits next to green (fails CVD), there are no segment gaps, and the unclassified caveat is only in the footer. |
| 4 | Overview | What moved | What changed in my lifts? | List: name, verdict chip, change | Each row opens Progress | **Needs work**. The cap of 5, sorted by recency, hid the only Down. Estimates read as lb. |
| 5 | Overview | Latest Timeline entry | What am I doing now? | One line | Link | **Works** |
| 6 | Overview | Body weight | Where is my weight heading? | Line, raw readings | Hover | **Works**. No unit on the y axis and no noise band shown. |
| 7 | Workouts | Summary line | How much, how RX? | Text | None | **Works** |
| 8 | Workouts | Workout table + `ModalityBar` | What did I do and what was it made of? | Table; 8px M/W/G bar plus "M 33 / W 67 / G 0" | Filter, expand row, Show 50 more | **Needs work**. Red/green bar, and the text wraps to 4 lines on a phone. |
| 9 | Lifts | Rep-max PR table | What is my best at each rep max? | Table, 4 columns | None | **Needs work**. Unreadable on a phone (dates wrap to 3 lines). |
| 10 | Lifts | `LiftGrid` (18 small multiples) | Am I getting stronger at this lift? | Scatter; 5 colours by rep scheme, diamond = PR; shared x | Hover/tap tooltip, rep-max filter | **Rethink**. Five-colour scatter fails validation, no lines join a scheme, no y unit, many charts have 3 to 5 points. |
| 11 | Lifts | Benchmarks, revisited | How did my benchmark times change? | Cards with dated lists, RX/Scaled chips | None | **Works**. A table is the right form for under 10 sessions. |
| 12 | Lifts | Personal records | What were my PRs? | List, 12 rows, then "Show all 146" | Expand | **Works** |
| 13 | Domain ×10 | Headline stat | How much of my training touches this? | Stat + "n of N" | None | **Works** |
| 14 | Domain ×10 | Share of training (`ShareAreaChart`) | Is this rising or falling? | Area with gradient, monotone spline, y auto-scaled per domain | Hover crosshair tooltip | **Rethink**. No n per bucket, partial buckets unmarked, the spline invents curves, the weekly view is noise, and nothing compares across domains. |
| 15 | Domain ×10 | Then versus now (`TrendStat`) | Did it change? | Two figures and a delta chip | None | **Needs work**. "First half" and "most recent half" have no dates. |
| 16 | Domain ×10 | Every workout counted here | Why was this tagged? | Table with "matched on" chips | Filter; collapsed by default | **Works**. Collapsed by default hides the evidence, and rows don't expand like on Workouts. |
| 17 | Modality ×3 | The same three displays as a domain, as average shares | Is my M/W/G drifting? | Same; the line uses an accent step, not the fixed modality colour | Same | **Needs work**. Cardio is red on Overview but navy here, and the tab label "Cardio" duplicates a domain tab. |
| 18 | Movements | Picker, counts, family breakdown | How often do I do this movement? | Native selects, inline counts | Movement and implement selects | **Works** |
| 19 | Movements | Workouts with X, month by month | Is it rising or falling? | `ShareAreaChart`, in % | Hover | **Needs work**. The title says "workouts" but the axis is a share, with the same issues as #14. |
| 20 | Body Comp | InBody card, weigh-in form and list | What readings do I have? | Form + list of 104 rows | Add, delete, Show all | **Needs work**. The list sits above the charts. |
| 21 | Body Comp | Trends: days trained bars + 5 metric lines | How is my body changing? | Small multiples, each auto-scaled | Hover | **Needs work**. "latest 181.0lb" is a monthly mean, while Overview says 180.9 lb, and "730 total" conflicts with Overview's 739. |
| 22 | Progress | Headline card | Am I improving overall? | Label + counts + how it was counted | Collapsible | **Works** |
| 23 | Progress | Verdict rows | Which lifts moved, and how sure is that? | Grouped list, 5 to 7 lines of text per row | Expand, Logged-in filter | **Needs work**. A wall of text, estimates read as lb, and the chart is hidden until a row is expanded. |
| 24 | Progress, Timeline | `EvidenceChart` (custom SVG) | What is this verdict based on? | Dots: previous window dark, recent in accent, others grey; dashed trend; "new best" label | Hover/tap a dot | **Needs work**. The encoding is excellent, but the text scales with the viewBox (20px on desktop, 6px on a phone), the gridlines are dashed and the axis says lb for an estimate. |
| 25 | Timeline | Entry lanes (HTML) | What did I change and when? | Bars: filled = changed, dashed = happened; packed lanes | Click to select, range buttons | **Needs work**. Label sides alternate, labels overflow on a phone, and the area isn't encoded. |
| 26 | Timeline | Verdict lanes | How did each lift move against my entries? | Dumbbell from the previous best's date to the recent best's date; colour = verdict | Click to select | **Rethink**. Line length reads as size of change but is a date span, and the colour comes from the accent (red accent = red Up). |
| 27 | (unused) | `StackedShareChart` | All ten domains' mix over time | Normalised stacked area | — | Orphaned. Nothing in `src/components` imports it, so no view compares the domains. |

---

## 3. Stack-ranked recommendations

### 1. Mark every estimated 1RM as an estimate, everywhere it is shown

- **Severity:** Critical. **Effort:** S. **Area:** Data viz.
- **Where:** Progress rows, Overview "What moved", Timeline Selected panel, `EvidenceChart`.
  - `src/lib/analytics/insights/display.ts`: `verdictText` and the "New best" line.
  - `src/components/dashboard/progress/ProgressRowItem.tsx`.
  - `src/components/dashboard/progress/EvidenceChart.tsx`: y ticks and caption.
  - `src/components/dashboard/overview/OverviewPanels.tsx`.
- **What I observed:** `1280-light-blue-19-Insights-Progress` and `progress-expanded` (1280, light, blue).
  - Back Squat reads "+35 lb (223 to 258 lb) … New best: 258 lb on Oct 6, 2026". The chart axis is labelled
    "260 lb" and the label says "258 · new best +12.1%".
  - Lifts (`1280-light-blue-03-Training-Lifts`) says "Back Squat … best 230", and the PR table's best 1RM is 230.
  - Overview says "most recent PR: Bench Press 5x5, 205 lb · Nov 7". "What moved" on the same page says "Bench Press
    +46 lb (189 to 235 lb)".
  - The 235 is Epley/Brzycki applied to 205 × 5. Only the dot tooltip says "est."; `display.ts` adds " est." to the
    shortfall line but not to the verdict line.
- **Why it matters:** This breaks Tufte's graphical integrity: the representation should match the measurement.
  Nielsen H2 (match the real world) applies too: in CrossFit, "258 lb back squat" means a lift that happened. An
  athlete comparing tabs either distrusts the app or believes a number they never lifted. This hurts every athlete
  who logs anything other than singles, which is the common case.
- **Recommendation:**
  - In any copy about loads, write "est. 1RM" once per row: "Est. 1RM +35 lb (223 to 258 lb), +15.4%".
  - Make the New best line "New best est. 1RM: 258 lb on Oct 6, 2026 (from 225 × 5)", giving the logged set the
    estimate came from.
  - Add an `EvidenceChart` axis title "Est. 1RM (lb)" for loads, and end the caption with "Loads are estimated
    one-rep maxes from any 1 to 8 rep set."
  - On Overview "What moved", use "Est. 1RM +46 lb (189 to 235)".
  - Lifts keeps logged loads as they are.
  - Add a one-line note at the top of Lifts: "Logged loads. Progress compares estimated one-rep maxes."
- **How to verify:** Add a test in `tests/progressDisplay.test.ts` asserting that every load-format verdict string
  contains "est.", and one in `tests/LiftsTab.test.tsx` for the axis title. Then compare Bench on Overview and
  Progress by eye: the 205 and 235 should no longer look contradictory.

### 2. Decouple verdict colour from the accent

- **Severity:** High. **Effort:** M. **Area:** Data viz.
- **Where:**
  - `src/components/dashboard/timeline/TimelineChart.tsx` (verdict lanes, `up: "bg-accent-link"`).
  - Verdict chips in `ProgressRowItem.tsx` and `OverviewPanels.tsx`.
  - The EvidenceChart's recent-window dots.
- **What I observed:**
  - `red-timeline` (1280, light, red accent): every Up dumbbell is red, and Nancy (Scaled) Down is destructive red.
    The two are separated only by a small text label at the far right.
  - `390-dark-green-20-Insights-Timeline` (green accent): Up is green, which reads as "good". With magenta or amber,
    Up reads as neither good nor bad.
  - A verdict's meaning therefore changes with a preference the athlete set for looks.
- **Why it matters:**
  - The dataviz rule says status colour is reserved and never encoded by colour alone (WCAG 1.4.1, Use of Color).
  - Few's dashboard guidance says colour should signal state consistently.
  - It hurts anyone on the red, magenta or amber accents, and anyone with a red–green colour-vision deficiency on
    any accent.
- **Recommendation:** Encode the verdict by shape and text first, and colour second.
  - **Up:** accent, with a filled end-dot and an "↑" glyph in the chip ("↑ Up").
  - **Down:** a hollow end-dot, `--foreground` line, and "↓ Down" in the destructive-red chip.
  - **No clear change:** muted grey with "–".
  - **Moved up to RX:** a diamond end-marker.
  - In the Timeline lanes, keep the label "Up +15.4%" but move it next to the end-dot (see #9).
  - Add a check to `tests/themeContrast.test.ts`: when an accent's hue is within about 30° of `--destructive`,
    Down must not use `--destructive` for its mark alone.
  - Desktop and touch behave the same, since this is a static encoding.
- **How to verify:** Screenshot the Timeline with each of the 8 accents in a grid and confirm Up and Down can be told
  apart in a greyscale copy. Add a test that every verdict chip renders its glyph.

### 3. Reorder the M/W/G stack so red and green never touch, and add surface gaps

- **Severity:** High. **Effort:** S. **Area:** Data viz.
- **Where:**
  - `src/components/dashboard/overview/OverviewPanels.tsx` (monthly mix).
  - `src/components/dashboard/charts/ModalityBar.tsx`.
  - `MODALITY_LIST` order for rendering in `chartUtils.ts`.
  - The legend order.
- **What I observed:**
  - `1280-light-blue-01-Overview-Overview`: Cardio (red) at the bottom, Weightlifting (green) on top of it, Gymnastics
    (blue) above.
  - Validator, light mode, in this order: CVD separation **FAIL**, red↔green deutan ΔE **3.7**.
  - Dark mode: the same pair, deutan ΔE 3.7.
  - The rep-max palette fails too (orange↔red normal-vision ΔE 11.7).
  - Stacked segments have no 2px gap, and the bars are large, saturated blocks.
  - With the green accent (`390-dark-green-01`) the Showing up bars directly above are the same green as
    Weightlifting. With red or magenta, they match Cardio (`red-overview`).
- **Why it matters:**
  - Adjacency is what the eye compares in a stack, and 3.7 is below even the 6–8 floor that secondary encoding
    permits.
  - Gestalt similarity: one card using one colour for two meanings tells the reader they are the same series.
  - About 1 in 12 men can't separate the Overview's most-viewed composition chart.
- **Recommendation:** The colours are fixed by constraint, so change their order and spacing instead.
  - Stack W at the bottom (the largest share, read off the baseline), G in the middle, M on top.
  - The validator **passes** that order in light mode (worst adjacent ΔE 27.2) and passes CVD in dark mode.
  - List the legend top to bottom in stack order, and keep the letters M/W/G in the labels.
  - Add a 2px `--card` gap between segments (Recharts `stroke="var(--card)" strokeWidth={2}`), and the same in
    `ModalityBar` (it already fakes it with an inset shadow).
  - Draw Showing up's bars in `--foreground` at about 0.85 opacity, keeping the hatched current month in the accent.
    The accent then marks only the one thing worth noticing (emphasis), and it can no longer collide with a fixed
    modality colour. This also fits the "black and white plus one accent" idea better than accent-filled bars.
- **How to verify:**
  - Run `validate_palette.js "#279936,#0072d5,#e7000f" --mode light`: it passes.
  - Add a unit test pinning the render order.
  - Check a visual grid of the Overview across all 8 accents.

### 4. Make every time chart a way into its workouts (drill-down)

- **Severity:** High. **Effort:** M. **Area:** Data interaction.
- **Where:**
  - `ShareAreaChart.tsx` (domain, modality, Movements).
  - The `OverviewPanels.tsx` bars.
  - The `LiftChart.tsx` dots.
  - `WorkoutList.tsx` (to accept a bucket filter).
  - `Dashboard.tsx` (navigate with a range).
- **What I observed:** On Strength (`strength-hover`, 1280, monthly), hovering Oct '24 shows "60.0%", and clicking
  does nothing. The workouts behind that point sit in a collapsed list below ("Show all 1,032 workouts") with no
  month filter. Overview's bars and the lift dots have no click action either.
- **Why it matters:** Shneiderman's mantra (overview, zoom and filter, details on demand) breaks at the last step. The
  athlete's natural next question, "what was that dip?", needs a manual range change and a scroll.
- **Recommendation:**
  - **Desktop:** clicking a bucket (or using Enter on a keyboard-focused point) filters the list on the same page to
    that bucket. The list auto-expands and shows a chip above it: "Oct '24 · 15 workouts · Clear".
    - On Overview, clicking a month opens Training → Workouts with the custom range set to that month.
    - On Lifts, clicking a dot opens the Workouts list filtered to that day, with the row expanded.
  - **Touch:** the first tap shows the tooltip with a "See 15 workouts" button inside it, and tapping that button
    applies the filter. A tap elsewhere dismisses it.
  - **Analytics:** one new value-free event, `chart_bucket_opened` with `{ view: TabId }` only. No bucket, date or
    count.
- **How to verify:** Add a component test that clicking a bucket filters `WorkoutList` to rows in that bucket. In a
  usability test, the task "what did you do in your lowest Strength month?" should take under 3 clicks.

### 5. Show bucket sizes and partial buckets on every share-over-time chart, and stop smoothing

- **Severity:** High. **Effort:** M. **Area:** Data viz.
- **Where:**
  - `src/components/dashboard/charts/ShareAreaChart.tsx`.
  - `src/lib/analytics/granularity.ts`.
  - `buildDashboardData.ts` / `buildModalityData.ts`, to pass `n` per bucket (the data is already grouped).
- **What I observed** (`groupings`, Strength, 1280):
  - **Weekly:** a 0–100% sawtooth across 200 weeks.
  - **Yearly:** 2022 (about 6 weeks of data) and 2026 (to Nov 10) drawn as full years on a smooth curve.
  - **Last month by month:** a two-point "trend" between two partial months.
  - **All time by month:** the final, 10-day Nov '26 point spikes Strength to 100% and Cardio to 27%, with no "so far"
    mark. Overview hatches exactly this case.
  - **Tooltips:** "Oct '24 60.0%", with no denominator.
  - `type="monotone"` draws curves between months that never happened.
- **Why it matters:**
  - Honesty: a percentage of 2 workouts and a percentage of 30 look the same.
  - The partial-period convention is applied on one chart and not the next (H4, consistency).
  - Spline smoothing breaks the data-ink link (Tufte).
- **Recommendation:**
  - Tooltip: "Oct '24 · 60% · 9 of 15 workouts" (modalities: "average of 15 classified workouts").
  - Draw a partial first or last bucket with a dashed final segment and a hollow end-dot, plus the same "so far"
    tooltip text Overview uses.
  - Draw buckets with fewer than 5 workouts as small hollow dots, not joined into the area.
  - Use `type="linear"`.
  - When a range and grouping produce fewer than 3 buckets, swap the chart for the stat plus "Too few groups to chart
    a trend: try grouping by week".
  - In the grouping menu, mark Weekly over ranges longer than 12 months "noisy over this range", the way Daily is
    already disabled (`grouping-menu-daily-disabled`).
- **How to verify:** Unit-test `n` on each bucket and the partial flag. In visual checks, Strength at weekly / all time
  shows hollow dots in thin weeks, and yearly shows 2022 and 2026 dashed.

### 6. Add a way to compare the ten domains (and the three modalities) side by side

- **Severity:** High. **Effort:** M. **Area:** Data viz.
- **Where:**
  - A new compact strip at the top of `DomainTab.tsx` (and the equivalent in `ModalityTab.tsx`), reading
    `DashboardData.overall` and `trend_direction`.
  - Delete or reuse the orphaned `StackedShareChart.tsx`.
- **What I observed:**
  - Ten tabs that each draw one auto-scaled area. Strength's axis runs 0–100%; Metabolic Conditioning's runs 0–30%.
  - There is no screen where the athlete sees all ten at once, which is the question "is my training balanced?".
  - `StackedShareChart` (the ten-domain mix) is imported nowhere.
- **Why it matters:**
  - Tufte's small multiples and Cleveland–McGill both favour a common baseline: position on a shared scale is the most
    accurate comparison people make.
  - Answering balance today means remembering ten numbers across ten tabs, which works against recognition over
    recall (H6).
- **Recommendation:** At the top of each domain tab, show a "Domains" strip: ten horizontal bars, one per domain, on
  one shared 0–100% axis.
  - Each bar is that domain's share of workouts tagged, for the selected range.
  - The current tab's bar is in the accent and the others are grey (emphasis).
  - A small then→now tick pair on each bar shows the drift.
  - Bar labels are the tab labels, and each bar is a button to its tab.
  - Caption, stating the 300% fact once: "Share of workouts tagged with each domain. A workout counts in every domain
    it touches, so these don't add up to 100%."
  - The modality tabs get the same strip with 3 bars, using the stacked-bar form, captioned "Adds to 100%".
  - The two forms (separate bars versus one stacked bar) make the difference visible at a glance.
  - The row of tabs stays a visible row, so this respects the "never a dropdown" rule.
  - Touch: the bars are 44px-tall tap targets.
- **How to verify:** Add a test that the strip renders 10 bars with a shared domain and that the active one has
  `aria-current`. Task test: "Which domain do you train least?" answered in under 10 seconds.

### 7. Rebuild the lift small multiples: emphasis, a validated palette, joined schemes and units

- **Severity:** High. **Effort:** M. **Area:** Data viz.
- **Where:** `src/components/dashboard/charts/LiftChart.tsx`, `LiftHistoryTab.tsx`.
- **What I observed** (`crop-lifts-grid`, 1280, light, all rep schemes):
  - Five colours plus a diamond in a scatter.
  - The rep-max palette fails the validator: 2RM orange against 1RM red is normal-vision ΔE 11.7, below the hard floor
    of 15, and 3RM green against 2RM orange is protan ΔE 5.8.
  - The component's own comment says "points are connected only within the same scheme", but no line is drawn.
  - The y axis has no unit.
  - Eighteen charts are shown, including Split Jerk and Hang Squat Clean with 3 to 5 points. They get the same
    prominence as Back Squat with about 40.
  - On a phone (`phone-liftchart-tap`), the -35° tick labels take a quarter of the chart height.
- **Why it matters:**
  - The dataviz series ladder caps all-pairs forms such as scatter at three colours.
  - Without joining lines, the progression within a scheme is left for the reader to work out.
- **Recommendation:**
  - Keep the fixed colours, but change the default from "All" to **emphasis**. The scheme with the most sessions for
    that lift is drawn in its colour and joined with a 1.5px line; every other point is `--muted-foreground` at 40%.
  - The filter buttons move the emphasis instead of hiding points. The selected scheme's colour is the only hue, so
    nothing depends on telling hues apart.
  - Add a direct label at the last point ("5RM 205") instead of relying on the legend.
  - Add a `lb` unit to the top y tick.
  - Show lifts with at least 6 sessions as charts; fold the rest into a one-line list ("Also logged: Split Jerk (5),
    …"), each opening the Workouts list filtered to it.
  - Use unrotated ticks (see "Cross-cutting patterns").
  - Touch: a tap shows the tooltip (this already works). Enlarge the hit area to 24px via a transparent `ZAxis` range
    or a nearest-point layer.
- **How to verify:** Rerun the validator on the emphasis case; a single hue against grey passes trivially. Count the
  charts shown on the sample (it should drop from 18 to about 10). Visual check at 390px.

### 8. Give Progress rows a glanceable visual and fix the EvidenceChart's scaling text

- **Severity:** High. **Effort:** M. **Area:** Data viz.
- **Where:** `src/components/dashboard/progress/ProgressRowItem.tsx`, `EvidenceChart.tsx`.
- **What I observed:**
  - Each Up row is 5 to 7 lines of muted text, such as "Body weight fell 7 lb while the lift rose: relative to body
    weight, +19.8%". Ten of them make a 2,700px page (`1280-light-blue-19`).
  - The evidence appears only after expanding a row.
  - The chart's SVG uses a fixed `viewBox` with `h-auto w-full`, so its 10-unit labels render at about 20px on a
    1,200px card (`crop-prog-exp`) and about **6px** on a phone (measured: 6px text height; `phone-evidence`).
  - The y gridlines are dashed (`strokeDasharray="2 3"`), which the dataviz anti-patterns list rules out.
- **Why it matters:**
  - Scanning (Krug): the verdict is in the first line and then buried.
  - The text in the evidence chart fails WCAG 1.4.4 (Resize Text) on a phone in practice.
- **Recommendation:**
  - Collapse each row to two lines: name, chip, change ("Est. 1RM +35 lb, +15.4%") and the windows' dates.
  - Add a 120×24 inline sparkline on the right: the same dots, with the previous window dark and the recent window in
    the accent, and no axes.
  - Move the New best, Scaled and body-weight lines into the expanded area above the chart.
  - In `EvidenceChart`, measure the width with a `ResizeObserver` and set `viewBox` to the real pixel width, so the
    text stays at 11px like every Recharts axis.
  - Make the gridlines solid hairlines.
  - Keep the dark / accent / grey window encoding exactly; it is the best chart in the app.
- **How to verify:** Assert that the font size computed from `getBoundingClientRect` is between 10 and 12px at 390
  and at 1280. The Progress page height at 1280 should drop by about half.

### 9. Redraw the Timeline verdict lanes so length doesn't imply size of change

- **Severity:** Medium. **Effort:** M. **Area:** Data viz.
- **Where:** `src/components/dashboard/timeline/TimelineChart.tsx`.
- **What I observed:**
  - Each verdict is a dumbbell from the date of the previous best to the date of the recent best
    (`1280-light-blue-20-Insights-Timeline`).
  - Power Snatch (+16.8%) has the longest line on the page, while Bench Press (+24.2%) and Deadlift (+4.4%) are
    short.
  - Long horizontal bars are read as "more" (Cleveland–McGill: length is a strong magnitude cue), so the lanes read as
    a ranking they aren't.
- **Why it matters:**
  - The mark's strongest channel encodes the least important variable, the date gap between two sessions.
  - It risks implying a relationship between the length of an entry and the size of a change, which the Timeline
    promises never to claim.
- **Recommendation:**
  - Draw each subject's two **windows** as thin bands: the previous N sessions' date span in `--foreground` at 30%,
    the recent N in the verdict encoding from #2.
  - Put the best of each window as a dot inside its band.
  - Write the verdict text next to the recent dot, not at the far right.
  - Length now means "how long the window lasted", matching the EvidenceChart's colours, and entries above can be
    read against the windows.
- **How to verify:** Check that the Selected panel and the lane show the same dates. Task test: "Which lift improved
  most?" should be answered from the labels, not the line length.

### 10. Give Monostructural one name, and stop two tabs both saying "Cardio"

- **Severity:** Medium. **Effort:** S. **Area:** Other (affects reading the M/W/G charts).
- **Where:** `src/types/modality.ts` (`MODALITY_SHORT_LABELS`, `MODALITY_NAMES`), `tabs.ts`, legends.
- **What I observed:**
  - Training's tab row reads "Domains: Cardio … Modalities: Cardio" (`crop-workouts-top`, 1280).
  - The modality's page title is "Metabolic Conditioning", its blurb says "Monostructural cardio", the legends say
    "Cardio" and the bars say "M".
- **Why it matters:** One concept with four names and two concepts with one name breaks H4 (consistency) and IA
  labelling rules (one label per concept). It blurs exactly the tags-versus-split difference the athlete needs to see.
- **Recommendation:**
  - Use CrossFit's own term for M, verbatim, everywhere: tab, legend, page title, tooltip. "Monostructural" is the
    precise one; the docs use "Metabolic conditioning", so the owner should choose.
  - Keep the domain tab "Cardio" as the short form of the domain name.
  - Legend items become "M · Monostructural", "W · Weightlifting", "G · Gymnastics", so the letter and the word teach
    each other.
- **How to verify:** Add a test that no two `ALL_TABS` labels are equal.

### 11. Make the Training tab row's overflow visible and keep the active tab in view

- **Severity:** Medium. **Effort:** S. **Area:** Other (navigation to the data).
- **Where:** `src/components/dashboard/SectionNav.tsx` (`SubNav`).
- **What I observed:**
  - The row overflows even at **1280**: on Movements, "Workouts" has scrolled off the left (`1280-light-blue-17`).
  - At 768 it is cut at "Ag" with Modalities and Movements hidden (`768-light-amber-06`).
  - At 390, "MODALITIES" shows as "DALITIES" (`390-dark-green-17`).
  - There is no fade, chevron or scroll hint.
- **Why it matters:** Hidden navigation fails recognition over recall (H6) and creates a false floor. The athlete
  doesn't know Movements exists.
- **Recommendation:**
  - Add a 24px gradient fade on whichever edge has more content, plus 32px chevron buttons on pointer devices that
    scroll by one group.
  - Call `scrollIntoView({ inline: "nearest" })` on the active tab when it mounts.
  - From `lg` up, tighten `gap-10` to `gap-6` between groups and `gap-5` to `gap-4` within them. Measured at 1280, the
    row is 1293px in a 1216px container today and exactly 1216px with these gaps: it fits, but with no spare room, so
    keep the fades for longer labels.
  - Touch: native scroll, with fades only.
- **How to verify:** At 1280, all 16 tabs are visible with no scroll. At 390 and 768, the fade appears when the row
  can scroll, and the active tab is visible on load.

### 12. Make Body Comp's numbers agree with Overview's, and put the trends first

- **Severity:** Medium. **Effort:** S. **Area:** Data viz.
- **Where:** `src/components/dashboard/BodyCompTab.tsx`, `charts/BodyCompLineChart.tsx`.
- **What I observed** (`1280-light-blue-18-Body-Body`):
  - "Weight … latest 181.0lb" is the November monthly mean; Overview says 180.9 lb, the latest reading.
  - "Days trained … 730 total" counts the scan-history range; Overview says 739.
  - Units are written "181.0lb" here and "180.9 lb" elsewhere. The InBody card says "most recent in 2026-11".
  - The 104-row reading list comes before the Trends.
- **Why it matters:** Near-identical numbers that disagree undermine trust in every number on the page (H4). Putting
  the list first inverts overview-first.
- **Recommendation:**
  - Label the figure by what it is: "Nov average 181.0 lb" (or show the latest reading).
  - Caption days trained "730 days during your scan history".
  - Format through one helper (see "Cross-cutting patterns") as "181.0 lb", and write "most recent Nov 10, 2026".
  - Order the page Trends, then Weigh-ins, then the InBody card.
- **How to verify:** Add a test that the Weight header's value equals `bodyWeightStat().latestLb` or carries the word
  "average".

### 13. Overview "What moved": never let the cap hide a Down

- **Severity:** Medium. **Effort:** S. **Area:** Data viz.
- **Where:** `src/lib/analytics/overview.ts` (`whatMoved`, `OVERVIEW_MOVED_MAX`).
- **What I observed:** The headline beside it says "1 down", but the five rows are all Up
  (`1280-light-blue-01-Overview-Overview`). Nancy (Scaled), the only Down, fell below the cap of 5 because the rows are
  sorted by recency.
- **Why it matters:** Selective reporting: the evidence panel contradicts the stat it supports.
- **Recommendation:** Reserve slots so every Down appears (up to 2), then fill with the most recent Ups. If Downs are
  cut, add "and 1 more down" linking to Progress.
- **How to verify:** Add a unit test with 10 Up and 1 old Down asserting the Down is listed.

### 14. Give every chart a table view and a real text alternative

- **Severity:** Medium. **Effort:** M. **Area:** Data viz (accessibility).
- **Where:** `src/components/ui/chart.tsx` (`ChartContainer`), plus a new shared `ChartFrame` (see "Cross-cutting
  patterns").
- **What I observed:**
  - Tabbing reaches each Recharts `<svg>`, and what is exposed is the run-on tick text "DecJanFebMar…0510" (keyboard
    trace, Overview).
  - The `aria-label` gives the chart type and range but no values or takeaway.
  - There is no table fallback anywhere.
  - The hand-built EvidenceChart and Timeline dots respond to mouse and tap but aren't reachable by keyboard.
- **Why it matters:** WCAG 1.1.1 (Non-text Content), 1.3.1 (Info and Relationships), 2.1.1 (Keyboard). The dataviz
  rule: "tooltips enhance, never gate", and every chart has a table twin.
- **Recommendation:**
  - Add a small "Table" toggle to each chart card's header. It swaps the plot for a `<table>` of the same rows (bucket,
    value, n), keeps the same height and is remembered per device in `localStorage`.
  - Mark tick text `aria-hidden`.
  - Put the takeaway in `aria-label`: "Strength share by month, Nov 2022 to Nov 2026. Range 55% to 100%, latest 79%."
  - Make EvidenceChart dots focusable via a roving `tabindex` (arrow keys move, and focus shows the same tooltip as
    hover).
- **How to verify:** Run axe on each view, a VoiceOver pass on Overview and Strength, and a keyboard-only task: "find
  your best Back Squat session".

### 15. Turn off the entry animation on the remaining charts

- **Severity:** Low. **Effort:** S. **Area:** Data viz (performance).
- **Where:** `ShareAreaChart.tsx`, `LiftChart.tsx`.
- **What I observed:**
  - `anim-strip`, Strength, 1280: the area wipes in from the left over about 1.2s on every tab, grouping or range
    change.
  - At 700ms the screenshot showed the line ending in Jan '26, which looks like missing data.
  - Overview and Body Comp already set `isAnimationActive={false}`. Reduced motion is respected, which is good.
- **Why it matters:** Animation that delays reading rather than explaining a change (Doherty threshold), and the same
  kind of chart behaves differently on different views.
- **Recommendation:** Set `isAnimationActive={false}` on `Area`, `Bar` and `Scatter` everywhere, through the shared
  frame. If motion is wanted, use a 150ms opacity fade only.
- **How to verify:** Screenshot 100ms after a tab switch: the chart is complete.

### 16. Fix phone layouts of the dense tables

- **Severity:** Medium. **Effort:** S. **Area:** Data viz.
- **Where:** `charts/RepMaxPrTable.tsx`, `WorkoutList.tsx` / `WorkoutsTab.tsx`.
- **What I observed** (`390-dark-green-03` and `-02`):
  - In the PR table, each date wraps over three lines ("Jul / 5, / 2023").
  - In Workouts, "M 33 / W 67 / G 0" wraps over four lines in a 50px column, so each row is about 110px tall.
- **Why it matters:** WCAG 1.4.10 (Reflow) is technically met, but scanning collapses. Few's guidance is to keep a
  table's comparisons on one line.
- **Recommendation:**
  - Below `sm`, show the PR table as one card per lift with four "1RM 230 · Jul '23" lines, using short `MMM 'YY`
    dates.
  - In Workouts, hide the numeric split text below `sm` (it stays in the bar's `aria-label` and the expanded row), and
    widen the bar column to 30%.
- **How to verify:** At 390px, a Workouts row is 72px or less and every PR date sits on one line.

### 17. Phone: Timeline labels and the Progress "Logged in" control overflow

- **Severity:** Medium. **Effort:** S. **Area:** Data viz.
- **Where:** `timeline/TimelineChart.tsx`, `progress/PeriodFilter.tsx`.
- **What I observed** (`390-dark-green-20`, `-19`):
  - The label "Switched to a protein-forward diet" overflows the left edge of the entries box.
  - The first axis label "Mar 2023" is clipped.
  - The "Logged in" segmented control is cut at "L(ast year)".
- **Why it matters:** Text that is cut off fails WCAG 1.4.10 (Reflow) in spirit, and choices the athlete can't see
  don't exist for them.
- **Recommendation:**
  - In the lane layout, clamp label placement to the container (place the label inside the bar when it doesn't fit on
    either side; truncate with an ellipsis and keep the full name in the Selected panel).
  - Make the filter scroll with a fade, or wrap to two rows below `sm`.
- **How to verify:** Assert in a 390px test that no element is wider than its container.

### 18. Use one time-filter vocabulary on the Insights views

- **Severity:** Medium. **Effort:** S. **Area:** Data interaction.
- **Where:** `progress/PeriodFilter.tsx`, `timeline/TimelineView.tsx`, `ScopeLine.tsx`.
- **What I observed:**
  - The Progress page says "the date range doesn't apply here", then directly below shows "Logged in: All / Last month
    / Last 3 months / Last 6 months / Last year / Custom", which looks like a date range.
  - Timeline has a third set, "All / Last year / Last 6 months", which zooms the axis.
- **Why it matters:** Three controls that look the same and do different things (filter by session date, zoom the
  axis, scope the data) break H4 and Jakob's law.
- **Recommendation:**
  - Label each by what it does. Progress: "Show lifts logged in: …". Timeline: "Zoom: All · 1 year · 6 months".
  - Change the scope sentence to "Verdicts use your full history, as of today."
- **How to verify:** First-click test: "Show me only the last 6 months of Timeline." Participants shouldn't reach for
  the Training scope line.

### 19. Put dates on "Then versus now"

- **Severity:** Medium. **Effort:** S. **Area:** Data viz.
- **Where:** `TrendStat.tsx`.
- **What I observed:** "85.6% first half / 79.4% most recent half", with no dates (`1280-light-blue-06`).
- **Why it matters:** Time windows should be stated next to the number (honesty and context).
- **Recommendation:** "Nov 2022 to Nov 2024: 85.6%", "Nov 2024 to Nov 2026: 79.4%". Below 4 buckets in total, replace
  the comparison with "Too short a range to compare halves."
- **How to verify:** Unit test of the label text.

### 20. Show the evidence lists open, and make their rows expand like on Workouts

- **Severity:** Low. **Effort:** S. **Area:** Data interaction.
- **Where:** `DomainTab.tsx`, `ModalityTab.tsx`, `MovementsTab.tsx`, `WorkoutList.tsx`.
- **What I observed:**
  - "Every workout counted here" is collapsed behind "Show all 1,032 workouts" (`1280-light-blue-06`).
  - When opened, rows can't be expanded to show the description that triggered the match (`rows`). Rows on Workouts
    can.
- **Why it matters:** Details on demand is one click deeper than it needs to be, and the same row looks the same but
  behaves differently (H4).
- **Recommendation:** Show the first 10 rows by default, with "Show all". Reuse the Workouts row component so each row
  expands to its description, with the matched keyword highlighted in a `<mark>`.
- **How to verify:** Visual check; a test that the matched substring is wrapped in `<mark>`.

### 21. Put the unclassified caveat next to the M/W/G charts, not only in the footer

- **Severity:** Low. **Effort:** S. **Area:** Data viz.
- **Where:** `OverviewPanels.tsx`, `ModalityTab.tsx`.
- **What I observed:** "35 of 1,251 entries had no recognisable movement" appears only in the site footer. The
  modality tab says "of 1,216 workouts", with no reason for the change in denominator.
- **Recommendation:** Add a muted line under the M/W/G key: "35 workouts with no recognised movement are left out."
- **How to verify:** Visual check.

### 22. Keyboard and focus polish

- **Severity:** Low. **Effort:** S. **Area:** Other.
- **Where:** `Dashboard.tsx`, `OverviewTab.tsx`.
- **What I observed:**
  - There is no skip link; it takes 6 Tabs to reach content.
  - The non-link "days trained" stat is a focus stop (a `DIV`) with no action.
  - Focus rings are visible, which is good (`kbd-14`).
- **Recommendation:** Add a "Skip to content" link. Remove the stray focus stop, or make days trained open Workouts
  like the other three stats.
- **How to verify:** Keyboard trace.

### 23. Weigh-in delete: undo instead of a confirmation

- **Severity:** Low. **Effort:** S. **Area:** Other.
- **Where:** `WeighInsPanel.tsx` (a known open item).
- **Recommendation:** Delete immediately and show an inline "Deleted Nov 10, 180.9 lb · Undo" for 8 seconds. This
  avoids modal excise for a reversible, low-stakes action (H3, H5).
- **How to verify:** A test that Undo restores the entry and its storage.

### 24. Typography of the totals row (taste)

- **Severity:** Low. **Effort:** S. **Area:** Other.
- **What I observed:** "180.9 lb" in the mono face shows a wide gap before "lb"; at display sizes `tabular-nums` makes
  numbers look loose (a dataviz anti-pattern).
- **Recommendation:** Use proportional sans figures for the hero numbers and keep mono for axis ticks and tables.
  This is a taste call: try it side by side.

---

## 4. Quick wins (in order)

1. **#1** Mark estimates as estimates (copy, axis title, caption).
2. **#3** Reorder the M/W/G stack to W/G/M, add 2px gaps, and make the days bars neutral.
3. **#13** Always show a Down in "What moved".
4. **#10** Remove the duplicate "Cardio" label and pick one name for M.
5. **#15** Turn off the chart entry animation.
6. **#12** Body Comp labels ("Nov average", "during your scan history") and the trends-first order.
7. **#19** Dates on Then versus now.
8. **#11** Tighter tab gaps at `lg` plus edge fades.
9. **#21** The unclassified line next to the M/W/G charts.
10. **#18** Relabel the Insights filters.

**Also built since: #2, #4 and #8.**

- **#2:** every verdict now has its own glyph and Timeline mark (`progress/verdictMark.tsx`), and colour only repeats it, so Up
  and Down stay distinct with the red accent and in greyscale. "Not tested since" lost its hardcoded amber and is grey and
  dotted.
- **#4:** works as recommended, except on touch. A tap picks the point rather than showing a "See N workouts" button inside the
  tooltip; one tap is a shorter path, and the note under the chart carries the action and Clear. Keyboard picking (arrow keys,
  Enter, Escape) came with it, as did a keyboard-only focus ring on charts (WCAG 2.4.7); pointer focus no longer draws a box
  round the plot. The custom range label keeps its capitals and reads one day as one date.

- **#8:** a collapsed verdict row is its name and pill, the change and the windows (plus the long-gap caveat). The inline
  sparkline the recommendation asked for was built and removed, and so was a change bar tried in its place: at row size neither
  added anything the row's words didn't, and both read as clutter. The new
  best, the RX or Scaled cross-reference and the body-weight lines open with the chart. The evidence chart is drawn at its
  measured width, so its text is 11px on a phone and on a desktop (it was about 6px and 20px), with solid gridlines and as many
  date ticks as fit. The Progress page at 1280px is 18% shorter (2,709px to 2,222px), not the half estimated: the headline
  card, group headers and closed groups stay as they were.
**Status: all ten are built**, one commit each, with tests. Where the build differs from the recommendation above:

- **#1:** The verdict line reads "+35 lb (223 to 258 lb est. 1RM), +15.4%" rather than starting with "Est. 1RM", so the same
  string also reads correctly mid-sentence (Timeline, Overview). A record names its logged set, even for a single
  ("from 145 × 1"), which tells the athlete that load was actually lifted. A test over the sample checks every lift line.
- **#3:** W, G, M from the baseline. `tests/modalityColors.test.ts` simulates the deficiencies on the real tokens: every
  adjacent pair clears 21 under deutan and protan in both modes. The one pair still under target is green against blue under
  tritanopia (5.3 light, 4.5 dark), pinned as a known limitation and carried by the 2px gap.
- **#10:** M is "Cardio" everywhere in the app (tab, page title, keys, tooltips, copy), with keys pairing the word and the letter
  ("M · Cardio"). The duplicate "Cardio" tab label is kept on purpose: the Domains and Modalities headers tell the two apart. M
  was first renamed "Monostructural" and then reverted: it is the textbook term, not how athletes talk, and it was long enough
  to push the tab row over at 1280px.
- **#11:** With the gaps tightened from `lg`, the whole row fits at 1280px (1216px in 1216px, no room to spare). Below that it
  scrolls, with fades and, on pointer devices, scroll buttons.
- **#12:** The two-line InBody source card stays at the top, since it explains the charts and holds Replace file. Trends then
  come before the reading list. Days trained reads "730 in months with a scan".
- **#19:** The "too short to compare" guard is 8 weeks from the first workout to the last, not a bucket count: the halves
  are cut by workout count, so the grouping never changes them.

---

## 5. Cross-cutting patterns (fix once)

1. **A shared `ChartFrame`** (`src/components/dashboard/charts/ChartFrame.tsx`). Every chart card already repeats a
   title, a caption and a `ChartContainer`. One frame should own:
   - title, caption (window and denominator) and an optional key;
   - the Table toggle (#14);
   - `isAnimationActive={false}` (#15);
   - the click-to-drill callback (#4);
   - the `aria-label` takeaway.

   The EvidenceChart and Timeline can use the frame without Recharts.
2. **One axis and number formatter** (`chartUtils.ts`): `formatValue(v, unit)` always writes a space before units
   ("181.0 lb", "79%"), and the top y tick carries the unit. Time ticks are horizontal, with `minTickGap` and short
   labels ("Jan '24" for monthly, "Q1 '24", "2024", "Mar 8" for weekly), instead of the -35° rotation used on every
   Recharts time axis. Overview's Showing up already does this and reads better.
3. **One bucket model for honesty**: every bucket carries `n` and `partial: boolean`, and every time chart draws
   partial and thin buckets the same way (#5), copying Overview's "so far" convention.
4. **Status encoding separate from the accent** (#2): one `VerdictMark` component (glyph, chip, end-marker) used by
   Progress, Overview and Timeline.
5. **An estimate vocabulary** (#1): one `formatLoad(session, { estimated })` that every insights string uses, so "est."
   can't be forgotten in a new place.
6. **Text in hand-built SVG at fixed pixel size**: measure the width and set the `viewBox` to it, in EvidenceChart and
   anywhere else a `viewBox` is used.
7. **Remove dead chart code**: delete `StackedShareChart.tsx` or reuse it in #6.

---

## 6. Data interaction roadmap

1. **Drill from any chart point to its workouts** (#4).
   - Question: "What was that month or that session?"
   - Effort: M.
   - Constraints: one value-free `chart_bucket_opened` event with the view id only.
2. **Domain and modality comparison strip** (#6).
   - Question: "Is my training balanced, and what's drifting?"
   - Effort: M.
   - Constraints: keep tags (bars, about 300%) and the split (one stacked bar, 100%) in different forms, and keep the
     visible tab row.
3. **Range brushing on the Training time charts**, replacing drag-to-select (removed with Compare).
   - Question: "Zoom into my summer block."
   - Effort: M with the Recharts `Brush` in a 32px strip under the chart; L for a custom pointer layer.
   - Desktop: drag across the plot sets a custom range in the scope line (one source of truth). The scope sentence
     changes to "Showing Jun 3 to Aug 30" with a "Clear" link.
   - Touch: drag on the brush strip, not the plot, so scrolling still works.
   - Constraints: Training views only, since Insights ignore the range, and the existing preference write path
     (`persistRangeSelection`).
4. **Chart and table toggle** (#14).
   - Question: "Give me the numbers."
   - Effort: M once, through `ChartFrame`.
   - Constraints: the toggle state is per device in `localStorage`, never synced.
5. **Timeline entry → evidence highlight**.
   - Question: "Did the change I made in March do anything?"
   - Effort: M.
   - Selecting an entry shades its span on every verdict lane and on the open EvidenceChart (a neutral band), and the
     Selected panel shows the entry's existing before/after from `entryVerdict.ts`.
   - Constraints: the band is context only. The chart must not label a change as caused by the entry, and nothing is
     shown for "happened" entries beyond the band.

---

## 7. Constraints worth revisiting

- **Fixed M/W/G colours are red, green and blue.** Reordering (#3) fixes the adjacent pairs that matter, but the
  Workouts row bar and any future M/W/G line chart (where all pairs compare) will still put red and green side by
  side. Consider keeping the rep-max colours fixed but taking the M/W/G colours from a validated CVD-safe triad
  (blue, orange, and a dark neutral, for example), validated with `validate_palette.js --pairs all`.
- **The red accent swatch plus the destructive red.** Even with #2, a red accent puts the athlete's one colour on top
  of the app's only warning colour. Either drop the red swatch or test accent-to-destructive separation in
  `themeContrast.test.ts`.
- **"Tabs are a visible row, never a dropdown" at 16 tabs.** #11 makes the row workable, but ten domain tabs are ten
  copies of one view. A "Domains" view with the comparison strip and a domain selector inside it (a segmented row,
  still visible) would leave Training with 7 tabs. The docs already rule out a third nav level, so this needs the
  owner's decision.

---

## 8. What I couldn't evaluate, and a research plan

**Not evaluated:**

- Real camera QR scanning and two-device sync.
- A real multi-year export from a different athlete. The sample is one athlete (a known open item), so thresholds,
  density and "noisy" judgements are calibrated on one data shape.
- Production-build performance: tab switches measured 782ms (Lifts), 600ms (Movements) and 478ms (grouping → weekly)
  on the dev server with React's development checks. Re-measure in `vite preview` before acting; if they stay over
  400ms, memoise `LiftGrid`'s per-lift filtering and `MovementsTab`'s rebuild.
- Real screen readers (my keyboard trace is not a VoiceOver or NVDA pass).
- Coach mode beyond the splash.
- Forced-colors / high-contrast mode.

**Research plan:** 6 to 8 athletes, 45 minutes each, half on phones, using their own export where possible. Five
tasks built on the core questions:

1. "Am I getting stronger at back squat? What is your best?" Measures whether #1 (estimate versus logged) causes
   confusion.
2. "Is your training balanced across the ten domains? Which one do you train least?" Measures the cost of #6.
3. "Your Strength share dipped once last year. What did you do that month?" Measures #4 (drill-down).
4. "You started a cut in March. Did your lifts change during it?" Measures Timeline comprehension (#9) and whether
   athletes infer cause.
5. "What share of your training is gymnastics, and does that add up with the other two?" Measures whether athletes
   tell the 300% tags from the 100% split.

Record completion, time and the wrong answers given. Re-run tasks 1, 3 and 5 after the quick wins.
