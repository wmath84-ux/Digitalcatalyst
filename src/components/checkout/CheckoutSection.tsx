import type { ComponentProps, ReactNode } from "react";
import { paiseToRupees } from "../../utils/money";

/** Checkout-local plain section. It is not a shared glass/theme primitive. */
export default function CheckoutSection({
  children,
  className = "",
  contentClassName: _legacySpacing,
  ...props
}: ComponentProps<"section"> & { children?: ReactNode; contentClassName?: string }) {
  return (
    <section {...props} className={`dc-checkout-section ${className}`}>
      {children}
    </section>
  );
}
export const formatCheckoutMoney = (paise: number): string =>
  `₹${paiseToRupees(paise).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function CheckoutAction({
  variant: _variant,
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: string }) {
  return <button type="button" {...props} className={`dc-checkout-text-action ${className}`} />;
}
