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

> **Decided (A3).** Merged into A2: one body-context line under a subject's A1 verdict, using whatever
> body data the athlete has (bodyweight, or InBody lean/fat). The causal labels `plateaued_body_comp`
> and `plateaued_other` are **dropped**; the app states what the body did and the athlete draws the
> conclusion. "Stalled" is not its own state, it is A1's "flat".

**A3. If a lift stalled, is body composition a plausible reason?**
Decision: whether to look at food and recovery or at programming.
Today: `plateaued_body_comp` vs `plateaued_other`.
Needs: A1's verdict plus a body-composition change that beats noise. This is a refinement of A1, not
an independent question.

### B. About the whole athlete

> **Decided (B1).** Dropped as its own question. The aggregate headline from A1 (with its coverage,
> e.g. "improving in 9 of 14") carries the whole-athlete read, with the same body-context line as A2
> underneath at whole-athlete level. `aligned` / `tension`, the alignment window and its gates go.
> Contradictory signals are stated as two plain facts, not labelled. A period's type (cut, bulk,
> maintain) names the context ("during your cut") and never changes a number, which is the existing
> rule that periods never change a result.

**B1. Are my lifts and my body composition telling the same story?**
Decision: whether the current approach is working overall.
Today: alignment (`aligned` / `tension`), a rollup of A3 across lifts.
Needs: several classified lifts and a single shared window. Currently its window is the union of
per-lift windows, which is the weakest part of the design.

> **Decided (B2).** An internal foundation under A2, not a question the athlete asks, so it gets no
> view of its own beyond Body Comp. The method behind a band (measured or default) is abstracted away
> from the athlete: the copy stays the single generic "within normal scan variation" sentence and
> never names how the band was estimated. Copy must still not claim the band was measured from the
> athlete. Manual weigh-ins may give bodyweight a measured band later; thresholds stay in
> `insightConfig.ts`.

**B2. Is my body composition change real?**
Decision: whether to believe a number on a scan.
Today: noise bands (`paired-scans`, `residual`, `default`) used by everything else; shown on Body Comp.
Needs: scan history. At realistic scan cadences (months apart) it is always the `default` band, so
this is really a fixed tolerance, and should be labelled as one.

### C. About a span of time

> **Decided (C1).** Dropped. Free-form Compare (arbitrary A-vs-B ranges) goes, along with its window
> picker and `compareWindows.ts`; its use cases are covered by D1 (a named change, pre vs post) and C2
> (a block). Chart drag-to-select may stay as a quick way to start a period, not as a comparison.
> The "same season, different years" idea is **not** pursued: the data is read over a broad range of
> time, and the aim is to be as useful as possible with as little data as necessary.

**C1. What changed between this span and that one?**
Decision: open-ended: "what did that summer do to me".
Today: Compare tables (per lift, per benchmark, per body-comp metric).
Needs: two windows, same evidence rules as A1. Rows with too little data say so and show no numbers.

> **Decided (C2).** Merged into D1: a period gets one detail view with two parts. "What it was": span,
> logged workouts per week and focus lifts (needs SugarWOD only). "What it did": A1's session-based
> verdict across the span and against what came before, with the A2 body-context line. No separate
> cycle report, one engine, one set of gates. Automatic cycle detection stays deferred.

**C2. What happened during that block?**
Decision: retrospective on a bulk, a cut or a programming cycle.
Today: cycle report (volume, focus lifts, lift changes with attribution, body-comp change).
Needs: a span, plus C1's evidence restricted to that span. Today this is a separate pipeline that
calls relative strength rather than sharing C1's rules.

### D. About something I changed

> **Decided (D1).** D1 is A1's logic applied to a period, session-based, with the verdict **separated
> from body composition**. The "before" side is the sessions immediately before the period (not all
> earlier history); the manual `baselineStart` leaves the normal path and stays only if it earns its
> place. The verdict needs SugarWOD only and states its coverage; the A2 body-context line sits
> beside it when body data exists and says so when it does not. Injury and travel stay context only,
> a cut keeps its "a decline is expected" note. Consequence: A1 is the foundation for A2, B1, C2 and
> D1, so its definition (series, real-change rule, aggregation, coverage) is specified before any of
> them is built.

**D1. Did the thing I tried work?**
Decision: keep it, drop it, or repeat it.
Today: period verdict (`improved`, `declined`, `no_change`, `mixed`, `insufficient_data`) against
earlier history or from `baselineStart`.
Needs: a dated change, a "before" span, an "after" span, and C1's evidence on both. The verdict is C1
with a name attached and a summary sentence.

> **Decided (D2).** Context only, for **all** period types. A note attaches to any A1 verdict (per
> subject or aggregate) when the sessions behind it overlap a period, names the period, and never
> changes a number or a gate.
>
> **Open (period types).** Whether periods keep a strict list of types (`TAG_GROUPS`) or become
> open-ended, and how that feeds verdicts, is to be re-evaluated. What the verdict logic actually
> needs is small: whether a period is *something the athlete changed* (gets a before/after verdict) or
> *something that happened* (context only), plus an optional marker for a cut so its "a decline is
> expected" note keeps working. A free-text name could carry everything else. Settle this before the
> period form is rebuilt; it does not block A1.

**D2. What was going on when that result happened?**
Decision: not blaming a plateau on training when the athlete was injured or travelling.
Today: period tags add notes (`tagNotes`) when they overlap a plateau or alignment window; periods
shade charts.
Needs: periods as context only. Never changes a result (already a rule).

## Gaps: questions nothing answers today

These came from reading what an athlete has in the export, not from any pipeline. Candidates, not
commitments.

- **Decided (G1).** Kept, and it is the **front door** of Insights: the A1 aggregate headline with
  its coverage, then the subjects that moved (both directions) with their A2 body-context line, or one
  plain sentence when nothing cleared the real-change rule. "Lately" is **session-based by default**.
  A fixed-period option (30, 60 or 90 days, values to settle) is reserved. It only changes which
  sessions are eligible; the same real-change rule and minimums apply, a subject without enough
  sessions in the period says so, and the view always states which window it is showing, so it
  cannot silently disagree with the session-based verdict.
- **G1. What has moved lately?** Today the athlete must pick a lift or a range. A short "what changed
  since you last looked" read across everything, without choosing, is the natural front door.
- **Decided (G2).** Kept as **neutral exposure facts on the subject list**, with no separate view and
  no "neglected" label: last logged date, sessions in the last year, and the gap since the last
  session, sortable by longest since last logged. The same facts name the shortfall when a subject
  cannot get a verdict ("1 session in the window, 3 needed").
- **G2. Which lifts am I neglecting?** Lift frequency over time (exposure), which cycle reports
  compute internally but nothing shows on its own.
- **Decided (G3).** Dropped, as a computed insight and as a side-by-side. Most athletes train about the
  same amount week to week and month to month, so volume next to a verdict does not help anyone.
  **Follow-on (decided):** logged workouts per week is also removed from a period's "what it was"
  part, amending C2. Focus lifts stay.
- **G3. Does my consistency show up in results?** Workouts per week against outcome. The data to do
  this is already there; the honest answer is likely "can't tell" for most athletes.
- **Decided (G4).** Dropped. Strength per body mass is an accepted convention for lifts but there is
  none for benchmark times (the direction depends on the workout, and the prescribed load is fixed),
  and A1 already answers "am I getting faster". The A2 mass-attribution qualifier applies to
  load-scored lifts only; benchmarks get the A1 verdict without it. The aggregate headline's
  body-context line still states body changes as plain facts.
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
