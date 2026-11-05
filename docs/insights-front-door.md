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
- **Collapsed by default:** No clear change, Fewer than 6 sessions (facts lines, most recently logged first) and Not
  recent, each showing its count; Up, Down and Not tested since are open. Each row opens to its chart.
- **A move up to RX has no percentage,** so it follows the sized rows in Up, most recent first.
- **If neither Up nor Down has rows,** the list opens with "No lift or benchmark has moved clearly." above the collapsed
  groups.
- Compared on the bundled sample as of 2026-09-09: Up 8 (including the 2 move-ups to RX), Down 1 (Nancy (Scaled)), No clear
  change 5, Fewer than 6 sessions 11, Not recent 20; these add to 45. Cases: A1-GRP-01 to A1-GRP-07.

### Body context is on the rows only

There is **no body-context line under the headline.** Body context appears only as the lines under each subject's row
(see [`insights-body-context.md`](insights-body-context.md)). A headline-level line would count one body weight change once
per subject, over spans that differ, so it would read as more evidence than it is; it needed a rule for move-ups and four
extra states of its own, and it restated what the rows already show. The headline stays a strength answer and body
composition stays out of it. Mockup compared three options (rows only, rows and headline, none) and rows only was chosen.

### Page order

Top to bottom:

1. **Title and scope line:** "Insights" and "Uses your full history."
2. **Headline:** the label, the counts sentence, the coverage paragraph (ending "As of Sep 11, 2026.", the date of the
   latest session in the log) and the "How this was counted" link.
3. **"Logged in" filter** and its "Showing N of 45 subjects." line.
4. **Subject list,** in the groups above. Body context lives here, on the rows (see below).
5. **Small links at the bottom:** Timeline, and "Add body composition" when there is none.

The order gives the answer first, then the evidence. The filter sits directly above the list it
filters so it does not read as a control on the headline. No other date is shown near the top. Cases: A1-PGE-01 to
A1-PGE-07.

### States

| State | When | What the page shows |
| --- | --- | --- |
| Normal | 3 or more counted subjects | The full page |
| No headline yet | Fewer than 3 counted subjects | "No headline yet: needs 3 lifts or benchmarks with a verdict, has 0." with the closest subjects (A1-HDL-10); the coverage paragraph and the list still show |
| Nothing recent | Every subject's latest session is over 365 days ago | "No lift or benchmark was logged in the last 12 months.", no label; the list shows, with every subject under Not recent |
| No data at all | No lift or benchmark sessions in the log | "No lift or benchmark has been logged yet." No headline, no filter and no list |
| No body data | No InBody scans and no manual weigh-ins | No row shows a body-context line; nothing is gated; "Add body composition" appears in the small links |
| Filter returns nothing | The chosen period lists no subjects | "No lift or benchmark was logged in this period."; the headline is unchanged (A1-FLT-08) |

## What is proposed

Nothing on the front door awaits an answer.
