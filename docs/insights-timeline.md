# Insights timeline

**Status: draft, nothing built.** What used to be called periods (stored as tags, and before that experiments). An athlete lays
**entries** on a **timeline**: things they changed and things that happened. An entry sits beside the verdicts it overlaps for
context. It never changes a number, a gate or a label, and the app never says an entry caused a result. This replaces the
12-type list. Items marked **decided** were settled in conversation; items marked **proposed** await an answer. Cases are the
TLN group in [`insights-a1-acceptance.md`](insights-a1-acceptance.md).

## Decided: the model

An entry has three independent parts.

1. **Initiation (required).** **I changed it** (something the athlete chose or decided) or **It happened** (something that came
   to them). It is the only part a rule reads: an "I changed it" entry gets a before/after verdict; an "It happened" entry is
   context only.
2. **Domain (required), the same five for both:** Training, Nutrition, Health, Travel, Other.
   A domain groups and filters entries and drives no rule.
3. **Dates.** A **start date** is required. The **end date** is optional: a date (not before the start) or **ongoing** (no end
   yet). A single day is an end equal to the start. The app never invents an end.

An entry also has an optional name in the athlete's own words ("Spring cut", "Shoulder tweak") and an optional note.

| Domain | I changed it, for example | It happened, for example |
| --- | --- | --- |
| Training | new program, new cycle, deload, a change of focus | a coach changed the plan |
| Nutrition | cut, bulk, a new diet | |
| Health | more sleep, a therapy, a rest week | injury, illness, surgery |
| Travel | a planned trip | a work trip, two weeks abroad |
| Other | a new work pattern, anything else | a move, a family change, anything else |

The two axes are independent: a planned holiday and a forced work trip are both Travel and differ in initiation. Work, family and schedule changes go under Other, with a name.

### What an open end means

- The "after" side of an "I changed it" verdict runs from the start to the reference date and reads "so far". Its "before" side is
  the sessions immediately before the start, as already decided.
- Any verdict whose span overlaps the entry gets a note naming it, so an entry left open keeps attaching to every row from its
  start to today. The entry itself reads "Ongoing since Mar 2026", which makes it easy to close.

### What happens to the old twelve types

| Old type | Becomes |
| --- | --- |
| cut, bulk, maintain, nutrition | I changed it, Nutrition |
| programming, cycle, deload | I changed it, Training |
| recovery | I changed it, Health |
| experiment, other | I changed it, Other |
| injury | It happened, Health |
| travel | It happened, Travel |

Old records are read through this table; nothing needs the athlete's attention.

### The cut note is gone

"A decline during a cut is expected" existed because the app could not see body weight. A row now states body weight over its
span, so the note adds nothing. No type-specific wording or behavior is left.

## Decided: the entry form

One form, classify first. Mockup: the Timeline Entry Form artifact. Cases A1-TLN-11 to A1-TLN-17.

- **Order:** what kind of entry is it; what does it touch; starts; ends; name; note.
- **Kind:** two cards, each stating its consequence. "Something I changed": "You chose or decided it. It gets a before and after
  comparison." "Something that happened": "It came to you. It is shown beside your results for context."
- **Area:** five one-word chips: Training, Nutrition, Health, Travel, Other. "Health and recovery" and "Travel and schedule" were
  lumped: the kind already separates a chosen change (more sleep) from something that happened (an injury), and a coarse label
  costs nothing because an area drives no rule.
- **Ends:** one date field and an **Ongoing** checkbox, ticked at first with the date greyed out. Unticking enables the date, which
  starts empty. A single day is the start date entered again; no hint says so.
- **Nothing is pre-selected,** including the start date, so a hasty tap cannot misfile an entry.
- **Name** is optional. Its placeholder follows the two choices ("e.g. Spring cut" for Something I changed and Nutrition; "e.g.
  Shoulder tweak" for Something that happened and Health), and reads "e.g. Spring cut, Shoulder tweak, Two weeks abroad" before
  both are chosen. The placeholders are hints and map to nothing. An unnamed entry reads by its area ("Nutrition").
- **Note** is optional, up to 200 characters.
- **Rejected with a plain sentence,** all failing rules listed and nothing saved: "Choose whether you changed it or it happened."
  "Choose what it touches." "Add a start date." "The start date is after today." "Add an end date, or tick Ongoing." "The end date
  is before the start date." "The note is over 200 characters."

## Decided: names, in the app and in the code

- **Athlete-facing:** the view is **Timeline** and each item is an **entry**. "Period", "tag", "experiment", "cycle" and "block" do
  not appear in copy. The kinds are labelled "Something I changed" and "Something that happened". "Changes" is not used as the
  noun because "change" is already A1 vocabulary ("No clear change", "+8.8% change").
- **In the code, storage and wire format too,** so the two do not drift. This reverses the rule in `CLAUDE.md` that keeps `tag` in
  code, storage key and wire name to avoid a migration; that section is updated in the change that does the rename. Proposed names:
  type `TimelineEntry`, tab id `timeline`, `TimelineTab.tsx`, `timelineStorage.ts`, dataset `timeline`, storage key
  `"timeline-entries"`.
- **The old names stay readable.** `"context-tags"` in storage is moved into the new key on load (written, read back, then removed, as
  `legacyExperiments.ts` does). A backup or sync that still names `tags` is accepted and folded into `timeline`, as `experiments`
  already is: receive-only, never sent. Both devices need the current build, since an older build rejects a manifest naming a
  dataset it does not know.

## Decided: the Timeline view

Mockup: the Timeline View artifact. Cases A1-TLN-18 to A1-TLN-27. It replaces the earlier plan to write entries on each verdict row
(a text line naming what was running at each best): on the bundled sample the verdict spans run for years, so most entries overlap
most rows, and text cannot show that. A timeline can, so **rows carry no entry text** and nothing computes "overlap".

- **One time axis, two bands.** Entries are stacked in lanes on top; the verdicts are lanes below.
- **Entries.** Each entry is a bar across its dates, labelled with its name (inside the bar if it fits, beside it if not, and to its
  left if it would run off the right edge). Entries that overlap in time sit in separate lanes, so overlapping spans are visible
  without any rule. **I changed it** is a solid blue bar; **It happened** is a dashed outline. The area (Training, Nutrition, Health,
  Travel, Other) appears only in the detail. An ongoing entry runs to the right edge with an arrow. A single day is a marker.
- **Verdict lanes.** One lane for each subject listed in Up, Down, Not tested since and No clear change, in the front door's order
  (so none for Fewer than 6 sessions or Not recent), plus a lane for each move up to RX. A lane is a line from the date of the
  previous best (dark dot) to the date of the recent best (blue dot), coloured by state: blue Up, red Down, amber Not tested since,
  grey No clear change. The state and change are written beside the line. A move-up is a line from the last Scaled session to the
  first RX session, labelled "Moved up to RX".
- **Opening a subject.** Selecting a verdict lane shows that subject's sessions as dots on the same axis: previous-window sessions dark,
  recent-window sessions blue, the others faint, each dot the best result of a day, the two bests labelled with their values. A
  benchmark's faster results are drawn higher. One subject is open at a time.
- **Opening an entry** shows its kind, area, dates ("ongoing" when it has no end), note, and edit and delete. An "I changed it" entry
  also shows its before and after verdict (designed separately); an "It happened" entry shows none.
- **Range:** All, Last year, Last 6 months, ending today. Not saved. Entries and lines are clipped to the range; a subject wholly outside
  it reads "Outside this range".
- **Add to timeline** opens the entry form.
- **On the front door,** a closed row carries no link and no entry names. A row opens to its chart, and under the chart of a subject
  that has a lane on the Timeline sits a **See on timeline** link that opens the Timeline with that subject's sessions already shown.
  The Timeline is that chart drawn with the entries on the same axis, which is why the link sits there. A row with a facts line
  (Fewer than 6 sessions) or a Not recent row has no lane and its opened chart carries no link. Chosen over a small icon on every row
  (one glyph and a second tap target per row), and not hidden until hover, which would be invisible on touch.
  **A move-up row does not open:** its Scaled and RX sessions are different tasks, so a chart of them would not be like for like. It has
  a lane on the Timeline but no link from the front door.
- **An entry never changes a number:** adding, editing or deleting one changes no verdict, pill, label, count or body-context line.

## Decided: the Timeline page composition

Mockup: the Timeline View artifact. Cases A1-TLN-28 to A1-TLN-31.

- **One page, one detail slot.** The chart is at full width and a single **Selected** panel sits beneath it (on a phone it scrolls into
  view when something is selected). The panel holds one thing at a time: a hint when nothing is selected ("Select an entry or a
  subject on the chart, or add to the timeline."), an entry's detail, or a subject's detail.
- **The form is a dialog.** "Add to timeline" opens it, and Edit in an entry's detail opens the same dialog prefilled. Saving closes it
  and selects the entry. On a phone it is full-screen. Cancel, Escape and a click outside close it without saving.
- **Delete is behind a confirmation** that names the entry and says the workouts are not affected, as "Start over" does.
- **A click on an empty spot in the entries area** opens the form with that day as the start date. It is a shortcut, never the only way.
- Rejected: separate pages for detail and form (they lose the axis, and reading an entry's verdict while seeing where it sits among the
  others is the point), everything inline (the overcrowding the old Periods tab had), and a side panel (it squeezes the axis).

## Decided: an entry's own before and after verdict

Only an "I changed it" entry has one. Mockup: the Timeline Entry Detail artifact. Cases A1-TLN-32 to A1-TLN-40.

1. **Windows.** For each subject, **during** is the sessions dated from the entry's start to its end (to the reference date for an ongoing
   entry, which reads "so far") and **before** is the sessions dated before its start. `N = min(4, during, before)`; the last N sessions
   on each side are compared and the subject needs `N` of at least 3. State, change, record and the Down versus Not tested since rule are
   A1's, unchanged. No separate recency rule is needed, since a subject needs 3 sessions inside the entry to qualify. A move up to RX
   dated inside the entry counts as one Up vote.
2. **The summary** reuses the headline label and counts sentence: "Improving in 3 of 4 lifts and benchmarks (1 no clear change).",
   with Not tested since subjects left out ("Left out: 1 not tested since."). Fewer than 3 counted subjects give no label.
3. **When there is no verdict,** "No before and after yet", a shortfall sentence ("Needs 3 lifts or benchmarks with at least 3 sessions
   during this entry and 3 before it, has 2. Closest: Fran (Scaled), 2 more during; Nancy (Scaled), 2 more during."), and **facts
   lines** (no pill or percentage) for subjects with a session on each side, five shown and "and N more".
4. **Body weight, once,** over the entry's own span, with the existing reading rule and noise band and no sentence relating it to the
   verdict. This is allowed here and not on the headline because an entry has one span.
5. **Overlapping entries are named** ("Overlaps: Two weeks abroad"), because one entry has one span. Overlap means the entry's dates
   intersect this entry's (to today for an ongoing one).

An "It happened" entry shows no before and after ("None. Something that happened is shown beside your results for context and gets no
before and after comparison.") but still shows its body weight line and overlaps.

**Measured on the sample** (8 demo "I changed it" entries, all 45 subjects): First bulk 3 subjects reach a verdict, First cut 4, Started
5/3/1 5, 5/3/1 cycle 2 0, Maintenance block 0, Protein-forward diet 2, Tracking sleep 0, Current block 1. Only 3 of 8 reach the 3 a summary
needs, and lowering the per-side gate to 2 changes none of them, because few sessions are logged inside a 3-month span. The facts lines
exist for that case. The sample is synthetic; the real export is the check (A1-MAN-01).

## Decided: two things removed

- **`baselineStart` is dropped.** It was a manual date for where the "before" side starts. The windows are session-based now (the last N
  sessions before the entry's start, N at most 4), so there is no long stretch of history to trim; on a sparse log, moving the date later
  only shrinks the window below the minimum and turns the verdict into a shortfall; it invites tuning the comparison until it looks right,
  against the app staying descriptive; and the entry form has no such field. Where an athlete wants the "before" to ignore something, the
  long-gap note and the overlapping entries named in the detail already show it. A stored `baselineStart` is read and ignored and is
  dropped on the next save; nothing is migrated for the athlete. A1-TLN-41.
- **Focus lifts are dropped.** The entry detail already shows which lifts it concerned: with a verdict, the list of subjects compared are
  the lifts trained at least 3 times during the entry; without one, the facts lines list the subjects with a session on each side. A
  separate chosen field would add a fiddly form control and a derived line would repeat the same names. If it is missed, one derived
  line ("Trained most during this entry: Snatch (5 sessions), Front Squat (4).") is the smallest thing to add. A1-TLN-42.

## Proposed

Nothing in the Timeline awaits an answer. Open elsewhere: the real-export check (A1-MAN-01, A1-MAN-02) and merging RX and Scaled for lifts.
