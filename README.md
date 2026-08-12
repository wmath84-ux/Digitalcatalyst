# Digital Catalyst

A Vite + React learning marketplace prototype for notes, courses, coupons, subscriptions, profile/EduCoins, and admin management.

## Current architecture

The browser has one Vite entry point: `index.html` loads `src/main.tsx`. Firebase Authentication is the only authentication system. Email/password login, signup, Google sign-in, password reset, admin role checks, persistent sessions, and profile hydration are provided by `src/context/AuthContext.tsx`.

The removed PostgreSQL/JWT and Next.js authentication implementations must not be reintroduced. Server features should verify Firebase ID tokens and store user-owned data under the authenticated Firebase UID.

### Firebase setup

- Enable **Email/Password** and **Google** under Firebase Console → Authentication → Sign-in method.
- Add localhost and every deployed hostname under Authentication → Settings → Authorized domains.
- Deploy `firestore.rules` and `storage.rules` before using protected user/admin data.
- The Firebase web configuration is initialized in `firebase.ts`; Firebase web API keys are public project identifiers, while all server secrets must remain in deployment environment variables.

## Secure Razorpay checkout

Paid checkout is server-authoritative. `/api/razorpay/create-order` verifies the Firebase ID token, reads the product and price from Firestore, and creates the Razorpay order. `/api/razorpay/verify-payment` verifies the signature and captured amount with Razorpay before writing the purchase entitlement and order through Firebase Admin.

Configure these server-only deployment variables:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `FIREBASE_SERVICE_ACCOUNT` (complete service-account JSON)

Free products use the same authenticated server flow but skip Razorpay. EduCoin redemption is intentionally unavailable until wallet deduction is implemented as an atomic server transaction.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Vercel settings

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: none required for demo mode

## PWA install testing notes

Digital Catalyst is configured as an installable PWA. To test installability after deployment:

- Deploy the production build on HTTPS; service workers and app installation require a secure origin, except for localhost during development.
- Open the deployed site in Chrome and wait for the browser to evaluate the manifest and service worker.
- If the install prompt does not appear immediately, wait a moment and tap/click the page once, then use the visible **Install App** / **Add to Home Screen** button or Chrome's menu.
- In Chrome DevTools, check **Application > Manifest** for the Digital Catalyst manifest and icons, and **Application > Service Workers** for the registered service worker.
- Run Lighthouse and review the PWA/installability checks if Lighthouse is available in your Chrome version.

## Firebase Google login setup

The current authentication page uses Firebase `signInWithPopup` with `GoogleAuthProvider` and explicitly shows the Google account chooser. Enable the Google provider, configure its support email, and authorize local/production domains in Firebase Console. No separate `VITE_GOOGLE_CLIENT_ID` is used by the current application.

The app stores only safe profile metadata in Firestore (`users/{uid}`); passwords and Google credentials/tokens are never written to Firestore or localStorage.

## Firebase security rules deployment (required)

The app runs on Firebase project `my-website-761e9`. Firestore and Storage security rules live in this repository (`firestore.rules`, `storage.rules`) and are wired for deployment through `firebase.json` / `.firebaserc`. Admin product CRUD (`siteProducts`) requires the deployed rules to match this repository — if the rules were edited by hand in the Firebase Console or never deployed, product reads still work (they are intentionally public) but admin writes fail with `permission-denied`.

Deploy the rules with the Firebase CLI (login with an account that owns the project):

```bash
npm install -g firebase-tools   # or use npx firebase-tools
firebase login
npm run deploy:rules            # firebase deploy --only firestore:rules,storage
```

Rules posture after deployment (unchanged from intent):

- `siteProducts`: public read, **admin-only** create/update/delete.
- Admin is recognized by Firestore rules via `users/{uid}.role in ['admin', 'super_admin']`, the server-set custom claim `admin: true`, or the primary admin email `wmath84@gmail.com` (the app itself keeps the role document at `admin` for that account — only existing admins can grant roles to other users, so this stays strictly admin-only).
- `adminProductContent/*` and `adminProductImages/*` Storage uploads: public read, admin-only write with type/size limits.

### Verifying admin product writes in production

After deploying the rules, prove the end-to-end path with the client SDK (so the real deployed rules are enforced on every probe):

```bash
ADMIN_EMAIL="wmath84@gmail.com" ADMIN_PASSWORD="..." npm run verify:admin-access
```

The verifier checks login, ID-token refresh, `users/{uid}.role`, product create/read/update/delete, and — as a security regression check — that an unauthenticated product write is still denied while public product reads keep working. It exits non-zero and prints the exact Firebase error code if any check fails.

In the admin panel itself, every product save now runs a pre-flight check (`utils/adminFirestoreGuard`): it verifies a real Firebase Auth session, force-refreshes the ID token, re-reads the admin role document, and — on any failure — shows the exact Firebase error code and message instead of a generic "check rules" alert.
