// tests/lumenChatCloudSyncContract.test.mjs
//
// "Course player ke andar jo AI chats hote hain vah save nahin ho rahe hain —
// cloud save hona chahiye, sync properly."
//
// ROOT CAUSE: the AI chat inside the Course Player (`src/lumen/App.tsx`) kept
// its entire conversation list in React state —
//
//     const [chats, setChats] = useState<Chat[]>(() => [{ id, title: "New chat", … }]);
//
// — and NOTHING else. No Firestore, no localStorage, no listener. A chat
// therefore survived only as long as the player stayed mounted: closing the
// course, reloading the page, or opening the same lesson on another device
// threw every question and answer away.
//
// THE FIX, pinned here:
//   1. one Firestore document per chat at `users/{uid}/aiChats/{chatId}`, read
//      through a LIVE listener, written from the client (so Firestore's offline
//      queue still protects a chat typed on a flaky connection);
//   2. `localStorage` demoted to the OFFLINE MIRROR it should always have been
//      (`src/lumen/chatStore.ts`), plus the last-open chat id;
//   3. ONE hook (`useLumenChats`) owns state, debounce, retry and the merge, so
//      the player never talks to Firestore directly;
//   4. `data:` image bytes are stripped before every write — a screenshot-heavy
//      chat must never march into Firestore's 1 MB document limit;
//   5. firestore.rules carries an owner-scoped `aiChats` block whose caps are
//      the SAME NUMBERS `utils/lumenChats.js` applies — asserted here by
//      parsing both files, so the client can never build a payload the rules
//      reject.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const app = read("src/lumen/App.tsx");
const hook = read("src/lumen/useLumenChats.ts");
const cloud = read("src/lumen/cloudChats.ts");
const mirror = read("src/lumen/chatStore.ts");
const rules = read("firestore.rules");

const chats = await import("../utils/lumenChats.js");

// ---------------------------------------------------------------------------
// 1. Chats live in Firestore, one document per chat, under the owner's path
// ---------------------------------------------------------------------------

test("chats are stored in users/{uid}/aiChats — one document per chat", () => {
  assert.equal(chats.LUMEN_CHATS_COLLECTION, "aiChats");
  assert.match(cloud, /collection\(db, "users", uid, LUMEN_CHATS_COLLECTION\)/);
  assert.match(cloud, /doc\(db, "users", owner, LUMEN_CHATS_COLLECTION, chat\.id\)/);
  assert.match(cloud, /onSnapshot\(/); // live, cross-device read
  assert.match(cloud, /where\("productId", "==", String\(productId\)\)/);
});

test("the player no longer keeps its history in React state only", () => {
  // The bug: `useState<Chat[]>` was the entire persistence strategy.
  assert.doesNotMatch(app, /useState<Chat\[\]>/);
  assert.match(app, /useLumenChats\(/);
  assert.match(app, /const \{\s*\n\s*chats,/);
  // And the hook itself is the one owner of that state.
  assert.match(hook, /useState<ChatView>/);
});

test("the offline mirror keeps the list (and the last-open chat) on the device", () => {
  assert.match(mirror, /eduvora\.lumenChats\.v1/);
  assert.match(mirror, /eduvora\.lumenChatActive\.v1/);
  assert.match(hook, /persistLocalChats\(/);
  assert.match(hook, /loadLocalChats\(/);
});

test("a save failure is never silent — the UI can name it and retry", () => {
  assert.match(cloud, /describeChatsError/);
  assert.match(cloud, /permission-denied/);
  assert.match(hook, /errorMessage: describeChatsError\(error\)/);
  assert.match(app, /chatSyncError/);
});

// ---------------------------------------------------------------------------
// 2. The stored payload: no inline image bytes, bounded, and honest status
// ---------------------------------------------------------------------------

test("normalizeLumenChat keeps the newest messages inside a document budget", () => {
  const many = Array.from({ length: 200 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `answer ${index}`,
    createdAt: 1000 + index,
    status: "complete",
  }));
  const stored = chats.normalizeLumenChat(
    { id: "chat-1", title: "Kinematics", course: "Physics", courseShort: "Physics", messages: many },
    { uid: "u1", productId: "42" },
  );
  assert.ok(stored);
  assert.equal(stored.messages.length, chats.MAX_MESSAGES_PER_CHAT);
  // The newest message is always kept; the oldest ones are the ones dropped.
  assert.equal(stored.messages[stored.messages.length - 1].id, "m199");
  assert.ok(!stored.messages.some((message) => message.id === "m0"));
});

test("data: image bytes are never written to Firestore", () => {
  const stored = chats.normalizeLumenChat({
    id: "chat-2",
    messages: [{
      id: "m1",
      role: "user",
      content: "see this screenshot",
      createdAt: 1,
      status: "complete",
      attachments: [
        { id: "a1", kind: "screenshot", name: "shot.jpg", src: "data:image/jpeg;base64,AAAAAAAAAAAAAAAA" },
        { id: "a2", kind: "upload", name: "real.png", src: "https://cdn.example.com/real.png" },
      ],
    }],
  }, { uid: "u1", productId: "42" });
  assert.ok(stored);
  const attachments = stored.messages[0].attachments || [];
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].src, "https://cdn.example.com/real.png");
});

test("a run that was still streaming is stored as complete, and empty answers are dropped", () => {
  const stored = chats.normalizeLumenChat({
    id: "chat-3",
    messages: [
      { id: "u1", role: "user", content: "what is velocity?", createdAt: 1, status: "complete" },
      { id: "a1", role: "assistant", content: "Velocity is…", createdAt: 2, status: "streaming" },
      { id: "a2", role: "assistant", content: "", createdAt: 3, status: "thinking", thinking: [{ label: "Reading", status: "active" }] },
    ],
  }, { uid: "u1", productId: "42" });
  assert.ok(stored);
  assert.equal(stored.messages.length, 2);
  assert.equal(stored.messages[1].status, "complete");
});

test("the chat id and product id are made Firestore-safe", () => {
  assert.equal(chats.sanitizeChatId("chat/../../evil id!!"), "chat-..-..-evil-id--");
  assert.ok(chats.sanitizeChatId("x".repeat(400)).length <= 80);
  const fresh = chats.newLumenChatId();
  assert.equal(chats.sanitizeChatId(fresh), fresh);
});

// ---------------------------------------------------------------------------
// 3. The merge: newest wins, device-only chats are uploaded, dirty ids win
// ---------------------------------------------------------------------------

test("a newer cloud copy wins, but an unacknowledged local edit is protected", () => {
  const cloudChat = { id: "c1", updatedAt: 200, messages: [{ id: "m1", text: "cloud" }] };
  const localChat = { id: "c1", updatedAt: 100, messages: [{ id: "m1", text: "local" }] };

  const cloudWins = chats.mergeLumenChatSets([cloudChat], [localChat]);
  assert.equal(cloudWins.chats[0].messages[0].text, "cloud");
  assert.deepEqual(cloudWins.pendingUploads, []);

  const localWins = chats.mergeLumenChatSets([cloudChat], [{ ...localChat, updatedAt: 300 }]);
  assert.equal(localWins.chats[0].messages[0].text, "local");
  assert.deepEqual(localWins.pendingUploads, ["c1"]);

  const protectedLocal = chats.mergeLumenChatSets([cloudChat], [localChat], ["c1"]);
  assert.equal(protectedLocal.chats[0].messages[0].text, "local");
});

test("a chat that only exists on the device is queued for upload", () => {
  const merged = chats.mergeLumenChatSets([], [{ id: "local-1", updatedAt: 5, messages: [] }]);
  assert.equal(merged.chats.length, 1);
  assert.deepEqual(merged.pendingUploads, ["local-1"]);
});

// ---------------------------------------------------------------------------
// 4. firestore.rules mirrors the client caps exactly
// ---------------------------------------------------------------------------

test("firestore.rules allows the owner to write their own aiChats documents", () => {
  assert.match(rules, /match \/aiChats\/\{chatId\} \{/);
  assert.match(rules, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(rules, /validLumenMessages\(request\.resource\.data\.messages\)/);
  assert.match(rules, /request\.resource\.data\.schemaVersion is int/);
  assert.match(rules, /request\.resource\.data\.productId\.size\(\) <= 120/);
});

test("the rules caps are the same numbers utils/lumenChats.js enforces", () => {
  const block = rules.slice(rules.indexOf("match /aiChats/"));
  const helper = rules.slice(rules.indexOf("function validLumenMessageAt"), rules.indexOf("function validSessionParentAt"));
  assert.match(helper, new RegExp(`messages\\.size\\(\\) <= ${chats.MAX_MESSAGES_PER_CHAT}`));
  assert.match(helper, new RegExp(`content\\.size\\(\\) <= ${chats.MAX_MESSAGE_CHARS}`));
  assert.match(helper, new RegExp(`id\\.size\\(\\) > 0`));
  assert.match(helper, new RegExp(`id\\.size\\(\\) <= 80`));
  assert.match(block, new RegExp(`title\\.size\\(\\) <= ${chats.MAX_TITLE_CHARS}`));
  assert.match(block, new RegExp(`course\\.size\\(\\) <= ${chats.MAX_COURSE_CHARS}`));
  assert.match(block, new RegExp(`productId\\.size\\(\\) <= ${chats.MAX_PRODUCT_ID_CHARS}`));
});

test("the hook cannot claim success before Firestore acknowledged it", () => {
  // "saved" is only published from the commit's success path.
  assert.match(hook, /publish\(scope, \{\s*\n\s*status: scope\.dirty\.size \|\| scope\.deleted\.size \? "saving" : "saved"/);
  // …and a cloud snapshot never downgrades an acknowledgement, nor upgrades one.
  assert.match(hook, /current\.status === "saved" \? "saved" : "ready"/);
});
