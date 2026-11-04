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
2. **Domain (required), the same five for both:** Training, Nutrition, Health and recovery, Travel and schedule, Other.
   A domain groups and filters entries and drives no rule.
3. **Dates.** A **start date** is required. The **end date** is optional: *ended on* a date (not before the start), *still
   going* (no end yet), or *a single day* (end equals start). The app never invents an end.

An entry also has an optional name in the athlete's own words ("Spring cut", "Shoulder tweak") and an optional note.

| Domain | I changed it, for example | It happened, for example |
| --- | --- | --- |
| Training | new program, new cycle, deload, a change of focus | a coach changed the plan |
| Nutrition | cut, bulk, a new diet | |
| Health and recovery | more sleep, a therapy, a rest week | injury, illness, surgery |
| Travel and schedule | a planned trip, a new work pattern | a work trip, a move, a family change |
| Other | anything else | anything else |

The two axes are independent: a planned holiday and a forced work trip are both Travel and schedule and differ in initiation.

### What an open end means

- The "after" side of an "I changed it" verdict runs from the start to the reference date and reads "so far". Its "before" side is
  the sessions immediately before the start, as already decided.
- Any verdict whose span overlaps the entry gets a note naming it, so an entry left open keeps attaching to every row from its
  start to today. The entry itself reads "Still going since Mar 2026", which makes it easy to close.

### What happens to the old twelve types

| Old type | Becomes |
| --- | --- |
| cut, bulk, maintain, nutrition | I changed it, Nutrition |
| programming, cycle, deload | I changed it, Training |
| recovery | I changed it, Health and recovery |
| experiment, other | I changed it, Other |
| injury | It happened, Health and recovery |
| travel | It happened, Travel and schedule |

Old records are read through this table; nothing needs the athlete's attention.

### The cut note is gone

"A decline during a cut is expected" existed because the app could not see body weight. A row now states body weight over its
span, so the note adds nothing. No type-specific wording or behavior is left.

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

## Proposed

Awaiting your answers; nothing below is decided.

1. **The UX.** The entry form (two required choices, then dates and an optional name), the timeline view (how entries, open ends and
   single days are drawn), and how an entry appears beside a verdict. Each is to be mocked up before it is written down.
2. **An unnamed entry** reads by its domain ("Nutrition").
3. **What "overlap" means:** the entry's dates intersect the dates from the first session of the previous window to the last session
   of the recent window.
4. **`baselineStart`** (a manual start for the "before" side) stays only if it earns its place.
5. **Focus lifts** on an entry's detail ("what it was"): chosen by the athlete or derived from the sessions inside the span.
