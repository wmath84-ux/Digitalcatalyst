# My Day → Joplin workspace — final report (A–K)

Scope delivered: **host integration + migration + scheduler + notifications**,
with the Web Clipper, the rules and the build pipeline that make them real.

Every claim below is either (a) covered by a test in this repository, (b) a build
result reproduced in this checkout, or (c) explicitly marked as **not verified
here**. Section K is the only place limitations live, and it contains nothing but
real ones.

---

## A. Host integration — the route

`#/my-day` is now a ~260-line route adapter (`src/MyDayApp.tsx`):

1. **Auth boundary** — no workspace is created before Firebase identity resolves.
2. **Entitlement** — `useMyDayAccess` + `PremiumGate variant="myday" asPage` when
   the allowance is spent; browsing stays open, the server refuses creates.
3. **Workspace** — lazy `import("./joplin/JoplinWorkspace")` inside
   `JoplinWorkspaceBoundary` (error boundary, retry, reload, home), which probes
   `/my-day-workspace/dc-workspace.json` before mounting the frame.
4. **Migration** — marker-driven, resumable, only for signed-in users, with a
   notice while it runs.
5. **Deep links** — legacy `#/my-day?section=…&item=…` URLs are translated to the
   migrated target; links arriving while the workspace is open are forwarded
   again through the bridge.

No `#/notes`, `#/schedule` or `#/reminders` route was added; the global rail/footer
still show exactly one "My Day" entry.

## B. Retiring the old UI

20 files under `src/components/myday/` were **deleted** (Overview, Tasks,
Schedule, Reminders, Quick Notes, Timeline, TaskList, TaskItem, TaskModal,
ScheduleModal, SideNav, BottomNav, CreateMenu, GreetingHeader, HeroArt,
MyDayCalendar, ProgressRing, OverviewSideCards, StoreBanner, quotes) together
with the 9 contract-test files that pinned them. Nothing mounts the planner, and
nothing mounts it invisibly: the route renders no task/schedule/note UI at all.

Seven pre-existing test failures at the base commit were *about* the retired
planner and disappeared with it; the remaining suites were updated where they
asserted the planner's chrome (footer capsules, page-enter panel, store header,
CreateMenu, QuickNotes, CREATE_OPTIONS, push-scheduler timezone) and now assert
the replacement contract instead.

## C. One canonical data model

| Collection | Contents |
| --- | --- |
| `users/{uid}/joplinItems` | notes, to-do notes, notebooks (Joplin `type_` 1/2) |
| `users/{uid}/joplinTags` | tags (type_ 5) |
| `users/{uid}/joplinResources` | attachment metadata (type_ 4) |
| `users/{uid}/scheduledItems` | the universal schedule series |
| `users/{uid}/joplinMeta/{profile,syncState,migrationV1}` | device/profile state |

There is no second note store, no second tag engine and no second scheduler: the
legacy `myDay/current` document is read once, by the migration, and never written
by the retired UI again.

## D. Migration (see `docs/myday-to-joplin-migration.md`)

* task → to-do note (status preserved as three distinct states, not collapsed to
  `pending`); quick note → note keeping its HTML; reminder → to-do note **plus** a
  scheduler row with `myday_reminder_meta` category/note; schedule event → linked
  schedule record (never flattened into a note body).
* Deterministic 32-hex ids (`joplinIdForLegacy` / `joplinIdForNamed`), duplicate
  legacy ids refused before any row is built, phases
  `tasks → notes → reminders → schedule`, per-phase verification, resumable marker,
  legacy data retained, `/api/myday` still answering.
* Server write path `POST /api/joplin/migrate` is idempotent (writes only rows
  that do not exist, never overwrites an edit made after a run) and does **not**
  consume the daily allowance.

## E. Scheduling

`ScheduledItem` (`src/joplin/scheduling/`) makes *anything* schedulable: note,
to-do, notebook, tag, web clip, attachment, or a custom idea. One-time / daily /
weekly / weekdays / monthly / interval recurrence computed in an explicit IANA
zone; `count` / `until` / weekday / month-day selectors; series stored once,
occurrences computed on demand; this-occurrence vs future vs series editing via
exceptions; a bounded catch-up window for missed occurrences.

Scheduling is an action inside the workspace — there is no schedule page, and no
snooze is claimed because the existing system has no snooze contract.

## F. Notifications — one delivery authority

The workspace **feeds** the existing runtime; it does not notify:

* stable keys `schedule:<scheduleId>:occurrence:<occurrenceKey>`;
* inbox document id `occurrenceNotificationDocId(scheduleId, occurrenceKey)` so
  the cron, the foreground check and the Android alarm dedupe on the SAME id;
* Web Push (`api/push/send.ts`), Android exact alarms
  (`utils/capacitorBridge.ts`), the in-app inbox, `#/notifications` and the
  deep-link resolver are all the pre-existing ones;
* a schedule change dispatches `SCHEDULE_CHANGED_EVENT` so the runtime re-arms
  immediately; `src/main.tsx` switches its foreground scheduler source by the
  migration marker (canonical rows, or the legacy snapshot until the marker is
  complete);
* joplin notification targets (`noteId` / `notebookId` / `tagId` / `resourceId` /
  `scheduleId`) are a superset of the legacy `mayday` target, which still works;
* the server half is wired: cron job **2a** expands `scheduledItems` through
  `utils/scheduleOccurrences.js` (a mirror of the client recurrence maths, kept
  honest by a parity suite), writes the SAME inbox document id the device writes
  and sends the SAME push tag the device uses, so a Web Push and a local alert
  for one occurrence collapse into one notification;
* delivery is recorded on the schedule row itself (`lastFiredKey` /
  `lastFiredAt`) — the field the foreground path already reads — instead of a
  second per-day log, and the legacy job skips any learner whose
  `joplinMeta/migrationV1` marker is complete, so the transition window closes
  per account and no reminder arrives twice from two models.

## G. Web Clipper

Manifest V3 extension (`extensions/joplin-clipper/`, Chrome/Edge/Brave +
Firefox), original code, packaged by `npm run clipper:build` into two ZIPs with
per-artifact SHA-256. Single-use 10-minute pairing code; 32-byte scoped
`clip:write` tokens stored as SHA-256 hashes, rotatable, revocable, expiring,
capped at five live extensions; no Firebase refresh token, no ID token and no
session in extension storage. Clips are validated server-side and land as real
notes in the **Web Clippings** notebook (nested under the workspace root), with
`source_url` set; re-clipping the same page the same day updates that note.
The app side lives at Profile → **Usage & Limits** → *Web Clipper* — deliberately
not inside `#/my-day`, which belongs to Joplin's UI.

## H. Auth & security

Firebase login only (one identity, no second login), user-scoped bridges,
short-lived ID tokens across the frame bridge, `signout` message + frame unmount
so no data of user A can flash for user B. Rules were **tightened, not weakened**:

* client `create` on `joplinItems` / `scheduledItems` / `joplinResources` /
  `joplinTags` is refused — except the sync layer's conflict copy, recognised by
  its `<id>_conflict_<epochMs>` id shape;
* `joplinClipperCodes` / `joplinClipperTokens` are server-only;
* `storage.rules` gained a `myDayWorkspace/{uid}/resources/**` block with the
  same 25 MB ceiling and MIME list the client enforces;
* the pre-existing `myDay/*` and `myDayUsage/*` admin-only posture is untouched.

## I. Build & ops

* Host stays on **Vite**; Joplin is built by its own Webpack from a pinned commit
  through `scripts/joplin/build-workspace.mjs` (documented `extensionAlias` patch,
  idempotent, refuses to run if upstream's config changes shape) and published
  with `dc-workspace.json`. CI: `.github/workflows/joplin-artifacts.yml`.
* Lazy loading, error boundary with retry, honest "runtime not built" state, one
  scroll context, no extra dark/white page plate under Joplin.
* **No site-wide COOP/COEP.** They are only needed for SQLite WASM's OPFS path
  and must be scoped to `/my-day-workspace/*` if a deployment needs them.

## J. Verification (what was actually run here)

| Check | Result |
| --- | --- |
| `bash run_tests.sh` (3 135 tests) | **3 059 pass / 31 fail — zero new failures** vs the pristine base commit (38 pre-existing, 7 of which were the retired planner's own contracts and are now gone) |
| `node --test tests/joplin*.test.mjs` | 8 suites green (migration, rich text, recurrence, notifications, deep links, clipper, schedule parity, cron delivery) |
| `tests/joplinScheduleParity.test.mjs` | server mirror vs `src/joplin/scheduling/recurrence.ts` over daily / weekly / weekdays / monthly / interval / DST / `until` fixtures — 4/4, no instant, key or id differs |
| `tests/joplinCronDeliveryContract.test.mjs` | cron job 2a: canonical table, one inbox doc per occurrence, device tag, row-level dedupe, per-learner legacy cutoff — 6/6 |
| `npx tsc --noEmit` | **9 errors — exactly the 9 pre-existing `TS6133`s**; new code adds none |
| `npx vite build` | passes (host app, production) |
| `node scripts/joplin/build-clipper.mjs` | two ZIPs written, `unzip -l` verified |
| Joplin web bundle (this sandbox) | **not produced here**: production Terser dies at the ~2.7 GB seal step in 3.8 GB RAM (reproduced twice); development mode compiles in ~30 s and emits `app.bundle.js` (27 MB) but is not a shippable artifact |

## K. Real limitations (nothing else is claimed)

1. **The compiled Joplin bundle is not in this repository and was not run here.**
   Artifact 1 of the deliverable is produced by CI
   (`joplin-artifacts.yml`) or `npm run joplin:build`. Until it is deployed,
   `#/my-day` shows the honest "workspace runtime not built" state.
2. **The frame-side bridge client ships with the bundle pipeline**, not with the
   host: `app-ready` / `token-request` / `open` / `signout` were designed and are
   asserted on the host side, but the in-frame half has not been exercised
   against a real build in this sandbox.
3. **Production-grade minification of the bundle needs more memory than this
   sandbox has** (≈ 8 GB+). The CI runner is sized for it; the documented
   `JOPLIN_BUILD_MODE=development` fallback is for sandboxes only.
4. **Web-incompatible Joplin features are reported, not faked** — camera/document
   scanner, biometric lock, SAF folders, native share sheet, quick actions,
   native exit, document picker, zip-archive helpers, Whisper voice typing,
   MaterialCommunityIcons, and third-party plugins. See
   `docs/joplin-myday-architecture.md` §9 for the exact mock list they come from.
5. **Cross-origin isolation is not enabled.** If the deployed frame turns out to
   need OPFS/SharedArrayBuffer, the headers must be scoped to
   `/my-day-workspace/*` and verified there; that work is not done.
6. **Migration is capped per phase** at 3.8 MB / 400 rows per request. A learner
   beyond that keeps every legacy row and can re-run; nothing is deleted.
7. **HTML→Markdown conversion of legacy plain-text notes is lossy by nature**
   (nested tables, inline positioning). Quick notes that were HTML keep their
   HTML instead of being converted.
8. **No snooze**, no schedule-attached notes duplication, no occurrence rows —
   deliberate: one series row per schedule, computed occurrences, and no second
   scheduling model.
9. **The clipper's notebook choice is fixed** ("Web Clippings", created
   server-side on first clip). A notebook picker would need a second scope on the
   token; that trade-off was not taken.
10. **`/api/myday` remains as a compatibility endpoint** and is expected to be
    retired only after every account's marker is complete; it is not deleted in
    this change.
11. **`pre-existing test failures (31) are untouched** — they belong to other
    features (store, FlowPath, admin, APK release, etc.) and are outside this
    task's scope; the baseline list is in the session notes, and this change
    neither adds to nor hides them.
