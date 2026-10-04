# My Day architecture — the Joplin workspace host

`#/my-day` is ONE personal workspace: **Joplin's own web application**, built
from a pinned upstream commit and mounted as a sub-application inside the
Digitalcatalyst shell. This document is the map: what runs where, what the
contracts are, and what the browser simply cannot do.

> Related: `docs/myday-to-joplin-migration.md` (legacy → canonical mapping),
> `docs/joplin-integration-license-note.md` (AGPL/trademark obligations),
> `docs/joplin-myday-a-k-report.md` (status and real limitations).

## 1. Shapes at a glance

```
#/my-day
└── src/MyDayApp.tsx                 route adapter (≈260 lines, no planner UI)
    ├── auth boundary                (Firebase identity or a sign-in notice)
    ├── useMyDayAccess + gate        (browse always; creating is what's metered)
    ├── migration runner             (marker-driven, resumable, idempotent)
    └── src/joplin/JoplinWorkspace   lazy chunk, error boundary, manifest probe
        └── <iframe src="/my-day-workspace/index.html">
            └── Joplin web build (React Native Web), its own CSS/SW/SQLite
```

Data:

```
users/{uid}/joplinItems        notes · to-do notes · notebooks   (Joplin type_ 1/2)
users/{uid}/joplinTags         tags                              (type_ 5)
users/{uid}/joplinResources    attachment metadata               (type_ 4)
users/{uid}/scheduledItems     universal schedule series
users/{uid}/joplinMeta/*       profile · syncState · migrationV1
users/{uid}/myDayUsage/current the ONE daily allowance (shared with the old API)
```

Notifications keep living where they always did:
`users/{uid}/notifications/{docId}` + Web Push + Android local alarms + the
in-app inbox at `#/notifications`.

## 2. Why a frame, and why not an import

* There is no `@joplin/joplin` package. Joplin's web UI is `packages/app-mobile`
  compiled by **Joplin's own** Webpack config (two targets: `web` for the app,
  `webworker` for its service worker) against `react-native-web`.
* The host keeps **Vite**. Converting the host to Webpack, or injecting Joplin's
  loader rules globally, would put two compilers and two module universes in one
  build. Instead the bundle is a **build artifact** served from
  `/my-day-workspace/` with a manifest (`dc-workspace.json`).
* `src/joplin/joplinRuntime.ts` probes that manifest (`cache: "no-store"`) and
  returns `ready` / `missing` / `error`. Refusals are explicit:
  `manifest_invalid`, `bridge_protocol_mismatch`.
* The frame is same-origin and **not** a security sandbox: the security boundary
  is the API + Firestore/Storage rules. The frame is a CSS/JS/scroll isolation
  boundary — Joplin's stylesheet cannot reach the host, the host's glass cannot
  reach Joplin, and there is exactly one scroll owner.

### When the bundle is absent

`#/my-day` renders an honest state: what is missing, the exact build command
(`npm run joplin:build`), and the docs path. No lookalike planner UI, no blank
screen. This is the state of this checkout — the bundle is a CI artifact
(`.github/workflows/joplin-artifacts.yml`), not a committed file.

## 3. The bridge (`src/joplin/joplinAuthBridge.ts`, `JoplinWorkspace.tsx`)

Channel `digitalcatalyst-myday`, protocol `1`.

| Direction | Message | Purpose |
| --- | --- | --- |
| host → frame | `host-hello` (protocol) | handshake |
| frame → host | `app-ready` (protocol) | frame announces itself; mismatch ⇒ refuse |
| host → frame | `identity` | uid, email, displayName, locale, timeZone |
| host → frame | `open` (`href`) | canonical deep link (`#/my-day?note=…`) |
| host → frame | `signout` | frame must stop and clear |
| host → frame | `token` (requestId, token) | short-lived ID token, `TOKEN_TTL_SECONDS = 55 * 60` |
| frame → host | `token-request`, `navigate`, `schedule-message`, `resource-request` | the frame's needs |

Rules the host enforces:

* **No refresh tokens cross the bridge** — only short-lived ID tokens, minted
  per request.
* Frames may navigate **in-app only** (`#/…`); `https:` opens externally; anything
  else is dropped.
* A **20 s** handshake timeout ends in `silent` + a retry path, not a spinner
  forever.
* Sign-out posts `signout` and unmounts the frame (streams, alarms and writes
  stop; nothing of user A can flash for user B).
* A deep link that arrives while the workspace is already open is forwarded again
  (`deepLink` prop → `open` message), so a notification tap is never swallowed.

## 4. Data model and write discipline

| Operation | Path | Why |
| --- | --- | --- |
| create note/notebook/tag/attachment/schedule | `POST /api/joplin/{items,schedules,resources,migrate}` | entitlement + allowance + idempotency in ONE Firestore transaction |
| update / soft-delete | direct Firestore merge (rules: owner) | must work offline, must never cost an allowance |
| migration phase | `POST /api/joplin/migrate` | staged, idempotent, verifiable, no allowance |
| web clip | `POST /api/joplin/clipper` | token-auth path that reuses the same create routine |

* Rows carry `rev`, `updated_time`, `syncedAt`, `ownerId`; timestamps are epoch
  ms (`timestampMs` normalises Firestore `Timestamp`s at the edge).
* Conflict policy: rev match ⇒ apply; otherwise the newer `updated_time` wins; a
  tie writes a copy with id `<id>_conflict_<epochMs>`. That copy is the ONE client
  create `firestore.rules` allows, and the rules recognise it by the id shape.
* Soft delete uses Joplin's `deleted_time`; nothing is destroyed on the first
  cutover.
* Attachment flow: metadata row first (server), then bytes to
  `myDayWorkspace/{uid}/resources/{resourceId}/{safeName}` (25 MB cap, MIME
  allow-list mirrored in `storage.rules`), then the download URL is merged back.
  A resource is deleted only when no note references it.

## 5. Universal scheduling

Scheduling is an **action inside the workspace**, not a page: a `scheduledItems`
row can point at a note, to-do, notebook, tag, web clip, attachment or a custom
idea (`ScheduleTargetType`).

* Recurrence: `once | daily | weekly | weekdays | monthly | interval`
  (`src/joplin/scheduling/recurrence.ts`), computed in an explicit IANA zone,
  with `count` / `until` and weekday/month-day selectors.
* The series is stored **once**; occurrences are computed on demand
  (`occurrencesBetween`), never expanded into documents.
* Editing: this occurrence (exception), this and future, or the whole series —
  expressed by rewriting the series plus an exception key list rather than by
  duplicating rows.
* Missed occurrences: a bounded catch-up window (2 h on the server, 15 min in the
  foreground), then the occurrence is skipped instead of firing a storm of late
  alarms.
* Snooze: **not implemented**, and not claimed — the existing system has no snooze
  contract, and adding one would be a second scheduling model.
* Changing a schedule dispatches `SCHEDULE_CHANGED_EVENT`
  (`eduvora:myday-schedule-changed`), so the existing notification runtime
  re-arms immediately instead of waiting for its next 15 s tick.

## 6. One delivery authority

The workspace does not notify. It feeds the runtime that already existed:

| Layer | Module | Role |
| --- | --- | --- |
| server push | `api/cron/subscription-renewals.ts` (+ `api/push/send.ts`) | job **2a** expands `users/{uid}/scheduledItems/*` through `utils/scheduleOccurrences.js`, writes `users/{uid}/notifications/<occurrenceNotificationDocId>`, sends Web Push with the tag the device uses (`myday-<scheduleId>:<occurrenceKey>-<section>`) |
| Android native | `utils/capacitorBridge.ts` → `scheduleLocalAlarm`, `showLocalSystemNotification`, `cancelLocalAlarms` | exact-time alarms that fire with the app closed |
| Web Push | `utils/webPush.ts`, `public/sw.js` | background delivery in the browser |
| in-app inbox | `#/notifications` (`notifications` collection + local mirror) | history, filters, unread badge |
| foreground check | `src/main.tsx` | re-checks due occurrences while open |

Key properties:

* **One server authority, one client authority, one key.** The cron expands the
  canonical series rows with `utils/scheduleOccurrences.js` — a mirror of
  `src/joplin/scheduling/recurrence.ts` that exists only because
  `tests/joplinScheduleParity.test.mjs` drives both over the same fixtures
  (daily / weekly / weekdays / monthly / interval, DST gaps and ambiguous hours,
  `until`) and fails on any divergence in an instant, an occurrence key or an
  inbox id. `tests/joplinCronDeliveryContract.test.mjs` then pins the wiring:
  one inbox document per occurrence, the device's own tag, and no second
  `notificationLog`.
* **The legacy planner is cut off per learner, not per release.** Once
  `users/{uid}/joplinMeta/migrationV1` reports a completed migration, job 2
  (`myDay/current`) skips that learner for good; until then job 2a does not see
  their rows because they have not been written. There is no window in which
  both models deliver the same reminder.
* **Stable keys**: `schedule:<scheduleId>:occurrence:<occurrenceKey>`; the inbox
  document id for a canonical occurrence is `occurrenceNotificationDocId(
  scheduleId, occurrenceKey)`, so the server, the foreground check and the local
  alarm all dedupe against the SAME id. There is no path that can deliver the
  same occurrence twice through two systems.
* Deep links: `#/my-day?note=…&notebook=…&tag=…&resource=…&schedule=…&view=…&action=…`.
  Legacy `#/my-day?section=tasks&item=<id>` URLs still resolve — the route
  translates them to the migrated target (`parseMyDayHash` →
  `resolveLegacySection`).
* Android behaviour is unchanged: the alarm channel, exact-alarm permission flow
  and the "app closed / locked / backgrounded" delivery path are the existing
  ones, only the payload now carries the canonical target.

## 7. Entitlement and allowance

One policy, one counter. `api/_lib/myDay.ts` exports the `accessSnapshot` the
Joplin endpoints reuse, reading the same `subscriptionFeatures/my-day` feature
document, the same subscription record and the same `myDayUsage/current`
document the planner used. Browsing the workspace never requires entitlement;
creating does. The admin visibility ("hide from non-subscribers") mode still
works and the client mirrors it (`useMyDayAccess.hidden` +
`usePublishFeatureVisibility("myday", …)`).

## 8. Web Clipper

* `extensions/joplin-clipper/` — Manifest V3 extension for Chrome/Edge/Brave and
  Firefox; `npm run clipper:build` produces both ZIPs with a dependency-free ZIP
  writer.
* Pairing: the app (Profile → **Usage & Limits** → *Web Clipper*) mints a
  single-use code valid for 10 minutes; the extension exchanges it for a
  `clip:write` token. Only hashes are stored (`joplinClipperCodes`,
  `joplinClipperTokens`, server-only in the rules).
* Tokens: 32 random bytes, 90-day expiry, hashed at rest, rotatable, revocable,
  capped at 5 live extensions per learner, and they carry no Firebase identity.
* Clipping: validated server-side (http(s) source, ≤ 2 MB, bounded title/tags),
  written as a real note into the **Web Clippings** notebook (nested under the
  workspace root), with `source_url` set. The note id is derived from
  (owner, canonical URL, day), so clipping the same page twice the same day
  **appends** to that note instead of duplicating it.

## 9. What genuinely works in a browser — and what does not

Joplin's web build is a real application, but it is not the desktop or mobile
app. The webpack config in upstream `packages/app-mobile/web/webpack.config.ts`
replaces a set of native modules with empty mocks, which is the authoritative
list of what the web build cannot do:

| Not available on web | Why (upstream build fact) |
| --- | --- |
| Document scanner / camera capture / image manipulation | `react-native-camera`, `expo-camera`, `expo-image-manipulator` are mocked to empty |
| Biometric app lock | `react-native-fingerprint-scanner` is mocked |
| Storage Access Framework folders (Android SAF) | `@joplin/react-native-saf-x` is mocked |
| Native share sheet | `react-native-share` is mocked |
| Home-screen quick actions, native "exit app" | `react-native-quick-actions`, `react-native-exit-app` are mocked |
| System document picker / zip-archive based import-export helpers | `@react-native-documents/picker`, `react-native-zip-archive` are mocked |
| Voice typing (Whisper) | `react-native-nitro-modules` is mocked |
| MaterialCommunityIcons glyphs | the module is a throwing mock on web |
| Plugins | product decision: no third-party plugin is loaded |
| Share-target / Android intents, desktop-only features (external editor, multi-window, Goto Anything) | not part of the web build at all |

Everything else is web-capable in Joplin's web build: notebooks (nested), notes,
to-do notes, Markdown editing and viewing, search (including full-text via
Joplin's own search), tags, attachments and resources, create/edit/delete, to-do
completion, note properties, themes/settings, offline-first local persistence
(SQLite WASM in the frame) and sync configuration. **Sync is configured in the
frame and performs as Joplin's web build performs it** — it is not implemented by
the host, and the host never claims a sync guarantee it does not own.

### Verification status (read this before believing any of the above)

The **host integration** — route adapter, bridges, migration, scheduler,
notification wiring, clipper, rules, API — is implemented and covered by the test
suites listed below.

The **compiled Joplin bundle itself is NOT executed in this checkout.** The
bundle is a CI artifact: production Webpack dies at Terser while sealing the
~27 MB bundle in the 3.8 GB sandbox this work was done in (reproduced twice), and
a development-mode bundle builds but is not what ships. Nothing in this document
should be read as "verified in a running browser" except the parts explicitly
marked as tested (the bridge message contract, the deep-link translation, the
migration planning, the scheduler maths, the clipper lifecycle, and the host's
own build/lint/test gates). The frame-side bridge client is part of the bundle
pipeline, not of the host, and its verification is therefore a CI/manual step:
`npm run joplin:build` → run the app against it → confirm `app-ready`,
`token-request`, `open` and `signout` in the frame console.

### Cross-origin isolation (deliberately not site-wide)

Joplin's web build uses `@sqlite.org/sqlite-wasm`. Upstream sets
`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
require-corp` **on its dev server only**, "required by @sqlite.org/sqlite-wasm";
`index.web.ts` warns when `window.crossOriginIsolated === false`. We do **not**
add those headers site-wide: they would break third-party embeds, images and
analytics across the whole app. If a deployment needs OPFS-backed storage, the
headers must be scoped to `/my-day-workspace/*` (the frame's own path) and
verified there — that is a deployment decision, documented here, not a silent
global setting.

## 10. Operational rules

* **Lazy**: `src/joplin/JoplinWorkspace` is a dynamic import behind `Suspense`;
  no Joplin bytes on landing, home, store, course player, profile or revision.
* **Failure**: an error boundary with *Retry*, *Reload* and *Back to Home*, plus
  the honest `missing` state; failures are logged without note content.
* **One scroll context**: the frame scrolls itself; the host route adds no
  `overflow-y-auto` wrapper.
* **No double chrome**: the route renders no Digitalcatalyst header, toolbar,
  tab strip or footer on top of Joplin's UI; the global shell (AppShell /
  DesktopShell / BottomNav) keeps working around it, and the global nav item is
  still "My Day".
* **Course notes stay separate**: Course Player notes remain scoped to their
  course/product; they are never merged into the personal workspace.

## 11. Tests

| Suite | Covers |
| --- | --- |
| `tests/joplinMigration.test.mjs` | ids, mapping, phases, refusal of duplicate legacy ids, verification |
| `tests/joplinRichText.test.mjs` | legacy HTML → Markdown |
| `tests/joplinScheduleRecurrence.test.mjs` | wall-clock recurrence, DST, exceptions |
| `tests/joplinScheduleNotifications.test.mjs` | due/upcoming collection, send keys, dedupe |
| `tests/joplinDeepLinks.test.mjs` | legacy hash → canonical target, malformed input |
| `tests/joplinClipper.test.mjs` | id mirror vs the workspace, pairing/token lifecycle, payload validation |

Plus the existing suites for the notification runtime, the deep-link contracts
and the shell, which the route changes had to keep green (see the A–K report for
the exact list and the count).
