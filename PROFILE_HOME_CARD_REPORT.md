# Profile page → the Home page's card (owner brief 2026-09-30)

> "Mujhe home page ke card ka design look badhiya lagta hai kya tum vahi
> exactly hi look aur design card ka profile ke cards per apply kar sakte ho
> and profile page ki sabhi card ko ekadam badhiya look de sakte ho text design
> bhi exactly jaisa home page ka hai vaise hi profile page ka ho jaaye and abhi
> bahut jyada text har profile page per to ekadam clean professional aur classic
> look do profile page ko."

Three things were asked for, and this is exactly what shipped:

1. **Home's card, exactly, on every Profile card.**
2. **Home's text design on the Profile page.**
3. **The page's walls of text removed — clean, professional, classic.**

---

## 1 · The material: Home's card, byte for byte

Home's product tiles, "Continue Learning" cards and review cards all wear one
surface — `GlassSurface` at the pinned docs sensitivity the engine calls
`dc-scene-plate`: **tint 0.25 · blur 0 · radius 24**, painted by the navy
contrast plate in `src/glass.css`.

`src/profile/ProfileCard.tsx` (the one material every Profile card uses) now
renders exactly that:

```tsx
<GlassSurface
  tint={0.25}
  blur={0}
  radius={24}
  {...props}
  className={cn("dc-scene-plate dc-profile-card text-white", className)}
  contentClassName={cn("p-4", contentClassName)}   // Home's review-card interior
/>
```

- The Store's light-blue lens (`.dc-store-glass`), its tint colour and the
  text scrim (`.dc-scene-ink`) are **gone from the cards**. The scrim is now
  only where Home uses it — on the copy that sits straight on the scene (the
  page title, the legal links), never inside a plate.
- The old stock-of-cards CSS block for the Profile (`src/store-glass.css`) was
  retired; the whole ramp moved to a new `src/profile-glass.css`, imported in
  `src/main.tsx` after `glass.css` — the sheet that owns the plate the profile
  hooks sit on.
- `src/index.css`: the hero's separate look (an indigo glow shadow and a
  `clamp()` radius that made it a different shape from its own page) and the
  per-breakpoint `16px` radius re-skin are deleted, plus the desktop/mobile
  `h1` size overrides that fought the new page title.

## 2 · The type: Home's card ramp

`src/profile-glass.css` pins Home's card steps once, so no card can drift:

| class | numbers | copied from |
| --- | --- | --- |
| `.dc-profile-title` | `clamp(.875rem, 4.8vw, 1.25rem)` · 700 | Home's greeting `[data-home-greeting]` |
| `.dc-profile-card-title` | 14px · 600 · `rgba(255,255,255,.93)` | Home card titles (`text-sm font-semibold text-white/85`, lifted by the plate) |
| `.dc-profile-card-meta` | 11px · 500 · `.76` | Home's tile meta (`text-[11px] text-white/55`, lifted) |
| `.dc-profile-card-note` | 12.5px · 400 · 1.6 · `.88` | Home's review body (`text-[12.5px] … text-white/75`, lifted) |
| `.dc-profile-card-accent` | 11px · 600 · `#a5b4fc` | Home's `text-indigo-300` accents |
| `.dc-profile-card-value` | 20px · 700 | Home's bold card numbers |
| `.dc-profile-bar` | 6px track · `1px white/15` rim · `#6366f1` fill | Home's Continue-Learning bar |

Every action is still the pack's `<GlassButton variant="capsule">`, now at
Home's pill metric (40px tall, 12px label) instead of the pack's 48px default.

## 3 · The copy diet

| was | now |
| --- | --- |
| Page header: eyebrow + "My profile" + a one-line subtitle | just the title (+ the plan-status pill) |
| Hero: plan pill, name, email, bordered "Member since" row, bio paragraph, **a second full-width "Edit profile" button** | avatar, name, email, one 11px fact line, pencil, bio clamped to 2 lines |
| Membership card (tier, 3 chips, a paragraph, a footnote) **and** a separate Renewal card (headline, pill, 2 chips, progress + labels, a paragraph, 2 buttons, the same footnote) | **one** Membership card: tier + status, one fact line, Home's bar, two actions, one trust line |
| Upgrade card: eyebrow, title, 4-line paragraph, 3 checkpoints, 2 stacked CTAs | one title, one line, the same two CTAs side by side |
| Referral: eyebrow + "Share it with a learner joining …" + chip + code + 2-line used note | label + code + Copy (used ⇒ struck through, `Used` badge, one short line) |
| Study Library: eyebrow, title, a full sentence, CTA | title, one line, CTA |
| Your courses: subtitle, a count chip row, rows with "Owned · Open course" | title + count, Home's quiet "View all", Home-style rows |
| Preferences: eyebrow, title, "Saved securely to your account." | just the title + the settings icon button |
| My Day allowance: badge, bar, 3 stat chips, reset clock, a 2–3 line paragraph, 2 CTAs | badge, bar, one reset line, **one** short line per state, 2 CTAs |
| AI quota (Profile): 2 bars + a 3-line explanation + per-request detail lines | the bars + the reset line only (`compact`) |

The `data-*` hooks the rest of the app (and deep linkers) read are all still
on the same elements: `data-profile-hero`, `-stats`, `-membership-card`,
`-membership-tier`, `-plan-status`, `-plan-label`, `-upgrade-card`,
`-referral`, `-referral-used`, `-study-library`, `-open-dashboard`,
`data-renewal-card`, `-card-headline`, `-expiry`, `-remaining`, `-progress`,
`-reminder-toggle`.

## Shared cards that render inside the Profile page

- **`MyDayAllowanceCard`** (Profile-only) renders `ProfileCard` itself, so it
  follows the new material automatically; its state paragraphs were cut to one
  line each and the three-chip stat row was dropped (the bar and the reset line
  already carry those numbers).
- **`AiQuotaCard`** (shared with the Revision profile) grew two opt-in props —
  `material="home"` and `compact` — and the Profile page passes both. Revision's
  card is byte-identical to before (it keeps the default `store` material).

## Files

| file | what |
| --- | --- |
| `src/profile/ProfileCard.tsx` | the Home plate (tint .25 · blur 0 · radius 24 · `dc-scene-plate`) |
| `src/profile-glass.css` | **new** — the page title + card type ramp + progress bar |
| `src/profile/ProfileLayout.tsx` | rewritten: Home material/type, merged membership + renewal, copy diet |
| `src/profile/App.tsx` | passes `material="home" compact` to the AI card; drops the unused branding lookup |
| `src/profile/ProfilePreview.tsx` | dev sandbox mocks follow the new ramp |
| `src/components/MyDayAllowanceCard.tsx` | one-line states, no stat chips, Home bar |
| `src/components/AiQuotaCard.tsx` | `material: "store" \| "cart" \| "home"` + `compact` |
| `src/store-glass.css` | Profile block retired (store material untouched) |
| `src/index.css` | hero glow/clamp radius + per-breakpoint radius + `h1` overrides removed |
| `src/main.tsx` | imports `profile-glass.css` after `glass.css` |
| `tests/profileHomeCardContract.test.mjs` | **new** — the brief as a contract |
| `tests/profileCartGlassContract.test.mjs` | **removed** (superseded brief) |
| `tests/liquidGlassPhaseABackdropContract.test.mjs` | one assertion updated: membership + renewal are one pack surface now |

## How to look at it

- Live: `npm run dev` → `#/profile` (signed in) or `#/dev/profile-preview`
  (no auth, real `ProfileLayout` with mock data).
- Static QA sheet: **`docs/profile-card-qa.html`** — the shipped component
  rendered through Vite SSR over the built stylesheet inside real phone (390px),
  tablet (720px) and desktop (1280px) viewports. Regenerate with
  `node scripts/render-profile-qa-page.mjs` after a build.

## Checks

- `npx vite build` — clean.
- `npx tsc --noEmit` — no errors in any Profile file (the repo's pre-existing
  errors in FlowPath / nature3d / capacitorBridge are untouched).
- `node --test tests/*.test.mjs` — the failure set is byte-identical to the
  branch's baseline before this change (74 pre-existing failures elsewhere,
  **zero** new; the three old Profile-material failures are replaced by the new
  contract, which passes).
- `src/profile-glass.css` carries **no** `data-glass` rule of its own, so the
  page obeys the engine's tier switch exactly like Home does: `data-glass="off"`
  drops the lens `backdrop-filter` (src/glass.css) and the plate underneath is
  the same navy surface.

## Not in this brief

The Study Library's delete-confirmation overlay still wears the older
`material="profile"` recipe (the Cart empty-state surface). It is not on the
Profile page, so it was left alone — say the word and it moves to the Home card
too.
