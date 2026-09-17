// tests/coursePlayerOfficialAiScopeRuntime.test.mjs
//
// The bug this test exists to keep dead: a learner with a paid course opened a
// module, asked the Course Player's AI anything, and was told the module was not
// available to them. Their access was fine — the *scope* was not. An official
// module id (`mod_<base36>`, minted by the admin) passed `isValidPersonalId`, so
// the ask was routed into the personal-module resolver, looked under
// `users/{uid}/personalCourseModules`, missed, and answered
// `404 MODULE_NOT_FOUND — "That module isn't available to this account."`
//
// So this drives the REAL handler, with an in-memory Firestore, for a real
// course product — and checks the three things that must be true:
//
//   · an official lesson resolves to its files instead of erroring;
//   · exactly the files the Course Player would let THIS learner open are read
//     (expectations computed from utils/courseAccess.js itself, never hardcoded,
//     so the two can never drift into different definitions of "accessible");
//   · a learner without access gets an answer grounded in nothing rather than a
//     peek into a module they have not unlocked.
//
// Run: node --test tests/coursePlayerOfficialAiScopeRuntime.test.mjs

import nodeTest from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-course-ai-official-scope");
const STUB = path.join(OUT_DIR, "firebaseAdminStub.mjs");
const OUT = path.join(OUT_DIR, "personalAi.mjs");

/* ── an in-memory Firestore, just enough for the scope + content reads ── */
const writeStub = () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(STUB, `
const store = new Map();
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const matches = (path, prefix) => (prefix ? path.startsWith(prefix + "/") || path === prefix : true);

class Query {
  constructor(predicate) { this.predicate = predicate; }
  where(field, op, value) {
    const previous = this.predicate;
    return new Query((data) => previous(data) && (op === "==" ? data?.[field] === value : true));
  }
  limit() { return this; }
  orderBy() { return this; }
  async get() {
    const rows = [];
    for (const [key, data] of store.entries()) {
      if (!matches(key, this.prefix) || !this.predicate(data)) continue;
      rows.push({ id: key.split("/").pop(), path: key, data: () => clone(data), ref: { path: key } });
    }
    return { docs: rows, size: rows.length, empty: rows.length === 0 };
  }
}

class Col extends Query {
  constructor(p) { super(() => true); this.path = p; this.prefix = p; }
  doc(id) { return new Doc(id ? \`\${this.path}/\${id}\` : \`\${this.path}/auto\`); }
}

class Doc extends Query {
  constructor(p) { super(() => true); this.path = p; }
  collection(name) { return new Col(\`\${this.path}/\${name}\`); }
  async get() {
    const data = store.get(this.path);
    return { exists: data !== undefined, id: this.path.split("/").pop(), ref: this, data: () => clone(data) };
  }
  async set(data, opts) {
    const prev = opts && opts.merge ? store.get(this.path) || {} : {};
    store.set(this.path, { ...clone(prev), ...clone(data) });
    return { writeTime: { seconds: Math.floor(Date.now() / 1000) } };
  }
  async update(data) {
    store.set(this.path, { ...clone(store.get(this.path) || {}), ...clone(data) });
    return {};
  }
}

export const db = {
  __store: store,
  collection(name) { const col = new Col(name); col.prefix = name; return col; },
  async runTransaction(cb) {
    return cb({
      get: (ref) => ref.get(),
      set: (ref, data, opts) => ref.set(data, opts),
      update: (ref, data) => ref.update(data),
      delete: (ref) => ref.delete(),
    });
  },
};

export function adminDb() { return db; }
export function errorResponse(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}
export async function requireFirebaseUser(req) { return { uid: req.__uid || "learner-1" }; }
export const FieldValue = { arrayUnion: (value) => value, increment: (value) => value };
export const Timestamp = { now: () => ({ toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000) }) };
export const parseProductPricePaise = () => 0;
`);
};

let personalAi = null;
let store = null;
let loadError = null;
try {
  const esbuildPkg = path.join(ROOT, "node_modules/esbuild");
  if (!fs.existsSync(esbuildPkg)) throw new Error("esbuild is not installed — run pnpm install");
  writeStub();
  const { build } = await import(pathToFileURL(path.join(esbuildPkg, "lib/main.js")).href);
  await build({
    entryPoints: [path.join(ROOT, "api/_lib/personalAi.ts")],
    outfile: OUT,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    logLevel: "silent",
    plugins: [{
      name: "in-memory-firestore",
      setup(build) {
        build.onResolve({ filter: /firebaseAdmin\.js$/ }, () => ({ path: "./firebaseAdminStub.mjs", external: true }));
      },
    }],
  });
  const stub = await import(pathToFileURL(STUB).href);
  store = stub.db.__store;
  personalAi = await import(pathToFileURL(OUT).href);
} catch (error) {
  loadError = error;
}

const skip = { skip: Boolean(loadError) || !personalAi };

/*
 * Every case shares one in-memory store (the handler and the expectations both
 * read it), so the cases must not interleave: node:test runs async top-level
 * tests concurrently, and a `seed()` from the next case would clear the store
 * underneath the one still awaiting a Firestore read. `solo` chains each test
 * onto the previous one — and keeps the failure message pointed at the case
 * that actually broke.
 */
let queue = Promise.resolve();
const solo = (fn) => (...args) => {
  const run = queue.then(() => fn(...args));
  queue = run.catch(() => {});
  return run;
};
const test = (name, options, fn) => nodeTest(name, options, typeof options === "function" ? options : solo(fn));

/* ── the fixture: one course, one learner, one paid update ─────────────── */

const PRODUCT_ID = "product-1";

const courseProduct = () => ({
  id: PRODUCT_ID,
  title: "Physics 201 — Electromagnetic Induction",
  courseContent: [
    {
      id: "mod_a",
      title: "Induction",
      accessLevel: "included",
      files: [
        { id: "file_pdf", name: "Chapter 4 notes", type: "pdf", url: "https://files.example.test/ch4.pdf" },
        { id: "file_doc", name: "Lesson handout", type: "doc", url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit" },
        { id: "file_brain", name: "Induction practice set", type: "brain", practiceQuestions: [{ id: "q1", prompt: "State Faraday's law in one line.", options: ["EMF equals minus N times the rate of change of flux", "EMF equals the current times the resistance"], correctIndex: 0, explanation: "A changing flux through N turns induces an EMF of minus N dphi/dt.", topic: "Induction", difficulty: "medium" }] },
        { id: "file_hidden", name: "Draft deck", type: "slides", accessLevel: "hidden", url: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit" },
      ],
      modules: [
        {
          id: "mod_a_update",
          title: "Generators (paid update)",
          accessLevel: "paidUpdate",
          paidUpdateId: "upd_1",
          files: [{ id: "file_update_pdf", name: "Generators notes", type: "pdf", accessLevel: "paidUpdate", paidUpdateId: "upd_1", url: "https://files.example.test/generators.pdf" }],
        },
      ],
    },
  ],
});

function seed(overrides = {}) {
  store.clear();
  store.set(`siteProducts/${PRODUCT_ID}`, courseProduct());
  store.set(`users/${overrides.uid || "learner-1"}`, {
    uid: overrides.uid || "learner-1",
    purchasedProductIds: overrides.purchasedProductIds ?? [PRODUCT_ID],
    ...(overrides.purchasedProductUpdateIds ? { purchasedProductUpdateIds: overrides.purchasedProductUpdateIds } : {}),
  });
  if (overrides.extra) for (const [key, value] of Object.entries(overrides.extra)) store.set(key, value);
}

function fakeRes() {
  const out = { status: 0, body: null };
  const res = {
    setHeader() { return res; },
    status(code) { out.status = code; return res; },
    json(body) { out.body = body; return res; },
    end() { return res; },
    send(body) { out.body = body; return res; },
  };
  return { res, out };
}

/** One Course Player "what can you read here?" call. */
async function askContext(body, uid = "learner-1") {
  const { res, out } = fakeRes();
  await personalAi.handlePersonalAi({ method: "POST", headers: {}, __uid: uid, body }, res);
  return out;
}

const coursePlayerAsk = (extra = {}) => ({
  action: "personalAi.context",
  courseContext: {
    productId: PRODUCT_ID,
    courseTitle: "Physics 201",
    moduleId: "mod_a",
    official: true,
    ...extra,
  },
  ...extra.bodyExtras,
});

/* ── expectations come from the pipeline itself, never from a hardcoded list ── */

/*
 * What the Course Player would actually offer this learner to open:
 * the product's own catalog mapping (which applies the URL-only rule — a file
 * with no usable link is not in the course for anybody) intersected with
 * `resolveCourseAccess`. The AI must read exactly this set, so the test computes
 * it the same way the product does instead of inventing a second definition.
 */
const expectedFileNames = async (overrides = {}) => {
  const { firestoreToCatalogProduct } = await import("../utils/productMapping.js");
  const { resolveCourseAccess } = await import("../utils/courseAccess.js");
  const catalog = firestoreToCatalogProduct(courseProduct(), PRODUCT_ID);
  const resolution = resolveCourseAccess({
    product: { id: PRODUCT_ID, courseContent: catalog.courseContent, canonicalModules: catalog.canonicalModules },
    ownedProductIds: overrides.ownedProductIds ?? [],
    ownedUpdateIds: overrides.ownedUpdateIds ?? [],
    ownedModuleIds: overrides.ownedModuleIds ?? [],
    ownedResourceIds: overrides.ownedResourceIds ?? [],
    subscriptionProductIds: [],
    subscriptionModuleIds: [],
    subscriptionResourceIds: [],
    requireBaseCourseForUpdate: true,
  });
  const names = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      const moduleOpen = resolution.accessibleModuleIds.has(String(node.id));
      for (const file of node.files || []) {
        if (String(file.accessLevel || "") === "hidden") continue;
        if (resolution.accessibleResourceIds.has(String(file.id)) || moduleOpen) names.push(String(file.name));
      }
      walk(node.modules || []);
    }
  };
  walk(catalog.courseContent || []);
  return names.sort();
};

/* Both helpers take the { status, body } envelope, like every case below. The
 * availability rows carry the hashed resource id only, so parity is compared by
 * the file NAME — which the fixture keeps unique, one row per file. */
const resourcesOf = (out) => out.body?.data?.resources || [];
const fileNames = (out) => resourcesOf(out).map((row) => row.name).sort();
const byName = (out) => new Map(resourcesOf(out).map((row) => [row.name, row]));

/* ── tests ─────────────────────────────────────────────────────────────── */

test("an official lesson resolves to its own files instead of a 404", skip, async () => {
  seed();
  const out = await askContext(coursePlayerAsk());
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  assert.notEqual(out.body.code, "MODULE_NOT_FOUND", "the learner owns this course — 'not available to this account' was the bug");

  const data = out.body.data;
  assert.ok(data.resources.length >= 3, `expected the module's files, got ${JSON.stringify(data.resources.map((row) => row.name))}`);
  assert.equal(data.scope.title, "Physics 201", "the answer is attributed to the course the learner is in");

  const rows = byName(out);
  assert.equal(rows.get("Chapter 4 notes").type, "pdf");
  // A PDF gets a real read plan, not "unsupported".
  assert.equal(rows.get("Chapter 4 notes").planKind, "pdf-bytes");
  assert.equal(rows.get("Lesson handout").planKind, "google-export");
  // The Brain set needs no permission — its questions are the content.
  assert.equal(rows.get("Induction practice set").planKind, "in-document");
  assert.equal(rows.get("Induction practice set").readable, true, "no link, nothing to fetch, still fully groundable");
  // `hidden` is not in the course for anybody.
  assert.equal(rows.has("Draft deck"), false, "a hidden draft must never reach the model through the AI");
  // Provenance names the course, so an answer is never mistaken for the
  // learner's own personal module.
  assert.match(rows.get("Chapter 4 notes").provenance, /Physics 201/);
});

test("the files the AI may read are exactly the files the player may open", skip, async () => {
  seed();
  const out = await askContext(coursePlayerAsk());
  assert.deepEqual(fileNames(out), await expectedFileNames({ ownedProductIds: [PRODUCT_ID] }),
    "the AI's scope and the player's openable list must be the same set — no peek, no false refusal");
});

test("buying the paid update widens nothing the player already allowed", skip, async () => {
  seed({ purchasedProductUpdateIds: { [PRODUCT_ID]: ["upd_1"] } });
  const out = await askContext(coursePlayerAsk());
  assert.deepEqual(fileNames(out), await expectedFileNames({ ownedProductIds: [PRODUCT_ID], ownedUpdateIds: ["upd_1"] }));
  assert.equal(byName(out).has("Generators notes"), true, "the update module's notes are groundable once the update is the learner's");
});

test("a learner who owns one module never gets the update module read for them", skip, async () => {
  // `mod_a` granted directly (no full product): the AI must read that module's
  // files and report — not read — the locked sub-module next door.
  seed({
    purchasedProductIds: [],
    extra: { "entitlements/ent_a": { uid: "learner-1", status: "active", kind: "module", moduleId: "mod_a" } },
  });
  const out = await askContext(coursePlayerAsk());
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const expected = await expectedFileNames({ ownedModuleIds: ["mod_a"] });
  assert.deepEqual(fileNames(out), expected, "module entitlement = that module's files, and nothing else");
  assert.equal(expected.includes("Generators notes"), false, "the resolver itself keeps the paid update closed");
  assert.equal(byName(out).has("Generators notes"), false, "so the AI never quotes it");
  // And it says so, instead of leaving the learner guessing whether "the AI
  // can't access my course" is a bug.
  assert.match(out.body.data.scopeNote || "", /sub-module/, JSON.stringify(out.body.data.scopeNote));
});

test("a file with no usable link is not groundable for anyone", skip, async () => {
  // The player's own URL-only rule drops this row, so the AI must drop it too —
  // the AI is never a second, more generous door into the course tree.
  seed();
  store.set(`siteProducts/${PRODUCT_ID}`, {
    ...courseProduct(),
    courseContent: [
      {
        ...courseProduct().courseContent[0],
        files: [...courseProduct().courseContent[0].files, { id: "file_map_nourl", name: "Untitled map", type: "mindmap" }],
      },
    ],
  });
  const out = await askContext(coursePlayerAsk());
  assert.equal(byName(out).has("Untitled map"), false, "not in the player, not in the AI's scope");
  assert.equal(fileNames(out).includes("Untitled map"), false);
  assert.deepEqual(fileNames(out), await expectedFileNames({ ownedProductIds: [PRODUCT_ID] }));
});

test("an account without the course gets an honest empty scope, not a peek", skip, async () => {
  seed({ purchasedProductIds: [] });
  const out = await askContext(coursePlayerAsk());
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body.data.resources, [], "no entitlement, no files read");
  assert.equal(out.body.data.coverage.readable, 0);
  // The expectation is stated in the answer's own terms — never as a crash and
  // never as a claim about the learner's purchase.
  assert.match(out.body.data.scopeNote || out.body.data.coverage.sentence, /.+/, "something honest is always reported");
});

test("a personal module ask keeps using the personal path", skip, async () => {
  seed();
  store.set("users/learner-1/personalCourseModules/mod_own1", {
    ownerUid: "learner-1",
    title: "My formula sheet",
    description: "Only mine",
    id: "mod_own1",
    createdAt: Date.now(),
  });
  store.set("users/learner-1/personalCourseModules/mod_own1/resources/res_1", {
    ownerUid: "learner-1",
    name: "My PDF",
    type: "pdf",
    url: "https://files.example.test/mine.pdf",
    sortOrder: 1,
  });
  const out = await askContext({ action: "personalAi.context", moduleId: "mod_own1" });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.data.scope.title, "My formula sheet");
  assert.equal(out.body.data.resources.length, 1);
  assert.match(out.body.data.resources[0].provenance, /My Module/, "personal content keeps personal provenance");
});

test("an official ask never leaks into another learner's personal namespace", skip, async () => {
  seed({ uid: "learner-1" });
  store.set("users/learner-2/personalCourseModules/mod_a", { ownerUid: "learner-2", title: "Someone else's module" });
  const out = await askContext(coursePlayerAsk(), "learner-2");
  // learner-2 does not own the product, so nothing is read; and `mod_a` is NOT
  // treated as their personal module just because the id collides.
  assert.equal(out.body.data.resources.length, 0, JSON.stringify(out.body.data));
  assert.notEqual(out.body.data.scope.title, "Someone else's module");
});
