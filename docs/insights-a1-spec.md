# A1 specification: "Is my performance improving?"

**Status: draft for review, nothing built.** A1 is the foundation for the rest of Insights (body
context, period verdicts, the front door; see `insights-questions.md`). This file defines it
precisely enough to write tests against. Every number marked *tunable* is a starting point chosen from
the measurements below, not a validated value.
The acceptance cases are in [`insights-a1-acceptance.md`](insights-a1-acceptance.md).

## 1. Definitions

- **Subject**: a load-scored lift or a named benchmark, with RX and Scaled kept separate (as
  `buildLiftSubjects` / `buildBenchmarkSubjects` do today).
- **Session**: one subject on one calendar day. Several entries the same day collapse to the best
  (highest e1RM for a lift, best score for a benchmark). Measured: 8 days across 5 subjects in the
  sample had duplicates, and today each counts as its own entry.
- **Session value**: for a lift, the estimated 1RM (the existing average of Epley and Brzycki, a true
  single used as-is). For a benchmark, the raw score with its direction (lower or higher is better).
- **Change**: relative, signed so that *better is positive* for every subject. This is what lets lifts
  and benchmarks be counted together without a shared unit.

## 2. Per-subject verdict

Order sessions by date. With `n` sessions, take the most recent `N` as **recent** and the `N` before
them as **previous**, where `N = min(4, floor(n / 2))` (*tunable*). The verdict compares the **best**
session in each window:

    change = (best(recent) − best(previous)) / best(previous), signed

- **Record**: a recent session at least 2% better than every earlier session of the subject (*tunable*).
  So a new personal best of 200 over 195 (+2.6%) counts even though it is under the 5% window threshold.
- **Max effort**: a session whose title or description names an explicit rep max ("3RM") or a rep
  ladder. Benchmarks are always scored efforts. SugarWOD's own PR flag is **not** used (see below).

For a lift, the first rule that applies wins:

1. `up` if change ≥ +5% *or* the recent window holds a record (*tunable*).
2. `down` if change ≤ −5% and the recent window holds a max-effort session.
3. `not tested since` if change ≤ −5% and it does not: "last tested 14 months ago at 195; recent
   sessions are lighter work". This is the mid-cycle case. It is never called a decline.
4. `no clear change` otherwise.

A benchmark skips rule 3: a change of −5% or worse is `down`. The signed change is always shown beside
the verdict (for example `no clear change, +3.9%`).

- **Eligible** only with at least 3 sessions per side (`n ≥ 6`) (*tunable*). Otherwise there is no
  verdict, only a shortfall: "needs 2 more sessions (has 4, needs 6)".
- The verdict states the window: the dates the sessions cover and `N`.
- **Recency**: a subject whose latest session is more than 365 days before the reference date (*tunable*) is
  marked not recent; see section 3c.
- The verdict depends only on SugarWOD rows. It never reads body data, periods or tags.

### Why best-of-window, 5% and up to 4 sessions

Measured on the bundled sample (1,209 rows, 45 subjects, 10 with at least 8 sessions). Consecutive
sessions of the same lift differ by a median of 6.9% (75th percentile 12.4%), so a 3% threshold sits
inside ordinary session-to-session movement. The check used here is how often a subject's verdict
changes after **one more session**, replayed over every point in each of the 10 subjects' histories:

| Rule (recent vs previous) | Flips after one more session | Up-to-down or down-to-up reversals |
| --- | --- | --- |
| Current: mean, N ≤ 3, 3% | about 50% | 9% |
| Mean, N = 4, 5% | 37% | 0% |
| **Best, N = 4, 5%** | **32%** | **3%** |
| Best, N = 4, 8% | 19% | 3% |
| Best, N = 2, 5% | 50% | 14% |

The current rule changes its mind about half the time on a single new session and calls a subject
the opposite direction one time in eleven. Larger windows and a higher threshold are steadier, and
best-of-window beats the mean because a lighter day (a back-off set, a 5RM day after a 1RM day) does
not read as a decline. The price is coverage: the rule above gives a verdict for 12 of 45 subjects in
the sample, against 29 under the current rule, which was reading very little. **Only 10 subjects had
enough history to test stability, so these are directions, not tuned values.**

The same sample shows how much the choice matters: Deadlift reads `down −4.2%` under the mean and
`up +4.4%` under best-of-window, and Snatch reads `up +14.7%` (mean of up to 3) or `flat +1.0%` (best of up to 4, 3 per side).
At this data density the verdict for a given subject is fragile, which is the reason the spec states
the window and the sessions behind it with every verdict.

### Why a record rule, and why not the PR flag

The 5% window threshold is a large jump for an experienced lifter at the end of a cycle, and a move
from 195 to 200 is a real improvement. Three candidate additions were replayed on the 12 eligible
subjects (the net and label columns were measured family-weighted, before one vote per subject was
chosen; per subject they are higher, for example +0.50 for 5% or a record at a 1% margin):

| Rule | up / no clear change / not tested / down | Net, label | Flips | Reversals |
| --- | --- | --- | --- | --- |
| 5% only | 5 / 6 / 0 / 1 | +0.17 Holding steady | 32% | 0% |
| 3% only | 7 / 4 / 0 / 1 | +0.38 Improving | 31% | 2% |
| 3% or SugarWOD PR flag in the recent window | 11 / 0 / 0 / 1 | +0.71 Improving | 24% | 3% |
| 3% or a record | 8 / 3 / 0 / 1 | +0.45 Improving | 29% | 3% |
| **5% or a record** | **7 / 4 / 0 / 1** | **+0.38 Improving** | **29%** | **1%** |

- **The PR flag is too generous to use.** 53 of 246 lift sessions (22%) carry it, because SugarWOD
  flags a best at any new title or rep scheme. As an "up" signal it turns 11 of 12 subjects up.
- **A record is the same idea without the noise.** It compares a session with the subject's whole
  history (not with the previous four sessions, which may sit in a trough) and needs a 2% margin
  over every earlier estimate. The margin sits above the estimator's own error (the Epley and Brzycki
  formulas diverge by 3 to 4 percentage points at 2, 3 and 5 reps), so a rep-scheme artifact does not
  count as a record. A real but small PR, such as 195 to 198 (+1.5%), reads `no clear change`.
- **5% or a record (decided)** keeps 5% as the way to recognise a recovery from a trough, and adds records
  on top. Against "3% or a record" it differs on exactly one subject, Back Squat: its window change is
  +3.9%, its best recent session (232) is only 0.9% above its 2023 best of 230, and its last two
  sessions are 215 and 212, so `no clear change` is the accurate reading. The reversal counts
  (0% to 3% across the five rules) are 0 to 4 events out of 140 pairs and cannot rank them. The
  worked data for every subject is in [`insights-a1-sample-trace.md`](insights-a1-sample-trace.md).
- **Record margin: decided, 2%.** At 1%, Snatch (141 against 140, `up`) and Shoulder Press (138 against
  136, `no clear change`) both round to +1.0% and fell on opposite sides of the line. At 2% Snatch reads
  `no clear change`; Deadlift (+4.0%), Push Press, Power Snatch, Clean and Power Clean stay `up`. On the
  12 subjects that is 6 up, 5 no clear change, 1 down, net +0.42 per subject (+0.31 family-weighted; derived from the
  1% measurements, not re-run).
- **A window `up` can still sit below the athlete's best.** Front Squat reads `up` (+8.8%) because the
  previous window was a trough, but its recent best of 200 is 2.6% under its 2023 best of 205.
- 89 of 246 lift sessions (36%) read as max efforts, and every one of the 12 subjects has at least one in
  its recent window, so `down` can fire. No lift is `not tested since` or `down` on the sample's latest
  windows. How often `not tested since` appears over the history was not measured.

### The estimator and the 2% margin (decided)

- **The estimator stays the average of Epley and Brzycki** (a single is used as-is). The formulas disagree by 3.6%
  to 3.8% of the average at 2 to 5 reps (multipliers at 3 reps: ×1.100 and ×1.059, average ×1.079; 185 lb for 3
  gives 203.5, 195.9 and 199.7), so each sits about 1.9% from the average. They are population curves, so an
  athlete's real ratio between a rep max and a 1RM can differ by a few percent. That error cancels when two
  sessions use the same rep count and does not when they differ. Mixing is routine on the sample: of 301 rows with
  a readable 1 to 8 rep scheme, 85 are singles, 69 doubles, 74 triples, 21 fours, 36 fives and 16 at six to eight.
- **Tested against a single formula.** Recomputing the 11 sample lifts with Epley only and Brzycki only, one
  state changes (Snatch is `up` under Epley, a +2.9% record, and `no clear change` under the average and Brzycki).
  The percentages move by 3 to 4 points: Bench Press −2.3% (Brzycki), −0.5% (average), +1.3% (Epley); Deadlift
  against the best before the window +5.8%, +4.0%, +2.1%; Snatch −0.8%, +1.0%, +2.9%. The average sits between the
  two every time, so choosing one formula would hand the verdict to that formula's lean.
- **The record margin stays 2% for every pair of sessions.** It matches the half-gap above (about ±1.9%). A smaller
  margin when both bests use the same rep count was considered and not adopted: it would add a rule the athlete
  cannot see the reason for, and session noise (the larger source) does not cancel. Revisit if a real export shows
  many same-scheme near-misses between 1% and 2%.
- **Why not a threshold at or near zero, or the sign of the trend line.** Simulating an athlete whose lifts do not
  change (12 monthly sessions), the chance of a false `up` by noise per session:

  | Noise per session | Current rule | Recent best 2% above the best before the window | 1% | Above 0% |
  | --- | --- | --- | --- | --- |
  | 3% | 13% | 14% | 22% | 33% |
  | 4% | 20% | 21% | 27% | 35% |
  | 5% | 24% | 25% | 31% | 37% |
  | 7% | 30% | 30% | 34% | 37% |

  A positive trend slope is positive for about half of such athletes (50%), whether fitted to every session or to
  the best per quarter. On the sample 10 of 12 lifts have a positive slope over their whole history because
  everyone gains early (Back Squat slopes up 5.2% a year while flat since 2023), so a positive slope answers "have
  you improved since you started", not "are you improving now". The margin at 0%, 1%, 2% and 3% gives 9, 8, 6 and 6
  of the 12 sample subjects `up`.

## 3. What counts as a lift session

- One rep-scheme rule for every view: any scheme from 1 to 8 reps (*tunable*), replacing the
  plateau-only 1/2/3/5RM rule. This adds sessions for lifts trained mostly at 4 to 8 reps (Front Squat
  30 to 38, Back Squat 25 to 32 in the sample) at the cost of less accurate high-rep estimates.
- A Load row whose rep scheme cannot be read is not counted, **and "How this was counted" (section 4) says so**.
  Measured: 210 of 526 Load rows (40%) in the sample have no readable scheme; today they disappear
  without a word.
- A lift is a subject only when the row names it (the `barbell_lift` field, or a title matching a
  lift already known), as today.

## 3a. Subjects without a verdict: the facts line (decided)

The gate stays at 3 sessions per side (6 sessions). A subject below it is not given a weaker verdict;
it gets a facts line, which states what was logged and claims nothing about direction.

- **Who:** every subject with 2 to 5 sessions. On the sample that is 17 of the 33 without a verdict
  (3 with 5 sessions, 2 with 4, 5 with 3, 7 with 2). Grace RX, one of the 7, becomes a move-up (3b), which
  leaves 16 facts lines among 31 subjects without a verdict. The 16 with a single session show only that
  ("1 session, Dec 2023") and the shortfall.
- **What it shows:** the latest and the previous session with their months, the difference in the
  subject's own unit, and the shortfall. Lifts show estimated 1RM, labelled as an estimate, in pounds.
  Time benchmarks show the logged time with "faster" or "slower". A Rounds + Reps benchmark shows both
  scores, and a difference in reps only where reps per round is known (Cindy: 30).
  Example: "Hang Power Clean (RX): 5 sessions. Latest 185 lb est. (Aug 2026), previous 175 lb est.
  (Mar 2026), +10 lb. Needs 1 more session for a verdict."
- **What it never shows:** a verdict word (`up`, `no clear change`, `down`), a percentage, or a pill.
  It adds nothing to the headline counts, the label or the "eligible" figure; the "Left out"
  clause still counts it among those with under 6 sessions.
- **Stale subjects** (latest session more than 365 days before today) still show the line, with "last
  logged Aug 2025" in place of a recent month. Of the 17 on the sample, 9 have a session in the last
  year and 8 do not.
- It sits with the exposure facts on the subject list (last logged, sessions in the last year), as one
  line and not a second feature.

## 3b. Scaled and RX (decided)

- **Separate subjects, never merged.** RX and Scaled of one name have their own sessions, verdicts, counts
  and gates. On the sample, every Scaled-to-RX move on a benchmark makes the time worse because RX is the
  harder workout (Fran Scaled 7:36, 6:32, 7:37, then RX 9:13; Grace 3:45 to 4:51; Murph 49:16 to 58:28), so a
  merged history would read as a 20 to 30% decline at each switch. Lifts follow the same rule: only 7 of
  526 Load rows are Scaled (1 with a named lift), and a Scaled lift's estimated 1RM reads its reps from the
  prescription, which may not be what was done. The real-export check counts Scaled Load rows; merging
  lifts is revisited only if a real export has many.
- **Cross-reference line.** A subject whose name also has sessions under the other status shows a
  factual line in the subject's own units, with no percentage, verdict word or pill and no effect on any
  count: "Also logged as RX: 1 session (Dec 2025), 9:13", "Also logged as Scaled: 2 sessions (Nov 2022 to
  Oct 2023), latest 3:45".
- **Moving up to RX is an improvement, whatever the load or time.** A *move-up* is an RX session of a
  subject whose most recent earlier session of that name was Scaled (one Scaled session before and one RX
  after is enough). The RX subject then reads `up` with the reason, "Moved up to RX in Dec 2025, after 3
  Scaled sessions", and no percentage. It casts one up vote in the headline for 12 months after the
  move (*tunable*, the same as the recency rule); after that the line stays as a fact and the vote ends.
  When the RX subject reaches 6 sessions its normal verdict replaces the move-up. It applies to lifts and
  benchmarks alike.
- **Moving down to Scaled is a neutral fact.** It could be an injury, travel or programming, so it gets the
  cross-reference line, no `down` and no vote (Cindy RX in 2023 and Jan 2025, Scaled in Apr 2026).
- **On the sample** (as of 2026-09-11): Fran RX (Dec 2025) and Grace RX (Mar 2026) vote up. Murph (May 2025)
  and Helen (Oct 2024) moved up earlier, so they show the fact and do not vote. The headline goes from 6 up
  of 12 to 8 up of 14 (5 no clear change, 1 down; net +0.50, 57% up, `Improving`), and 31 subjects, not 33,
  lack enough sessions.

Acceptance cases: `A1-SCL` in [`insights-a1-acceptance.md`](insights-a1-acceptance.md) (Scaled and RX).

## 3c. Recency (decided)

- **The reference date is today**, the device's calendar day. The app already computes the Insights views
  as of today and anchors date-range presets to it, and demo mode extends its sample through today. It is a
  function input (the existing insight functions take an `asOfDate`) and is never read from the clock inside a
  calculation, so the same history and date always give the same result.
- **One date for every rule that needs one:** the 365-day recency rule, the 12-month window for Scaled-to-RX
  votes (3b), "sessions in the last year" in the exposure facts, and the 30, 60 or 90 day option on the front
  door.
- **Counting:** whole local calendar days between the reference date and the latest session. 365 days is
  recent; 366 is not (*tunable*). Sessions dated after the reference date are ignored.
- **A not-recent subject** keeps its verdict on the subject list, marked "Not recent: last logged Aug 2025".
  It is excluded from the counts, the label, the front door and the "eligible" figure.
- **Results change with the date, not only with new data.** A subject drops out of the headline when it
  crosses 365 days. This is intended: a lift not logged in a year is not recent.
- **The headline shows "Log through Sep 11, 2026"**, the date of the latest session in the log, so the
  athlete can see how current the data is.
- **No recent subject:** the headline reads "No lift or benchmark was logged in the last 12 months." and
  shows no label.
- **On the sample** (derived from the measured data, not re-run): as of 2026-09-11 all 12 subjects with a
  verdict are recent. As of 2027-04-30 Power Snatch (last logged 2026-03-10), Nancy (2026-04-13) and Deadlift
  (2026-04-29) are not recent, and the Fran and Grace move-ups have passed 12 months, so the headline reads 4
  up of 9 (5 no clear change) and is still `Improving`.

Acceptance cases: `A1-REC` in [`insights-a1-acceptance.md`](insights-a1-acceptance.md) (recency).

## 3d. How a verdict is displayed (decided)

- **Each verdict shows** the sessions it compared, in months: "Last 4: Feb to Aug 2026 · Previous 4: Mar 2024
  to Mar 2025" (a window inside one month shows a single month), the best of each side, the change in the
  subject's own unit first and the percentage second: "+16 lb (184 to 200 lb), +8.7%".
- **Lifts are in pounds** (estimated 1RM, rounded to a whole pound). The export is always in pounds,
  whatever unit the athlete uses in SugarWOD (maintainer's note, not verifiable from the file, which has no unit
  column). The app has no weight-unit setting and every weight in it is hard-coded to pounds. A kilogram display
  setting would be a display-only preference outside these criteria, added only if it proves necessary.
- **Time benchmarks** show the logged time with words: "0:50 slower (13:47 to 14:37), 6.0% slower".
- **Rounds + Reps** benchmarks are read from the display string ("16+15", or "16"), never the raw number. The
  raw value has two encodings in the sample (reps ÷ 1000 on 65 rows, reps ÷ 10000 on 17) and drops trailing
  zeros ("5.01" is 5+10). A benchmark with a known reps-per-round converts to total reps (Cindy: 5 pull-ups, 10
  push-ups, 15 squats, so 30 per round) and shows "+35 reps (16+15 to 17+20), +7.1%". One without a lookup
  shows both scores and no difference.
- **The percentage is rounded to one decimal** (half away from zero) before it is compared with any threshold
  (5%, 2%), so the number shown never contradicts the verdict. A true 4.96% counts as 5.0% and reads `up`.
- **A zero change** reads "no change in the best (200 and 200)", never "+0".
- **Long-gap note.** When either window spans more than 730 days (about 24 months), first to last session, the
  verdict says "Recent sessions span 26 months (Jan 2024 to Mar 2026)." It is an annotation only and never
  withholds a verdict. On the sample it appears for 2 of 12 (Power Snatch, Power Clean). The coverage
  paragraph counts such subjects (section 4).

Acceptance cases: `A1-DSP` in [`insights-a1-acceptance.md`](insights-a1-acceptance.md) (display).

## 3e. The evidence chart (decided)

A chart explaining a verdict opens from its subject row on the Insights list. The Workouts lift chart (raw load
by rep scheme, points not joined across schemes) is unchanged, with no estimated-1RM option, so a 165 lb 5RM and
a 165 lb single are still never drawn as one series. Three mockups were reviewed; this is the third.

- **Series:** one dot per day, the best estimated 1RM of that day, the same series the verdict uses. It is
  drawn for subjects with a verdict. Whether subjects with only a facts line (3a) get a dots-only chart is open.
- **Emphasis, not shading:** the previous window's dots are dark, the recent window's dots use the accent, and
  every other dot is faint. There are no shaded bands, no window best-lines, no legend and no controls.
- **Labels:** the best of each window carries its value. A new-best session (2% above everything earlier) is a
  larger accent dot labelled "new best +4.0%"; when it is also the recent best the label reads "365 · new best
  +4.0%".
- **Trend line:** a robust (Theil-Sen) line through the best session of each calendar quarter, over the
  subject's whole history (Insights uses the full log, not the dashboard's date range). It is dashed, labelled
  "Trend" at its right end, carries no number and no up or down wording, and is drawn only with 4 or more
  quarters of sessions. Best per quarter is used because it does not tilt down with the light sessions of a
  build. Measured on the sample it tracks the verdict more closely than a fit through every session (+0.7%/yr
  for Back Squat against +5.2%) or through the last 24 months (±14% to 24% a year on 3 to 5 points); it
  still disagrees where a record sits in one quarter (Power Clean: line −1.2%/yr, verdict `up` from a 210).
- **Max-effort rings** appear only when the verdict is `down` or `not tested since`, on every max-effort
  session (an explicit rep max or a rep ladder), so the athlete sees when the last test was. Otherwise the
  tooltip says "max effort".
- **Text:** above the chart, the window dates, the new-best note ("New best: 365 lb on Mar 24, 2026, 4.0% above
  the previous best of 351 lb.") and, for `not tested since`, "Last tested Jan 10, 2025 at 195 lb. Recent
  sessions are lighter work." Under it one muted line: "Highlighted dots are the sessions the verdict
  compared. The dashed line is the long-run trend." plus " Rings mark max efforts." when rings are shown.
- **Tooltip:** date, estimated 1RM, max effort, and any record gain.
- **Width:** the chart is sized to its container so the text stays at least 11 px on a 360 px screen.
- **It never changes a verdict, count or label** and is not reconciled with the verdict when they disagree.

Acceptance cases: `A1-CHT` in [`insights-a1-acceptance.md`](insights-a1-acceptance.md) (the chart).

## 4. Aggregate (the headline)

- **Population**: eligible, recent subjects. Each subject counts once, so a lift logged 37 times
  weighs the same as one logged 8 times.
- **Counts sentence and coverage paragraph (decided).** One sentence, then a short muted paragraph.
  - *Sentence:* "<Label> in <up> of <counted> lifts and benchmarks (<n> no clear change, <n> down)." A part
    that is zero is dropped, and with both zero there are no brackets: "Improving in 4 of 4 lifts and
    benchmarks." Counted subjects are those with a verdict that are recent and not `not tested since`, plus
    move-ups (3b).
  - *Paragraph:* short clauses in this order, each shown only when its number is above zero, with correct
    singular and plural. (1) "Includes 2 that moved up to RX." (2) "Left out: 31 with under 6 sessions, 1 not
    logged in 12 months, 2 not tested recently." (3) "2 compare sessions over 24 months apart." (4) "Log
    through Sep 11, 2026." The log date always shows.
  - *Left out* parts are exclusive and taken in order: a subject with under 6 sessions is counted there only,
    then one not logged in the last 12 months, then a lift not tested recently (benchmarks never are).
  - *No headline:* with fewer than 3 counted subjects the label and sentence are replaced by "No headline yet:
    needs 3 lifts or benchmarks with a verdict, has 0." followed by "Closest: Back Squat, 1 more session;
    Clean, 2 more." The closest are up to 2 recent subjects needing the fewest more sessions, ties to the more
    recently logged; a subject that is not recent is never named. Without any, the closest part is omitted. The
    paragraph clauses follow.
  - *"How this was counted"* sits behind a link under the paragraph and opens on demand. It lists the counted
    subjects (verdicts and move-ups), the left-out ones by reason with names, the subjects with a long gap, and the
    unused weight entries by reason (on the sample 272 of 526: 210 with no readable rep scheme, 15 outside 1 to 8
    reps, 47 with no lift named).
  - *On the sample* (as of 2026-09-11): "Improving in 8 of 14 lifts and benchmarks (5 no clear change, 1
    down)." then "Includes 2 that moved up to RX. Left out: 31 with under 6 sessions. 2 compare sessions
    over 24 months apart. Log through Sep 11, 2026."
- **Votes (decided: one per subject).** A lift logged 37 times weighs the same as one logged 8, and a
  Snatch and a Power Snatch are two votes. The cost is skew: 5 of the 12 sample subjects (42%) are snatch,
  clean or jerk variants, so a specialist's headline mostly reflects what they train. The skew is shown,
  not corrected (the breakdown below).
- **Label (decided)**: one tier for everyone, defined only by the counts. Counted subjects are the
  eligible, recent subjects that are not `not tested since`. `net = (up − down) / counted`. `Improving` if
  net is at least +0.25 **and** at least a third of the counted subjects are up; `Declining` is the mirror;
  otherwise `Holding steady` (*tunable*). The only gate is 3 counted subjects; below that there is no
  label, only what is missing. There is no minimum number of movement families: an athlete with a short or
  narrow history gets the same rule, and the counts sentence beside the label shows how much stands
  behind it. The one-third bar stops `Improving` resting on a minority (2 of 7 up with the rest unchanged
  is net +0.29 but only 29% up, so `Holding steady`). On the sample (6 up, 5 no clear change, 1 down of
  12) the net is +0.42 and 50% are up, so `Improving` (8 up of 14 with the two Scaled-to-RX moves, section 3b). Under the previous rule it was 18 of 29 up, which is
  the optimism the stricter rule removes.
- **Family breakdown (decided: collapsed).** Under the headline sits one collapsed section, "By movement
  family". Its summary line lists the families with more than one counted subject, largest first and ties
  alphabetical: "Votes per family: Clean 3 · Press 2 · Snatch 2 · Squat 2. The other families have one
  each." Opening it lists every family as "x of y up" with its members and says it is information only.
  Display rules, which affect nothing else: a subject's family is its lexicon family (the first one listed
  for a movement, so Clean & Jerk is a clean), a lift with no family stands alone, and all benchmarks show as
  one "Benchmarks" row. If no family has more than one subject the section is not shown. Opening or closing
  it changes no count, label or order.

### Scaling with history (measured)

The final rule replayed on the first K workouts of the sample export, and on its first 12, 24 and 36
months, each as if the athlete had uploaded at that point. Eligible means a subject with at least 6
sessions (3 per side) and a session in the last 365 days.

| Slice | Load rows | Subjects logged | Eligible | Counted | Up / none / down | Net, up share | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| first 100 workouts | 59 | 11 | 0 | 0 | none | — | no label (needs 3 more) |
| first 250 workouts | 114 | 23 | 2 | 1 | 1 / 0 / 0 (+1 not tested) | — | no label (needs 2 more) |
| first 350 workouts | 186 | 26 | 3 | 3 | 2 / 1 / 0 | +0.67, 67% | Improving |
| first 500 workouts | 288 | 32 | 5 | 4 | 1 / 2 / 1 (+1 not tested) | 0.00, 25% | Holding steady |
| first 800 workouts | 415 | 37 | 7 | 6 | 4 / 2 / 0 (+1 not tested) | +0.67, 67% | Improving |
| all 1,209 workouts | 526 | 45 | 12 | 12 | 6 / 5 / 1 | +0.42, 50% | Improving |
| first 12 months (436 workouts) | 245 | 30 | 5 | 3 | 0 / 3 / 0 (+2 not tested) | 0.00, 0% | Holding steady |
| first 24 months | 412 | 37 | 7 | 6 | 4 / 2 / 0 (+1 not tested) | +0.67, 67% | Improving |
| first 36 months | 469 | 40 | 11 | 10 | 6 / 3 / 1 (+1 not tested) | +0.50, 60% | Improving |

The net and up-share columns were recomputed per subject from the counts of the earlier family-weighted
run, not re-run.

- **The label rule does not change with history; eligibility does.** What limits a new or light user is
  the 6-session gate on a single subject, not the label bar. At about 100 workouts none of 11 subjects
  has 6 sessions (21 sessions across 11 subjects), so there is no headline, only what is missing.
- **At 4 years the headline can still be thin.** The first 500 workouts give 5 eligible subjects, 4 of them
  counted, and a `Holding steady` that rests on 1 up, 2 no clear change and 1 down. It moves to `Improving` at
  800 workouts. The counts sentence shows this; the label does not hide it.
- This athlete is a heavy lifter (about half the rows are Load). An athlete who lifts less will qualify
  fewer subjects at the same workout count.
- Slices are the first K rows of one athlete's history, not many athletes, so these are examples of
  scaling, not distributions.

## 5. Reuse

The same function serves every consumer, with only the sessions chosen differently:

- **Subject list and headline**: the most recent sessions of each subject.
- **Period verdict (D1)**: the period's own sessions as **recent**, and the sessions immediately before
  the period as **previous**, same window size cap, same threshold, same minimum.
- **Front door fixed-period option**: only sessions inside the last 30, 60 or 90 days are eligible
  (values *tunable*); the same rule applies to them, and a subject without enough sessions says so.

## 6. Acceptance cases

All A1 acceptance cases live in [`insights-a1-acceptance.md`](insights-a1-acceptance.md), grouped as SES (sessions
and values), VRD (verdicts), DSP (display), FCT (facts line), SCL (Scaled and RX), REC (recency), HDL (headline),
BRK (family breakdown), CHT (evidence chart) and MAN (manual checks). Each has exact inputs and exact outputs. The
document ends with the open points the writing exposed (the new-best note, a slow steady climb, sentence wording
for the other labels, and a few display details).

## 7. Decisions

**Decided**

1. **Minimum sessions per side: 3.** Chosen over 2 as an "early read" for the steadier verdicts (12 of 45
   sample subjects are eligible, against 17). Below it the athlete sees the shortfall, never a guess.
2. **The windowed best-of rule stays; a trend line was tried and not adopted.** A Theil-Sen slope (the
   median of all pairwise slopes, robust to single bad sessions) over the last K sessions was replayed
   the same way as section 2, with change defined as slope times the span over the window's median:

   | Rule | Eligible now | Flips after one more session | Reversals | Reads "up" |
   | --- | --- | --- | --- | --- |
   | **Best of 4 vs best of 4 (min 3 per side), 5%** | 12 | **31%** | **3%** | 37% |
   | Theil-Sen, last 6 sessions, 5% | 12 | 45% | 10% | 50% |
   | Theil-Sen, last 8 sessions, 5% | 10 | 38% | 3% | 50% |
   | Theil-Sen, last 8 sessions, 8% | 10 | 32% | 0% | 38% |

   At the same data requirement (6 sessions) the trend line is clearly less stable and reads "up"
   more often, because a recent run of higher sessions tilts the whole line. Only with 8 sessions and an
   8% threshold does it match the window rule, at the cost of two subjects and of a rule that is harder
   to explain to an athlete ("best of your last 4 against best of the 4 before" is a sentence they can
   check by eye). Using calendar days instead of session order on the x-axis changed nothing. Revisit if
   a real export shows many subjects with long, regular histories.

   **A second trend-line test, with a significance gate and no session count.** A Theil-Sen slope with a
   Mann-Kendall test (exact for up to 8 points) needs at least 4 points, p below 0.10 and a total change of at
   least 5%; tried over all history and over the last 24 months, on every session and on the best session per
   quarter, against the final window rule on the full sample and on its first 100, 250 and 500 workouts:

   | Slice | Window rule | Trend, all history | Trend, last 24 months | Trend, quarterly best |
   | --- | --- | --- | --- | --- |
   | Eligible, first 100 workouts | 0 | 2 | 2 | 0 |
   | Eligible, first 250 workouts | 2 | 4 | 4 | 0 |
   | Eligible, first 500 workouts | 5 | 7 | 7 | 6 |
   | Eligible, all 1,209 workouts | 12 | 15 | 10 | 15 (all history), 8 (24 months) |
   | Up, all 1,209 workouts | 6 | 8 | 2 | 5 (all history), 2 (24 months) |
   | Flips after one more session | 29% | 13% | 12% | 7% to 8% |

   The trend variants are steadier mostly because they say `no clear change` more often, which is not
   evidence they are more correct. The significance gate scales with the amount of data and qualifies a few more
   subjects (Hang Power Clean, 5 sessions, reads up), but it moves the arbitrary choice instead of removing it:
   over all history Back Squat, Bench Press and Clean & Jerk read `up` from rises in 2022 to 2023, while a
   24-month horizon drops Clean, Power Clean and Power Snatch for lack of points. With 4 or 5 points only an
   almost monotone series reaches p below 0.10, a fit over every session is tilted down by the light sessions of a
   build (quarterly best avoids that but needs a year of history), and a p-value is harder for an athlete to
   check than "best of the last 4 against the best of the 4 before". Not adopted as the verdict.
   **Decided:** a best-fit line is drawn as a visualisation only, and does not change any verdict (section
   3e: best per quarter, on an evidence chart opened from the subject row, not on the raw-load lift chart). The
   early read for subjects with 4 or 5 sessions is **not** built.

**Decided after further measurement**

3. **One vote per subject, with a collapsed family breakdown: decided.** Compared in a mockup as A (no
   breakdown), B (breakdown always shown) and C (collapsed); C chosen. Subjects were mapped to families with
   the existing lexicon (`findMovements` on the subject name, then `familiesOf`; every lift subject in the
   sample resolved). Measured at 3 per side and 5%, before the 2% record margin: per subject the 12 sample
   subjects give net +0.33 and `Improving`; per family (7 groups) +0.17 and `Holding steady`. At the final
   rule both read `Improving` (+0.42 per subject, +0.31 per family). Per subject was chosen because the
   sentence and the label count the same things, one subject changing moves the net by 0.08 here and not
   0.14, nothing depends on the lexicon's family list or on mapping rules (back versus front squat, Clean &
   Jerk, pooling benchmarks), and at low data a family can collapse five subjects into two votes (the first
   500 workouts). The cost is the Olympic skew (5 of 12 subjects), which the breakdown shows instead of
   correcting.

4. **Verdict states: decided.** Lifts have four verdicts (`up`, `no clear change`, `not tested since`,
   `down`) so a training cycle is not read as a decline. Estimated 1RM from any set is a lower bound on
   what the athlete can do, so only `up` can come from any session; `down` needs a max-effort session in
   the recent window. Rejected: a last-session check (it flags nearly every athlete mid-cycle), and
   filtering the series to tests only. Measured on the sample, 215 of 526 Load rows (41%) are working
   sets read from "5x3"-style notation, 77 are ladders, 24 name an explicit rep max and 210 have no
   readable scheme; tests only would leave 87 of 246 counted lift sessions and 6 of 12 subjects.

   **Threshold and record: decided.** `up` is a window change of 5% or more, or a record (section 2).
   **Span display: decided** (section 3d): the signed change is always shown, with each window's span and a
   long-gap note past 730 days. Spans measured on the same 12:

   | Rule | Verdicts | Too spread out | Net, label |
   | --- | --- | --- | --- |
   | Base: 5% | 12 (5 up / 6 flat / 1 down) | 0 | +0.17 Holding steady |
   | Each window spans at most 365 days | 2 | 10 | no label |
   | Each window spans at most 730 days | 10 (3 / 6 / 1) | 2 | +0.07 Holding steady |

   A 365-day cap is not workable at this logging density: four sessions of a typical lift span more than
   a year. A 730-day cap withholds only Power Snatch and Power Clean (about three years each). Lowering
   the threshold to 3% loosens the rule, not tightens it: reversals rise from 3% to 9% and Back Squat
   (+3.9%) and Deadlift (+4.4%) become `up`, both inside the 6.9% median session-to-session movement.

5. **Scaled to RX: decided** (section 3b). RX and Scaled stay separate subjects; a move up to RX is an
   improvement and casts a vote for 12 months; moving down is a neutral fact.
7. **Estimator and margin: decided** (section 2, "The estimator and the 2% margin"): the average of Epley and
   Brzycki, and a 2% record margin for every pair of sessions.
6. **Benchmarks: decided.** Most benchmarks will read "not enough sessions yet" under any steady rule (only
   Nancy has more than 4 sessions in the sample). They are not forced into the headline: a benchmark votes
   through a move up to RX (3b) or a normal verdict at 6 sessions, and otherwise gets the facts line (3a).

## 8. How the numbers above were measured

Throwaway tests (not committed) loaded `public/sample/sugarwod-sample-export.csv` through the real
parser, built subjects with `buildLiftSubjects` (reps up to 8) and `buildBenchmarkSubjects`, collapsed
same-day entries, and replayed each rule at every point of each subject's history to count verdict
changes. The numbers describe one export; they are not a validation.
