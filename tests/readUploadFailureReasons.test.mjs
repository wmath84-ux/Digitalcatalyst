// tests/readUploadFailureReasons.test.mjs
//
// The Read page's PDF upload used to fail SILENTLY: every failure collapsed
// into one of a few generic sentences and the technical cause was thrown away,
// so "upload nahin hota, koi reason nahin dikhta" was unanswerable from the
// screen. These tests pin the new contract — every failure carries Firebase's
// code, the HTTP status, the server's own message and the step that died.

import test from "node:test";
import assert from "node:assert/strict";

import {
  READ_UPLOAD_STEP_LABEL,
  describeUploadFailure,
  parseServerResponse,
} from "../src/course/uploadFailure.ts";

const storageError = (code, serverResponse, message) =>
  Object.assign(new Error(message || `${code} (stub)`), { code, serverResponse });

test("every step of the pipeline has a learner-facing label", () => {
  const steps = ["read-file", "sign-in", "load-uploader", "bytes", "download-url", "library-write"];
  for (const step of steps) {
    assert.ok(READ_UPLOAD_STEP_LABEL[step], `${step} has a label`);
  }
});

test("a 403 from the storage rules says RULES — not 'file too large'", () => {
  const failure = describeUploadFailure({
    thrown: storageError(
      "storage/unauthorized",
      '{"error":{"code":403,"message":"Permission denied. Could not perform this operation"}}',
    ),
    step: "bytes",
    fileName: "Physics notes.pdf",
    storagePath: "userReadUploads/u1/physics-notes-pdf-abc.pdf",
  });
  assert.equal(failure.code, "storage/unauthorized");
  assert.equal(failure.status, 403);
  assert.equal(failure.serverMessage, "Permission denied. Could not perform this operation");
  assert.match(failure.headline, /refused/i);
  // The old text blamed the 100 MB limit for a rules problem. It must not.
  assert.doesNotMatch(failure.headline, /100 MB/);
  assert.match(failure.hint, /firebase deploy --only storage/);
  assert.match(failure.detail, /code=storage\/unauthorized/);
  assert.match(failure.detail, /http=403/);
  assert.match(failure.detail, /step=bytes/);
  assert.match(failure.detail, /path=userReadUploads\/u1\/physics-notes-pdf-abc\.pdf/);
  assert.match(failure.detail, /Permission denied/);
});

test("a missing bucket (storage/unknown + 404 body) is named, not shrugged at", () => {
  const failure = describeUploadFailure({
    thrown: storageError(
      "storage/unknown",
      "404 Not Found: The specified bucket does not exist.",
      "An unknown error occurred, please check the error response for more information.",
    ),
    step: "bytes",
    fileName: "Notes.pdf",
  });
  assert.equal(failure.status, 404);
  assert.match(failure.serverMessage, /bucket does not exist/);
  assert.match(failure.hint, /bucket or upload path is misconfigured/);
  assert.match(failure.detail, /bucket does not exist/);
  // The raw SDK message is kept too — it is what a Firebase search needs.
  assert.match(failure.detail, /message="An unknown error occurred/);
});

test("the pipeline's own failures each explain themselves", () => {
  const stalled = describeUploadFailure({ thrown: Object.assign(new Error("x"), { code: "dc/stalled" }), step: "bytes", fileName: "A.pdf" });
  assert.match(stalled.headline, /stopped moving/);
  assert.match(stalled.hint, /Retry/);

  const offline = describeUploadFailure({ thrown: Object.assign(new Error("x"), { code: "dc/offline-ceiling" }), step: "bytes", fileName: "A.pdf" });
  assert.match(offline.headline, /no internet connection/i);
  assert.match(offline.hint, /Retry/);

  const sdk = describeUploadFailure({ thrown: Object.assign(new Error("x"), { code: "dc/sdk-load" }), step: "load-uploader" });
  assert.match(sdk.headline, /uploader/i);
  assert.match(sdk.detail, /step=load-uploader/);

  const notPdf = describeUploadFailure({ thrown: Object.assign(new Error("x"), { code: "dc/not-pdf" }), step: "read-file", fileName: "photo.jpg" });
  assert.match(notPdf.headline, /not a real PDF/);
});

test("Firestore's permission-denied is told apart from a storage 403", () => {
  const failure = describeUploadFailure({
    thrown: Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }),
    step: "library-write",
    fileName: "A.pdf",
  });
  assert.equal(failure.code, "permission-denied");
  assert.equal(failure.status, null, "Firestore sends no HTTP status here");
  assert.match(failure.hint, /firebase deploy --only storage,firestore/);
  assert.match(failure.detail, /step=library-write/);
});

test("parseServerResponse handles JSON, plain text, HTML and nothing at all", () => {
  assert.deepEqual(parseServerResponse('{"error":{"code":403,"message":"no"}}'), { status: 403, message: "no" });
  assert.deepEqual(parseServerResponse("404 Not Found: gone"), { status: 404, message: "Not Found: gone" });
  assert.deepEqual(parseServerResponse(null), { status: null, message: "" });
  const html = parseServerResponse("<html><body>Sign in</body></html>");
  assert.equal(html.status, null);
  assert.match(html.message, /Sign in/);
});

test("an unmapped error still yields a non-empty, technical reason", () => {
  const failure = describeUploadFailure({ thrown: new Error("boom"), step: "bytes", fileName: "A.pdf" });
  assert.ok(failure.detail.length > 0);
  assert.match(failure.detail, /code=error/);
  assert.match(failure.detail, /message="boom"/);

  const nothing = describeUploadFailure({ thrown: undefined });
  assert.ok(nothing.detail.length > 0, "even `undefined` produces something to show");
  assert.ok(nothing.headline.length > 0);
});
