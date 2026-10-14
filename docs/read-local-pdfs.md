# Course Player Read: Cloud upload and Upload local

## Using it

Open **Read → Upload local**, choose PDFs, optionally enter a module and submodule, and select **Upload local to my module**. The imported PDF opens in the bundled Mozilla PDF.js viewer with its normal tools. The previous Firebase option is now labelled **Cloud upload**.

If a cloud upload stalls while the compose sheet is open, select **Upload local** in that sheet. Selected files are retained, so downloading/reselecting the same file is unnecessary. Local uploads bypass Firebase Storage, token refresh, download-URL lookup, and Firestore metadata writes. Link import still requires network access to fetch the original PDF.

Local files appear under **My PDFs**, labelled **Local · this device**. Cloud files are labelled **Cloud**. Module/submodule grouping, search, module moves, rename (hook API), deletion, annotation saves and reading position use the appropriate backend. Local multi-file imports stop at the first error and retain the remaining files in the sheet for retry without duplicating successful imports.

The Read library's **Save to my module** action can link a local PDF into My Study Library. The existing course metadata mechanism may sync that reference; the PDF bytes never sync. The link only works for the original account on the browser/device that imported it. Other devices show a missing-local-file explanation instead of a broken network request.

## Storage and ownership

- Database: IndexedDB `eduvora-read-pdfs`, schema version 1, managed with existing Dexie dependency.
- Store: `pdfs`, compound primary key `[uid+id]`, index `uid`.
- Each record atomically contains a PDF Blob and metadata: name, module, submodule, byte size, page count, last page/opened time, annotation count and timestamps.
- PDF header validation and the existing 100 MB file ceiling apply before import. Annotated bytes are validated and atomically replace the same record.
- Repository operations are account-scoped. The React hook checks the current Firebase session before mutations. The viewer resolver checks the reference owner against the signed-in account before opening.
- The live shelf uses Dexie `liveQuery`, independently of the cloud shelf. Denied cloud rules do not prevent local reading or saves.
- Local records **never** enter `users/{uid}/readUploads`, and no Firebase rules changes are needed for local PDFs. Existing cloud upload rules and pipeline remain in place.

### PDF.js references

Local records and module resources use `eduvora-local-pdf:<uid>/<uploadId>`, not a temporary `blob:` URL. This strict internal reference is accepted only for PDF sources (`pdf_url`), never as an embedded web page. The PDF.js wrapper resolves it to a fresh, same-origin Blob URL for the mounted viewer, validates the PDF source, and revokes the URL on teardown/cancellation. Module-linked local files use the same annotation and activity save path as their My PDFs row.

## Limitations and backups

Local storage means **this browser profile and origin**, not a file in the OS Downloads folder. It does not follow a learner to another device/browser, app origin, or reinstall. Private-browsing storage may be temporary. Clearing site data, browser eviction, or uninstalling can remove the local database. Signing out hides the shelf but does not delete it.

Use **Download PDF** in the local reader, or PDF.js's download tool, to keep a backup including annotations. Quota/blocked-storage errors are surfaced; failed atomic writes do not leave partial PDFs or overwrite a previous good copy. IndexedDB is not an encrypted vault—other software with access to the browser profile may access it.

The reported `dc/stalled · step=bytes` means the Firebase SDK reported no byte progress for 60 seconds, not proof of a particular billing issue. Check the Firebase project's Storage bucket, deployed rules, billing status, connectivity and browser CORS/network errors separately. Firebase's no-cost plan is Spark; Blaze is the pay-as-you-go plan with some no-cost quotas. This implementation does not change the deployed project's billing or cloud configuration.

## Verification

- `npm run test:read`: existing cloud pipeline/rules/routing contracts, local repository persistence and account isolation, local hook runtime tests, plus a real PDF.js browser smoke test when Chromium is installed.
- Browser test: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node --test tests/localReadPdfViewerBrowser.test.mjs` (or install Playwright Chromium). It stores a real PDF, opens it in the bundled viewer, checks extracted text/page count, saves PDF.js bytes, reloads, and reopens from IndexedDB.
- `npx tsc --noEmit`
- `npm run build:low-heap`

The database/runtime tests use `fake-indexeddb` only as a dev dependency. Production uses the browser's actual IndexedDB API and Dexie.
