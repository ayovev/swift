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

- `up` if change ≥ +5%, `down` if change ≤ −5%, else `flat` (*tunable*).
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
- **Counts** `up`, `flat`, `down` and `eligible`; the headline always shows them with coverage:
  "improving in 5 of 12 lifts and benchmarks (6 holding, 1 down). 33 more lack enough sessions."
- **Label** from `net = (up − down) / eligible`: `Improving` if net ≥ +0.25, `Declining` if net ≤ −0.25,
  else `Holding steady` (*tunable*). With fewer than 3 eligible subjects there is no label, only the
  shortfall. On the sample this gives 5 up, 6 flat, 1 down of 12, so net +0.33, `Improving`. Under
  the current rule it was 18 of 29 up, which is the optimism the stricter rule removes.
- **Known skew**: 5 of those 12 are Olympic variants (Snatch, Power Snatch, Clean, Power Clean,
  Clean & Jerk), so equal weight per subject leans toward them. See "Open decisions".

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
4. **Mixed rep schemes**: a 1RM and a 5RM whose e1RMs agree produce `flat`, never `down`.
5. **Lower is better**: a benchmark time falling 10% gives `up`; rising 10% gives `down`.
6. **Noise stays noise**: a series alternating about ±6% around a constant gives `flat` at every point
   from the first eligible one onward (the stability case).
7. **A light day**: the recent window includes one sub-maximal session but the same best as before,
   so `flat`.
8. **Stale subject**: eligible, latest session 14 months ago, so it keeps a verdict on the list but is
   excluded from the headline and the front door.
9. **RX and Scaled** of the same subject are never merged.
10. **Unreadable schemes**: rows with no readable rep scheme are absent from the series and counted in
    the coverage line.
11. **Aggregate shortfall**: with 2 eligible subjects there is no label, only "needs 1 more".
12. **Aggregate label**: 12 eligible with 5 up, 6 flat, 1 down gives `Improving` and the sentence in
    section 4; the same counts mirrored give `Declining`.
13. **Independence from body data**: the verdict is identical with and without scans, weigh-ins or
    periods.
14. **Real-export check** (manual): run the rule on the real export and confirm the stability numbers
    in section 2 are in the same range before any threshold is trusted.

## 7. Open decisions

1. **Minimum sessions per side**: 3 (recommended, 12 eligible in the sample) or 2 as an "early read"
   (17 eligible, but verdicts flip more). "As little data as necessary" argues for 2; the stability
   numbers argue for 3.
2. **Equal weight per subject, or per movement family?** Counting each family once would stop the
   Olympic variants dominating, but needs the lexicon's families applied to subject names and a rule
   for combining variants into one family verdict.
3. **Threshold and window**: 5% and N ≤ 4 are the recommended values; 8% is steadier but calls
   about three quarters of everything `flat`.
4. **Scaled to RX**: an athlete who moves from Scaled to RX gets two thin subjects instead of one
   continuous history. Merging is unsafe (different loads); leaving them apart is simple but hides
   progress. Not decided.
5. **Alternative estimator**: a robust trend line (for example Theil-Sen) over the last six or so
   sessions would use every session instead of two windows. Not tested here; worth trying on the real
   export before settling.
6. **Benchmarks**: in the sample only Nancy has more than 4 sessions (7), so benchmarks will mostly read "not enough
   sessions yet" under any rule that is steady. That is the honest answer, but the headline will be
   lifts in practice.

## 8. How the numbers above were measured

A throwaway test (not committed) loaded `public/sample/sugarwod-sample-export.csv` through the real
parser, built subjects with `buildLiftSubjects` (reps up to 8) and `buildBenchmarkSubjects`, collapsed
same-day entries, and replayed each rule at every point of each subject's history to count verdict
changes. The numbers describe one export; they are not a validation.
