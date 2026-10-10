import type { Product } from "../../../src/data/products";
const params = new URLSearchParams(location.search);
const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="760"><rect width="1100" height="760" fill="#29264c"/><circle cx="580" cy="360" r="180" fill="none" stroke="#aaa0de" stroke-width="2"/><path d="M170 470Q450 150 850 450M200 400Q490 600 900 290" stroke="#746ca5" stroke-width="2" fill="none"/><text x="70" y="670" font-size="42" fill="#e5e0ff" font-family="sans-serif">Physics foundations</text></svg>')}`;
const resource = (id: string, extra: object = {}) => ({ id, name: id, type: "pdf", visibility: "visible", accessLevel: "included", individuallyPurchasable: false, cashPrice: 0, salePrice: null, entitlementId: id, ...extra });
const module = (id: string, title: string, extra: object = {}) => ({ id, title, description: "", active: true, visibility: "visible", accessLevel: "included", includeInBundle: true, individuallyPurchasable: true, cashPrice: 0, salePrice: null, resources: [], modules: [], requiredPreviousModuleIds: [], entitlementId: id, ...extra });
export const product = {
  id: "foundations", documentId: "foundations-doc", title: "Physics foundations", instructor: "Ananya Sharma", category: "Course", subject: "Physics", classLevel: "Class 12", tags: [], filterIds: [], price: 0, originalPrice: 599, regularPrice: 599, isFree: true, isVisible: true, inStock: true, availableForSale: true,
  image: cover, images: [cover], description: "Start with the core lessons, then choose only the extra practice you need.", features: ["Core lessons included", "Optional practice and exam updates"], reviews: 0, rating: 0,
  canonicalModules: [
    module("core", "Foundation lessons", { resources: [resource("lesson", { name: "Core lesson notes" }), resource("workbook", { name: "Question workbook", individuallyPurchasable: true, cashPrice: 99, salePrice: 79, includeInBundle: false })] }),
    module("advanced", params.has("long") ? "Advanced practice — भौतिक विज्ञान की सम्पूर्ण तैयारी और विस्तृत अभ्यास VeryLongUnbrokenCourseModuleTitleThatMustNotOverflowItsColumn" : "Advanced practice", { description: "Focused practice with worked solutions.", includeInBundle: false, cashPrice: 300, salePrice: 249, resources: [resource("advanced-pdf", { name: "Worked examples" })] }),
    module("strategies", "Exam strategies", { includeInBundle: false, cashPrice: 500, salePrice: 399, requiredPreviousModuleIds: ["advanced"] }),
    module("sample", "Practice sample", { includeInBundle: false, cashPrice: 100, salePrice: 0 }),
    module("update-module", "2026 mock exams", { accessLevel: "paid_update", resources: [resource("mock-pdf", { name: "Mock exam booklet" })] }),
    module("hidden", "Private draft", { visibility: "hidden", modules: [module("hidden-child", "Private answer key", { cashPrice: 500, includeInBundle: false })] }),
  ],
  paidUpdates: [{ id: "exam-2026", title: "2026 exam pack", description: "New exam materials beyond the base product.", cashPrice: 500, active: true, visibility: "visible", includedModuleIds: ["update-module"], includedResourceIds: [] }],
} as unknown as Product;
if (params.has("legacy")) { (product as any).courseContent = product.canonicalModules; product.canonicalModules = []; }
export const DEFAULT_FLAGS = { push: true, email: true, promotions: false, profileVisible: true, shareActivity: false, activityConsentVersion: 1 };
export const account = (uid: string) => ({ id: uid, uid, name: uid === "learner-b" ? "Kabir Verma" : "Ananya Sharma", email: `${uid}@example.test`, emailVerified: true, role: "student" });
export const initialUid = params.has("guest") ? null : "learner-a";
export function grantsFor(uid: string) {
  if (uid !== "learner-a") return [];
  const records: any[] = [];
  const add = (kind: string, fields: object) => records.push({ uid, productId: product.documentId, kind, status: "active", ...fields });
  if (params.has("base") || params.has("all")) add("full_product", {});
  if (params.has("partial") || params.has("all")) add("module", { moduleId: "advanced" });
  if (params.has("resource") || params.has("all")) add("resource", { resourceId: "workbook" });
  if (params.has("update") || params.has("all")) add("paid_update", { updateId: "exam-2026" });
  if (params.has("all")) { add("module", { moduleId: "strategies" }); add("module", { moduleId: "sample" }); }
  if (params.has("expired")) add("module", { moduleId: "advanced", expiresAt: Date.now() - 60000 });
  if (params.has("expiredBase")) add("full_product", { expiresAt: 0 });
  if (params.has("revokedBase")) add("full_product", { status: "revoked" });
  if (params.has("zeroExpiry")) add("module", { moduleId: "advanced", expiresAt: 0 });
  return records;
}
export function membershipFor(uid: string) {
  return uid === "learner-a" && params.has("subscription") ? { uid, status: "active", expiresAt: Date.now() + 86400000, includedProductIds: [product.documentId], includedModuleKeys: [`${product.documentId}:advanced`] } : null;
}
