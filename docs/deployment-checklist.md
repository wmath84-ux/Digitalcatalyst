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

## 4. Notes

- Local testing (`npm run dev`) mein `/api/*` endpoints **nahi chalte** — ye sirf Vercel
  par live hote hain. Local par API test karne ke liye `vercel dev` use karo (Vercel CLI login chahiye).
- Hobby plan par 12 serverless functions ki limit hai — abhi exactly 12 hain; naya API
  endpoint add karne se pehle kisi existing ko merge karna hoga.
