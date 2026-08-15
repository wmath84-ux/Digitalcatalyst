// tests/webpushEsmInteropContract.test.mjs
//
// Regression guard for the production outage:
//
//   curl: (22) The requested URL returned error: 500
//   {"ok":false,"error":"webpush.setVapidDetails is not a function"}
//
// `web-push` is CommonJS. Under Node's native ESM loader (Vercel's
// `"type": "module"` runtime), `import * as webpush from "web-push"`
// yields a namespace whose methods live on `.default`, so calling
// `webpush.setVapidDetails(...)` throws at runtime. Every API file must
// go through the `_lib/webpush.ts` shim instead of importing the package
// directly, and the shim must actually load callable functions.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const apiRoot = path.join(repoRoot, "api");

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};

test("no api file imports the web-push package directly", () => {
  const failures = [];
  for (const file of walk(apiRoot)) {
    const src = fs.readFileSync(file, "utf8");
    // A direct bare import/require of web-push bypasses the interop shim
    // and is exactly what regressed. The shim itself is the only file
    // allowed to touch the package name.
    // The shim itself is the single allowed importer of the package.
    if (file.endsWith(`${path.sep}_lib${path.sep}webpush.ts`)) continue;
    if (/[^\w]from\s+["']web-push["']/.test(src) || /require\(["']web-push["']\)/.test(src)) {
      failures.push(path.relative(repoRoot, file));
    }
  }
  assert.deepEqual(failures, [], "Import web-push via ./_lib/webpush.js, not directly.");
});

test("the interop shim exposes callable setVapidDetails and sendNotification", () => {
  const shim = fs.readFileSync(path.join(apiRoot, "_lib", "webpush.ts"), "utf8");
  assert.match(shim, /createRequire/);
  assert.match(shim, /setVapidDetails/);
  assert.match(shim, /sendNotification/);
});

test("the shim actually loads web-push and returns functions under native ESM", async () => {
  // Compile the shim with the same module settings Vercel uses, then
  // import it in a real Node ESM context — this is the exact condition
  // that failed in production.
  const outDir = fs.mkdtempSync(path.join(process.cwd(), ".wp-interop-"));
  try {
    execFileSync(
      "npx",
      [
        "tsc",
        path.join(apiRoot, "_lib", "webpush.ts"),
        "--module", "nodenext",
        "--moduleResolution", "nodenext",
        "--target", "ES2020",
        "--outDir", outDir,
        "--skipLibCheck",
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
    const emitted = path.join(outDir, "webpush.js");
    // Place the output where Node can resolve web-push from repo node_modules.
    const runnable = path.join(repoRoot, "api", "_lib", ".__interop-test.mjs");
    fs.copyFileSync(emitted, runnable);
    try {
      const mod = await import(runnable);
      assert.equal(typeof mod.setVapidDetails, "function", "setVapidDetails must be a function");
      assert.equal(typeof mod.sendNotification, "function", "sendNotification must be a function");
      assert.equal(typeof mod.generateVAPIDKeys, "function");
      const keys = mod.generateVAPIDKeys();
      assert.ok(keys.publicKey && keys.privateKey);
      assert.doesNotThrow(() =>
        mod.setVapidDetails("mailto:interop@example.com", keys.publicKey, keys.privateKey),
      );
    } finally {
      fs.rmSync(runnable, { force: true });
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
