# Android system bars (status bar + navigation bar)

The Android status bar and navigation bar follow the page that is on screen.
One coordinator decides the colours; nothing else writes them.

## Who does what

| Piece | File | Role |
| --- | --- | --- |
| Coordinator | `src/utils/systemBars.ts` | Samples the page, decides the payload, calls the native plugin and sets `theme-color`. |
| Colour maths | `src/utils/systemBarColor.ts` | Pure functions: CSS colour parsing, compositing, luminance, icon contrast. Unit-tested. |
| Compatibility shim | `src/utils/themeColor.ts` | Old helper names. They only set or clear an override. |
| Native plugin | `android/app/src/main/java/app/eduvora/shop/AppStatusBarPlugin.java` | `setSystemBars` sets both bars and their icon appearance. Keeps the last state. |
| Activity | `MainActivity.java` | Re-applies the last state on resume and configuration change. It no longer forces the system-theme colour. |

## Where the colour comes from

No route-to-colour table. At each trigger the coordinator reads the rendered
page:

- **Top edge** — the element stack under the top edge of the viewport, composited
  from the top down. This is the page header when there is one.
- **Bottom edge** — the same at the bottom edge (the footer or bottom bar).
- **No header** — the document background (`<body>` over `<html>`, else the theme default).
- **Translucent layers** (glass headers, dialog scrims) are composited over what is
  beneath them, so a scrim darkens the real page colour.
- **Gradients and images** cannot be sampled as one colour. Such a page declares
  the colour on the element that paints the edge: `data-system-bar-color="#rrggbb"`.
- **Overrides** — a non-page layer (the Course Player's landscape chrome) can take
  the bars with `setSystemBarOverride(owner, colour)`. Clearing it returns the bars
  to the page.

Icon appearance is computed from the colour: whichever of black or white gives the
better WCAG contrast. Light backgrounds get dark icons, dark backgrounds get light
icons. Status and navigation bars are decided separately.

## When it updates

Hash route change, `popstate`, `pageshow`, `visibilitychange`, resize, orientation,
the system Light/Dark query, the `<html>` class/`data-theme`/`style` (the app's
theme switch), any `<body>` DOM change (a page render, a dialog opening or closing),
and fullscreen/immersive changes. Triggers are coalesced. The native call is skipped
when the payload did not change.

## Edge-to-edge behaviour

The manifest targets API 35 and `capacitor.config.ts` keeps Capacitor's default
`adjustMarginsForEdgeToEdge: "disable"`. So on Android 15 and later the WebView is
drawn edge-to-edge, behind both bars. The app's headers already pad with
`env(safe-area-inset-*)`, so a header's background fills the status-bar area, and
the bar area shows the same colour the coordinator samples.

| Android version | Status / navigation bar colour | Icon appearance |
| --- | --- | --- |
| 15+ (targetSdk 35, enforced edge-to-edge) | Window colours are ignored by the system. The bar area shows the page's own top/bottom background, which is the sampled colour. | Honoured. |
| 10–14 | Window colours are honoured. Content sits between the bars (decor fits system windows). | Honoured (AndroidX compat). |
| 6–7 (API 23–25) | Window colours honoured. Contrast enforcement is not applicable. | Status-bar icons honoured. Navigation-bar icons are not settable (the system keeps its own). |
| 8–9 (API 26–28) | As above. | Status and navigation icons honoured. |

Gesture and three-button navigation both use the same bar area: the bottom
footer keeps its `env(safe-area-inset-bottom)` padding, so controls stay clear of the
gesture zone. Contrast enforcement is switched off on Android 10+
(`setStatusBarContrastEnforced(false)` and `setNavigationBarContrastEnforced(false)`).
Without this, the system adds a scrim and the colour the page asked for is not the
colour the learner sees.

## Limitations

- Pages with a gradient or image header must declare `data-system-bar-color`.
  Otherwise the sampled colour is the next solid background down.
- Samsung and some OEM skins may impose their own bar contrast. The app turns that
  off where the API allows.
- Light navigation-bar icons need Android 8.0 (API 26). On Android 6–7 the navigation
  icons keep the system's own appearance; the status-bar icons are still set.
- The sample is taken at the horizontal centre of each edge. A page whose edge is split
  between two colours uses the colour under that point.

## Verification status

- Colour maths: `tests/systemBarsColor.test.mjs`.
- Coordinator in a real browser: a Chromium harness with a stub native bridge
  checked the payload for teal, cream, dark-mode switch, dialog scrim, glass header,
  gradient with a declared colour, bare page, override and dedupe (26 checks passed).
- The live app (`#/home`, `#/store`, `#/` landing) was checked the same way. The sampled
  colours matched the rendered top and footer backgrounds.
- **Not verified in this environment:** the Android build and the native bars.
  This sandbox has no JDK, Android SDK or Gradle, and the emulator cannot run. The
  native changes still need a compile, an emulator run, and a device run on Android
  15 with gesture and three-button navigation, plus a production APK build.
