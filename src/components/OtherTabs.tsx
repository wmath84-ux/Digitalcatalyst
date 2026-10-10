import { useMemo, useState } from "react";
import type { Product } from "../data/products";
import { useCatalog } from "../context/CatalogContext";
import { useCourseAccess, useOwnedProducts } from "../hooks/useCourseAccess";
import { ChevronRight, Search, X } from "lucide-react";
import { getProductClassLabel, getProductPresentation } from "../pdp/productPresentation";
import "../profile/profile-minimal.css";
import "./purchases-minimal.css";

function PurchasedProductRow({ item, permanent, onOpenCourse }: { item: Product; permanent: boolean; onOpenCourse: (course: { id: string; title: string }) => void }) {
  const { resolution, loading, hasActiveSubscription, subscription } = useCourseAccess({ product: item });
  const [imageFailed, setImageFailed] = useState(false);
  const identity = getProductPresentation(item);
  const full = permanent || resolution.hasFullProductAccess;
  const canOpen = full || resolution.accessibleModuleIds.size > 0 || resolution.accessibleResourceIds.size > 0;
  const moduleCount = resolution.ownedModuleIds.size;
  const resourceCount = resolution.ownedResourceIds.size;
  const planAccess = !permanent && full && hasActiveSubscription;
  const scope = planAccess ? "Plan access" : full ? "Full access" : [moduleCount ? `${moduleCount} module${moduleCount === 1 ? "" : "s"}` : "", resourceCount ? `${resourceCount} resource${resourceCount === 1 ? "" : "s"}` : "", !moduleCount && !resourceCount && resolution.ownedUpdateIds.size ? "Purchased update" : ""].filter(Boolean).join(" · ");
  const expiry = planAccess && subscription?.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  const metadata = [identity.typeLabel, getProductClassLabel(item), identity.subjectLabel].filter((part) => part && part.toLowerCase() !== "lifetime access").join(" · ");
  const open = () => {
    if (canOpen) onOpenCourse({ id: item.id, title: item.title });
    else window.location.hash = `#/product/${encodeURIComponent(item.id)}`;
  };
  return (
    <li data-purchase-entry={item.id} className="dc-purchases-row">
      <button type="button" data-purchase-access={item.id} data-access-scope={planAccess ? "plan" : full ? "full" : "partial"} aria-label={`${canOpen ? "Open" : "View access for"} ${identity.title}`} onClick={open} disabled={loading && !permanent}>
        {item.image && !imageFailed ? <img src={item.image} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : <span className="dc-purchases-image-fallback" aria-hidden="true">{identity.typeLabel}</span>}
        <span className="dc-purchases-copy">
          <strong className="dc-purchases-title" title={identity.title}>{identity.title}</strong>
          <small>{metadata}</small>
          <span className="dc-purchases-scope">{loading && !permanent ? "Checking access…" : scope || "Access details"}{expiry ? ` · Ends ${expiry}` : ""}</span>
          {!full && !loading ? <small>{canOpen ? "Only your purchased content is unlocked." : "Base access is required. View product details."}</small> : null}
        </span>
        <ChevronRight aria-hidden="true" className="dc-purchases-open-icon" />
      </button>
    </li>
  );
}

export function PurchasesTab({ purchased, onOpenCourse }: { purchased: Set<string>; onOpenCourse: (course: { id: string; title: string }) => void }) {
  const { products, loading: catalogLoading, error } = useCatalog();
  const { ownedProductIds: canonicalOwnedIds, accessibleProductIds, permanentProductIds, signedIn, loading: accessLoading, error: accessError } = useOwnedProducts();
  const ownedSet = useMemo(() => {
    const ids = new Set<string>(signedIn ? accessibleProductIds || canonicalOwnedIds : []);
    for (const id of purchased) ids.add(id);
    return ids;
  }, [accessibleProductIds, canonicalOwnedIds, purchased, signedIn]);
  const permanentSet = useMemo(() => new Set([...purchased, ...(permanentProductIds || [])]), [permanentProductIds, purchased]);
  const allItems = useMemo(() => products.filter((product) => ownedSet.has(product.id) || Boolean(product.documentId && ownedSet.has(product.documentId))), [products, ownedSet]);
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return !term ? allItems : allItems.filter((product) => [product.title, product.instructor, product.category, product.subject, product.classLevel, product.description, ...(product.tags || []), ...(product.searchKeywords || [])].filter(Boolean).join(" ").toLocaleLowerCase().includes(term));
  }, [allItems, query]);
  const loading = Boolean(catalogLoading || (accessLoading && !allItems.length));
  return (
    <section data-purchases-page className="dc-purchases-layout">
      <header className="dc-account-header"><div><h1>My Purchases</h1>{!loading ? <p className="dc-account-note">{allItems.length} {allItems.length === 1 ? "item" : "items"} · access details shown below</p> : null}</div></header>
      {accessError && allItems.length > 0 ? <p role="alert" className="dc-account-error">{accessError} Last verified purchases are shown.</p> : null}
      {allItems.length > 0 ? <div className="dc-purchases-search"><Search aria-hidden="true" /><input type="search" data-purchases-search aria-label="Search purchases" placeholder="Search purchases" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X aria-hidden="true" /></button> : null}</div> : null}
      {loading ? <div role="status" className="dc-purchases-empty"><p>Loading your purchases…</p><div className="dc-purchases-loading" aria-hidden="true" /></div> : (error || accessError) && !allItems.length ? <div role="alert" className="dc-purchases-empty"><p>Purchases could not be loaded.</p><p className="dc-account-note">{String(error || accessError)}</p><button type="button" onClick={() => window.location.reload()} className="dc-account-text-action">Retry</button></div> : allItems.length === 0 ? <div className="dc-purchases-empty"><h2>No purchases yet</h2><p className="dc-account-note">Bought and free-claimed content appears here.</p><button type="button" onClick={() => { window.location.hash = "#/store"; }} className="dc-account-primary">Browse Store</button></div> : items.length === 0 ? <div className="dc-purchases-empty"><h2>No matches</h2><p className="dc-account-note">Try a title, subject or instructor.</p></div> : <ul data-purchases-grid className="dc-purchases-list">{items.map((item) => <PurchasedProductRow key={item.id} item={item} permanent={permanentSet.has(item.id) || Boolean(item.documentId && permanentSet.has(item.documentId))} onOpenCourse={onOpenCourse} />)}</ul>}
    </section>
  );
}
