import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import type { Product } from "../data/products";
import { firestoreToCatalogProduct } from "../../utils/productMapping";
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
    rating: Number.isFinite(rating) ? rating : 0,
    reviews: Number(data.reviewCount ?? data.ratingCount ?? 0) || 0,
    originalPrice: isFree ? 0 : Math.max(regularPrice, salePrice),
    features: features.length > 0 ? features : undefined,
    price: isFree ? 0 : salePrice,
    isFree,
    description: String(data.description || ""),
    paymentLink: String(data.paymentLink || ""),
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
    const unsubscribe = onSnapshot(collection(db, "siteProducts"), (snapshot) => {
      const next = snapshot.docs
        .map((item) => ({ data: item.data(), id: item.id }))
        .filter((item) => item.data.isVisible !== false)
        .map((item) => mapProduct(item.id, item.data))
        .sort((a, b) => a.title.localeCompare(b.title));
      setBaseProducts(next);
      setError(null);
      setLoading(false);
    }, (snapshotError) => {
      console.error("Catalog sync failed", snapshotError);
      setBaseProducts([]);
      setError("The live catalog could not be loaded. Please try again shortly.");
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Live rating aggregate: once a learner publishes a review, the product's
  // average rating and review count are recomputed from approved reviews and
  // reflected everywhere that reads `product.rating` / `product.reviews`.
  useEffect(() => {
    const published = query(collection(db, "siteReviews"), where("status", "==", "published"));
    return onSnapshot(published, (snapshot) => {
      const aggregates = new Map<string, { sum: number; count: number }>();
      snapshot.docs.forEach((item) => {
        const data = item.data() || {};
        const productId = String(data.productId || data.productDocumentId || "").trim();
        const rating = Number(data.rating || 0);
        if (!productId || !Number.isFinite(rating) || rating <= 0) return;
        const current = aggregates.get(productId) || { sum: 0, count: 0 };
        current.sum += rating;
        current.count += 1;
        aggregates.set(productId, current);
      });
      setRatingAggregates(aggregates);
    }, (reviewsError) => {
      console.error("Review aggregate sync failed", reviewsError);
      setRatingAggregates(new Map());
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
    return onSnapshot(collection(db, "users", user.id, "purchases"), (snapshot) => {
      const ids = new Set<string>();
      snapshot.docs.forEach((item) => {
        const data = item.data() || {};
        ids.add(String(item.id));
        if (data.productDocumentId != null) ids.add(String(data.productDocumentId));
        if (data.productId != null) ids.add(String(data.productId));
      });
      setPurchasedIds(ids);
    }, (purchaseError) => {
      console.error("Purchase entitlement sync failed", purchaseError);
      setPurchasedIds(new Set());
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
