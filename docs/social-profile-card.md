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
(no link, no icon, never "undefined").

### Size

The card takes the **exact geometry of the feedback wall above it** at every
screen size — same width (`px-4 md:px-8` section padding) and the same height
steps (`h-[420px] sm:h-[520px] md:h-[600px]`), with the profile block centred
in that box. Everything else (fill, borders, radii, type, spacing, hover,
tooltip) is the reference card's value, verbatim — see
`src/home/components/social-profile-card.css`.

`tests/socialProfileCardContract.test.mjs` fails if the two boxes ever drift
apart, or if any reference value changes.

### Internal scaling

The 420px step is the unchanged reference card. At the same CSS breakpoints as
the slot, the internals use `s = boxHeight / 420`: `1.00` at 420px, `1.238`
at 520px (`min-width: 640px`), and `1.4286` at 600px (`min-width: 768px`).
The values below are literal CSS overrides; the logo dimensions include its
ring because the app's border-box sizing keeps the border inside the declared
width and height.

| Metric | 420px | 520px / ≥640px | 600px / ≥768px |
| --- | ---: | ---: | ---: |
| Card padding | 25px × 20px | 31px × 25px | 36px × 29px |
| Card radius / border | 10px / 4px | 12px / 5px | 14px / 6px |
| Hover lift | −10px | −12px | −14px |
| Logo / logo ring | 5rem / 4px | 6.2rem / 5px | 7.15rem / 6px |
| Name / bio | 18px / 16px | 22px / 20px | 26px / 23px |
| Name top margin | 20px | 25px | 29px |
| Divider / vertical margin | 2px / 20px | 2.5px / 25px | 3px / 29px |
| Icon / icon gap / row-gap | 1.1rem / 15px / 12px | 1.36rem / 19px / 15px | 1.57rem / 21px / 17px |
| Tooltip type | 0.8rem | 0.99rem | 1.14rem |
| Tooltip padding | 0.5rem × 0.4rem | 0.62rem × 0.5rem | 0.71rem × 0.57rem |
| Tooltip arrow | 10px / 10px / 0 / 10px | 12px / 12px / 0 / 12px | 14px / 14px / 0 / 14px |

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
  server-renders the shipped component + stylesheet at the 420 / 520 / 600 box
  sizes, beside the feedback wall box for a size comparison.
