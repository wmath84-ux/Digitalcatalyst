import type { CheckoutSelection } from "../../types/commerce";
import type { PaidContentRow } from "../../../utils/pdpPaidContent";

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const TYPE_LABEL = { selected_modules: "Module", selected_resources: "Resource", paid_update: "Update" };

export default function PdpPaidContent({ available, owned, selection, signedIn, loading, error, unavailable, onChoose, onReview, onRetry }: {
  available: PaidContentRow[]; owned: PaidContentRow[]; selection: CheckoutSelection;
  signedIn: boolean; loading: boolean; error?: string; unavailable: boolean;
  onChoose: (row: PaidContentRow, checked: boolean) => void;
  onReview: () => void; onRetry?: () => void;
}) {
  const selected = (row: PaidContentRow) => row.kind === selection.purchaseKind && (row.kind === "paid_update"
    ? selection.updateId === row.id : (row.kind === "selected_modules" ? selection.moduleIds : selection.resourceIds).includes(row.id));
  const selectedCount = selection.purchaseKind === "paid_update" ? Number(Boolean(selection.updateId))
    : selection.purchaseKind === "selected_modules" ? selection.moduleIds.length
      : selection.purchaseKind === "selected_resources" ? selection.resourceIds.length : 0;
  if (loading) return <p data-pdp-paid-loading className="dc-pdp-selection-note" role="status">Checking your purchased and available content…</p>;
  if (error) return <div className="dc-pdp-paid-error" role="alert"><p>{error}</p>{onRetry ? <button type="button" className="dc-pdp-text-action" onClick={onRetry}>Retry access check</button> : null}</div>;
  return (
    <div data-pdp-paid-content>
      <section data-pdp-paid-group="available" aria-labelledby="paid-available-title">
        <div className="dc-pdp-paid-heading"><h3 id="paid-available-title">{signedIn ? "Not yet owned" : "Available paid content"}</h3><span>{available.length} item{available.length === 1 ? "" : "s"}</span></div>
        <p className="dc-pdp-selection-note">{available.length ? "Choose the content you need. Select modules together; updates and standalone resources are checked out separately." : "There are no remaining paid add-ons published for this product."}</p>
        {available.length ? <ul className="dc-pdp-paid-list">{available.map((row) => {
          const inputId = `paid-choice-${row.kind}-${row.id}`;
          const checked = selected(row);
          const disabled = unavailable || !row.selectable;
          return (
            <li key={row.key} data-pdp-paid-item={row.key} data-selected={checked || undefined}>
              <div className="dc-pdp-paid-choice">
                <input id={inputId} type="checkbox" checked={checked} disabled={disabled}
                  aria-describedby={`${inputId}-info`} onChange={(event) => onChoose(row, event.currentTarget.checked)} />
                <div className="dc-pdp-paid-copy">
                  <span className="dc-pdp-paid-type">{TYPE_LABEL[row.kind]}{row.includedInBase ? " · Also in full product" : " · Optional add-on"}</span>
                  <label htmlFor={inputId}>{row.title}</label>
                  {row.description ? <p>{row.description}</p> : null}
                  {row.details.length ? <details className="dc-pdp-paid-includes"><summary>Included content ({row.details.length})</summary><ul>{row.details.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul></details> : null}
                  <p id={`${inputId}-info`} className="dc-pdp-paid-rule">{unavailable ? "Not available for purchase yet."
                    : row.requiresBase && !row.selectable ? "Get the base product first, then choose this update."
                    : !row.selectable ? "No active purchase option is published for this content."
                    : row.estimated ? "Estimated individual price. The final price is verified before payment."
                    : row.prerequisites?.length ? `Requires ${row.prerequisites.join(", ")}. Any unowned requirements are added to your selection.`
                    : row.includedInBase ? "Buy on its own or get it with the full product."
                    : "Not included with the base product."}</p>
                  {!row.owned && row.acquiredCount > 0 ? <p className="dc-pdp-paid-partial">{row.acquiredCount} included item{row.acquiredCount === 1 ? " is" : "s are"} already available to you. This does not unlock the whole {row.kind === "paid_update" ? "update" : "module"}.</p> : null}
                </div>
              </div>
              <div className="dc-pdp-paid-price">{row.effectivePrice !== null ? <>
                {row.regularPrice !== null && row.regularPrice > row.effectivePrice ? <s aria-label={`Original price ${money(row.regularPrice)}`}>{money(row.regularPrice)}</s> : null}
                <strong>{money(row.effectivePrice)}</strong>{row.estimated ? <span>Estimate</span> : null}
              </> : <span>Price unavailable</span>}</div>
            </li>
          );
        })}</ul> : null}
        {selectedCount > 0 ? <div data-pdp-paid-review className="dc-pdp-paid-review"><p>{selectedCount} item{selectedCount === 1 ? "" : "s"} selected. Itemised prices, sale savings and any coupon or referral reduction are shown in your purchase review.</p><button type="button" className="dc-pdp-text-action" onClick={onReview}>Review selection</button></div> : null}
        {!signedIn ? <p className="dc-pdp-selection-note"><a className="dc-pdp-text-action" href={`#/auth?mode=login&return=${encodeURIComponent(window.location.hash)}`}>Sign in</a> to see what you already own.</p> : null}
      </section>
      {owned.length > 0 ? <>
        <hr data-pdp-paid-divider className="dc-pdp-paid-divider" />
        <section data-pdp-paid-group="owned" aria-labelledby="paid-owned-title">
          <div className="dc-pdp-paid-heading"><h3 id="paid-owned-title">Already owned</h3><span>{owned.length} item{owned.length === 1 ? "" : "s"}</span></div>
          <p className="dc-pdp-selection-note">Your purchased or included content. No need to buy these items again; subscription access lasts only while your plan is active.</p>
          <ul className="dc-pdp-paid-list dc-pdp-owned-list">{owned.map((row) => <li key={row.key} data-pdp-owned-item={row.key}>
            <div className="dc-pdp-paid-copy"><span className="dc-pdp-paid-type">{TYPE_LABEL[row.kind]}</span><h4>{row.title}</h4><p>{row.ownershipLabel}</p>{row.accessNote ? <p className="dc-pdp-paid-rule">{row.accessNote}</p> : null}
              {row.details.length ? <details className="dc-pdp-paid-includes"><summary>Included content ({row.details.length})</summary><ul>{row.details.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul></details> : null}
            </div><span className="dc-pdp-owned-label">{row.accessSource === "subscription" ? "Included" : row.accessSource === "included" ? "Available" : "Owned"}</span>
          </li>)}</ul>
        </section>
      </> : null}
    </div>
  );
}
