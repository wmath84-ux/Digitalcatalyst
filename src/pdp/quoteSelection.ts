import type { CheckoutSelection } from "../types/commerce";

/** Only identities and a coupon are sent to pricing; never client totals. */
export function pdpSelectionKey(selection: CheckoutSelection): string {
  return JSON.stringify({
    kind: selection.purchaseKind,
    products: [...selection.productIds].sort(),
    modules: [...selection.moduleIds].sort(),
    resources: [...selection.resourceIds].sort(),
    update: selection.updateId,
    coupon: selection.couponCode || null,
  });
}
