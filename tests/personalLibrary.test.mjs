// Behaviour tests for the dependency-free My Study Library helpers. These pin
// duplicate identity, search/filter/sort and accessible move semantics used by
// both the API and responsive UI.

import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPersonalLibraryResources,
  libraryResourceSearchText,
  movePersonalLibraryItem,
  normalizeLibrarySearchText,
  officialResourceReferenceKey,
  personalResourceIdentityDescriptor,
  sortPersonalLibraryResources,
} from "../utils/personalLibrary.js";

test("official duplicate identity is anchored to source ids, not mutable URL metadata", () => {
  const base = {
    type: "youtube",
    url: "https://youtu.be/dQw4w9WgXcQ",
    origin: { kind: "official", productId: "course-A", moduleId: "module-1", resourceId: "file-7" },
  };
  const changedMetadata = {
    ...base,
    type: "video",
    url: "https://cdn.example.com/corrected.mp4",
  };
  assert.equal(personalResourceIdentityDescriptor(base), personalResourceIdentityDescriptor(changedMetadata));
  assert.notEqual(
    personalResourceIdentityDescriptor(base),
    personalResourceIdentityDescriptor({ ...base, origin: { ...base.origin, resourceId: "file-8" } }),
  );
});

test("YouTube watch, short, embed and youtu.be links share one personal identity", () => {
  const id = "dQw4w9WgXcQ";
  const links = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ];
  const identities = links.map((url) => personalResourceIdentityDescriptor({ type: "youtube", url }));
  assert.equal(new Set(identities).size, 1);
});

test("personal URL identity normalizes query order but preserves type and provider", () => {
  const first = personalResourceIdentityDescriptor({ type: "embed", url: "https://Example.com/path?b=2&a=1" });
  const reordered = personalResourceIdentityDescriptor({ type: "embed", url: "https://example.com/path?a=1&b=2" });
  assert.equal(first, reordered);
  assert.notEqual(first, personalResourceIdentityDescriptor({ type: "pdf", url: "https://example.com/path?a=1&b=2" }));
  assert.notEqual(
    personalResourceIdentityDescriptor({ type: "embed", provider: "Provider A", url: "https://example.com/path" }),
    personalResourceIdentityDescriptor({ type: "embed", provider: "Provider B", url: "https://example.com/path" }),
  );
});

test("official reference keys are deterministic and include product, module and resource", () => {
  assert.equal(
    officialResourceReferenceKey({ productId: " Course-A ", moduleId: "M-1", resourceId: "R-2" }),
    "course-a|m-1|r-2",
  );
  assert.notEqual(
    officialResourceReferenceKey({ productId: "a", moduleId: "m", resourceId: "r" }),
    officialResourceReferenceKey({ productId: "a", moduleId: "n", resourceId: "r" }),
  );
});

const NOW = 2_000_000_000;
const resources = [
  {
    id: "saved-pdf",
    name: "Résumé Checklist",
    description: "Final review",
    type: "pdf",
    state: "saved",
    personalModuleId: null,
    createdAt: NOW - 100,
    lastOpenedAt: 0,
    sortOrder: 2,
    origin: { productTitle: "Biology", moduleTitle: "Cells" },
  },
  {
    id: "organized-video",
    name: "Mitosis walkthrough",
    description: "Visual lesson",
    type: "youtube",
    state: "organized",
    personalModuleId: "module-a",
    createdAt: NOW - 10_000,
    lastOpenedAt: NOW - 50,
    sortOrder: 1,
    origin: { productTitle: "Biology", moduleTitle: "Cell division" },
  },
  {
    id: "old-audio",
    name: "Focus audio",
    description: "Deep work",
    type: "audio",
    state: "organized",
    personalModuleId: "module-b",
    createdAt: NOW - 10_000_000,
    lastOpenedAt: NOW - 9_000_000,
    sortOrder: 0,
    origin: { productTitle: "Study skills", moduleTitle: "Attention" },
  },
];

test("search is case/accent insensitive and includes editable module + official origin names", () => {
  assert.equal(normalizeLibrarySearchText("  RÉSUMÉ   Plan "), "resume plan");
  assert.match(libraryResourceSearchText(resources[0]), /resume checklist/);
  assert.deepEqual(
    filterPersonalLibraryResources(resources, { query: "resume" }).map((item) => item.id),
    ["saved-pdf"],
  );
  assert.deepEqual(
    filterPersonalLibraryResources(resources, { query: "exam prep", moduleTitleById: { "module-a": "Exam Prep" } }).map((item) => item.id),
    ["organized-video"],
  );
  assert.deepEqual(
    filterPersonalLibraryResources(resources, { query: "cell division" }).map((item) => item.id),
    ["organized-video"],
  );
});

test("type, module and state filters compose, including recent-added/opened", () => {
  assert.deepEqual(filterPersonalLibraryResources(resources, { state: "saved" }).map((item) => item.id), ["saved-pdf"]);
  assert.deepEqual(filterPersonalLibraryResources(resources, { state: "organized", moduleId: "module-a", type: "youtube" }).map((item) => item.id), ["organized-video"]);
  assert.deepEqual(filterPersonalLibraryResources(resources, { state: "recent-added", now: NOW, recentWindowMs: 1_000 }).map((item) => item.id), ["saved-pdf"]);
  assert.deepEqual(filterPersonalLibraryResources(resources, { state: "recent-opened", now: NOW, recentWindowMs: 1_000 }).map((item) => item.id), ["organized-video"]);
});

test("library sorting supports recent, opened, name and module order without mutating input", () => {
  const input = [...resources];
  assert.deepEqual(sortPersonalLibraryResources(resources, "recent").map((item) => item.id), ["saved-pdf", "organized-video", "old-audio"]);
  assert.deepEqual(sortPersonalLibraryResources(resources, "opened").map((item) => item.id), ["organized-video", "old-audio", "saved-pdf"]);
  assert.deepEqual(sortPersonalLibraryResources(resources, "name").map((item) => item.id), ["old-audio", "organized-video", "saved-pdf"]);
  assert.deepEqual(sortPersonalLibraryResources(resources, "module").map((item) => item.id), ["old-audio", "organized-video", "saved-pdf"]);
  assert.deepEqual(resources, input);
});

test("accessible up/down move is immutable and safely clamps or ignores invalid moves", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(movePersonalLibraryItem(items, 1, 0).map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(movePersonalLibraryItem(items, 0, 99).map((item) => item.id), ["b", "c", "a"]);
  assert.deepEqual(movePersonalLibraryItem(items, -1, 0), items);
  assert.deepEqual(items.map((item) => item.id), ["a", "b", "c"]);
});
