# Unified Server Push — Every Notification on the Real-Time System

## Why

Before this change only **My Day activity reminders** used the real-time push
system (the minute pinger → `api/cron/subscription-renewals`), which delivers
at the exact time **whether the app is open or closed**.

Every other notification still had a **client-side generator**: on each app
open, `src/main.tsx` and `NotificationsPage.tsx` recomputed a localStorage
baseline diff and created "new product", "product unlocked", "course content"
and renewal notifications locally. Two problems:

1. **App had to be open** — nothing arrived while the app was closed unless a
   separate server path happened to cover it.
2. **Repeats** — the baseline was keyed to `purchasedIds`, which streams in
   *after* the catalog. A save with an empty purchase list clobbered the
   baseline, and the next render re-announced every owned product as
   **"Product unlocked"** — the recurring-notification bug users saw on every
   app open.

## What changed

**All notification generation now lives on the server.** The client only
*mirrors* `users/{uid}/notifications` docs and renders them.

| Notification | Server path | Idempotent doc id |
|---|---|---|
| My Day tasks / schedule / reminders | cron scheduler (minute pinger) | `kind:itemId:date` |
| Subscription renewals (7d/3d/1d/due/expired-n) | cron scheduler | `subscription-renewal:{expiresAt}:{stage}` |
| Product unlocked / subscription activated | `api/razorpay/verify-payment` (instant) | `unlock:{orderId}` |
| New product (free/paid) | `api/push/send` product-created (instant) + cron catch-up | `content:product:{id}` |
| Course content update (buyers) | `api/push/send` product-updated (instant) + cron catch-up | `content:course:{id}:...` |

Every path writes the bell doc **and** sends the Web Push with the same deep
link, so closed-app delivery and cross-device sync are automatic, and re-runs
can never duplicate (doc ids are deterministic; the cron keeps per-job dedupe
state in Firestore, not localStorage).

### Removed (do not reintroduce)

- `src/main.tsx`: the `createContentNotifications` baseline-diff effect and the
  `getRenewalReminder` snapshot effect.
- `NotificationsPage.tsx`: the "app-open fallback" that re-created renewal
  notifications locally on every visit.
- `utils/siteNotifications.ts`: `buildContentNotificationInventory`,
  `createContentNotifications`, `createCommunityActivityNotifications`,
  content/community baseline load/save, and the unused preference helpers.

### Storage migration

Local mirror storage moved from `eduvora.siteNotifications.v1` to **`.v2`**.
`loadSiteNotifications` purges every legacy key
(`siteNotifications.v1`, `siteNotificationContentBaseline.v1`,
`siteNotificationCommunityBaseline.v1`) so stale client-generated duplicates
disappear for good on first load.

`mergeSiteNotifications` read-state is now **monotonic**: read on either side
(local mirror or cloud doc) stays read, so a notification marked read on one
device can no longer bounce back as unread on another.

### Cron additions

The content-announcement job in `api/cron/subscription-renewals.ts` now also
writes the `content:product:{id}` bell doc for every user (it previously only
sent the Web Push, leaving the bell empty when the instant admin path was
skipped). Same doc id as the instant path → no duplicates.

## Delivery guarantee (unchanged, now for everything)

### Who pings the scheduler

**Google Cloud Scheduler is the primary pinger.** The GitHub Actions workflows
are kept as a free backup, and the Vercel daily cron is the last safety net.

| Tier | Source | Real cadence |
| --- | --- | --- |
| **Primary** | Cloud Scheduler job `push-scheduler-minute` (`my-website-761e9`, `asia-south1`), set up by `ops/setup-cloud-scheduler.sh` | `* * * * *` UTC — a real ping every 60s, with 2 retries (`5s`→`60s`, 3 doublings) and a `120s` attempt deadline |
| **Backup (free)** | `.github/workflows/push-scheduler.yml` **and** `push-scheduler-backup.yml`, both calling the shared `.github/actions/ping-loop` action | each start runs a ~5-hour ping loop; GitHub's `schedule` trigger drifts 1–5+ hours and often drops minute events, and the two workflows share one concurrency group so only one loop runs at a time |
| **Safety net** | Vercel cron `30 0 * * *` | once a day; `resolveLookbackMs` sizes the catch-up window from the last successful run (cap 2h, override via `MYDAY_MAX_CATCHUP_HOURS`) |

The Cloud Scheduler job authenticates with the header
`Authorization: Bearer <CRON_SECRET>` and **no OIDC token** — an OIDC token and
a custom `Authorization` header cannot be combined on a Cloud Scheduler HTTP
target, and the endpoint validates the shared secret. Setup, verification and
alerting: `ops/cloud-scheduler-setup.md`.

**Both tiers ping at once sometimes, and that is fine.** Every notification
path is idempotent: My Day items dedupe on `kind:itemId:localDate` in
`notificationLog`, and the other kinds use deterministic notification doc ids.
Two pingers landing in the same minute cost a few Firestore reads and change
nothing user-visible, so the backup is never switched off.

### Precision: within the scheduled minute

The pinger wakes the scheduler every 60s; each run sweeps everything that fell
due since the previous successful run. So a notification lands **inside the
minute it was scheduled for** (~60s worst-case lateness) — not hours later, and
not only when the app is next opened. If pings stop entirely, the 2h catch-up
window turns "missed" into "late" rather than "never".

### Device-side behaviour of each push

- **FCM** (`api/_lib/fcm.ts`): `android.priority: "high"` so Doze does not batch
  the message away, `android.ttl: 24h` so an **offline device still receives it
  for 24 hours** after it reconnects, and an `android.notification` block so the
  system tray renders it (with the brand silhouette `ic_stat_eduvora`) whether
  or not the app is running.
- **Web Push**: same `TTL: 86400`; dead endpoints (404/410) are deleted on send.
- **Foreground**: the same deterministic `tag` makes the OS replace rather than
  duplicate a notification that arrives while the app is open.

### ⚠️ OEM battery optimisation is outside this system's control

Xiaomi/Redmi (MIUI, HyperOS), Vivo/iQOO (FuntouchOS), Oppo/Realme/OnePlus
(ColorOS, Realme UI) and some Samsung builds block **autostart** and throttle
background apps. The ping then succeeds server-side (a `200` in the Cloud
Scheduler execution history) while the device refuses to wake the app, so the
notification appears only when the user opens it. The remedy is per-device
settings (autostart on, battery unrestricted, app locked in recents) — an
in-app guide screen is still to be built:
**[battery-optimisation screen](#followup)** (route placeholder
`#/notifications/battery-optimisation`). Per-brand steps:
`ops/cloud-scheduler-setup.md`.
