// Display helpers for server-authoritative money values.
// Every ServerPriceQuote amount (cashPayable, line prices, discounts)
// is stored in **integer paise**. UI must convert before rendering.

export const paiseToRupees = (paise: number): number => {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(Number(paise)) / 100;
};

/** Format a paise integer as a buyer-facing rupee string. */
export const formatPaise = (paise: number): string => {
  const rupees = paiseToRupees(paise);
  if (rupees === 0) return "Free";
  const display = Number.isInteger(rupees) ? rupees : Number(rupees.toFixed(2));
  return `₹${display.toLocaleString("en-IN")}`;
};
