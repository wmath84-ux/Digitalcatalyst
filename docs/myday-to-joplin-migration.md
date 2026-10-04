# My Day → Joplin workspace migration (V1)

The legacy planner stored four arrays in one Firestore document
(`users/{uid}/myDay/current`: `tasks`, `schedule`, `notes`, `reminders`) plus a
localStorage mirror. The workspace stores Joplin-shaped rows. This document is
the exact mapping, the id rules, the phases, and what is deliberately not lost.

Everything described here is implemented in `src/joplin/joplinMigration.ts`
(pure planning + verification), `src/joplin/joplinMigrationBridge.ts` (collection,
phases, marker) and enforced server-side by `api/_lib/joplin.ts`
(`POST /api/joplin/migrate`), with tests in `tests/joplinMigration.test.mjs`.

## 1. Destination layout

```
users/{uid}/joplinItems       notes, to-dos and notebooks (Joplin `type_` 1 / 2)
users/{uid}/joplinTags        tags (type_ 5)
users/{uid}/joplinResources   attachment metadata (type_ 4)
users/{uid}/scheduledItems    the universal schedule rows
users/{uid}/joplinMeta/migrationV1   the marker that retires the planner
```

Notebooks created by the migration (all deterministic, all idempotent):

| Notebook | Source |
| --- | --- |
| **My Day** (root) | created for every migrated workspace |
| **Tasks** | legacy `tasks` → to-do notes |
| **Notes** | legacy `notes` |
| **Reminders** | legacy `reminders` → to-do notes + schedule rows |
| **Schedule** | legacy `schedule` events → linked schedule records |
| **Web Clippings** (nested under My Day) | reserved for the Web Clipper |

`notebookIdForName(name, parentId)` (`src/joplin/joplinDeepLinks.ts`) is the ONE
rule for notebook ids, so re-running the migration can never create a second
copy, and the clipper's mirror in `utils/joplinClipper.js` is asserted equal in
`tests/joplinClipper.test.mjs`.

## 2. Field mapping

| Legacy | Becomes | Preserved verbatim |
| --- | --- | --- |
| `Task` | to-do note (`is_todo: 1`) in **Tasks** | `title`, `subject`, `priority`, `time`, `createdAt`, legacy id |
| `Task.status` | `todo_completed` + status tag | `pending` / `in-progress` / `completed` never collapse (the three states become three distinct markers, not one "not done") |
| `QuickNote` | note in **Notes** | rich-text HTML (kept as HTML, `markup_language: 2`), `createdAt`, legacy id, colour as a tag |
| `Reminder` | to-do note in **Reminders** + one `scheduledItems` row | text, time, `category` and `note` from `myday_reminder_meta` |
| `ScheduleEvent` | linked `scheduledItems` row (+ a plain note only when it had a body) | `title`, `detail`, `startTime`, `endTime`/duration, `type`, legacy id |
| any legacy row | `legacy: { type, id }` on the Joplin row | scan the workspace for `legacy.type === "task"` etc. |

* Times: a legacy `HH:MM` on a given day is resolved to an instant in an
  explicit zone — the stored IANA zone when the legacy snapshot has one, else the
  recorded `tzOffsetMinutes`, else UTC (`nextLegacyClockInstant`).
* Ids: `joplinIdForLegacy(kind, legacyId)` for rows, `joplinIdForNamed(scope,
  name)` for notebooks, tags and series. All 32-hex, all deterministic, so a
  resumed or repeated run produces the same ids.
* Every migrated row also carries a `legacy:<kind>` tag, so the origin is visible
  inside the workspace and searchable.

## 3. Idempotency, phases and the marker

```
tasks → notes → reminders → schedule
```

1. The client collects the legacy snapshot (localStorage keys
   `myday_tasks` / `myday_schedule` / `myday_notes` / `myday_reminders` /
   `myday_reminder_meta`, unioned with the cloud document through the unchanged
   `/api/myday` endpoint — the union is by id, so a device that never synced is
   not lost).
2. Duplicate legacy ids are **refused before any row is built**
   (`duplicate_legacy_id:<kind>:<id>`); the first row wins and the duplicate is
   reported as a warning. Nothing is guessed silently.
3. Each phase is POSTed to `/api/joplin/migrate`, which writes only rows that do
   not exist yet and answers with the ids it stored. Existing rows are reported
   as written and are **never overwritten** — a second run cannot undo an edit
   made after the first run.
4. The client verifies each phase against the plan (`verifyMigrationPlan`: a
   phase fails on any missing *or unexpected* row) and only then marks the phase
   complete in `joplinMeta/migrationV1`.
5. When all phases are verified the marker is completed and `#/my-day` switches
   its notification scheduler to the canonical store. The legacy planner is
   never mounted again, but **legacy data is never deleted**
   (`legacyRetained: true` is asserted by the tests), and `/api/myday` stays
   online as the compatibility endpoint.

`runMyDayMigrationV1({ uid, dryRun })` supports a dry run that returns the whole
plan without writing anything.

## 4. Allowance policy during migration

Migration is a transport of data the learner already owns, so it **does not
consume the daily creation allowance** and is not blocked by an exhausted
allowance — otherwise a learner with one free creation per day could never bring
their data across. Everything authored *after* migration (notes, notebooks, tags,
attachments, schedules, web clips) goes through the same server path and consumes
the same counter the planner used.

## 5. What the migration does NOT promise

* **HTML→Markdown fidelity.** Quick notes keep their HTML (stored as an HTML
  note), so nothing is lost. Legacy *plain-text* notes whose bodies contained
  home-made markup are converted by `legacyHtmlToMarkdown`; exotic constructs
  (nested tables, inline CSS positioning) are flattened. This is a conversion,
  not a round trip.
* **Very large accounts in one request.** A migration phase is one HTTP request
  and is capped at 3.8 MB / 400 rows (`JOPLIN_MIGRATION_PHASE_TOO_LARGE`). A
  learner beyond that keeps their legacy data and is told the phase did not land;
  re-running after reducing the batch (or in smaller phases) resumes exactly
  where it stopped. Nothing is deleted.
* **Cross-timezone history.** Legacy rows only ever stored a wall-clock time and
  (later) an offset. A row created in another zone months ago is resolved with
  the zone recorded at migration time, which is the best evidence available.
* **Automatic rollback.** There is no "undo migration" button: the legacy data
  remains readable, and re-running the migration is safe, but the migrated rows
  are real workspace data and are not bulk-deleted.

## 6. Verification checklist (run before announcing a cutover)

```bash
node --test tests/joplinMigration.test.mjs        # plan, mapping, ids, verification
node --test tests/joplinScheduleRecurrence.test.mjs tests/joplinScheduleNotifications.test.mjs
node --test tests/joplinDeepLinks.test.mjs        # legacy hash → canonical target
```

Then, against a real account: run `runMyDayMigrationV1({ dryRun: true })`, check
the phase counts match the legacy document, run it for real, open
`#/my-day?section=tasks&item=<legacy id>` and confirm it resolves to the migrated
to-do, and confirm `/api/myday` still answers `myday.status` for the same user.
