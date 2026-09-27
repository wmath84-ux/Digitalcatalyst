import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const footer = read("src/components/landing/Footer.tsx");
const material = read("src/components/landing/LandingGlassCard.tsx");
const product = read("src/components/ProductCard.tsx");
const storeCss = read("src/store-glass.css");
const glassCss = read("src/glass.css");

test("landing feature, hero, CTA and install cards reuse the Store product material, not its typography", () => {
  for (const name of ["Hero", "Features", "CtaBanner", "LandingOverlays"]) {
    const source = read(`src/components/landing/${name}.tsx`);
    assert.match(source, /import LandingGlassCard from "\.\/LandingGlassCard"/);
    assert.match(source, /<LandingGlassCard\s+radius=\{/);
    assert.doesNotMatch(source, /dc-store-card-title|dc-store-card-meta|dc-store-hero-title/);
  }
  assert.match(material, /className=\{cn\("dc-store-glass", className\)\}/);
  for (const prop of ['tint={0.62}', 'tintColor="173,216,255"', 'blur={0}']) {
    assert.ok(material.includes(prop) && product.includes(prop), `${prop} matches product cards`);
  }
  assert.match(storeCss, /blur\(var\(--dc-store-glass-blur\)\) saturate\(1\.3\)/);
  assert.match(storeCss, /background: var\(--dc-store-glass-tint\) !important/);
  assert.match(glassCss, /--dc-store-glass-blur: 18\.4px/);
  assert.match(glassCss, /--dc-store-glass-tint: rgba\(173, 216, 255, 0\.26\)/);
});

test("no landing card is wrapped in a 3D context, which would kill the glass", () => {
  // An ancestor in a 3D rendering context breaks `backdrop-filter`, so the
  // 18.4px frost silently stops rendering and the page behind shows through
  // unblurred — Firefox drops the filter entirely, Chrome/Edge apply it but
  // let the raw background show on top (Firefox #1952612, Chromium #323735424).
  // Features.tsx used to carry `transform-style: preserve-3d` + `perspective` +
  // rotateX/rotateY purely for its hover tilt, which made those five cards the
  // only ones on the landing page that did NOT look like the first card.
  for (const name of ["Hero", "Features", "CtaBanner", "LandingOverlays", "Footer", "Header"]) {
    const source = read(`src/components/landing/${name}.tsx`);
    const offenders = source
      .split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /preserve-3d|perspective\s*:|rotateX|rotateY|rotateZ/.test(line))
      // Comments explaining the ban are fine; live 3D declarations are not.
      .filter(([, line]) => !/^\s*(\*|\/\*|\/\/)/.test(line) && !/preserve-3d`,|no preserve-3d/.test(line));
    assert.deepEqual(
      offenders.map(([n, l]) => `${name}.tsx:${n} ${l.trim()}`),
      [],
      `${name}.tsx puts a glass card in a 3D context`,
    );
  }

  // The lift that replaced the tilt must stay 2D.
  assert.match(read("src/components/landing/Features.tsx"), /whileHover=\{\{ y: -8, scale: [\d.]+ \}\}/);
});

test("footer has readable text and links to the website's real legal pages and security section", () => {
  assert.doesNotMatch(footer, /text-white\/(?:40|45)/);
  assert.match(footer, /text-lg font-extrabold/);
  assert.match(footer, /text-sm leading-7 text-slate-200/);
  assert.match(footer, /aria-label="Site and legal links"/);
  assert.match(footer, /https:\/\/eduvora\.shop\/privacy-policy\.html#storage/);
  assert.match(footer, /https:\/\/eduvora\.shop\/privacy-policy\.html"/);
  assert.match(footer, /https:\/\/eduvora\.shop\/terms-of-service\.html"/);
  assert.match(read("public/privacy-policy.html"), /<section class="card" id="storage">[\s\S]*?<h3>Security measures<\/h3>/);
  assert.ok(fs.existsSync("public/terms-of-service.html"));
});
