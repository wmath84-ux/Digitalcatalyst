"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, Pill, RecordCard, SecondaryButton, Sheet, inputClass, selectClass } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";
import { exportAdminCsv } from "@/lib/admin/export";

type OrderRow = {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  purchaseKind: string;
  items: { title: string }[] | null;
  couponCode: string | null;
  coinsUsed: number;
  cashPaid: string;
  finalAmount: string;
  paymentStatus: string;
  entitlementStatus: string;
  createdAt: string;
};

const STATUS_TONE: Record<string, "success" | "warn" | "danger" | "default"> = {
  verified: "success",
  captured: "success",
  access_granted: "success",
  created: "default",
  payment_pending: "warn",
  authorized: "warn",
  failed: "danger",
  cancelled: "danger",
  refunded: "warn",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (kind) params.set("kind", kind);
      const res = await adminFetch<{ orders: OrderRow[] }>(`/api/admin/orders?${params.toString()}`);
      setOrders(res.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, kind]);

  const exportCsv = () => void exportAdminCsv("orders");

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!orders) return <LoadingState label="Loading orders…" />;

  return (
    <div className="space-y-3 pb-6">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
        <input className={inputClass + " flex-1"} placeholder="Search order ID, customer, email" value={q} onChange={(e) => setQ(e.target.value)} />
        <SecondaryButton onClick={() => setFiltersOpen(true)}>Filters</SecondaryButton>
      </form>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{orders.length} order(s)</p>
        <SecondaryButton onClick={exportCsv}>Export CSV</SecondaryButton>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders found" />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`}>
              <RecordCard>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{o.id}</span>
                  <Pill tone={STATUS_TONE[o.paymentStatus] ?? "default"}>{o.paymentStatus}</Pill>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{o.customerName || o.customerEmail || "Unknown"} · {new Date(o.createdAt).toLocaleString()}</p>
                <p className="mt-1 text-xs text-slate-600">{o.items?.map((i) => i.title).join(", ") || "—"}</p>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">{o.purchaseKind} {o.couponCode ? `· coupon ${o.couponCode}` : ""}{o.coinsUsed > 0 ? ` · ${o.coinsUsed} coins` : ""}</span>
                  <span className="font-semibold text-slate-900">₹{Number(o.finalAmount).toLocaleString("en-IN")}</span>
                </div>
              </RecordCard>
            </Link>
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter orders" footer={
        <SecondaryButton className="w-full" onClick={() => setFiltersOpen(false)}>Done</SecondaryButton>
      }>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Payment status</p>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {["created", "payment_pending", "authorized", "captured", "verified", "access_granted", "failed", "cancelled", "refunded"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Purchase kind</p>
            <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All</option>
              {["product", "module", "update", "subscription", "feature", "coins"].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
