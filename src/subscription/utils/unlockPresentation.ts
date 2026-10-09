import type { Product } from "../../data/products";
import type { SubscriptionCatalog, SubscriptionPlanDoc } from "./subscriptionCatalog";

export type SubscriptionDisplayProduct = Pick<
  Product,
  "id" | "documentId" | "title" | "canonicalModules" | "courseContent"
>;

type NamedModule = { id: string; title: string; modules?: NamedModule[] };
export interface SubscriptionModuleSummary {
  id: string;
  title: string;
  productTitle: string;
}

export function subscriptionProductFor(
  products: readonly SubscriptionDisplayProduct[],
  productId: string
) {
  return products.find((product) => product.id === productId || product.documentId === productId);
}

function moduleTitleIn(modules: NamedModule[], moduleId: string): string | undefined {
  for (const module of modules) {
    if (module.id === moduleId) return module.title;
    const nested = moduleTitleIn(module.modules || [], moduleId);
    if (nested) return nested;
  }
}

/** Quote snapshot names win. Catalog names only replace generic ID labels. */
export function subscriptionUnlockName(
  products: readonly SubscriptionDisplayProduct[],
  productId: string,
  moduleId?: string | null,
  verifiedTitle?: string
) {
  const product = subscriptionProductFor(products, productId);
  const rawTitle = String(verifiedTitle || "").trim();
  const title = rawTitle.replace(/^Plan unlock:\s*/i, "").trim();
  const generic =
    !title ||
    (/^Plan unlock:/i.test(rawTitle) &&
      (title === productId || title === moduleId || title === `module ${moduleId}`));
  if (!generic) return title;
  if (moduleId) {
    return (
      moduleTitleIn(product?.canonicalModules || [], moduleId) ||
      moduleTitleIn(product?.courseContent || [], moduleId) ||
      `Module ID: ${moduleId}`
    );
  }
  return product?.title || `Course ID: ${productId}`;
}

/** Both plan metadata and explicit unlock records describe included access. */
export function includedSubscriptionModules(
  catalog: SubscriptionCatalog | null,
  plan: SubscriptionPlanDoc | null,
  products: readonly SubscriptionDisplayProduct[]
): SubscriptionModuleSummary[] {
  if (!plan) return [];
  const references = (catalog?.moduleUnlocks || [])
    .filter((unlock) => unlock.active && unlock.planId === plan.id)
    .map(({ productId, moduleId }) => ({ productId, moduleId }));
  for (const key of plan.includedModuleKeys || []) {
    const split = key.lastIndexOf(":");
    if (split > 0 && split < key.length - 1) {
      references.push({ productId: key.slice(0, split), moduleId: key.slice(split + 1) });
    }
  }
  const result = new Map<string, SubscriptionModuleSummary>();
  for (const { productId, moduleId } of references) {
    const product = subscriptionProductFor(products, productId);
    const id = `${product?.documentId || product?.id || productId}:${moduleId}`;
    if (!result.has(id)) {
      result.set(id, {
        id,
        title: subscriptionUnlockName(products, productId, moduleId),
        productTitle: product?.title || `Course ID: ${productId}`,
      });
    }
  }
  return [...result.values()];
}
