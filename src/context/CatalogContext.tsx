import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import type { Product } from "../data/products";
import { firestoreToCatalogProduct } from "../../utils/productMapping";

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
    originalPrice: Math.max(regularPrice, salePrice),
    price: salePrice,
    description: String(data.description || ""),
    paymentLink: String(data.paymentLink || ""),
    courseContent: catalogProjection.courseContent as Product["courseContent"],
    canonicalModules: catalogProjection.canonicalModules,
    paidUpdates: catalogProjection.paidUpdates,
  };
};

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
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
      setProducts(next);
      setError(null);
      setLoading(false);
    }, (snapshotError) => {
      console.error("Catalog sync failed", snapshotError);
      setProducts([]);
      setError("The live catalog could not be loaded. Please try again shortly.");
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setPurchasedIds(new Set());
      return undefined;
    }
    return onSnapshot(collection(db, "users", user.id, "purchases"), (snapshot) => {
      setPurchasedIds(new Set(snapshot.docs.map((item) => String(item.data().productDocumentId ?? item.id))));
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
