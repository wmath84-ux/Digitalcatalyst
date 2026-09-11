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

Three tiers of pinger exist. Only the first one is *reliable* — the other two
are free redundancy, and all three hit the same idempotent endpoint.

| Tier | Who | Real cadence | Cost |
| --- | --- | --- | --- |
| **Primary** | Google Cloud Scheduler job `push-scheduler-minute` | every minute, on the dot | 3 free jobs per billing account, then $0.10/job/month |
| **Backup** | `.github/workflows/push-scheduler.yml` **+** `push-scheduler-backup.yml` | ~5h loops, but GitHub delivers the *start* events 1–5+ hours apart | free (public repo) |
| **Safety net** | Vercel daily cron `30 0 * * *` | once a day | free |

### Primary — Google Cloud Scheduler (`push-scheduler-minute`)

One Cloud Scheduler HTTP job, created and maintained by
**`ops/setup-cloud-scheduler.sh`** (idempotent — re-running it updates the job
in place):

| Field | Value |
| --- | --- |
| Project / region | `my-website-761e9` / `asia-south1` |
| Job id | `push-scheduler-minute` |
| Schedule | `* * * * *`, time zone `UTC` |
| Target | `GET https://eduvora.app/api/cron/subscription-renewals` |
| Auth | header `Authorization: Bearer <CRON_SECRET>`, **no OIDC token** |
| Attempt deadline | `120s` |
| Retry | max `2` attempts, `5s` → `60s` backoff, `3` doublings |

```bash
export CRON_SECRET='<the CRON_SECRET env var from Vercel>'
bash ops/setup-cloud-scheduler.sh          # add --dry-run to preview
```

No OIDC token is attached on purpose: an OIDC token and a custom
`Authorization` header are mutually exclusive on a Cloud Scheduler HTTP target,
and this endpoint authenticates with the shared secret. Full walkthrough in
Hindi + English — Blaze upgrade, ₹100 budget alert, the console-only click
path, "Run now" verification and execution history — lives in
**`ops/cloud-scheduler-setup.md`**. Alerting policy (plus a log-based fallback):
**`ops/cloud-scheduler-alert-policy.json`**.

Health check: `gcloud scheduler jobs describe push-scheduler-minute
--location=asia-south1 --project=my-website-761e9`, and the execution history in
Cloud Logging (`resource.labels.job_id="push-scheduler-minute"`) should show one
`200` per minute.

### Backup — GitHub Actions (free, lives in this repo) — keep both enabled

Two live workflows both run every minute (`cron: "* * * * *"`):

- `.github/workflows/push-scheduler.yml`
- `.github/workflows/push-scheduler-backup.yml` — identical, so a
  throttled/dropped schedule event for one workflow doesn't leave a hole

They were the primary pinger before Cloud Scheduler was added, and they stay
turned on as free redundancy: if the Cloud Scheduler job is paused, deleted, or
the billing account lapses, reminders keep flowing (late, but alive).

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

### Why the overlap between primary and backup is harmless

Cloud Scheduler and the two GitHub workflows will sometimes ping inside the
same minute. Nothing duplicates:

- **My Day items** dedupe on `kind:itemId:localDate`, written to
  `notificationLog` on `users/{uid}/myDay/current` — one item fires once per
  local day (`collectDueMyDayItems`).
- **Renewals / content / unlocks** use deterministic notification doc ids
  (`subscription-renewal:{expiresAt}:{stage}`, `content:product:{id}`,
  `unlock:{orderId}`), so a second run re-writes the same doc and creates
  nothing.
- **Push tags** are deterministic too (`myday-${item.key}`), so Android
  replaces the notification instead of stacking a copy.

The only cost of an extra ping is a few Firestore reads. That is why the
backup is never switched off.

### Any other external cron service

cron-job.org, UptimeRobot, Runhooks, or your own box. Same endpoint, every
minute (the closer to one minute, the closer to exact-time delivery):

```
GET https://<your-domain>/api/cron/subscription-renewals
Authorization: Bearer <CRON_SECRET>
```

Every job is idempotent, so overlapping or extra pings are harmless.

---

## Precision: "within the scheduled minute"

The pinger does not fire a notification at the exact millisecond the user
picked; it wakes the scheduler every 60 seconds and the scheduler sweeps
everything that fell due since the previous successful run
(`resolveLookbackMs`). So the practical guarantee is:

> a reminder lands **inside the minute it was set for**, ~60s worst-case
> lateness — not hours.

Anything coarser than a one-minute cadence breaks that promise, which is why
the every-minute schedule is pinned by tests
(`tests/myDayExactTimeDeliveryContract.test.mjs`) in the Cloud Scheduler script
*and* in both workflows.

---

## FCM high priority, Doze and offline TTL

The scheduler fans every notification out to **Web Push** (browser/PWA) and
**FCM** (the installed Android TWA) in parallel — `api/_lib/fcm.ts`:

- `android.priority: "high"` — asks FCM to deliver even while the device is in
  Doze/idle, instead of batching it into the next maintenance window.
- `android.ttl: 60 * 60 * 24 * 1000` (24h) — if the device is offline, FCM
  **stores the message for 24 hours** and delivers it the moment the device
  reconnects. A phone left off overnight still gets the reminder in the
  morning, inside that window.
- `android.notification` block (`icon: ic_stat_eduvora`, `tag`, `clickAction`) —
  the system tray renders the notification itself, with the brand silhouette
  small icon, whether the app is running or not.
- `data` payload — when the app is in the foreground the Capacitor bridge
  renders the same notification via `LocalNotifications`; the shared `tag`
  makes the OS replace rather than duplicate it.

The Web Push side uses the same 24h `TTL: 86400`, and endpoints that answer
404/410 are deleted on send.

## ⚠️ Xiaomi / Vivo / Oppo autostart caveat (device-side, not fixable server-side)

MIUI/HyperOS (Xiaomi, Redmi, POCO), FuntouchOS (Vivo, iQOO), ColorOS/Realme UI
(Oppo, Realme, OnePlus) and some Samsung builds block **app autostart** and
apply aggressive battery optimisation. The symptom is easy to misdiagnose:
Cloud Scheduler logs a healthy `200` and FCM accepts the message, but the
device never wakes the app, so the notification only appears when the user
opens it. The fix is in device settings — autostart ON, battery "no
restrictions"/"unrestricted", app locked in recents, removed from "sleeping
apps" — not in our code.

An in-app guide screen for this is still to be built:
**[battery-optimisation screen](#followup)** (route placeholder
`#/notifications/battery-optimisation`). Until then, point users at
https://dontkillmyapp.com/ for their brand. The exact per-brand steps are in
`ops/cloud-scheduler-setup.md`.

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
3b. **Pinger health** — first check the primary: Cloud Scheduler →
   `push-scheduler-minute` → execution history (or the `gcloud logging read`
   command in `ops/cloud-scheduler-setup.md`). One `200` per minute is healthy;
   `401` = `CRON_SECRET` mismatch, `PAUSED`/missing = re-run
   `ops/setup-cloud-scheduler.sh`. Then the **Actions** tab for the backup:
   *Push scheduler* and *Push scheduler (backup)* runs. A red run means no
   pings landed for ~5 hours; a missing workflow means GitHub disabled it after
   60 days without repo activity (any commit to the default branch
   re-enables it). Green runs with healthy ticks = the scheduler is being
   pinged every minute.
4. **A saved device** — `users/{uid}/webPushSubscriptions` must be non-empty.
   Dead endpoints (404/410) are pruned automatically.
5. **iOS** — Safari only delivers Web Push to a PWA that has been added to the
   Home Screen. A tab in the browser will never receive one.
6. **Timezone** — `tzOffsetMinutes` on `users/{uid}/myDay/current` is written
   on every save; a document that predates that field is skipped.
