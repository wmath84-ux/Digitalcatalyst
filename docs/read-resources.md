# Read resources

`read` is a first-class resource in the existing `siteProducts/{id}.courseContent` module tree. It does not create a second course/library tree, enter lesson selection or course-completion progress, or change existing resource types.

## Sources

- **PDF upload** — stored at `adminProductContent/read/{productId}/{resourceId}-{uploadId}.pdf`; the resource records its source kind, Storage object path, original filename and byte size. The resource/product identity in the path is checked before saving or deleting an object.
- **Google Drive PDF** — accepts a `drive.google.com/file/d/{id}/view`, `/open?id=…`, or `/uc?id=…` file link. The file opens in **Google Drive's own embeddable viewer** (`drive.google.com/file/d/{id}/preview`) inside the Read tab, with an *Open in Drive* escape hatch beside the title. No Drive credentials, API tokens or application proxy are used.

  Drive is deliberately **not** read by the bundled PDF.js viewer: the only bytes URL Google offers for a Drive file (`/uc?export=download&id=…`) answers with a redirect to `*.googleusercontent.com` that carries no `Access-Control-Allow-Origin` header, so a browser-side fetch is blocked before any byte arrives and the viewer sat at *0 pages*. Drive's `/preview` needs no CORS at all — Google's servers fetch the file and the frame renders the real, paginated document — and it works on every target the app ships on, including the packaged Android app where `/api/*` routes do not exist. This matches the Course Player, which already renders `drive` files the same way (`src/utils/courseEmbed.ts`). A file that is not shared with the link shows Google's own *request access* page inside the frame, so the sharing setting stays visible instead of failing silently.
- **Direct PDF URL** — public HTTPS URL opened by the bundled PDF.js Generic Viewer.
- **Generic embed URL** — public HTTPS URL loaded in a sandboxed iframe. It is not parsed as HTML and is never sent through an application URL proxy.

Only public HTTPS URLs are accepted for remote sources. IP literals (public or private), internal/local hostnames and common private-address wildcard-DNS aliases are rejected, as are non-standard ports, credentials and active/unsafe schemes. External PDF servers must permit browser cross-origin reads (CORS) for PDF.js; if they do not, upload the PDF or use a host that allows CORS. Google Drive is the one host the app never asks PDF.js to read — it is shown through Drive's own viewer instead (see above), so a Drive link only needs to be shared with the link.

## Upload limit and Storage rules

A Read PDF must be **smaller than 100 MiB** (`100 * 1024 * 1024` bytes). The admin picker, client validation and Firebase Storage rule use the same strict limit; exactly 100 MiB is rejected. Storage writes require the PDF MIME type and admin authorization. There is no application-level cap on the number of resources or PDFs.

Storage objects are replaced/deleted only after the corresponding product Firestore write succeeds. A failed save keeps any upload the retryable draft may reference. Duplicating a product clears uploaded-PDF references so the copy never points at the source product's Storage object; web links remain duplicable.

## PDF.js runtime

The Mozilla Generic Viewer, core, worker, viewer CSS/images, locale module and supporting CMaps/ICC/font/WASM/sandbox assets are copied from the pinned npm packages into versioned `dist/pdfjs-viewer/` and `dist/pdfjs-data/` directories. The viewer script is requested only when a learner opens a PDF. Vite development serves the same local package assets, and the production files are part of the Vite `dist` directory shipped by Capacitor. The PWA service worker caches versioned PDF.js support assets on use; remote PDF bytes themselves are not cached for offline reading.

## Learner uploads — "Your annotations"

The Read tab is also the learner's own library. The header's **+** button picks a
PDF from the device; the file is stored in the learner's own Storage folder:

```
userReadUploads/{uid}/{uploadId}-{slug}.pdf      bytes
users/{uid}/readUploads/{uploadId}               the library row
```

The Firestore document is re-derivable and its ownership comes from the PATH
(`storage.rules` scopes writes to `userReadUploads/{uid}/**`, `firestore.rules`
requires the document's `storagePath` to resolve inside that same folder), so a
hand-written document can never point at another learner's object. Every write is
owner-only, PDF-only and inside the same **100 MiB** ceiling the instructor-side
uploads use.

The same picker also accepts a **link**: the PDF is fetched in the browser and
checked for real PDF bytes and a PDF type/filename before anything is stored, so
an HTML error page can never be saved as a document. A Google Drive link is
refused here on purpose, with the reason spelled out — Drive answers its download
URL with a CORS-blocked redirect, so the learner is told to download the file and
use **Upload PDF**, or to open it from a course's Read tab when a course provides
it.

A learner PDF opens in the **same** bundled PDF.js Generic Viewer as a course
PDF, and the reader chrome adds the one thing a course PDF cannot offer: saving.
The viewer's annotation storage is observed (PDF.js's own `onSetModified` /
`onResetModified` callbacks) so the panel can say *Unsaved annotations*, and
**Save** writes `pdfDocument.saveDocument()` — the same bytes the viewer's own
save button produces, annotations included — back over the learner's object.
The document then records `hasAnnotations`, `annotationCount`, `annotatedAt`,
`sizeBytes`, the refreshed download URL and, on every page change, `lastPage` /
`lastOpenedAt`, so the next device continues where the learner stopped.

"Your annotations" is also the source of a learner-authored module: every row can
be saved into a My Study Library course as a `read` resource carrying its owned
Storage path, and that course's Read tab then opens it in this same annotated
viewer.
