// tests/appIconBuildSyncContract.test.mjs
//
// "Next uninstall ya new install karne per wahi latest updated icon dikhe" —
// the APK's launcher icon is a resource inside the APK, so the only honest way
// to honour that is to BAKE the live Branding logo into every build. That is
// what scripts/sync-android-icon.mjs does, and this pins the wiring so it cannot
// quietly stop running:
//
//   · both Android jobs run it BEFORE the web build / `cap sync android`;
//   · it can never fail a build (`continue-on-error` + an exit-0 catch);
//   · without credentials it says so and leaves the committed icons alone;
//   · it writes icons through scripts/generate-icons.cjs, so a brand-new logo
//     gets the same mask-safe geometry the shipped one has;
//   · the release job commits what changed (and only what changed) back, so the
//     web build and the next APK agree without anyone running a script by hand.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workflow = fs.readFileSync(".github/workflows/android-build.yml", "utf8");
const script = fs.readFileSync("scripts/sync-android-icon.mjs", "utf8");

test("both Android jobs bake the live branding logo into the app icon", () => {
  const runs = workflow.match(/run: node scripts\/sync-android-icon\.mjs/g) || [];
  assert.equal(runs.length, 2, "the debug AND the signed release job must sync the icon");
  // Before the web build, so the PWA icons it embeds are the same artwork.
  for (const job of ["build-apk", "build-release"]) {
    const start = workflow.indexOf(`\n  ${job}:`);
    assert.notEqual(start, -1, `${job} must exist`);
    const end = workflow.indexOf("\n  build-", start + 1);
    const body = workflow.slice(start, end === -1 ? undefined : end);
    const syncAt = body.indexOf("scripts/sync-android-icon.mjs");
    const webAt = body.indexOf("npm run build");
    const capAt = body.indexOf("npx cap sync android");
    assert.ok(syncAt !== -1 && webAt !== -1 && capAt !== -1, `${job} steps missing`);
    assert.ok(syncAt < webAt, `${job}: the icon must be synced before the web build`);
    assert.ok(syncAt < capAt, `${job}: …and before cap sync copies the assets into the APK`);
    assert.match(body, /name: Sync app icon from live branding\n\s+continue-on-error: true/);
    assert.match(body, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
  }
});

test("the release job commits regenerated icons, and only the icon paths", () => {
  assert.match(workflow, /name: Commit regenerated icons/);
  assert.match(workflow, /git status --porcelain -- public\/icons public\/branding resources android\/app\/src\/main\/res/);
  assert.match(workflow, /git add public\/icons public\/branding resources android\/app\/src\/main\/res\n/);
  assert.match(workflow, /git push$/m);
  // A no-op build must not create an empty commit (the loop-breaker).
  assert.match(workflow, /Icons already match the live branding — nothing to commit\./);
  // …and the commit must not re-trigger the whole pipeline.
  assert.match(workflow, /\[skip ci\]/);
  // Only main may push: the job already gates on that.
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)/);
});

test("the sync script is safe by construction", () => {
  // No credentials → explain and exit 0 (a local build must not fail).
  assert.match(script, /if \(!url\) skip\("no custom logo saved in Branding/);
  assert.match(script, /function skip\(reason\) \{[\s\S]*?process\.exit\(0\);/);
  // Any unexpected error is swallowed with a summary line, never a failed job.
  assert.match(script, /log\(`failed softly — /);
  assert.match(script, /process\.exit\(0\);/);
  // Only an absolute http(s) logo URL is considered at all.
  assert.match(script, /return typeof raw === "string" && \/\^https\?:\\\/\\\/\/i\.test\(raw\.trim\(\)\) \? raw\.trim\(\) : null;/);
  // Tiny/huge/HTML files are rejected before any icon is generated.
  assert.match(script, /file is larger than 12 MB/);
  assert.match(script, /not a raster image sharp can read/);
  assert.match(script, /too small \(under 64 px\)/);
  // The icons come from the ONE generator, so the geometry (and
  // tests/appIconSafeZone.test.mjs) applies to a brand-new logo too.
  assert.match(script, /const icons = require\("\.\/generate-icons\.cjs"\);/);
  assert.match(script, /await icons\.readGlyph\(normalised\)/);
  assert.match(script, /await icons\.build\(glyph, target\)/);
  // Nothing is touched when the bytes already match.
  assert.match(script, /async function writeIfChanged\(file, bytes\)/);
  assert.match(script, /if \(current && current\.equals\(bytes\)\) return false;/);
});

test("every one of those paths is committable (not git-ignored)", async () => {
  const { execFileSync } = await import("node:child_process");
  // `git check-ignore` exits 1 (and prints nothing) for a path that is NOT
  // ignored — which is exactly what these must be, or the auto-commit would
  // silently skip them.
  const checkIgnore = (file) => {
    try {
      return execFileSync("git", ["check-ignore", file], { encoding: "utf8" }).trim();
    } catch (error) {
      if (error.status === 1) return "";
      throw error;
    }
  };
  for (const file of [
    "public/icons/icon-512x512.png",
    "public/branding/logo-source.png",
    "resources/icon.png",
    "android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
    "android/app/src/main/res/values/brand_icon.xml",
  ]) {
    assert.equal(checkIgnore(file), "", `${file} must be committable for the auto-commit to work`);
  }
  // The Android keystore stays ignored — the rule this must not weaken.
  assert.ok(checkIgnore("android/app/release.jks").includes("release.jks"), "signing material must stay ignored");
});

test("the generator can verify itself, and the stamp is valid, greppable XML", async () => {
  const generator = fs.readFileSync("scripts/generate-icons.cjs", "utf8");
  assert.match(generator, /--check/);
  assert.match(generator, /icon file\(s\) differ from the master logo/);
  // The stamp is two short resources: the source host and the logo's hash.
  assert.match(script, /brand_icon_source_host/);
  assert.match(script, /brand_icon_source_sha256/);
  assert.match(script, /crypto\.createHash\("sha256"\)\.update\(normalised\)\.digest\("hex"\)\.slice\(0, 12\)/);
  assert.doesNotMatch(script, /<string name="brand_icon_source">\$\{url/, "the full URL must not bloat the resources");
  // The COVERAGE table is the single source of the geometry, and it is exported
  // for the tests.
  assert.match(generator, /module\.exports = \{ COVERAGE, DENSITIES/);
});
