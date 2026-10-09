// tests/myStudyLibraryAllAccountsContract.test.mjs
//
// "My Study Library keval mere developer admin account se hi chal raha hai aur
// dusre kisi account se nahin. Koi dusra apni email se agar login karta hai to
// vah chala hi nahin sakta."
//
// GUARANTEED ANALYSIS — why an admin-only feature is a RULES symptom
// ────────────────────────────────────────────────────────────────────────────
// firestore.rules ends with:
//
//     match /{document=**} { allow read, write: if isAdmin(); }
//
// `isAdmin()` is the developer's own account (wmath84@gmail.com + role=admin).
// That catch-all means the admin session can read and write EVERY path in the
// database, so any collection whose owner-scoped rule is missing — from the
// DEPLOYED rules, or from the file itself — works flawlessly for the developer
// and fails with `permission-denied` for every other learner. Nothing in the
// app checks a role for My Study Library (asserted below), which is how the
// symptom ends up looking like a client bug while the cause is a rules gap:
//
//   · `users/{uid}/myCourses` — the rule exists in this repo. If the copy
//     deployed to the project predates it, only the admin can open the shelf.
//     There was no mechanism that ever pushed firestore.rules to the project
//     (hosting had an automatic deploy; the rules did not).
//   · `entitlements` — the top-level collection `useCourseAccess` queries. It
//     had NO rule at all, so it fell through to the admin catch-all: the
//     developer saw purchased courses and every other learner was refused.
//     Now owner-scoped.
//
// THE FIX has two independent halves, both pinned here:
//   1. rules: `entitlements` gets an owner read rule, and a GitHub workflow
//      deploys firestore.rules / storage.rules on every push to main that
//      touches them — so the repo and the project can no longer drift.
//   2. a guaranteed server path: `/api/my-courses` (api/_lib/myCourses.ts)
//      authenticates the learner from their VERIFIED ID token and reads/writes
//      the same `users/{uid}/myCourses/{courseId}` documents with the Admin SDK,
//      which does not consult security rules. The client tries Firestore first
//      (live + offline queue) and falls back to the server on any
//      permission-denied / unauthenticated / failed-precondition — for the
//      listener, for saves and for deletes. My Study Library therefore works
//      for EVERY signed-in account regardless of what is deployed, and the fast
//      path returns by itself the moment Firestore answers again.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const rules = read("firestore.rules");
const serverRules = read("storage.rules");
const handler = read("api/_lib/myCourses.ts");
const mux = read("api/referral-leaderboard.ts");
const vercel = JSON.parse(read("vercel.json"));
const client = read("src/lib/myCourseClient.ts");
const hook = read("src/hooks/useMyCourses.ts");
const page = read("src/personal-library/StudyLibraryPage.tsx");
const shared = read("utils/myCourseDoc.js");
const clientTypes = read("src/types/myCourse.ts");
const workflow = read(".github/workflows/firebase-rules-deploy.yml");

const sharedDoc = await import("../utils/myCourseDoc.js");

// ---------------------------------------------------------------------------
// 1. Nothing in the client gates the library on a role
// ---------------------------------------------------------------------------

test("My Study Library has no admin-only gate anywhere in the client path", () => {
  const code = (source) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
  for (const source of [page, hook, client]) {
    assert.doesNotMatch(
      code(source),
      /isAdmin|role === "admin"|APPROVED_ADMIN_EMAIL|wmath84@gmail\.com/
    );
  }
  assert.match(page, /if \(!user\)/);
  assert.match(hook, /const uid = user\?\.id \|\| null;/);
});

// ---------------------------------------------------------------------------
// 2. Rules: owner-scoped paths for the library and course-access checks
// ---------------------------------------------------------------------------

test("firestore.rules keeps an owner-scoped rule for the learner's own courses", () => {
  const start = rules.indexOf("match /myCourses/{courseId} {");
  assert.ok(start > 0, "the myCourses rule is missing — the shelf would be admin-only");
  const block = rules.slice(start, start + 1400);
  assert.match(block, /allow read, delete: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(block, /allow create, update: if isOwner\(uid\)/);
  assert.match(block, /request\.resource\.data\.uid == uid/);
  assert.match(block, /request\.resource\.data\.schemaVersion is int/);
  // The rule sits under `match /users/{uid}`, so ownership comes from the path.
  assert.ok(rules.indexOf("match /users/{uid} {") < start);
});

test("entitlements is readable by its owner — it was falling through to the admin catch-all", () => {
  const start = rules.indexOf("match /entitlements/{entitlementId} {");
  assert.ok(start > 0, "no entitlements rule: only an admin could resolve owned courses");
  const block = rules.slice(start, start + 600);
  assert.match(
    block,
    /allow read: if isAdmin\(\)\n\s*\|\| \(signedIn\(\) && resource\.data\.uid == request\.auth\.uid\);/
  );
  // Writes stay server-only: no client may ever grant itself a course.
  assert.match(block, /allow write: if false;/);
  // Course access was silently refused for non-admins.
  assert.match(
    read("src/hooks/useCourseAccess.ts"),
    /query\(collection\(db, "entitlements"\), where\("uid", "==", uid\)\)/
  );
});

test("the admin catch-all is still the LAST rule, and the workflow keeps the rules deployed", () => {
  // The catch-all is what makes every gap admin-only; it stays (the admin
  // console needs it) but it must never be the only rule a learner's feature
  // relies on — hence the automatic deploy.
  const catchAll = rules.lastIndexOf("match /{document=**} {");
  assert.ok(catchAll > rules.indexOf("match /entitlements/{entitlementId} {"));
  assert.ok(catchAll > rules.indexOf("match /notes/{noteId} {"));
  assert.match(rules.slice(catchAll), /allow read, write: if isAdmin\(\);/);

  assert.match(workflow, /name: Deploy Firebase rules/);
  assert.match(workflow, /firestore\.rules/);
  assert.match(workflow, /--only firestore:rules,firestore:indexes,storage:rules/);
  assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
  assert.match(workflow, /--project my-website-761e9/);
  // Storage already lets any signed-in learner write the community bucket the
  // cover / resource uploads use — that half was never admin-only.
  assert.match(
    serverRules,
    /match \/community\/\{allPaths=\*\*\} \{\n\s*allow read, write: if signedIn\(\);/
  );
});

// ---------------------------------------------------------------------------
// 3. The guaranteed server path
// ---------------------------------------------------------------------------

test("the server handler authorises from the VERIFIED token, never from the body", () => {
  assert.match(handler, /const \{ uid \} = await requireFirebaseUser\(req\);/);
  assert.match(
    handler,
    /db\.collection\("users"\)\.doc\(uid\)\.collection\(MY_COURSES_COLLECTION\)/
  );
  // The Admin SDK path still enforces the caps: rules are bypassed, so this
  // module is the only thing standing between a browser and a 1 MB document.
  assert.match(handler, /sanitizeMyCourseDoc\(uid, body\.course\)/);
  assert.doesNotMatch(handler, /String\(body\.uid\)/);
  assert.match(handler, /action === "myCourses\.list"/);
  assert.match(handler, /action === "myCourses\.save"/);
  assert.match(handler, /action === "myCourses\.delete"/);
  // Delete is scoped by the path (built from the token's uid) and rejects the
  // ids Firestore reserves, exactly like `sanitizeMyCourseDoc` does on save.
  assert.match(handler, /const courseId = text\(body\.courseId\)\.slice\(0, 80\);/);
  assert.match(handler, /code: "MISSING_COURSE_ID"/);
  assert.match(handler, /if \(courseId\.startsWith\("__"\)\) \{/);
  assert.match(handler, /code: "INVALID_COURSE_ID"/);
  assert.doesNotMatch(handler, /collection\(MY_COURSES_COLLECTION\)\.doc\(String\(body\./);
  // An unknown action is answered as THIS feature — never as leaderboard data
  // (the failure mode tests/studyLibraryApiDispatchContract.test.mjs pins).
  assert.match(handler, /code: action \? "UNKNOWN_ACTION" : "MISSING_ACTION"/);
});

test("the route is a rewrite onto the deployed function, not a 13th serverless entry", () => {
  const rewrite = vercel.rewrites.find((entry) => entry.source === "/api/my-courses");
  assert.ok(rewrite, "/api/my-courses must be rewritten onto the shared function");
  assert.equal(rewrite.destination, "/api/referral-leaderboard");
  assert.match(mux, /"my-courses",/);
  assert.match(mux, /"my-courses": "My Study Library \(cloud sync\)"/);
  assert.match(mux, /if \(action\.startsWith\("myCourses\."\)\)/);
  assert.match(mux, /return await handleMyCourses\(req, res\);/);
  assert.match(mux, /import \{ handleMyCourses \} from "\.\/_lib\/myCourses\.js";/);
  // The Hobby plan caps the project at 12 functions: a rewrite adds none.
  const entries = read("vercel.json").match(/"source": "\/api\//g) || [];
  assert.ok(entries.length > 0);
});

// ---------------------------------------------------------------------------
// 4. The client falls back on every read and write
// ---------------------------------------------------------------------------

test("a refused Firestore listener switches the shelf to the server path", () => {
  assert.match(client, /export const isMyCoursesFirestoreBlocked = \(error: unknown\): boolean =>/);
  assert.match(client, /"permission-denied",\n\s*"unauthenticated",\n\s*"failed-precondition",/);
  assert.match(
    client,
    /if \(isMyCoursesFirestoreBlocked\(error\)\) \{\n[\s\S]{0,220}startApiFallback\(error\);/
  );
  assert.match(client, /export function subscribeMyCoursesViaApi\(/);
  assert.match(
    client,
    /export async function listMyCoursesViaApi\(uid: string\): Promise<MyCourse\[\]>/
  );
  // The fallback polls, and refreshes at once when the device comes back.
  assert.match(client, /window\.addEventListener\("online", onOnline\);/);
  assert.match(client, /intervalMs = 15000,/);
});

test("saves and deletes fall back too, so a refused rule can never lose a course", () => {
  // saveMyCourse
  const save = client.slice(
    client.indexOf("export async function saveMyCourse"),
    client.indexOf("/**\n * One-shot read")
  );
  assert.match(save, /await setDoc\(courseRef\(uid, clean\.id\), payload, \{ merge: true \}\);/);
  assert.match(save, /if \(!isMyCoursesFirestoreBlocked\(error\)\) throw error;/);
  assert.match(
    save,
    /await myCoursesApi<\{ course\?: unknown \}>\(\{ action: "myCourses\.save", course: clean \}\);/
  );
  // deleteMyCourse
  const remove = client.slice(client.indexOf("export async function deleteMyCourse"));
  assert.match(remove, /action: "myCourses\.delete", courseId/);
  // fetchMyCourses (the player's "Save for later" one-shot read)
  const fetch = client.slice(
    client.indexOf("export async function fetchMyCourses"),
    client.indexOf("export async function deleteMyCourse")
  );
  assert.match(fetch, /return listMyCoursesViaApi\(uid\);/);
});

test("the fast path returns by itself once Firestore is allowed again", () => {
  // Sticky flag: after one refusal the next mount does not pay for another.
  assert.match(client, /let firestoreRefusedThisSession = false;/);
  assert.match(client, /if \(firestoreRefusedThisSession\) startApiFallback\(null\);/);
  // …and a Firestore snapshot clears it and stops the polling fallback.
  assert.match(
    client,
    /if \(stopApi\) \{\n\s*stopApi\(\);\n\s*stopApi = null;\n\s*\}\n\s*firestoreRefusedThisSession = false;/
  );
  assert.match(
    client,
    /export const myCoursesUsingServerPath = \(\): boolean => firestoreRefusedThisSession;/
  );
  // A refusal is recorded with a timestamp, and a one-shot read re-tests
  // Firestore once it goes stale — so the fast path returns even for a learner
  // who never reopens the shelf (the listener above is not running).
  assert.match(
    client,
    /const markFirestoreRefused = \(\): void => \{[\s\S]{0,140}firestoreRefusedAt = Date\.now\(\);/
  );
  assert.match(
    client,
    /const firestoreRefusedRecently = \(\): boolean =>\n\s*firestoreRefusedThisSession && Date\.now\(\) - firestoreRefusedAt < FIRESTORE_REFUSED_RETRY_MS;/
  );
  assert.match(client, /if \(firestoreRefusedRecently\(\)\) return listMyCoursesViaApi\(uid\);/);
  assert.equal(client.match(/markFirestoreRefused\(\);/g)?.length, 4);
});

test("the learner is told what actually refused, in words they can act on", () => {
  assert.match(client, /export const describeMyCoursesError = \(error: unknown\): string =>/);
  assert.match(
    hook,
    /import \{\n\s*deleteMyCourse,\n\s*describeMyCoursesError,\n\s*saveMyCourse,\n\s*subscribeMyCourses,\n\} from "\.\.\/lib\/myCourseClient";/
  );
  assert.match(hook, /setError\(describeMyCoursesError\(nextError\)\);/);
  assert.equal(hook.match(/describeMyCoursesError\(writeError\)/g)?.length, 2);
  // Firestore's own text must never reach the learner again.
  assert.doesNotMatch(
    hook,
    /setError\(nextError\.message \|\| "Your library could not be loaded\."\);/
  );
});

// ---------------------------------------------------------------------------
// 5. One shared document shape — the server and the browser cannot drift
// ---------------------------------------------------------------------------

test("the server's caps are the client's caps", () => {
  const clientCap = (name) => {
    const match = clientTypes.match(new RegExp(`export const ${name} = (\\d+);`));
    assert.ok(match, `src/types/myCourse.ts no longer declares ${name} as a plain number`);
    return Number(match[1]);
  };
  for (const name of [
    "MY_COURSE_TITLE_MAX",
    "MY_COURSE_DESC_MAX",
    "MY_MODULE_TITLE_MAX",
    "MY_MODULE_DESC_MAX",
    "MY_RESOURCE_NAME_MAX",
    "MY_RESOURCE_DESC_MAX",
    "MY_COURSE_MAX_MODULES",
    "MY_COURSE_MAX_RESOURCES",
    "MY_COURSE_MAX_DEPTH",
  ]) {
    assert.equal(
      sharedDoc[name],
      clientCap(name),
      `${name} drifted between the server and the client`
    );
  }
  assert.equal(sharedDoc.MY_COURSE_SCHEMA_VERSION, 1);
  assert.equal(sharedDoc.MY_COURSES_COLLECTION, "myCourses");
  assert.match(client, /export const MY_COURSES_COLLECTION = "myCourses";/);
});

test("the rules' caps are the shared caps too", () => {
  const start = rules.indexOf("match /myCourses/{courseId} {");
  const block = rules.slice(start, start + 1400);
  const titleCap = block.match(/request\.resource\.data\.title\.size\(\) <= (\d+)/);
  const descCap = block.match(/request\.resource\.data\.description\.size\(\) <= (\d+)/);
  const moduleCap = block.match(/request\.resource\.data\.modules\.size\(\) <= (\d+)/);
  assert.ok(titleCap && descCap && moduleCap, "the myCourses rule lost one of its caps");
  assert.equal(Number(titleCap[1]), sharedDoc.MY_COURSE_TITLE_MAX);
  assert.equal(Number(descCap[1]), sharedDoc.MY_COURSE_DESC_MAX);
  assert.equal(Number(moduleCap[1]), sharedDoc.MY_COURSE_MAX_MODULES);
});

// ---------------------------------------------------------------------------
// 6. Runtime: the server-side sanitiser
// ---------------------------------------------------------------------------

test("the server refuses to write without a verified uid or a course id", () => {
  assert.deepEqual(sharedDoc.sanitizeMyCourseDoc("", { id: "course_1" }).ok, false);
  assert.equal(sharedDoc.sanitizeMyCourseDoc("uid1", {}).code, "MISSING_COURSE_ID");
  // Firestore reserves ids wrapped in "__" — the same trap personalCourse hit.
  assert.equal(
    sharedDoc.sanitizeMyCourseDoc("uid1", { id: "__library__" }).code,
    "INVALID_COURSE_ID"
  );
});

test("the server sanitises the body uid away and writes the token's", () => {
  const result = sharedDoc.sanitizeMyCourseDoc("token-uid", {
    id: "course_1",
    uid: "somebody-else",
    title: "  Mine  ",
    modules: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.doc.uid, "token-uid");
  assert.equal(result.doc.title, "Mine");
  assert.equal(result.doc.schemaVersion, sharedDoc.MY_COURSE_SCHEMA_VERSION);
});

test("the tree is depth-, module- and resource-capped before it is written", () => {
  const deep = {
    id: "m0",
    title: "L0",
    modules: [
      {
        id: "m1",
        modules: [
          { id: "m2", modules: [{ id: "m3", modules: [{ id: "m4", title: "too deep" }] }] },
        ],
      },
    ],
  };
  const result = sharedDoc.sanitizeMyCourseDoc("uid1", { id: "course_1", modules: [deep] });
  assert.equal(result.ok, true);
  const depth = (module) =>
    1 + (module.modules || []).reduce((max, child) => Math.max(max, depth(child)), 0);
  assert.ok(depth(result.doc.modules[0]) <= sharedDoc.MY_COURSE_MAX_DEPTH);

  const many = Array.from({ length: 600 }, (_, index) => ({
    id: `m${index}`,
    resources: Array.from({ length: 3 }, (_, r) => ({
      id: `r${index}-${r}`,
      type: "youtube",
      url: "https://youtu.be/x",
    })),
  }));
  const capped = sharedDoc.sanitizeMyCourseDoc("uid1", { id: "course_2", modules: many });
  assert.equal(capped.ok, true);
  assert.ok(capped.doc.modules.length <= sharedDoc.MY_COURSE_MAX_MODULES);
  assert.ok(
    sharedDoc.countMyCourseResources(capped.doc.modules) <= sharedDoc.MY_COURSE_MAX_RESOURCES
  );
});

test("a cover too large for a Firestore document is refused with a real message", () => {
  const result = sharedDoc.sanitizeMyCourseDoc("uid1", {
    id: "course_3",
    coverImage: `data:image/jpeg;base64,${"A".repeat(sharedDoc.MY_COURSE_MAX_COVER_CHARS + 10)}`,
    modules: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "COVER_TOO_LARGE");
});
