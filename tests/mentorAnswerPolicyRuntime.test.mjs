// tests/mentorAnswerPolicyRuntime.test.mjs
//
// The mentor's two promises, driven through the REAL `personalAi.ask` handler
// (bundled with esbuild against an in-memory Firestore) with a mocked provider:
//
//   1. NEVER A DEAD END — a question about the subject is answered from the
//      model's own knowledge when the open file has nothing on it. The system
//      prompt says so, an empty CONTENT block says so, and a reply that stops at
//      "it isn't in the file" gets exactly one correction (billed once).
//   2. ALWAYS THE LAYOUT — whatever the model sends back (fields, legacy
//      `{answer}`, Markdown in a string, plain text, cut-off JSON), the answer
//      leaves the server as Markdown that passes `validateMentorAnswer` for the
//      `format` it reports, and it is still structured after it is stored.
//
// The provider is the only thing faked; every line between the request and the
// response is the shipped code.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { MENTOR_FORMATS, validateMentorAnswer } from "../utils/mentorAnswer.js";

const require = createRequire(import.meta.url);
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-mentor-answer-runtime");
const STUB = path.join(OUT_DIR, "firebaseAdminStub.cjs");
const PERSONAL_AI_OUT = path.join(OUT_DIR, "personalAi.cjs");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(STUB, `
const store = new Map();
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

class Doc {
  constructor(p) { this.path = p; }
  collection(name) { return new Col(\`\${this.path}/\${name}\`); }
  async get() {
    const data = store.get(this.path);
    return { exists: data !== undefined, id: this.path.split("/").pop(), ref: this, data: () => clone(data) };
  }
  async set(data, opts) {
    const prev = opts && opts.merge ? store.get(this.path) || {} : {};
    store.set(this.path, { ...clone(prev), ...clone(data) });
    return {};
  }
  async update(data) { store.set(this.path, { ...clone(store.get(this.path) || {}), ...clone(data) }); return {}; }
  async delete() { store.delete(this.path); return {}; }
}

class Col {
  constructor(p) { this.path = p; }
  doc(id) { return new Doc(id ? \`\${this.path}/\${id}\` : \`\${this.path}/auto\`); }
  orderBy() { return this; }
  limit() { return this; }
  async get() {
    const prefix = this.path + "/";
    const docs = [];
    for (const key of store.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.includes("/")) continue;
      const ref = new Doc(key);
      docs.push({ id: rest, ref, exists: true, data: () => clone(store.get(key)) });
    }
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

const db = {
  __store: store,
  collection(name) { return new Col(name); },
  async runTransaction(cb) {
    return cb({
      get: (ref) => ref.get(),
      set: (ref, data, opts) => ref.set(data, opts),
      update: (ref, data) => ref.update(data),
      delete: (ref) => ref.delete(),
    });
  },
};

function adminDb() { return db; }
function errorResponse(res, status, code, message) { return res.status(status).json({ ok: false, code, message }); }
async function requireFirebaseUser(req) { return { uid: req.__uid || "learner-1" }; }

module.exports = { db, adminDb, errorResponse, requireFirebaseUser };
`);

let personalAi = null;
let store = null;
let loadError = null;
try {
  const esbuildPkg = path.join(ROOT, "node_modules/esbuild");
  if (!fs.existsSync(esbuildPkg)) throw new Error("esbuild is not installed");
  const { build } = await import(pathToFileURL(path.join(esbuildPkg, "lib/main.js")).href);
  // CJS, like Vercel runs it: the server graph pulls in CJS-only dynamic
  // requires (the Office readers) that cannot be lowered to static ESM imports.
  await build({
    entryPoints: [path.join(ROOT, "api/_lib/personalAi.ts")],
    outfile: PERSONAL_AI_OUT,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2022",
    logLevel: "silent",
    plugins: [{
      name: "in-memory-firestore",
      setup(b) {
        b.onResolve({ filter: /firebaseAdmin\.js$/ }, () => ({ path: "./firebaseAdminStub.cjs", external: true }));
      },
    }],
  });
  store = require(STUB).db.__store;
  personalAi = require(PERSONAL_AI_OUT);
} catch (error) {
  loadError = error;
}

after(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
});

const skip = personalAi ? false : `runtime unavailable: ${loadError?.message}`;
const TODAY = new Date().toISOString().slice(0, 10);

/* ── harness ───────────────────────────────────────────────────────────── */

function fakeRes() {
  const out = { status: 0, body: null };
  const res = {
    setHeader() {},
    status(code) { out.status = code; return res; },
    json(body) { out.body = body; return res; },
    end() { return res; },
    send(body) { out.body = body; return res; },
  };
  return { res, out };
}

const OWN = { source: "own", config: { provider: "openai", model: "own-model", apiKey: "test-own-key" } };

async function call(action, extra = {}) {
  const { res, out } = fakeRes();
  await personalAi.handlePersonalAi({
    method: "POST",
    headers: {},
    __uid: "learner-1",
    body: { action, courseContext: { productId: "product-1", courseTitle: "Physics 201", moduleTitle: "Induction", resourceName: "Notes.pdf", resourceType: "pdf" }, ...OWN, ...extra },
  }, res);
  return out;
}

const ask = (question, extra = {}) => call("personalAi.ask", { question, ...extra });

/** Script the provider: each entry is the raw text of one reply (or an object, JSON-encoded). */
function withProvider(replies, run) {
  const original = globalThis.fetch;
  const requests = [];
  let index = 0;
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    const content = typeof reply === "string" ? reply : JSON.stringify(reply);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  return Promise.resolve(run(requests)).finally(() => { globalThis.fetch = original; });
}

const systemOf = (request) => request.messages.find((m) => m.role === "system").content;
const userOf = (request) => request.messages.find((m) => m.role === "user").content;

const STEPS_REPLY = {
  lead: "Binary search finds a value in a sorted array by halving the range each step.",
  steps: [
    { title: "Set the pointers", detail: "lo = 0 and hi = len(arr) - 1." },
    { title: "Probe the middle", detail: "mid = (lo + hi) // 2, then compare arr[mid] with the target." },
    { title: "Discard half", detail: "Move lo past mid or hi before mid, then repeat until lo > hi." },
  ],
  pitfall: "The array must already be sorted.",
  grounded: false,
  sources: [],
  followUps: ["Quiz me on this"],
};

/* ── 1. never a dead end ───────────────────────────────────────────────── */

test("a file with no data still gets a full answer: the mentor is told to teach from its own knowledge", { skip }, async () => {
  await withProvider([STEPS_REPLY], async (requests) => {
    const out = await ask("How does binary search work?");
    assert.equal(out.status, 200, JSON.stringify(out.body));

    const system = systemOf(requests[0]);
    assert.match(system, /answer fully from your own expert knowledge/i);
    assert.match(system, /Never say that you cannot access/i);
    assert.doesNotMatch(system, /answer ONLY from the CONTENT/i, "the strict grounded-only prompt is what made it refuse");
    assert.doesNotMatch(system, /Never invent facts/i);

    const user = userOf(requests[0]);
    // The course has no readable file, so the model only sees the lesson's own
    // title brief — and is told that coverage is context, never a limit.
    assert.match(user, /COVERAGE \(context only — never a limit on what you may answer\): This module has no resources yet/);
    assert.doesNotMatch(user, /do not answer from memory/i);
    // Relevance can be judged: the model is told where the learner is.
    assert.match(user, /WHERE THE LEARNER IS: course "Physics 201" · module "Induction" · open file "Notes\.pdf" \(pdf\)/);
  });
});

test("a reply that stops at 'it isn't in the file' is corrected once, and billed once", { skip }, async () => {
  const refusal = { answer: "I'm sorry, but the provided content doesn't include information about binary search.", sources: [], grounded: false };
  await withProvider([refusal, STEPS_REPLY], async (requests) => {
    const out = await ask("How does binary search work?");
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal(requests.length, 2, "exactly one correction");
    assert.match(userOf(requests[1]), /REVISION NEEDED/);
    assert.match(userOf(requests[1]), /LEARNER'S QUESTION: How does binary search work\?/, "the correction carries the same question");
    assert.equal(out.body.data.attempts, 2);
    assert.match(out.body.data.answer, /halving the range/, "the learner sees the second answer, not the refusal");
    assert.doesNotMatch(out.body.data.answer, /I'm sorry|doesn't include/);
    assert.equal(out.body.data.format, "steps");
  });
});

test("the correction never loops: a second refusal is shown as-is after exactly two calls", { skip }, async () => {
  const refusal = { lead: "I can't access the file, so I cannot answer that.", grounded: false, sources: [] };
  await withProvider([refusal], async (requests) => {
    const out = await ask("How does binary search work?");
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal(requests.length, 2);
    assert.ok(validateMentorAnswer(out.body.data.answer, out.body.data.format).ok, "even a refusal keeps the layout");
  });
});

test("a correction on the school key is one metered request, not two", { skip }, async () => {
  const uid = "learner-1";
  store.set(`users/${uid}/aiUsage/current`, { dayKey: TODAY, dayCount: 0, stamps: [], tokensDayKey: TODAY, tokensUsedDay: 0, reservations: {} });
  store.set("settings/revisionCatalog", { aiSettings: { provider: "openai", model: "school-model", sharedApiKey: "test-school-key", allowancePolicy: "token-budget" } });
  store.delete("subscriptionFeatures/ai-mentor");
  const refusal = { answer: "This isn't covered in the module content.", grounded: false, sources: [] };
  await withProvider([refusal, STEPS_REPLY], async (requests) => {
    const out = await ask("How does binary search work?", { source: "default", config: undefined });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal(requests.length, 2);
    const ledger = store.get(`users/${uid}/aiUsage/current`);
    assert.equal(ledger.dayCount, 1, "one learner request = one allowance count, however many provider calls it took");
    assert.equal(Object.keys(ledger.reservations).length, 0);
    assert.ok(ledger.tokensUsedDay > 0);
  });
});

test("a correction that stalls is abandoned: the first reply stands and the request still completes", { skip }, async (t) => {
  // A provider can hang for 45 s; the platform kills the request at 60 s. The
  // correction is therefore capped, and what the learner already had is kept.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "I can't access the file, so I cannot answer that." }) } }] }), { status: 200 });
    }
    return new Promise(() => {}); // the correction never answers
  };
  try {
    const pending = ask("How does binary search work?");
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    for (let i = 0; i < 60 && !settled; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      t.mock.timers.tick(5_000);
    }
    assert.ok(settled, "the request must finish even though the correction never answered");
    const out = await pending;
    assert.equal(calls, 2);
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.match(out.body.data.answer, /can't access the file/, "the first reply stands");
    assert.equal(out.body.data.attempts, 1, "an abandoned correction produced nothing, so it is not billed to the learner");
  } finally {
    globalThis.fetch = original;
  }
});

test("an empty reply is released uncharged instead of shown as a blank bubble", { skip }, async () => {
  const uid = "learner-1";
  store.set(`users/${uid}/aiUsage/current`, { dayKey: TODAY, dayCount: 0, stamps: [], tokensDayKey: TODAY, tokensUsedDay: 0, reservations: {} });
  store.set("settings/revisionCatalog", { aiSettings: { provider: "openai", model: "school-model", sharedApiKey: "test-school-key", allowancePolicy: "token-budget" } });
  await withProvider([{}], async (requests) => {
    const out = await ask("How does binary search work?", { source: "default", config: undefined });
    assert.equal(out.body.code, "AI_EMPTY", JSON.stringify(out.body));
    assert.equal(requests.length, 2, "an empty reply also earns one correction");
    const ledger = store.get(`users/${uid}/aiUsage/current`);
    assert.equal(ledger.tokensUsedDay, 0, "nothing charged for a blank answer");
    assert.equal(Object.keys(ledger.reservations).length, 0);
  });
});

/* ── 2. always the layout ──────────────────────────────────────────────── */

test("fields from the model come back as the walkthrough layout, with the format named", { skip }, async () => {
  await withProvider([STEPS_REPLY], async () => {
    const out = await ask("How does binary search work?");
    const data = out.body.data;
    assert.equal(data.format, "steps");
    assert.equal(data.structure.requested, "steps");
    assert.equal(data.structure.delivered, "steps");
    assert.equal(data.structure.downgraded, false);
    assert.ok(validateMentorAnswer(data.answer, data.format).ok, data.answer);
    assert.match(data.answer, /### The walkthrough\n\n1\. \*\*Set the pointers\*\* — lo = 0/);
    assert.match(data.answer, /> \*\*Watch out:\*\* The array must already be sorted\./);
    assert.equal(data.grounded, false, "no readable file → the answer is honestly from general knowledge");
  });
});

test("every layout is reachable from a real question and validates", { skip }, async () => {
  const cases = [
    ["Summarise recursion briefly", "concise", { lead: "Recursion is a function calling itself on a smaller input.", points: ["It needs a base case.", "Each call shrinks the problem."] }],
    ["What is the difference between a stack and a queue?", "comparison", { lead: "Both hold items; they differ in removal order.", table: { columns: ["Aspect", "Stack", "Queue"], rows: [["Order", "LIFO", "FIFO"], ["Remove from", "Top", "Front"]] }, takeaway: "Use a stack to undo, a queue to wait in line." }],
    ["Give me a timeline of the French Revolution", "timeline", { lead: "Ten turbulent years.", events: [{ when: "1789", what: "The Bastille falls." }, { when: "1793", what: "The Terror begins." }] }],
    ["Write a python function for binary search", "code", { lead: "Iterative binary search.", code: { language: "python", source: "def bs(a, t):\n    lo, hi = 0, len(a) - 1\n    return -1" }, walk: ["Line 1 names the function."], pitfall: "hi must start at len(a) - 1." }],
    ["Explain photosynthesis", "deep-dive", { lead: "Plants turn light into sugar.", points: ["Light reactions make ATP.", "The Calvin cycle fixes CO2."], pitfall: "Oxygen comes from water, not CO2." }],
    ["Draw a diagram of the Calvin cycle", "visual", { lead: "The cycle as boxes.", diagram: "[CO2] --> [RuBP] --> [3-PGA]\n   ^                    |\n   +------[G3P]---------+", legend: [{ label: "RuBP", meaning: "The carbon acceptor." }] }],
    ["Quiz me on Newton's laws", "practice", { lead: "Three questions.", questions: [{ question: "Which law defines inertia?", options: ["First", "Second", "Third", "Fourth"], answer: "A", why: "An object keeps its motion unless a force acts." }] }],
    ["Give me feedback on my essay paragraph", "feedback", { lead: "A solid start.", strengths: ["Clear claim."], improvements: [{ issue: "Thin evidence", fix: "Add one statistic." }], nextStep: "Rewrite the opening line." }],
  ];
  for (const [question, expected, reply] of cases) {
    await withProvider([{ ...reply, grounded: false, sources: [] }], async () => {
      const out = await ask(question);
      assert.equal(out.status, 200, `${question}: ${JSON.stringify(out.body)}`);
      const data = out.body.data;
      assert.equal(data.format, expected, question);
      const check = validateMentorAnswer(data.answer, data.format);
      assert.ok(check.ok, `${question}\n${check.problems.join("\n")}\n${data.answer}`);
    });
  }
});

test("code keeps its indentation end to end (a per-line trim used to destroy it)", { skip }, async () => {
  await withProvider([{ lead: "Loop.", code: { language: "python", source: "for i in range(3):\n    if i:\n        print(i)" }, walk: ["The loop runs three times."] }], async () => {
    const out = await ask("Write a python function that loops");
    assert.match(out.body.data.answer, /```python\nfor i in range\(3\):\n    if i:\n        print\(i\)\n```/);
  });
});

test("a legacy `{answer}` reply is reshaped, and a one-liner passes through untouched", { skip }, async () => {
  await withProvider([{ answer: "A force changes motion.", sources: [], grounded: false }], async () => {
    const out = await ask("Summarise what a force is");
    assert.equal(out.body.data.answer, "A force changes motion.");
    assert.ok(validateMentorAnswer(out.body.data.answer, out.body.data.format).ok);
  });
  await withProvider([{ answer: "A force changes motion. It is measured in newtons. Newton's second law links force, mass and acceleration. Heavier objects need more force. Friction opposes motion." }], async () => {
    const out = await ask("How does a force work?");
    const data = out.body.data;
    assert.ok(validateMentorAnswer(data.answer, data.format).ok, data.answer);
    assert.match(data.answer, /### The walkthrough\n\n1\. /, "prose for a how-question becomes numbered steps, not a wall of text");
  });
});

test("Markdown the model wrote into a string is re-laid-out, not trusted", { skip }, async () => {
  const messy = "Photosynthesis has two stages.\n\n### Steps\n\n1. **Light reactions** — capture light\n2. **Calvin cycle** — fix CO2\n\n**Note:** oxygen comes from water.";
  await withProvider([{ answer: messy }], async () => {
    const out = await ask("Walk me through photosynthesis step by step");
    const data = out.body.data;
    assert.equal(data.format, "steps");
    assert.ok(validateMentorAnswer(data.answer, "steps").ok, data.answer);
    assert.match(data.answer, /### The walkthrough/);
  });
});

test("a damaged reply is repaired: plain text, raw newlines and cut-off JSON all become layouts", { skip }, async () => {
  const replies = [
    "Binary search halves the range each step. It only works on sorted data. You compare the middle element with the target.",
    '{"lead": "Binary search halves the range.\nIt needs sorted data.", "steps": [{"title": "Probe", "detail": "Check the middle."}]}',
    '{"lead": "Binary search halves the range.", "steps": [{"title": "Probe", "detail": "Check the middle."}, {"title": "Discard", "detail": "Drop the wrong half',
    '```json\n{"lead":"Fenced.","steps":[{"title":"Probe","detail":"Check the middle."}]}\n```',
  ];
  for (const reply of replies) {
    await withProvider([reply], async () => {
      const out = await ask("How does binary search work?");
      assert.equal(out.status, 200, `${reply}\n${JSON.stringify(out.body)}`);
      const data = out.body.data;
      assert.ok(data.answer.length > 10, reply);
      assert.ok(validateMentorAnswer(data.answer, data.format).ok, `${reply}\n→\n${data.answer}`);
      assert.doesNotMatch(data.answer, /[{}]|"lead"/, "braces never reach the learner");
    });
  }
});

test("the layout is chosen from the learner's words, not from the course's title", { skip }, async () => {
  await withProvider([STEPS_REPLY], async (requests) => {
    await ask("What is recursion?", { courseContext: { productId: "product-1", courseTitle: "Programming in Python: Steps, Timelines and Comparisons", moduleTitle: "How to code", resourceName: "Compare sorting.pdf" } });
    assert.match(userOf(requests[0]), /ANSWER FORMAT: DEEP DIVE/);
  });
});

test("a follow-up with no topic words borrows the previous question to find the right material", { skip }, async () => {
  await withProvider([STEPS_REPLY], async (requests) => {
    await ask("Quiz me on this", { history: [{ role: "user", text: "Explain photosynthesis and the calvin cycle" }, { role: "assistant", text: "Photosynthesis is..." }] });
    assert.match(userOf(requests[0]), /ANSWER FORMAT: PRACTICE SET/);
    assert.match(userOf(requests[0]), /EARLIER IN THIS CONVERSATION[\s\S]*Explain photosynthesis/);
  });
});

/* ── 3. stored answers keep their structure ────────────────────────────── */

test("a stored answer is still structured after the next question is asked", { skip }, async () => {
  store.set("users/learner-1/personalCourseModules/mod1", { ownerUid: "learner-1", id: "mod1", title: "Physics", description: "" });
  store.delete("users/learner-1/personalAi/threads/items/mod1");
  const scoped = { moduleId: "mod1", courseContext: undefined };
  await withProvider([STEPS_REPLY], async () => {
    const first = await ask("How does binary search work?", scoped);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    // `appendThread` re-saves the whole thread on every ask. Flattening on that
    // read used to destroy the layout of every earlier answer.
    const second = await ask("How does binary search work again?", scoped);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const thread = await call("personalAi.thread", scoped);
    assert.equal(thread.status, 200, JSON.stringify(thread.body));
    const assistant = thread.body.data.messages.filter((m) => m.role === "assistant");
    assert.equal(assistant.length, 2);
    for (const message of assistant) {
      assert.match(message.text, /### The walkthrough\n\n1\. \*\*Set the pointers\*\*/, "headings and numbered steps survive a reload");
      assert.ok(validateMentorAnswer(message.text, "steps").ok, message.text);
    }
  });
});

test("re-saving the thread never flattens an earlier answer (the newline-collapse regression)", { skip }, async () => {
  // Isolated from the new field schema on purpose: a plain multi-line reply,
  // asked twice. The second ask re-saves the thread through `loadThread`, which
  // used to fold every newline of every stored message into a space.
  store.set("users/learner-1/personalCourseModules/mod2", { ownerUid: "learner-1", id: "mod2", title: "Physics", description: "" });
  store.delete("users/learner-1/personalAi/threads/items/mod2");
  const scoped = { moduleId: "mod2", courseContext: undefined };
  const reply = { answer: "Two stages matter.\n\n- Light reactions make ATP.\n- The Calvin cycle spends it.", grounded: false, sources: [] };
  await withProvider([reply], async () => {
    assert.equal((await ask("Summarise photosynthesis briefly", scoped)).status, 200);
    assert.equal((await ask("Summarise the calvin cycle briefly", scoped)).status, 200);
    const thread = await call("personalAi.thread", scoped);
    const first = thread.body.data.messages.find((m) => m.role === "assistant");
    assert.ok(first, "the earlier answer is still in the thread");
    assert.match(first.text, /Two stages matter\.\n\n- Light reactions make ATP\.\n- The Calvin cycle spends it\./);
  });
});

/* ── 4. "Explain again" follows the same policy ────────────────────────── */

test("Explain again teaches from knowledge when the files don't cover the concept", { skip }, async () => {
  store.set("users/learner-1/personalCourseModules/mod1", { ownerUid: "learner-1", id: "mod1", title: "Physics", description: "" });
  await withProvider([{ explanation: "Think of a force as a push or a pull.", keyPoint: "Force changes motion.", grounded: false, sources: [] }], async (requests) => {
    const out = await call("personalAi.generate", { kind: "explain", moduleId: "mod1", courseContext: undefined, question: "What is a force?", mode: "simple" });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.match(systemOf(requests[0]), /answer fully from your own expert knowledge/i);
    assert.match(userOf(requests[0]), /CONTENT:/);
    assert.doesNotMatch(userOf(requests[0]), /do not answer from memory/i);
  });
});

test("the generators keep the strict grounded-only prompt: a summary is never invented", { skip }, async () => {
  store.set("users/learner-1/personalCourseModules/mod1", { ownerUid: "learner-1", id: "mod1", title: "Physics", description: "Forces and motion, chapter 4." });
  await withProvider([{ overview: "Forces and motion.", keyConcepts: [], takeaways: ["Force changes motion."], sources: [] }], async (requests) => {
    const out = await call("personalAi.generate", { kind: "summary", moduleId: "mod1", courseContext: undefined, force: true });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.match(systemOf(requests[0]), /answer ONLY from the CONTENT block/i);
  });
});

test("every layout the detector can return is one the validator knows", () => {
  for (const format of MENTOR_FORMATS) {
    assert.equal(validateMentorAnswer("x", format).problems.some((p) => /unknown format/.test(p)), false, format);
  }
});
