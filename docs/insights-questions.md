# Insights: questions first

**Status: draft for markup.** Nothing here is decided. The goal is to agree on the questions the
Insights section has to answer before changing any data model or view. Every question below is a
hypothesis written from reading the code, not from athlete research, so strike, reword and add freely.

Scope: Progress, Compare and Periods (the Insights section), plus the pipelines under them:
`plateauDetector`, `alignment`, `relativeStrength`, `compareWindows`, `cycleReport`,
`periodVerdict` and `bodyCompNoise` in `src/lib/analytics/`.

## Why re-think this

Each pipeline was added to answer one question, and each is sound on its own. Read together, the
current shape has costs that come from being organised by pipeline rather than by question:

- **Six computations, six definitions of "the window".** Plateaus compare the last N sessions with
  the N before (N = min(3, n/2), session-count based). Relative strength looks back a fixed 365
  days. Compare uses two windows the athlete picks. Verdicts split at a date. Cycle reports use the
  block's range. Alignment uses the union of every lift's plateau window, which can span years while
  its copy says "right now". The same lift can read differently in two views for reasons the athlete
  cannot see.
- **Five eligibility gates, none shared.** Entries needed per lift: 3 (plateau), 4 (relative
  strength), 2 per window (compare), 3 per cycle (cycle report). Scans needed: 2, 2, 1, 2. They were
  each chosen sensibly, but the athlete gets a different "not enough data" answer depending on which
  view they happen to be in. On the one real export most plateau rows were "not enough data".
- **Same lift, different evidence.** All pipelines share `buildLiftSubjects`, but plateaus count
  only 1/2/3/5RM schemes while relative strength, compare and cycles accept up to 8 reps. A lift's
  history is therefore a different set of sessions in different places.
- **Three body-composition comparisons.** `computeBodyCompTrend` (nearest scans at window
  boundaries), window means (compare) and in-cycle change (cycle report) all answer "did body
  composition change?" with different mechanics. They share only the noise band.
- **Views follow the code, not the task.** Progress stacks three sections that share one gate;
  Compare folds three former views into one; Periods is a list plus a form plus badges. The
  athlete's path (what do I want to know, then where do I look) is not what organises them.
- **Only the questions that happen to have a pipeline are answered.** See "Gaps" below.

## The questions

Each entry: the question an athlete asks, what answers it today, and what has to be true to answer
it honestly. "Decision" is what the athlete would do differently.

### A. About one lift or benchmark

> **Decided (A1).** The platform's central question is the aggregate one, **"Is my performance
> improving over time?"**, and per-subject answers ("am I getting stronger or faster at X?") are the
> evidence beneath it. Keep. The verdict window is **session-based**, to cope with sparse logging.
> **Benchmarks use the same rule as lifts.** The Workouts lift chart is a visualisation of the
> series, not an answer to this question. Compare (arbitrary A-vs-B ranges) is doubted: a comparison
> earns its place only with a common thread to compare across or a distinguishing factor (pre/post);
> to be settled at C1.

**A1. Am I getting stronger (or faster) at X?**
Decision: keep, change or stop what I'm doing for X.
Today: plateau classification (last N vs previous N sessions), the lift chart on Workouts, relative
strength's raw series, compare's per-lift row.
Needs: a single per-lift series (best estimated 1RM per session, or benchmark score) and one rule for
calling a change real. Honest answer when sessions are too few: say how many more it needs.

> **Decided (A2).** Keep, as a **qualifier on A1's verdict**, not a separate view or pipeline. It uses
> A1's session-based window (no separate 365-day window or gates) and shows only when body mass moved
> by more than noise. **Manual bodyweight entries, stored over time, are enough on their own** for
> athletes without InBody data. Consequence: manual weigh-ins are a new persisted athlete dataset,
> so per the sync/backup rule in CLAUDE.md they must join sync and backup in the same change, and be
> validated like every other incoming dataset. Bodyweight only gives weight, not lean or fat mass.

**A2. Is it me, or is it my body mass?**
Decision: whether a heavier lift is training progress or just a heavier athlete.
Today: relative strength (e1RM / body mass, with attribution `strength-driven`, `mass-driven`,
`mixed`, `flat`, `declined`).
Needs: lift series, body mass at each session (exact, interpolated or nearest scan, never
extrapolated), a mass-change noise band. Only meaningful when body mass actually moved; otherwise it
collapses into A1.

**A3. If a lift stalled, is body composition a plausible reason?**
Decision: whether to look at food and recovery or at programming.
Today: `plateaued_body_comp` vs `plateaued_other`.
Needs: A1's verdict plus a body-composition change that beats noise. This is a refinement of A1, not
an independent question.

### B. About the whole athlete

**B1. Are my lifts and my body composition telling the same story?**
Decision: whether the current approach is working overall.
Today: alignment (`aligned` / `tension`), a rollup of A3 across lifts.
Needs: several classified lifts and a single shared window. Currently its window is the union of
per-lift windows, which is the weakest part of the design.

**B2. Is my body composition change real?**
Decision: whether to believe a number on a scan.
Today: noise bands (`paired-scans`, `residual`, `default`) used by everything else; shown on Body Comp.
Needs: scan history. At realistic scan cadences (months apart) it is always the `default` band, so
this is really a fixed tolerance, and should be labelled as one.

### C. About a span of time

**C1. What changed between this span and that one?**
Decision: open-ended: "what did that summer do to me".
Today: Compare tables (per lift, per benchmark, per body-comp metric).
Needs: two windows, same evidence rules as A1. Rows with too little data say so and show no numbers.

**C2. What happened during that block?**
Decision: retrospective on a bulk, a cut or a programming cycle.
Today: cycle report (volume, focus lifts, lift changes with attribution, body-comp change).
Needs: a span, plus C1's evidence restricted to that span. Today this is a separate pipeline that
calls relative strength rather than sharing C1's rules.

### D. About something I changed

**D1. Did the thing I tried work?**
Decision: keep it, drop it, or repeat it.
Today: period verdict (`improved`, `declined`, `no_change`, `mixed`, `insufficient_data`) against
earlier history or from `baselineStart`.
Needs: a dated change, a "before" span, an "after" span, and C1's evidence on both. The verdict is C1
with a name attached and a summary sentence.

**D2. What was going on when that result happened?**
Decision: not blaming a plateau on training when the athlete was injured or travelling.
Today: period tags add notes (`tagNotes`) when they overlap a plateau or alignment window; periods
shade charts.
Needs: periods as context only. Never changes a result (already a rule).

## Gaps: questions nothing answers today

These came from reading what an athlete has in the export, not from any pipeline. Candidates, not
commitments.

- **G1. What has moved lately?** Today the athlete must pick a lift or a range. A short "what changed
  since you last looked" read across everything, without choosing, is the natural front door.
- **G2. Which lifts am I neglecting?** Lift frequency over time (exposure), which cycle reports
  compute internally but nothing shows on its own.
- **G3. Does my consistency show up in results?** Workouts per week against outcome. The data to do
  this is already there; the honest answer is likely "can't tell" for most athletes.
- **G4. Benchmarks against body mass.** A2 covers lifts only. Whether it makes sense for timed
  benchmarks is an open question, not an assumption.
- **G5. What do I do with this?** The app deliberately describes and never grades. Whether a next-step
  prompt belongs here at all is a product decision, flagged rather than assumed.

## What is probably shared underneath

The question list suggests a small evidence layer that every answer reads from, instead of each
pipeline rebuilding its own. A sketch, to be argued with, not a design:

1. **Lift/benchmark series**: one list of sessions per subject (name, RX/Scaled, date, value, kind),
   built once with one rep-scheme rule.
2. **Body series**: scans with a chosen mass field, lean and fat metrics, and the noise band.
3. **Body mass at a date**: the existing exact / interpolated / nearest / unmatched rule, as a
   function the series can call.
4. **Change between two spans**: one function that takes a subject series and two spans and returns
   a change, its size, whether it clears the threshold, and a reason when it cannot say. Plateau
   (recent vs previous), compare (A vs B), verdict (before vs after) and cycle (start vs end of a
   block) all become the same call with differently chosen spans.
5. **One eligibility gate per kind of evidence**, shared, with one shortfall sentence.
6. **Context**: periods, applied as notes, never as inputs.

Whether the plateau's session-count windowing survives is the main thing step 4 forces a decision on.
It exists because real logging is too sparse for calendar windows, and that is still true.

## Decisions needed from you

1. **Which questions stay, which go?** Mark each A–D and G entry keep / drop / merge / unsure.
2. **Is A3 / B1 worth their cost?** The plateau-vs-body-comp read and the alignment rollup are the
   most inferential claims in the app and had the weakest real-data showing (mostly "not enough
   data"). Keep, demote or fold into A1?
3. **Who is the reader?** The athlete browsing, or the athlete asking a specific question? That
   decides whether G1 (a feed) or the current pick-a-lift layout is the front door.
4. **Do periods stay a first-class concept?** D1/D2 need them; the type taxonomy in `TAG_GROUPS` is
   a first draft and was not measured on real use.
5. **How much real data can we test against?** One export exists and is not committed. Anything we
   cannot test against it stays labelled as unvalidated.

## Next steps once this is marked up

1. Settle the question list (this file, edited in place).
2. For each kept question, write its acceptance cases: given this history, the honest answer is X,
   including at least one "cannot tell yet" case. These become the tests.
3. Run each against the real export by hand and cut what cannot be answered.
4. Only then draft the evidence layer and the views, and plan the migration from the current
   pipelines (the thresholds in `insightConfig.ts` carry over; the windows are what change).
