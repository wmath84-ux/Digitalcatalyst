import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const profileApp = fs.readFileSync("src/profile/App.tsx", "utf8");
const profileLayout = fs.readFileSync("src/profile/ProfileLayout.tsx", "utf8");
const storageRules = fs.readFileSync("storage.rules", "utf8");
const photoUtil = fs.readFileSync("src/utils/profilePhoto.ts", "utf8");

test("Profile offers a persistent upload action for a missing avatar photo", () => {
  assert.match(profileLayout, /data-profile-photo-upload/);
  assert.match(profileLayout, /photoURL \? "Change profile photo" : "Add profile photo"/);
  assert.match(profileLayout, /photoURL \? "Change photo" : "Add photo"/);
  assert.match(profileApp, /data-profile-photo-input/);
  assert.match(profileApp, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test("profile photos upload to owner-scoped Storage and sync through the user profile", () => {
  assert.match(profileApp, /getFirebaseStorage\(\)/);
  assert.match(profileApp, /await import\("firebase\/storage"\)/);
  assert.match(profileApp, /userProfilePhotos\/\$\{user\.id\}\/avatar/);
  assert.match(profileApp, /getDownloadURL\(uploaded\.ref\)/);
  assert.match(profileApp, /setDoc\(doc\(db, "users", user\.id\), \{ photoURL, updatedAt: serverTimestamp\(\) \}, \{ merge: true \}\)/);
  assert.match(profileApp, /setUser\(\{ \.\.\.user, photoURL \}\)/);
  assert.match(profileApp, /PROFILE_PHOTO_MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(storageRules, /match \/userProfilePhotos\/\{uid\}\/\{fileName\}/);
  assert.match(storageRules, /request\.auth\.uid == uid[\s\S]*?request\.resource\.size < 5 \* 1024 \* 1024[\s\S]*?image\/\(jpeg\|png\|webp\)/);
});

test("avatar URL normalization is shared by Profile and the phone drawer", () => {
  assert.match(photoUtil, /googleusercontent\\\.com/);
  assert.match(profileLayout, /profilePhotoSrc\(photoURL\)/);
  const mobileMenu = fs.readFileSync("src/components/MobileHeaderMenu.tsx", "utf8");
  assert.match(mobileMenu, /profilePhotoSrc\(user\?\.photoURL\)/);
});
