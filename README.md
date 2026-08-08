# Digital Catalyst

A Vite + React learning marketplace prototype for notes, courses, coupons, subscriptions, profile/EduCoins, and admin management.

## Demo mode deployment

This project is intentionally safe to deploy on Vercel **without any environment variables** while you are focusing on design.

You do **not** need these variables for the current demo-mode app to open:

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_SECRET`
- `DATABASE_URL`
- `MONGODB_URI`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`
- `CLOUDINARY_URL`
- `GEMINI_API_KEY`

Current behavior in demo mode:

- Auth/OTP is simulated locally in the browser.
- Products, users, orders, coupons, settings, purchases, profile and EduCoins use browser `localStorage`.
- Payment opens a Razorpay payment page link, but product delivery stays locked until manual/admin verification.
- AI features show local placeholder/demo responses when `GEMINI_API_KEY` is not set.
- Image/file uploads are stored as browser data URLs for preview/testing.

## Optional variable

Only add this if you want real Gemini responses instead of demo placeholder replies:

```env
GEMINI_API_KEY=your_gemini_key_here
```

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

To use the in-app **Continue with Google** authentication flow (Google One Tap with a native bottom sheet account picker):

- Open **Firebase Console → Authentication → Sign-in method → Google** and enable the Google provider.
- Add a support email for the Firebase project.
- Add authorized domains for production and local development, such as your deployed domain and `localhost`.
- Copy the **OAuth 2.0 "Web application" client ID** from **Google Cloud Console → APIs & Services → Credentials** (the web client tied to the Firebase project) and set it as `VITE_GOOGLE_CLIENT_ID` in your environment / `.env` file.
- Deploy after the Firebase environment/configuration is correct.

The client loads Google Identity Services and opens the account picker as a native-looking bottom sheet over the current page, without navigating away or opening a new window. The returned ID token is exchanged with Firebase (`signInWithCredential`) to restore purchases and profile data.

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
