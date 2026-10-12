/** Alternating four-card grids and four-card shelves, without duplicates.
 * Run after filtering/sorting so discovery never escapes the selected catalog. */
export function buildStoreShelves<T>(products: readonly T[]) {
  return Array.from({ length: Math.ceil(products.length / 8) }, (_, group) => {
    const offset = group * 8;
    return {
      offset,
      gridProducts: products.slice(offset, offset + 4),
      railProducts: products.slice(offset + 4, offset + 8),
    };
  });
}
