import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_PRODUCT_RESOURCE_TYPES,
  CORE_PRODUCT_RESOURCE_TYPES,
  canonicalProductResourceType,
  hasNoteResourceType,
  isNoteResourceType,
  registerNoteResourceType,
} from "../utils/productResourceTypes.js";

test("the admin resource registry registers exactly one canonical Block Note type", () => {
  const notes = ADMIN_PRODUCT_RESOURCE_TYPES.filter((entry) => entry.value === "note");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].label, "Block Note");
  assert.equal(hasNoteResourceType(ADMIN_PRODUCT_RESOURCE_TYPES), true);
  assert.equal(CORE_PRODUCT_RESOURCE_TYPES.some((entry) => entry.value === "note"), false);
});

test("legacy equivalent resource names collapse to the same stable Note identity", () => {
  for (const alias of ["note", "notes", "block_note", "Block Note", "Study Note", "study_notes"]) {
    assert.equal(isNoteResourceType(alias), true, alias);
    assert.equal(canonicalProductResourceType(alias), "note", alias);
  }
});

test("Note registration is idempotent and deduplicates equivalent registry entries", () => {
  const registry = registerNoteResourceType([
    { value: "youtube", label: "YouTube" },
    { value: "block_note", label: "Legacy Note" },
    { value: "note", label: "Old Note" },
  ]);
  assert.equal(registry.filter((entry) => entry.value === "note").length, 1);
  assert.equal(registry[1].label, "Block Note");
  assert.deepEqual(registerNoteResourceType(registry), registry);
});
