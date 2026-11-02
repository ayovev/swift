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

- **What it is:** "Logged in the last" with 30 days, 90 days and All (values *tunable*; All by default; not saved). It lists
  only subjects with a session in that period (5 and 14 of 45 on the sample).
- **Local to the subject list.** It changes no verdict, label, counts sentence, coverage paragraph, chart or other view,
  and the scope line still reads "Uses your full history."
- **The line under it:** "Showing 5 of 45 subjects." when a period is chosen, absent under All.
- **Boundary:** the same reference date as the recency rule; a session exactly N days old is inside, N + 1 is not.
- **Cases:** A1-FLT-01 to A1-FLT-10.

## What is proposed

Awaiting your answers; nothing below is decided.

### The rest of the layout

0. **The filter applies to every group,** including the collapsed ones (A1-FLT-06).
1. **Order, top to bottom:** page title and scope line ("Uses your full history"); the headline (label, sentence, coverage
   paragraph, "How this was counted"); the body-context line when body data exists (its wording is not yet specified); the
   period control; the subject list; small links to Periods and an optional "Add body composition".
2. **Subject list groups:** **Moved** (Up and Down together, largest change first, so good and bad news sort by size and not
   by sign), **Not tested since**, **No clear change**, **Fewer than 6 sessions** (facts lines, most recently logged first)
   and **Not recent**. The last three are collapsed by default with their counts; each row opens to its chart.
3. **If nothing moved,** the first group reads "No lift or benchmark has moved clearly."
4. **States:** fewer than 3 counted gives "No headline yet" with the closest subjects; nothing recent gives the existing
   sentence; body data is optional and never gates the view.
