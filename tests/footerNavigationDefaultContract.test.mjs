// tests/footerNavigationDefaultContract.test.mjs
//
// The owner's direction:
//
//   "Workspace ka pill-style footer navigation sabhi users ke liye
//    default set karo."
//
// "Sabhi users" is the part that needs a rule: a learner who had picked one
// of the other designs (Edge-to-edge included) had that choice saved, so a
// new default alone would never reach them. The app therefore re-seats that
// stored value ONCE, at boot, onto the Workspace pill (`work-pill`), and the
// Settings choice rules from then on — never overwritten again. This file
// pins both halves of that sentence.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const PREFERENCE = read("src/utils/footerNavigationStyle.ts");
const MAIN = read("src/main.tsx");
const SETTINGS = read("src/settings/SettingsPage.tsx");
const SHARED_FOOTER = read("src/components/SiteFooterNav.tsx");

/* ── source shape ────────────────────────────────────────────────────────── */

test("the Workspace pill is the one default, and the migration is one-time", () => {
  assert.match(PREFERENCE, /const DEFAULT_STYLE: FooterNavigationStyle = "work-pill";/);
  assert.match(PREFERENCE, /export function ensureDefaultFooterNavigationStyle\(\): void \{/);
  assert.match(PREFERENCE, /const MIGRATION_KEY = "dc-footer-navigation-style\.work-pill-default\.v1";/);
  // The marker is checked BEFORE anything is written, so a second boot is a
  // single `getItem` and a learner's own choice survives it.
  assert.match(
    PREFERENCE,
    /if \(window\.localStorage\.getItem\(MIGRATION_KEY\) === "1"\) return;[\s\S]*?window\.localStorage\.setItem\(MIGRATION_KEY, "1"\);[\s\S]*?window\.localStorage\.setItem\(STORAGE_KEY, DEFAULT_STYLE\);/,
  );
  // Mounted footers hear about it without a reload.
  assert.match(PREFERENCE, /window\.dispatchEvent\(new window\.Event\(CHANGE_EVENT\)\);/);
});

test("only the real app boot runs it — harness pages keep switching styles on purpose", () => {
  assert.match(MAIN, /import \{ ensureDefaultFooterNavigationStyle \} from "\.\/utils\/footerNavigationStyle";/);
  assert.match(MAIN, /initFooterNavSpace\(\);\n[\s\S]{0,400}?ensureDefaultFooterNavigationStyle\(\);/);
  // Not a module side effect: importing the preference must never re-seat it.
  assert.doesNotMatch(PREFERENCE, /^ensureDefaultFooterNavigationStyle\(\);$/m);
});

test("Settings still offers every design, and the shared footer renders the pill", () => {
  // The default changing must not remove the learner's way back: all four
  // designs stay selectable in Settings, each through the same setter.
  for (const style of ["youtube", "uiverse", "glass-dock", "work-pill"]) {
    assert.ok(SETTINGS.includes(`setFooterNavigationStyle("${style}")`), `${style} stays selectable in Settings`);
    assert.ok(SETTINGS.includes(`aria-checked={footerNavigationStyle === "${style}"}`), `${style} shows its selected state in Settings`);
  }
  assert.match(SETTINGS, /Work pill/);
  // …and the one shared footer really renders the Workspace pill design.
  assert.match(SHARED_FOOTER, /useFooterNavigationStyle\(\)/);
  assert.match(SHARED_FOOTER, /navigationStyle === "work-pill"/);
  assert.match(SHARED_FOOTER, /<WorkFooterNav/);
});

/* ── runtime ─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "dc-footer-navigation-style";
const MIGRATION_KEY = "dc-footer-navigation-style.work-pill-default.v1";
const PREVIOUS_MIGRATION_KEY = "dc-footer-navigation-style.edge-default.v1";

const loadPreferenceModule = () => {
  const code = ts.transpileModule(PREFERENCE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const store = new Map();
  const events = [];
  const fakeWindow = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  globalThis.window = fakeWindow;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => {
    if (id === "react") return { useSyncExternalStore: () => "work-pill" };
    throw new Error(`unexpected import: ${id}`);
  }, module, module.exports);
  return { preference: module.exports, store, events };
};

test("a browser with an older design saved is moved onto the Workspace pill once", () => {
  const { preference, store, events } = loadPreferenceModule();
  store.set(STORAGE_KEY, "glass-dock");

  preference.ensureDefaultFooterNavigationStyle();

  assert.equal(preference.getFooterNavigationStyle(), "work-pill", "the old design is gone");
  assert.equal(store.get(MIGRATION_KEY), "1", "…and the pass is marked done");
  assert.deepEqual(events, ["dc:footer-navigation-style-change"], "mounted footers are told");

  // The learner picks a design afterwards…
  preference.setFooterNavigationStyle("uiverse");
  assert.equal(preference.getFooterNavigationStyle(), "uiverse");

  // …and the next boot leaves it exactly as they left it.
  preference.ensureDefaultFooterNavigationStyle();
  assert.equal(preference.getFooterNavigationStyle(), "uiverse", "the choice is never overwritten twice");
});

test("a browser that already ran the Edge-to-edge pass is still moved once", () => {
  const { preference, store } = loadPreferenceModule();
  // The retired pass already seated this browser on Edge-to-edge; the new
  // default must still reach it, so the new marker is a different key.
  store.set(PREVIOUS_MIGRATION_KEY, "1");
  store.set(STORAGE_KEY, "youtube");

  preference.ensureDefaultFooterNavigationStyle();

  assert.equal(preference.getFooterNavigationStyle(), "work-pill");
  assert.equal(store.get(MIGRATION_KEY), "1");
});

test("a browser with nothing stored simply reads the default", () => {
  const { preference, store } = loadPreferenceModule();

  assert.equal(preference.getFooterNavigationStyle(), "work-pill");
  preference.ensureDefaultFooterNavigationStyle();
  assert.equal(preference.getFooterNavigationStyle(), "work-pill");
  assert.equal(store.get(STORAGE_KEY), "work-pill", "the default is written, and the marker with it");
  assert.equal(store.get(MIGRATION_KEY), "1");
});

test("storage that refuses writes never breaks the footer", () => {
  const { preference } = loadPreferenceModule();
  globalThis.window.localStorage = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };

  assert.doesNotThrow(() => preference.ensureDefaultFooterNavigationStyle());
  assert.equal(preference.getFooterNavigationStyle(), "work-pill");
});
