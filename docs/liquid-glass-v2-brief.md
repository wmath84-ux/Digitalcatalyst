# Liquid Glass v2 — "Black Ice" backdrop + full component adoption

**Kickoff brief for a fresh coding session.** Read this whole file before touching code.

Repo: wmath84-ux/Digitalcatalyst · branch: new arena/* session branch off main.

Prior work (Waves 0–6 of the first rollout) is already merged into main — this document
supersedes docs/liquid-glass-rollout-plan.md for anything about *background, palette and
adoption volume*. That doc stays as the record of what shipped and why.

---

## 0. The goal, in the owner's words

> Design vahi hai jo **har tarah ke screen/device pe accha dikhe**.

Three things, non-negotiable, from the owner (2026-09-01):

1. **The background is the design.** Its colour, its blur — exactly as in the reference
   screenshot (see §2). **Ignore the grid overlay, ignore the demo text and the demo card in
   that screenshot — look only at the background.** The owner's words: "exactly waise hi waise
   hi colour, design aur blur".

2. **Header and footer stay fixed and keep behaving exactly as they do today** — including every
   animation that already exists (hide-on-scroll, collapse, dock behaviour). "Jo photo animate
   hota rehta hai, wo sab waise hi rahega" — we only touch the middle of the screen.

3. **Everything else scrolls between them**, over that one gradient background. No new page is
   added, no new scroll container is invented: the backdrop sits behind the existing scroller
   and the existing page surfaces become transparent where they currently paint their own.

Plus: **"part bye part, ruk-ruk ke"** — one wave per commit, stop after every wave, the owner
reviews personally. Never a big-bang commit.

---

## 1. Component source of truth (the 22 items)

- Docs + the full 22-component list: **https://websiteglass.com/docs**
- Whole registry as one plain-text page (this is the reliable transfer channel):
  **https://www.websiteglass.com/llms-full.txt** — add a fresh cache-buster `?v=<n>`; it comes
  back in ~17 chunks of ~12 KB and code fences survive byte-for-byte.
- Official install (works on a real machine, not in the Arena sandbox):
  `npx shadcn@latest add https://websiteglass.com/r/<item>.json`

**Transfer warning learned the hard way:** the `/r/<item>.json` route, when fetched through a
markdown-converting fetcher, **eats `<Component …>` / `</Component>` pairs** — the result still
parses as prose, so corruption is invisible. Always use llms-full.txt. Fidelity backstop:
`node scripts/verify-glass-registry.mjs` (diffs all vendored files against the registry;
`--write` re-vendors; documented local deviations live in LOCAL_ADAPTATIONS).

**Adoption status inherited from the first rollout: 21 of 22 items are vendored.** glass-dock
is the single deliberate exception (decision D4 — the repo's own dock + frozen mobile footer).

---

## 2. The backdrop spec (read this before writing any colour)

Sampled from the owner's reference screenshot (mobile Chrome, 1200×700 shown). Positions are %
of the viewport; the layer is `position: fixed`, so it does **not** move on scroll.

| Region | Position | Hex | Notes |
| --- | --- | --- | --- |
| Base ink | everywhere | `#0a0c12` | blue-biased near-black. **Never `#000`** — pure black crushes on cheap panels |
| Deep shade (vignette bottom/edges) | 50% 100%, corners | `#06070c` | vignette only, no hard edge |
| Blue glow (dominant, top-left → left) | 12% 30% … 6% 55% | `#2c357e` core → `#25308f` hot point | fades to base by ~55% of the width |
| Teal/green glow (lower centre-left) | 40% 80% … 18% 90% | `#12756a` → `#0f5f57` | the only green in the design; keep it desaturated |
| Violet bridge (top centre → right) | 45% 5% … 78% 20% | `#3a2159` | this is what makes the blue→purple transition look continuous |
| Purple/magenta glow (right edge) | 90% 15% … 97% 42% | `#6d2184` → `#7a2488` hot point | brightest chroma on the page; cap it here |

Rules derived from the image:

- **Luminance is low and even.** Measured profile top→bottom ≈ 18 20 24 30 38 44 46 44 40 30 15
  (0–255 scale) and left→right ≈ 34 40 44 42 38 36 40 48 58 62 55. Nothing on the page may be
  brighter than the purple core, or the glass cards stop reading as glass.
- **The blobs are huge and soft** — each glow spans 45–70% of the viewport and its falloff is a
  long tail. Blur comes from the gradient's own softness, **not** from a `blur()` filter.
- **Grid overlay: ignore it** (owner's instruction). It is a decorative element of the marketing
  demo page, not part of the background. Do not reproduce it, do not "improve" it.
- The text and the rounded card in the screenshot are the demo's own content — **not** the design.

Reference implementation (this is the whole component's paint):

```css
.dc-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;                    /* behind everything, never in flow */
  pointer-events: none;
  background-color: #0a0c12;
  background-image:
    radial-gradient(58% 72% at 12% 30%, rgba(44, 53, 126, 0.95) 0%, rgba(37, 48, 143, 0.42) 38%, transparent 68%),
    radial-gradient(52% 60% at 40% 80%, rgba(18, 117, 106, 0.72) 0%, rgba(15, 95, 87, 0.30) 40%, transparent 70%),
    radial-gradient(46% 56% at 90% 15%, rgba(109, 33, 132, 0.80) 0%, rgba(122, 36, 136, 0.34) 42%, transparent 72%),
    radial-gradient(70% 40% at 45% 5%,  rgba(58, 33, 89, 0.60) 0%, transparent 70%),
    radial-gradient(120% 90% at 50% 100%, rgba(6, 7, 12, 0.85) 0%, transparent 55%);
  /* NO filter, NO backdrop-filter, NO @keyframes on this layer. Ever. */
}
```

Two extras that make it survive real hardware:

- **Noise/dither overlay** (banding killer on old LCDs — there is currently **zero** noise/dither
  anywhere in the repo's CSS): a 3–4% opacity SVG feTurbulence tile or a ~4 KB PNG, on its own
  fixed layer above the gradient, `mix-blend-mode: overlay`. Static asset. **Not** an animated
  grain, and never a `filter:` on scrolling content.
- **Gamut probe** (the owner's "har device pe same colour" point, precisely):

  ```css
  @supports (color: color-gamut: srgb) or (color: oklch(50% 0 0)) { /* wide-gamut stops */ }
  @media (color-gamut: srgb) { /* flat sRGB fallback — the same palette, no widening */ }
  ```

  Wide gamut is a bonus, never a requirement. Old device ⇒ the sRGB branch must look intentional.

**To re-sample if the owner re-attaches the screenshot** (ImageMagick is available in the sandbox):

```bash
identify -format "%wx%h\n" uploads/<file>.jpg
for p in 12x30 6x55 40x80 90x15 97x42 50x5 50x98; do
  x=${p%x*}; y=${p#*x}
  convert uploads/<file>.jpg -format "at ${x}%x${y}% = %[pixel:p{$x,$y}]" info:
done   # then convert those rgb() triplets to hex
```

---

## 3. Palette rule (this is what "har device pe same" actually means)

- **Black + white + at most 2–3 accents.** Today the app carries ~162 `bg-gradient-to-*` sites and
  85 gradient declarations in CSS, in many different hues — that is exactly why the look shifts
  from screen to screen. This rollout collapses all of it to the §2 palette.
- Accents: **indigo** (already the app's brand ring) and **emerald** (success/paid states) — those
  two plus the backdrop's own teal/purple. Nothing else becomes a colour; everything else is ink
  or paper at some alpha.
- **Never pure black for text on white glass, never pure white text on the dark backdrop**: use
  `#0b0d12`-ish ink on paper and `rgba(255,255,255,0.92)` on ink. Reason: halation on cheap panels.
- Every `bg-gradient-to-*` that is decorative (page backgrounds, hero washes) gets **deleted** —
  the backdrop already does that job. Gradients that are identity (brand button fills, the
  checkout amount card, `meta.gradient` provider marks) stay, and take the gloss-over-paint
  pattern: keep the solid paint, add GlassSurface behind the label, never tint the label's own
  fill twice.

---

## 4. Layout contract

```
┌─────────────────────────────────────────┐
│ header (fixed, existing animations)     │ ← frost + ≤1 real lens allowed here
├─────────────────────────────────────────┤
│                                         │
│   the page's own scroller — unchanged   │ ← content flows over the backdrop
│   surfaces here: NO live blur           │   (transparent bg, .dc-card frost-free tint)
│                                         │
├─────────────────────────────────────────┤
│ footer nav / dock (fixed, frozen)       │ ← frost + ≤1 real lens allowed here
└─────────────────────────────────────────┘
```

- The scroller itself must not change: today DesktopShell owns a scroller, mobile routes use the
  window/document scroller, CourseOverlay/player owns its own. **Do not introduce a new scroll
  container** — that is how `position: sticky`, the hide-on-scroll header and safe-area insets all
  break at once.
- Fixed chrome may keep frost because its backdrop is static → the blur is cached, not recomputed.
- Scrolling middle content must have **zero** `backdrop-filter` on every engine. Today there are
  **84 `backdrop-blur-*` utility sites** — they are the work list for Wave 3, and the census script
  in §6 must report this number going to ~0 outside header/footer/dialog.
- z-index: 28 fixed `inset-0` overlays exist with `z-[50]` … `z-[9999]` scattered. The backdrop is
  `z-index: -1` (never 0, never an isolate context). Add a single documented scale in
  `src/glass.css` and reuse it; do not renumber anything inside BottomNav.
- Viewport units: **12 `100vh` sites** → `100svh` with the `@supports (height: 100dvh)` pattern the
  repo already uses at `src/index.css:988`. Mobile URL bar must not clip the first/last row.
- `background-attachment: fixed` stays at **0 usages** — it is broken on iOS Safari. The fixed layer
  is a real element.

---

## 5. Scope

**In scope:** every non-admin surface — `#/home`, store, product, cart, favourites, `#/search`,
checkout, `#/my-day`, `#/flowpath`, `#/revision`, `#/course/:id`, `#/profile`, `#/settings`,
`#/notifications`, `#/leaderboard`, `#/subscription`, `#/auth`, `#/landing`, `#/dev/*`.

**Out of scope (do not touch):**

| Path | Why |
| --- | --- |
| `src/admin/**`, `src/components/admin/**` | Owner's decision, two reasons: (a) admin has its own background logic and the global backdrop must not leak into it, (b) admin's layout is a separate design project — its screens are scattered and need re-structuring, not glass. **This is why `<GlassBackdrop/>` mounts inside the app shells, never in main.tsx.** |
| `src/components/BottomNav.tsx` | the mobile footer nav is frozen by the owner (kept as-is from the first rollout); it sits on the backdrop and needs no change |
| `src/components/glass-dock/**` | desktop dock + its GlassMaterial — frozen by decision D4, and still its only consumer |
| `src/checkout/**` state machine, `src/home/**` data hooks, all `data-*` hooks | behaviour, not skin |

**Pinned contracts that must survive** (each is an existing test; the new session must not "fix" them):

- `tests/myDayCreateMenuDropdownContract.test.mjs` — Create menu's anchored drop-up, staggered
  item animation, dismissal on Escape + pointerdown + scroll/touchmove/wheel.
- `tests/revisionProgressStableCardsContract.test.mjs` — revision's Card renders `.rev-card
  rounded-3xl p-` and must **not** gain a blurred surface; `index.cs`… `forbids backdrop-filter`
  on `.rev-card`.
- `tests/coursePlayer*` (5 files) — every `data-course-*` hook, `role="alertdialog"` +
  backdrop-cancels + autoFocus on the delete confirmation.
- `tests/storeFiltersAdminProductContract.test.mjs`, `tests/responsiveLayoutOverhaulContract.test.mjs`
  (`data-rev-question-mode-grid`, `data-page-seat`, no `68vw`), `tests/renewalPresentation.test.mjs`
  (`data-preview-slider`), `tests/myDayQuickNotesBigEditorContract.test.mjs` (the pinned
  `title={kind === "edit" ? "Save note & close editor" : …}` stays native).
- `tests/liquidGlassWave{One…Six}Contract.test.mjs` — 64 assertions, including repo-wide rules:
  no native `<select>`/`type="range"`/`type="checkbox"` outside admin, and no per-card
  `<GlassLens>` in a scrolling grid.

---

## 6. Waves — one commit each, then STOP and report

Baseline numbers from the merged tree (measure again at the start of the session; these are the
"before" numbers the whole plan is judged against):

```
267 non-admin component files · 394 <button> · 69 <input> · 9 <textarea>
159 hand-painted rounded-* bg-white panels · 84 backdrop-blur sites
28 fixed inset-0 overlays · 162 bg-gradient-to-* · 12 100vh · 19 ad-hoc min-[Npx] breakpoints
pack usage: select 46 · card 42 · tooltip 29 · command 12 · slider 11 · popover 7 · sheet 6 ·
toast 6 · toggle-group 4 · tile 4 · accordion 4 · switch 3 · button 2 · input 2 · checkbox 2 ·
radio 2 · swatch 2 · dropdown-menu 1 · dialog 0* · tabs 0*   (* = hidden inside wrappers)
```

| Wave | Name | Files | What it must achieve (exit criterion) |
| --- | --- | --- | --- |
| **0** | **Fix the floor first** (no design work) | 3–4 | browserslist in package.json so Lightning CSS downlevels `oklch()` → in dist/index.html, `grep -c "oklch("` must be **0**; `100vh`→svh/dvh via the existing `@supports` pattern; `?glass=off` still renders the pre-rollout paint. **Owner approves the build before Wave 1.** |
| **1** | **Backdrop + tokens** | 6–8 | `src/glass-theme.css` (palette §2/§3 as tokens) + `src/components/ui/GlassBackdrop.tsx` (fixed, z-index:-1, pointer-events:none, no filter) mounted in AppShell, DesktopShell, My Day shell, FlowPath shell, course player shell — **not** in main.tsx; page roots go `bg-transparent`; noise overlay asset added; tiers extended: full / lite / flat / off where *flat = zero live blur anywhere*. Exit: backdrop pixel-matches §2 on 3 viewports; git diff on admin paths is empty; `?glass=flat` still readable. |
| **2** | **Chrome: fixed header + footer, backgrounds only** | 4 | Header/BottomNav/Dock keep 100% of their markup and animation; only their surface (frost, rim, safe-area padding) changes. Exit: the header's pinned tests pass unchanged; hide-on-scroll + collapse behave as before; backdrop-filter count outside header/footer/dialog = 0 (this is the invariant Wave 3 then preserves). |
| **3** | **Middle band, page by page** (batch 1–3) | ~45 | Store + product + cart + favourites + `#/search`: the 159 painted panels lose their blur, gain `.dc-card` tint+rim over the backdrop; `data-*` hooks and layout untouched. Exit: 84 → ≤20 backdrop-blur sites; screenshots on 320/390/768/1440 reviewed by owner. |
| **4** | **Middle band, batch 4–6** | ~45 | `#/my-day` + `#/flowpath` + `#/revision` (incl. `.rev-card`'s stable surface — see §5). Exit: as Wave 3; revision's 4 rev-card contracts still green. |
| **5** | **Middle band, batch 7–9 + player + auth/landing/checkout + `#/dev/*`** | ~45 | `#/course/:id` (per D1: glass inside the player), profile/settings/notifications/leaderboard, auth, landing, checkout (identity paint + gloss), dev routes. Exit: as Wave 3. |
| **6** | **Adoption ratchet: the 394 buttons** — split small | 10–14 per sub-wave | Batches, smallest first, each its own commit: 6a store + product · 6b cart/favourites/search · 6c my-day · 6d flowpath · 6e revision · 6f course player · 6g profile/settings/notifications/leaderboard · 6h auth/landing · 6i checkout + `#/dev/*`. Rules: primary/secondary/danger/ghost actions → glass-button via LiquidMetalButton; icon-only discs → `shape="icon"`; every bare `<input>` gets `.dc-field` (or glass-input where it is a search field); `<textarea>` and `inputMode`=`required` cases keep native anatomy with pack ink (documented exception). Exit per sub-wave: coverage script's bare count strictly down, all gates green, owner sign-off. |
| **7** | **A11y + docs + PR** | 5 | `:focus-visible` rings on every `.dc-*` interactive; contrast check — text on glass ≥4.5:1 measured against the **brightest point of the backdrop** (the purple core), not against the token; `prefers-reduced-transparency: reduce` ⇒ flat; README's "Liquid Glass UI system" section rewritten for v2; `docs/liquid-glass-rollout-plan.md` gains a v2 section; PR opened. |

**After every wave: stop.** Report gate outputs, the coverage numbers, and what to look at. The
owner reviews personally — do not start the next wave without a go-ahead.

---

## 7. Coverage script (build it in Wave 0, use it in every wave)

`scripts/glass-coverage.mjs` — no dependencies, prints a table and exits non-zero on regression:

- per-item usage count for all 22 registry components in app code (excluding `src/components/ui/`)
- bare primitives: `<button>`, `<input>`, `<textarea>`, `rounded-* bg-white` panels,
  `backdrop-blur-*` sites **outside** header/footer/dialog, native `title=`
- grep for `oklch(` in dist/index.html after a build
- fixed-layer invariants: backdrop must have no filter, no `@keyframes`, no `!important`
- `background-attachment: fixed` count (must stay 0)

Strip comments before matching (`/\*…\*/`, `//`) — three separate failures in the previous rollout
came from greps matching the author's own explanatory comments.

---

## 8. Gates — run this exact sequence at the end of every wave

```bash
npx tsc -p tsconfig.json --noEmit                          # expect 7 errors = repo baseline
node scripts/verify-glass-registry.mjs                     # expect: 0 DRIFT (SKIPs without egress)
bash run_tests.sh 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"   # expect the same 8 pre-existing names
npm run build                                              # expect ok
git diff --stat -- src/components/BottomNav.tsx src/components/glass-dock src/admin src/components/admin
                                                           # expect EMPTY, every wave, no exceptions
node scripts/glass-coverage.mjs                            # expect: bare counts down, never up
```

Baseline failing test names at the time of writing (pre-existing on main, **not** to be fixed
here — but they must not grow):

```
tests/flowpathFirstPaintContract.test.mjs        (file-level: reads a phantom src/components/flowpath/Header.tsx)
home header has a Plus shortcut next to the leaderboard that opens FlowPath
the FlowPath route is wrapped in an error boundary with working escapes
Home header collapses on scroll to brand + action buttons
non-landing desktop routes still get the AppShell
the install panel shows Add-to-Home-Screen help when Chrome has no prompt
RevisionApp gates paywalled actions with the floating premium gate
the seat override comes after every band padding it beats
```

Dev server check (the sandbox proxy serves the preview; bind 0.0.0.0:5173): for every touched
`.tsx`, `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/<path>` must be 200 with
zero `Transform failed|Pre-transform error|Internal server error` in the body.

---

## 9. Hard-won traps in THIS repo (each cost a debugging cycle already — do not repeat them)

1. **The pack is dark-first, this app's content is light-on-dark now.** `text-white/80`,
   `bg-white/[0.06]` etc. are baked into the vendored files. Fix by **passing a caller className**
   through cn/twMerge (it wins) or by an unlayered `.dc-*` rule in `src/glass.css` under
   `html[data-glass="on"]`. Never edit a vendored file for app look — it breaks the fidelity check.
2. **Unlayered CSS beats Tailwind utilities, so guard state-dependent rules**: an unguarded
   `.dc-tile { … }` flattens the pack's selected fill. Use `:not([data-selected])` /
   `:not([aria-checked="true"])` — and the **selected** state gets its own explicit rule.
3. **Portalled surfaces** (glass-select, glass-popover, glass-dropdown-menu, glass-command,
   dialogs) land on `document.body` — their `.dc-*` ink rules must **not** be nested under a
   page-scoped selector, and must **not** be scoped to a shell that owns a scroller.
4. **GlassSelectTrigger ignores children** — never pass children to it; the label comes from the
   item registry. Empty-state copy goes in its placeholder, `disabled` goes on the trigger.
5. **LiquidMetalButton's internal surface is `h-11`** — never pass a caller `h-[Npx]`/`min-h-[Npx]`
   (the box and the paint desync). For a brand-coloured CTA use identity paint + a GlassSurface
   gloss layer (`pointer-events-none absolute inset-0`, content `relative z-10`).
6. **Registry GlassCard has no radius prop** (hardcoded 20); TooltipContent/GlassInput accept
   no `tintColor`.
7. **Dark-route ink is already solved by `data-theme`.** `src/flowpath/hooks/useTheme.ts` writes
   `data-theme` on `<html>` (dark default, removed on unmount), so `useGlassDark()` resolves the
   right palette there. Do **not** add `!important` dark-forcing classes on FlowPath — a previous
   wave did, and it broke FlowPath's light theme. The course player is the only surface with no
   theme attribute; that is what `.dc-slider-on-dark` is for.
8. **Tailwind v4 + no browserslist ⇒ `oklch()` reaches old engines un-downleveled and the
   declaration is dropped** (gradient silently vanishes). Wave 0's first job.
9. **The sandbox can lose node_modules and re-clone .git between sessions.** Recovery:
   `npm install`, then `git fetch origin <branch> && git reset --mixed FETCH_HEAD` (the pushed tip
   has the work; `reset --mixed` keeps the working tree). Never `git clean`, never `reset --hard`.
10. **Never trust remembered file contents.** `cat -n`/grep the file immediately before patching;
    every scripted replacement asserts `count == 1` and writes nothing if any anchor fails.
11. Inside a `/* */` comment placed between `return (` and JSX, never end the text with `*/}` —
    esbuild reports a phantom "Expression expected".
12. glass-toast is a hand-**port** (`PORTED` in the verify script), so it may be edited —
    everything else may not.

---

## 10. Definition of done

- [ ] The backdrop matches §2 on 320×568, 390×844, 768×1024, 1440×900 — and on a **1× DPR** render.
- [ ] Header + footer: unchanged behaviour, unchanged markup, only surface changes; their pinned tests green.
- [ ] backdrop-filter exists on fixed chrome + dialogs only (count it, publish the number).
- [ ] Every interactive element on a non-admin page renders through one of the 22 components or a
      documented exception list (`.dc-field` for `textarea`/`inputMode`=`required`, flat status
      plates where a colour is the state, no per-card lens in a grid).
- [ ] Bare-primitive count down from 394 to ≤60, with each sub-wave separately approved.
- [ ] `?glass=flat` and `?glass=off` both legible on the backdrop; `prefers-reduced-motion` and
      `prefers-reduced-transparency` both handled.
- [ ] Zero admin diff, zero BottomNav diff, zero glass-dock diff, every wave.
- [ ] README + docs/ updated; PR from the session branch to main.
