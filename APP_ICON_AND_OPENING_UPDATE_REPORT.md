# App icon + opening animation — kya badla (2026-10-13)

Ye file un dono kaam ka poora summary hai jo aapne diye the: **icon zoom/cut** aur **opening animation ka
tap-only mode / admin switch**. Har change test se pinned hai, aur poora suite + production build chala kar
verify kiya gaya hai.

---

## 1. "Icon bahut zoom dikhta hai / side se cut raha hai" — cause aur fix

**Cause:** icon ke andar ka artwork canvas ko poora bhar raha tha. Android launcher round/squircle mask lagata
hai aur Chrome maskable icon ko crop kar sakta hai — jo artwork safe zone se bahar hota hai wo kat jaata hai.
Purane master me paste ~85% par tha, lekin launcher file **100%** par render ho rahi thi.

**Fix:** `scripts/generate-icons.cjs` ka mask-safe pipeline. Har surface ka apna coverage:

| Surface | Artwork | Shipped me measured |
|---|---|---|
| `any` (tab / favicon / iOS) | ≤ 68% | icon-512 **68.0%**, icon-192 68.2% |
| `maskable` (Android install) | ≤ 56% | **56.1%** |
| legacy launcher | ≤ 62% | xxxhdpi **62.0%** |
| adaptive foreground | ≤ 44% | **44.0%** |
| notification badge | ≤ 86% | **86.5%** |

`node scripts/generate-icons.cjs --check` ab CI ka drift detector hai — koi naya logo table se bahar gaya to
build fail hoga, chupke se cut nahi hoga. Transparent logo ki **alpha bbox** measure hoti hai (canvas nahi), is
liye bade khaali canvas par export kiya logo double shrink nahi hota. Test: `tests/appIconSafeZone.test.mjs`.

## 2. Branding page: ab icon **upload** ya **direct release URL** — dono

Admin → Branding → **Logo** me do tab hain, dono wahi `logoUrl` likhte hain:

* **Upload** — pehle jaisa Cloudinary/storage upload.
* **Release URL** — direct asset link, e.g. `https://github.com/<owner>/<repo>/releases/download/<tag>/logo.png`.

Page galat link par warn karta hai: `…/releases/tag/<tag>` ek **page** hai (HTML return karta hai), video/icon
kabhi nahi banega — "releases/download" hi chahiye.

Neeche live preview: `/api/brand-icon?size=192`, `?size=512`, `?size=512&maskable=1` — teeno **round frame** me,
yaani install se pehle hi dikh jaayega ki round mask kuch kaat raha hai ya nahi.

## 3. Naya icon fresh install par dikhe — PWA aur APK, dono

* **PWA:** `/api/manifest` dynamic + versioned hai (`settings/branding.updatedAt`), aur icon URLs
  `/api/brand-icon?size=…&v=<version>` par jaate hain. Branding save karte hi version badal jaata hai, purana
  cached icon browser ke paas bachta hi nahi. Uninstall → install par **latest** icon hi aata hai.
  (`/api/brand-icon` 1 saal `immutable` bhejta hai — URL hi badalta hai, is liye safe hai.)
* **APK:** launcher icon APK ke andar ka resource hota hai, URL se remote badalna possible hi nahi. Is liye build
  me bake hota hai — `scripts/sync-android-icon.mjs`, **dono** Android jobs me `npx cap sync android` se pehle:
  live branding padhe → HTML/12MB se bada/64px se chhota file reject kare → wahi mask-safe generator chala kar
  master + `public/icons/*` + `resources/icon.png` + saare `mipmap-*` likhe → `brand_icon.xml` me host + sha256
  stamp chhode. Credentials na ho to sirf message print karke **exit 0** (local build kabhi fail nahi hoga), aur
  jo file badli hi nahi usse touch nahi karta.
* Release job jo badla wo `main` par wapas commit kar deta hai
  (`chore(brand-icons): regenerate from live branding [skip ci]`) — is liye **web build aur agla APK same
  artwork** dikhate hain, koi script haath se chalane ki zarurat nahi.
* Details: `docs/app-icon-and-launcher-logo.md`.

## 4. Opening animation ab default me **app open hote hi nahi dikhti, load bhi nahi hoti**

* Default (`openingPlayOnLaunch = false`): `index.html` boot par splash ko turant `skipped` kar deta hai —
  **video ka ek byte bhi download nahi hota**, app foran interactive. Header me halka faded **`ad`** button
  (40% opacity, lowercase) har shell me lagta hai (mobile, desktop, home, landing) — tap karne par hi clip
  fetch + play hoti hai, full screen, `Close ✕` / Esc / backdrop, `↻ Replay`, aur fail hone par **URL** dikhata
  hai saath me "releases/download vs releases/tag" hint.
* `src/components/ad/OpeningAdControl.tsx`, clip resolution splash wale hi controller se
  (`openingClipSrcFor(openingClipForWidth(...))`) — control aur splash kabhi disagree nahi karenge. Buffer close
  par release.
* Admin → Branding → **Behaviour** me teen clip URL fields (any/mobile/desktop) hain: khaali = bundled EduOS
  MP4, URL diya = wahi chalta hai. Yaani **nayi animation = naya release asset + ek field, code edit kabhi nahi**.

## 5. Admin switch: "app open hote hi by default dikhao"

Admin → Branding → Behaviour me do switch:

| Switch | Asar |
|---|---|
| "Opening animation available in the app" | off = na splash, na `ad` button, clip kabhi load nahi |
| "Play the animation by itself while the app opens" | on = launch splash wapas documented behaviour par, **aur header ka `ad` gayab** (aapki requirement) |

Saath me ek one-tap quick switch (dono ek saath set + persist), resolved-clip ka live line, aur
"▶ Preview the opening now" — ye runtime override arm karta hai, is liye tap-only mode me bhi turant preview
chal jaata hai (clip khatam hone par override khud hat jaata hai).

## Verify kya hua

* `node --test tests/*.test.mjs` — 3903 tests, baseline commit (f08eb49, 3868 tests / 60 fail) se naam-ba-naam
  compare kiya: **koi naya failure nahi** (mere paas bhi wahi 60 purane failures). Mere naye 7 test files (opening behaviour, `ad` control, endpoint contract, render runtime,
  build-sync, safe-zone, branding assets) 100% green.
* `npm run build:low-heap` — production build clean (is sandbox me RAM 4 GB hai, is liye low-heap; normal CI
  machine par `npm run build` hi chalega).
* `npx tsc --noEmit` (app + api) — dono clean.
* Workflow YAML parse + step order verify; `node scripts/sync-android-icon.mjs` bina credentials → "skipped" +
  exit 0, kuch nahi chheda.
* Endpoint ko stub Firestore + stub upstream logo ke saath end-to-end chalaya: 192/512/maskable exact size,
  round-safe, 1 saal immutable ETag ke saath; no-logo / network-down / HTML-page / corrupt-image chaaron
  fallback 308 ya short-TTL bytes dete hain — **kabhi 500 nahi**.

## Aapke liye 4 steps

1. Naya icon GitHub release par **asset** ki tarah upload karo (tag, e.g. `branding-2026-10`).
2. Admin → Branding → Logo → **Release URL** → `…/releases/download/…` link paste → Save → round previews check.
3. PWA: uninstall + install (ya Chrome ke manifest refresh ka intezaar) — latest icon.
4. APK: Android build chalao; naya APK naye icon ke saath aayega, aur web icons khud commit ho jaayenge.

Animation ke liye: release par `.mp4` asset upload karo → Behaviour → clip field me direct URL paste → Save
(chahiye to "play by itself" switch on kar do, tab header ka `ad` apne aap chhup jaayega).

## Baaki (aapke decision ka intezaar — abhi chhua nahi)

* Android system navigation bar white mode me kuch devices par kaala.
* Sirf-local (no cloud) PDF Read me bundled PDF.js design.
* Notes/mind map kabhi sync na hona / course player me na dikhna.
* 60+ nodes par mind map drag lag.
* Google Drive PDF PDF.js me (CORS), Google account chooser ka toolbar colour (Chrome UI — app control nahi),
  aur Firebase free plan (Spark) me Storage upload ke liye Blaze — in teeno ka sirf diagnosis diya tha.
