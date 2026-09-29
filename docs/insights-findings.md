# Insights expansion: findings for the maintainer

One section per phase: what was tuned, which thresholds were chosen and why, and what
looked wrong. Every threshold is in `src/lib/analytics/insightConfig.ts` and is a starting
point, not a measured value.

## Phase 1: InBody noise band

**Not yet validated on real data.** The repo has no real InBody history, only a 6-row
fixture and a synthetic generator, so nothing below has been checked against a real athlete.
Run the report on your own exports:

    SWIFT_SUGARWOD_CSV=/path/sugarwod.csv SWIFT_INBODY_CSV=/path/inbody.csv \
      npx vitest run tests/insightFindings.test.ts      # writes insight-findings.txt

It prints the band and method per metric, the morning/afternoon comparison, and every
existing Plateau / Alignment / Experiment output that changed. Paste it here.

What the synthetic sample shows (fortnightly scans, no time-of-day variation), so only that
the machinery works:

- Bands came from the `residual` method (only 1 pair within 7 days): weight ±2.9 lb, lean
  ±2.1 lb, fat mass ±2.3 lb, body fat ±1.3 points. The generator's own noise amplitudes are
  ±1.5 / ±1.0 / ±0.6 (fat mass derived), so the bands are the right order of magnitude.
- 0 of 48 existing outputs changed on that sample.
- The paired-scans method needs scans within 7 days of each other. Athletes who scan monthly
  or quarterly (the 6-row fixture is quarterly) will never reach it and will land on
  `residual` or `default`. Expect `default` for anyone under about 8 scans.

What changed in existing behaviour:

- A body-comp delta no bigger than its band no longer counts as lean-down / fat-up (or the
  mirror), so `plateaued_body_comp`, Alignment `tension` and Experiment `improved`/`declined`
  need a real change. `tests/plateauDetector.test.ts` had one case (fat +3 lb on two scans)
  that flipped `plateaued_body_comp` to `plateaued_other` under the default 3 lb band; the test
  now uses +4 lb and a new case pins the within-band result.
- The three tabs say "... within normal scan variation." for any delta inside the band.
  Delta numbers are still shown.

Choices worth a second look:

- Lean mass uses Soft Lean Mass where present, else Skeletal Muscle Mass. The band is
  estimated on the same field, but `computeBodyCompTrend` still chooses per pair of scans, so
  an export that mixes the two would compare a delta in one field to a band from the other.
- The floor (half the default) exists so a few agreeing scans can't produce a near-zero band.
- Time of day is diagnostic only and has not been run on real data.

## Phase 2: Relative strength

**Not spot-checked against your raw CSVs yet.** The plan asks for three lifts checked by hand
on your own data; that needs your exports. To check one: pick a lift, find its Load rows in
the SugarWOD CSV, compute the e1RM from `best_result_raw` and the rep scheme in the title or
description (average of Epley and Brzycki; a 1RM is used as logged), and compare against the
chart's tooltip. `tests/relativeStrength.test.ts` pins the same arithmetic on fixtures.

Choices and thresholds (all in `insightConfig.ts`, all tunable):

- e1RM: the export has the top load per session and no reps per set, so this is the session's
  best load with the rep scheme parsed from the text (`parseRepMax`). Unstated schemes are
  skipped, same as Plateaus. Cap `RS_MAX_REPS = 8`. Plateaus still only accepts 1/2/3/5RM, so
  a lift can have more sessions here than there.
- Window one year, at least 4 sessions and 3 with a body reading, at least 2 scans in the window.
- Interpolate between scans up to 45 days apart; otherwise nearest scan within 21 days; otherwise
  the session is left out of the normalised views.
- Start and end are the means of up to 3 sessions at each end of the window, on sessions that
  have a body reading. Gain/loss uses the Plateau Detector's 3% (`TREND_THRESHOLD`).
- Lean mass is preferred; bodyweight is used if too few sessions have a lean match.

Things that looked off or worth deciding:

- The plan's four attribution values have no place for a fall in raw strength, so I added
  `declined`.
- RX and Scaled are split per lift, as on the Plateaus tab. For a barbell lift that halves the
  sessions for anyone who switches; say if you'd rather merge load lifts.
- Sessions logged with `best_result_raw` as a load but a title that names a *different* scheme
  than the athlete actually did will be mis-estimated; that's inherent to the export.
- On the bundled sample (synthetic scans), 4 of 32 lift/status series qualify. Back Squat has 29
  sessions overall but only 2 in the last year, so it is listed as insufficient. If the
  365-day window (`RS_WINDOW_DAYS`) feels too strict for lifts you test rarely, widen it.
