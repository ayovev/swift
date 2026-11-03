# Insights front door

**Status: draft for review, nothing built.** The first view of Insights (today's Progress view): what is on it, in what
order, and how its one control works (a filter on the list, decided below). It reuses the A1 verdict ([`insights-a1-spec.md`](insights-a1-spec.md)), its
cases ([`insights-a1-acceptance.md`](insights-a1-acceptance.md)) and its words
([`insights-glossary.md`](insights-glossary.md)). Items marked **decided** were settled in conversation; items marked
**proposed** await an answer.

## What is decided

### Rows with only a facts line open to a dots-only chart

A subject with 2 to 5 sessions opens to a chart of its sessions: all dots one style, no highlights, windows, trend line,
labels, new-best marker or rings, with a tooltip on each dot. It is specified in
[`A1 spec 3e`](insights-a1-spec.md) and its cases are A1-CHT-13 to A1-CHT-16. Example: Hang Power Clean RX (5 sessions)
shows two clusters three years apart, which the facts line's "+10 lb" hides.

### The period control is a filter on the subject list

Replaces the fixed-period recompute (30, 60 or 90 days applying the verdict rule), which measured empty on the sample:
no subject has 6 sessions inside any of those windows.

| Window | Subjects with any session | Of the 12 with a verdict | Subjects with 6 or more sessions inside |
| --- | --- | --- | --- |
| 30 days | 5 | 3 | 0 |
| 60 days | 12 | 7 | 0 |
| 90 days | 14 | 7 | 0 |
| 180 days | 21 | 11 | 1 |
| 365 days | 25 | 12 | 2 |

- **What it is:** "Logged in" with presets and a custom range, listing only subjects with at least one session in the
  period. The presets are **All** (default), **Last month**, **Last 3 months**, **Last 6 months** and **Last year**, plus
  **Custom**, which takes a start and an end date. Not saved.
- **Same words and arithmetic as the date-range control** on the other views (`dateRange.ts`: calendar months back from
  today, start of day, inclusive), but its own state: choosing a period here does not change that control, and that
  control does not change this one. "Last 9 months" is not offered here.
- **Sample counts** as of the end of the sample log (2026-09-09): Last month 5, Last 3 months 15, Last 6 months 22, Last year
  25, of 45 subjects.
- **Applies to every group,** including the collapsed ones, and the group counts reflect it.
- **Local to the subject list.** It changes no verdict, label, counts sentence, coverage paragraph, chart or other view,
  and the scope line still reads "Uses your full history."
- **The line under it:** "Showing 5 of 45 subjects." when a period is chosen, absent under All.
- **Boundary:** the same reference date as the recency rule (today). The window starts N calendar months before it, so
  a session on that day is inside and the day before is not.
- **Custom (proposed details, not yet confirmed):** both dates are inclusive and bounded by the log's first and last
  dates; the end date defaults to today; a start after the end is not accepted and says so inline.
- **Cases:** A1-FLT-01 to A1-FLT-13.

### Up and Down are separate groups

The subject list shows **Up** and **Down** as two groups, not one "Moved" group. The discrete categories of change are
clearer than a single list sorted by size, and a Down row gets its own heading instead of sitting between Up rows.

- **Order:** Up, Down, Not tested since, No clear change, Fewer than 6 sessions, Not recent.
- **Up** is sorted by size of change, largest first; **Down** by size of fall, largest first.
- **A group with no rows is not shown** (most athletes have no Down or Not tested since rows).
- **Each group's heading carries its count,** and the counts follow the "Logged in" filter.
- Compared on the bundled sample as of 2026-09-09: Up 8, Down 1 (Nancy Scaled), No clear change 5, Fewer than 6 sessions
  13, Not recent 20. Cases: A1-GRP-01 to A1-GRP-06.

## What is proposed

Awaiting your answers; nothing below is decided.

### The rest of the layout

1. **Order, top to bottom:** page title and scope line ("Uses your full history"); the headline (label, sentence, coverage
   paragraph, "How this was counted"); the body-context line when body data exists (its wording is not yet specified); the
   period control; the subject list; small links to Periods and an optional "Add body composition".
2. **Collapsed by default:** No clear change, Fewer than 6 sessions (facts lines, most recently logged first) and Not
   recent, each showing its count; Up, Down and Not tested since are open. Each row opens to its chart.
3. **A move up to RX has no percentage,** so it follows the sized rows in Up, most recent first.
4. **If neither Up nor Down has rows,** the list opens with "No lift or benchmark has moved clearly." above the collapsed groups.
5. **States:** fewer than 3 counted gives "No headline yet" with the closest subjects; nothing recent gives the existing
   sentence; body data is optional and never gates the view.
