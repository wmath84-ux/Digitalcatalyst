# Deployment Checklist — Vercel + Firebase (eduvora.shop)

Ye checklist is project ke deploy ke liye hai. GitHub par code merge hone se sirf
**website ka code** update hota hai — **env vars aur Firestore rules alag se
manage karne padte hain.**

## 1. Vercel environment variables (server-side)

Vercel Dashboard → project `digitalcatalyst` → **Settings → Environment Variables**:

| Variable | Scope | Value |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Production ✔ Preview ✔ | Service account JSON (poora, single file ka content) — ya base64-encoded JSON |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Production ✔ | Razorpay live keys |
| `WEB_PUSH_VAPID_*` | Production ✔ | Web push keys |

Alternativly 3 alag vars bhi chalte hain (agar poora JSON paste karna mushkil lage):
`FIREBASE_PROJECT_ID=my-website-761e9`, `FIREBASE_CLIENT_EMAIL=…gserviceaccount.com`,
`FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"`
(tino saath mein zaroori hain).

**⚠️ SABSE COMMON GHATI:** env var set karne ke baad **redeploy karna ZAROORI hai**.
Vercel env vars sirf *naye* deployment mein apply hote hain:
**Deployments → latest row → ⋮ (menu) → Redeploy.**

## 2. Firestore security rules (alag step — GitHub se auto-deploy NAHI hote)

1. https://console.firebase.google.com → project **my-website-761e9** →
2. **Firestore Database → Rules** tab
3. Repo ki `firestore.rules` file ka **poora content** paste karo (purana replace karo)
4. **Publish** dabao

Verify (browser / curl): dono URLs JSON lautane chahiye (permission error NAHI):
- `https://firestore.googleapis.com/v1/projects/my-website-761e9/databases/(default)/documents/siteProducts?key=<VITE_FIREBASE_API_KEY>&pageSize=1`
- `https://firestore.googleapis.com/v1/projects/my-website-761e9/databases/(default)/documents/publicLeaderboard/referrals?key=<VITE_FIREBASE_API_KEY>`

## 3. Verify API functions

Browser mein kholo: `https://eduvora.shop/api/referral-leaderboard`
- `{"ok":true,"subscribers":[…]}` → sab theek ✅
- JSON `{"ok":false,"code":"firebase_admin_not_configured"}` → env var missing/galat → step 1 + redeploy
- **`500: INTERNAL_SERVER_ERROR / FUNCTION_INVOCATION_FAILED`** (HTML page) → function init crash →
  Vercel Dashboard → project → **Logs** (ya error page par "check the logs" link) →
  **"Uncaught Exception"** wala block copy karke development ko bhejo. Wahi exact wajah batata hai.

## 4. Time-based push notifications (My Day + Product announcements)

`api/cron/subscription-renewals` ab **3 jobs** chalata hai (sab idempotent — kitni baar bhi call karo safe):

1. Subscription renewal reminders (7d/3d/1d/due/expired)
2. **My Day reminders/tasks/schedule** — user ke set kiye exact local time par system push
3. **Product announcements** — naya/free product sabko push; khareede product me naya module/lesson → buyers ko push

Vercel cron is path ko **roz 1 baar** chalata hai (Hobby limit) — wo renewal ke liye kaafi hai,
lekin **My Day reminders time-sensitive hain**, isliye ek external 1-minute pinger chahiye:

1. `CRON_SECRET` Vercel env mein set karo (Production ✔) + redeploy.
2. https://cron-job.org (free) par account banao → new cron job:
   - URL: `https://eduvora.shop/api/cron/subscription-renewals`
   - Schedule: **every 1 minute**
   - Header: `Authorization: Bearer <CRON_SECRET ki value>`
3. Test: pinger ka first run `200 {"ok":true,...}` lautana chahiye.

**Instant push (pinger ka wait nahi):** ye events turant push bhejte hain — ghadi/cron par nirbhar nahi:
- Admin panel mein **product create** → sab subscribed devices ko turant push
- Admin panel mein **product update** jisme naye module/lesson add hue → us product ke buyers ko turant push
- **Payment/claim success** (free ya paid) → buyer ko "Product unlocked" turant push + bell entry

**Zaroori shartein:**
- Web push ke liye `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` set hone chahiye.
- User ko app mein notifications **allow** karne honge (login par app khud subscribe karta hai).
- My Day reminders tabhi fire honge jab user ne is release ke baad **ek baar My Day kholkar koi bhi edit/save** kiya ho — usi save ke saath device ka timezone (`tzOffsetMinutes`) Firestore mein jata hai jisse server sahi local time pe push karta hai.
- Product announcements ka **pehla run sirf baseline snapshot leta hai** (koi push nahi) — flood avoid karne ke liye.

## 5. Notes

- Local testing (`npm run dev`) mein `/api/*` endpoints **nahi chalte** — ye sirf Vercel
  par live hote hain. Local par API test karne ke liye `vercel dev` use karo (Vercel CLI login chahiye).
- Hobby plan par 12 serverless functions ki limit hai — abhi exactly 12 hain; naya API
  endpoint add karne se pehle kisi existing ko merge karna hoga (isliye scheduler ko
  existing cron function mein hi merge kiya gaya hai).
