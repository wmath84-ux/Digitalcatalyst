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
