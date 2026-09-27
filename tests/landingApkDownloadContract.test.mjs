import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const button = fs.readFileSync("src/components/landing/ApkDownloadButton.tsx", "utf8");
const hero = fs.readFileSync("src/components/landing/Hero.tsx", "utf8");
const cta = fs.readFileSync("src/components/landing/CtaBanner.tsx", "utf8");
const workflow = fs.readFileSync(".github/workflows/android-build.yml", "utf8");
const gradle = fs.readFileSync("android/app/build.gradle", "utf8");

test("both landing CTAs link directly to the stable public APK asset, not a login-only Actions ZIP", () => {
  const url = button.match(/https:\/\/github\.com\/wmath84-ux\/Digitalcatalyst\/releases\/download\/android-apk\/app-release\.apk/);
  assert.ok(url);
  assert.match(button, /href=\{LATEST_APK_URL\}/);
  assert.match(button, /Install APK/);
  assert.match(hero, /<ApkDownloadButton\s*\/>/);
  assert.match(cta, /<ApkDownloadButton large\s*\/>/);
  assert.doesNotMatch(button, /\/actions\/runs\//);
  assert.match(button, /fetch\(RELEASE_API_URL, \{ cache: "no-store" \}\)/);
  assert.match(button, /response\.status === 404/);
  assert.match(button, /APK is not published yet/);
});

test("main builds verify and publish a signed APK to that exact release asset", () => {
  assert.match(workflow, /build-release:[\s\S]*?if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /permissions:\s*\n\s*contents: write/);
  assert.match(workflow, /bundleRelease assembleRelease/);
  assert.match(workflow, /apksigner" verify --verbose/);
  assert.match(workflow, /gh release (?:upload|create) android-apk/);
  assert.match(workflow, /apk=android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
  assert.match(gradle, /versionCode \(System\.getenv\('ANDROID_VERSION_CODE'\) \?: '1'\)\.toInteger\(\)/);
});
