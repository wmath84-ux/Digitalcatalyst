# Unified Server Push — Every Notification on the Real-Time System

## Why

Before this change only **My Day activity reminders** used the real-time push
system (the GitHub Actions minute pinger → `api/cron/subscription-renewals`),
which delivers at the exact time **whether the app is open or closed**.

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

- `.github/workflows/push-scheduler.yml` pings the scheduler every minute.
- Daily Vercel cron (`30 0 * * *`) is the safety net; `resolveLookbackMs`
  sizes the catch-up window from the last successful run.
- Dead push endpoints (404/410) are deleted on send.
