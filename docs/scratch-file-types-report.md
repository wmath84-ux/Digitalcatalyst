# Scratch Product — All File Types (host player test)

## What this is

A scratch product (`siteProducts/scratch-all-file-types`) that contains **one
module per file type** the host Course Player can render, so the player can be
tested end-to-end for every format. It is created with the **Admin Product
Editor's own data pipeline** (`utils/productMapping.js` → the same body that
`src/lib/admin/client.ts` → `saveProduct` writes), so what the seed writes is
byte-for-byte what the admin panel would write.

Create it with:

```bash
# preview the exact document first (no credentials)
node scripts/seed-scratch-product.mjs --dry-run

# write to Firestore (server-side service account)
FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/seed-scratch-product.mjs

# also grant one user instant access (opens the player without free-checkout)
FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/seed-scratch-product.mjs --grant <firebase-uid>
```

The product is **free** (`isFree: true`, `availableForSale: true`) and every
module is `included`, so any signed-in user can open it after a free checkout —
or instantly when `--grant <uid>` is used.

## File-type status table

| # | Editor type | Player type | How it renders | Out-of-box | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `youtube` | `youtube` | YouTube no-cookie embed (`youtube-nocookie.com/embed/<id>`) | ✅ | Works for watch / youtu.be / shorts / embed URLs (see fix below). |
| 2 | `video_url` | `video` | Native `<video controls>` | ✅ | MP4/WebM/etc. over HTTPS. Sample uses Google's public `commondatastorage` bucket. |
| 3 | `audio_url` | `audio` | Native `<audio controls>` | ✅ | MP3/M4A/WAV/OGG. Sample uses SoundHelix MP3. |
| 4 | `image_url` | `image` | `ImageViewer` (pinch/wheel zoom, pan, download) | ✅ | Sample uses picsum.photos. |
| 5 | `gdrive` | `embed` → `drive` | `drive.google.com/file/d/<id>/preview` iframe | ⚠️ needs your file | Replace `PASTE_YOUR_DRIVE_FILE_ID` and share as *Anyone with the link*. |
| 6 | `pdf` | `pdf` | Built-in PDF viewer (drive preview for Drive links, direct iframe otherwise) | ✅ | Sample uses w3.org dummy.pdf. |
| 7 | `gdoc` | `doc` | `docs.google.com/document/d/<id>/preview` | ⚠️ needs your file | Replace `PASTE_YOUR_DOC_ID`, share as *Anyone with the link*. |
| 8 | `gsheet` | `sheet` | `docs.google.com/spreadsheets/d/<id>/preview` | ⚠️ needs your file | Replace `PASTE_YOUR_SHEET_ID`. |
| 9 | `gslides` | `slides` | `docs.google.com/presentation/d/<id>/embed` | ⚠️ needs your file | **New first-class type** (was previously only reachable via URL sniffing). |
| 10 | `gform` | `google_form` | `docs.google.com/forms/.../viewform?embedded=true` | ⚠️ needs your file | Replace `PASTE_YOUR_FORM_ID`. |
| 11 | `ebook` | `ebook` → `pdf` | PDF e-books render natively; other formats fall back to Google Docs viewer | ✅ | Fix: `.pdf` e-books no longer route through the deprecated `gview`. |
| 12 | `github_pages` | `embed` | Sandboxed HTTPS iframe | ✅ | Any public HTTPS page. Sample uses example.com. |
| 13 | `whimsical` | `mindmap` | `whimsical.com/embed/<boardId>` | ⚠️ needs your board | Replace `PASTE_YOUR_BOARD_ID`; enable public access on the board. |
| 14 | `iframe` | `embed` | Sandboxed HTTPS iframe | ✅ | Sample uses OpenStreetMap's embed endpoint. |

Legend: ✅ works immediately · ⚠️ needs a real file/link you own (Google / Whimsical
require the file to be shared as *Anyone with the link* — a platform rule, not an
app bug).

## Bugs found and fixed

### 1. YouTube `youtu.be` / `shorts` / `embed` URLs produced a broken player (FIXED)

`utils/productMapping.js` → `canonicalResourceToLegacyFile` derived the video id
with `url.split("v=").pop()`. That only works for `watch?v=` links — for
`youtu.be/<id>`, `/shorts/<id>` and `/embed/<id>` it returned the whole URL as the
id, so the player embedded
`youtube-nocookie.com/embed/https%3A%2F%2Fyoutu.be…` and showed a dead frame.

**Fix:** a robust `extractYoutubeVideoId()` helper (mirrors
`src/utils/courseEmbed.ts`) is now used, and a bare `youtubeVideoId` is carried
through the canonical layer instead of being lost.

### 2. `commondatastorage.googleapis.com` media was stripped by the URL sanitizer (FIXED)

`isValidHttpsUrl` rejected any hostname ending in `storage.googleapis.com`, which
also matched Google's **public** sample media host
`commondatastorage.googleapis.com` (used by our MP4 sample). The hostname is now
anchored (`(^|\.)storage.googleapis.com$`), so real public media passes while
Firebase/GCS storage buckets are still blocked.

### 3. `ebook` files routed through the deprecated Google Docs viewer (FIXED)

E-books pointing at a `.pdf` URL now render in the native PDF viewer instead of
`docs.google.com/gview` (deprecated and increasingly broken). EPUB/other formats
still fall back to `gview` as a best effort.

### 4. Google Slides had no first-class editor type (ADDED)

Added a `gslides` resource type (Admin editor → canonical `slides` → player
`slides` embed). Previously Google Slides could only be embedded by pasting the
URL into `gdrive`/`iframe` and relying on URL sniffing. `slides` is now a valid
`CourseFileType` / `ResourceType` everywhere (editor enum, mapping layer, PDP
labels, checkout labels, sidebar filter + icon).

## Regression guard

`tests/scratch-file-types.test.mjs` asserts, for all 14 editor types:

- the resource is not dropped by the URL-only rule,
- it bridges to a valid player type,
- it resolves to a supported embed kind with an HTTPS preview URL,
- the YouTube id extraction (all four URL forms) is correct,
- `gslides` → `slides` embed and `ebook` → native PDF.

Run it with:

```bash
node --test tests/scratch-file-types.test.mjs
```
