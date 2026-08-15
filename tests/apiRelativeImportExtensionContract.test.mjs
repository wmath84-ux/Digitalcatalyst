// tests/apiRelativeImportExtensionContract.test.mjs
//
// Vercel compiles `api/**` to ESM and runs it under Node's real module
// resolver — there is no bundler to guess extensions. An extensionless
// relative import therefore builds fine locally and then dies in
// production with:
//
//   Cannot find module '/var/task/api/_lib/firebaseAdmin'
//   imported from /var/task/api/subscription-referral.js
//
// which is exactly how the referral endpoint broke. Rule: every
// relative import (static or dynamic) inside `api/` must end in `.js`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.join(__dirname, "..", "api");

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};

// `from "./x"` / `from '../x'` and `import("./x")`.
const STATIC_RE = /\bfrom\s+["'](\.[^"']*)["']/g;
const DYNAMIC_RE = /\bimport\s*\(\s*["'](\.[^"']*)["']\s*\)/g;

const offendersIn = (source) => {
  const bad = [];
  for (const re of [STATIC_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source))) {
      const spec = match[1];
      // Type-only imports are erased at build time and cannot break
      // the runtime resolver.
      const line = source.slice(source.lastIndexOf("\n", match.index) + 1, match.index + match[0].length);
      if (/^\s*import\s+type\b/.test(line)) continue;
      if (!spec.endsWith(".js")) bad.push(spec);
    }
  }
  return bad;
};

test("every relative import under api/ carries an explicit .js extension", () => {
  const failures = [];
  for (const file of walk(apiRoot)) {
    const bad = offendersIn(fs.readFileSync(file, "utf8"));
    if (bad.length) failures.push(`${path.relative(apiRoot, file)} → ${bad.join(", ")}`);
  }
  assert.deepEqual(
    failures,
    [],
    `extensionless relative imports break on Vercel:\n${failures.join("\n")}`,
  );
});

test("the referral endpoint that regressed imports firebaseAdmin with the extension", () => {
  const src = fs.readFileSync(path.join(apiRoot, "subscription-referral.ts"), "utf8");
  assert.match(src, /_lib\/firebaseAdmin\.js/);
  // Guard the import specifiers only — the file also mentions the bare
  // path inside the explanatory comment about the production failure.
  assert.deepEqual(offendersIn(src), []);
});
