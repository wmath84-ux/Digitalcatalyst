import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import {
  firestoreToCatalogProduct,
  getProductPublicationStatus,
} from "../utils/productMapping.js";
// Execute the production legacy-document mapper without mounting Firebase or
// re-implementing pricing. Only its three pure variable declarations are loaded.
const source = ts.createSourceFile(
  "CatalogContext.tsx",
  fs.readFileSync("src/context/CatalogContext.tsx", "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const names = new Set(["numericPrice", "mapCategory", "mapProduct"]);
const code = source.statements
  .filter(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((declaration) =>
        names.has(declaration.name.getText(source))
      )
  )
  .map((node) => node.getText(source))
  .join("\n");
const compiled = ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mapProduct = new Function(
  "getProductPublicationStatus",
  "fullDemoCourseContent",
  "firestoreToCatalogProduct",
  compiled + ";return mapProduct;"
)(getProductPublicationStatus, [], firestoreToCatalogProduct);
test("Free legacy catalog records preserve a genuinely configured pre-free price and numeric zero final", () => {
  const p = mapProduct("doc", {
    id: "free",
    title: "Revision",
    price: 199.95,
    salePrice: 99.95,
    isFree: true,
  });
  assert.equal(p.originalPrice, 199.95);
  assert.equal(p.price, 0);
  assert.equal(p.isFree, true);
});
test("A catalog without an original amount never invents one for the free price", () => {
  for (const price of [undefined, "", 0, "invalid", -1]) {
    const p = mapProduct("doc", { price, isFree: true });
    assert.equal(p.originalPrice, 0);
    assert.equal(p.price, 0);
  }
});
test("Paid and zero-sale catalog amounts, ids and availability remain unchanged", () => {
  const paid = mapProduct("doc", {
    id: "public-id",
    price: 299.95,
    salePrice: 149.95,
  });
  assert.equal(paid.price, 149.95);
  assert.equal(paid.originalPrice, 299.95);
  assert.equal(paid.id, "public-id");
  assert.equal(paid.documentId, "doc");
  const zero = mapProduct("doc", { price: 299.95, salePrice: 0 });
  assert.equal(zero.price, 0);
  assert.equal(zero.originalPrice, 299.95);
});
