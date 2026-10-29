# A1 specification: "Is my performance improving?"

**Status: draft for review, nothing built.** A1 is the foundation for the rest of Insights (body
context, period verdicts, the front door; see `insights-questions.md`). This file defines it
precisely enough to write tests against. Every number marked *tunable* is a starting point chosen from
the measurements below, not a validated value.

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
- **Recency**: a subject whose latest session is more than 365 days before today (*tunable*) keeps its
  verdict on the subject list marked as not recent and is **left out of the headline and the front
  door**. Measured: 2 of 17 subjects were affected under a lighter rule.
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
subjects (family-weighted, as in section 7):

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
  12 subjects that is 6 up, 5 no clear change, 1 down, family-weighted net +0.31 (derived from the
  1% measurements, not re-run).
- **A window `up` can still sit below the athlete's best.** Front Squat reads `up` (+8.8%) because the
  previous window was a trough, but its recent best of 200 is 2.6% under its 2023 best of 205.
- 89 of 246 lift sessions (36%) read as max efforts, and every one of the 12 subjects has at least one in
  its recent window, so `down` can fire. No lift is `not tested since` or `down` on the sample's latest
  windows. How often `not tested since` appears over the history was not measured.

## 3. What counts as a lift session

- One rep-scheme rule for every view: any scheme from 1 to 8 reps (*tunable*), replacing the
  plateau-only 1/2/3/5RM rule. This adds sessions for lifts trained mostly at 4 to 8 reps (Front Squat
  30 to 38, Back Squat 25 to 32 in the sample) at the cost of less accurate high-rep estimates.
- A Load row whose rep scheme cannot be read is not counted, **and the coverage line says so**.
  Measured: 210 of 526 Load rows (40%) in the sample have no readable scheme; today they disappear
  without a word.
- A lift is a subject only when the row names it (the `barbell_lift` field, or a title matching a
  lift already known), as today.

## 3a. Subjects without a verdict: the facts line (decided)

The gate stays at 3 sessions per side (6 sessions). A subject below it is not given a weaker verdict;
it gets a facts line, which states what was logged and claims nothing about direction.

- **Who:** every subject with 2 to 5 sessions. On the sample that is 17 of the 33 without a verdict
  (3 with 5 sessions, 2 with 4, 5 with 3, 7 with 2). The 16 with a single session show only that
  ("1 session, Dec 2023") and the shortfall.
- **What it shows:** the latest and the previous session with their months, the difference in the
  subject's own unit, and the shortfall. Lifts show estimated 1RM, labelled as an estimate, in pounds.
  Time benchmarks show the logged time with "faster" or "slower". A Rounds + Reps benchmark shows both
  scores, and a difference in reps only where reps per round is known (Cindy: 30).
  Example: "Hang Power Clean (RX): 5 sessions. Latest 185 lb est. (Aug 2026), previous 175 lb est.
  (Mar 2026), +10 lb. Needs 1 more session for a verdict."
- **What it never shows:** a verdict word (`up`, `no clear change`, `down`), a percentage, or a pill.
  It adds nothing to the headline counts, the label or the "eligible" figure; the coverage line still
  says "33 more lack enough sessions".
- **Stale subjects** (latest session more than 365 days before today) still show the line, with "last
  logged Aug 2025" in place of a recent month. Of the 17 on the sample, 9 have a session in the last
  year and 8 do not.
- It sits with the exposure facts on the subject list (last logged, sessions in the last year), as one
  line and not a second feature.

## 4. Aggregate (the headline)

- **Population**: eligible, recent subjects. Each subject counts once, so a lift logged 37 times
  weighs the same as one logged 8 times.
- **Counts** `up`, `no clear change`, `down` and `eligible`, plus how many are `not tested since`;
  the headline always shows them with coverage: "improving in 6 of 12 lifts and benchmarks (5 no
  clear change, 1 down). 33 more lack enough sessions." Subjects that are `not tested since` are
  left out of the net, because they carry no information about direction, and are named in the
  coverage line ("2 lifts not tested recently").
- **Label (decided)**: one tier for everyone, defined only by the counts. `Improving` if the
  family-weighted net `(up − down) / groups` is at least +0.25 **and** at least a third of the groups are
  up; `Declining` is the mirror; otherwise `Holding steady` (*tunable*). The only gate is 3 eligible
  subjects; below that there is no label, only what is missing. There is no minimum number of movement
  groups for conviction: an athlete with a short or narrow history gets the same rule, and the counts
  sentence always beside the label shows how much stands behind it. The one-third bar stops `Improving`
  resting on a minority of groups (otherwise 2 of 7 groups up with the rest unchanged would read
  `Improving`). On the sample (6 up, 5 no clear change, 1 down across 7 groups) the net is +0.31 and
  45% of groups are up, so `Improving`; with 5% alone it was +0.17, `Holding steady`. Under the
  previous rule it was 18 of 29 up, which is the optimism the stricter rule removes.
- **Family weighting** (measured, see section 7): each movement family casts one vote, split equally
  among its eligible subjects, so Snatch and Power Snatch together weigh as much as Deadlift alone.
  The net share uses these weights; the sentence still counts subjects.

### Scaling with history (measured)

The final rule replayed on the first K workouts of the sample export, and on its first 12, 24 and 36
months, each as if the athlete had uploaded at that point. Eligible means a subject with at least 6
sessions (3 per side) and a session in the last 365 days.

| Slice | Load rows | Subjects logged | Eligible | Groups | Up / none / down | Label |
| --- | --- | --- | --- | --- | --- | --- |
| first 100 workouts | 59 | 11 | 0 | 0 | none | no label (needs 3 more) |
| first 250 workouts | 114 | 23 | 2 | 1 | 1 / 0 / 0 (+1 not tested) | no label (needs 1 more) |
| first 350 workouts | 186 | 26 | 3 | 2 | 2 / 1 / 0 | Improving |
| first 500 workouts | 288 | 32 | 5 | 2 | 1 / 2 / 1 (+1 not tested) | Holding steady |
| first 800 workouts | 415 | 37 | 7 | 5 | 4 / 2 / 0 (+1 not tested) | Improving |
| all 1,209 workouts | 526 | 45 | 12 | 7 | 6 / 5 / 1 | Improving |
| first 12 months (436 workouts) | 245 | 30 | 5 | 2 | 0 / 3 / 0 (+2 not tested) | Holding steady |
| first 24 months | 412 | 37 | 7 | 5 | 4 / 2 / 0 (+1 not tested) | Improving |
| first 36 months | 469 | 40 | 11 | 7 | 6 / 3 / 1 (+1 not tested) | Improving |

- **The label rule does not change with history; eligibility does.** What limits a new or light user is
  the 6-session gate on a single subject, not the label bar. At about 100 workouts none of 11 subjects
  has 6 sessions (21 sessions across 11 subjects), so there is no headline, only what is missing.
- **At 4 years the headline can still be thin.** The first 500 workouts give 5 eligible subjects in 2
  groups and a `Holding steady` that rests on 1 up, 2 no clear change and 1 down. It moves to `Improving` at
  800 workouts. The counts sentence shows this; the label does not hide it.
- This athlete is a heavy lifter (about half the rows are Load). An athlete who lifts less will qualify
  fewer subjects at the same workout count.
- **No floor on the number of groups.** A floor of 3 groups would have withheld the label until about
  800 workouts here. It is not adopted; the cost is a label from as few as 2 groups, visible in the
  counts.
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

Each is a synthetic history and the honest answer. These become tests; the real export is then used to
check that none of them is silently wrong.

1. **Too few sessions**: 5 sessions of one lift gives no verdict and the shortfall "needs 1 more
   session (has 5, needs 6)".
2. **Steady rise**: 6 sessions of e1RM rising about 10% in total gives `up`, with the window dates.
3. **Same-day duplicates**: two entries on one day count as one session, the better one.
4. **Mixed rep schemes**: a 1RM and a 5RM whose e1RMs agree produce `no clear change`, never `down`.
5. **Lower is better**: a benchmark time falling 10% gives `up`; rising 10% gives `down`.
6. **Noise stays noise**: a series alternating about ±6% around a constant gives `no clear change` at
   every point from the first eligible one onward (the stability case; the highs are equal, so none is
   a record).
7. **A light day**: the recent window includes one sub-maximal session but the same best as before,
   so `no clear change`.
8. **Stale subject**: eligible, latest session 14 months ago, so it keeps a verdict on the list but is
   excluded from the headline and the front door.
9. **RX and Scaled** of the same subject are never merged.
10. **Unreadable schemes**: rows with no readable rep scheme are absent from the series and counted in
    the coverage line.
11. **Aggregate shortfall**: with 2 eligible subjects there is no label, only "needs 1 more".
12. **Aggregate label**: 7 movement groups (one subject each) with 3 up, 3 flat, 1 down give net +0.29
    and `Improving`; the mirrored counts give `Declining`. Two subjects of one family, one up and one
    flat, together weigh the same as one subject alone (so the group counts as half up).
13. **Independence from body data**: the verdict is identical with and without scans, weigh-ins or
    periods.
14. **A build cycle**: a 195 test, then four sessions at 145 for 3 over twelve weeks, with no rep max
    named, reads `not tested since` ("last tested ... at 195"), never `down`.
15. **End-of-cycle test**: after that build, a 3RM that estimates to 200 reads `up` (a record, +2.6%),
    even though it is under 5%.
16. **A failed test**: an explicit "3RM" in the recent window that estimates 175 against a previous best of
    195 reads `down`.
17. **Not a record**: a session 1.5% above the previous best (195 to 198) is `no clear change`; one 2.6% above
    (195 to 200) is `up`.
18. **Benchmarks**: a time 10% worse reads `down` with no test marker; a time 10% better reads `up`.
19. **The PR flag is ignored**: setting it on every session changes no verdict.
20. **Label bar**: 2 of 7 groups up, the rest `no clear change`, none down, reads `Holding steady`; 3 of 7
    up reads `Improving`. The same rule applies to an athlete with 3 groups.
21. **Facts line, 2 to 5 sessions**: a subject with 5 sessions (latest 185 est. in Aug 2026, previous 175 est. in
    Mar 2026) shows "Latest 185 lb est. (Aug 2026), previous 175 lb est. (Mar 2026), +10 lb. Needs 1 more
    session for a verdict." It shows no verdict word, no percentage and no pill, and it is not counted in the
    headline.
22. **Facts line, 6 or more sessions**: a subject with 6 sessions shows its verdict and no facts line.
23. **Single session**: a subject with 1 session shows "1 session (Dec 2023)" and "Needs 5 more sessions
    for a verdict", and no comparison.
24. **Facts line, benchmarks**: a time benchmark with latest 877 s and previous 827 s shows "Latest 14:37,
    previous 13:47, 0:50 slower". A Rounds + Reps benchmark without a known reps-per-round shows both
    scores and no difference; Cindy shows a difference in reps.
25. **Stale facts line**: a subject with 3 sessions whose latest is 14 months ago shows the line with "last
    logged" and the month, and the coverage line still counts it among those without a verdict.
26. **Coverage**: with 45 subjects, 12 with a verdict and 33 without, the coverage line says "33 more lack
    enough sessions", and facts lines appear for 17 of them.
27. **Real-export check** (manual): run the rule on the real export and confirm the stability numbers
    in section 2 are in the same range before any threshold is trusted.

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
   **Decided:** a best-fit line is drawn on the lift chart as a visualisation only, and does not change any
   verdict. The early read for subjects with 4 or 5 sessions is **not** built. **Open:** which series the line
   is fitted to and over what span. The current chart plots raw loads by rep scheme as unconnected points on
   purpose (a 165 lb 5RM and a 165 lb single are different data), while the verdict is on estimated 1RM, so a
   line on the raw chart would either mix schemes or describe a different series than the verdict.

**Still open**

3. **Family weighting changes the label, and the label is fragile (measured).** Subjects are mapped to
   families with the existing lexicon (`findMovements` on the subject name, then `familiesOf`, first
   family; a clean-and-jerk counts as a clean; Bench Press and Thruster have no family and stand alone;
   every lift subject in the sample resolved). At the recommended setting (3 per side, 5%):

   | Weighting | Groups | Up / flat / down | Net | Label |
   | --- | --- | --- | --- | --- |
   | Per subject | 12 | 5 / 6 / 1 | +0.33 | Improving |
   | **Per family** | 7 | 2.17 / 3.83 / 1.00 | **+0.17** | **Holding steady** |

   The 12 eligible subjects fall into 7 groups: squat (Back Squat flat, Front Squat up), snatch
   (Snatch flat, Power Snatch up), clean (Clean & Jerk flat, Clean up, Power Clean up), press (Shoulder
   Press flat, Push Press up), and Deadlift, Bench Press and Nancy alone. The Olympic variants made
   up 5 of 12 subjects but 2 of 7 groups, and four of the five "up" subjects sit in families that also
   have a flat member, which is why the net halves.
   Across settings the same comparison gives: 2 per side, 5% (17 subjects, 9 groups): +0.35
   Improving per subject, +0.31 Improving per family; 3 per side, 8%: +0.33 per subject, +0.26 per
   family, both Improving. So only the recommended setting changes label, and by a margin of one
   subject: one more flat subject turning up is +0.14 and flips it back. **With 7 groups, a single
   subject's change moves the label.** Two consequences to decide:
   Decided: weight by family, as the more honest picture, and one label tier for everyone with the
   counts beside it (section 4), not a lower-confidence wording below a number of groups.

4. **Verdict states: decided.** Lifts have four verdicts (`up`, `no clear change`, `not tested since`,
   `down`) so a training cycle is not read as a decline. Estimated 1RM from any set is a lower bound on
   what the athlete can do, so only `up` can come from any session; `down` needs a max-effort session in
   the recent window. Rejected: a last-session check (it flags nearly every athlete mid-cycle), and
   filtering the series to tests only. Measured on the sample, 215 of 526 Load rows (41%) are working
   sets read from "5x3"-style notation, 77 are ladders, 24 name an explicit rep max and 210 have no
   readable scheme; tests only would leave 87 of 246 counted lift sessions and 6 of 12 subjects.

   **Threshold and record: decided.** `up` is a window change of 5% or more, or a record (section 2).
   **Span display: recommended, not yet decided**: the signed change always shown, and each window's span
   shown with the verdict with a "long gap" note past 24 months. Spans measured on the same 12:

   | Rule | Verdicts | Too spread out | Net, label |
   | --- | --- | --- | --- |
   | Base: 5% | 12 (5 up / 6 flat / 1 down) | 0 | +0.17 Holding steady |
   | Each window spans at most 365 days | 2 | 10 | no label |
   | Each window spans at most 730 days | 10 (3 / 6 / 1) | 2 | +0.07 Holding steady |

   A 365-day cap is not workable at this logging density: four sessions of a typical lift span more than
   a year. A 730-day cap withholds only Power Snatch and Power Clean (about three years each). Lowering
   the threshold to 3% loosens the rule, not tightens it: reversals rise from 3% to 9% and Back Squat
   (+3.9%) and Deadlift (+4.4%) become `up`, both inside the 6.9% median session-to-session movement.

5. **Scaled to RX**: an athlete who moves from Scaled to RX gets two thin subjects instead of one
   continuous history. Merging is unsafe (different loads); leaving them apart is simple but hides
   progress.
6. **Benchmarks**: in the sample only Nancy has more than 4 sessions (7), so benchmarks will mostly read
   "not enough sessions yet" under any rule that is steady. That is the honest answer, but the headline
   will be lifts in practice.

## 8. How the numbers above were measured

Throwaway tests (not committed) loaded `public/sample/sugarwod-sample-export.csv` through the real
parser, built subjects with `buildLiftSubjects` (reps up to 8) and `buildBenchmarkSubjects`, collapsed
same-day entries, and replayed each rule at every point of each subject's history to count verdict
changes. The numbers describe one export; they are not a validation.
