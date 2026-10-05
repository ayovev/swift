# Security

## What Swift is, for this purpose

Swift is a static web app. There is no server, no database and no accounts, and
training data never leaves the browser (see [Privacy](README.md#privacy)). That
shapes what a vulnerability looks like here.

## Reporting a vulnerability

Please report it privately through GitHub's
[private vulnerability reporting](https://github.com/ayovev/swift/security/advisories/new)
rather than a public issue. Include the steps to reproduce and the browser you
used. You can expect a reply within a week.

## In scope

- Anything that causes workout or body-composition data to leave the browser, or
  that adds data to an analytics event beyond the closed vocabulary in
  `src/lib/posthog.ts`. These are the most serious reports.
- Cross-site scripting or other injection through a crafted CSV, backup file or
  sync payload.
- Weaknesses in the optional backup encryption (`src/lib/backup/encryption.ts`).
- Problems in the cross-device sync pairing that let a third party receive or
  inject data.

## Out of scope

- Anything that needs a server, an account or a stored credential. None exist.
- Someone with access to your unlocked browser reading the local IndexedDB cache.
  Use **Start over** or clear site data on a shared machine.
- Findings that only apply to a plain (unencrypted) backup file being readable by
  whoever holds the file. The Settings copy says so.
- Forks and self-hosted copies. Their operators decide what they send.

## Supported versions

Only the latest `main`, which is what the live site serves.
