import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  normalizeThemeMode,
  readStoredThemeMode,
  resolveDocumentTheme,
  writeStoredThemeMode,
} from "../src/lib/theme.ts";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    _data: data,
  };
}

function fakeDocument() {
  const attrs = {};
  const classes = new Set();
  const meta = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const root = {
    dataset: {},
    style: {},
    classList: {
      toggle(name, on) {
        if (on) classes.add(name); else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
  };
  return {
    documentElement: root,
    querySelector: () => meta,
    _classes: classes,
    _meta: meta,
    _attrs: attrs,
  };
}

test("light is the default theme", () => {
  assert.equal(DEFAULT_THEME_MODE, "light");
  assert.equal(THEME_STORAGE_KEY, "dc.theme");
});

test("normalizeThemeMode accepts only light and dark", () => {
  assert.equal(normalizeThemeMode("light"), "light");
  assert.equal(normalizeThemeMode("dark"), "dark");
  assert.equal(normalizeThemeMode("system"), null);
  assert.equal(normalizeThemeMode(""), null);
  assert.equal(normalizeThemeMode(null), null);
});

test("falls back to light when nothing or junk is stored", () => {
  assert.equal(readStoredThemeMode(fakeStorage()), "light");
  assert.equal(readStoredThemeMode(fakeStorage({ "dc.theme": "neon" })), "light");
  assert.equal(readStoredThemeMode(null), "light");
});

test("reads a stored preference", () => {
  assert.equal(readStoredThemeMode(fakeStorage({ "dc.theme": "dark" })), "dark");
  assert.equal(readStoredThemeMode(fakeStorage({ "dc.theme": "light" })), "light");
});

test("writes and round-trips the preference", () => {
  const storage = fakeStorage();
  writeStoredThemeMode("dark", storage);
  assert.equal(storage._data.get("dc.theme"), "dark");
  assert.equal(readStoredThemeMode(storage), "dark");
});

test("admin and course-player routes stay dark regardless of preference", () => {
  for (const hash of ["#/admin", "#/admin-login", "#/course/abc", "#/my-course/xyz"]) {
    assert.equal(resolveDocumentTheme("light", hash), "dark", hash);
  }
});

test("ordinary routes follow the stored preference", () => {
  for (const hash of ["#/home", "#/profile", "#/store", ""]) {
    assert.equal(resolveDocumentTheme("light", hash), "light", hash);
    assert.equal(resolveDocumentTheme("dark", hash), "dark", hash);
  }
});

test("applyDocumentTheme sets data-theme, classes, colour-scheme and theme-color", () => {
  const doc = fakeDocument();
  applyDocumentTheme("light", doc);
  assert.equal(doc.documentElement.dataset.theme, "light");
  assert.ok(doc._classes.has("light"));
  assert.ok(!doc._classes.has("dark"));
  assert.equal(doc.documentElement.style.colorScheme, "light");
  assert.equal(doc._meta.attributes.content, "#f8fafc");

  applyDocumentTheme("dark", doc);
  assert.equal(doc.documentElement.dataset.theme, "dark");
  assert.ok(doc._classes.has("dark"));
  assert.ok(!doc._classes.has("light"));
  assert.equal(doc.documentElement.style.colorScheme, "dark");
  assert.equal(doc._meta.attributes.content, "#0a0c12");
});
