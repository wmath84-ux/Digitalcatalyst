// tests/revisionSubmitOverlayContract.test.mjs
//
// The former custom, viewport-bounded submit overlay was retired with the
// glass Revision shell. The active Test Player now uses Recall's Radix alert
// dialog, whose portal inherits the feature's scoped theme tokens.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const player = read("src/revision/pages/TestPlayerPage.tsx");
const confirmHook = read("src/revision/components/useConfirmAction.tsx");
const alertDialog = read("src/revision/recall/components/ui/alert-dialog.tsx");
const recallStorage = read("src/revision/recall/services/storage.ts");

test("test submission uses the shared Recall confirmation dialog", () => {
  assert.match(player, /useConfirmAction\(\)/);
  assert.match(player, /title: "Submit this test\?"/);
  assert.match(player, /confirmLabel: "Submit"/);
  assert.match(player, /onConfirm: submit/);
  assert.match(player, /\{dialog\}/);
  assert.match(confirmHook, /<AlertDialog\s+open=\{Boolean\(request\)\}/);
  assert.match(confirmHook, /<AlertDialogContent>/);
  assert.match(confirmHook, /<AlertDialogTitle/);
  assert.match(confirmHook, /AlertDialogAction asChild/);
});

test("the alert dialog is centered above page chrome and remains a portal", () => {
  assert.match(alertDialog, /<AlertDialogPrimitive\.Portal>/);
  assert.match(alertDialog, /<AlertDialogPrimitive\.Overlay className="fixed inset-0 z-50 bg-black\/40"/);
  assert.match(alertDialog, /fixed left-1\/2 top-1\/2 z-50 w-\[min\(92vw,480px\)\]/);
  assert.match(alertDialog, /bg-card p-6 text-foreground shadow-sm/);
  assert.match(recallStorage, /function syncPortalTheme/);
  assert.match(recallStorage, /body\.setAttribute\("data-recall-theme"/);
});

test("legacy submit-overlay geometry hooks are not required by the active player", () => {
  assert.doesNotMatch(player, /data-rev-submit-overlay|data-rev-submit-dialog|data-revision-page-main/);
  assert.doesNotMatch(player, /requestAnimationFrame|setBoundsReady/);
});
