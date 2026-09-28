# Home social profile card (uiverse grumpy-ape-40)

The card at the very bottom of the Home page is a port of
[abrahamcalsin/grumpy-ape-40](https://uiverse.io/abrahamcalsin/grumpy-ape-40).
It is fed entirely by **Admin → App branding → Social profile**, and every
account the owner links there becomes one link with its own icon.

## What the learner sees

| Part of the card | Where it comes from |
| --- | --- |
| Circular logo | Branding → **Logo** (the admin's own logo — the same one used by the PWA icon, splash and notifications) |
| Name | Branding → **Identity · App name** |
| Second line (bio) | Branding → **Identity · Tagline** |
| Divider + icon row | Branding → **Social profile → Social accounts** (one icon per account, in order) |

With no account configured the card renders its clean, non-clickable state
(no link, no icon, never "undefined") — on the same glass surface.

The visual sheet for the glass rebuild is
[`docs/social-profile-card-qa.html`](social-profile-card-qa.html).

### Size

The card takes the **exact geometry of the feedback wall above it** at every
screen size — same width (`px-4 md:px-8` section padding) and the same height
steps (`h-[520px] sm:h-[640px] md:h-[740px]`), with the profile block centred
in that box. Nothing about the size changed in the glass rebuild: the reserved
box, the internal metric ramp, the icon hooks and the tooltips are the exact
values the card carried before it.

`tests/socialProfileCardContract.test.mjs` fails if the two boxes ever drift
apart, and `tests/socialCardScaleContract.test.mjs` fails if a single step of
the ramp moves.

### Material (owner, 2026-09-28)

> "Home page per sabse niche jo social card hai use card ko design glass card
> karo exactly like store page product card … Keval design aur look ki baat kar
> raha hai … edges ko vaise hi rahane dena jaise abhi hai."

The card is now a real `GlassCard` (`src/components/ui/GlassCard.tsx`) wearing
the STORE's material class, `.dc-store-glass`, exactly like every product card
on the Store page:

| Layer | Value | Where |
| --- | --- | --- |
| Frost | `blur(18.4px) saturate(1.3)` — 46% of the 40px ceiling | `--dc-store-glass-blur` (`src/glass.css`) |
| Colour | light blue `rgb(173,216,255)` at 26% | `--dc-store-glass-tint` (`src/glass.css`) |
| Sheen | the pack's quiet 135° sweep | `src/store-glass.css` |
| Rim | 1px white top hairline + 0.22 white inner ring + cool bottom edge | `src/store-glass.css` |
| Lift | the store card's drop shadow, deeper on hover | `src/store-glass.css` |

The card's own stylesheet (`src/home/components/social-profile-card.css`) keeps
only the card's geometry and its content — and the **rounding did not move**:

- radius `10px` → `12px` (≥640px) → `14px` (≥768px), the same ladder as before
  (`!important`, because `GlassSurface` writes the pack radius inline);
- the reference's `#2cb5a0` fill, 4px `#7cdacc` frame, teal divider and pale
  drop shadow are gone — on the store lens they read as a flat sticker;
- the logo is still a circle with its own ring (now
  `4px solid rgba(255,255,255,0.42)`, stepping to 5px / 6px), the divider is
  `rgba(255,255,255,0.28)`, the icons stay `brightness(0) invert(1)` and the
  tooltip keeps `#262626` with its arrow.

### Internal scaling

The 520px step is the baseline. At the same CSS breakpoints as the Home slot,
the internals use `s = boxHeight / 520`: `1.00` at 520px, `1.2308` at 640px
(`min-width: 640px`) and `1.4231` at 740px (`min-width: 768px`). The values
below are literal CSS overrides; the logo dimensions include its ring because
the app's border-box sizing keeps the border inside the declared width and
height.

| Metric | 520px | 640px / ≥640px | 740px / ≥768px |
| --- | ---: | ---: | ---: |
| Card padding | 25px × 20px | 31px × 25px | 36px × 28px |
| Card radius | 10px | 12px | 14px |
| Hover lift | −10px | −12px | −14px |
| Logo / logo ring | 18rem / 4px | 22.16rem / 5px | 25.62rem / 6px |
| Name / bio | 22px / 18px | 27px / 22px | 31px / 26px |
| Name top margin | 16px | 20px | 23px |
| Divider / vertical margin | 2px / 16px | 2.5px / 20px | 3px / 23px |
| Icon / icon gap / row-gap | 1.5rem / 18px / 14px | 1.85rem / 22px / 17px | 2.13rem / 26px / 20px |
| Tooltip type | 0.9rem | 1.11rem | 1.28rem |
| Tooltip padding | 0.625rem × 0.5rem | 0.77rem × 0.62rem | 0.89rem × 0.71rem |
| Tooltip arrow | 12px / 12px / 0 / 12px | 15px / 15px / 0 / 15px | 17px / 17px / 0 / 17px |

This is CSS-only and shared by Home and the Admin preview, so both compute the
same metrics without viewport or container units.

## What the admin edits

`Branding → Social profile` (the "🔗 Social profile" section in the pill rail)
contains:

- **A live preview of the exact card** at the exact Home size.
- **One-tap fields for the popular seven** — Instagram, YouTube, Facebook, X,
  WhatsApp, Telegram, LinkedIn. Tapping one adds an account row already locked
  to that platform; its URL field shows that platform's own placeholder
  (`https://instagram.com/yourbrand`, `https://wa.me/…`, …).
- **Per-account rows** — Profile URL, Platform (`Auto-detect from URL` or any
  of the 22 catalogue entries), and an optional **Custom icon URL**.
  Rows can be removed, and `+ Add social account` adds another one (up to 12).
- **A summary line** that names the icon the first account resolves to.

Every account is stored in `settings/branding` as

```jsonc
socialLinks: [
  { "id": "social-…", "url": "https://instagram.com/yourbrand",
    "platform": "", "customIcon": "", "label": "" }
]
```

The legacy single `socialUrl` field is still written (it mirrors
`socialLinks[0]`), and a branding document that only carries `socialUrl` is
migrated into the first row on read — nothing that used to render disappears.

## How an icon is chosen (any URL, no code change)

`src/utils/socialPlatform.ts` is the single source of truth:

1. `customIcon` set on the row → that image.
2. Otherwise the platform is resolved from the URL's **hostname**
   (`instagram.com`, `youtu.be`, `wa.me`, `t.me`, `lnkd.in`, … — exact host or
   subdomain, so `notinstagram.com` stays generic). A recognised host renders
   its brand glyph (Simple Icons 24×24, Bootstrap Icons 16×16).
3. Any **brand-new URL** on an unknown host renders that site's own
   `/favicon.ico`, labelled with its hostname — so pasting a new link always
   adds a new icon with no code change. If that image cannot load, the neutral
   globe glyph takes over (never a broken-image mark).

Image-based icons are painted `brightness(0) invert(1)`, so a row of mixed
sources still reads as one uniform white icon set, exactly like the reference.

Adding a platform permanently is a one-line change: append it to
`SOCIAL_PLATFORMS` and (for auto-detection) to `HOSTNAME_RULES`, then add an
example URL to `SOCIAL_URL_EXAMPLES` if it should be offered in the picker.

## Verification

- `node --test tests/socialProfileCardContract.test.mjs` — size parity with the
  feedback wall, every reference value, the real component mounted in jsdom
  (one link + icon per account, custom icons, unknown-host favicons, legacy
  URL, empty state, admin preview) and the admin editor wiring.
- `node scripts/verify-uiverse-updates.mjs` — mounts the real card and prints
  the rendered-behaviour checks (section `[4]`).
- `node scripts/render-social-card-qa-page.mjs` — regenerates
  `docs/social-profile-card-qa.html`, a self-contained visual sheet that
  server-renders the shipped component and inlines the shipped stylesheets
  (`social-profile-card.css` + `glass.css` + `store-glass.css`, so the store
  lens is the real one) at the 520 / 640 / 740 box sizes, beside the feedback
  wall box for a size comparison.
- `node scripts/verify-uiverse-updates.mjs` — mounts the real card in jsdom and
  checks, among the other Uiverse ports, that it still wears `.dc-store-glass`
  and keeps its own rounding ladder (section `[4]`).
