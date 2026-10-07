# Google Drive PDF in the Read tab — the “0 pages” fix

**Owner report (2026-10-07):** a new module was added from Product Customization with a
Google Drive share URL and the **Google Drive PDF** Read source. The resource appeared in the
Course Player's Read tab, but opening it showed **no page at all — “0 pages”**.

**Branch:** `arena/e57d5541-digitalcatalyst`

---

## 1. Root cause

The Read tab resolved a `gdrive` source to Google's **bytes** URL and handed it to the locally
bundled PDF.js viewer:

```
utils/readResources.js  →  googleDrivePdfUrl()
https://drive.google.com/uc?export=download&id=<fileId>
```

PDF.js fetches that URL with `fetch()` and is therefore subject to CORS. Drive answers it with a
redirect to `doc-…-docs.googleusercontent.com` / `drive.usercontent.google.com`, and **that hop
carries no `Access-Control-Allow-Origin` header**, so the browser discards the response before a
single byte reaches PDF.js. The viewer then has no document at all — a blank surface stuck at
*0 pages*. Google controls this; no client-side code can change it.

The card itself appeared correctly because the **link** is valid: `normalizeReadResourceUrl()`
accepts `drive.google.com/file/d/{id}/view`, so the resource lists fine and only the byte path
fails — exactly the split the owner saw (“dikh raha tha … lekin open karne par zero page”).

## 2. The fix

**Google Drive now opens in Google Drive's own embeddable viewer, inside the Read tab.**

| File | Change |
| --- | --- |
| `utils/readResources.js` | New `googleDrivePreviewUrl()` → `https://drive.google.com/file/d/{id}/preview`. `getReadResourcePresentation()` returns `kind: "drive"` for a `gdrive` source (preview URL as `sourceUrl`, the canonical `/view` link as `originalUrl`). `googleDrivePdfUrl()` stays exported for downloads/exports and is documented as “never for the reader”. |
| `utils/readResources.d.ts` | Declares `googleDrivePreviewUrl` and the widened `kind: "pdfjs" \| "embed" \| "drive"`. |
| `src/course/ReadLibraryPanel.tsx` | The reader renders a `drive` entry in an iframe with the permissions Google's viewer needs (`allow-same-origin`, scripts, popups, modals, downloads — the same list the Course Player's Drive previews use in `ResourceViewer.tsx`), an **Open in Drive** escape hatch beside the title, and an “Open in Drive” label on the card. Uploads / direct PDF URLs keep the local PDF.js viewer untouched. |
| `src/components/admin/products/ModulesResourcesEditor.tsx` | The Drive hint now says what matters: share the file as “Anyone with the link”, and it opens in Google Drive's viewer in the Read tab. |
| `docs/read-resources.md` | Documents the Drive path and why PDF.js is deliberately not used for it. |

### Why Drive's viewer instead of a server-side proxy

1. **It works everywhere the app ships.** The packaged Android build loads its assets from the
   APK — `/api/*` routes do not exist there, so a proxy would have fixed the web only and left the
   installed app stuck at the same blank page. `/preview` needs no server at all.
2. **It is the app's existing, proven Drive path.** `src/utils/courseEmbed.ts` already renders
   `drive` files as `drive.google.com/file/d/{id}/preview` in the Course Player.
3. **No new public surface.** A byte proxy would be an internet-facing fetch endpoint for
   user-supplied URLs; Drive's own viewer streams the file from Google with no credentials, no
   token and no CORS involved.

A file that is **not** shared with the link is not hidden: Drive renders its own *request access*
page inside the frame, and the **Open in Drive** button takes the learner to the same page in a
new tab.

### Companion fix — the learner's “Add PDFs from a link”

`src/course/readUrlImport.ts` had the twin of this bug: pasting a Drive link started a browser
fetch that Drive always blocks, so the learner waited for the timeout and then read a generic
“could not reach that link (CORS)” message. It now refuses Drive **before** making any request,
with a reason they can act on:

> *Google Drive cannot be read through a link — Drive blocks browser downloads. Download the file
> and use Upload PDF instead, or open it from your course's Read tab when the course provides it.*

The module's stale “this app ships no server” note (the app does have serverless routes — push,
billing, AI readers, the GitHub embed proxy) was corrected to explain why none of them may become
an open relay for a learner-supplied URL.

* **A Drive link is recognised by its URL, not only by the dropdown.** A row saved
  under “Direct PDF URL” (or with no kind at all) that points at a
  `drive.google.com/file/d/{id}` link now also opens in Drive's viewer, so the
  “0 pages” symptom cannot come back through a different door. The row's own kind
  is left untouched in the admin data — only the rendering changes.

## 3. What did NOT change

* Uploaded PDFs and direct PDF URLs still open in the bundled **PDF.js Generic Viewer** — learner
  annotations, “save to your account” and page-position memory are untouched.
* No API tokens, no Drive credentials, no new dependency, no proxy, no change to the admin data
  model: an existing `gdrive` Read resource starts working with no migration.
* Access control is unchanged — the resource still only appears in unlocked modules, and only the
  `readSourceKind` presentation changed.

## 4. Verification

* **New/updated tests**
  * `tests/readResources.test.mjs` — a `gdrive` source must present as `kind: "drive"` with the
    `/preview` URL, must not equal the bytes URL, must reject look-alike hosts
    (`drive.google.com.evil.example`), must still reach the Read tab of an unlocked module, and a
    Drive link saved as `pdf_url` (or with no kind) must still open in Drive.
  * `tests/courseReadResourcesContract.test.mjs` — source-level pin: the Drive branch, its sandbox,
    the labels, the escape hatch, and the fact that the `gdrive` branch can no longer produce a
    `pdfjs` presentation.
  * `tests/readUrlImportContract.test.mjs` — runtime check that a Drive URL is refused with
    `retryable: false` and **zero** fetch attempts.
* **Full suite** `node --test tests/*.test.mjs`:
  * with this change — **3253 tests, 3120 pass, 57 fail**
  * without it — 3250 tests, 3117 pass, **the identical 57 failures**
  → the three new passing tests are the only delta (the failure set is byte-for-byte the same:
  pre-existing profile / store / revision / Android contract failures).
* **Types**: `npx tsc --noEmit` → 52 pre-existing errors, **none** in the touched files.
* **Build**: `node scripts/vite-build.mjs` → successful production build.
* **Dev server**: `utils/readResources.js`, `src/course/readUrlImport.ts` and
  `src/course/ReadLibraryPanel.tsx` all transform and serve cleanly through Vite, so the fix is
  live on the preview server (no `/api/*` route is involved in this path, so it behaves the same
  in the packaged Android build).
* **Limit of this environment**: the sandbox cannot reach `drive.google.com`, so the Drive frame
  itself could not be screenshotted here. The URL is Google's documented embeddable viewer and the
  exact rendering the Course Player already uses for Drive files; the fix is verified at the URL,
  presentation, wiring and build level.
