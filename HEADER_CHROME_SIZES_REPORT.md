# Header chrome sizes + the `ad` move (2026-10-14)

The owner's brief, in one line: **every header component is sized in three numbers — icons 30 px, text
22 px, app icon 30 px — and the `ad` text leaves the header and becomes an option/button of the side
panel, on phone, tablet and desktop alike.**

> Update (2026-10-14, later the same day): the owner asked for the header app icon to be bigger — first
> *half again as large* (25 → 37.5 px), then settled on **30 px**, the same size as the header's action
> icons. Every `25 px` below is now `30 px`, and `tests/headerChromeSizesContract.test.mjs` pins the new
> number.

## The three numbers

| Element | Before | Now |
|---|---|---|
| Header action icons (bell, cart, plans, search, download, help, report, usage limits, menu trigger, drawer close, top-bar clear …) | 40 px glyphs (often the same 40 px as the plate they sat in, so they touched the rim) | **30 px glyphs** in the existing 40 px plates |
| App icon (header brand mark + the rail brand block) | 32 px on phone, 40 px from `sm:`, 48 px on tablet (index.css grew it), 36 / 44 px in the rails | **30 px** everywhere the chrome shows it (25 px at first, bumped the same day) |
| Header text (page title / greeting / expanded pill labels / header search fields) | 24 px on phone, 40 px on `md:` and up (index.css then shrank the desktop title to 16–18 px) | **22 px** on every band |
| Discs / plates the icons sit in | 40 px | 40 px — the plates are hit targets, not icons; `tests/headerChromeSizesContract.test.mjs` keeps them there |

The tablet and desktop CSS in `src/index.css` used to fight these numbers (`[data-site-header] .h-11.w-11`
grew the logo to 48 px, `[data-site-header] h1` re-set the title to 20 px, `[data-desktop-page-title]` shrank
through a `clamp()` to 16–18 px). Those three rules now hold the same values as the components, so the header
reads identically on a phone, a tablet and a desktop.

## The `ad` option now lives in the side panel

The faded `ad` label used to sit in every header strip. It is now a **row of the side panel**, defined once in
`src/components/ad/OpeningAdControl.tsx` (`OPENING_AD_ITEM` + `useOpeningAdPlayer()`):

| Band | Where the option is |
|---|---|
| Phone (≤ 639 px) | the quick-actions drawer (`MobileHeaderMenu`) — a side panel that slides in through `GlassSidebar` |
| Tablet portrait (640–959 px portrait) | **no side panel exists** on this band (the desktop shell starts at 960 px or in landscape), so the option stays a normal pill in the header's action cluster |
| Tablet / narrow desktop (960 px+, or any tablet landscape) | the compact **glass rail** (`DesktopShell`) |
| Desktop (≥ 1024 px) | the wide rail's **Account & Settings** group |
| Landing page | no panel either — the faded label stays there |

Picking the row closes the panel and opens the player (a `<body>` portal, so it is never trapped inside the
backdrop-blurred chrome). Nothing is fetched — no `<video>`, no request, no cache entry — until it is picked,
and the row hides itself entirely while the admin has the launch playback on or the animation off.

> The tablet-portrait fallback is the one judgement call: on that band there is no panel to move the option
> into, and a feature nobody can reach reads as a bug. If you would rather have no `ad` at all on tablet
> portrait, say so and the pill is a two-line removal.

## Files

* `src/components/ad/OpeningAdControl.tsx` — the option, the hook, the player; the faded label export stays
  for the landing page.
* `src/components/MobileHeaderMenu.tsx` — the phone side panel appends `Ad` and owns its player.
* `src/components/DesktopShell.tsx` — both rails carry `Ad`; the top bar drops the `ad` label and takes the
  30 px icon / 22 px text / 30 px app-icon sizes (title, search field, Review / Add / Upgrade, Expanding Tabs).
* `src/components/Header.tsx`, `src/home/components/Header.tsx` — shared + Home/FlowPath headers: 30 px icons,
  22 px text, 30 px app icon, no `ad` label, tablet-portrait pill as the fallback.
* `src/components/HeaderNotificationsButton.tsx` — a 30 px bell in the same glass plate.
* `src/components/ui/ExpandingTabs.tsx` — new `iconSize` prop (the icon is centred from the class list, so a
  30 px glyph sits centred in the 40 px disc) and the 22 px expanded label.
* `src/components/header-navigation.css`, `src/index.css`, `docs/app-opening-animation.md`.
* Tests: `tests/headerChromeSizesContract.test.mjs` (new), `tests/openingAdRuntime.test.mjs` (new, mounts the
  real component in jsdom), `tests/openingAdControl.test.mjs` and `tests/headerAvatarRingContract.test.mjs`
  updated to the new contract.
