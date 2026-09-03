# Mac mode — vendored macOS Web Simulator

Upstream: <https://github.com/LikhithSP/MacOS-Web-Simulator> (MIT — see
[`LICENSE`](./LICENSE)).

The whole simulator is vendored here and mounted over the app as **Mac mode**,
launched from the "Mac mode" button in the desktop top bar.

## Layout

| Path | What it is |
| --- | --- |
| `src/macos/MacOSApp.jsx` | Upstream `src/App.jsx` — boot → setup → lock → desktop |
| `src/macos/layouts/` | Power, Setup, Region, Written, Timezone, DataPrivacy, CreateAccount, Lock, Desktop |
| `src/macos/app/` | The 19 apps (Finder, Safari, Mail, Messages, Maps, Photos, FaceTime, Phone, Calendar, Contacts, Notes/TextEdit, Reminders, Music/Spotify, Settings, Folder, Trash, Launchpad, PDFViewer, Blogs) |
| `src/macos/components/` | TopBar, Dock, ControlCenter, AppWindow, ContextMenu, the 15 desktop widgets, the shadcn/glass UI kit |
| `src/macos/store/Appstore.js` | The zustand window manager |
| `src/macos/macos.css` | Upstream `src/index.css`, scoped to `.macos-sim-root` |
| `src/macos/lib/macStorage.js` | **Added.** Namespaced localStorage shim |
| `public/macos/` | Wallpapers, icons, images and the Music app's audio |
| `src/components/macmode/` | **Added.** The host-side button + portal/lazy-load seam |

## What was changed, and why

The simulator was written to own an entire origin: the whole viewport, the
`<html>` element, the document's event handlers and every localStorage key.
Inside Digital Catalyst it owns none of those, so the vendoring is verbatim
apart from the containment changes below. Every one is marked `EMBED:` in the
source.

1. **Mounting** — `w-screen h-screen` → `fixed inset-0`, rendered through a
   portal on `<body>` (`MacModeHost.tsx`). A transformed or `overflow:hidden`
   ancestor in the app would otherwise clip it.
2. **Dark mode** — `.dark` goes on the simulator's own wrapper rather than
   `<html>`, so the Mac's theme switch cannot repaint the store behind it.
3. **Right-click** — the context-menu suppressor is bound to the wrapper
   instead of `document`, so right-click still works in the rest of the app.
4. **Storage** — every read/write goes through `macStorage`, which prefixes
   `macsim:`. Upstream keys like `theme`, `user_name` and `notes` would
   otherwise collide with the host app's own keys on the shared origin.
5. **CSS** — `@import "tailwindcss"` dropped (the host imports it once, and
   Tailwind v4 already scans `src/macos/**`); the bare-global rules (`*`,
   `html`, `body`, `:root`, `a`, `h1`) scoped to `.macos-sim-root`; `@apply`
   hand-expanded; `@custom-variant dark` / `@theme inline` moved to
   `src/index.css`, which is the CSS root Tailwind actually processes.
   Upstream's `--radius-*` remap is deliberately **not** copied — see the
   comment in `src/index.css`.
6. **Fonts** — the Google Fonts `@import` is injected as a `<link>` on launch
   instead. CSS `@import` is hoisted to the top of the bundle, so it would
   otherwise cost every store visitor a font fetch.
7. **Exiting** — an `onExit` prop adds "Exit Mac mode" to the Apple menu, makes
   "Shut Down…" leave the mode (upstream calls `window.close()`, which would
   close the whole tab) and wires Esc from the desktop stage.
8. **Assets** — the simulator's audio moved from `src/assets` to
   `public/macos/audio` so the MP3s are served as files rather than inlined
   into the JS bundle, and all `/Wallpaper|/icons|/images` URLs were rebased
   under `/macos/`.

## Cost

Mac mode is a `React.lazy` chunk, so nobody who never presses the button
downloads any of it. The images were re-encoded down from 168 MB to ~18 MB;
the ~39 MB of MP3s behind the Music app are the bulk of `public/macos/` and are
only fetched when a track is played.

## Re-syncing with upstream

Diff against a fresh clone and re-apply the eight points above; they are all
mechanical. The `EMBED:` markers show every hand-edited site.
