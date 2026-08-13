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
//
// DEMO MODE: When the product has demo course content
// (courseContent with modules) and the URL contains
// ?demo=true, the Course Player opens directly even
// without purchase — useful for testing all file types.

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

/** Check if demo mode is requested via URL or localStorage */
const isDemoMode = () => {
  try {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    return url.searchParams.get("demo") === "true" || localStorage.getItem("dc_demo_mode") === "true";
  } catch {
    return false;
  }
};

export default function CourseRouteGuard({ product, onCheckout, onBack, onPurchaseUpdate }: Props) {
  const { resolution, loading, signedIn } = useCourseAccess({ product });

  // Demo mode: if the product has courseContent and demo mode is active,
  // open the Course Player directly regardless of access.
  const hasDemoContent = (product.courseContent || []).length > 0;
  const demo = isDemoMode() && hasDemoContent;

  if (loading && !demo) {
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

  // Demo mode bypasses access check — all modules render as "included"
  if (demo) {
    return (
      <div className="relative">
        {/* Demo mode banner */}
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-white shadow-lg">
          <span className="text-xs font-black uppercase tracking-wider">Demo Mode — All 12 File Types</span>
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem("dc_demo_mode"); } catch {}
              const url = new URL(window.location.href);
              url.searchParams.delete("demo");
              window.location.replace(url.toString());
            }}
            className="rounded-lg bg-white/20 px-2.5 py-1 text-[10px] font-black hover:bg-white/30"
          >
            Exit Demo
          </button>
        </div>
        <div className="pt-10">
          <CoursePlayerApp
            product={product}
            onBack={onBack}
            onPurchaseUpdate={onPurchaseUpdate}
          />
        </div>
      </div>
    );
  }

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
