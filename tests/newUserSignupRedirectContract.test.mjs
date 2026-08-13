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

test("ambiguous credential errors offer a clear signup action", () => {
  assert.match(form, /New user\? Sign Up करें/);
  assert.match(form, /नए user हैं\? पहले Sign Up/);
  assert.match(form, /setPassword\(""\)/);
});

test("learner/admin landing behavior remains intact", () => {
  assert.match(main, /user\.role !== "admin" && landingRouteRequested/);
  assert.match(main, /user\.role === "admin"/);
});
