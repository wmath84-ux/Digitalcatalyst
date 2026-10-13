# The app icon: why it looked zoomed, and how a logo now reaches every surface

Status: **2026-10-13**. Two reported problems are fixed here, and this document is the short version of both.

1. *"App icon bahut zoom dikhta hai / side se cut raha hai"* — the artwork inside the icon was scaled until it
   touched the edges, so every launcher that draws a round / squircle mask cut it off.
2. *"Branding page se direct release URL do, aur uninstall ya new install ke baad latest icon dikhe"* — the
   icon could only be a storage upload, and a fresh install could still show the old artwork.

## 1 · The zoom/cut: the artwork filled the whole canvas

An icon is not a picture in a frame. Android masks the launcher icon (circle, squircle, teardrop…), Chrome
masks a PWA icon when it is declared `"purpose": "maskable"`, and both are allowed to crop up to the *safe
zone*. The old master was pasted at ~85 % of the canvas and the launcher render at **100 %** — anything above
the safe zone is, by definition, cropped.

The rule the pipeline now enforces (and measures):

| Surface | Artwork must occupy | Why |
|---|---|---|
| `any` mask (Chrome tab / favicon / iOS) | ≤ 68 % of the canvas | leaves a real margin, so nothing touches the edge |
| `maskable` (Android install) | ≤ 56 % | the mask circle is the smallest of the launchers |
| legacy launcher `ic_launcher` | ≤ 62 % | drawn as-is by older launchers |
| adaptive foreground | ≤ 44 % | the launcher shrinks the foreground by an extra 66 % |
| notification badge | ≤ 86 % | small, but still fully inside the circle |

Measured on the shipped files: 512 → 68.0 %, 192 → 68.2 %, maskable → 56.1 %, badge → 86.5 %, xxxhdpi → 62.0 %,
adaptive foreground → 44.0 %. `node scripts/generate-icons.cjs --check` fails if a future logo drifts outside
the table, which is what CI runs.

Transparent logos are measured by their **alpha bounding box**, not their canvas, so a logo exported on a huge
transparent canvas is centred on the real artwork instead of being shrunk twice. Logos that are already an
opaque tile are resized to the full canvas (they *are* the background).

## 2 · Three ways to supply the logo — one stored value

Admin → Branding → **Logo** has two tabs, both writing the same `logoUrl` field:

* **Upload** — the previous Cloudinary / storage upload (`CloudinaryImageUploadField`).
* **Release URL** — a plain https link to a release **asset**, e.g.
  `https://github.com/<owner>/<repo>/releases/download/<tag>/logo.png`. The `Release URL` tab and the clip
  fields warn when the link is a *page* (`…/releases/tag/<tag>`) instead of a direct asset, because a page
  returns HTML and can never be an icon or a video.

Below the tabs, the stored logo is previewed as it will actually be masked: three live requests to
`/api/brand-icon?size=192`, `?size=512` and `?size=512&maskable=1`, each in a round frame. If a round frame cuts
the artwork, the launcher will too — the preview is the test.

## 3 · What each surface does with it, and when the change lands

| Surface | How it picks the logo up | New install | Existing install |
|---|---|---|---|
| PWA / browser tab | `/api/manifest` (dynamic, versioned) → `/api/brand-icon?size=…&v=<version>` | the current logo | after Chrome refreshes the manifest (its own schedule), or uninstall + install |
| APK launcher icon | baked at build time by `scripts/sync-android-icon.mjs` | the logo that was live when that APK was built | the same — an installed APK's icon is a resource, so it only changes with a new APK |
| In-app marks (`<img>`/`<link rel=icon>`) | `branding.ts` → `/api/brand-icon`, cached copy first | the current logo | immediately on the next load |

`/api/brand-icon` renders on demand and sends `cache-control: public, max-age=31536000, immutable`, which is only
safe because the URL carries the branding version (`updatedAt`); saving Branding therefore mints a new URL and
the browser has no stale copy to serve. Every failure path (no logo, not an image, unreachable, > 8 MB,
undecodable) answers with a **308 redirect to the shipped icon** — never a broken image and never a 500.

### The APK is the one surface a URL cannot reach — so the build reaches it

`scripts/sync-android-icon.mjs` runs in **both** Android jobs (`.github/workflows/android-build.yml`) before the
web build and before `npx cap sync android`:

* reads `settings/branding.logoUrl` with the Admin SDK (`FIREBASE_SERVICE_ACCOUNT` secret; `BRANDING_LOGO_URL`
  overrides it for a local run);
* rejects HTML pages, files over 12 MB and images under 64 px **before** touching anything;
* writes the new master, `public/icons/*`, `resources/icon.png` and every `mipmap-*` density **through the same
  generator** as the committed artwork, so a brand-new logo gets exactly the same mask-safe geometry;
* writes a tiny grep-able stamp (`android/app/src/main/res/values/brand_icon.xml`: source host + logo sha256) so
  a support question ("kaunsa logo is APK me hai?") is answered from the APK;
* without credentials it prints the reason, writes nothing and **exits 0** — a local build never fails because of
  branding;
* only writes files whose bytes actually changed.

The release job then commits whatever it changed back to `main` (`chore(brand-icons): regenerate from live
branding [skip ci]`), and skips the commit entirely when nothing changed. That is what keeps the **web** build
and the next APK showing the same artwork without anyone running a script by hand.

### So, to change the icon for everything

1. Upload the new logo file as an asset on a GitHub release (tag something like `branding-2026-10`).
2. Admin → Branding → Logo → **Release URL** → paste the `…/releases/download/…` link → Save → check the round
   previews (or switch to **Upload** and pick the file).
3. PWA: uninstall + install (or wait for Chrome to refresh the manifest) — the newest logo is used.
4. APK: run the Android build; the published APK carries the new icon, and the web icons are committed for you.

No code edit is needed at any point.
