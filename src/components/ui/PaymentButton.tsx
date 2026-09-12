import { forwardRef, useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import "./payment-button.css";
import { cn } from "@/lib/utils";

/**
 * PaymentButton — the app's ONE payment CTA.
 *
 * A faithful React port of Creatlydev's "pretty-grasshopper-57" Uiverse
 * button (https://uiverse.io/Creatlydev/pretty-grasshopper-57); the complete
 * visual behaviour (white capsule, brand-coloured icon plate, the colour
 * panel that wipes in from the left over .3s, the label that turns white in
 * the same beat, the soft 10/10/20 drop shadow, the 24px radius that renders
 * as a capsule at the reference's 40px height) lives in `payment-button.css`
 * and is not re-interpreted here.
 *
 * It is used for EVERY payment / purchase / checkout action in the product —
 * checkout, cart, product detail, the purchase builder, the subscription bar,
 * subscription upgrade + renewal CTAs and the Razorpay gateway itself — so
 * those surfaces can never drift apart. Only contextual properties differ
 * between call sites: `label`, `size`, `block`, `loading`, `disabled` and the
 * click handler. This component holds NO payment logic of its own: it renders
 * a real <button> and forwards every native prop (onClick, type, form,
 * aria-*, data-*) to it, so the caller's payment behaviour, server calls,
 * redirects, error handling and route guards run exactly as before.
 *
 * The reference paints a 24px payments glyph in a 48×40 plate. `icon` swaps
 * that glyph for the caller's own (same slot, same plate) for the rare CTA
 * whose meaning is carried by a different symbol — the plate, size and
 * position are the reference's either way.
 */

export type PaymentButtonSize = "sm" | "md" | "lg";

export interface PaymentButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visible payment label. Stays contextual per call site ("Pay ₹499 securely", "Subscribe", …). */
  label: ReactNode;
  /** Existing loading behaviour. Renders the reference's filled state with a spinner in the plate. */
  loading?: boolean;
  /** Stretch the pill to the row it owns (checkout / sticky bars). Material unchanged. */
  block?: boolean;
  /** Scale variant — pure `font-size`, so every proportion stays the reference's. */
  size?: PaymentButtonSize;
  /** The reference's `--clr`: the colour of the icon plate and of the hover wipe. */
  color?: string;
  /** Optional glyph replacement for the reference's icon slot. */
  icon?: ReactNode;
  /** Accessible name override (defaults to the visible label). */
  ariaLabel?: string;
  /** Contract hooks may also be written literally: `data-foo="bar"`. */
  [dataAttribute: `data-${string}`]: string | undefined;
}

/**
 * The reference's own SVG (Uiverse `icon-payments-cat`): a translucent
 * gradient disc with the white lightning-path glyph, mask-repaired for the
 * crisp inner edge. Kept verbatim; only the gradient/mask ids are made unique
 * per instance so many buttons on one page never share an id.
 */
function PaymentsGlyph() {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `uzp-mask-${uid}`;
  const gradId = `uzp-grad-${uid}`;
  const markPath =
    "M34.42 15.93c.382-1.145-.706-2.234-1.851-1.852l-18.568 6.189c-1.186.395-1.362 2-.29 2.644l5.12 3.072a1.464 1.464 0 001.733-.167l5.394-4.854a1.464 1.464 0 011.958 2.177l-5.154 4.638a1.464 1.464 0 00-.276 1.841l3.101 5.17c.644 1.072 2.25.896 2.645-.29L34.42 15.93z";
  const maskPath =
    "M25.958 20.962l-1.47-1.632 1.47 1.632zm2.067.109l-1.632 1.469 1.632-1.469zm-.109 2.068l-1.469-1.633 1.47 1.633zm-5.154 4.638l-1.469-1.632 1.469 1.632zm-.276 1.841l-1.883 1.13 1.883-1.13zM34.42 15.93l-2.084-.695 2.084.695zm-19.725 6.42l18.568-6.189-1.39-4.167-18.567 6.19 1.389 4.166zm5.265 1.75l-5.12-3.072-2.26 3.766 5.12 3.072 2.26-3.766zm2.072 3.348l5.394-4.854-2.938-3.264-5.394 4.854 2.938 3.264zm5.394-4.854a.732.732 0 01-1.034-.054l3.265-2.938a3.66 3.66 0 00-5.17-.272l2.939 3.265zm-1.034-.054a.732.732 0 01.054-1.034l2.938 3.265a3.66 3.66 0 00.273-5.169l-3.265 2.938zm.054-1.034l-5.154 4.639 2.938 3.264 5.154-4.638-2.938-3.265zm1.023 12.152l-3.101-5.17-3.766 2.26 3.101 5.17 3.766-2.26zm4.867-18.423l-6.189 18.568 4.167 1.389 6.19-18.568-4.168-1.389zm-8.633 20.682c1.61 2.682 5.622 2.241 6.611-.725l-4.167-1.39a.732.732 0 011.322-.144l-3.766 2.26zm-6.003-8.05a3.66 3.66 0 004.332-.419l-2.938-3.264a.732.732 0 01.866-.084l-2.26 3.766zm3.592-1.722a3.66 3.66 0 00-.69 4.603l3.766-2.26c.18.301.122.687-.138.921l-2.938-3.264zm11.97-9.984a.732.732 0 01-.925-.926l4.166 1.389c.954-2.861-1.768-5.583-4.63-4.63l1.39 4.167zm-19.956 2.022c-2.967.99-3.407 5.003-.726 6.611l2.26-3.766a.732.732 0 01-.145 1.322l-1.39-4.167z";

  return (
    <svg
      className="uzp-pay__glyph"
      viewBox="0 0 50 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle opacity="0.5" cx="25" cy="25" r="23" fill={`url(#${gradId})`} />
      <mask id={maskId} fill="#fff">
        <path fillRule="evenodd" clipRule="evenodd" d={markPath} />
      </mask>
      <path fillRule="evenodd" clipRule="evenodd" d={markPath} fill="#fff" />
      <path d={maskPath} fill="#fff" mask={`url(#${maskId})`} />
      <defs>
        <linearGradient id={gradId} x1="25" y1="2" x2="25" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.71" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="uzp-pay__spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const PaymentButton = forwardRef<HTMLButtonElement, PaymentButtonProps>(function PaymentButton(
  {
    label,
    loading = false,
    block = false,
    size = "md",
    color,
    icon,
    ariaLabel,
    className,
    style,
    type = "button",
    disabled,
    children: _ignoredChildren,
    ...props
  },
  ref,
) {
  const isDisabled = Boolean(disabled);
  const rootStyle = {
    ...(color ? { "--uzp-clr": color } : null),
    ...style,
  } as CSSProperties;

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      data-uzp-state={loading ? "loading" : undefined}
      className={cn("uzp-pay", `uzp-pay--${size}`, block && "uzp-pay--block", className)}
      style={rootStyle}
    >
      <span className="uzp-pay__decor" aria-hidden="true" />
      <span className="uzp-pay__content">
        <span className="uzp-pay__icon">
          {loading ? <Spinner /> : icon === null ? null : (icon ?? <PaymentsGlyph />)}
        </span>
        <span className="uzp-pay__text">{label}</span>
      </span>
    </button>
  );
});

export default PaymentButton;
