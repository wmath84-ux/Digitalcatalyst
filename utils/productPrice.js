const parseProductPriceValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizePriceString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('₹') ? trimmed : `₹${trimmed}`;
};

const formatPrice = (value) => {
  if (!Number.isFinite(value)) return '₹0';
  return `₹${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
};

const formatPriceHistoryLabel = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  return raw.length > 14 ? raw.slice(0, 14) : raw;
};

export const getProductPriceDetails = (product) => {
  const rawOriginalPrice = parseProductPriceValue(product?.price);
  const originalPrice = Number.isFinite(rawOriginalPrice) ? rawOriginalPrice : 0;
  const normalizedSalePrice = normalizePriceString(product?.salePrice);
  const rawSalePrice = normalizedSalePrice ? parseProductPriceValue(normalizedSalePrice) : null;
  const currentPrice = rawSalePrice !== null ? rawSalePrice : originalPrice;
  return {
    originalPrice,
    currentPrice,
    displayPriceText: formatPrice(currentPrice),
    hasSalePrice: rawSalePrice !== null && rawSalePrice !== originalPrice,
  };
};

export const getProductPriceHistoryPoints = (product) => {
  const details = getProductPriceDetails(product);
  const rawHistory = Array.isArray(product?.priceHistory) ? (product.priceHistory || []) : [];

  const historyPoints = rawHistory
    .map((entry, index) => {
      const item = entry || {};
      const price = parseProductPriceValue(item.price ?? item.salePrice ?? item.value ?? item.amount);
      if (price === null) return null;
      return {
        label: formatPriceHistoryLabel(item.label ?? item.date ?? item.createdAt ?? item.updatedAt, `Update ${index + 1}`),
        price,
      };
    })
    .filter(Boolean);

  const points = historyPoints.slice(-6);

  if (points.length === 0 && Number.isFinite(details.originalPrice) && Number.isFinite(details.currentPrice) && Math.abs(details.originalPrice - details.currentPrice) >= 0.01) {
    points.push(
      { label: 'Original', price: details.originalPrice },
      { label: 'Current', price: details.currentPrice },
    );
  } else if (points.length === 1 && Number.isFinite(details.currentPrice) && Math.abs(points[0].price - details.currentPrice) >= 0.01) {
    points.push({ label: 'Current', price: details.currentPrice });
  }

  const distinctPrices = new Set(points.map((point) => point.price.toFixed(2)));
  return distinctPrices.size > 1 ? points : [];
};
