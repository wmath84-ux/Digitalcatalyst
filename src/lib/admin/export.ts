import { adminFetch } from "./client";

export async function exportAdminCsv(type: string) {
  let rows: Record<string, unknown>[] = [];
  if (type === "orders") rows = (await adminFetch<{ orders: Record<string, unknown>[] }>("/api/admin/orders")).orders;
  else if (type === "customers") rows = (await adminFetch<{ customers: Record<string, unknown>[] }>("/api/admin/customers")).customers;
  else if (type === "rewards") rows = (await adminFetch<{ transactions: Record<string, unknown>[] }>("/api/admin/rewards/transactions")).transactions;
  else if (type === "products") rows = (await adminFetch<{ products: Record<string, unknown>[] }>("/api/admin/products")).products;
  if (!rows.length) return;
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${(typeof value === "object" ? JSON.stringify(value) : String(value ?? "")).replace(/"/g, '""')}"`;
  const csv = [keys.map(escape).join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `digital-catalyst-${type}-${new Date().toISOString().slice(0,10)}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}
