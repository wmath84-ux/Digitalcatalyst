# Footer navigation is ONE component now (2026-09-16)

Owner brief:

> "Footer navigation ka jo design My Day per hai exactly vahi design har jagah honi
> chahiye — home page aur sabhi jagah. Jahan-jahan footer navigation hai, jis screen
> per, jaise tablet aur mobile check karke fix karo, aur sabhi jagah footer
> navigation ka background blur aur transparency exactly vahi apply karo jo product
> store mein hai."

## What was wrong

Four copies of the same `<nav>` wrapper had drifted apart:

| Surface | Files | Old behaviour |
| --- | --- | --- |
| Home, Product Store, PDP, Profile, Study Library, Checkout, Notifications, Search, Queries, Leaderboard | `src/components/BottomNav.tsx` | carried `data-primary-library-nav`, whose CSS made the dock a **full-width bar** with a permanent label under all seven tabs and `transform: none`, which froze the magnification wave — a different footer from every other screen |
| My Day | `src/components/myday/BottomNav.tsx` | the reference capsule, but `md:hidden` — gone from 768 px up |
| Revision | `src/revision/components/BottomNav.tsx` | same capsule, same `md:hidden` |
| Cart + Favourites | `src/cartWishlist/components/BottomNav.tsx` | same capsule by luck, not by construction |

So on a tablet in portrait, Home / Store / Cart kept a footer while My Day and
Revision had none, and the primary nav never looked like the others at any width.

## What it is now

`src/components/SiteFooterNav.tsx` is the one footer. Each surface imports it and
passes its tabs; nothing hand-rolls the wrapper any more:

```tsx
<SiteFooterNav label="My day" items={items} onNavigate={…} />
```

It renders the My Day capsule exactly — overlay, centred, `w-max`, clear of the
home indicator (`pb-[max(env(safe-area-inset-bottom),10px)]`), `px-3 pt-2` gutters,
`z-30` — and mounts `GlassDock siteFooter`, so the magnification wave and the
active-tab label tooltip are identical on every screen.

**Material.** The light-blue frost and its transparency were already
single-sourced: one `html[data-glass="on"] :where([data-glass-dock])` rule in
`src/glass.css` keyed on `--dc-footer-nav-tint` (18% light blue over the scene) and
`--dc-footer-nav-blur` (16 px, 40% of the ceiling). That IS the product store's
footer material, and every surface inherits it. Nothing per page repaints it —
the contract test fails if a rule does. The one deliberate exception is the course
player's own tray, which is a solid plate by owner decision
(`docs/part20-classroom-removal-and-flat-player-panel-language.md`) and is player
chrome, not site navigation.

**Tablet.** The `md:hidden` clauses are gone, so every screen keeps the capsule
from 768 px up to 959 px, and in portrait at 1024–1279 px too. Release happens
once, for everyone, in the existing hard desktop rules: 960 px up,
tablet-landscape-as-desktop, and inside `.dc-desktop-shell`. Revision's `PageTabs`
text row now steps aside in the 768–959 px portrait band so a tablet does not get
two navs at once.

**Seven tabs.** Home / Store carries seven, which is wider than a phone, so the
RHYTHM tightens as the viewport narrows and the plates drop to GlassDock's
compact size below 350 px (the wrapper passes `compact` from that same
breakpoint, so the wave keeps working — a CSS `width: … !important` would freeze
it, which is what the old bar did). Tap targets stay ≥ 44 px until 350 px, then
38 px:

| viewport | plates | gap | panel padding | capsule | available |
| --- | --- | --- | --- | --- | --- |
| > 429 px | 44 px | 8 px | 16 px | 388 px | viewport − 48 px |
| ≤ 429 px | 44 px | 4 px | 8 px | 348 px | 381 px |
| ≤ 379 px | 44 px | 2 px | 8 px | 336 px | 331 px |
| ≤ 349 px | 38 px | 2 px | 6 px | 290 px | 301 px |
| ≤ 319 px | 38 px | spread | 2 px | fills | 271 px |

At ≤ 349 px every dock (not just the seven-tab one) moves to the tight rhythm, so
My Day's six tabs and Cart's three sit in the same capsule proportions.

FlowPath's `BottomDock` keeps its own wrapper on purpose: it pins to the viewport
(its page has no positioned frame), stays visible inside the desktop shell, and
carries the FlowPath badge — but it wears the same gutters and the same dock, so
it is the same design.

## Guard

`tests/siteFooterNavUnificationContract.test.mjs` (8 assertions): every surface
renders the shared wrapper and hand-rolls none of it; the wrapper carries the
capsule + `GlassDock siteFooter`; no surface hides at a breakpoint of its own;
the blur/tint tokens are defined once and consumed by the single material rule;
no page CSS repaints the dock; the seven-tab fit ladder exists and never freezes
the wave; FlowPath keeps the same gutters; `PageTabs` steps aside on tablet
portrait.
