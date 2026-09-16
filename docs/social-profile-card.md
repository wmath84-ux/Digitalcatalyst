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
