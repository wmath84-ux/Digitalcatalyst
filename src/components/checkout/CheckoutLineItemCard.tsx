// src/components/checkout/CheckoutLineItemCard.tsx
//
// Itemised line-item card used by the Checkout Review + Success pages.
// Each card shows: type, title, parent, regular price, sale price,
// discount, effective total, and the already-owned badge when relevant.

import { BadgeCheck, CircleCheck, Package, PackageOpen, Unlock } from "lucide-react";
import { GlassCard } from "../ui/GlassCard";
import type { CheckoutLineItem } from "../../types/commerce";
import { formatPaise } from "../../utils/money";

const KIND_LABEL: Record<CheckoutLineItem["kind"], string> = {
  full_product: "Course",
  selected_modules: "Module",
  selected_resources: "Resource",
  cart_bundle: "Bundle",
  paid_update: "Update",
  free_entitlement: "Free",
  subscription: "Plan",
  subscription_features: "Add-on",
};

const KIND_ICON: Record<CheckoutLineItem["kind"], typeof Package> = {
  full_product: Package,
  selected_modules: PackageOpen,
  selected_resources: Unlock,
  cart_bundle: Package,
  paid_update: BadgeCheck,
  free_entitlement: CircleCheck,
  subscription: Package,
  subscription_features: PackageOpen,
};

const formatRupee = formatPaise;

export interface CheckoutLineItemCardProps {
  line: CheckoutLineItem;
  /** When true, the card is read-only (Success page). */
  readOnly?: boolean;
}

export default function CheckoutLineItemCard({ line, readOnly }: CheckoutLineItemCardProps) {
  const Icon = KIND_ICON[line.kind] || Package;
  const label = KIND_LABEL[line.kind] || line.kind;
  const hasSale = line.salePrice !== null && line.salePrice !== undefined && line.salePrice < line.regularPrice;
  const discount = Math.max(0, line.regularPrice - line.effectivePrice);
  return (
    <GlassCard
      data-checkout-line-item
      data-line-kind={line.kind}
      data-line-id={line.id}
      className={line.alreadyOwned ? "ring-1 ring-emerald-400/40" : ""}
      contentClassName="p-3 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/15 text-indigo-200">
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/75">
              {label}
            </span>
            {line.alreadyOwned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30">
                <CircleCheck size={10} /> Already owned
              </span>
            ) : null}
            {line.quantity > 1 ? (
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/75">
                × {line.quantity}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-sm font-black text-white line-clamp-2 break-words">{line.title}</h3>
          {line.parentTitle ? (
            <p className="mt-0.5 truncate text-xs text-white/55">From “{line.parentTitle}”</p>
          ) : null}
          {!readOnly && line.alreadyOwned ? (
            <p className="mt-1 text-[11px] font-semibold text-emerald-200">
              You already own this — no charge applied.
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {line.alreadyOwned ? (
            <span className="text-sm font-black text-emerald-200">Included</span>
          ) : (
            <>
              <p className="text-sm font-black text-white">
                {formatRupee(line.effectivePrice * line.quantity)}
              </p>
              {hasSale ? (
                <p className="text-[11px] text-white/55 line-through">
                  {formatRupee(line.regularPrice * line.quantity)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      {hasSale && !line.alreadyOwned ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-[11px] text-white/75">
          <span>Sale saving</span>
          <span className="font-black text-emerald-200">− {formatRupee(discount * line.quantity)}</span>
        </div>
      ) : null}
    </GlassCard>
  );
}
