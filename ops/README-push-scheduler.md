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
| Push delivery | `web-push` → `public/sw.js` `push` handler |
| Foreground safety net | `src/main.tsx` (while the app is open) |
| Per-item, per-day dedupe | `notificationLog` on `users/{uid}/myDay/current` |

The user's device timezone is written to the My Day document on every save, so
"09:00" means 09:00 *where the user is*, not 09:00 UTC.

---

## ⚠️ One manual step is required

**Nothing fires on time until an external pinger calls the scheduler.**

Vercel's Hobby plan caps cron at **one run per day** — a sub-daily expression
in `vercel.json` fails at deploy time, and even the daily run can land
anywhere inside its hour. The daily cron in `vercel.json` is only a fallback
sweep. Minute-accurate reminders need something calling the endpoint every few
minutes.

### Option A — GitHub Actions (free, lives in this repo)

The agent's GitHub App is not permitted to commit workflow files, so install
the template yourself:

```bash
mkdir -p .github/workflows
cp ops/push-scheduler.workflow.yml .github/workflows/push-scheduler.yml
git add .github/workflows/push-scheduler.yml
git commit -m "Add push scheduler workflow"
git push
```

Then add two repository secrets under **Settings → Secrets and variables →
Actions**:

| Secret | Value |
| --- | --- |
| `CRON_SECRET` | the same value as the `CRON_SECRET` env var on Vercel |
| `SCHEDULER_URL` | `https://<your-domain>/api/cron/subscription-renewals` |

Verify from the **Actions** tab → *Push scheduler* → **Run workflow**. A green
run returns a JSON summary with a `myDay` block.

### Option B — any external cron service

cron-job.org, UptimeRobot, Runhooks, or your own box. Same endpoint, every
5 minutes:

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

The window is capped at **one hour**. A 9 AM reminder delivered at 6 PM is
noise, and trains people to ignore the channel — so genuinely stale items are
skipped rather than dumped all at once.

---

## Checklist when a notification does not arrive

1. **Permission** — the device must have granted notifications. The app asks
   on first tap; `#/notifications` shows the current state and a re-request
   button.
2. **VAPID keys** — `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`
   and `WEB_PUSH_SUBJECT` set on Vercel. Without them `pushConfigured()`
   returns false and every send is a silent no-op.
3. **`CRON_SECRET`** — set on Vercel *and* matching the pinger's header, or
   the endpoint answers 401.
4. **A saved device** — `users/{uid}/webPushSubscriptions` must be non-empty.
   Dead endpoints (404/410) are pruned automatically.
5. **iOS** — Safari only delivers Web Push to a PWA that has been added to the
   Home Screen. A tab in the browser will never receive one.
6. **Timezone** — `tzOffsetMinutes` on `users/{uid}/myDay/current` is written
   on every save; a document that predates that field is skipped.
