# Insights front door

**Status: draft for review, nothing built.** The first view of Insights (today's Progress view): what is on it, in what
order, and how its one control works. It reuses the A1 verdict ([`insights-a1-spec.md`](insights-a1-spec.md)), its
cases ([`insights-a1-acceptance.md`](insights-a1-acceptance.md)) and its words
([`insights-glossary.md`](insights-glossary.md)). Items marked **decided** were settled in conversation; items marked
**proposed** await an answer.

## What is decided

### The period control is a filter, not a recomputation

The earlier decision was a fixed-period option (30, 60 or 90 days) that applied the verdict rule and its minimums to
the sessions inside the window. Measured on the bundled sample, as of the log's end, that shows nothing:

| Window | Subjects with any session | Of the 12 with a verdict | Subjects with 6 or more sessions inside |
| --- | --- | --- | --- |
| 30 days | 5 | 3 | 0 |
| 60 days | 12 | 7 | 0 |
| 90 days | 14 | 7 | 0 |
| 180 days | 21 | 11 | 1 |
| 365 days | 25 | 12 | 2 |

Even the most-trained lift, Clean & Jerk, has 5 sessions in the last 90 days. So the control is replaced:

- **"Logged in the last 30 / 60 / 90 days"** shows only the subjects with at least one session in that period. **All**
  is the default.
- **It changes nothing but which rows are listed.** Every verdict, the headline label, the counts sentence and the
  coverage paragraph are identical whichever option is chosen.
- **It uses the same reference date as every other recency rule** (today, [`A1 spec 3c`](insights-a1-spec.md)). A
  session exactly N days before the reference date is inside the period; N + 1 days is not. A subject that is not
  recent (latest session over 365 days ago) never matches 30, 60 or 90.
- **On the sample** (45 subjects, as of 2026-09-11) the filter lists 5, 12 and 14 subjects for 30, 60 and 90 days.
- **Assumption, to confirm:** it is a view control, not saved, and resets to All when the page is reopened.

Acceptance cases:

- **FD-01.** Sample as of 2026-09-11: 30 days lists 5 of 45 subjects, 60 days lists 12, 90 days lists 14, All lists 45.
- **FD-02.** The headline label, counts sentence and coverage paragraph are identical under All, 30, 60 and 90.
- **FD-03.** A subject's state and change are identical whether or not a filter hides other rows (Deadlift, last logged Apr
  2026, is hidden under 90 days and unchanged under All).
- **FD-04.** A session exactly 30 days before the reference date puts its subject in the 30-day list; 31 days does not.
- **FD-05.** A not-recent subject is absent from 30, 60 and 90.
- **FD-06.** When no subject was logged in the period the list reads "No lift or benchmark was logged in the last 30
  days." (or 60, 90) and the headline stays as it is.
- **FD-07.** A subject with a facts line and a session in the period is listed, with its facts line.

## What is proposed

Awaiting your answers; nothing below is decided.

1. **Order, top to bottom:** page title and scope line ("Uses your full history"); the headline (label, sentence,
   coverage paragraph, "How this was counted"); the body-context line when body data exists (its wording is not yet
   specified); the filter; the subject list; small links to Periods and an optional "Add body composition".
2. **Subject list groups:** **Moved** (Up and Down together, largest change first, so good and bad news sort by size and
   not by sign), **Not tested since**, **No clear change**, **Fewer than 6 sessions** (facts lines, most recently logged
   first) and **Not recent**. The last three are collapsed by default with their counts; each row opens to its evidence
   chart.
3. **If nothing moved,** the first group reads "No lift or benchmark has moved clearly."
4. **A dots-only chart for rows with only a facts line:** all dots one style, no highlights, no windows, no trend line,
   no labels, a tooltip on each. Example: Hang Power Clean RX (5 sessions: Dec 2022 140, Jan 2023 121, Jan 2023 152, Jan
   2026 205, Aug 2026 215) shows two clusters three years apart, which the facts line's "+10 lb" hides. Risk: five dots
   invite a reading of direction.
5. **States:** fewer than 3 counted gives "No headline yet" with the closest subjects; nothing recent gives the existing
   sentence; body data is optional and never gates the view.
