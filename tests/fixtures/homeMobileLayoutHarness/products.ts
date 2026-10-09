import type { Product } from "../../../src/data/products";

const artwork = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#46418b"/><circle cx="800" cy="450" r="250" fill="#c4b5fd"/></svg>')}`;

/** Stress real card layouts with long copy, Indian currency, and every filter. */
export const products: Product[] = [
  { id: "course", title: "Complete mathematics: algebra, geometry and advanced problem solving", category: "Course", price: 1299, originalPrice: 2499, rating: 4.9, reviews: 1240 },
  { id: "pdf", title: "भौतिक विज्ञान — गति और ऊर्जा की सम्पूर्ण तैयारी", category: "PDF", price: 123456, originalPrice: 199999, rating: 4.8, reviews: 1234567 },
  { id: "book", title: "VeryLongUnbrokenBookTitleThatMustNotPushItsPriceOutsideTheCard", category: "E-book", price: 0, originalPrice: 399, rating: 4.7, reviews: 45 },
  { id: "live", title: "Live science workshop", category: "Live", price: 599, originalPrice: 999, rating: 4.6, reviews: 20 },
].map((product) => ({
  ...product,
  image: artwork,
  instructor: "Dr. Ananya Sharma",
  classLevel: "Class 12",
  subject: "Mathematics and science",
  description: "Focused lessons and practical examples you can revisit at your own pace.",
  tags: ["TRENDING", ...(product.id === "course" ? ["FEATURED"] : [])],
  status: "published",
  canonicalModules: product.id === "course" ? [{
    id: "algebra",
    title: "Algebra",
    sortOrder: 0,
    pricePaise: 0,
    resources: [{ id: "lesson", name: "Linear equations", type: "video", sortOrder: 0, pricePaise: 0, url: "" }],
    modules: [],
  }] : [],
})) as Product[];

// Test-only canonical content for the real PDP selection/access flows.
const module = (id: string, title: string, cashPrice: number, extra: Record<string, unknown> = {}) => ({
  id, title, cashPrice, description: "", sortOrder: 0, visibility: "visible", active: true,
  accessLevel: "included", individuallyPurchasable: true, salePrice: null, coinPrice: null,
  includeInBundle: true, previewAvailable: false, requiredPreviousModuleIds: [],
  entitlementId: id, badge: null, parentModuleId: null, resources: [], modules: [], ...extra,
});
const resource = {
  id: "notebook", parentModuleId: "algebra", name: "Practice notebook", type: "pdf",
  url: "", provider: "", sortOrder: 0, visibility: "visible", accessLevel: "purchasable",
  individuallyPurchasable: true, cashPrice: 249, salePrice: 199, coinPrice: null,
  entitlementId: "notebook", paidUpdateId: null,
};
export const update = {
  id: "revision-update", title: "Revision pack", description: "New worked examples.",
  includedModuleIds: ["update-module"], includedResourceIds: [], cashPrice: 249, coinPrice: 0,
  active: true, visibility: "visible", publishDate: null, sortOrder: 0,
};

export function pdpFixtureProduct(params: URLSearchParams): Product {
  let product = { ...(products.find((item) => item.id === params.get("product")) || products[0]) };
  if (params.has("options")) product = {
    ...product,
    canonicalModules: [
      module("algebra", "Algebra", 499, {
        resources: [params.has("freeResource") ? { ...resource, cashPrice: 0, salePrice: 0 } : resource],
        modules: [module("nested", "Worked examples", 99, { individuallyPurchasable: false, parentModuleId: "algebra" })],
      }),
      module("geometry", "Geometry", 299, { requiredPreviousModuleIds: ["algebra"] }),
      module("update-module", "Revision lessons", 249, { accessLevel: "paid_update", includeInBundle: false, paidUpdateId: update.id }),
    ],
    paidUpdates: [update],
  } as Product;
  if (params.has("upgrade")) product = { ...product, paidUpdates: [update] } as Product;
  if (params.has("unavailable")) product.availableForSale = false;
  if (params.has("freeFlag")) product.isFree = true;
  if (params.has("freeCourse")) product.price = 0;
  if (params.has("noMRP")) product.originalPrice = 0;
  if (params.has("longCopy")) {
    product.description = "Learn with step-by-step explanations and practical examples. ".repeat(20).trim();
    product.features = Array.from({ length: 6 }, (_, index) => `Learning benefit ${index + 1}`);
  }
  if (params.has("noRatings")) { product.rating = 0; product.reviews = 0; }
  if (params.has("gallery")) product.images = [product.image, product.image.replace("46418b", "164e63")];
  if (params.has("brokenImage")) { product.image = "/test-missing-image.png"; product.images = []; }
  if (params.has("related")) product.chapters = ["Algebra"];
  return product;
}

export function pdpFixtureCatalog(product: Product, params: URLSearchParams): Product[] {
  if (!params.has("related")) return products;
  return [product, ...Array.from({ length: 8 }, (_, index) => ({
    ...products[index % products.length], id: `related-${index}`, title: `Algebra practice ${index + 1}`,
    classLevel: product.classLevel, chapters: ["Algebra"],
    ...(params.has("switchable") ? { price: 1499, originalPrice: 2499, canonicalModules: [module(`related-module-${index}`, "New chapter", 399)] } : { canonicalModules: [] }),
  }))];
}
