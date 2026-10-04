import test from "node:test";
import assert from "node:assert/strict";

import {
  READ_PDF_MAX_BYTES,
  buildReadStoragePath,
  collectAccessibleReadResources,
  collectReadUploadPaths,
  googleDrivePdfUrl,
  isOwnedReadUploadPath,
  normalizeReadResourceUrl,
  normalizeReadSourceKind,
  sanitizeReadUploadsForProduct,
} from "../utils/readResources.js";
import {
  canonicalResourceToLegacyFile,
  editorResourceToFirestore,
  firestoreResourceToCanonical,
  firestoreResourceToEditor,
  normalizeResourceUrl,
} from "../utils/productMapping.js";

const storageUrl = (path, bucket = "demo.appspot.com") =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=download-token`;

const driveId = "AbCdEf1234_XyZ";

test("Read sources accept safe HTTPS URLs and normalize Google Drive shares only on drive.google.com", () => {
  assert.equal(normalizeReadResourceUrl("example.com/notes.pdf", "pdf_url"), "https://example.com/notes.pdf");
  assert.equal(normalizeReadResourceUrl("https://docs.example.org/read", "embed_url"), "https://docs.example.org/read");
  assert.equal(
    normalizeReadResourceUrl(`https://drive.google.com/file/d/${driveId}/view?usp=sharing`, "gdrive"),
    `https://drive.google.com/file/d/${driveId}/view`,
  );
  assert.equal(googleDrivePdfUrl(`https://drive.google.com/file/d/${driveId}/view`),
    `https://drive.google.com/uc?export=download&id=${driveId}`);
  assert.equal(normalizeReadResourceUrl(`https://drive.google.com/open?id=${driveId}`, "gdrive"),
    `https://drive.google.com/file/d/${driveId}/view`);
  assert.equal(normalizeReadResourceUrl(`https://drive.google.com.evil.example/file/d/${driveId}/view`, "gdrive"), "");
  assert.equal(normalizeReadResourceUrl("https://docs.google.com/document/d/abcdefghijk/edit", "gdrive"), "");
  assert.equal(normalizeReadResourceUrl("https://drive.google.com/file/d/short-id/view", "gdrive"), "");
});

test("Read URL validation rejects unsafe schemes, credentials, local hosts, IP literals and HTML", () => {
  const invalid = [
    "http://public.example/notes.pdf",
    "javascript:alert(1)",
    "data:application/pdf;base64,AAAA",
    "//public.example/notes.pdf",
    "<iframe src=\"https://public.example\"></iframe>",
    "https://user:password@public.example/notes.pdf",
    "https://localhost/notes.pdf",
    "https://reader.internal/notes.pdf",
    "https://reader.local/notes.pdf",
    "https://reader.test/notes.pdf",
    "https://router.home.arpa/notes.pdf",
    "https://printer.intranet/notes.pdf",
    "https://workstation.corp/notes.pdf",
    "https://127.0.0.1.nip.io/notes.pdf",
    "https://192.168.1.4.sslip.io/notes.pdf",
    "https://127.0.0.1/notes.pdf",
    "https://10.0.0.4/notes.pdf",
    "https://192.168.1.1/notes.pdf",
    "https://[::1]/notes.pdf",
    "https://public.example.org:8443/notes.pdf",
  ];
  for (const url of invalid) {
    assert.equal(normalizeReadResourceUrl(url, "pdf_url"), "", `${url} should be rejected`);
    assert.equal(normalizeReadResourceUrl(url, "embed_url"), "", `${url} should be rejected as an embed too`);
  }
  assert.equal(normalizeReadResourceUrl("https://firebasestorage.googleapis.com/v0/b/other/o/file.pdf?alt=media&token=x", "pdf_url"), "");
  assert.equal(normalizeReadResourceUrl("https://public.example.org/read", "embed_url"), "https://public.example.org/read");
  // Read has its own stricter policy, even when the generic product helper
  // would accept the same hostname as a normal HTTPS embed.
  assert.equal(normalizeResourceUrl("https://reader.local/read.pdf", "embed"), "https://reader.local/read.pdf");
  assert.equal(normalizeResourceUrl("https://reader.local/read.pdf", "read"), "");
});

test("Read upload URLs must be the exact owned Firebase download object and fit the shared byte limit", () => {
  const productId = "product_101";
  const resourceId = "res_202";
  const path = buildReadStoragePath(productId, resourceId, "upload_xyz-123");
  const url = storageUrl(path);
  assert.equal(path, `adminProductContent/read/${productId}/${resourceId}-upload_xyz-123.pdf`);
  assert.ok(isOwnedReadUploadPath(path, productId, resourceId));
  assert.ok(!isOwnedReadUploadPath(path, "another_product", resourceId));
  assert.ok(!isOwnedReadUploadPath(path, productId, "another_resource"));
  assert.equal(normalizeReadResourceUrl(url, "upload", {
    productId,
    resourceId,
    storagePath: path,
    fileSize: READ_PDF_MAX_BYTES - 1,
  }), url);
  assert.equal(normalizeReadResourceUrl(storageUrl(path), "upload", {
    productId: "another_product",
    resourceId,
    storagePath: path,
    fileSize: 12,
  }), "");
  assert.equal(normalizeReadResourceUrl(storageUrl(path), "upload", {
    productId,
    resourceId: "different_resource",
    storagePath: path,
    fileSize: 12,
  }), "");
  assert.equal(normalizeReadResourceUrl(storageUrl(path), "upload", {
    productId,
    resourceId,
    storagePath: path,
    fileSize: READ_PDF_MAX_BYTES,
  }), "");
  assert.equal(normalizeReadResourceUrl(storageUrl(path).replace("firebasestorage.googleapis.com", "storage.googleapis.com"), "upload", {
    productId,
    resourceId,
    storagePath: path,
    fileSize: 12,
  }), "");
  assert.equal(normalizeReadResourceUrl(storageUrl(path).replace("firebasestorage.googleapis.com", "firebasestorage.googleapis.com:444"), "upload", {
    productId,
    resourceId,
    storagePath: path,
    fileSize: 12,
  }), "");
  assert.equal(normalizeReadResourceUrl(storageUrl(path).replace(encodeURIComponent(path), encodeURIComponent(`${path}-other`)), "upload", {
    productId,
    resourceId,
    storagePath: path,
    fileSize: 12,
  }), "");
  assert.equal(normalizeReadResourceUrl(storageUrl(path).replace("&token=download-token", ""), "upload", {
    productId,
    resourceId,
    storagePath: path,
    fileSize: 12,
  }), "");
  assert.equal(normalizeReadSourceKind(undefined, path), "upload");
});

test("sanitizing a copied product removes foreign Read uploads but retains safe web sources", () => {
  const sourceProductId = "source_product";
  const targetProductId = "copy_product";
  const sourcePath = buildReadStoragePath(sourceProductId, "res_uploaded", "once");
  const modules = [{
    id: "module_1",
    resources: [
      {
        id: "res_uploaded",
        type: "read",
        name: "Uploaded book",
        url: storageUrl(sourcePath),
        readSourceKind: "upload",
        readStoragePath: sourcePath,
        readFileName: "book.pdf",
        readFileSize: 42,
      },
      {
        id: "res_direct",
        type: "read",
        name: "Direct PDF",
        url: "https://public.example.org/book.pdf",
        readSourceKind: "pdf_url",
        readStoragePath: "stale/foreign/path.pdf",
      },
      {
        id: "res_unsafe",
        type: "read",
        name: "Unsafe draft",
        url: "http://127.0.0.1/private.pdf",
        readSourceKind: "pdf_url",
      },
      { id: "res_video", type: "video", url: "https://video.example/movie.mp4", readStoragePath: "stale" },
    ],
  }];

  assert.deepEqual([...collectReadUploadPaths(modules, sourceProductId)], [sourcePath]);
  const copied = sanitizeReadUploadsForProduct(modules, targetProductId);
  assert.equal(copied[0].resources[0].url, "");
  assert.equal(copied[0].resources[0].readStoragePath, undefined);
  assert.equal(copied[0].resources[0].readFileName, undefined);
  assert.equal(copied[0].resources[1].url, "https://public.example.org/book.pdf");
  assert.equal(copied[0].resources[1].readStoragePath, undefined);
  assert.equal(copied[0].resources[2].url, "");
  assert.equal(copied[0].resources[3].readStoragePath, undefined);
  assert.deepEqual([...collectReadUploadPaths(copied, targetProductId)], []);
  assert.deepEqual([...collectReadUploadPaths(copied, sourceProductId)], []);
});

test("Read metadata survives the existing editor → Firestore → learner mapping", () => {
  const productId = "product_legacy";
  const resourceId = "res_read";
  const path = buildReadStoragePath(productId, resourceId, "stored-once");
  const input = {
    id: resourceId,
    name: "The Reading",
    type: "read",
    url: storageUrl(path),
    provider: "Read library",
    readSourceKind: "upload",
    readStoragePath: path,
    readFileName: "The Reading.pdf",
    readFileSize: 8192,
    accessLevel: "included",
    visibility: "visible",
  };

  const firestore = editorResourceToFirestore(input);
  assert.equal(firestore.type, "read");
  assert.equal(firestore.url, input.url);
  assert.equal(firestore.readSourceKind, "upload");
  assert.equal(firestore.readStoragePath, path);
  assert.equal(firestore.readFileName, input.readFileName);
  assert.equal(firestore.readFileSize, input.readFileSize);

  const editor = firestoreResourceToEditor(firestore);
  assert.equal(editor.type, "read");
  assert.equal(editor.readStoragePath, path);
  assert.equal(editor.readFileName, input.readFileName);

  const canonical = firestoreResourceToCanonical(firestore);
  assert.equal(canonical.type, "read");
  assert.equal(canonical.readStoragePath, path);
  const playerFile = canonicalResourceToLegacyFile(canonical);
  assert.equal(playerFile.type, "read");
  assert.equal(playerFile.readSourceKind, "upload");
  assert.equal(playerFile.readStoragePath, path);
});

test("Read collection respects pre-resolved module unlocks and paid-update ownership", () => {
  const url = "https://public.example.org/reading.pdf";
  const modules = [
    {
      id: "root_open",
      title: "Unlocked chapter",
      accessLevel: "included",
      files: [
        { id: "read_free", type: "read", name: "Free reading", url, readSourceKind: "pdf_url", accessLevel: "included" },
        { id: "read_paid", type: "read", name: "Paid update reading", url, readSourceKind: "pdf_url", accessLevel: "paidUpdate", paidUpdateId: "update_owned" },
        { id: "read_locked", type: "read", name: "Locked update reading", url, readSourceKind: "pdf_url", accessLevel: "paidUpdate", paidUpdateId: "update_locked" },
        { id: "read_hidden", type: "read", name: "Hidden reading", url, readSourceKind: "pdf_url", accessLevel: "hidden" },
        { id: "lesson_video", type: "video", name: "Lesson", url: "https://public.example/lesson.mp4" },
      ],
      modules: [
        {
          id: "child_open",
          title: "Unlocked child",
          accessLevel: "included",
          files: [{ id: "read_child", type: "read", name: "Child PDF", url, readSourceKind: "pdf_url" }],
          modules: [],
        },
        {
          id: "child_locked",
          title: "Locked child",
          accessLevel: "included",
          files: [{ id: "read_child_locked", type: "read", name: "Child locked PDF", url, readSourceKind: "pdf_url" }],
          modules: [],
        },
      ],
    },
  ];
  const accessible = collectAccessibleReadResources(
    modules,
    new Set(["root_open", "child_open"]),
    new Set(["update_owned"]),
    "product_1",
  );
  assert.deepEqual(accessible.map((entry) => entry.id), ["read_free", "read_paid", "read_child"]);
  assert.deepEqual(accessible[2].modulePath, ["Unlocked chapter", "Unlocked child"]);
  assert.equal(accessible[0].presentation.kind, "pdfjs");
});
