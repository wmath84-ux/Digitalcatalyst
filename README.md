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
