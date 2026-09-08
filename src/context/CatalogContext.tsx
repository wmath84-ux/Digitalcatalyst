import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import { subscribeShared } from "../lib/sharedSnapshot";
import { PUBLISHED_REVIEWS_KEY, publishedReviewsQuery } from "../hooks/useProductReviews";
import type { Product } from "../data/products";
import { firestoreToCatalogProduct, getProductPublicationStatus, isProductPublished } from "../../utils/productMapping";
import { fullDemoCourseContent } from "../data/demoCourseContent";

import { useAuth } from "./AuthContext";

interface CatalogContextValue {
  products: Product[];
  purchasedIds: Set<string>;
  loading: boolean;
  error: string | null;
}

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

const numericPrice = (value: unknown): number => {
  const amount = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

const mapCategory = (data: DocumentData): Product["category"] => {
  const raw = String(data.category || data.fileFormat || "Course").toLowerCase();
  if (raw.includes("pdf") || raw.includes("note")) return "PDF";
  if (raw.includes("ebook") || raw.includes("e-book")) return "E-book";
  if (raw.includes("live")) return "Live";
  return "Course";
};

const mapProduct = (documentId: string, data: DocumentData): Product => {
  const isFree = data.isFree === true;
  const salePrice = data.salePrice === undefined || data.salePrice === null || data.salePrice === ""
    ? numericPrice(data.price)
    : numericPrice(data.salePrice);
  const regularPrice = numericPrice(data.price);
  const configuredImages = [
    ...(Array.isArray(data.images) ? data.images : []),
    data.productImages?.card,
    data.image,
  ]
    .map((value) => String(value || "").trim())
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
  const image = configuredImages[0] || "/images/hero-main.jpg";
  const rating = Number(data.manualRating ?? data.rating ?? data.calculatedRating ?? 0);
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  const searchKeywords = [
    ...(Array.isArray(data.keywords) ? data.keywords : []),
    ...(Array.isArray(data.adminProduct?.searchKeywords) ? data.adminProduct.searchKeywords : []),
  ].map(String).filter((value, index, list) => Boolean(value.trim()) && list.indexOf(value) === index);
  const features = Array.isArray(data.features)
    ? data.features.map((value) => String(value).trim()).filter(Boolean)
    : [];

  // Round-trip-safe Part 1 mapping: every commerce/access field on modules,
  // resources, and paid updates is preserved end-to-end.
  const catalogProjection = firestoreToCatalogProduct(data, documentId) || {
    documentId,
    canonicalModules: [],
    paidUpdates: [],
    courseContent: [],
  };

  return {
    id: String(data.id ?? documentId),
    documentId,
    title: String(data.title || "Untitled product"),
    instructor: String(data.instructor?.name || data.instructor || data.author || data.brand || "Digital Catalyst"),
    image,
    images: configuredImages.length > 0 ? configuredImages : [image],
    category: mapCategory(data),
    classLevel: String(data.dimensions || data.level || "Lifetime access"),
    subject: String(data.subject || data.category || "Digital learning"),
    tags: tags.map((tag) => tag.toUpperCase()),
    // Admin-configured store filter chips this product is attached to.
    filterIds: [
      ...(Array.isArray(data.filterIds) ? data.filterIds : []),
      ...(Array.isArray(data.adminProduct?.filterIds) ? data.adminProduct.filterIds : []),
    ]
      .map((value) => String(value || "").trim())
      .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index),
    searchKeywords,
    rating: Number.isFinite(rating) ? rating : 0,
    reviews: Number(data.reviewCount ?? data.ratingCount ?? 0) || 0,
    originalPrice: isFree ? 0 : Math.max(regularPrice, salePrice),
    features: features.length > 0 ? features : undefined,
    price: isFree ? 0 : salePrice,
    isFree,
    description: String(data.description || ""),
    paymentLink: String(data.paymentLink || ""),
    status: getProductPublicationStatus(data),
    // A repaired status/isVisible mismatch may be shown immediately, but keep
    // checkout disabled until the admin re-saves it (the quote server still
    // correctly rejects legacy isVisible=false documents).
    availableForSale: data.isVisible !== false && data.inStock !== false && data.availableForSale !== false,
    courseContent: (catalogProjection.courseContent as Product["courseContent"])?.length
      ? catalogProjection.courseContent as Product["courseContent"]
      : fullDemoCourseContent,
    canonicalModules: catalogProjection.canonicalModules?.length
      ? catalogProjection.canonicalModules
      : undefined,
    paidUpdates: catalogProjection.paidUpdates?.length
      ? catalogProjection.paidUpdates
      : undefined,
  };
};

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [baseProducts, setBaseProducts] = useState<Product[]>([]);
  const [ratingAggregates, setRatingAggregates] = useState<Map<string, { sum: number; count: number }>>(new Map());
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Stale-while-revalidate (see firebase.ts — persistentLocalCache):
    // with the IndexedDB persistent cache enabled the listener's FIRST
    // callback is the cached snapshot (metadata.fromCache === true), which
    // lets the catalog paint instantly on every warm app open while the
    // live snapshot refreshes silently in the background.
    const unsubscribe = onSnapshot(collection(db, "siteProducts"), (snapshot) => {
      const fromCache = snapshot.metadata.fromCache === true;
      const next = snapshot.docs
        .map((item) => ({ data: item.data(), id: item.id }))
        // `status` is authoritative. This repairs old documents created as
        // status=published + isVisible=false by the broken publish button,
        // while legacy documents without status still use isVisible.
        .filter((item) => isProductPublished(item.data))
        .map((item) => mapProduct(item.id, item.data))
        .sort((a, b) => a.title.localeCompare(b.title));

      if (fromCache) {
        // Cached data, however old, is always paint-worthy: it clears the
        // skeleton immediately on warm loads (online or offline).
        if (next.length > 0) {
          setBaseProducts(next);
          setError(null);
          setLoading(false);
        }
        // An EMPTY cache only happens on a genuinely cold device: keep the
        // skeleton up and wait for the server result instead of flashing an
        // empty catalog (or, offline, an endless skeleton that the error
        // handler below used to turn into a false error screen).
        return;
      }

      // Live server snapshot — authoritative.
      setBaseProducts(next);
      setError(null);
      setLoading(false);
    }, (snapshotError) => {
      console.error("Catalog sync failed", snapshotError);
      // Permission-denied / invalid-argument style failures are genuine:
      // surface the error. A network failure on a COLD cache is the one
      // offline-first edge — there is nothing cached to show yet, so fall
      // back to a clear (retryable) message instead of hanging on the
      // skeleton forever. On a warm cache the listener already painted
      // cached products above, so this branch keeps that list in place
      // (setBaseProducts with the same value) and only raises the error
      // banner when the screen would otherwise be blank.
      setBaseProducts((current) => {
        if (current.length === 0) {
          setError("The live catalog could not be loaded. Please check your connection and try again shortly.");
        }
        return current;
      });
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Live rating aggregate: once a learner publishes a review, the product's
  // average rating and review count are recomputed from approved reviews and
  // reflected everywhere that reads `product.rating` / `product.reviews`.
  //
  // Shares the ONE published-reviews listener with `useProductReviews` (Home
  // rail + PDP) via the registry in src/lib/sharedSnapshot.ts. Before this the
  // same collection query was open twice on every app open, doubling the
  // document reads for identical data.
  useEffect(() => {
    return subscribeShared(PUBLISHED_REVIEWS_KEY, publishedReviewsQuery, (docs, snapshotError) => {
      if (snapshotError) {
        console.error("Review aggregate sync failed", snapshotError);
        setRatingAggregates(new Map());
        return;
      }
      const aggregates = new Map<string, { sum: number; count: number }>();
      docs.forEach((item) => {
        const data = item.data || {};
        const productId = String(data.productId || data.productDocumentId || "").trim();
        const rating = Number(data.rating || 0);
        if (!productId || !Number.isFinite(rating) || rating <= 0) return;
        const current = aggregates.get(productId) || { sum: 0, count: 0 };
        current.sum += rating;
        current.count += 1;
        aggregates.set(productId, current);
      });
      setRatingAggregates(aggregates);
    });
  }, []);

  const products = useMemo(
    () => baseProducts.map((product) => {
      const aggregate = ratingAggregates.get(product.id) || ratingAggregates.get(product.documentId || "");
      if (!aggregate || aggregate.count === 0) return product;
      const average = Math.round((aggregate.sum / aggregate.count) * 10) / 10;
      return { ...product, rating: average, reviews: aggregate.count };
    }),
    [baseProducts, ratingAggregates],
  );

  useEffect(() => {
    if (!user) {
      setPurchasedIds(new Set());
      return undefined;
    }
    // Shared with `useCourseAccess` (same subcollection, same shape), so the
    // player/PDP no longer re-download the learner's purchases alongside the
    // catalog's own copy.
    return subscribeShared(`users/${user.id}/purchases`, () => collection(db, "users", user.id, "purchases"), (docs, purchaseError) => {
      if (purchaseError) {
        console.error("Purchase entitlement sync failed", purchaseError);
        setPurchasedIds(new Set());
        return;
      }
      const ids = new Set<string>();
      docs.forEach((item) => {
        const data = item.data || {};
        ids.add(String(item.id));
        if (data.productDocumentId != null) ids.add(String(data.productDocumentId));
        if (data.productId != null) ids.add(String(data.productId));
      });
      setPurchasedIds(ids);
    });
  }, [user]);

  const value = useMemo(() => ({ products, purchasedIds, loading, error }), [products, purchasedIds, loading, error]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog must be used within CatalogProvider");
  return context;
}
