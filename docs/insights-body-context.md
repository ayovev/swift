# Insights body-context line

**Status: draft, nothing built.** What the line under a subject's verdict says about body weight, and when it says
nothing. It reuses the A1 verdict ([`insights-a1-spec.md`](insights-a1-spec.md)), its words
([`insights-glossary.md`](insights-glossary.md)) and the noise band (`bodyCompNoise.ts`; the default weight band is 3 lb,
*unvalidated*). Cases are the BDY group in [`insights-a1-acceptance.md`](insights-a1-acceptance.md). Items marked **decided**
were settled in conversation; items marked **proposed** await an answer.

## Decided: the sentence that relates body weight to the lift

The line states the body weight change first. A second sentence relates it to the lift, for a **load-scored lift** only
(benchmarks get no relation) and only when body weight moved by more than the noise band. The percentages are the ones
shown on the row (rounded half away from zero to one decimal), and "lift" means the two bests the verdict compares.

| Body weight against the lift | Sentence |
| --- | --- |
| Moved the same way, by less than the lift (share under 25%) | "A little of this change is body weight." |
| Same way, share 25% to 75% | "About half of this change is body weight." |
| Same way, share over 75% and under 100% | "Most of this change is body weight." |
| Same way, by at least as much as the lift (share 100% or more) | "Body weight rose at least as much as the lift (+3.0% vs +1.4%)." (or "fell", for a decline) |
| **Moved the other way** | "Body weight fell 4 lb while the lift rose: relative to body weight, +11.2%." (or "rose ... fell ... −8.5%") |

- **The share** is the body weight change in percent divided by the lift change in percent. It can never pass 100% in the
  first three rows, so there is no minimum lift change and no 5% floor. A small lift change simply tends to land in the
  "at least as much" row, which is true and does not claim a fraction.
- **The opposite-direction row is the best case:** body weight down and the lift up (or the reverse). The relative figure is the
  lift's change per unit of body weight, `(recent best ÷ body weight at it) ÷ (previous best ÷ body weight at it) − 1`,
  rounded to one decimal.
- **No sentence** when body weight stayed inside the noise band (the weights are still shown), for a benchmark, for a move
  up to RX (the Scaled and RX sessions are not the same task) and for Not tested since (there is no real change to relate).
- The words never say why a lift changed: they state how two measured changes compare.

## Proposed

Awaiting your answers; nothing below is decided.

1. **What the line compares:** body weight at the dates of the two sessions that set the two bests the verdict compares,
   using the existing rule (that day, else a straight line between readings no more than 45 days apart, else the nearest
   reading within 21 days, else none; never extrapolated).
2. **First sentence:** "Body weight 178 to 184 lb (+6 lb) over the same span."; with InBody lean and fat, "Body weight +6 lb: lean
   +2.4 lb, fat +3.6 lb."; inside the band, "Body weight 181 to 182 lb, within normal scan variation."; no reading near a
   session, "No body weight within 21 days of Mar 2026."
3. **Which rows:** Up, Down and Not tested since rows show it; a No clear change row shows it when opened; facts-line subjects
   and collapsed groups show nothing. With no body data there is no line and no per-row placeholder.
