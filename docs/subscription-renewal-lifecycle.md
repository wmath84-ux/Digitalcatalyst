# Subscription renewal lifecycle

Renewals are explicit, user-confirmed purchases because the current Razorpay integration creates orders rather than recurring mandates. The UI and notifications must never imply an automatic charge.

## Reminder cadence

The scheduler runs daily at 09:00 IST (`03:30 UTC`) and creates at most one notification per stage and subscription expiry:

1. 7 days before expiry
2. 3 days before expiry
3. 1 day before expiry
4. Due day
5. Once after expiry

The document ID is derived from the expiry timestamp and stage, making delivery idempotent across cron retries and devices. Cancelled, paused, and opted-out subscriptions are excluded. Reminders are stored in `users/{uid}/notifications`, shown in-app, and optionally sent by Web Push when VAPID is configured. Invalid push endpoints are removed.

## Renewal checkout

The renewal page restores the current plan, billing cycle, selected features, and live bonus products. The buyer reviews server-authoritative pricing and confirms payment. Early renewal extends from the current expiry so paid time is never lost; renewal after expiry starts from the payment time.

## Operations

Required production variables:

- `CRON_SECRET`
- Firebase Admin credentials
- Optional `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`

The Vercel cron is configured in `vercel.json`. Firestore rules must be deployed for cross-device notification reads and reminder preference updates.
