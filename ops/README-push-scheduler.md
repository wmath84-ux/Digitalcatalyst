# Exact-time reminders: how delivery actually works

My Day tasks, schedule events and reminders fire a **system notification at
the exact local time the user set**, whether the app is open, backgrounded,
or fully closed.

Closed-app delivery is Web Push: the server sends to the device, the service
worker (`public/sw.js`) wakes and shows the notification. No page needs to be
running. The pieces:

| Piece | Where |
| --- | --- |
| Due-item detection | `utils/pushScheduler.js` → `collectDueMyDayItems` |
| Scheduler endpoint | `api/cron/subscription-renewals.ts` (job 2) |
| Push delivery | `api/_lib/webpush.ts` (CJS/ESM shim over `web-push`) → `public/sw.js` `push` handler |
| Foreground safety net | `src/main.tsx` (while the app is open) |
| Per-item, per-day dedupe | `notificationLog` on `users/{uid}/myDay/current` |

The user's device timezone is written to the My Day document on every save, so
"09:00" means 09:00 *where the user is*, not 09:00 UTC.

---

## Minute pinger (required for exact-time delivery)

**Nothing fires on time until an external pinger calls the scheduler.**

Vercel's Hobby plan caps cron at **one run per day** — a sub-daily expression
in `vercel.json` fails at deploy time, and even the daily run can land
anywhere inside its hour. The daily cron in `vercel.json` is only a fallback
sweep. Minute-accurate reminders need something calling the endpoint every
minute.

### Option A — GitHub Actions (free, lives in this repo) — already installed

Two live workflows both run every minute (`cron: "* * * * *"`):

- `.github/workflows/push-scheduler.yml` — primary
- `.github/workflows/push-scheduler-backup.yml` — identical backup, so a
  throttled/dropped schedule event for one workflow doesn't leave a hole

Both call the shared action `.github/actions/ping-loop/action.yml`, share the
`push-scheduler` concurrency group (only one loop ever runs; the other
queues), and each scheduled start runs a **~5-hour loop** that pings every
60 seconds. The long loop is the important part: GitHub's `schedule` trigger
delivered start events 1–5+ hours apart on this repo, so a run that only
pinged once (or looped 21 minutes) left multi-hour gaps. A 5-hour loop is
still pinging when the next start queues, and the queued loop begins the
instant the active one ends. `ops/push-scheduler.workflow.yml` is the
kept-in-sync template.

Only two repository secrets are needed under **Settings → Secrets and
variables → Actions** (set them once):

| Secret | Value |
| --- | --- |
| `CRON_SECRET` | the same value as the `CRON_SECRET` env var on Vercel |
| `SCHEDULER_URL` | `https://<your-domain>/api/cron/subscription-renewals` |

A run goes **red only if every ping in the loop fails**; the failure
annotation includes the last HTTP code (`000` = DNS/deployment down, `401`
= `CRON_SECRET` mismatch, `5xx` = function error), so a red run pinpoints the
cause. Verify from the **Actions** tab → *Push scheduler* → **Run workflow**.
A green run logs `tick n/300: HTTP 200 …` and the JSON summary has a `myDay`
block. Watch for red runs — a streak of them means no pings are landing and
reminders will silently stop.

### Option B — any external cron service

cron-job.org, UptimeRobot, Runhooks, or your own box. Same endpoint, every
minute (the closer to one minute, the closer to exact-time delivery):

```
GET https://<your-domain>/api/cron/subscription-renewals
Authorization: Bearer <CRON_SECRET>
```

Every job is idempotent, so overlapping or extra pings are harmless.

---

## Why a missed ping no longer loses a reminder

The scheduler records `lastRunAt` in `settings/pushSchedulerState` **after**
all its jobs succeed. The next run sizes its catch-up window from that
timestamp (`resolveLookbackMs`), so a run always covers the gap since the
previous one. A late ping delivers a late reminder instead of no reminder.

The window is capped at **two hours** (`MYDAY_MAX_CATCHUP_MS` in
`utils/pushScheduler.js`). A 9 AM reminder delivered at 6 PM is noise, and
trains people to ignore the channel — so genuinely stale items are skipped
rather than dumped all at once. To widen the cap temporarily while
recovering from a long pinger outage (so same-day reminders are swept up
instead of skipped), set `MYDAY_MAX_CATCHUP_HOURS` on the Vercel function
(e.g. `6`); no deploy is needed.

---

## Checklist when a notification does not arrive

1. **Permission** — the device must have granted notifications. The app asks
   on first tap; `#/notifications` shows the current state and a re-request
   button.
2. **VAPID keys** — `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`
   and `WEB_PUSH_SUBJECT` set on Vercel. Without them `pushConfigured()`
   returns false and every send is a silent no-op.
3. **`CRON_SECRET`** — set on Vercel *and* matching the pinger's header, or
   the endpoint answers 401 (the Actions run goes red with a `401` in its
   failure annotation).
3b. **Pinger health** — open the **Actions** tab and check the *Push
   scheduler* and *Push scheduler (backup)* runs. A red run means no pings
   landed for ~5 hours; a missing workflow means GitHub disabled it after
   60 days without repo activity (any commit to the default branch
   re-enables it). Green runs with healthy ticks = the scheduler is being
   pinged every minute.
4. **A saved device** — `users/{uid}/webPushSubscriptions` must be non-empty.
   Dead endpoints (404/410) are pruned automatically.
5. **iOS** — Safari only delivers Web Push to a PWA that has been added to the
   Home Screen. A tab in the browser will never receive one.
6. **Timezone** — `tzOffsetMinutes` on `users/{uid}/myDay/current` is written
   on every save; a document that predates that field is skipped.
