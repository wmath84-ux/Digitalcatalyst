# Liquid Glass — Full Site Audit & Replacement Plan (2026-09-02)

> Source pack: https://websiteglass.com/docs — **22 components** (`glass`, `glass-button`, `glass-switch`, `glass-slider`, `glass-tabs`, `glass-tooltip`, `glass-input`, `glass-popover`, `glass-dialog`, `glass-dock`, `glass-tile`, `glass-swatch`, `glass-card`, `glass-checkbox`, `glass-radio`, `glass-toggle-group`, `glass-accordion`, `glass-dropdown-menu`, `glass-select`, `glass-sheet`, `glass-toast`, `glass-command`).
>
> Repo state: **all 22 files already vendored** under `src/components/ui/glass*.tsx` (Waves 0–6, PR #527/#528). This audit is about *where they are still NOT used* and what old UI must be removed.

---

## 1. Website check — what each of the 22 components is for

| # | Component | Kya hai | Best fit in our app |
|---|---|---|---|
| 1 | `glass` (`Glass`, `GlassLens`, `GlassSurface`) | Lens engine. `GlassSurface` = frosted panel for popovers / dialogs / cards | Every panel, overlay backdrop, card |
| 2 | `glass-button` | Icon disc / text capsule with gel press | **All icon buttons** (course toolbar, header, viewer), CTAs |
| 3 | `glass-switch` | iOS toggle | Settings toggles, on/off preferences, theme / snow / view toggles |
| 4 | `glass-slider` | Range slider, thumb becomes lens | Audio seek, volume, zoom, FlowPath curves |
| 5 | `glass-tabs` | Tab list with spring indicator | Page tabs (Revision), course dock tabs, PDP detail tabs |
| 6 | `glass-tooltip` | Frosted tooltip capsule | Every `title=""` icon button |
| 7 | `glass-input` | Search capsule | Store / Search / Home search, notes search |
| 8 | `glass-popover` | Frosted context menu | Mind-map Save / Align menus, My Day create menu |
| 9 | `glass-dialog` | Modal that scales in | Confirm dialogs, rename dialogs, module lock dialog |
| 10 | `glass-dock` | macOS dock with magnification | Course player bottom dock (Module / Resource / Note / Mind map / Paid) — *desktop only per D4* |
| 11 | `glass-tile` | Selectable grid cell | Category tiles, question-mode picker, module grid |
| 12 | `glass-swatch` | Colour swatch | Mind-map node colour, notes highlight colour, theme accent |
| 13 | `glass-card` | Card with header/content/footer | Product cards, plan cards, leaderboard rows, notes cards |
| 14 | `glass-checkbox` | Checkbox with accent fill | Filters, "mark complete", terms accept |
| 15 | `glass-radio` | Radio group | Sort options, plan pick, payment method |
| 16 | `glass-toggle-group` | Segmented control | Store filter chips, PDP tabs, revision view switch |
| 17 | `glass-accordion` | Collapsible sections | **PDP curriculum + FAQ**, course sidebar module groups, checkout review |
| 18 | `glass-dropdown-menu` | Portaled dropdown, keyboard nav | Sort menu, "more" (⋯) menus, mind-map menus |
| 19 | `glass-select` | Frosted select + listbox | Store / Search sort, every form select |
| 20 | `glass-sheet` | Drawer from any edge | Course overlay (bottom sheet on mobile), cart drawer, filters drawer |
| 21 | `glass-toast` | Toast system | Already global via `ToastViewport` in `main.tsx` |
| 22 | `glass-command` | ⌘K palette | Global `GlassCommandPalette` (already) + **search page** command mode |

---

## 2. App structure — pages, sub-pages, routes

Hash router lives in `src/main.tsx`. **19 user routes + 4 dev routes + 2 admin routes.**

| Route | Entry file | Sub-pages / tabs / modes |
|---|---|---|
| `#/landing` | `src/LandingApp.tsx` + `components/landing/*` (8 files) | hero, features, CTA |
| `#/auth` | `src/AuthApp.tsx` + `components/auth/*` | sign-in, sign-up, forgot |
| `#/home` | `src/home/App.tsx` + `home/components/*` (7 files) | header, hero, category strip, sections |
| `#/store` | `src/App.tsx` → `components/StorePage.tsx`, `Hero`, `FilterChips`, `ProductCard`, `SearchBar`, `CategoryStrip` | filter chips, sort, grid |
| `#/search` | `components/SearchPage.tsx` | query, filter, sort |
| `#/product/:id` | `src/PdpApp.tsx` + `components/pdp/*` (4 files, 2111 lines) | tabs: Description / Curriculum / Instructor; module rows (expand); buy sheet |
| `#/cart`, `#/favorites` | `src/CartWishlistApp.tsx` + `cartWishlist/**` (8 files) | tabs Cart / Wishlist |
| `#/checkout` | `components/checkout/*` + `checkout/*` (5 files, 2204 lines) | steps: review → payment → success |
| `#/course/:id` | `src/CoursePlayerApp.tsx` + `course/*` (12 files, **7822 lines**) | see §3 — biggest surface |
| `#/my-day` | `src/MyDayApp.tsx` + `components/myday/*` (13 files) | Tasks / Schedule / Reminders overlays, quick notes, create menu |
| `#/leaderboard` | `src/LeaderboardApp.tsx` | single page |
| `#/revision` | `revision/**` (23 files, 5777 lines) | pages: Bank, AI Generate, Test, Results, Progress |
| `#/flowpath` | `FlowPathApp.tsx` + `components/flowpath/*` + `flowpath/**` (16 files) | canvas, Create modal, Curve settings modal, Activity editor, Bulk creator |
| `#/profile` | `profile/*` (4 files) | layout, preference rows, edit modal |
| `#/profile/subscriber-experience` | `profile/SubscriberExperiencePage.tsx` | — |
| `#/settings` | `settings/SettingsPage.tsx` | notification & privacy toggles, push help modal |
| `#/subscription` | `subscription/**` + `components/subscription/*` (24 files, 5254 lines) | plans, compare, renewal, banner |
| `#/notifications` | `components/NotificationsPage.tsx` | list + filters |
| Global shell | `components/Header.tsx`, `DesktopShell.tsx`, `AppShell.tsx`, `GlassCommandPalette.tsx` | header actions, desktop rail, top-bar search, ⌘K |
| `#/dev/*` (4) | glass-preview, profile-preview, mindmap-preview, subscription-preview | sandboxes |
| `#/admin`, `#/admin-login` | `src/admin/**` (27 files, 11 221 lines) | **FROZEN — out of scope** |
| Footer nav | `components/BottomNav.tsx` + `components/glass-dock/*` | **FROZEN — out of scope** |

---

## 3. Inventory — counts per page (raw grep of the source)

| Page | Files | Lines | `<button>` | inputs | textarea | native select | dialogs/menus | `title=` tooltips | fixed overlays | glass imports today |
|---|---|---|---|---|---|---|---|---|---|---|
| Landing | 8 | 613 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| Auth | 2 | 409 | 7 | 4 | 0 | 0 | 0 | 0 | 0 | **0** |
| Home | 7 | 1109 | 12 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Store | 7 | 982 | 9 | 1 | 0 | 0 | 0 | 0 | 0 | 5 |
| Search | 1 | 396 | 5 | 1 | 0 | 0 | 0 | 1 | 0 | 1 |
| PDP | 4 | 2111 | 30 | 1 | 1 | 0 | 0 | 0 | 1 | 1 |
| Cart + Favorites | 8 | 536 | 9 | 0 | 0 | 0 | 0 | 6 | 0 | **0** |
| Checkout | 5 | 2204 | 16 | 1 | 0 | 0 | 0 | 4 | 0 | **0** |
| **Course player** | **12** | **7822** | **70** | 2 | 1 | 0 | 2 | **18** | 5 | 2 |
| My Day | 13 | 2976 | 36 | 13 | 2 | 0 | 1 | 0 | 0 | 1 |
| Leaderboard | 1 | 275 | 4 | 0 | 0 | 0 | 0 | 1 | 0 | **0** |
| Revision | 23 | 5777 | 63 | 9 | 2 | 1* | 1 | 25 | 5 | 4 |
| FlowPath | 16 | 4066 | 35 | 25 | 2 | 1* | 3 | 3 | 8 | 5 |
| Profile | 4 | 1402 | 17 | 4 | 2 | 0 | 0 | 2 | 1 | 2 |
| Settings | 1 | 234 | 3 | 0 | 0 | 0 | 0 | 2 | 0 | 0 (via Profile) |
| Subscription | 24 | 5254 | 46 | 2 | 0 | 0 | 2 | 4 | 5 | 3 |
| Notifications | 1 | 350 | 4 | 0 | 0 | 0 | 0 | 2 | 0 | **0** |
| Shell (Header/DesktopShell) | 4 | 1415 | 6 | 0 | 0 | 0 | 0 | 1 | 0 | 6 |
| Footer nav (frozen) | 4 | 882 | 0 | — | — | — | — | — | 2 | 0 |
| Admin (frozen) | 27 | 11 221 | 94 | 157 | 20 | 27 | 4 | 61 | 4 | 0 |

\* the two "native select" hits are the `GlassSelect` word matched by the grep, not real `<select>` — Wave 5 already removed all native selects/ranges/checkboxes outside admin.

**Totals (in scope, non-admin, non-footer): ~380 buttons, ~64 inputs, ~10 textareas, ~9 dialogs/menus, ~69 title-tooltips, ~26 fixed overlays.**

### 3a. Course player deep-dive (`#/course/:id`) — user's #1 priority

| File | Lines | Buttons | title tips | Menus / dialogs | What is there | Current glass |
|---|---|---|---|---|---|---|
| `CoursePlayerApp.tsx` | 1378 | 10 | 10 | 0 | header (logo/back, title, subscription badge, progress bar), **8 toolbar toggles**: file-bars, player-chrome, fullscreen, viewport (desktop/mobile), theme (sun/moon), snow, secondary-strip, chrome-restore pill; mark-complete button; portrait + landscape shells | none |
| `course/CourseOverlay.tsx` | 1060 | 11 | 2 | 0 | bottom **dock with 5 tabs** (Module / Resource / Note / Mind map / Paid), drag handle, split handle, module list with wire rail, resource list, buy-module / buy-update CTAs, close, scrim | none |
| `course/CourseSidebar.tsx` | 247 | 6 | 0 | 0 | desktop sidebar: module groups, lock rows, file rows, buy CTAs | none |
| `course/ResourceViewer.tsx` | 980 | 7 | 14 | 0 | viewer toolbar: personal-copy toggle, edit toggle, fullscreen, download, external, retry; zoom in/out/pct; empty / missing / error states | none |
| `course/AudioPlayer.tsx` | 265 | 4 | 2 | 0 | play, mute, loop, restart + seek slider | `glass-slider` ✔ |
| `course/ImageViewer.tsx` | 219 | 0 | 0 | 0 | zoom in / out / fit / reset / download (rendered via parent) | none |
| `course/MindMapPanel.tsx` | 2279 | 19 | 14 | 1 (`role=menu` portal) | toolbar: new, add-child, auto-arrange, **Align menu** (arrangement ×3 + text-fit ×2 radio items), fit, theme, delete, **Save menu** (save-now / label), library overlay (map grid, rename input, rename-save, delete-map, open-map), close, stats/status | none |
| `course/NotesPanel.tsx` | 342 | 4 | 2 | 0 | composer, list/grid mode toggle, save/cancel, edit/delete per note | none |
| `course/RichTextEditor.tsx` | 342 | 4 | 2 | 0 | rich toolbar actions, zoom in/out/pct, heading input | none |
| `course/ConfirmDeleteDialog.tsx` | 159 | 2 | 0 | 1 (`alertdialog`) | delete confirm | `GlassSurface` ✔ |
| `course/SnowOverlay.tsx` | 397 | 0 | 0 | 0 | canvas — no UI controls | n/a |
| `course/MindMapPreview.tsx` | 154 | 3 | 0 | 0 | dev-only sandbox | — |

**Course player summary: 70 buttons, 18 tooltips, 2 drop-up menus, 1 confirm dialog, 5-tab dock, 1 slider, 4 zoom controls, 8 settings-style toggles — only 2 of 12 files touched by glass so far.**

---

## 4. Replacement plan — page by page (what → which glass component)

Legend: **NEW** = not glass yet, replace old markup. **KEEP** = already on the pack. **REMOVE** = old hand-styled class / element to delete.

### 4.1 Course player `#/course/:id` (Wave 7 — first)

| Old element | New component | Notes |
|---|---|---|
| 8 header toggles (`course-icon-button` divs) | `GlassButton` (icon disc) + `GlassTooltip` | drop all `title=`; active state via `tint`/`tintColor`; keep every `data-course-*` + `aria-pressed` |
| Theme / snow / viewport / file-bars / chrome toggles as *settings* | also expose in a **Settings popover** (`GlassPopover` from a ⚙ `GlassButton`) with `GlassSwitch` rows | one place for all player settings; header keeps quick toggles |
| chrome-restore pill | `GlassButton` capsule | — |
| mark-complete bar | `GlassCheckbox` + `GlassButton` | — |
| progress bar | `GlassSurface` track | — |
| CourseOverlay 5-tab dock | **mobile:** `GlassTabs` inside a `GlassSheet` (bottom); **desktop:** `GlassDock` (D4 allows desktop) | keep `data-course-dock*`, drag handle stays |
| CourseOverlay scrim + panel | `GlassSheet` | replaces `fixed inset-0` custom scrim |
| Module groups (overlay + sidebar) | `GlassAccordion` | each module = accordion item; lock row inside |
| Module / file rows | `GlassTile` (selected = current file) | — |
| Buy-module / buy-update CTAs | `GlassButton` capsule | — |
| ResourceViewer toolbar (7 btns, 14 titles) | `GlassButton` + `GlassTooltip` | zoom ±/pct → `GlassSlider` compact |
| ImageViewer zoom | `GlassSlider` + `GlassButton` | — |
| MindMap 19 toolbar btns | `GlassButton` icon disc + `GlassTooltip` | `mm-tool` classes removed |
| MindMap **Align menu** (portal `role=menu`) | `GlassDropdownMenu` with radio items | keeps `data-course-mindmap-arrangement` / `-text-fit-option` |
| MindMap **Save menu** | `GlassPopover` | — |
| MindMap library overlay | `GlassDialog` (map grid = `GlassTile`, rename = `GlassInput`, delete = `ConfirmDialog`) | — |
| MindMap node colour | `GlassSwatch` | new affordance |
| NotesPanel mode toggle | `GlassToggleGroup` | list / grid |
| NotesPanel note cards | `GlassCard` | — |
| RichTextEditor toolbar | `GlassButton` + `GlassTooltip`; zoom → `GlassSlider` | — |
| AudioPlayer transport | `GlassButton`; seek already `GlassSlider` | add volume `GlassSlider` |
| ConfirmDeleteDialog | KEEP (`GlassSurface`) → upgrade to `GlassDialog` for scale-in | — |

### 4.2 Store `#/store` + Search `#/search`

| Old | New |
|---|---|
| `SearchBar` sort (via `GlassSelect`) | KEEP; also offer `GlassDropdownMenu` on the ⋯ |
| Search input | `GlassInput` (store SearchBar is `GlassSurface` trigger → make it `GlassInput`) |
| `FilterChips` | KEEP `GlassToggleGroup` |
| Category strip | `GlassTile` row |
| `ProductCard` | `GlassCard` (header = image, content = title/price, footer = CTA `GlassButton`) |
| Hero CTAs | `GlassButton` |
| Search page: query box | `GlassInput` + `GlassCommand` mode (⌘K style live-filter list) |
| Search page sort | KEEP `GlassSelect` |
| Search page filter | `GlassToggleGroup` / `GlassRadio` |
| Empty states | `GlassCard` |

### 4.3 PDP `#/product/:id`

| Old | New |
|---|---|
| Detail tabs | KEEP `GlassToggleGroup` → or `GlassTabs` (spring indicator) |
| `CurriculumModuleRow` (expandedModule + ChevronDown) | **`GlassAccordion`** (nested for child modules) |
| FAQ / highlights | `GlassAccordion` |
| Buy sheet (fixed overlay) | `GlassSheet` bottom |
| 30 buttons (add-cart, wishlist, share, buy, module buy…) | `GlassButton` + `GlassTooltip` on icon ones |
| Related product cards | `GlassCard` |
| Coupon input | `GlassInput` |
| Rating / review textarea | `.dc-field` (pack has no textarea) |

### 4.4 Cart / Favorites / Checkout

| Old | New |
|---|---|
| Cart ↔ Wishlist tabs | `GlassTabs` |
| Line-item cards | `GlassCard` |
| 6 `title=` icon buttons | `GlassButton` + `GlassTooltip` |
| Remove confirm | `GlassDialog` |
| Checkout steps | `GlassTabs` (read-only indicator) |
| Review sections (Modules / Resources / Add-ons) | `GlassAccordion` |
| Payment method pick | `GlassRadio` |
| Coupon | `GlassInput` |
| Terms | `GlassCheckbox` |
| Pay CTA | `GlassButton` |

### 4.5 Home / Landing / Auth

| Old | New |
|---|---|
| Home search | `GlassInput` |
| Home section cards | `GlassCard` |
| Home category tiles | `GlassTile` |
| Landing CTAs | `GlassButton` |
| Landing feature cards | `GlassCard` |
| Auth inputs | `.dc-field` (email/password) — pack has no text field |
| Auth submit / social buttons | `GlassButton` |
| Auth mode switch (sign-in / sign-up) | `GlassToggleGroup` |

### 4.6 My Day / Revision / FlowPath / Leaderboard / Notifications

| Page | Replace |
|---|---|
| My Day | 36 buttons → `GlassButton`; task cards → `GlassCard`; task done → `GlassCheckbox`; overlays (`Modal`) → `GlassDialog`/`GlassSheet`; create menu stays (pinned by test) |
| Revision | 63 buttons → `GlassButton`; 25 titles → `GlassTooltip`; answer options → `GlassRadio`; multi-select → `GlassCheckbox`; page tabs KEEP; results cards → `GlassCard` (NOT `.rev-card` — pinned) |
| FlowPath | 35 buttons; 3 modals → `GlassDialog`; 25 inputs → `.dc-field`; sliders KEEP; activity type → `GlassSelect` KEEP |
| Leaderboard | rows → `GlassCard`; period switch → `GlassToggleGroup`; 1 title → tooltip |
| Notifications | filter chips → `GlassToggleGroup`; items → `GlassCard`; mark-read → `GlassButton`; 2 titles → tooltip |

### 4.7 Profile / Settings / Subscription

| Page | Replace |
|---|---|
| Settings | `PreferenceRow` KEEP (`GlassSwitch`); section cards → `GlassCard`; push help → `GlassDialog`; add a `GlassSelect` for language/theme if present |
| Profile | edit modal → `GlassDialog`; avatar actions → `GlassButton`; 2 titles → tooltip |
| Subscription | plan cards → `GlassCard`; plan pick → `GlassRadio`; compare → `GlassAccordion`; 46 buttons → `GlassButton`; renewal banner → `GlassSurface` KEEP; 2 dialogs → `GlassDialog` |

### 4.8 Global shell

| Old | New |
|---|---|
| Header action discs | KEEP (`GlassSurface` + tooltip) → collapse into `GlassButton` |
| Desktop rail | KEEP; optional `GlassDock` for the rail icons (D4) |
| Desktop top-bar search | KEEP `GlassInput` |
| ⌘K palette | KEEP `GlassCommand` |
| Toasts | KEEP `glass-toast` |

---

## 5. What gets REMOVED (old system)

- `course-icon-button`, `mm-tool*`, `mm-menu*` CSS classes + the `ToolbarMenu` portal in `MindMapPanel.tsx`
- Hand-painted `bg-white/60 border-white/70 shadow-lg` pills in store/home/pdp
- All `title=""` on icon buttons in scope (→ `GlassTooltip`)
- Custom `fixed inset-0` scrims where `GlassSheet` / `GlassDialog` takes over (course overlay, PDP buy sheet, subscription dialogs)
- `ui/GlassCard.tsx` (repo's old one, 0 call-sites) → delete; use `glass-card.tsx`
- `ui/MacWindowModal.tsx` (0 call-sites) → delete
- `ui/GlassBackdrop.tsx`, `ui/HoldRing.tsx`, `ui/TrafficLights.tsx` → review; delete if unused after migration

**Never touched:** `src/admin/**`, `src/components/admin/**`, `src/components/BottomNav.tsx`, `src/components/glass-dock/**` (frozen by decision D4 — mobile footer nav).

---

## 6. Delivery order (one commit per wave, gates after each)

| Wave | Scope | Files | Est. components |
|---|---|---|---|
| **7** | Course player — header toolbar + settings popover + overlay sheet/tabs/accordion | `CoursePlayerApp`, `CourseOverlay`, `CourseSidebar` | button, tooltip, popover, switch, sheet, tabs, dock (desktop), accordion, tile, checkbox |
| **8** | Course player — viewers & panels | `ResourceViewer`, `ImageViewer`, `AudioPlayer`, `NotesPanel`, `RichTextEditor` | button, tooltip, slider, toggle-group, card |
| **9** | Course player — mind map | `MindMapPanel` | button, tooltip, dropdown-menu, popover, dialog, tile, input, swatch |
| **10** | Store + Search + PDP | `StorePage`, `SearchBar`, `SearchPage`, `ProductCard`, `PdpApp`, `pdp/*` | input, command, card, tile, accordion, sheet, radio, dropdown-menu |
| **11** | Cart / Checkout / Subscription | `cartWishlist/**`, `checkout/**`, `subscription/**` | tabs, card, accordion, radio, checkbox, dialog |
| **12** | Home / Landing / Auth / Leaderboard / Notifications | — | input, card, tile, button, toggle-group |
| **13** | My Day / Revision / FlowPath / Profile / Settings | — | button, tooltip, dialog, radio, checkbox, card |
| **14** | Cleanup — delete dead old UI files/classes, update `GlassPreview`, contract tests, README | — | — |

Gates per wave: `npx tsc --noEmit` (baseline 7 errors, 0 new) · `bash run_tests.sh` (baseline 8 fails, 0 new) · `npm run build` · live preview · frozen-path diff empty.

---

## 7. Owner decisions (2026-09-02)

| # | Question | Decision |
|---|---|---|
| D5 | Footer nav (`BottomNav` + `components/glass-dock/**`) and admin (`src/admin/**`, `src/components/admin/**`) | **Stay frozen** — D4 stands |
| D6 | Course player ⚙ Settings popover | **Add it** — `GlassPopover` from a `GlassButton` in the header; rows are `GlassSwitch` for theme, snow, desktop/mobile view, file bars, player chrome, toolbar strip. Header quick-toggles remain as `GlassButton` |
| D7 | Start | Owner reviews this plan first; implementation waits for sign-off |

---

# PHASE A — Backgrounds first (owner direction, 2026-09-02)

> Owner: *"Jo apna blurred background hai uske alava kuch bhi sahi nahi hai. Sabhi pages se white page aur gradient background absolute remove karna hai — mobile, tablet, desktop teeno. Uske baad 22 components."*

## A0. Diagnosis — why white / gradient pages are still visible

The previous rollout did **not remove** the old paint. It kept every `bg-white` / `bg-gradient-to-*` / CSS-file gradient in the source and layered **blanket CSS overrides** on top (`src/glass.css` "Part 1 … 1g, 2, 2b"):

| Override rule (glass.css) | What it actually does on screen |
|---|---|
| `[class*="bg-white"]:not([class*="bg-white/"])` → `rgb(255 255 255 / .55)` + `blur(14px)` | **Every full-page root** (`min-h-screen bg-white` on PDP, Leaderboard, Notifications, Checkout, Subscription, SubscriberExperience, RenewalPreview) and every mobile `data-app-frame bg-white shadow-xl` becomes a **55 % white frosted sheet covering the whole viewport**. Cards inside it are *another* 55 % frost → stacked = near-opaque white. **This is the "white page" the owner sees.** |
| `[class*="bg-gradient-to"]` → `background-image:none` | Strips the image but the element keeps any `from-*` colour fallback; buttons get a forced solid indigo |
| `.dc-app-shell`, `.dc-app-frame`, `[data-profile-page]` → `transparent !important` | Works — but `[data-settings-page]`, `[data-profile-hero]`, `.course-*-surface`, `.fp-*` and dozens of others are not covered |
| Backdrop mount | `GlassBackdrop` is mounted only in `AppShell` / `DesktopShell` / `MyDayApp` / `FlowPathApp`. **`#/checkout`, `#/auth`, `#/landing`, `#/course/:id` bypass `AppShell` → no backdrop at all** → checkout sits on the `html` white canvas, auth/landing on solid `#05060f`. |

Result: 0 pages actually *removed* their background; they were dimmed. Source still carries **161 `bg-gradient-to-*`, 301 `rounded-* bg-white` panels, ~430 `bg-white*` utilities, 15 CSS-file page gradients** (numbers from `scripts/glass-coverage.mjs`, authoritative).

Per-page paint still in source (in scope only):

| Page | `bg-white*` | opaque `bg-white` | light-grey plates | gradients | page-root paint | backdrop mounted |
|---|---|---|---|---|---|---|
| Landing | 1 | 0 | 0 | 11 | `bg-[#05060f]` ×2 | **no** |
| Auth | 9 | 1 | 1 | 2 | `bg-[#05060f]` | **no** |
| Home | 16 | 3 | 6 | 8 | frame | via AppShell |
| Store | 20 | 2 | 4 | 7 | frame `bg-white shadow-xl` | via AppShell |
| Search | 8 | 4 | 4 | 1 | frame | via AppShell |
| PDP | 37 | 19 | 19 | 16 | `min-h-screen bg-white` + frame | via AppShell |
| Cart / Favorites | 2 | 0 | 2 | 4 | frame | via AppShell |
| Checkout | 23 | 21 | 11 | 4 | `min-h-screen bg-white` + frame | **no** |
| Course player | 13 | 6 | 3 | 17 | `bg-[var(--course-bg)]` (own theme) | **no** |
| My Day | 50 | 21 | 24 | 16 | `lg:bg-white` frame | yes (own) |
| Leaderboard | 10 | 8 | 2 | 1 | `min-h-screen bg-white` + frame | via AppShell |
| Revision | 63 | 49 | 45 | 27 | frame | via AppShell |
| FlowPath | 38 | 38 | 31 | 16 | `bg-[var(--fp-bg-0)]` + `.fp-bg-grid` | yes (own) |
| Profile | 22 | 15 | 13 | 11 | `bg-gradient-to-b from-indigo-50 … to-white` ×2 + `[data-profile-hero]` css | via AppShell |
| Settings | 2 | 2 | 0 | 3 | `bg-gradient-to-b from-indigo-50 … to-white` ×2 | via AppShell |
| Subscription | 80 | 47 | 22 | 19 | `min-h-screen bg-white` + frame + `.dc-glass-hero` css | via AppShell |
| Notifications | 5 | 4 | 2 | 0 | `min-h-screen bg-white` + frame | via AppShell |
| Shell | 8 | 2 | 7 | 5 | `bg-[#f6f7fb]` desktop page, rail `bg-white/85` | yes |
| CSS files | 5 | 5 | 2 | 80 (index.css + landing.css) | `html,body,#root {#fff}`, `.dc-app-shell` orbs, `.dc-app-frame` wash | — |

## A1. Approach — remove at the SOURCE, not by override

1. **One backdrop, every route.** `GlassBackdrop` mounts for every non-admin route (including checkout / auth / landing / course player). Duplicate mounts removed so it is exactly one layer.
2. **Page roots go transparent in the JSX.** Every `min-h-screen bg-white`, `bg-gradient-to-b from-indigo-50…`, `bg-[#05060f]`, `bg-[#f6f7fb]`, `bg-slate-50`, and every `data-app-frame … bg-white shadow-xl shadow-slate-200 sm:border sm:border-slate-200 | lg:bg-white` loses its paint. No frame "card" on tablet — the page body scrolls directly over the backdrop on all three breakpoints.
3. **CSS-file page paint deleted** from `src/index.css` / `src/landing.css`: `body/#root` white, `.dc-app-shell` gradient + aurora orbs, `.dc-app-frame` wash, `[data-profile-page]`, `[data-profile-hero]`, `.dc-glass-hero*`, `.fp-bg-grid`, header/footer glow gradients, `.course-*-surface` gradients. `html` canvas becomes the backdrop base ink (`#0a0c12`) so iOS overscroll never flashes white.
4. **Section / card whites become one glass material.** Every `rounded-* bg-white`, `bg-white/NN`, `bg-slate-50/100` panel and every decorative `bg-gradient-to-*` is replaced by a single `.dc-card` token (the pack's `GlassSurface` material expressed as CSS so the swap is a class change now and a component swap in Phase B). Identity gradients on CTAs go solid brand until Phase B swaps them for `GlassButton`.
5. **Delete the blanket overrides** (glass.css Parts 1, 1b–1g, 2, 2b) once the source is clean — no more "dim it with CSS".
6. **Ink follows the material**: body ink is paper-on-ink (white .92); inside `.dc-card` the ink matches the chosen card tint (see D8).
7. Contract tests that pin the old paint (`storeFiltersAdminProductContract`, `profilePlanGlowContract`, `liquidGlassWaveSix .dc-quote`, revision `.rev-card` background, etc.) are updated in the same commit as the surface they pin.

## A2. Waves (one commit each, preview + sign-off between)

| Wave | Scope | Files (≈) |
|---|---|---|
| **A1 Foundation** | backdrop on 100 % routes · every page-root + `data-app-frame` paint removed · CSS-file page paint removed · `.dc-card` token defined · overrides 1b/1c/1d/1g deleted | ~28 TSX + 3 CSS |
| **A2 Checkout + Subscription** (+ management, renewal, premium gate, unlock) | 103 `bg-white*`, 23 gradients → `.dc-card` / transparent | ~29 |
| **A3 Profile + Settings + Subscriber experience** | 24 `bg-white*`, 14 gradients | ~5 |
| **A4 Revision** (bank, AI config, AI generate, test, results, progress) | 63 `bg-white*`, 45 grey plates, 27 gradients | ~23 |
| **A5 My Day** (all overlays, quick notes, schedule, reminders) | 50 `bg-white*`, 24 grey, 16 gradients | ~13 |
| **A6 PDP + Store + Search + Cart/Favorites** | 67 `bg-white*`, 28 gradients | ~20 |
| **A7 Home + Landing + Auth + Leaderboard + Notifications** | 41 `bg-white*`, 22 gradients, `landing.css` | ~19 |
| **A8 Course player + FlowPath** | player shell over backdrop (theme toggle → light-glass / dark-glass, not a page colour); FlowPath canvas over backdrop | ~28 |
| **A9 Purge** | delete glass.css Parts 1/1e/1f/2/2b; `glass-coverage` baseline re-recorded: `bg-gradient-to-*` = 0 (banners excluded), `rounded-* bg-white` = 0 in scope | ~3 |

Then **Phase B** = the 22-component waves 7–14 from §6 above.

Gates per wave: `tsc --noEmit` (0 new), `bash run_tests.sh` (0 new failures; pinned-paint tests updated with the surface), `npm run build`, `node scripts/glass-coverage.mjs` (gradient + white counts strictly down), frozen-path diff empty (admin, BottomNav, glass-dock).

## A3. Wave log

### A1 Foundation — shipped `3283e46`
Backdrop single-mounted at routing level; page roots / `data-app-frame` / CSS page paint removed; glass.css Parts 1b/1c/1d deleted; `tests/liquidGlassPhaseABackdropContract.test.mjs` pins it.

### A2 Checkout + Subscription — shipped (this commit)
Owner refinement before the wave: **pack components at their defaults** (no `.dc-card` CSS token; the surfaces are the real `GlassCard` / `GlassSurface` / `GlassSheet` components from websiteglass.com), and the side panel is `GlassSheet`.

- `src/lib/glass.ts` `applyGlassTier` now pins `html.dark` while the tier is on so `readDark()` resolves the pack's dark material everywhere.
- Checkout: every white section in `CheckoutReviewStep` / `CheckoutSuccessStep` → `<GlassCard>`; `CheckoutApp` toolbar is a `border-b border-white/10` strip (no frost); `PaymentGateway` money card solid `bg-indigo-600`, soft buttons `bg-white/[0.06]`.
- Subscription: `HelpModal`, `FeatureSelectModal`, `CourseSelectModal` → `GlassSheet side="bottom"` (framer sheets removed); FAQ → `GlassAccordion`; search → `GlassInput`; feature rows / select-all → `GlassTile selected`; close + CTA → `GlassButton`. `ActiveMemberView`, `OwnedPlanCard`, `PlanOverview`, `PriceSummary` cards → `GlassCard` (brand hero gradients gone). `PremiumGate` modal body and `UnlockCelebration` card → `GlassSurface`; `SubscribeBar` frost strip → ink `bg-[#0a0c12]/60`. `SubscriptionPage` body gradient removed.
- Ink convention inside pages: sub-panels `bg-white/[0.06]` (hover `/[0.08]`), borders `border-white/10`, text `white / white/85 / white/75 / white/55`, callouts `<color>-500/15 + <color>-200 text + <color>-400/30 border`, brand fills solid (`bg-indigo-600`, `bg-emerald-600`).
- Tests updated where they pinned the old paint: `checkoutMobileWidths`, `liquidGlassWaveSixContract`, `subscriptionRepurchaseGuard` (owned CTA colour), `revisionSubscriptionFeatureContract` (icon bg), `premiumGateResponsiveContract` (headline gradient text). A2 contract appended to `liquidGlassPhaseABackdropContract` (4 tests).
- Gates: tsc 7 (baseline), tests 1965 pass / 8 baseline fails, build ok, coverage: `rounded-* bg-white` 301→290, `bg-gradient-to-*` 162→137, backdrop-blur-in-scrolling 78 (=), `in oklab` 530→521, render-sites 190→239; verify-backdrop OK; frozen paths untouched.

### A3 Profile + Settings + Subscriber experience — shipped (this commit)
- `ProfileLayout`: hero (brand gradient) → `GlassCard data-profile-hero`; every `CARD` section (membership, upgrade, referral, learning, renewal) → `GlassCard`; every `BTN_PRIMARY/SECONDARY` (gradient / white) → `GlassButton variant="capsule"`; edit + close icons → `GlassButton`; `BaseModal` → pack `Dialog/DialogContent/DialogTitle`; `PreferenceRow` keeps `GlassSwitch`, row panel `bg-white/[0.06]`; form fields keep `.dc-field` with dark ink; QuickStat/StatChip → soft panels.
- `SettingsPage`: white section → `GlassCard`; Sign-in / Got-it → `GlassButton`; back pill soft.
- `ProfilePreview` (dev): two white cards → `GlassCard`; sticky frost toolbar → plain strip.
- Tests re-pinned: `profilePlanGlowContract` (gradient → pack components), `liquidGlassWaveFiveContract` (BaseModal = Dialog). A3 contract appended.
- Coverage: gradients 137→126, `in oklab` 521→522 (±, ceiling 530 holds), render-sites 248→270. Note: the `rounded-* bg-white` metric's `\bbg-white\b` also counts translucent `bg-white/[0.06]` soft panels; re-baseline in A9.

### A3.5 — owner complaint fix (white ink · home header/side panel frost · white buttons · switch)

- `src/glass.css`: Parts 1 / 1e / 1f / 2 / 2b and the 55 % `.dc-card` frost are **gone**. No blanket `bg-white` remap remains — only the Phase A body ink rule (`rgb(var(--dc-paper-on-ink)/.92)`) and the `display:none` list for the old decorative glows.
- Home header (`src/home/components/Header.tsx`): outer `<header data-home-header>` carries only data hooks; the material is the pack **GlassSurface at defaults** (tint 0.5 · blur 14 · sat 1.6). Sheen/orb divs removed. Leaderboard / Notifications / Favourites pills are **GlassButton**; the profile trigger is soft glass. GlassSwitch "Dark mode" → `setGlassScheme` → `html.dark|light` → pack `readDark()` MutationObserver → every component re-reads its material.
- Desktop chrome (`src/components/DesktopShell.tsx` + `src/index.css` §rail/topbar): rail + topbar paint nothing of their own; `--dc-chrome-glass` is now numerically the pack's GlassSurface dark material (`rgba(60,62,68,.21)`, `blur(9.8px) saturate(1.3)`, dark rim) with an `html.light` swap to the light material. Rail hover/active: white/6 % and solid `#4f46e5` (no gradient).
- Shared/store header (`src/components/Header.tsx`): discs are GlassSurface at pack defaults (no per-state `tintColor`), title/subtitle/tooltips white.
- Home cards: `ContinueLearning` → **GlassCard**, home `ProductCard` → **GlassSurface**, hero CTA → **GlassButton capsule**.
- Ink pass (64 files, `/tmp/inkmap_safe.py`): `text-slate-900…400` → `text-white…white/55`, `bg-slate-50/100/200`, `bg-white/60–95` → `bg-white/[0.06–0.12]`, light borders → `border-white/10`, page-assuming shadows dropped. Coloured semantics (badges, coupons, `text-rose-*`, `bg-emerald-*`, brand fills) untouched. Course player + FlowPath deferred to A8 (own theme).
- Re-pinned tests: WaveTwo l.57 (`doesNotMatch tintColor`) + l.133 (`hover:bg-white/[0.08]`), homeHeaderGlassCollapse l.75–77 (chrome token values), revisionTestBankCardContentHeight l.61.

### A4 — Revision (bank · AI config · AI generate · test player · results · progress · profile) ✅

- `src/revision/components/ui.tsx`: `Card` → pack **GlassSurface** at Glass Card values (tint 0.4 · radius 20); `.rev-card` is now a transparent sizing hook. `SecondaryButton` → **GlassButton capsule** (`size="sm"` for Test Bank rows). `PrimaryButton` solid indigo (meaning-carrying, no gradient). Badges/ProgressBar re-inked to translucent tones; ErrorState retry → GlassButton.
- Modals: ExitGuard, TestBankLimitGate, DeleteConfirmation → pack **Dialog**; FilterSheet → **GlassSheet side="bottom"**; Test player submit dialog → GlassSurface at Dialog values (its frame-scoped positioning is contract-pinned).
- Headers/toolbars: `AppHeader` → GlassSurface radius 0 + GlassButton back; `[data-revision-app-header]` no longer paints. Test Bank toolbars keep their `dc-glass-toolbar` hooks (tests) — the hook now resolves to the pack material (`src/index.css` §Legacy hooks: rgba(60,62,68,.21) · blur 9.8px · sat 1.3 · pack rim, light material under `html.light`).
- Search → **GlassInput**; filter/nav/close discs → **GlassButton**; range + preset chips → **GlassToggleGroup**; text inputs → `.dc-field` (now Glass Input's material, white ink).
- Dashboard hero cards, StatChip, Profile hero/Configure/Import/Quick-tips → GlassSurface/GlassCard. Provider brand tiles (`aiConfig.ts`) solid colours (no gradient).
- `src/glass.css`: all light-page re-inks (slate ink on inputs/segments/selects/tiles/fields/choice, white chrome frost 78–82 %, gradient droplets) replaced with the pack's own dark states; rail uses `--dc-chrome-glass`.
- Fixed invalid classes the earlier inkmap produced (`border-white/10/70` → `border-white/10`) across src.
- Tests re-pinned: WaveFour/ProgressStableCards (Card = GlassSurface), ProfileCards, WaveFive (solid switch accent), WeakTopics banner tone, DashboardVerticalScale (`[data-rev-plan-cta] button`).

### A5 — My Day (tasks · schedule · reminders · quick notes · allowance card · shared overlays) ✅
- Gates: tsc clean (baseline 7), tests 1966 pass / 8 baseline fails, build OK, coverage no regression, backdrop OK, frozen diff 0 (`verify-glass-registry` SKIPs in the sandbox — no network — vendored files untouched).
- **Backgrounds/gradients removed at source** in `src/MyDayApp.tsx`, `src/components/myday/*` (BottomNav frozen) and `src/components/MyDayAllowanceCard.tsx`: 86 `bg-white*`/`bg-slate-*` plates, 16 gradients (FAB, header tiles, progress bar, CTAs, SideNav logo, hero), 25 `shadow-*`. All slate ink → white/rgba; coloured ink only where it carries meaning (priority/status/type badges, allowance state badge).
- **Card shells → pack GlassSurface (own defaults, radius 24)**: QuickNotes, Timeline, TaskList, Reminders, SideNav, GreetingHeader hero (solid indigo plate + blobs dropped), MyDayAllowanceCard (`<section>` keeps its data hooks, the panel is GlassSurface).
- **Shared overlays** (`src/components/ui/Modal.tsx`, `ConfirmDialog.tsx`) no longer pass an app tint (0.86 / 0.9 white): they run on the pack's GlassSurface defaults, white ink, close disc = GlassButton, Cancel = GlassButton capsule, confirm = solid rose/indigo (LiquidMetalButton out of ConfirmDialog). Overlay maths (`useOverlayBox`, scroll lock, Escape, `--glass-sheet-radius`) untouched — WaveOne pins still hold.
- **Controls**: header "Add Task / Add Event / Add" + search toggle + note composer + allowance refresh/subscribe → **GlassButton**; global search → **GlassInput** (+ GlassButton clear); modal text/date/time inputs → `.dc-field`; TaskModal priority/status → **GlassToggleGroup** (`dc-segment`); ScheduleModal event type → **GlassTile**; QuickNotes tooltips → pack default tint (was 0.85).
- CreateMenu drop-up kept as pinned (`dc-create-menu dc-glass`, keyframes) — the tail now uses the chrome-glass token so it matches the pack material.
- Test re-pin: `liquidGlassWaveFourContract` tooltip assertion (`<TooltipContent side="top">`, no app tint).
- Still hand-rolled inside My Day (Phase B): note colour tiles (`bg-white/[0.08] border-<hue>-300/70`), TaskItem/Timeline rows, `dc-glass-input` inline search pills in QuickNotes/TaskList, empty-state dashed boxes, TaskList filter chips (`dc-glass-chip`).

### A6 — PDP · Store · Search · Cart/Favorites · Library ✅
- Gates: tsc clean (baseline 7), tests 1966 pass / 8 baseline fails, build OK, coverage no regression, backdrop OK, frozen diff 0.
- **Backgrounds/gradients removed at source** in `src/PdpApp.tsx`, `components/{StorePage,Hero,SearchPage,SearchBar,FilterChips,ProductCard,OtherTabs}.tsx`, `components/pdp/*`, `cartWishlist/**` (BottomNav frozen), `App.tsx` toast: PDP ambient orbs + image/upgrade/price/curriculum gradient plates, Hero wash + blobs, store list-card fake sheen, `bg-white`/`bg-white/55–95` plates (module modal, purchase builder cards, search bar, chips), slate/zinc ink → white. Only the Hero headline `bg-clip-text` word-mark keeps its gradient (test-pinned brand mark, not a plate).
- **Pack components**: PDP image frame / meta grid / upgrade box / price box / share popover / coupon box / Details / Reviews / Related → **GlassSurface** (own defaults); Store list card + Library rows → **GlassCard**; PurchaseBuilder FullCourse/Summary/empty notes + ModuleSelectTrigger → GlassSurface; ModuleSelectModal panel → GlassSurface (own portal + `--glass-sheet-radius`; pinned overlay/`bg-indigo-950/30`/`min-h-0` untouched) with **GlassInput** search + **GlassButton** close/clear; SearchPage bar → **GlassInput** + GlassButton back/clear/filter, filter chips → **GlassToggleGroup**; Hero pills → GlassSurface capsules; store view toggle → GlassButton, options row → GlassSurface; FilterChips "Filters" + close → GlassButton, panel on pack defaults (was 0.85 white); PDP favourite/open-image/share + list-card wishlist → GlassButton; ExtraModeChip → GlassButton capsule; Cart EmptyState card → GlassSurface, Toast → GlassSurface.
- **App wrappers on pack defaults**: `ui/GlassCard.tsx` (was tint 0.5 + slate ink → pack 0.4 + white ink), `ui/LiquidMetalButton.tsx` (silver = pack GlassButton material; coloured tones = solid fills, no custom rgb/tint), `GlassSelectContent tint={0.9}` dropped repo-wide (pack 0.6), ProductCard/SearchBar/FilterChips/PDP tab strip tint overrides removed.
- Sticky chrome (store filter bar, search bar, PDP tab bar when stuck) uses `--dc-chrome-glass` (= pack GlassSurface dark @0.5). Primary CTAs solid indigo capsules (`dc-cta-brand` gradient off the store card).
- `src/glass.css`: Wave-3 PDP veil + `data-pdp-loose` re-ink removed (ink is white at source). `src/index.css`: `[data-store-view-options] > div > button` no-shrink companion.
- Tests re-pinned: `storeFiltersAdminProductContract` (pack glass, no white/gradient plates, no drop shadow), `storeViewDropdownResponsiveContract` (GlassSurface row), `pdpCurriculumVisibilityContract` (amber tone, no gradient).
- Still hand-rolled (Phase B): PurchaseBuilder module/resource rows + checkboxes (`bg-white/[0.08]`), Timeline-style curriculum rows, review articles, related-product rows, share menu items, cart line items' inner panels.

---

## Phase B · Wave 7 — Course player header + ⚙ Settings (D6) + CourseOverlay / CourseSidebar (+ A8 background removal for these files)

**Files:** `src/CoursePlayerApp.tsx`, `src/course/CourseOverlay.tsx`, `src/course/CourseSidebar.tsx`, `src/index.css` (course palette), `src/glass.css` (dock pill), `src/main.tsx` (scheme hand-off).

| Old | New (pack component, defaults) |
|---|---|
| 8 header toggles (`course-icon-button` 40 px squares, violet/sky/emerald fills) | `GlassButton` icon disc (tint 0.4) sized `[&_.size-12]:size-10`; active state = icon ink only (`[&_svg]:text-violet-300` / sky / emerald) — no painted fills |
| logo back button, mark-complete (icon + capsule), "Show bars" restore pill | `GlassButton` icon / capsule |
| — | **⚙ Settings** (`data-course-settings-trigger`): pack `Popover` + `PopoverContent` (tint 0.55) with `GlassSwitch` rows — Light theme · Snowfall · Desktop view · File bars · Toolbar strip · Player bars. Mounted in portrait header actions (`side="bottom" align="end"`) and landscape rail (`side="right"`). Header quick-toggles stay (D6). |
| portrait header `bg-[var(--course-surface)]` + violet→cyan wash + hairline gradient + drop shadow; landscape rail plate | `--dc-chrome-glass` + `--dc-chrome-glass-blur` (= pack GlassSurface material), no gradients, no shadow |
| progress fills `bg-gradient-to-r/t violet→fuchsia→cyan` | solid `bg-violet-400` |
| `.course-player-shell` opaque `#090912` / `#f1f5f9` plates | **transparent** — the player sits on the one Black Ice backdrop like every other route; `--course-surface/panel` = `--dc-chrome-glass` (dark) / `rgba(255,255,255,0.21)` (light) = the pack's two materials; `--course-text` white in both |
| player theme separate from pack scheme | player theme → `applyGlassScheme(theme)` while mounted (vendored components flip too), stored site preference restored on unmount; `main.tsx` route effect skips `#/course/` so it does not fight it |
| CourseOverlay sheet (`bg-[var(--course-panel)]` + shadow + violet top wash) | `GlassSurface` (tint 0.5 default) with the same absolute positioning / split / keyboard maths; scrim = pack sheet scrim (`bg-black/50 backdrop-blur-[2px]`) |
| overlay header + / × buttons | `GlassButton` `[&_.size-12]:size-8` |
| dock pill `.dc-footer-pill` (solid white, black border, black ink) + violet gradient indicator | `GlassSurface radius={999}` (ref forwarded — React 19), indicator = pack TabsList pill values (`bg-white/15` + inset highlight), inactive ink `text-white/55`; `.dc-dock-fluid` hidden under glass; `.dc-footer-pill` paint zeroed for `[data-course-dock]` only (footer nav untouched) |
| module rows / file rows (overlay + sidebar) | `GlassTile` (`selected` = holds current file / is current file), `aspect-auto` + `[&>span]:w-full [&>span]:justify-start` for a row layout |
| paid CTAs (`bg-amber-400 text-slate-950`) | `GlassButton` capsule, amber ink (meaning colour) |
| paid cards (amber gradient / ring plates) | `GlassSurface radius={20}` + `border-amber-400/25` |
| wire rail gradient lines | solid `bg-violet-400/40` / `bg-amber-400/40` |
| CourseSidebar `bg-[#11111d]`, updates banner gradient, `bg-white/5` panels | transparent root, `GlassTile` banner, `GlassSurface` cards |

Kept (pinned by tests): every `data-course-*` attribute, `aria-pressed` expressions, `title=` strings on the toggles, `dc-footer-pill` / `dc-footer-glow` / `dc-dock-fluid` class names, `function WireRail`, `.course-player-shell[data-course-theme="light"]` block, `--course-*` variable names, `<Eye size={13} className="text-sky-300"`.

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 313 → 290, gradients 49 → 39, render-sites 394 → 430 · backdrop OK · frozen diff empty.

**Wave 8 next:** ResourceViewer toolbar + ImageViewer + NotesPanel + RichTextEditor + AudioPlayer transport + ConfirmDeleteDialog (`tint={0.9}` → default).

---

## Phase B · Wave 8 — Course viewers & panels (ResourceViewer · ImageViewer · NotesPanel · RichTextEditor · AudioPlayer · ConfirmDeleteDialog) + A8 plates

| Old | New |
|---|---|
| ViewerHeader bar `bg-[var(--course-surface)]` | `--dc-chrome-glass` + blur (pack GlassSurface material) |
| My-copy / Edit toggles (emerald/violet fills), fullscreen square, retry, editor-zoom ± cluster (`bg-black/70`), warning-dismiss | `GlassButton` (capsule / icon; active = ink colour only); zoom cluster = `GlassSurface radius={999}` + two `GlassButton` |
| download / external / missing-state anchors (`bg-[var(--course-soft)]`) | `<a>` wrapping `GlassSurface radius={999}` (the link keeps `download` / `target`; test-pinned attrs untouched) |
| failed-state "Open original" | solid `bg-indigo-600 rounded-full` primary |
| `bg-[var(--course-bg)]` on viewer root / stage / empty / missing / failed, `course-viewer-empty-surface`, `course-image-surface`, `course-audio-surface` radial gradients | removed (CSS rules deleted); the Black Ice backdrop shows through; failed overlay uses `--course-loading` scrim |
| iframe `absolute left-0 top-0 bg-white` (mobile/scaled Google editors) | **kept** — pinned by `coursePlayerEditorFitScopeContract`; it is the document's own paper, not a page plate |
| NotesPanel note cards (blue-gradient plates + shadows in CSS) | `GlassCard` (tint 0.4, radius 20) with `data-course-note` on the card; CSS rule now only pins `color` + a blue focus ring |
| note edit / delete (sky / rose gradient squares) | `GlassButton` size-7, sky / rose icon ink |
| Save (`bg-violet-500`) / Cancel (`--course-soft-hover`) | Save = solid `bg-indigo-600 rounded-full`; Cancel = `GlassButton` capsule |
| empty pill (dashed `--course-soft`) | `GlassSurface radius={16}` dashed border |
| RichTextEditor toolbar / heading / body plates `bg-[var(--course-soft)]`, white dropdown menus (`bg-white border-slate-200`), slate menu items | `--dc-chrome-glass`; menus = `GlassSurface radius={20}` + pack `PopoverItem`; menu triggers + 10 actions = `GlassButton`; colour dots = `GlassSwatch size={24}` |
| AudioPlayer play (violet→cyan gradient disc), loop/restart/mute, card plates + art tiles | all `GlassButton`; cards = `GlassSurface radius={24}`; art tile `bg-violet-500/25`; seek stays `GlassSlider` |
| ConfirmDeleteDialog `tint={0.9}`, slate ink, white Cancel, rose shadow | `GlassSurface` default tint, radius 24, white ink, Cancel = `GlassButton` capsule, Delete = solid `bg-rose-600 rounded-full` (meaning colour) |

Test updated: `liquidGlassWaveFiveContract` no longer pins `tint={0.9}` on the dialog (asserts NO tint override instead — Decision A6).

**Gates:** tsc clean · tests 1966 / 8 · build OK · coverage `<button>` 290 → 271, gradients 39 → 34, render-sites 430 → 458 · backdrop OK · frozen diff empty.

---

## Phase B · Wave 9 — Mind map (`src/course/MindMapPanel.tsx` + `.course-mindmap-shell` / `.mm-*` in `src/index.css`)

| Old | New |
|---|---|
| Shell plate `--mm-bg: #0b0b16` (dark) / `#f8fafc` paper (light), `bg-[var(--mm-bg)]` on the shell | `--mm-bg: transparent`; the map sits on the shared Black Ice backdrop in BOTH map themes |
| `--mm-soft`/`--mm-surface` (flat rgba / `#11111d` / `#ffffff`) behind every `.mm-tool` tile, `.mm-pill`, skeletons | pack GlassSurface material: `--dc-chrome-glass` + `--dc-chrome-glass-blur` + rim (dark), `rgba(255,255,255,0.21)` (light); `.mm-tool` / `.mm-pill` class hooks kept (test-pinned), re-materialled in CSS |
| `.mm-menu` portalled drop-downs `#14141f` / `#ffffff` + 60px drop shadow, slate ink | pack PopoverContent material read from `:root` token, white ink, no drop shadow; `data-menu-theme="light"` = light material |
| Dark/light per-tile ink overrides (`#5b21b6`, `#b45309`, …), `SAVE_COPY.light` slate/amber-600 inks | removed — white ink + one meaning tone per state (`text-amber-300` / `emerald-300` / `rose-300`) in both themes |
| Node boxes: depth tones (`bg-violet-500/15`, `bg-white` leaf on light, gradient root `from-violet-600 to-indigo-600` + shadow) | non-root boxes = `GlassSurface radius={12}` (pack material, white ink, border colour carries the depth); root = solid `bg-indigo-600` (meaning colour, no gradient/shadow); ring-offset uses `--dc-bd-base` |
| Node `+` disc `bg-violet-500 shadow-md` | solid `bg-indigo-600`, no shadow (pinned `nodrag absolute top-1/2` / `-left-3.5` facing classes untouched) |
| First-run hint pill `bg-black/80` / `bg-white/90` | `GlassSurface radius={999}` white ink |
| Double-tap armed hint `bg-rose-950/85` / `bg-rose-50/95` | `bg-rose-500/15 text-rose-200 ring-rose-400/30` (meaning colour, both themes) |
| Library sheet `bg-[var(--mm-bg)]/97 backdrop-blur-sm` | `--dc-chrome-glass` + blur (pack material); canvas under it hidden via `[data-library-open="true"] > .react-flow { visibility: hidden }` |
| Library "New map" `bg-violet-500 rounded-lg` | solid `bg-indigo-600 rounded-full` primary |
| Library close (`toolButton` soft tile) · rename `bg-sky-500/90` · rename-save `bg-emerald-500` · delete-map `bg-rose-500/90` | `GlassButton` size-7 with sky / emerald / rose icon ink |
| Map cards `<li … rounded-2xl border>` + CSS `linear-gradient(165deg …)` plates + drop shadows (dark + light) | `<li>` wraps a `GlassCard` (tint 0.4, radius 20) carrying `data-course-mindmap-map-card`; CSS rule now only `background: transparent` + active violet ring (selectors kept for the pins) |
| Rename input `bg-[var(--mm-bg)] rounded-lg` | `.dc-field` (Glass Input material) `rounded-full` white ink |
| Error strip `text-rose-700` / `text-rose-200` split | `bg-rose-500/15 text-rose-200` |
| Anchor-dot / blink halos `var(--mm-bg)` | `var(--dc-bd-base)` |

Kept (pinned by tests): `className="mm-tool` literal + every `data-course-mindmap-*` attribute, `overflow-hidden` strip, `data-mm-map-name` span, `ToolbarMenu` + `createPortal` + `MENU_WIDTH_PX`, `role="menuitemradio"`, `aspect-square min-h-[104px]`, `data-mindmap-theme={mindTheme}`, `.course-mindmap-shell[data-mindmap-theme="light"]` block, `--mm-tool-size` steps, `.mm-tool > svg { width: 58%`, `.mm-menu { … max-width }`, `[data-course-mindmap-map-card] { background: … box-shadow: … }` (now transparent / none).

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 271 → 267, gradients 34 → 32, render-sites 458 → 465 (`native title=` 127 is unchanged from Wave 8, not a Wave 9 regression) · backdrop OK · frozen diff empty.

**Wave 10 next:** store / search / PDP (PurchaseBuilder module rows + checkboxes, curriculum rows, review/related rows, share-menu items).

---

## Phase B · Wave 10 — Store · Search · PDP (`PdpApp`, `pdp/PdpPurchaseBuilder`, `pdp/ModuleSelectModal`, `StorePage`, `SearchPage`, `SearchBar`, `FilterChips`, `ProductCard`)

| Old | New |
|---|---|
| PDP curriculum `CurriculumModuleRow` (hand-rolled `<button>` + `ChevronDown`, `bg-white/[0.06]` / amber plates) | pack **`GlassAccordion`** (tint 0.4, radius 18) per module, controlled by the same single `expandedModule` state (nested rows recurse inside `GlassAccordionContent`); paid module keeps its amber rim/ink as meaning colour; every `data-pdp-curriculum*` / `data-paid` pin untouched |
| PDP share menu rows (`bg-white/[0.06]` buttons) | `GlassSurface radius={20}` + pack **`PopoverItem`** rows (`data-product-share` kept) |
| PDP "What's included" box, rating aggregate box, review composer box, review articles (`bg-white/[0.06–0.08]` + `backdrop-blur-md`), `EmptyDetail` | **`GlassCard`** (app wrapper, pack tint 0.4) |
| Review star pickers (bare `<button>`), "Load more" plate button | `GlassButton` icon discs (`aria-pressed`) · `GlassButton` capsule (`data-load-more-reviews` kept) |
| Review textarea `bg-white/[0.08] focus:border-zinc-400` | `.dc-field` (Glass Input material), white ink |
| Related-product rows (`<button … bg-white/[0.08] backdrop-blur-md>`) | clickable `GlassCard` (`role="button"`, Enter/Space) |
| Image caption chips `bg-black/60` / `bg-black/50` | `--dc-chrome-glass` + blur (pack material) |
| Gallery thumb active ring `border-zinc-900` (invisible on dark) | `border-white/80` |
| Submit review / Back-to-store `rounded-xl` | solid indigo `rounded-full` primaries |
| PurchaseBuilder resource rows + paid-update rows (`<article>`/`<button>` `bg-white/[0.08]`, hand-drawn `role="checkbox"` squares) | **`GlassCard`** rows + pack **`GlassCheckbox`** (owned = checked + disabled, emerald tint); paid-update card carries `role="checkbox"` + keyboard; `data-pdp-resource` / `data-pdp-update` kept |
| Builder type-icon well / type chip / full-course delta strip (`bg-white/[0.06–0.08]`) | violet-tint icon well, outlined chip, outlined strip |
| ModuleSelectModal "Select all" row + module rows (`bg-white/[0.06–0.08]`, violet/emerald fills, hand-drawn boxes) | `GlassCard` rows (`role="checkbox"`, `aria-checked`, `data-pdp-module-pick` kept; selected = violet ring) + pack `GlassCheckbox`; owned indicator = emerald badge; drag handle `bg-white/30`; empty-state dashed outline only, icon well violet tint |
| StorePage list-card CTA (single button with amber/emerald disabled fills) | terminal states = flat meaning-colour plates; actionable = solid indigo `rounded-full` (same rule as grid card) |
| StorePage view-mode option buttons (`bg-indigo-600` active / `hover:bg-white/[0.08]`) | `GlassButton` (active = violet icon ink); pinned `flex h-9 w-9 flex-none …` class string kept |
| Store / Search loading skeletons + empty states (`bg-white/[0.04–0.06]` dashed boxes) | `GlassCard` |
| SearchPage "Clear search" (`bg-indigo-500/15` pill), result-count chip `bg-white/[0.08]` | `GlassButton` capsule · outlined chip |
| SearchBar clear `×` (`hover:bg-white/[0.12]`), "Tap to search" kbd chip `bg-white/[0.12]` | `GlassButton` size-7 · outlined chip |
| FilterChips panel chips (`bg-white/[0.08]` / `bg-indigo-600`) | `GlassButton` capsules (`aria-pressed`; active = solid indigo capsule fill) |
| ProductCard wishlist disc (hand-rolled `<button>` + `GlassSurface tint={0.4}` backing), image well `bg-white/[0.06]`, Board chip `bg-white/[0.08]` | `GlassButton` icon disc · no plate · `bg-rose-500/15` meaning chip |

Kept (pinned): `<GlassCard` + `contentClassName="p-0"` + `<LiquidMetalButton tone="primary"` on ProductCard; `data-store-search-trigger` / `role="button"` / `readOnly` on SearchBar; `data-store-view-options` row + `contentClassName="flex w-max gap-1 p-1.5"`; `data-pdp-tabbar`, `dc-segment shrink-0`; `role="checkbox"` + `aria-checked` + `getModuleEffectivePrice` in ModuleSelectModal; `bg-indigo-950/30` overlay + `min-h-0`; `border-amber-400/30 bg-amber-500/15` + `paid ? "bg-amber-500" : "bg-indigo-600"` + `LockKeyhole` in PdpApp; `ExtraModeChip`, `<SummaryPanel summary={summary} />`, `<CtaBar mode={mode}`.

Note: `GlassCard` is imported from the app wrapper `ui/GlassCard.tsx` (pack `glass-card` does not type `contentClassName`); the wrapper renders the pack card at its own defaults.

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 267 → 250, render-sites 465 → 497 (`native title=` 127 unchanged since Wave 8) · backdrop OK · frozen diff empty.

**Wave 11 next:** Cart / Checkout / Subscription (`cartWishlist/**`, `checkout/**`, `subscription/**`).

### Phase B · Wave 11 — Cart / Checkout / Subscription (2026-09-02)

Interlude (owner request, same day): tapping the store `SearchBar` or the home header search box with an empty draft now opens the pack **`GlassCommand`** palette (`src/lib/commandPalette.ts` → `openCommandPalette()` → `dc:command-palette-open` event → `GlassCommandPalette`); a non-empty draft still deep-links to `#/search?q=`.

| Old | New |
|---|---|
| Cart `CartItemCard` Remove disc (`bg-rose-500/15` plate), `FavoriteCard` heart disc (`bg-white/[0.08] backdrop-blur-md`), image wells `bg-white/[0.06–0.08]`, price chip `bg-black/60` | `GlassButton` icon discs (size-8; rose ink on Remove) · no plate behind images · `--dc-chrome-glass` chip |
| `CartPage` Clear (`bg-rose-500/15` pill), summary box `dc-glass`, EmptyState accent `from-violet-500 to-indigo-600` | `GlassButton` capsule (rose ink) · `GlassSurface radius={24}` · solid `bg-indigo-600` |
| Checkout back disc (`bg-white/[0.06]`), `CheckoutLineItemCard` `<article bg-white/[0.06]>` + inner `bg-white/[0.06]` wells/chips/strips | `GlassButton` size-9 · **`GlassCard`** (owned = emerald ring) · indigo-tint icon well, outlined chips/strip |
| `CheckoutReviewStep` "Show selection details", Back/Refresh/Edit plates, coupon Remove (`bg-white/[0.08]`), coupon `<input bg-white/[0.06]>`, amber "Try again", membership row `bg-white/[0.08]`, feature/product rows `bg-white/[0.06]` | `GlassButton` capsules (all pins `data-checkout-*` kept) · pack **`GlassInput`** · violet-tint row, outlined rows; primaries solid `rounded-full` (`hover:bg-*-500`), no `shadow-lg` |
| `CheckoutSuccessStep` Replay / Back plates, entitlement rows `bg-white/[0.06]` | `GlassButton` capsules · outlined rows |
| `PaymentGateway` secure card `dc-card bg-white/[0.06]`, Back `dc-glass-soft bg-white/[0.06]`, `shadow-lg` on quote/pay | `GlassSurface radius={16}` · `GlassButton` capsule · shadows dropped (emerald pay button + `dc-quote bg-indigo-600` pins kept; `liquidGlassWaveSixContract` re-pinned to the capsule) |
| Subscription `ActiveMemberView` / `OwnedPlanCard` hero blobs (`bg-white/10`, `bg-white/5 blur-2xl`), `bg-white/20` badge, `bg-white/15` stat chips, feature rows / Change-plan / Switch rows (`bg-white/[0.06]`), Renew early `bg-slate-900` | blobs removed · emerald meaning badge · outlined chips · **`GlassButton` capsule rows** (`[&>span>div]:h-auto … w-full`, `data-member-*` / `data-subscription-owned-*` kept) · solid indigo |
| `CourseSelectTrigger` / `FeatureSelectTrigger` (`<button bg-white/[0.06] p-4>`) | `GlassButton` capsule rows (`data-subscription-products-trigger` / `-features-trigger` kept) |
| `FeaturePricingTiers` tier `<button>` (white/violet/emerald fills, hand-drawn radio disc), feature chips `bg-white/[0.06]` | **`GlassCard role="checkbox"`** (`aria-checked` incl. `"mixed"`, keyboard) + pack **`GlassCheckbox`**; selected = violet ring, purchased = emerald ring + disc; outlined chips |
| `PlanOverview` plan pills (`bg-white text-slate-900` active / `bg-white/10`), cycle toggle (`bg-white/10 p-1 ring`) | pack **`GlassToggleGroup`** (`dc-segment`) ×2; owned = emerald ink; every `data-subscription-plan-pill` / `-cycle*` pin kept; icon wells indigo tint |
| `PromoCodeInput` field (`bg-white/[0.06] ring`), Apply `bg-slate-900`, Remove disc `bg-white/[0.12]`, referral CTA `rounded-xl` | pack **`GlassInput icon`** · `GlassButton` capsule · `GlassButton` size-7 · rose `rounded-full` |
| `StackedCards` prev/next (`bg-white/[0.12]` / `bg-slate-900 shadow`), eyebrow chip `bg-white/15` | `GlassButton` icon discs · `--dc-chrome-glass` chip |
| `SubscribeBar` CTA (`rounded-2xl shadow-lg`, blocked `bg-white/[0.12]`), `SubscriptionPage` Retry `bg-slate-900`, Cancel `bg-white/[0.1]`, Upgrade `rounded-2xl` | `rounded-full` no shadow, blocked = outline · `GlassButton` capsules · `rounded-full hover:bg-indigo-500` (`bg-emerald-600 text-white` owned pin kept) |
| `HelpModal` contact rows `bg-white/[0.06]`, FAQ icon well `bg-white/10`; `FeatureSelectModal` fallback icon well | `GlassCard` rows · indigo-tint wells |
| `HiddenFeatureHint` (`bg-white/[0.08]` box), `SubscriberActiveBadge` (**`bg-gradient-to-br from-emerald-50 via-white to-amber-50`** + pastel blobs — a light plate) | `GlassSurface radius={24}` (emerald ring on the badge); CTA `rounded-full`; `shadow-md` dropped |
| `RenewalBanner` Later / dismiss, `RenewalStatusCard` reminder toggle (`bg-white/[0.08] ring`), progress track `bg-white/[0.12]`, blocked note `bg-white/[0.08]` | `GlassButton` capsule / size-7 / capsule · outlined track · rose meaning plate; CTAs `rounded-full` |
| `RenewalPreviewPage` back disc, offset chip `bg-slate-900`, preset chips (`bg-white/[0.06]` / violet), dismissed box, payload `<pre bg-slate-900>` | `GlassButton` size-9 · violet chip · pack **`GlassToggleGroup`** · dashed outline · `bg-black/40` code well |
| `PremiumGate` perk rows `bg-white/[0.06]`, icon well `bg-indigo-600`, offer blob `bg-white/10 blur-2xl`, "Best value" `bg-white/[0.08] shadow-md` | outlined perk rows · indigo-tint well · blob removed · `bg-indigo-950/70` chip (all `dc-premium-*` / `data-premium-gate*` / clamp pins kept) |
| `UnlockCelebration` header blobs, seal `bg-white text-violet-600 shadow-lg`, `bg-white/20` chips, CTA `shadow-lg shadow-violet-500/25` | blobs removed · emerald seal · outlined chips · solid indigo `rounded-full` |

Kept (pinned): `contentClassName="flex gap-3 p-2.5"`, `aria-label="Remove item"`, `disabled={inCart}`, `<LiquidMetalButton`, `formatINR(product.price)` (cart); `bg-emerald-600` + `<GlassSurface className="pointer-events-none absolute inset-0" />` + `dc-quote rounded-2xl bg-indigo-600` (PaymentGateway); `bg-indigo-950/30` + `dc-premium-*` (PremiumGate); `<GlassSlider` / `<GlassCheckbox` / `<GlassSelect` + `data-preview-*` (RenewalPreviewPage); `data-subscription-*` / `data-member-*` / `data-renewal-*` / `data-checkout-*` hooks.

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 250 → 218, `rounded-* bg-white panels` → 177, render-sites 497 → 543 (`native title=` 127 unchanged since Wave 8) · backdrop OK · frozen diff empty.

**Wave 12 next:** Home / Landing / Auth / Leaderboard / Notifications (must update `liquidGlassWaveThreeContract` l.228 import guard for `src/home/components/{ProductCard,Header,Reviews}.tsx`).

### Phase B · Wave 12 — Home / Landing / Auth / Leaderboard / Notifications (2026-09-02)

| Old | New |
|---|---|
| Home `CategoryNav` pills (`border-white/70 bg-white/[0.08] backdrop-blur-xl` + `text-indigo-700` active) | pack **`GlassToggleGroup`** (`dc-segment`) |
| Home `ContinueLearning` image well `bg-white/[0.06]`, progress track, bar `from-indigo-500 to-fuchsia-500`, Resume `bg-slate-900` / `bg-emerald-100 text-emerald-600` | no plate · outlined track · solid `bg-indigo-500` bar · solid indigo `rounded-full` / emerald meaning plate |
| Home `Reviews` rail `<button class="dc-glass … shadow-[…]">` | **`GlassCard`** (`role="button"`, Enter/Space; `onOpenReview(review.productId)` pin kept); stars amber-300 / white-25 |
| Home `ProductCard` image well, Trending chip `bg-black/60`, heart disc `bg-white/[0.08] backdrop-blur-sm` | no plate · `--dc-chrome-glass` chip · `GlassButton` size-7 |
| Home `HeroCarousel` shadow `shadow-[0_22px_52px…]`, eyebrow chip `bg-white/20`, dots `bg-indigo-600` / `bg-slate-300` | shadow dropped · `--dc-chrome-glass` chip · white dots (banner presets `bannerGradients.ts` untouched — pinned) |
| Home `App` aurora blobs (`bg-violet-200/20`, `bg-sky-200/20 blur-3xl`), "Clear" `text-indigo-600` | removed · `text-indigo-300` |
| Home `Header` brand well `bg-white/15`, Profile `TooltipTrigger` plate (`bg-white/[0.08]`), clear `×` `bg-white/15`, suggestion dropdown `dc-glass-toolbar … shadow-2xl` + `hover:bg-white/10` rows | no plate · `GlassSurface radius={999}` disc inside the trigger · `GlassButton` size-6 · `GlassSurface radius={20}` + pack **`PopoverItem`** rows |
| `NotificationsPage` filter chips (**`bg-white text-slate-600`** / `bg-indigo-600`), Mark-all `bg-indigo-600` disc + native `title`, push cards **`bg-indigo-50`** / **`bg-amber-50`**, empty icon **`bg-indigo-100`**, rows **`bg-white` / `bg-indigo-50/70`**, icon wells `bg-*-50 text-*-600 ring-slate-200` | **`GlassToggleGroup`** (`dc-segment`) · `GlassButton` size-10 (no `title`) · `GlassCard` / amber meaning plate · indigo tint · **`GlassCard role="button"`** rows (unread = indigo ring, `data-notification-read`) · `bg-*-500/15 text-*-300` wells (`data-notification-icon` kept) |
| `LeaderboardApp` trophy well `bg-white/15` | amber tint |
| `AuthForm` card `.glass-panel shadow-2xl`, mode tabs `bg-white/5` + **gradient active**, Google **`bg-white text-slate-800`**, inputs `bg-white/5`, eye toggle `hover:bg-white/10`, submit **`pulse-glow bg-gradient-to-r … shadow-lg`** | `GlassSurface radius={24}` · `GlassToggleGroup data-stretch` · `GlassButton` capsule · `.dc-field rounded-full` (Glass Input material) · `GlassButton` size-8 · solid indigo `rounded-full` |
| `AuthApp` `bg-grid` wash + aurora blobs, top bar `bg-[#0a0c12]/60 backdrop-blur-xl`, Back link | removed · `--dc-chrome-glass` bar · `GlassButton` capsule (`data-auth-back` kept) |
| Landing `Header` `.glass-panel` strip, brand `shadow-lg`, Open App **gradient** `pulse-glow` | `GlassSurface radius={0}` in a `rounded-b-2xl` clip · no shadow · solid indigo `rounded-full` (`landingDesktopFullBleedContract` re-pinned) |
| Landing `Hero` `bg-grid`, `.glass-panel` eyebrow, gradient CTA, install `bg-emerald-400/10 backdrop-blur` | removed · `GlassSurface radius={999}` · solid indigo · `GlassButton` capsule (emerald ink); `HeroScene` + legibility scrim kept |
| Landing `Features` `bg-grid`, `.glass-panel shadow-2xl` cards, gradient blob + gradient icon tile | removed · `GlassSurface radius={24}` · `bg-*-500/15` icon tint (`gradient:` keys → `tint:`) |
| Landing `CtaBanner` `.glass-panel shadow-2xl` + blobs, gradient CTA, install plate | `GlassSurface radius={40}` · solid indigo · `GlassButton` capsule |
| Landing `LandingOverlays` install sheet `.glass-panel shadow-2xl` + gradient header, ✕ text button, Not-now `bg-white/5`, Install **gradient** | `GlassSurface radius={24}` (emerald ring) · `GlassButton` size-8 · `GlassButton` capsule · solid emerald `rounded-full` |

`landing.css` `.glass-panel` / `.pulse-glow` / `.bg-grid` now have no non-FlowPath consumers (FlowPath keeps its own `fp-*` shell — Wave 13). `liquidGlassWaveThreeContract` "deferred commerce files" guard flipped to assert the Wave 12 imports. `notificationFiltersDeepLinksContract` re-pinned to the toggle group's `onValueChange`.

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 218 → 204, `bg-white panels` 177 → 160, gradients 31 → 21, `native title=` 127 → 126, render-sites 543 → 571 · backdrop OK · frozen diff empty.

**Wave 13 next:** My Day / Revision / FlowPath / Profile / Settings.

### Phase B · Wave 13a — My Day (2026-09-02)

| Old | New |
|---|---|
| `TaskItem` row `border … bg-white/[0.08] backdrop-blur-xl` per status, hand-drawn check circle, subject chip `bg-white/[0.08] backdrop-blur`, Edit/Delete `rounded-xl hover:bg-*` buttons | pack **`GlassCard role="button"`** (status = emerald/sky **ring** only), pack **`GlassCheckbox`**, outlined chip, `GlassButton` size-8 |
| `TaskList` search `dc-glass-input` pill + `hover:bg-white/[0.12]` clear, filter chips (`dc-glass-chip` / `bg-white/20` counts), dashed empty `dc-glass … bg-white/[0.04]`, highlight `ring-offset-white` | pack **`GlassInput`** (icon slot) + `GlassButton` size-8, **`GlassToggleGroup`** (`dc-segment`, outlined counts), `GlassCard` empty state, plain indigo ring |
| `Timeline` dashed empty `bg-white/[0.06]`, dot `ring-white`, event card `border-* bg-white/[0.08]` + `ring-offset-white`, Edit/Delete buttons | `GlassCard`, dot ring `var(--dc-bd-base)`, **`GlassCard role="button"`** (live = indigo ring, highlight = sky ring, past = dimmed), `GlassButton` size-8 |
| `GreetingHeader` date/stat chips `bg-white/[0.12] backdrop-blur-sm ring-white/15`, progress track `bg-white/15` + bar `bg-white/80` | outlined chips, outlined track + solid `bg-indigo-500` bar |
| `QuickNotes` note colours as `bg-white/[0.08] border-*-300/70 backdrop-blur-xl` cards, search `dc-glass-input`, composer strips `dc-glass-input rounded-2xl`, editor textarea `bg-white/[0.08]`, delete/cancel `bg-white/[0.08]` discs, dashed empty `dc-glass`, pencil/trash `hover:bg-white/[0.08]` | **`GlassCard`** (colour = ring + ink only), pack **`GlassInput`** + `GlassButton` clear, **`GlassSurface radius={20}`** composers, outlined textarea, outlined discs (tooltip pins kept), `GlassCard` empty, plain hover |
| `Reminders` dashed empty, rows `border-* bg-white/[0.08]` + hand-drawn toggle + `ring-offset-white`, Edit/Delete buttons, modal inputs `rounded-xl` | `GlassCard`, **`GlassCard role="button"`** (status ring) + pack **`GlassCheckbox`**, `GlassButton` size-7, `.dc-field rounded-full` |
| `ScheduleModal` / `TaskModal` `.dc-field rounded-xl` | `.dc-field rounded-full` (Glass Input pill) |
| `CreateMenu` drop-up `dc-create-menu dc-glass rounded-2xl` + hand-drawn tail `bg-[rgba(60,62,68,0.21)]`, rows `hover:bg-white/[0.08]` | pack **`GlassSurface radius={20}`** (dropdown material; `dc-create-menu` keeps only the pop keyframe, `dc-create-menu-anchor` pin kept), tail removed, `hover:bg-white/10` |
| `SideNav` items `rounded-xl hover:bg-white/[0.06]` / `bg-indigo-500/15` | **`GlassButton variant="capsule"`** rows (`aria-current`, indigo ink when active) |
| `MyDayApp` mobile search bar `dc-glass-toolbar` | `--dc-chrome-glass` tokens (pack GlassSurface dark values) |
| `MyDayAllowanceCard` badge/skeleton/track/Stat tiles `bg-white/[0.06–0.12]` | outlined (`border-white/15`, `ring-white/15`), indigo skeleton |

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 204 → 192, `bg-white panels` 160 → 137, gradients 21 (=), `native title=` 126 (=), render-sites 571 → 598 · backdrop OK · frozen diff empty.

**Wave 13b next:** Revision pages/components. **13c:** FlowPath + Profile + Settings.

### Phase B · Wave 13b — Revision (2026-09-02)

| Old | New |
|---|---|
| `ui.tsx` `Shimmer` `bg-white/[0.12]`, `ProgressBar` track, `Badge` default/skipped plate, `PrimaryButton` `rounded-2xl … disabled:bg-white/[0.12]` | indigo-tint skeleton, outlined track, outlined badge, `rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50` |
| `AiConfigForm` card plate `bg-white/[0.08]`, eye toggle text button, "Load available models" hand-painted accent/`bg-white/[0.06]` button, `.dc-field rounded-xl`, status plate | outlined card, `GlassButton` size-8, pack capsule (`SecondaryButton`, accent ink only), `.dc-field rounded-full`, outlined status |
| `ExitGuardContext` leave `rounded-2xl bg-rose-600`; `TestBankLimitGate` track `bg-white/[0.12]`; `RevisionApp` loading `dc-glass rounded-3xl` | `rounded-full` rose; outlined track; pack **`GlassSurface radius={24}`** |
| `AiSettingsPage` source option `<button … bg-white/[0.08]>` + hand-drawn radio, provider strips `bg-white/[0.06]`, "No AI" `bg-white/[0.12]` | pack **`GlassTile selected`** (`data-ai-source` kept), outlined strips/badge |
| `BulkImportPage` preview rows `bg-white/[0.06]`, number disc `bg-white/[0.12]`, ✕ button, textarea `focus:bg-white/[0.08]`, emerald CTA `rounded-2xl` | **`GlassCard`** rows, outlined disc, `GlassButton` size-7, plain focus border, `rounded-full` emerald |
| `DashboardPage` topic icon well, sparkles well `bg-white/20 backdrop-blur`, plan pills/details `bg-white/10` | outlined wells/pills, violet tint |
| `ProgressPage` empty bar `bg-white/[0.12]`, `TotalCard` `rev-card` div + icon well | outlined bar, pack **`GlassCard`** + outlined well |
| `RevisionSessionPage` / `TestPlayerPage` answer options `<button border-2 … bg-white/[0.06]>` (+ letter disc `bg-white/[0.12]`), topic chip, footers `dc-glass-toolbar`, jump grid buttons `bg-indigo/amber-500/15`, sheet grabber `bg-white/[0.12]` | pack **`GlassTile selected`** (indigo ink), outlined chip/disc, `--dc-chrome-glass` footers, `GlassTile` + meaning ring, `bg-white/30` grabber |
| `RevisionSessionResultPage` / `TestResultPage` mastered chip `bg-white/20`, Skipped chip `bg-white/[0.06]`, plan box, difficulty pill, icon well | outlined |
| `TestReviewPage` card `border-2 bg-emerald/rose-500/15` / `bg-white/[0.06]`, chips, option rows `bg-white/[0.08]`, letter discs, explanation box `bg-white/[0.08]`, Skipped pill `bg-slate-500` | pack card + emerald/rose **ring**, outlined chips/rows/discs/box, outlined pill |
| `WeakTopicsPage` Stable pill `bg-white/[0.12]`, Revise Now `rounded-xl shadow-md` | outlined, `rounded-full` indigo (no shadow) |
| `AiGeneratePage` `PickerButton` (`bg-white/[0.08]` / hand-rolled ring), `CheckBox` (`bg-white/[0.08]`), `PickerPanel` `bg-white/[0.08] shadow-lg` + `bg-white/[0.06]` head, provider strip `bg-white/[0.08]`, Configure `bg-white/[0.12]`, difficulty buttons, question-type box/pill, Configure-AI `shadow-md`, dashboard CTA `rounded-2xl` | pack **`GlassTile selected`** (+ indigo ring when picked), pack **`GlassCheckbox`** (inert), **`GlassSurface radius={20}`** panel, **`GlassCard`** strip, `GlassButton` capsule, **`GlassTile selected`**, outlined box/pill, no shadow, `rounded-full` |
| `RevisionBankPage` error toast `bg-white/[0.12] shadow-xl`, tracks `bg-white/[0.08]`, label pills `bg-white/[0.12]`, result metrics `bg-white/[0.06]`, delete/close buttons, attempts overlay `bg-white/[0.08] shadow-xl` + attempt rows `bg-white/[0.08]`, status tabs `bg-indigo-600` / `bg-white/[0.06]`, sort rows, `FilterChoice` `bg-indigo-600` pills, Delete `rounded-2xl` | **`GlassSurface radius={20}`** (rose ring) + `GlassButton`, outlined tracks/pills/metrics, `GlassButton` size-8/7, **`GlassSurface`** overlay + **`GlassCard role="button"`** rows, **`GlassToggleGroup`** (`dc-segment`), **`GlassTile selected`** rows + pills, `rounded-full` rose. `dc-glass-toolbar` hook kept on the two sticky rows / header / fixed CTA (pinned by `revisionSubPageHeaderSeatContract` + `revisionTestBankHeaderSeatContract`; `index.css` l.5423 already maps it to the chrome-glass tokens inside `[data-revision-app]`). |

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 192 → 175, `bg-white panels` 137 → 95, gradients 21 (=), `native title=` 126 (=), render-sites 598 → 623 · backdrop OK · frozen diff empty.

**Wave 13c next:** FlowPath + Profile + Settings.

### Phase B · Wave 13c — FlowPath + Profile + Settings (+ A8 FlowPath background) (2026-09-02)

| Old | New |
|---|---|
| `ProfileLayout` stat chips / inputs `bg-white/[0.06–0.12]`, Bell / Log out / Copy / View all / library rows / reminder toggle `<button>`, `QuickStat` div, renewal CTA `rounded-2xl` | outlined chips, `.dc-field`, **`GlassButton`** (icon / capsule rows), **`GlassCard role="button"`**, `rounded-full` |
| `ProfilePreview` scenario picker `<button>` pills | **`GlassToggleGroup`** (`dc-segment`) |
| `SettingsPage` Back `<button>` | **`GlassButton variant="capsule"`** |
| `ActivityEditor` scrim `backdrop-blur-md`, white panel `bg-white shadow-2xl` + header gradient, ✕, KIND_TABS + schedule-mode `<button>` pills, Cancel, `rounded-lg` inputs, slate plates/ink | scrim `bg-black/55`, pack **`GlassSurface radius={24}`** (Dialog values), `GlassButton` size-9, **`GlassToggleGroup`** (`dc-segment`, `data-kind-tab` / `data-schedule-mode` kept on items), capsule, `.dc-field rounded-full`, `border-white/10` + white ink |
| `LecturePicker` scrim blur, white panel + `from-cyan-50` header gradient, ✕, step strip `bg-slate-50/60`, queue plate `bg-cyan-50/40` + rose remove `<button>`, Cancel, course search `<input>`, course rows `<button bg-white>`, "Preview" chip `bg-amber-100`, course plate, Change course, module rows `<button>`, summary plate, minutes/date/time inputs, schedule-mode pills, Back | as above; step strip `border-white/10` (`data-step-indicator`, `bg-emerald-500` / `bg-cyan-600` kept), `bg-cyan-500/10` queue + `GlassButton` size-7, **`GlassInput icon`** (`data-field="course-search"` kept), **`GlassCard role="button"`** rows (`data-course-id/-preview` kept), `bg-amber-500/15` chip, outlined plate, capsule, **`GlassTile selected`** (`data-module-id/-selected` kept), `.dc-field`, **`GlassToggleGroup`** (`data-schedule-mode`), capsule. Cyan primary kept (`bg-cyan-600 rounded-full`). |
| `BulkRevisionCreator` scrim blur, white panel + `from-indigo-50` gradient, ✕, preset `<button>` pills, slot plates `bg-slate-50/60` + rose remove, dashed "Add slot" `bg-white`, inputs, result plate, Cancel, submit `shadow-sm` | pack **`GlassSurface radius={24}`**, `GlassButton` size-9, **`GlassToggleGroup`** (`data-preset` kept; `applyPresetEazyMediumHard` on select), outlined slots + `GlassButton` size-8, capsule w-full, `.dc-field`, outlined, capsule, `rounded-full` indigo |
| `components/flowpath/CreateModal` `.fp-overlay`, `.glass-panel-strong` sheet + `meta.glow` shadow, ✕, priority `<button>` pills, `bg-fp-text-5` inputs, Cancel, submit `linear-gradient(meta.color)` + glow | `bg-black/55`, pack **`GlassSurface radius={24}`**, `GlassButton` size-8, **`GlassToggleGroup`** (`dc-segment`), `.dc-field`, capsule, solid `meta.color` `rounded-full` (type colour carries meaning) |
| `CurveSettingsModal` same sheet/overlay, Reset `bg-fp-surface`, Done `bg-gradient-to-r from-violet-500 … shadow-lg` | pack **`GlassSurface radius={24}`**, capsule, `rounded-full bg-indigo-600` |
| `RadialMenu` `.fp-overlay`, `.glass-panel-strong` items + colour glow | `bg-black/55`, pack **`GlassSurface radius={16}`** per item |
| `ActivityCard` `.glass-panel` / `.glass-panel-strong` + glow shadow, progress `bg-gradient-to-r from-blue-400 to-cyan-300`, complete/restore `<button>` discs | pack **`GlassSurface radius={16}`** (now → `ring-violet-400/50`, overdue → `ring-rose-400/40`), solid `bg-cyan-400`, `GlassButton` size-6 |
| `FlowPathErrorBoundary` `bg-[var(--fp-bg-0)]` page, gradient Try-again + glow, `bg-fp-surface` buttons | on the backdrop, pack **`GlassSurface radius={24}`** panel, `rounded-full bg-indigo-600`, capsules |
| `PlusNode` frost disc `bg-fp-text-6 backdrop-blur-md` + highlight gradient + shadow | pack **Glass Button disc** (`GlassSurface tint={0.4} radius={999}`) |
| `FlowPathView` delete badge glow shadow | `bg-rose-600`, no shadow |
| **A8 · `FlowPathApp`** `bg-[var(--fp-bg-0)]` page fill + `data-fp-ambient` layer (3 radial gradients, `.fp-bg-grid`, 3 orbs, 22 particles) | removed — FlowPath sits on the single blurred backdrop (`.flowpath-app` scope + `.flowpath-app .glass-panel` CSS kept for `flowpathRoutingContract`; no JSX consumer left) |

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 175 → 139, `bg-white panels` 95 → 46, gradients 21 → 14, `native title=` 126 → 125, render-sites 623 → 675 · backdrop OK · frozen diff empty.

**Wave 14 next:** cleanup (`landing.css` `.glass-panel` / `.pulse-glow` / `.bg-grid`, `.fp-*` ambience CSS, remaining `dc-glass-toolbar` consumers, coverage baseline re-record), then A7 banner gradients.

### Phase B · Wave 14 — Cleanup + missed spots + A7 hero banners (2026-09-02)

Owner call-outs: the subscription gate must be the pack sheet from the bottom with GlassButton actions; toasts were still hand-rolled; "look carefully at everything that was missed".

| Old | New |
|---|---|
| Toasts: app-ported `glass-toast.tsx` (`GlassToastCard` / `ToastViewport`), `cartWishlist/components/Toast.tsx` gradient pills, App / CartWishlistApp `showShoppingToast` pills, FlowPathView toast, `glass.css` toast keyframe | **upstream `glass-toast.tsx` verbatim** (`toast()`, `dismissToast`, `GlassToaster`) — one `<GlassToaster position="bottom-right" />` in `main.tsx`; every caller goes through `toast({ title, description, variant, duration })`; `Toast.tsx` is a forwarder; `tw-animate-css` imported so the pack's `animate-in` runs; cart Toast deleted |
| `PremiumGate` centred `dc-premium-modal` card, indigo scrim `rgba(49,46,129,.28)` + `.dc-premium-modal-in`, painted perk / offer / CTA plates, `::after` CTA flare | **`GlassSheet` + `GlassSheetContent side="bottom"`** (`h-auto max-h-[85vh]`, `mx-auto [width:min(100vw,640px)]`), pack scrim; perks outlined; offer = **`GlassCard`**; close / CTA / dismiss = **`GlassButton`**; dead `.dc-premium-modal*` entrance, CTA flare, close glow removed (class hooks kept for the contract) |
| `ModuleSelectModal` scrim `bg-indigo-950/30 backdrop-blur-md` + CSS indigo wash | the pack sheet scrim (`bg-black/50 backdrop-blur-[2px]`) |
| `AiQuotaCard` painted card + `<button>` | app **`GlassCard`** + **`GlassButton`** |
| `DesktopShell` rail active gradient, indigo GlassSurface tints (`tint/blur/sat` props), topbar tab gradient underline, `TooltipContent tint`, `GlassInput tint/radius`, logout / Sign-in `<button>`s | pack **`GlassSurface` at defaults** + `ring-1 ring-indigo-400/50`, `bg-indigo-500` underline, defaults everywhere, **`GlassButton`** (icon + capsule) |
| checkout `StepIndicator` shadows / slate ink, `MacWindowModal` custom tint + blurred scrim, `PortraitOnlyGuard` glow plate, `PageTabs` white/70 nav + tinted TabsList (+ `glass.css` indigo droplet override) | shadowless white ink; **`GlassSurface radius={24}`** + `bg-black/55`; plain; `border-b border-white/10` + **`TabsList` at defaults** |
| `MindMapPreview` frame / status `<button>` pills, theme `<button>`, `bg-slate-950` | **`GlassToggleGroup`** (`dc-segment`) + capsule **`GlassButton`** |
| home `Header` search pill `dc-glass-toolbar` | **`GlassInput`** (pack defaults, same as the store search bar) |
| `CartPage` / `FavoritesPage` `dc-glass-toolbar` bars | chrome-glass tokens (`--dc-chrome-glass*`), no legacy hook |
| `OwnedPlanCard` add-more `<button>` plate, `CheckoutReviewStep` "Return to source" amber `<button>` | **`GlassButton variant="capsule"`** rows |
| **A7** `HeroCarousel` `dc-glass` frame, `bg-gradient-to-br ${banner.gradient}` slides + white/cyan glow orbs + `from-white/30` sheen; `BANNER_GRADIENTS` three-stop gradients | pack **`GlassSurface radius={28}`** frame; presets = one translucent accent (`bg-violet-500/30` …); legacy gradient strings mapped via `resolveBannerGradient` so saved banners keep their colour |
| CSS: `landing.css` `.glass-panel/.pulse-glow/.bg-grid`, `index.css` `.fp-bg-grid/.fp-orb/.fp-particle` + keyframes, `[data-fp-ambient]`, `.flowpath-app .glass-panel*`, `glass.css` PageTabs droplet / fp-bg-grid / premium-cta lines | removed |

Contracts updated: `flowpathRoutingContract`, `liquidGlassPhaseABackdropContract`, `premiumGateResponsiveContract`, `pdpCourseModuleSelectContract`, `homeHeroBannersStoreDefaultViewContract`, Wave One/Three/Four/Six toast pins.

**Gates:** tsc clean · tests 1966 / 8 (baseline) · build OK · coverage `<button>` 139 → 128, `bg-white panels` 46 → 36, gradients 14 → 10 (left: word-marks `bg-clip-text`, `BrandMark` logo tile, `StackedCards` image scrim, `GlassPreview` demo page), `native title=` 125 → 124, render-sites 675 → 691 (baseline re-recorded) · backdrop OK · frozen diff: only `glass-toast.tsx` (now byte-identical to upstream).
