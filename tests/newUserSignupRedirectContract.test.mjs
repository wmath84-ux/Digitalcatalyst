import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync("src/context/AuthContext.tsx", "utf8");
const form = fs.readFileSync("src/components/auth/AuthForm.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");

test("auth failures preserve Firebase error code for safe routing", () => {
  assert.match(auth, /code\?: string/);
  assert.match(auth, /authErrorCode\(error\)/);
  assert.match(auth, /code: authErrorCode\(error\)/);
});

test("definite user-not-found login switches directly to signup", () => {
  assert.match(form, /result\.code === "auth\/user-not-found"/);
  assert.match(form, /setMode\("signup"\)/);
  assert.match(form, /नए users को पहले Sign Up करना होगा/);
  assert.match(form, /हमने Sign Up form खोल दिया है/);
});

test("ambiguous credential errors offer a clear way forward", () => {
  // The dedicated "New user? Sign Up" action was replaced by google-only
  // detection: a Google-created account has no password to check, so the
  // login surfaces the Google button instead of a dead-end credential error.
  assert.match(auth, /code === "auth\/invalid-credential" \|\| code === "auth\/wrong-password"/);
  assert.match(auth, /code: "auth\/google-only-account"/);
  assert.match(form, /result\.code === "auth\/google-only-account"\) setHighlightGoogle\(true\)/);
  assert.match(form, /data-auth-google data-highlight=\{highlightGoogle \|\| undefined\}/);
  assert.match(form, /setPassword\(""\)/);
});

test("learner/admin landing behavior remains intact", () => {
  // Landing is now the entry point for everyone in a browser; only an
  // installed mobile PWA goes straight to Home. This used to assert the
  // superseded "signed-in non-admin skips landing" rule.
  // The installed PWA and the native APK WebView both skip the landing.
  assert.match(main, /\(installedMobilePwa \|\| isNativeApp\(\)\) && landingRouteRequested/);
  // Admins stay exempt from the learner-only catalog splash.
  assert.match(main, /user\.role !== "admin" && catalogLoading/);
});
