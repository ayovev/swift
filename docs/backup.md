# Backup

Developer reference, extracted from CLAUDE.md so that file stays short. CLAUDE.md keeps the rules that apply everywhere and points here for the detail; read this before changing the backup file format, its encryption, or the Download and Restore controls. Back to the [README](../README.md).

`src/lib/backup/` and `src/components/backup/` let an athlete download everything they have in
the app as one JSON file and restore it later, after clearing the browser or on another computer.
The workout and InBody CSVs are already their own backups; what only a backup file preserves is
**timeline entries and weigh-ins**. It reuses sync's validators and planner rather than growing its
own, so the two can't drift on what a valid row is.

- **Format (v1)**: `{ format: "swift-backup", version, exportedAt, encoding: "plain", datasets }`, or
  for an encrypted one `encoding: "aes-256-gcm"` with `kdf`, `iv` and `ciphertext` in place of
  `datasets`. `datasets` (or the decrypted plaintext) holds the same bare arrays sync puts on the wire,
  keyed by `SyncDataset`. Athlete data
  only: never theme, grouping or date range. Empty datasets are omitted from the file, so a
  backup only ever replaces, never tells a restore to clear something. A file is written with
  `workout`, `bodyComp`, `weighIns` and `timeline`. Unknown dataset keys are
  ignored; a newer `version` or unknown `encoding` is refused with "made by a newer version".
- **Encryption is optional and off by default** (`encryption.ts`, `passphrase.ts`). PBKDF2-HMAC-SHA-256
  (`KDF_ITERATIONS` = 600,000, OWASP's floor for it) into an AES-256-GCM key, a fresh random 16-byte salt
  and 12-byte IV per export, all through Web Crypto: **no dependency**. PBKDF2 was chosen because it is
  native (nothing to ship, and nothing to be abandoned before a backup is opened years later), not
  because it is the strongest: it needs almost no memory, so GPUs guess faster against it than against
  scrypt or Argon2id, and the 8-character floor and the strength hint are what make up for that. The KDF
  is named in the file (`kdf.name`), so Argon2id is a new `encoding`, not a rewrite, and PBKDF2 backups
  must stay readable forever. The plaintext encrypted is exactly the plain `datasets` JSON, so
  validation and `planTransfer` are shared. The additional authenticated data
  (`swift-backup:<version>:<encoding>`) binds the ciphertext to its header. The iteration count is stored
  per file and bounds-checked on read (`MAX_KDF_ITERATIONS`) so a crafted file can't hang the tab. The
  passphrase is NFKC-normalized before deriving (so accents typed on two devices match) and is otherwise
  untouched: not trimmed, not case-folded. **The passphrase is never stored, logged, sent or put in
  analytics**: it is a function argument, held in component state only until the download or restore
  finishes. AES-GCM can't tell a wrong passphrase from a damaged or tampered file, so `readBackup`
  returns `wrong_passphrase` for both and the UI says so. There is no recovery: Swift has no account and
  no server, and the form says so once. What the file still shows: format, version, export time, KDF
  parameters and the approximate size, never dataset names or counts. `readBackup` returns
  `needs_passphrase` for an encrypted file given none. A plain backup is plaintext health data; the
  Settings copy says so once.
- **Restore replaces per dataset, never merges**, and a missing dataset leaves the local copy alone.
  A backup must contain a workout log (Download always writes one), so a half-restored state where
  InBody data persists but the app lands on the upload screen can't happen.
- **Nothing is written until the whole file is usable.** It uses the same all-or-nothing
  `planTransfer()` as sync (see [sync.md](sync.md) for why the workout log is applied last): any
  dataset that fails validation aborts the restore with a reason, and the athlete confirms once for
  everything that would overwrite through the shared `ReplaceConfirmDialog`. An encrypted file asks for
  its passphrase first (`PassphraseDialog`, which stays open on a wrong one), before any overwrite
  confirmation; nothing is written while it is locked.
- **Wiring**: Download (`DownloadBackupButton`, with `BackupPassphraseForm`: a "Protect with a
  passphrase" checkbox, the passphrase typed twice, a length-band strength hint and a show/hide toggle
  inside each field) and Restore (`useBackupRestore`) sit in Settings'
  Backup section; restore is also on the landing page ("Restore from a backup", grouped with sync under "Already use
  Swift?"), the only place a new browser can reach. The landing page's dropzone and paste handler
  route a `.json` file (`looksLikeBackup`) to restore instead of the CSV parser, which would reject it. The labels are Backup/Restore, not Export/Import, because the athlete's
  goal is getting their data back, because "Import" suggests adding rather than replacing, and
  because "Export" already means the SugarWOD CSV on the landing page. Timeline entries have no separate
  export or import: they travel in the backup like everything else, which is all-or-nothing and replaces
  rather than merges. Sample data can't be backed up and has nothing to confirm on
  restore (it is never stored). Restore errors stay inline: `Landing`'s own error alert dismisses through `reset()`, which wipes storage. Both reuse
  the `onSynced*` handlers. `handleSyncedTimeline` must not look at `state`: on the landing page
  it is still the previous screen, which used to make received entries vanish on reload.
- **Analytics**: `interaction_used` with `backup_exported`/`backup_imported` (the event names predate the Download/Restore labels and stay as
  they are: a closed vocabulary, not copy), nothing else: no
  filename, counts or failure text, and not whether a backup was encrypted (`tests/backupPassphrase.test.tsx` pins that the passphrase and the word "encrypted" never reach a payload).
