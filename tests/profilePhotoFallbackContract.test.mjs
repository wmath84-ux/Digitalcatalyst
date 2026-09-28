import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("src/profile/ProfileLayout.tsx", "utf8");

test("profile hero never shows a broken-image glyph for the user photo", () => {
  assert.match(layout, /function profilePhotoSrc/);
  assert.match(layout, /referrerPolicy=\"no-referrer\"/);
  assert.match(layout, /onError=\{\(\) => setBrokenPhoto\(src\)\}/);
  assert.match(layout, /data-profile-photo-fallback/);
  assert.match(layout, /googleusercontent/);
});
