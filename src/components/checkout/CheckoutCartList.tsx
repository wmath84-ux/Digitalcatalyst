// src/components/checkout/CheckoutCartList.tsx
//
// The reference cart (Uiverse "warm-bulldog-97") shows a food order as rows of
// `thumbnail · title · meta · quantity · price`. Digital Catalyst sells
// courses, modules and resources, so a cart row here is:
//
//   · a 60px cover from the live catalog (`useCatalog`), the product title and
//     a quiet meta line (what kind of line it is, its parent course, how many
//     modules it carries) — the "product ka chhota sa image + title" row;
//   · a read-only unit chip where the reference had the quantity stepper,
//     because the server owns the quantity of a licence line; and
//   · the server-verified line price (with the struck-through regular price
//     when a sale applies).
//
// A scoped purchase (individual modules / resources / a paid update) never had
// a cart row in the reference — it had a list. So those lines render as the
// module list the brief asks for: one row per module with its own price tag,
// and catalogue/owned lines tagged rather than priced. Every amount is the
// verified `CheckoutLineItem.effectivePrice` in paise; nothing is recomputed
// here.

import {
  BadgeCheck,
  CircleCheck,
  FileText,
  Layers,
  Package,
  PackageOpen,
  Unlock,
} from "lucide-react";
import type { CheckoutLineItem } from "../../types/commerce";
import type { Product } from "../../data/products";
import { rupeeLabel } from "./RupeePrice";

const KIND_LABEL: Record<CheckoutLineItem["kind"], string> = {
  full_product: "Full course",
  selected_modules: "Module",
  selected_resources: "Resource",
  cart_bundle: "Cart bundle",
  paid_update: "Paid update",
  free_entitlement: "Free access",
  subscription: "Plan",
  subscription_features: "Add-on",
};

const KIND_ICON: Record<CheckoutLineItem["kind"], typeof Package> = {
  full_product: Package,
  selected_modules: PackageOpen,
  selected_resources: Unlock,
  cart_bundle: Layers,
  paid_update: BadgeCheck,
  free_entitlement: CircleCheck,
  subscription: Package,
  subscription_features: FileText,
};

/** The catalog cover for a line, when the catalog is reachable from checkout. */
export const lineImage = (
  line: CheckoutLineItem,
  products: readonly Product[]
): string | null => {
  if (!line.productId) return null;
  const product = products.find(
    (item) => item.id === line.productId || item.documentId === line.productId
  );
  if (!product) return null;
  return product.images?.find((source) => source.trim()) || product.image || null;
};

/** "3 modules · 12 resources" style summary for the meta line. */
const lineMeta = (line: CheckoutLineItem): string => {
  const parts: string[] = [KIND_LABEL[line.kind] || line.kind];
  if (line.parentTitle) parts.push(line.parentTitle);
  if (line.detailItems?.length) parts.push(`${line.detailItems.length} included`);
  return parts.join(" · ");
};

export function CheckoutCartRow({
  line,
  products,
}: {
  line: CheckoutLineItem;
  products: readonly Product[];
}) {
  const Icon = KIND_ICON[line.kind] || Package;
  const image = lineImage(line, products);
  const hasSale =
    line.salePrice !== null && line.salePrice !== undefined && line.salePrice < line.regularPrice;
  const payable = line.alreadyOwned ? 0 : line.effectivePrice;
  const units = Math.max(1, Math.round(line.quantity || 1));

  return (
    <article
      data-checkout-line-item
      data-checkout-cart-row
      data-line-kind={line.kind}
      data-line-id={line.id}
      data-owned={line.alreadyOwned ? "true" : "false"}
      className="cu-item"
    >
      <span className="cu-thumb" aria-hidden="true">
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" />
        ) : (
          <Icon />
        )}
      </span>

      <div className="cu-copy">
        <h3>{line.title}</h3>
        <p>{lineMeta(line)}</p>
        <span className="cu-units" data-checkout-line-units>
          {units} {units === 1 ? "licence" : "licences"}
        </span>
        {line.alreadyOwned || payable === 0 ? (
          <span className="cu-badges">
            {line.alreadyOwned ? (
              <span className="cu-badge cu-badge--owned">
                <CircleCheck size={11} aria-hidden="true" /> Already owned · no charge
              </span>
            ) : (
              <span className="cu-badge cu-badge--free">Free · no payment</span>
            )}
          </span>
        ) : null}
      </div>

      <div className="cu-item-price">
        {hasSale && !line.alreadyOwned ? <del>{rupeeLabel(line.regularPrice * units)}</del> : null}
        <strong data-checkout-line-amount={line.id}>
          {line.alreadyOwned ? "Included" : rupeeLabel(payable * units)}
        </strong>
      </div>
    </article>
  );
}

export interface CheckoutModuleListProps {
  kind: CheckoutLineItem["kind"];
  lines: CheckoutLineItem[];
}

/**
 * The module/resource/update list for a scoped purchase: every module the buyer
 * picked, in order, each with its own server-verified price tag.
 */
export function CheckoutModuleList({ kind, lines }: CheckoutModuleListProps) {
  const label = KIND_LABEL[kind] || "Item";
  return (
    <ol className="cu-modules" data-checkout-module-list={kind}>
      {lines.map((line, index) => {
        const payable = line.alreadyOwned ? 0 : line.effectivePrice;
        const units = Math.max(1, Math.round(line.quantity || 1));
        const tone = line.alreadyOwned ? "owned" : payable === 0 ? "muted" : "price";
        const hasSale =
          !line.alreadyOwned &&
          line.salePrice !== null &&
          line.salePrice !== undefined &&
          line.salePrice < line.regularPrice;
        return (
          <li
            key={line.id}
            data-checkout-line-item
            data-checkout-module-row
            data-line-kind={line.kind}
            data-line-id={line.id}
            className="cu-module"
          >
            <span className="cu-module-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="cu-module-copy">
              <strong>{line.title}</strong>
              <span>
                {label}
                {line.parentTitle ? ` · ${line.parentTitle}` : ""}
              </span>
            </span>
            {/* Price tag: the struck regular price reads first, then what this
                checkout actually charges — the same order the cart rows use. */}
            <span className="cu-price-tag" data-tone={tone}>
              {hasSale ? (
                <>
                  <del>{rupeeLabel(line.regularPrice * units)}</del>{" "}
                </>
              ) : null}
              {line.alreadyOwned
                ? "Already owned · ₹0"
                : payable === 0
                ? "Free · ₹0"
                : `${rupeeLabel(payable * units)}${units > 1 ? ` × ${units}` : ""}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export { KIND_LABEL as CHECKOUT_KIND_LABEL };
