# Tablet Rotation + DeX Side-Panel Fix

**Date:** 2026-09-29
**Scope:** Native Android orientation handling (`android/app/src/main/java/app/eduvora/shop/`)

## Reported symptoms

1. On a **10–11" tablet** held in **landscape** with the system **rotation lock ON**,
   the installed APK **opened in portrait and would not rotate** to landscape.
2. In **Android Desktop / Samsung DeX mode**, the **desktop side panel** did not
   appear on most pages — it only showed up after navigating to a product detail
   page (i.e. once the window happened to become wide/landscape).

## Root cause (single source for both symptoms)

`MainActivity.onCreate()` executed:

```java
setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
```

**unconditionally, for every device — phones and tablets alike.**

This overrode the manifest's `android:screenOrientation="fullSensor"` at runtime
and pinned the activity to portrait. The JS layer (`src/utils/appOrientation.ts`)
only ever *unlocks* rotation for the Course Player / 3D Sanctuary; for tablets its
`lockAppToPortrait()` early-returns and **never undoes** the native portrait lock.

Consequences:

- **Symptom 1:** the tablet activity stayed portrait, so it could not open rotated.
- **Symptom 2:** a portrait-locked app in DeX is constrained to a narrow, portrait
  window (`width < 960`, not landscape). The desktop side panel only renders at
  `width >= 960` **or** `landscape && tablet`, so it stayed hidden until the window
  briefly became wide/landscape.

## Fix

Make the **native** layer tablet-aware using Android's canonical **sw600dp** rule
(`Configuration.smallestScreenWidthDp >= 600`). This value is derived from the
physical display, so it stays correct inside a resizable DeX / freeform window.

- `MainActivity.onCreate()` — phones default to `SCREEN_ORIENTATION_PORTRAIT`;
  **tablets get `SCREEN_ORIENTATION_FULL_SENSOR`** so they follow the physical
  orientation even when the system auto-rotate lock is ON.
- `MainActivity.lockPortraitForApp()` — restores `FULL_SENSOR` on tablets instead
  of forcing portrait (e.g. when the JS re-locks after leaving the Course Player).
- `AppOrientationPlugin.lockPortrait()` and `AppOrientationPlugin.lock("portrait")`
  — downgrade portrait requests to `FULL_SENSOR` on tablets, so no JS call can
  re-pin a tablet to portrait.

Phone behaviour is unchanged: phones remain portrait-locked everywhere except the
Course Player (FULL_SENSOR) and the 3D Sanctuary (SENSOR_LANDSCAPE).

## Files changed

- `android/app/src/main/java/app/eduvora/shop/MainActivity.java`
- `android/app/src/main/java/app/eduvora/shop/AppOrientationPlugin.java`

## How to ship

These are native changes, so the APK must be rebuilt:

```bash
npm run build            # or the project's web build
npx cap sync android
# then build the APK/AAB (Android Studio or ./android/gradlew assembleRelease)
```

## Verifying

- Tablet (rotation lock ON), held in landscape → app opens/rotates to landscape.
- Tablet in DeX / Android desktop mode → window can be landscape/wide and the
  desktop side panel shows consistently across pages.
- Phone → still locked to portrait outside the Course Player / Sanctuary.
