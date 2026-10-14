import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const image = fs.readFileSync("src/components/ui/SafeImage.tsx", "utf8");
const photo = fs.readFileSync("src/utils/profilePhoto.ts", "utf8");
const layout = fs.readFileSync("src/profile/ProfileLayout.tsx", "utf8");

test("profile hero never shows a broken-image glyph for the user photo", () => {
  assert.match(photo, /function profilePhotoSrc/);
  assert.match(layout, /profilePhotoSrc\(photoURL\)/);
  assert.match(layout, /<SafeImage src=\{src\}/);
  assert.match(image, /referrerPolicy=\{referrerPolicy \?\? "no-referrer"\}/);
  assert.match(image, /onError=\{\(\) => setAttempt/);
  assert.match(layout, /data-profile-photo-fallback/);
  assert.match(photo, /googleusercontent/);
});
