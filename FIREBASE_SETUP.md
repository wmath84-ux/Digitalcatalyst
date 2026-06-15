# Firebase Production Setup

Before deploying this app to production, complete the required Firebase Console setup below.

## Authentication providers

Enable at least one supported sign-in provider:

- **Email/Password**: Firebase Console → Authentication → Sign-in method → Email/Password → Enable.
- **Phone**: Firebase Console → Authentication → Sign-in method → Phone → Enable, then configure any required regional and abuse-prevention settings.

The current email auth flow depends on the Email/Password provider. If it is disabled, Firebase returns a provider configuration error and the app should stop the auth attempt instead of trying a fallback signup path.

## Authorized domains

Add every production and preview domain that will host the web app:

1. Open Firebase Console → Authentication → Settings → Authorized domains.
2. Add the production domain, any `www` variant, and approved preview/staging domains.
3. Keep localhost entries only for local development.

## Firestore rules

Deploy the production Firestore security rules before launch:

1. Review the repository's Firestore rules for user profiles, purchases, sessions, products, community data, and admin-only writes.
2. Deploy rules with the Firebase CLI from the configured Firebase project.
3. Verify authenticated users can read/write only their own protected data and admins can perform approved management actions.

## Web app environment variables

Configure the Firebase web app settings in the deployment environment. The Vite build expects Firebase client configuration values to be available as environment variables, typically including:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (if Analytics is used)

Confirm these values come from Firebase Console → Project settings → General → Your apps → Web app, and never commit private service account credentials to the client app.
