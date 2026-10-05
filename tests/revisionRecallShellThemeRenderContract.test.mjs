import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);

const read = (file) => fs.readFileSync(file, "utf8");
const main = read("src/main.tsx");
const appShell = read("src/revision/recall/components/app-shell.tsx");
const revisionApp = read("src/revision/RevisionApp.tsx");
const recallTheme = read("src/revision/recall-theme.css");
const css = read("src/index.css");
const domainTypes = read("src/revision/domain/types.ts");
const migrations = read("src/revision/domain/migrations/index.ts");
const dcxRepository = read("src/revision/integrations/dcxRepository.ts");

function revisionSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return revisionSources(file);
    return /\.tsx?$/.test(file) ? [file] : [];
  });
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isMethodDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return "";
}

function callbackHook(node) {
  let expression = node;
  while (ts.isParenthesizedExpression(expression.parent)) expression = expression.parent;
  const parent = expression.parent;
  if (!ts.isCallExpression(parent)) return "";
  if (parent.arguments.some((argument) => argument === expression) && ts.isIdentifier(parent.expression)) {
    return parent.expression.text;
  }
  return "";
}

test("Revision integrates into DesktopShell with the unified left rail and header", () => {
  const host = main.slice(main.indexOf("function DesktopAppHost("), main.indexOf("function RootPage()"));
  const start = host.indexOf("return (\n    <AppShell");
  assert.ok(start >= 0, "expected the desktop host's AppShell return");
  const appShellBranch = host.slice(start);

  assert.match(appShellBranch, /hash\.startsWith\(REVISION_HASH\)\s*\?\s*"Revision"/);
  assert.doesNotMatch(host.slice(0, start), /hash\.startsWith\(REVISION_HASH\)/, "must not skip AppShell on revision");
});

test("Recall keeps its light token surface and is not distorted by legacy desktop styling", () => {
  assert.match(revisionApp, /data-recall-root[\s\S]{0,120}?className="min-h-dvh bg-background/);
  assert.match(recallTheme, /--color-background: var\(--rc-background\)/);
  const lightTokens = recallTheme.slice(recallTheme.indexOf("[data-recall-root] {"), recallTheme.indexOf("/* ── Dark theme"));
  assert.match(lightTokens, /--rc-background: #f7f9fb;/);
  assert.match(lightTokens, /color-scheme: light;/);
  assert.match(recallTheme, /\[data-recall-root\]\[data-recall-theme="dark"\]/);
  assert.match(
    css,
    /\[data-revision-app\]:not\(\[data-recall-root\]\) h1,[\s\S]{0,500}?\[data-revision-app\]:not\(\[data-recall-root\]\) button/,
  );
});

test("standalone Recall Revision pages are not clipped by the legacy tablet viewport frame", () => {
  assert.match(
    css,
    /body:not\(:has\(\.dc-desktop-shell\)\) \[data-recall-root\]\[data-revision-app\] \{[\s\S]{0,220}?height: auto !important;[\s\S]{0,220}?overflow: visible !important;/,
  );
});

test("Recall light is the default and existing inherited dark settings migrate once", () => {
  assert.match(domainTypes, /export const DEFAULT_STUDY_SETTINGS:[\s\S]*?theme: "light"/);
  assert.match(migrations, /export const UNIFIED_SCHEMA_VERSION = 3/);
  assert.match(migrations, /const recallLightTheme: Migration = \{\s*version: 3/);
  assert.match(migrations, /if \(study\.theme === "dark"\) study\.theme = "light"/);
  assert.match(migrations, /MIGRATIONS: Migration\[\] = \[baselineProjection, normaliseSettings, recallLightTheme\]/);
  assert.match(dcxRepository, /migration\.ran\.includes\(3\)[\s\S]{0,180}?unified\.settings\.study\.theme === "dark"/);
  assert.match(dcxRepository, /if \(appliedLightThemeMigration && uid !== "guest"\) queueUnifiedCloudPersistence\(uid\)/);
});

test("v3 changes dark Revision defaults to light but preserves explicit alternatives", async () => {
  const cache = path.join(process.cwd(), "node_modules", ".cache", "revision-theme-migration");
  fs.mkdirSync(cache, { recursive: true });
  const outfile = path.join(cache, "migration.cjs");
  buildSync({
    entryPoints: [path.join(process.cwd(), "src/revision/domain/migrations/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    logLevel: "silent",
  });

  const { MIGRATIONS } = require(outfile);
  const migrate = MIGRATIONS.find((step) => step.version === 3)?.run;
  assert.equal(typeof migrate, "function");
  const snapshot = (theme) => ({
    version: 2,
    settings: { catalog: {}, custom: {}, study: { theme } },
    cards: [],
    folders: [],
    savedSearches: [],
    media: [],
  });

  const dark = await migrate({ unified: snapshot("dark") });
  const highContrast = await migrate({ unified: snapshot("high-contrast") });
  const light = await migrate({ unified: snapshot("light") });
  assert.equal(dark.version, 3);
  assert.equal(dark.settings.study.theme, "light");
  assert.equal(highContrast.settings.study.theme, "high-contrast");
  assert.equal(light.settings.study.theme, "light");
});

test("Revision render calculations never call a local React state setter", () => {
  const violations = [];

  for (const file of revisionSources("src/revision")) {
    const source = read(file);
    const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
    const stateSetters = new Set();

    function collectStateSetters(node) {
      if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer) {
        const initializer = ts.isCallExpression(node.initializer) ? node.initializer.expression : null;
        const isUseState =
          (initializer && ts.isIdentifier(initializer) && initializer.text === "useState") ||
          (initializer && ts.isPropertyAccessExpression(initializer) && initializer.name.text === "useState");
        const setter = node.name.elements[1];
        if (isUseState && setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
          stateSetters.add(setter.name.text);
        }
      }
      ts.forEachChild(node, collectStateSetters);
    }
    collectStateSetters(ast);

    function scan(node, functions = []) {
      const nextFunctions =
        ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
          ? [...functions, node]
          : functions;

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && stateSetters.has(node.expression.text)) {
        const owner = nextFunctions.at(-1);
        if (owner) {
          const ownerName = functionName(owner);
          const hook = callbackHook(owner);
          const isRenderFunction = /^[A-Z]/.test(ownerName) || /^use[A-Z]/.test(ownerName);
          if (hook === "useMemo" || (isRenderFunction && !hook)) {
            const location = ast.getLineAndCharacterOfPosition(node.getStart());
            violations.push(`${file}:${location.line + 1} calls ${node.expression.text} during render`);
          }
        }
      }

      ts.forEachChild(node, (child) => scan(child, nextFunctions));
    }
    scan(ast);
  }

  assert.deepEqual(violations, [], violations.join("\n"));
});

test("an invalid result deep link renders safely under StrictMode", () => {
  const cache = path.join(process.cwd(), "node_modules", ".cache", "revision-301-strict-runtime");
  fs.mkdirSync(cache, { recursive: true });
  const outfile = path.join(cache, "fixture.cjs");
  const fixture = `
    import * as React from "react";
    import { createRoot } from "react-dom/client";
    import { act } from "react";
    import TestResultPage from ${JSON.stringify(path.join(process.cwd(), "src/revision/pages/TestResultPage.tsx"))};
    export function mount(host) {
      const root = createRoot(host);
      act(() => root.render(
        <React.StrictMode>
          <TestResultPage uid="arena-301-contract" attemptId={999998} />
        </React.StrictMode>
      ));
      return root;
    }
    export { act };
  `;
  buildSync({
    stdin: { contents: fixture, resolveDir: process.cwd(), sourcefile: "fixture.tsx", loader: "tsx" },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    external: ["react", "react-dom", "react-dom/client"],
    logLevel: "silent",
  });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"host\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/#/revision/test-result/999998",
  });
  const globals = [
    "window",
    "document",
    "localStorage",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
    "navigator",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const originalGlobals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const window = dom.window;
  const values = {
    window,
    document: window.document,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    MutationObserver: window.MutationObserver,
    navigator: window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  const messages = [];
  const originalConsoleError = console.error;
  try {
    console.error = (...args) => messages.push(args.map(String).join(" "));
    const { act, mount } = require(outfile);
    const host = window.document.getElementById("host");
    const root = mount(host);
    assert.match(host.textContent, /Could not load this result/);
    assert.doesNotMatch(messages.join("\n"), /Too many re-renders|Minified React error #301/);
    act(() => root.unmount());
  } finally {
    console.error = originalConsoleError;
    dom.window.close();
    for (const key of globals) {
      const descriptor = originalGlobals.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
