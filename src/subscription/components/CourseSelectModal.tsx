import { useState } from "react";
import {
  GlassSheet,
  GlassSheetContent,
  GlassSheetTitle,
  GlassSheetDescription,
} from "../../components/ui/glass-sheet";
import type { Product } from "../../data/products";
import { formatSubscriptionMoney } from "./PriceSummary";

interface Props {
  open: boolean;
  selected: string[];
  onClose: () => void;
  onChangeSelected: (ids: string[]) => void;
  products: Product[];
  purchasedIds?: Set<string> | string[];
}
/** Canonical checkout uses document IDs; also recognise legacy public aliases. */
const productKeys = (product: Product) =>
  Array.from(
    new Set(
      [product.documentId, product.id].map((value) => String(value || "").trim()).filter(Boolean)
    )
  );

export default function CourseSelectModal({
  open,
  selected,
  onClose,
  onChangeSelected,
  products,
  purchasedIds,
}: Props) {
  const [query, setQuery] = useState("");
  const purchasedSet = purchasedIds instanceof Set ? purchasedIds : new Set(purchasedIds || []);
  const filtered = products.filter((product) =>
    `${product.title} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  return (
    <GlassSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <GlassSheetContent
        side="bottom"
        className="dc-subscription-picker flex max-h-[85vh] flex-col"
        aria-label="Choose course add-ons"
        data-subscription-product-sheet
      >
        <header>
          <div>
            <GlassSheetTitle>Choose course add-ons</GlassSheetTitle>
            <GlassSheetDescription>
              Prices apply to the selected plan and duration.
            </GlassSheetDescription>
          </div>
          <button
            type="button"
            className="dc-subscription-text-action"
            onClick={onClose}
            aria-label="Close course picker"
          >
            Close
          </button>
        </header>
        <input
          type="search"
          aria-label="Search course add-ons"
          placeholder="Search courses"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="dc-subscription-picker-list">
          {filtered.length ? (
            <ul>
              {filtered.map((product) => {
                const keys = productKeys(product);
                const checkoutId = String(product.documentId || product.id);
                const checked = keys.some((key) => selected.includes(key));
                const purchased = keys.some((key) => purchasedSet.has(key));
                const toggle = () => {
                  if (purchased) return;
                  const withoutAliases = selected.filter((id) => !keys.includes(id));
                  onChangeSelected(checked ? withoutAliases : [...withoutAliases, checkoutId]);
                };
                return (
                  <li key={checkoutId}>
                    <label
                      className="dc-subscription-pick-row"
                      data-subscription-product-pick={checkoutId}
                      data-purchased={purchased ? "true" : "false"}
                    >
                      <input
                        type="checkbox"
                        checked={checked || purchased}
                        disabled={purchased}
                        onChange={toggle}
                      />
                      <span>
                        <strong>{product.title}</strong>
                        <small>
                          {product.category}
                          {product.instructor ? ` · ${product.instructor}` : ""}
                        </small>
                      </span>
                      <span className="dc-subscription-pick-price">
                        {!purchased && product.originalPrice > product.price ? (
                          <del>
                            {formatSubscriptionMoney(Math.round(product.originalPrice * 100))}
                          </del>
                        ) : null}
                        <strong>
                          {formatSubscriptionMoney(purchased ? 0 : Math.round(product.price * 100))}
                        </strong>
                        {purchased ? <small>Purchased</small> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dc-subscription-note">
              {query ? "No courses match your search." : "No courses are currently available."}
            </p>
          )}
        </div>
        <button type="button" className="dc-subscription-primary" onClick={onClose}>
          Done
        </button>
      </GlassSheetContent>
    </GlassSheet>
  );
}
