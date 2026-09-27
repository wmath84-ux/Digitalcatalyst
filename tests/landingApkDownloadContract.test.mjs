import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
});

test("the APK button downloads instead of only ever showing a message", () => {
  // A live (or merely unverified) release must fall through to the browser:
  // no preventDefault, so Save as / middle-click / Android all work too.
  assert.match(button, /if \(!notPublished\) return;/);
  assert.doesNotMatch(button, /window\.location\.assign/);
  assert.doesNotMatch(button, /APK is not published yet/);
  // The button label must not flip to a transient "Checking…" string.
  assert.doesNotMatch(button, /Checking APK/);
});

test("the availability probe is rate-limit tolerant and cached, and only a 404 blocks the download", () => {
  assert.match(button, /fetch\(RELEASE_API_URL, \{ cache: "no-store" \}\)/);
  assert.match(button, /response\.status === 404/);
  // Any other failure (403/429 rate limit, GitHub outage, offline) must stay
  // "unknown" and let the link through rather than blocking a working APK.
  assert.match(button, /if \(!response\.ok\) return \{ at, state: "unknown"/);
  assert.match(button, /catch \{\s*return \{ at, state: "unknown"/);
  // One probe per browser tab, not one per render or per visit.
  assert.match(button, /sessionStorage/);
  assert.match(button, /CACHE_TTL_MS/);
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

test("every workflow stays parseable YAML", () => {
  // A `key: "value" trailing` line is not YAML: the quoted scalar ends at its
  // second quote and the trailing words break the mapping. GitHub then refuses
  // to parse the workflow at all — the run fails with zero jobs created, so no
  // APK is ever built or published and the landing page button stays dead with
  // no clue why. Regression guard for android-build.yml's apksigner step.
  const dir = ".github/workflows";
  const offenders = [];
  for (const file of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    fs.readFileSync(path.join(dir, file), "utf8")
      .split("\n")
      .forEach((line, index) => {
        const match = line.match(/^\s*[\w-]+:\s*"[^"\n]*"\s+\S/);
        if (match) offenders.push(`${file}:${index + 1} ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], `unparseable quoted scalars:\n${offenders.join("\n")}`);

  // The apksigner invocation must stay a block scalar so the shell keeps the
  // quotes around the tool path.
  assert.match(workflow, /- name: Verify APK is signed\n\s*run: \|/);
});
