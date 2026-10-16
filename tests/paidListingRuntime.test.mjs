// tests/paidListingRuntime.test.mjs
//
// The course player's Paid page, proven at the level it actually runs at.
//
// Owner brief (2026-10-16):
//
//   "Paid page per jo bhi dikhaye ja rahe hain paid module vah baar-baar dikhaye
//    ja rahe hain, repeat ho rahe hain; ek hi baar dikhna chahiye. Aur lock
//    sabhi resources per nahin: agar folder hai to keval folder per ek baar, aur
//    alag-alag resources hai to sab per individual lock."
//
// Both rules live in ONE place — `src/course/paidListing.ts` — and the two
// builders the player uses (the paid page's folders and the flat row list) read
// it, so they can never disagree. This file drives that module directly (node
// strips the types), plus the course → product-page link both ends share:
//
//   · an update, a module and a resource are each listed ONCE;
//   · a paid module some published update already holds is NEVER a second row;
//   · a paid thing with contents is a folder (one lock on the head);
//   · a paid thing with nothing inside is one resource (its own lock);
//   · `#/product/<id>?tab=Paid&paid=<key>` is built and read identically on
//     both sides, and the way back is remembered once and consumed once.

import test from "node:test";
import assert from "node:assert/strict";
import { buildPaidEntries, modulePriceLabel, paidPriceLabel } from "../src/course/paidListing.ts";
import {
  buildPaidDeepLink,
  readPaidDeepLink,
  readPdpReturn,
  rememberPdpReturn,
  takePdpReturn,
} from "../src/utils/paidDeepLink.ts";

/* ── fixtures ────────────────────────────────────────────────────────────── */

const file = (id, name, extra = {}) => ({ id, name, type: "video", ...extra });
const module = (id, extra = {}) => ({ id, title: `Module ${id}`, files: [], modules: [], ...extra });

/** The course the owner's report described: one 3-module update, plus a lone
 *  locked resource, plus a paid module nobody's update holds. */
const course = () => ({
  updates: [
    { id: "upd-1", title: "July Update", price: 1299, coinPrice: 90, contentNames: ["Photosynthesis", "Respiration"] },
    { id: "upd-1", title: "July Update (duplicate row)", price: 1299, coinPrice: 90, contentNames: ["Photosynthesis"] },
    { id: "upd-locked", title: "August Update", price: 799, coinPrice: 40, contentNames: [] },
    { id: "upd-owned", title: "June Update", price: 499, coinPrice: 20, contentNames: ["Old stuff"] },
  ],
  modules: [
    module("m-1", {
      accessLevel: "paidUpdate",
      paidUpdateId: "upd-1",
      paidUpdateTitle: "July Update",
      paidUpdatePrice: "₹1,299",
      files: [file("f-1", "Photosynthesis video")],
    }),
    module("m-2", {
      accessLevel: "paidUpdate",
      paidUpdateId: "upd-owned",
      paidUpdateTitle: "June Update",
      files: [file("f-2", "Owned video")],
    }),
    module("m-3", {
      accessLevel: "paidUpdate",
      paidUpdateId: "upd-lone",
      paidUpdateTitle: "September Update",
      paidUpdatePrice: "₹499",
      files: [file("f-3", "Lone video"), file("f-4", "Lone notes")],
    }),
    module("m-4", {
      title: "Parent",
      modules: [module("m-4-1", { accessLevel: "paidUpdate", paidUpdateId: "upd-parent", files: [file("f-5", "Nested video")] })],
      files: [file("f-6", "A free file"), file("f-7", "Locked extra", { accessLevel: "paidUpdate", paidUpdateId: "upd-lone", paidUpdatePrice: "₹499" })],
    }),
    module("m-5", { title: "Free module", files: [file("f-8", "Free video")] }),
  ],
});

const build = (owned = []) => buildPaidEntries({
  updates: course().updates,
  modules: course().modules,
  ownedUpdateIds: new Set(owned),
});

/* ── 1 · nothing repeats ─────────────────────────────────────────────────── */

test("every paid thing is listed exactly once — never twice, never from its update as well", () => {
  const entries = build();
  const keys = entries.map((entry) => entry.paidKey);
  assert.equal(new Set(keys).size, keys.length, `duplicate rows: ${keys.join(", ")}`);
  // The owner's repeat: a paid module that a listed update already holds was
  // shown once inside the update AND again as its own folder. It is gone now.
  assert.ok(!keys.includes("module:m-1"), "m-1 is July Update's content, not a second row");
  // The duplicate update row (`upd-1` handed over twice) is one row.
  assert.equal(entries.filter((entry) => entry.id === "upd-1").length, 1);
  assert.deepEqual(keys, [
    "update:upd-1",       // the July update — its own module is inside it
    "update:upd-locked",  // priced, nothing inside → a single locked resource
    "update:upd-owned",   // not owned yet, so it is still on the page
    "module:m-3",         // a paid module no listed update holds
    "resource:f-7",       // a locked resource of its own, in course order
    "module:m-4-1",       // a nested one — depth carries, it is still one row
  ]);
  // Owned updates are off the page entirely — nothing to buy again.
  const owned = build(["upd-1", "upd-owned"]);
  assert.ok(!owned.some((entry) => entry.id === "upd-1"));
  assert.ok(!owned.some((entry) => entry.id === "m-2"), "an owned update's module is not listed either");
});

test("a listed folder swallows what is inside it — the ancestor rule", () => {
  const entries = buildPaidEntries({
    updates: [],
    modules: [
      module("outer", {
        accessLevel: "paidUpdate",
        paidUpdateId: "upd-x",
        files: [file("deep", "Inside the folder")],
        modules: [module("inner", { accessLevel: "paidUpdate", paidUpdateId: "upd-y", files: [file("deeper", "Deeper")] })],
      }),
    ],
    ownedUpdateIds: new Set(),
  });
  assert.deepEqual(entries.map((entry) => entry.paidKey), ["module:outer"]);
  // Its own contents come from the folder, so no inner row and no resource row
  // can repeat them.
  assert.deepEqual(entries[0].contents, ["Inside the folder"]);
});

/* ── 2 · where the lock goes ─────────────────────────────────────────────── */

test("a folder carries one lock; a lone resource carries its own", () => {
  const byKey = new Map(build().map((entry) => [entry.paidKey, entry]));
  // Folder: contents + the lock on the head.
  assert.equal(byKey.get("update:upd-1").lock, "folder");
  assert.deepEqual(byKey.get("update:upd-1").contents, ["Photosynthesis", "Respiration"]);
  assert.equal(byKey.get("module:m-3").lock, "folder");
  assert.deepEqual(byKey.get("module:m-3").contents, ["Lone video", "Lone notes"]);
  // Nothing inside → it is a resource, and its own lock is the only one.
  assert.equal(byKey.get("update:upd-locked").lock, "self");
  assert.deepEqual(byKey.get("update:upd-locked").contents, []);
  assert.equal(byKey.get("resource:f-7").lock, "self");
  assert.equal(byKey.get("resource:f-7").title, "Locked extra");
  // A hidden module never reaches the page (nor do its files).
  const withHidden = buildPaidEntries({
    updates: [],
    modules: [module("h", {
      accessLevel: "hidden",
      files: [file("hf", "Hidden file", { accessLevel: "paidUpdate", paidUpdateId: "upd-h" })],
    })],
    ownedUpdateIds: new Set(),
  });
  assert.deepEqual(withHidden, []);
});

/* ── 3 · prices, in the marks the page shows ────────────────────────────── */

test("prices are labelled the way the page and the product page write them", () => {
  assert.equal(paidPriceLabel(1299), "₹1,299");
  assert.equal(paidPriceLabel(0), "₹0");
  assert.equal(paidPriceLabel("₹499"), "₹499");
  assert.equal(paidPriceLabel("  "), null);
  assert.equal(paidPriceLabel(null), null);
  assert.equal(paidPriceLabel(undefined), null);
  const entries = build();
  const july = entries.find((entry) => entry.id === "upd-1");
  assert.equal(july.priceLabel, "₹1,299");
  // A module's own published price wins; its update's price is the fallback.
  const lone = entries.find((entry) => entry.paidKey === "module:m-3");
  assert.equal(modulePriceLabel(lone, course().updates), "₹499");
  const nested = entries.find((entry) => entry.paidKey === "module:m-4-1");
  assert.equal(nested.priceLabel, null);
  assert.equal(modulePriceLabel(nested, [
    { id: "upd-parent", title: "Parent update", price: 999, coinPrice: 0, contentNames: [] },
  ]), "₹999");
});

/* ── 4 · the link to the product page's paid section ────────────────────── */

test("the course link and the product page read the same address", () => {
  assert.equal(buildPaidDeepLink("course 7", "update:upd-1"),
    "#/product/course%207?tab=Paid&paid=update%3Aupd-1");
  assert.deepEqual(readPaidDeepLink("#/product/course-7?tab=Paid&paid=module:m-3"),
    { paidTab: true, paidKey: "module:m-3" });
  // Case is not the learner's problem, and the key is optional.
  assert.deepEqual(readPaidDeepLink("#/product/course-7?tab=paid"), { paidTab: true, paidKey: "" });
  // Any other tab is not this deep link.
  assert.deepEqual(readPaidDeepLink("#/product/course-7?tab=Curriculum"), { paidTab: false, paidKey: "" });
  assert.deepEqual(readPaidDeepLink("#/product/course-7"), { paidTab: false, paidKey: "" });
  // The product id itself is what `main.tsx` resolves, query and all.
  const hash = buildPaidDeepLink("course-7", "resource:f-7");
  assert.equal(hash.slice("#/product/".length).split("?")[0], "course-7");
});

test("the way back to the course is remembered once and consumed once", () => {
  const store = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
    },
  };
  try {
    rememberPdpReturn("course-7", "#/course/course-7");
    assert.equal(readPdpReturn("course-7"), "#/course/course-7");
    // It belongs to THAT product — another product's page keeps its own route.
    assert.equal(readPdpReturn("course-9"), "");
    assert.equal(takePdpReturn("course-7"), "#/course/course-7");
    assert.equal(readPdpReturn("course-7"), "", "the return route is used once");
    // Only a real in-app route is ever stored.
    rememberPdpReturn("course-7", "https://evil.example/#/course/course-7");
    rememberPdpReturn("course-7", "");
    assert.equal(readPdpReturn("course-7"), "");
  } finally {
    delete globalThis.window;
  }
  // Without a browser (or with storage blocked) nothing throws.
  assert.equal(readPdpReturn("course-7"), "");
  assert.equal(takePdpReturn("course-7"), "");
});
