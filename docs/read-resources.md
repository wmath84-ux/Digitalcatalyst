# Read resources

`read` is a first-class resource in the existing `siteProducts/{id}.courseContent` module tree. It does not create a second course/library tree, enter lesson selection or course-completion progress, or change existing resource types.

## Sources

- **PDF upload** — stored at `adminProductContent/read/{productId}/{resourceId}-{uploadId}.pdf`; the resource records its source kind, Storage object path, original filename and byte size. The resource/product identity in the path is checked before saving or deleting an object.
- **Google Drive PDF** — accepts a `drive.google.com/file/d/{id}/view`, `/open?id=…`, or `/uc?id=…` file link. The locally bundled PDF.js viewer reads the public download URL; no Drive credentials, API tokens or proxy are used.
- **Direct PDF URL** — public HTTPS URL opened by the bundled PDF.js Generic Viewer.
- **Generic embed URL** — public HTTPS URL loaded in a sandboxed iframe. It is not parsed as HTML and is never sent through an application URL proxy.

Only public HTTPS URLs are accepted for remote sources. IP literals (public or private), internal/local hostnames and common private-address wildcard-DNS aliases are rejected, as are non-standard ports, credentials and active/unsafe schemes. External PDF servers must permit browser cross-origin reads (CORS) for PDF.js; if they do not, upload the PDF or use a host that allows CORS. Google Drive sharing/download behavior is controlled by Google and may also prevent direct PDF.js access.

## Upload limit and Storage rules

A Read PDF must be **smaller than 100 MiB** (`100 * 1024 * 1024` bytes). The admin picker, client validation and Firebase Storage rule use the same strict limit; exactly 100 MiB is rejected. Storage writes require the PDF MIME type and admin authorization. There is no application-level cap on the number of resources or PDFs.

Storage objects are replaced/deleted only after the corresponding product Firestore write succeeds. A failed save keeps any upload the retryable draft may reference. Duplicating a product clears uploaded-PDF references so the copy never points at the source product's Storage object; web links remain duplicable.

## PDF.js runtime

The Mozilla Generic Viewer, core, worker, viewer CSS/images, locale module and supporting CMaps/ICC/font/WASM/sandbox assets are copied from the pinned npm packages into versioned `dist/pdfjs-viewer/` and `dist/pdfjs-data/` directories. The viewer script is requested only when a learner opens a PDF. Vite development serves the same local package assets, and the production files are part of the Vite `dist` directory shipped by Capacitor. The PWA service worker caches versioned PDF.js support assets on use; remote PDF bytes themselves are not cached for offline reading.
