# Product Upload Test Report

## Test run

1. **Test product name:** `TEST_AUDIO_UPLOAD_PRODUCT_1782756537424`
2. **Test product ID:** `1782756537424`
3. **File type tested:** Audio/music (`audio/mpeg`)
4. **File size tested:** 1.5MB dummy MP3 payload (`1,572,864` bytes)
5. **Firebase Storage path:** `adminProductContent/audio/1782756537424/1782756537424-dummy-1-5mb.mp3`
6. **Whether download URL was created:** FAIL in this container test; upload could not complete because Firebase Auth/network failed before browser upload verification.
7. **Whether Firestore product save passed:** Not reached in the container test because upload/download URL did not complete.
8. **Whether refresh persistence passed:** Not reached in the container test.
9. **Whether purchased user access passed:** Not run in this non-interactive container; code path stores a normal audio URL in `ProductFile.url`, which is the same field the purchased course player already consumes.
10. **Errors found:** `auth/network-request-failed` occurred in the container when attempting anonymous Firebase Auth. A direct unauthenticated Storage SDK attempt also hung in this environment, matching the user's symptom that Storage was not completing.
11. **Fixes applied:**
    - Audio/video/PDF/e-book/sheet uploads above 700KB now always use Firebase Storage and never base64 fallback.
    - Audio max size is 50MB; video 75MB; PDF/e-book 25MB; spreadsheet 10MB; product image 8MB.
    - Uploads use stable product-scoped paths: `adminProductContent/{type}/{productId}/{timestamp}-{safeFileName}`.
    - Upload auth now requires a real Firebase Auth user with `users/{uid}.role` set to `admin` or `super_admin`; localStorage-only admin sessions are blocked before upload.
    - The custom 20-second Promise.race timeout was removed for content uploads. Firebase resumable upload now controls retry/progress.
    - Retry logic was added for retryable Storage/network errors (up to 3 attempts), without retrying permission/bucket errors.
    - A 15-second first-byte watchdog cancels uploads that stay at 0%, logs `ADMIN_UPLOAD_FIRST_BYTE_TIMEOUT`, and exposes a Retry button instead of leaving the UI stuck.
    - Upload progress and all required audio lifecycle logs were added.
    - Saved content metadata now includes `storagePath`, `size`, `contentType`, `createdAt`, and `updatedAt` before the item is added to product content.
    - App product save now logs Firestore save start/success/failure and refresh verification start/success.
12. **Final status:** FAIL in this container network/auth test; code fixes are applied, forced full-upload timeout is removed, first-byte stuck detection/retry UI is added, build/tests pass, but a real Firebase Auth admin in the browser plus deployed rules must be used to confirm PASS.

## Required production verification checklist

- Deploy `storage.rules` and `firestore.rules`.
- Log into the real admin panel.
- Upload a real 1.5MB MP3.
- Confirm console logs: `ADMIN_AUDIO_UPLOAD_SELECTED`, `ADMIN_AUDIO_UPLOAD_STARTED`, `ADMIN_AUDIO_UPLOAD_PROGRESS`, `ADMIN_AUDIO_UPLOAD_SUCCESS`, `ADMIN_AUDIO_DOWNLOAD_URL_SUCCESS`.
- Click **Update Product**.
- Confirm console logs: `ADMIN_PRODUCT_FIRESTORE_SAVE_STARTED`, `ADMIN_PRODUCT_FIRESTORE_SAVE_SUCCESS`, `ADMIN_PRODUCT_REFRESH_VERIFY_STARTED`, `ADMIN_PRODUCT_REFRESH_VERIFY_SUCCESS`.
- Refresh and reopen the product.
- Confirm the audio item is still listed and its `url` is a Firebase Storage download URL, not a `data:` base64 URL.
- Open the purchased course player and confirm the audio is visible/playable.

## Production follow-up — Firestore 1 MiB document limit (fixed)

After security rules were deployed, the exact-error reporting surfaced the next production failure: updating an existing product returned `[invalid-argument] Document 'siteProducts/1782545401609' cannot be written because its size (1,234,076 bytes) exceeds the maximum allowed size of 1,048,576 bytes`. Cause: embedded base64 "data:" payloads (small inline uploads + legacy localStorage-era URLs) inside the single product document silently pushed it over Firestore's hard 1 MiB per-document limit.

Fix (`utils/productFirestoreDoc.js`, wired into `publishProductToFirebase`): before every product add/update, any embedded data-URL payload needed to fit the 900KB save budget is uploaded to Firebase Storage (`adminProductImages/{id}/embedded/` or `adminProductContent/{type}/{id}/` — the existing admin-only/public-read rule scopes) and rewritten to the https download URL. `describeOversizeProductDocument` remains as the final guard and names the largest fields when a document is genuinely oversized. Console markers: `ADMIN_PRODUCT_OFFLOAD_STARTED/SUCCESS/COMPLETE`, `ADMIN_PRODUCT_EMBEDDED_MEDIA_OFFLOADED`, `ADMIN_PRODUCT_DOC_TOO_LARGE`. Tests: `tests/productDocSizeOffloadContract.test.mjs`.
