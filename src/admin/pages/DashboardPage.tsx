"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState, Pill, SectionCard, StatCard } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";

type DashboardData = {
  products: { total: number; hidden: number; unavailable: number };
  users: { total: number; active: number; blocked: number };
  orders: { verified: number; pending: number; failed: number };
  revenue: { total: number };
  subscriptions: { active: number; expiring: number };
  reviews: { pending: number };
  recentOrders: {
    id: string;
    customerName: string | null;
    items: { title: string }[] | null;
    finalAmount: string;
    paymentStatus: string;
    createdAt: string;
  }[];
  attentionQueue: { id: string; label: string; type: string }[];
};

const QUICK_ACTIONS = [
  { label: "Add Product", href: "/admin/products/new" },
  { label: "Open Orders", href: "/admin/orders" },
  { label: "Open Customers", href: "/admin/customers" },
  { label: "Create Coupon", href: "/admin/coupons" },
  { label: "Configure Subscription", href: "/admin/subscriptions" },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<DashboardData>("/api/admin/dashboard");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load dashboard."} onRetry={load} />;

  return (
    <div className="space-y-4 pb-6">
      <SectionCard title="Products">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Active" value={data.products.total - data.products.hidden} />
          <StatCard label="Hidden" value={data.products.hidden} />
          <StatCard label="Unavailable" value={data.products.unavailable} />
        </div>
      </SectionCard>

      <SectionCard title="Users">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <StatCard label="Total" value={data.users.total} />
          <StatCard label="Active" value={data.users.active} tone="ok" />
          <StatCard label="Blocked" value={data.users.blocked} tone={data.users.blocked > 0 ? "danger" : undefined} />
        </div>
      </SectionCard>

      <SectionCard title="Orders & revenue">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <StatCard label="Verified" value={data.orders.verified} tone="ok" />
          <StatCard label="Pending" value={data.orders.pending} tone="warn" />
          <StatCard label="Failed" value={data.orders.failed} tone={data.orders.failed > 0 ? "danger" : undefined} />
        </div>
        <div className="mt-2">
          <StatCard label="Total verified revenue" value={`₹${data.revenue.total.toLocaleString("en-IN")}`} />
        </div>
      </SectionCard>

      <SectionCard title="Subscriptions">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          <StatCard label="Active" value={data.subscriptions.active} />
          <StatCard label="Expiring soon" value={data.subscriptions.expiring} />
        </div>
      </SectionCard>

      <SectionCard title="Reviews">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          <StatCard label="Pending reviews" value={data.reviews.pending} tone={data.reviews.pending > 0 ? "warn" : undefined} />
        </div>
      </SectionCard>

      <SectionCard title="Attention queue">
        {data.attentionQueue.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing needs your attention right now.</p>
        ) : (
          <ul className="space-y-2">
            {data.attentionQueue.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {item.label}
                <Pill tone="warn">{item.type}</Pill>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Recent orders" action={<Link href="/admin/orders" className="text-xs font-medium text-slate-500 underline">View all</Link>}>
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-slate-500">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.recentOrders.map((order) => (
              <li key={order.id}>
                <Link href={`/admin/orders/${order.id}`} className="block rounded-lg border border-slate-200 p-3 active:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{order.id}</span>
                    <Pill tone={order.paymentStatus === "verified" || order.paymentStatus === "captured" ? "success" : order.paymentStatus === "failed" ? "danger" : "warn"}>
                      {order.paymentStatus}
                    </Pill>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{order.customerName || "Unknown customer"}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{order.items?.map((i) => i.title).join(", ") || "—"}</span>
                    <span className="font-semibold text-slate-900">₹{Number(order.finalAmount).toLocaleString("en-IN")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Quick actions">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex h-11 items-center justify-center rounded-lg border border-slate-300 px-2 text-center text-xs font-medium text-slate-700 active:bg-slate-100"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
