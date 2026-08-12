"use client";

import { ProductEditor } from "@/components/admin/products/ProductEditor";

export default function ProductDetailPage({ id }: { id: string }) {
  return <ProductEditor productId={id} />;
}
