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

- **Record**: a recent session at least 1% better than every earlier session of the subject (*tunable*).
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
  history (not with the previous four sessions, which may sit in a trough) and needs a 1% margin
  over every earlier estimate, so a session that is 0.3% higher by rounding does not count.
- **5% or a record (decided)** keeps 5% as the way to recognise a recovery from a trough, and adds records
  on top. Against "3% or a record" it differs on exactly one subject, Back Squat: its window change is
  +3.9%, its best recent session (232) is only 0.9% above its 2023 best of 230, and its last two
  sessions are 215 and 212, so `no clear change` is the accurate reading. The reversal counts
  (0% to 3% across the five rules) are 0 to 4 events out of 140 pairs and cannot rank them. The
  worked data for every subject is in [`insights-a1-sample-trace.md`](insights-a1-sample-trace.md).
- **The 1% record margin is arbitrary at its edge.** Snatch (141 against 140, `up`) and Shoulder Press
  (138 against 136, `no clear change`) both round to +1.0%, one just over the margin and one just
  under. A larger margin (2% would keep Deadlift +4.0%, Push Press, Power Snatch, Clean and Power
  Clean as records and drop Snatch) would remove the knife-edge. Not decided.
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

## 4. Aggregate (the headline)

- **Population**: eligible, recent subjects. Each subject counts once, so a lift logged 37 times
  weighs the same as one logged 8 times.
- **Counts** `up`, `no clear change`, `down` and `eligible`, plus how many are `not tested since`;
  the headline always shows them with coverage: "improving in 7 of 12 lifts and benchmarks (4 no
  clear change, 1 down). 33 more lack enough sessions." Subjects that are `not tested since` are
  left out of the net, because they carry no information about direction, and are named in the
  coverage line ("2 lifts not tested recently").
- **Label** from the family-weighted `net = (up − down) / groups`: `Improving` if net ≥ +0.25,
  `Declining` if net ≤ −0.25, else `Holding steady` (*tunable*). With fewer than 3 eligible subjects
  there is no label, only the shortfall. On the sample (7 up, 4 no clear change, 1 down across 7
  groups) the net is +0.38, so `Improving`; with 5% alone it was +0.17, `Holding steady`. Under
  the previous rule it was 18 of 29 up, which is the optimism the stricter rule removes.
- **Family weighting** (measured, see section 7): each movement family casts one vote, split equally
  among its eligible subjects, so Snatch and Power Snatch together weigh as much as Deadlift alone.
  The net share uses these weights; the sentence still counts subjects.

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
17. **Not a record**: a session 0.5% above the previous best is `no clear change`.
18. **Benchmarks**: a time 10% worse reads `down` with no test marker; a time 10% better reads `up`.
19. **The PR flag is ignored**: setting it on every session changes no verdict.
20. **Real-export check** (manual): run the rule on the real export and confirm the stability numbers
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
   - Weight by family, as the more honest picture (recommended).
   - Treat the one-word label as low-confidence below roughly 10 groups, or drop it in favour of the
     counts sentence alone. This conflicts with wanting a direct answer to "is my performance
     improving?", so it is your call.

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
