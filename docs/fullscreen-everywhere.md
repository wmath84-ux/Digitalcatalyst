# Fullscreen — the APK, mobile and tablet fix

Owner report, 2026-09-28:

> "Sanctuary ke andar full screen button APK mein kaam nahin kar raha hai …
> shayad browser mein kaam kar raha hai aur mobile per bhi nahin … tablet per
> bhi."

Every fullscreen button in the app used to call
`document.documentElement.requestFullscreen()` and swallow the rejection
(`.catch(() => {})`). That is why the button looked dead on the APK — phones
**and** tablets — while it worked in a desktop / Android-Chrome browser.

## Why it failed

Android WebView only honours the HTML5 Fullscreen API when the host Activity
implements **both halves** of the `WebChromeClient` custom-view contract —
`onShowCustomView(View, CustomViewCallback)` and `onHideCustomView()`. With no
override, the request is refused and the page's promise rejects.

Capacitor ships `BridgeWebChromeClient` which *does* override them, but the
override is:

```java
public void onShowCustomView(View view, CustomViewCallback callback) {
    callback.onCustomViewHidden();   // ← "this WebView does not support fullscreen"
    super.onShowCustomView(view, callback);
}
```

So inside the APK the promise could **never** resolve, on any device.
iOS Safari is the same story from the other side: `Element.requestFullscreen()`
does not exist on iPhone at all (iPadOS does support it).

## The fix — three layers, one controller

`src/utils/fullscreen.ts` is now the ONLY fullscreen entry point in the app. It
negotiates, in order, and reports one snapshot (`active`, `mode`:

1. **Native (Capacitor shell)** — the `AppFullscreen` Android plugin drives
   `WindowInsetsControllerCompat` (immersive sticky system bars). This is the
   only layer that can hide the Android status + navigation bars from a
   WebView, and it is what makes the buttons work in the APK.
2. **Web** — the standard / WebKit Fullscreen API (`navigationUI: "hide"` on
   Android, element requests for media stages).
3. **App immersive (fallback)** — `data-app-fullscreen="true"` on `<html>`,
   used only where a page genuinely cannot hide the OS chrome (iOS Safari, an
   in-app browser). The screen always answers; the Sanctuary's own chrome steps
   aside through CSS (`src/nature3d/winter.css`) and its bottom-right button
   becomes *Exit fullscreen*.

Buttons mirror the live snapshot, so the label is never a lie:
`Fullscreen ⇄ Exit fullscreen` (Sanctuary), `Hide status bar` (Course Player),
`Fullscreen` (media viewer rows).

## Android pieces (this is the half that needs an APK rebuild)

| File | Job |
| --- | --- |
| `android/…/AppFullscreenPlugin.java` | `@CapacitorPlugin(name="AppFullscreen")` — `enter()` / `exit()` / `isActive()`; static flag, re-applied on resume / focus regain, and while a custom view is showing. |
| `android/…/FullscreenWebChromeClient.java` | Extends Capacitor's client and hosts the custom view for real (black full-bleed container + immersive bars). Also the app-driven exit used by the back gesture. |
| `android/…/MainActivity.java` | Registers the plugin, installs the chrome client after `super.onCreate()`, re-asserts the immersive flag on resume/focus, and routes the system back gesture to *leave fullscreen first* instead of leaving the app. |

**The web half alone is not enough inside the APK** — an APK built before this
change (or a device that refuses the native call) falls back to layer 3, which
still gives the learner a full-bleed screen and an honest label.

## Verification

- `node --test tests/fullscreenEverywhereContract.test.mjs` — the Android shell
  (chrome client, plugin, Activity wiring), the controller's layer order, every
  call site, and a jsdom runtime pass over all platform shapes (no API,
  honoured API, rejected API, element request, `allowAppFallback: false`).
- `node --test tests/coursePlayerLandscapeStatusBarContract.test.mjs` — the
  Course Player's status-bar switch still goes through the controller.
- `bash run_tests.sh` — full suite (baseline: 56 pre-existing failures, none of
  them fullscreen-related).
