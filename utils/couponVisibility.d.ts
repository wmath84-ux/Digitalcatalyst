// utils/couponVisibility.d.ts
//
// Types for the pure coupon-visibility helpers in `couponVisibility.js`.

export declare const FREE_PURCHASE_KINDS: string[];

export declare const isFreeProduct: (product: unknown) => boolean;

export declare const payableBeforeCouponPaise: (
  chargeableSubtotalPaise: number,
  couponDiscountPaise?: number,
) => number;

export declare const shouldShowCouponInput: (input?: {
  purchaseKind?: string | null;
  payablePaise?: number;
  isFree?: boolean;
}) => boolean;

declare const _default: typeof shouldShowCouponInput;
export default _default;
