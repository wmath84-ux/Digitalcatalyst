export function formatINR(value: number): string {
  const rounded = Math.round(value);
  return `₹${rounded.toLocaleString("en-IN")}`;
}
