#!/usr/bin/env node
// scripts/verify-google-signin.mjs
//
// Pre-flight check for native Google Sign-In in the Android build.
//
// The failure this exists to prevent is silent: without
// android/app/google-services.json (or with a file that has no Android OAuth
// client for the app's signing key), the APK compiles and installs perfectly
// and then throws ApiException: 10 (DEVELOPER_ERROR) the first time a learner
// taps "Continue with Google". Catching it at build time is much cheaper than
// catching it on a user's phone.
//
// Run:  node scripts/verify-google-signin.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];

const read = (relative) => {
  const full = path.join(root, relative);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
};

// ── 1. The plugin must be installed and registered with Gradle ─────────────
const pkg = JSON.parse(read("package.json") || "{}");
const pluginVersion =
  pkg.dependencies?.["@capacitor-firebase/authentication"] ||
  pkg.devDependencies?.["@capacitor-firebase/authentication"];
if (!pluginVersion) {
  problems.push("@capacitor-firebase/authentication is not in package.json — run: npm install @capacitor-firebase/authentication@7.5.0");
} else {
  notes.push(`plugin ${pluginVersion}`);
}

const settings = read("android/capacitor.settings.gradle") || "";
if (!settings.includes("capacitor-firebase-authentication")) {
  problems.push("android/capacitor.settings.gradle has no capacitor-firebase-authentication entry — run: npx cap sync android");
}

// ── 2. The Google dependencies must be switched on ─────────────────────────
const variables = read("android/variables.gradle") || "";
if (!/rgcfaIncludeGoogle\s*=\s*true/.test(variables)) {
  problems.push("android/variables.gradle must set `rgcfaIncludeGoogle = true`, otherwise the plugin's Google classes are compileOnly and sign-in throws NoClassDefFoundError at runtime.");
}

// ── 3. google-services.json must exist and describe THIS app ───────────────
const appId = (read("capacitor.config.ts") || "").match(/appId:\s*["']([^"']+)["']/)?.[1] || "app.eduvora.shop";

// The file Gradle actually reads is android/app/google-services.json. CI
// writes it there from a secret, and a repo-root copy is also kept as a
// checked-in reference, so accept either and say which one was used.
const servicesPath = existsSync(path.join(root, "android/app/google-services.json"))
  ? "android/app/google-services.json"
  : existsSync(path.join(root, "google-services.json"))
    ? "google-services.json"
    : null;
const servicesRaw = servicesPath ? read(servicesPath) : null;
if (servicesPath === "google-services.json") {
  notes.push("using the repo-root google-services.json (Gradle needs it at android/app/ at build time)");
}

if (!servicesRaw) {
  problems.push(
    `google-services.json not found (looked in android/app/ and the repo root). Download it from Firebase Console → Project settings → Your apps → Android app (${appId}).`,
  );
} else {
  let services;
  try {
    services = JSON.parse(servicesRaw);
  } catch {
    problems.push(`${servicesPath} is not valid JSON.`);
  }

  if (services) {
    const clients = services.client || [];
    const client = clients.find((entry) => entry?.client_info?.android_client_info?.package_name === appId);

    if (!client) {
      const found = clients.map((entry) => entry?.client_info?.android_client_info?.package_name).filter(Boolean);
      problems.push(
        `google-services.json has no client for package "${appId}"${found.length ? ` (it has: ${found.join(", ")})` : ""}. Add that Android app in Firebase and re-download the file.`,
      );
    } else {
      const oauth = client.oauth_client || [];
      const androidClients = oauth.filter((entry) => entry?.client_type === 1);
      const webClients = oauth.filter((entry) => entry?.client_type === 3);

      if (androidClients.length === 0) {
        problems.push(
          "google-services.json has no Android OAuth client (client_type: 1). This means NO SHA-1 fingerprint is registered for the app. Add the SHA-1 of every signing key (debug, release, and the Play App Signing key if you use it) under Firebase Console → Project settings → Your apps, then RE-DOWNLOAD google-services.json.",
        );
      } else {
        notes.push(`${androidClients.length} Android OAuth client(s) — SHA-1 registered`);
      }

      if (webClients.length === 0) {
        problems.push(
          "google-services.json has no web OAuth client (client_type: 3). The native plugin needs it to request an ID token. Enable Google as a sign-in provider in Firebase Console → Authentication → Sign-in method, then re-download the file.",
        );
      } else {
        notes.push("web OAuth client present — ID token requests will work");
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
if (notes.length) {
  console.log("Google Sign-In pre-flight:");
  for (const note of notes) console.log(`  ok   ${note}`);
}

if (problems.length === 0) {
  console.log("\nAll checks passed — native Google Sign-In is configured.");
  process.exit(0);
}

console.error(`\n${problems.length} problem(s) found:\n`);
for (const [index, problem] of problems.entries()) {
  console.error(`  ${index + 1}. ${problem}\n`);
}
console.error("See docs/android-google-signin.md for the full setup.");
process.exit(1);
