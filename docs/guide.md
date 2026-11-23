# Using Swift

The full walkthrough for getting data in, keeping it, and moving it. Back to the [README](../README.md).

**Your own export.** In SugarWOD, open your training log and choose **Export
Workouts**, then drop the CSV on Swift's upload area or pick it with the file
picker. Swift expects SugarWOD's own export columns (`date`, `title`,
`description`, `best_result_raw`, `best_result_display`, `score_type`,
`barbell_lift`, `rx_or_scaled`, `pr`). If a file is missing columns, is empty,
isn't a CSV or has no readable dates, you get a plain-language message saying
which, not a parser error.

**Sample data.** The landing page has an "Or try it with sample data" option that
loads a bundled export and renders the full dashboard with no upload. A one-line
strip, "Sample data · Use your own", stays at the top the whole time so it is
never mistaken for your results; **Use your own** returns to the upload screen.

**Body composition, optionally.** An InBody scan-history export is a separate,
optional upload with its own view under **Body**. It expects InBody's own
columns; only `date` and `Weight(lb)` are required, so a slimmer export works.
It adds body-weight context to the Insights views. You can also enter weigh-ins
by hand on the Body Comp view (pounds only, one per day, with an optional note);
on a day with both, the scan is used.

**Insights.** **Progress** gives each lift and named benchmark a verdict (Up,
Down, Not tested since or No clear change) from its recent sessions, with a
headline across them and a chart behind each row. RX and Scaled are judged
separately. **Timeline** is where you add what you changed (a program, a cut) and
what happened (an injury, a trip): each entry has a kind, an area (Training,
Nutrition, Health, Travel or Other), a start date and an end date or Ongoing.
Entries sit on one axis above the verdicts. For something you changed, Swift
also shows how your lifts and benchmarks compared during it against just before
it. An entry is context: it never changes a verdict, and Swift never says it
caused one.

**Finding your way around.** The header has four sections. **Overview** is where
things stand now, from your whole history: days trained, your most recent PR,
body weight and the Progress headline, each opening its own section. **Training**
holds your workout list, Lifts (every lift, benchmark and PR), the ten GPP
domains, the three modalities and a Movements view, where you can pick one
movement or a whole family, such as every kind of clean, and narrow it to
dumbbell, kettlebell or barbell when your workouts say which. **Body** is body
composition. **Insights** is Progress and Timeline. The date range and grouping
sit under each page's title as a sentence you can click: "Showing all time,
grouped by month." To see the workouts behind a chart point, click or tap it, or
focus the chart and use the arrow keys and Enter. On a domain, modality or
Movements chart the list below narrows to that month, week or quarter; on
Overview's months or a lift's dots you get a link to those workouts. You can also
drag across a chart to set the date range. Every chart has a table version: the
**Table** switch in a chart's header flips them all. Replacing a file, syncing,
backup, accent colour, dark mode and Start over are all in **Settings**.

**Updating your data.** A fresher export doesn't need a fresh start. In
**Settings**, **Replace file** next to your workout log swaps in a new SugarWOD
CSV, and the one next to body composition does the same for InBody (also on the
Body Comp view). Each replaces only that dataset. When the stored log is more
than 30 days old, Overview and the Insights views show a quiet line offering the
same action.

**Backing up.** Clearing your browser's site data, or moving to a new computer,
would lose what is stored here, including timeline entries and weigh-ins, which
exist nowhere else. **Settings → Backup → Download** saves one file with your
workout log, body composition history, weigh-ins and timeline entries (not
accent, mode, grouping, date range or branding). **Restore**, in Settings and on
the landing page for a fresh browser (or by dropping the file on the upload
area), replaces each dataset the file contains after you confirm, and restores
nothing if any part of the file is unusable. By default the file is plaintext and
holds your full training and body composition history, so keep it somewhere
private. To protect it, tick **Protect with a passphrase** (at least 8
characters, entered twice): the file is encrypted in your browser with AES-256-GCM
and Restore asks for the passphrase. Swift can't recover a forgotten passphrase,
since there is no account and no server, so a password manager is a good home for
it. An encrypted file still shows its export time and rough size, nothing about
what is inside.

**Syncing from another device.** The landing page's **Sync from another device**
(and, once you have your own data loaded, **Send to a device** and **Receive from
a device** in Settings) walks you through a two-QR pairing: the device with your
data shows a code, the other scans it and shows a code back, and once that is
scanned too your data transfers directly between the two browsers. It is all or
nothing, with one confirmation if anything would be replaced. See
[Privacy](privacy.md) for how that stays server-free.

## Branding

A coach can add their gym's logo, name and brand colour: **Settings → Branding**,
shown while the role is set to Coach (change it under **Role**). The logo appears
beside the Swift mark in the header and on the landing page; Swift's own mark is
always there too. The colour becomes the accent, adjusted automatically if it
would be hard to read in either mode, and the form says when it did that. The
logo can be a PNG, JPEG or WebP up to 5 MB; SVG isn't accepted. A logo that would
disappear against the page (white on light, black on dark) sits on a small plate.
When you add a logo, Swift offers up to three of the colours in it under the colour
field; pick one to use it, or choose your own. It never changes your colour by itself,
and a black and white logo has none to offer.
Branding stays on this device: it isn't uploaded, synced or included in a backup,
and **Start over** doesn't remove it, so a coach moving between athletes keeps it.
**Remove branding** clears it. Athletes don't see a coach's branding; it shows
only on the coach's own device.
