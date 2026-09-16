#!/usr/bin/env node
// scripts/ensure-google-services.mjs
//
// Puts google-services.json where Gradle actually reads it.
//
// Why this exists: `android/app/google-services.json` is gitignored (it is a
// per-project credential file), while a reference copy IS committed at the repo
// root. android/app/build.gradle wraps the google-services plugin in a
// try/catch and only logs when the file is missing — so a build without it
// SUCCEEDS and produces an APK in which:
//
//   · `R.string.default_web_client_id` never exists → @capacitor-firebase/authentication
//     cannot request a Google ID token (the account picker never opens), and
//   · Firebase Messaging has no sender id → push notifications are dead too.
//
// The learner-visible symptom was "APK mein Google login par click karne se
// picker hi nahin khulta". This script makes that state impossible to build:
// it copies the root file into android/app/ when needed, and fails the build
// when no usable file exists anywhere.
//
// Run:  node scripts/ensure-google-services.mjs

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "android/app/google-services.json");
const fallback = path.join(root, "google-services.json");

const appId =
  (readFileSync(path.join(root, "capacitor.config.ts"), "utf8").match(/appId:\s*["']([^"']+)["']/) || [])[1] ||
  "app.eduvora.shop";

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const describeClient = (services) => {
  if (!services) return "file is not valid JSON";
  const clients = Array.isArray(services.client) ? services.client : [];
  const client = clients.find((entry) => entry?.client_info?.android_client_info?.package_name === appId);
  if (!client) {
    const found = clients.map((entry) => entry?.client_info?.android_client_info?.package_name).filter(Boolean);
    return `it has no client for package "${appId}"${found.length ? ` (it has: ${found.join(", ")})` : ""}`;
  }
  const oauth = Array.isArray(client.oauth_client) ? client.oauth_client : [];
  if (!oauth.some((entry) => entry?.client_type === 1)) {
    return "it has no Android OAuth client (client_type 1) — no SHA-1 fingerprint is registered for this app";
  }
  if (!oauth.some((entry) => entry?.client_type === 3)) {
    return "it has no web OAuth client (client_type 3) — Google ID token requests will fail";
  }
  return null;
};

if (!existsSync(path.join(root, "android/app"))) {
  console.error(
    "ensure-google-services: android/app does not exist yet — run `npx cap add android` (or `npx cap sync android`) first.",
  );
  process.exit(1);
}

const source = existsSync(target) ? target : existsSync(fallback) ? fallback : null;

if (!source) {
  console.error(
    [
      "ensure-google-services: google-services.json not found (looked in android/app/ and the repo root).",
      "",
      `  Firebase Console → Project settings → Your apps → Android app (${appId})`,
      "  → download google-services.json → save it at android/app/google-services.json",
      "",
      "Building without it produces an APK whose Google sign-in cannot open the",
      "account picker at all, and whose push notifications never register.",
    ].join("\n"),
  );
  process.exit(1);
}

if (source === fallback) {
  copyFileSync(fallback, target);
  console.log(`ensure-google-services: copied google-services.json → android/app/google-services.json`);
}

const problem = describeClient(readJson(target));
if (problem) {
  console.error(
    [
      `ensure-google-services: android/app/google-services.json is unusable — ${problem}.`,
      "",
      "  Fix it in Firebase Console → Project settings → Your apps, then RE-DOWNLOAD",
      "  the file and replace android/app/google-services.json.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`ensure-google-services: ok — Gradle will apply the google-services plugin for ${appId}.`);
