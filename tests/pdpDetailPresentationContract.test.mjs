import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const paid = fs.readFileSync("src/components/pdp/PdpPaidContent.tsx", "utf8");
const styles = fs.readFileSync("src/pdp-minimal.css", "utf8");
const purchaseBuilder = fs.readFileSync("src/components/pdp/PdpPurchaseBuilder.tsx", "utf8");
const selectionSummary = fs.readFileSync("src/components/pdp/PdpSelectionSummary.tsx", "utf8");

test("PDP reviews show a profile-style initials avatar beside each reviewer", () => {
  assert.match(pdp, /data-pdp-review-avatar/);
  assert.match(pdp, /review\.avatarColor \|\| "bg-indigo-500"/);
  assert.match(pdp, /review\.initials \|\| initials\(review\.name\)/);
  assert.match(styles, /\.dc-pdp-review-person/);
  assert.match(styles, /\.dc-pdp-review-avatar\s*\{[^}]*border-radius:\s*50%/);
});

test("access failures suppress estimates and never masquerade as pricing errors", () => {
  assert.match(pdp, /const accessStatus = accessLoading \? "loading" : accessError \? "error" : "ready"/);
  assert.match(pdp, /status: "idle" as const, quote: null, error: "", applying: false/);
  assert.match(pdp, /accessStatus === "ready" && pricing\.status === "error"/);
  assert.match(pdp, /data-pdp-access-error/);
  assert.match(pdp, /error=\{activeTab === "Paid" \? accessError/);
  assert.match(purchaseBuilder, /accessStatus: PdpAccessStatus/);
  assert.match(selectionSummary, /Price hidden until your content access can be verified\./);
  assert.match(purchaseBuilder, /label = accessStatus === "loading" \? "Checking access" : "Access not verified"/);
  assert.match(styles, /\.dc-pdp-access-error/);
});

test("the Paid tab keeps remaining content separate from a concise, complete owned list", () => {
  const ownedGroup = paid.slice(paid.indexOf('data-pdp-paid-group="owned"'));
  assert.match(paid, /data-pdp-paid-group="available"/);
  assert.match(paid, /Not yet owned/);
  assert.match(ownedGroup, /Already owned/);
  assert.match(ownedGroup, /data-pdp-owned-summary/);
  assert.match(ownedGroup, /owned\.map\(\(row\)/);
  assert.match(ownedGroup, /data-pdp-owned-item=\{row\.key\}/);
  assert.match(ownedGroup, /row\.accessNote/);
  assert.match(ownedGroup, /row\.ownershipLabel/);
  assert.doesNotMatch(ownedGroup, /row\.details|dc-pdp-paid-includes|<details/);
  assert.match(styles, /\.dc-pdp-owned-list\s*\{[^}]*display:\s*grid/);
  assert.match(styles, /\.dc-pdp-owned-mark/);
  assert.match(styles, /\.dc-pdp-owned-label/);
});
