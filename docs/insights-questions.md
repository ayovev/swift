# Insights: questions and decisions

**Status: questions settled, nothing built.** This records the walkthrough of the Insights section
(Progress, Compare, Periods and the pipelines under them in `src/lib/analytics/`) question by
question. Each decision below was made by the maintainer; the reasoning is kept so it can move with
the code when this is built. The next piece of work is the A1 specification (see "Next steps").

## Why it was re-thought

The section was organised by pipeline (plateau, alignment, relative strength, compare, cycle report,
period verdict), not by the question an athlete asks. The costs:

- Six definitions of "the window" (last N sessions, a fixed 365 days, two typed ranges, a date split,
  a block's range, and a union of lift windows that can span years under copy saying "right now"), so
  one lift could read differently in two views for reasons the athlete cannot see.
- Five unshared eligibility gates (entries needed per lift: 3, 4, 2 per window, 3 per cycle; scans:
  2, 2, 1, 2). On the one real export most plateau rows were "not enough data".
- The same lift built from different sessions (plateaus count only 1/2/3/5RM schemes, the others up
  to 8 reps), and body composition compared three different ways.
- Causal-sounding labels (`plateaued_body_comp`, `aligned` / `tension`) resting on two scans that were
  often months apart.

## The model

**The central question is "Is my performance improving over time?"** Everything else supports it or
is context for it.

### A1. Performance verdict (foundation)

- A **subject** is a lift or a named benchmark (RX and Scaled kept separate). Per-subject answer: "am I
  getting stronger or faster at X?". The headline answer is the **aggregate** across subjects.
- **Session-based**, to cope with sparse logging: a subject's recent sessions against the sessions
  before them, never a calendar lookback. The view always states the date span the sessions cover.
- **Benchmarks use the same rule as lifts.** Because subjects have different units, the aggregate has
  to be built from each subject's own relative change, signed so that faster counts as improving.
- The aggregate **always states its coverage** ("improving in 9 of 14 lifts and benchmarks").
- One series per subject, one real-change rule, one eligibility gate, one shortfall sentence naming
  what is missing ("1 session in the window, 3 needed"). These replace the five gates above.
- A1 is the foundation for everything below. Its definition is specified and tested before any of
  them is built. The Workouts lift chart is a visualisation of the series, not an answer to A1.

### Body context (was A2, A3, B1, B2)

- One **body-context line** sits under a subject's verdict, using whatever body data exists: bodyweight
  alone, or InBody lean and fat mass. It states what the body did and the athlete draws the conclusion.
  **There is no body-context line under the aggregate headline** (decided after a three-way mockup): it would
  count one body weight change per subject over differing spans and restate the rows.
- For **load-scored lifts only**, when body mass moved by more than scan or scale noise, it also says
  how much of the lift change is mass ("about half of this is mass"). It uses A1's window, not its own.
  Benchmarks get no mass attribution (there is no convention for timed work, and the direction
  depends on the workout).
- **Manual bodyweight entries**, stored over time, are enough on their own. This is a **new persisted
  athlete dataset**: by the rule in CLAUDE.md it must join sync and backup in the same change and be
  validated like every other incoming dataset.
- The noise band is an internal foundation with no view of its own beyond Body Comp. Copy uses one
  generic sentence ("within normal scan variation") and never names how the band was estimated, and
  must not claim it was measured from the athlete. Thresholds stay in `insightConfig.ts`.
- **No causal labels.** `plateaued_body_comp`, `plateaued_other`, `aligned` and `tension` are gone.
  "Stalled" is not a state; it is A1's "no clear change". Contradictory signals are stated as two plain facts.

### Timeline (was periods; was C2, D1, D2)

The model, the 12-type replacement and the new names are in [`insights-timeline.md`](insights-timeline.md). An item is an
**entry** on a **timeline**; this section keeps the original wording of the decisions.

- An entry's detail view has two parts. **What it was**: its span and note (workouts per
  week was removed: most athletes train about the same amount, so it helps no one; focus lifts were dropped, since the verdict's
  list of subjects already shows which lifts it concerned). **What it did**:
  A1's verdict applied to the period, comparing its sessions with the sessions immediately before it,
  with the body-context line beside it, and stating plainly when body data is absent.
- The verdict needs SugarWOD only. Body composition is **never folded into the verdict**.
- "It happened" entries (injury, travel and the like) are context only and get no verdict. The cut note is gone, since a row
  states body weight. The manual `baselineStart` is dropped (see `insights-timeline.md`).
- **Context only, for every entry:** a note naming the entry attaches to any verdict (per
  subject or aggregate) whose sessions overlap it. An entry never changes a number or a gate.
- Cycle reports and automatic cycle detection are not part of this; detection stays deferred.

### Front door and subject list (was G1, G2)

- The Insights **front door** is the A1 aggregate headline with its coverage, then the subjects that
  moved (both directions) with their body-context line, or one plain sentence when nothing cleared
  the real-change rule.
- "Lately" is **session-based by default**. The fixed-period recompute was dropped: measured on the
  sample, no subject has 6 sessions inside 30, 60 or 90 days, so it would show an empty page. In its place a
  **"Logged in" filter** (All, Last month, Last 3 months, Last 6 months, Last year, Custom) chooses which subjects are listed. It is local to the subject
  list, changes no verdict, headline or chart, and says "Showing 5 of 45 subjects." (see `insights-front-door.md`).
- The subject list carries **neutral exposure facts**: last logged date, sessions in the last year and
  the gap since the last session, sortable by longest since last logged. No "neglected" label.

## What was dropped, and why

| Was | Decision | Reason |
| --- | --- | --- |
| Compare (A vs B ranges), `compareWindows.ts` | Dropped | An arbitrary pair of ranges has no frame; the real uses are a named change (periods) and a block (periods). "Same season, different years" not pursued: the data is read over a broad range with as little data as necessary. Chart drag-to-select may stay as a way to start a period. |
| Plateau causal labels | Dropped | Correlation presented as cause on a few scans. Replaced by the body-context line. |
| Alignment (`aligned` / `tension`) | Dropped | Rolled up the dropped labels; its window and gates were the weakest part. Replaced by the aggregate headline plus the rows' body context. |
| Relative-strength section and 365-day window | Folded into body context | Same question as A1 with its own window and gates. |
| Cycle report | Merged into the period detail | Same record, same engine; its unique parts were volume (dropped) and focus lifts (kept). |
| Consistency against results | Dropped | A causal claim from correlation on sparse data; volume beside a verdict helps no one. |
| Benchmarks against body mass | Dropped | No convention; direction depends on the workout; prescribed loads are fixed. |
| Next-step advice | Dropped | The app stays descriptive. If it returns, it should start from the athlete's own periods. |

## Evidence layer (sketch, not a design)

1. **Subject series**: one list of sessions per subject (name, RX/Scaled, date, value, kind), built
   once with one rep-scheme rule.
2. **Body series**: scans and manual weigh-ins, a chosen mass field, lean and fat where they exist,
   and the noise band.
3. **Body mass at a date**: the existing exact / interpolated / nearest / unmatched rule, never
   extrapolated.
4. **Change between two spans of sessions**: one function returning a change, its size, whether it
   clears the real-change rule, and a reason when it cannot say. The headline, the front door, the
   subject verdicts and the period verdict are all this call with differently chosen sessions.
5. **One eligibility gate** per kind of evidence, with one shortfall sentence.
6. **Context**: periods, applied as notes, never as inputs.

## Open items

- **A1 specification**: drafted in [`insights-a1-spec.md`](insights-a1-spec.md), with measured
  numbers and open decisions. It covers: the real-change rule (the current 3% threshold was
  tuned on one sample athlete's Back Squat and Diane), the session window size and minimums, the rep
  scheme rule (plateaus count 1/2/3/5RM, the others up to 8 reps), how a subject's relative change
  is signed and averaged into the aggregate, how coverage is stated, and how the aggregate avoids
  leaning toward the lifts the athlete retests most.
- **Entry types**: decided. Initiation (I changed it / It happened) plus five domains replace the 12 types, an end date is
  optional, and the view is renamed Timeline; see [`insights-timeline.md`](insights-timeline.md). The UX is next.
- **Filter details** for the front door (the Custom range's bounds and default end date are proposed); the control itself is decided, see [`insights-front-door.md`](insights-front-door.md).
- **Manual weigh-ins**: decided, see [`insights-body-context.md`](insights-body-context.md) and cases A1-WGH-01 to A1-WGH-14.
- **Merging RX and Scaled for lifts**: open. A lift is measured by the load lifted and the estimate does not read the RX flag, and splitting halves
  the sessions of an athlete who switches; but merging would reverse the decision that a move up to RX counts as Up, and it makes no
  sense for benchmarks. Names are decided separately: RX is unmarked and Scaled reads "(Scaled)" (A1-DSP-09). Settle on the real export (A1-MAN-01).
- **Real-export check**: written and run on the athlete's own export, see [`insights-real-export-check.md`](insights-real-export-check.md). That export is the
  same athlete as the bundled sample, so the thresholds are still validated on one athlete; a second athlete's export would be the next check.
- **Real data**: one real export exists and is not committed. Anything not tested against it stays
  labelled as unvalidated.

## Next steps

1. Write the A1 specification, with acceptance cases: given this history, the honest answer is X,
   including at least one "cannot tell yet" case. These become the tests.
2. Run each case against the real export by hand and cut what cannot be answered.
3. Settle the period-types question.
4. Then draft the evidence layer and the views, and plan the migration from the current pipelines
   (the thresholds in `insightConfig.ts` carry over; the windows are what change).
