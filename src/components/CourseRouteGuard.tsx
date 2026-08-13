// src/components/CourseRouteGuard.tsx
//
// Part 10 — single canonical course-route guard. Replaces
// the inline `purchasedIds.has(productId)` check in
// `src/main.tsx`. The guard uses `useCourseAccess` to decide:
//
//   - If the user has NO access to the product (no base, no
//     module, no resource, no active subscription grant), fall
//     through to the PDP so the user can buy what they need.
//   - Otherwise, open the Course Player directly.
//
// This implements the Part 10 rule: "Do not require
// full-product ownership when user owns a valid
// module/resource."

import { useCourseAccess } from "../hooks/useCourseAccess";
import CoursePlayerApp from "../CoursePlayerApp";
import PdpApp from "../PdpApp";
import type { PaidCourseUpdate } from "../types/course";
import type { Product } from "../data/products";

interface Props {
  product: Product;
  onCheckout: (price: number) => void;
  onBack: () => void;
  onPurchaseUpdate: (update: PaidCourseUpdate) => void;
}

const PDP_WITH_OWNERSHIP = ({ product, onCheckout, onBack }: Pick<Props, "product" | "onCheckout" | "onBack">) => (
  <PdpApp product={product} onCheckout={onCheckout} onBack={onBack} />
);

export default function CourseRouteGuard({ product, onCheckout, onBack, onPurchaseUpdate }: Props) {
  const { resolution, loading, signedIn } = useCourseAccess({ product });

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-50 text-sm text-slate-500">
        <div className="flex flex-col items-center gap-2">
          <span className="h-3 w-3 animate-pulse rounded-full bg-violet-300" />
          <p>Verifying course access…</p>
        </div>
      </div>
    );
  }

  // The Part 10 spec: "Do not require full-product ownership when
  // user owns a valid module/resource." The user opens the
  // Course Player whenever they have any access at all
  // (full_product, module_purchase, resource_purchase,
  // paid_update, or active subscription).
  const hasAnyAccess =
    resolution.hasFullProductAccess ||
    resolution.ownedModuleIds.size > 0 ||
    resolution.ownedResourceIds.size > 0 ||
    resolution.ownedUpdateIds.size > 0 ||
    resolution.subscriptionGrantedModuleIds.size > 0;

  if (!signedIn) {
    // Anonymous user → show the PDP (so the login CTA can fire).
    return <PDP_WITH_OWNERSHIP product={product} onCheckout={onCheckout} onBack={onBack} />;
  }

  if (hasAnyAccess) {
    return (
      <CoursePlayerApp
        product={product}
        onBack={onBack}
        onPurchaseUpdate={onPurchaseUpdate}
      />
    );
  }

  return <PDP_WITH_OWNERSHIP product={product} onCheckout={onCheckout} onBack={onBack} />;
}
