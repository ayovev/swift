# Insights glossary

**Status: draft, nothing built.** The words used in Insights, what each means, and where each is used. App copy,
specs, tests and code use these words for these meanings and no others, so the app reads the same everywhere.
Definitions live in [`insights-a1-spec.md`](insights-a1-spec.md); exact strings in
[`insights-a1-acceptance.md`](insights-a1-acceptance.md).

## Two levels, two vocabularies

| Level | Words | The question it answers | Shown |
| --- | --- | --- | --- |
| One lift or benchmark | **Up**, **No clear change**, **Down** (and **Not tested since** for a lift) | Did this one move between the previous sessions and the recent ones? | A pill on the subject's row |
| The whole athlete | **Improving**, **Steady**, **Declining** | Across everything logged, is performance moving? | The headline above the list |

The headline counts the pills. "Improving in 8 of 14 lifts and benchmarks" means 8 subjects are **Up**. The two
vocabularies are never mixed: a subject is never "Improving" and the headline is never "Up".

## Subject states (the pill)

| Term | Means |
| --- | --- |
| **Up** | The recent best is at least 5% above the previous window's best, or it is a record, or the subject moved up to RX within the last 12 months |
| **No clear change** | Within ±5% of the previous window's best, and not a record |
| **Down** | At least 5% below the previous window's best, with a max effort in the recent window (a benchmark is always a max effort) |
| **Not tested since** | A lift at least 5% below with no max effort in the recent window. The athlete may simply not have tested. Never called a decline |
| not enough sessions | Under 6 sessions. No pill: a facts line instead |
| not recent | Latest session over 365 days before today. Row note: "Not recent: last logged Aug 2025" |

## Headline labels

| Term | Means |
| --- | --- |
| **Improving** | Net at least +0.25 and at least a third of counted subjects Up |
| **Steady** | Neither Improving nor Declining |
| **Declining** | The mirror of Improving |
| No headline yet | Fewer than 3 counted subjects |

## Counting words

| Term | Means |
| --- | --- |
| subject | One lift or benchmark; RX and Scaled are separate subjects. In copy: "lift" or "benchmark" |
| session | One subject on one day (the day's best) |
| window | The recent sessions and the sessions before them, shown as "Last 4" and "Previous 4" |
| verdict | A subject's state plus its change (section 2 of the spec) |
| eligible | Has at least 6 sessions |
| counted | Eligible, recent and not Not tested since, plus recent move-ups |
| left out | Not counted, with a reason: under 6 sessions, not logged in 12 months, not tested recently |
| move up to RX | An RX session after a Scaled one. Counts as Up for 12 months. Moving down to Scaled is a neutral fact |

## Bests and records

| Term | Means |
| --- | --- |
| PR | Any session that beats every earlier session. Shown only as "Last PR". Never votes |
| record | The recent best is at least 2% above the best before the recent window. Counts toward Up. Internal word |
| new best | What the chart and note say when the recent best is a record |
| max effort | A session naming an explicit rep max or a rep ladder. Shown as a ring, or as "tested" in "Not tested since" |
| est. | Estimated 1RM, the average of two formulas. Always labelled as an estimate |
| trend | The dashed line through the best of each quarter. A picture, never a verdict |

## Lines on a subject's row

| Term | Means |
| --- | --- |
| facts line | Latest and previous result, for 2 to 5 sessions. No verdict word, percentage or pill |
| cross-reference line | "Also logged as RX: ...". Facts about the other status. Counts nothing |
| Last PR | The subject's best session, with its date |
| coverage paragraph | The short muted paragraph under the headline sentence |
| group | A heading on the front-door list: Up, Down, Not tested since, No clear change, Fewer than 6 sessions or Not recent. A group with no rows is not shown |
| entry | One item on the timeline: something the athlete changed or something that happened, with a start date and an optional end date |
| timeline | The view where entries are added and read. Formerly periods |
| I changed it / It happened | The two initiations of an entry. Only "I changed it" gets a before/after verdict |
| domain | Training, Nutrition, Health and recovery, Travel and schedule or Other. Groups entries; drives no rule |
| period filter | "Logged in": All, Last month, Last 3 months, Last 6 months, Last year or Custom, on the front door. Chooses which subjects are listed; changes no verdict or headline |

## Words not to use

| Word | Why | Use instead |
| --- | --- | --- |
| flat | Claims the lift has not moved, which the data cannot show. It was the plateau code's name for the direction | No clear change |
| Holding steady | Replaced by Steady | Steady |
| Improved, Declined | Past tense reads as a grade on one subject | Up, Down |
| unchanged | Same problem as flat | No clear change |
| stalled, plateau | Retired. They implied a cause | No clear change, with the body-context line |
| aligned, tension | Retired with the alignment view | The counts, and the body-context line on each row |
| period, tag, experiment, cycle (for an entry) | Retired names. A period implied a closed span; the rest were implementation names | entry, timeline |
| decline (for Not tested since) | A lighter session mid-cycle is not a decline | Not tested since |
