# Notification Page — Filters & Exact Deep Links

## Goal

1. Make the bell/notification page meaningful by grouping notifications into
   filters, each showing its own count.
2. Make every notification tap land on the **exact location** that caused the
   alert — in-app bell taps AND Android/system notification taps.

## 1. Filters

Four groups plus an "All" overview. Every category maps to **exactly one**
filter (`getNotificationFilterKey` in `utils/siteNotifications.ts`), so a
notification can never appear in two groups.

| Filter chip | Categories | Which notifications appear |
|---|---|---|
| **All** | everything | default view — total count |
| **Product** | `store`, `unlock`, `course` | 🆕 New product added · 🎁 New free product available · 🔓 Product unlocked · Your course has new content (new modules/lessons) |
| **My Day** | `mayday` | ⏰ Reminder · 📝 Task time · 📅 Scheduled event |
| **Subscription** | `subscription` | Renewal reminders (7d / 3d / 1d / due) and post-expiry morning alerts |
| **Updates** | `announcement`, `community` (+ any future/unknown category) | Admin announcements · Community posts/stories from people you follow · Reactions on your posts |

Each chip renders a **count badge** of how many notifications currently sit in
that group. Tapping a chip shows only that group; the header still shows the
total unread count and "Mark all read" stays global.

## 2. Exact deep links

One shared helper — `getNotificationDeepLink(notification)` in
`utils/siteNotifications.ts` — resolves **every** notification to a real route.
The bell page, the foreground local-notification fallback and the service
worker click path all use it (or the same URL), so they cannot drift apart.

| Notification | Target | Opens |
|---|---|---|
| New/free product, Product unlocked | `{type:'product', productId}` | `#/product/{id}` |
| Course has new content (owned) | `{type:'product', productId}` + category `course` | `#/course/{id}` (player) |
| Product unlocked (purchase flow) | `{type:'purchases'}` | `#/store/purchases` |
| My Day task / schedule / reminder | `{type:'mayday', section, itemId}` | `#/my-day?section=tasks\|schedule\|reminders&item={id}` |
| My Day (legacy, no section) | `{type:'mayday'}` | `#/my-day` |
| Subscription pre-expiry | `{type:'subscription'}` | `#/subscription` |
| Subscription expired | `{type:'subscription'}` + `expired:true` | `#/subscription?renew=1` (renewal flow) |
| Announcement / community | `{type:'announcement'\|'community'}` | `#/home` |

### How the My Day deep link works end-to-end

1. **Scheduler** (`api/cron/subscription-renewals.ts`) stores the bell entry
   with `target: { type: "mayday", section, itemId }` and pushes the system
   alert with `url: /#/my-day?section=…&item=…`.
2. **Foreground clock** (`src/main.tsx`) shows the same URL via
   `getMyDayItemDeepLink(item.section, item.itemId)` with the same tag, so
   Android collapses the pair instead of duplicating.
3. **`MyDayApp`** parses `?section=` + `?item=` on mount and on every
   `hashchange`, opens that tab, and passes `highlightId` to the list
   component, which scrolls the exact task/event/reminder into view and rings
   it.
4. **Service worker** (`public/sw.js`) always navigates to `data.url` and also
   sends the url in the `site-notification-open` message, so the in-page
   fallback applies the same deep link when `navigate()` is a no-op or fails.

## 3. System (Android) notifications

Server push payloads now carry precise URLs:

- My Day items → `/#/my-day?section=…&item=…`
- Course updates → `/#/course/{id}` (buyers already own it)
- New products → `/#/product/{id}`
- Expired subscription → `/#/subscription?renew=1`

`public/sw.js` stores `data.url` on every shown notification and on click
focuses the open window and navigates it to that URL (or opens a new window
with it). The page message handler applies the same hash.

## 4. Files changed

- `utils/siteNotifications.ts` — filter keys, counts helper, deep-link helper,
  mayday target with section/itemId, unlock target carries productId.
- `utils/pushScheduler.js` + `.d.ts` — due items carry `section` + `itemId`.
- `api/cron/subscription-renewals.ts` — bell target + push URLs (My Day
  section/item, expired → renew, course updates → player).
- `api/push/send.ts` — course-update push → `/#/course/{id}`.
- `src/components/NotificationsPage.tsx` — filter chips with counts, filtered
  list, per-filter empty states, deep-link on tap.
- `src/MyDayApp.tsx` + `src/components/myday/{TaskList,Timeline,Reminders}.tsx`
  — section/item deep link + scroll/ring highlight.
- `src/main.tsx` — foreground My Day + content notifications use deep links;
  SW message handler navigates by url.
- `public/sw.js` — click path uses `data.url`, message carries the url.
- Tests: `tests/notificationFiltersDeepLinksContract.test.mjs` (new),
  `tests/myDayPushSchedulerContract.test.mjs`,
  `tests/subscriptionRenewalContract.test.mjs` (updated contract).
