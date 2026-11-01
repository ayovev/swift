# Insights front door

**Status: draft for review, nothing built.** The first view of Insights (today's Progress view): what is on it, in what
order, and how its one control works. It reuses the A1 verdict ([`insights-a1-spec.md`](insights-a1-spec.md)), its
cases ([`insights-a1-acceptance.md`](insights-a1-acceptance.md)) and its words
([`insights-glossary.md`](insights-glossary.md)). Items marked **decided** were settled in conversation; items marked
**proposed** await an answer.

## What is decided

### Rows with only a facts line open to a dots-only chart

A subject with 2 to 5 sessions opens to a chart of its sessions: all dots one style, no highlights, windows, trend line,
labels, new-best marker or rings, with a tooltip on each dot. It is specified in
[`A1 spec 3e`](insights-a1-spec.md) and its cases are A1-CHT-13 to A1-CHT-16. Example: Hang Power Clean RX (5 sessions)
shows two clusters three years apart, which the facts line's "+10 lb" hides.

## What is proposed

Awaiting your answers; nothing below is decided.

### The period control

The earlier decision was a fixed-period option (30, 60 or 90 days) that applies the verdict rule and its minimums to the
sessions inside the window. Measured on the bundled sample, as of the log's end, that shows nothing:

| Window | Subjects with any session | Of the 12 with a verdict | Subjects with 6 or more sessions inside |
| --- | --- | --- | --- |
| 30 days | 5 | 3 | 0 |
| 60 days | 12 | 7 | 0 |
| 90 days | 14 | 7 | 0 |
| 180 days | 21 | 11 | 1 |
| 365 days | 25 | 12 | 2 |

Even the most-trained lift, Clean & Jerk, has 5 sessions in the last 90 days. The candidate replacement is a **filter**:
"Logged in the last 30 / 60 / 90 days" lists only the subjects with a session in that period (All by default) and changes
no verdict, headline label, counts sentence or coverage paragraph. On the sample it lists 5, 12 and 14 of 45 subjects. It
would use the same reference date as the recency rule (a session exactly N days old is inside; N + 1 is not), never match
a not-recent subject, and not be saved. If adopted, its cases would be: the sample counts (5, 12, 14, All 45); the headline
unchanged under every option; a verdict unchanged whether or not rows are hidden; the 30 and 31 day boundary; a not-recent
subject absent; an empty period reading "No lift or benchmark was logged in the last 30 days."; and a facts-line subject
listed with its facts line.

### The rest of the layout

1. **Order, top to bottom:** page title and scope line ("Uses your full history"); the headline (label, sentence, coverage
   paragraph, "How this was counted"); the body-context line when body data exists (its wording is not yet specified); the
   period control; the subject list; small links to Periods and an optional "Add body composition".
2. **Subject list groups:** **Moved** (Up and Down together, largest change first, so good and bad news sort by size and not
   by sign), **Not tested since**, **No clear change**, **Fewer than 6 sessions** (facts lines, most recently logged first)
   and **Not recent**. The last three are collapsed by default with their counts; each row opens to its chart.
3. **If nothing moved,** the first group reads "No lift or benchmark has moved clearly."
4. **States:** fewer than 3 counted gives "No headline yet" with the closest subjects; nothing recent gives the existing
   sentence; body data is optional and never gates the view.
