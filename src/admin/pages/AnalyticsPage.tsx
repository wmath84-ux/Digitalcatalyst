"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  KeyValue,
  LoadingState,
  RecordCard,
  SecondaryButton,
  SectionCard,
  StatCard,
  Tabs,
  selectClass,
} from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";
import { exportAdminCsv } from "@/lib/admin/export";
import { useToast } from "@/components/admin/AdminProviders";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type AnalyticsData = {
  range: { start: string; end: string };
  revenue: number;
  orders: number;
  averageOrderValue: number;
  uniqueBuyers: number;
  newUsers: number;
  paymentSuccessRate: number;
  failedPayments: number;
  topProducts: { id: string; title: string; reviewCount: number; rating: string | null }[];
  activeSubscriptionPlans: number;
  averageReviewRating: number;
  reviewsInRange: number;
};

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const ANALYTICS_TABS = [
  { key: "overview", label: "Overview" },
  { key: "products", label: "Products" },
  { key: "revenue", label: "Revenue" },
  { key: "customers", label: "Customers" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "courses", label: "Courses" },
  { key: "exports", label: "Exports" },
];

export default function AnalyticsPage() {
  const [tab, setTab] = useState("overview");
  const { notify } = useToast();

  return (
    <div className="space-y-3 pb-6 lg:space-y-4">
      <Tabs tabs={ANALYTICS_TABS} active={tab} onChange={setTab} />
      <div className="mt-3 lg:mt-4">
        {tab === "overview" && <OverviewTab notify={notify} />}
        {tab === "products" && <ProductsTab notify={notify} />}
        {tab === "revenue" && <RevenueTab notify={notify} />}
        {tab === "customers" && <CustomersTab notify={notify} />}
        {tab === "subscriptions" && <SubscriptionsTab notify={notify} />}
        {tab === "courses" && <CoursesTab notify={notify} />}
        {tab === "exports" && <ExportsTab notify={notify} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared date-range hook                                              */
/* ------------------------------------------------------------------ */

function useAnalytics(range: string, from?: string, to?: string) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("range", range);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await adminFetch<AnalyticsData>(`/api/admin/analytics?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to]);

  return { data, error, reload: load };
}

/* ------------------------------------------------------------------ */
/* Date range picker                                                   */
/* ------------------------------------------------------------------ */

function DateRangeSelector({
  range,
  onRange,
}: {
  range: string;
  onRange: (r: string) => void;
}) {
  return (
    <select className={selectClass} value={range} onChange={(e) => onRange(e.target.value)}>
      {RANGES.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Overview tab                                                        */
/* ------------------------------------------------------------------ */

function OverviewTab({ notify: _notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const [range, setRange] = useState("30d");
  const { data, error, reload } = useAnalytics(range);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Loading analytics…" />;

  return (
    <div className="space-y-3 lg:space-y-4">
      <DateRangeSelector range={range} onRange={setRange} />

      <SectionCard title="Revenue & orders">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 lg:gap-4">
          <StatCard label="Revenue" value={`₹${data.revenue.toLocaleString("en-IN")}`} />
          <StatCard label="Verified orders" value={data.orders} />
          <StatCard label="Avg order value" value={`₹${data.averageOrderValue.toLocaleString("en-IN")}`} />
          <StatCard label="Unique buyers" value={data.uniqueBuyers} />
        </div>
      </SectionCard>

      <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
        <SectionCard title="Users" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:gap-4">
            <StatCard label="New users" value={data.newUsers} />
            <StatCard
              label="Payment success"
              value={`${data.paymentSuccessRate}%`}
              tone={data.paymentSuccessRate >= 90 ? "ok" : data.paymentSuccessRate >= 70 ? "warn" : "danger"}
            />
            <StatCard label="Failed payments" value={data.failedPayments} tone={data.failedPayments > 0 ? "danger" : undefined} />
          </div>
        </SectionCard>

        <SectionCard title="Subscriptions & reviews" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:gap-4">
            <StatCard label="Active subs" value={data.activeSubscriptionPlans} tone="ok" />
            <StatCard label="Avg rating" value={`${data.averageReviewRating.toFixed(1)} ⭐`} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Products tab                                                        */
/* ------------------------------------------------------------------ */

function ProductsTab({ notify: _notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const [range, setRange] = useState("30d");
  const { data, error, reload } = useAnalytics(range);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Loading product analytics…" />;

  return (
    <div className="space-y-3 lg:space-y-4">
      <DateRangeSelector range={range} onRange={setRange} />

      <SectionCard title="Top products by activity" description="Rankings are based on reviews within the selected date range.">
        {data.topProducts.length === 0 ? (
          <EmptyState title="No product data for this period" />
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
            {data.topProducts.map((p, i) => (
              <RecordCard key={p.id}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">
                    <span className="text-xs text-slate-400">#{i + 1}</span>{" "}
                    {p.title}
                  </span>
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="text-xs text-slate-500 underline"
                  >
                    Open
                  </Link>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {p.reviewCount} reviews · ⭐ {Number(p.rating ?? 0).toFixed(1)}
                </p>
              </RecordCard>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Revenue tab                                                         */
/* ------------------------------------------------------------------ */

function RevenueTab({ notify: _notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const [range, setRange] = useState("30d");
  const { data, error, reload } = useAnalytics(range);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Loading revenue analytics…" />;

  return (
    <div className="space-y-3 lg:space-y-4">
      <DateRangeSelector range={range} onRange={setRange} />

      <SectionCard title="Revenue breakdown">
        <div className="grid gap-2 lg:grid-cols-2 lg:gap-x-8">
          <KeyValue label="Total verified revenue" value={`₹${data.revenue.toLocaleString("en-IN")}`} />
          <KeyValue label="Verified orders" value={data.orders} />
          <KeyValue label="Average order value" value={`₹${data.averageOrderValue.toLocaleString("en-IN")}`} />
          <KeyValue label="Payment success rate" value={`${data.paymentSuccessRate}%`} />
          <KeyValue label="Failed payments" value={data.failedPayments} />
        </div>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Customers tab                                                        */
/* ------------------------------------------------------------------ */

function CustomersTab({ notify: _notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const [range, setRange] = useState("30d");
  const { data, error, reload } = useAnalytics(range);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Loading customer analytics…" />;

  return (
    <div className="space-y-3 lg:space-y-4">
      <DateRangeSelector range={range} onRange={setRange} />

      <SectionCard title="Customer metrics">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard label="New users" value={data.newUsers} />
          <StatCard label="Unique buyers" value={data.uniqueBuyers} />
        </div>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subscriptions tab                                                   */
/* ------------------------------------------------------------------ */

function SubscriptionsTab({ notify: _notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const [range, setRange] = useState("30d");
  const { data, error, reload } = useAnalytics(range);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Loading subscription analytics…" />;

  return (
    <div className="space-y-3 lg:space-y-4">
      <DateRangeSelector range={range} onRange={setRange} />

      <SectionCard title="Subscription overview">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard label="Active plans" value={data.activeSubscriptionPlans} tone="ok" />
        </div>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Courses tab                                                         */
/* ------------------------------------------------------------------ */

function CoursesTab({ notify: _notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const [range, setRange] = useState("30d");
  const { data, error, reload } = useAnalytics(range);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState label="Loading course analytics…" />;

  return (
    <div className="space-y-3 lg:space-y-4">
      <DateRangeSelector range={range} onRange={setRange} />

      <SectionCard title="Course engagement">
        <div className="grid gap-2 lg:grid-cols-2 lg:gap-x-8">
          <KeyValue label="Total reviews" value={data.reviewsInRange} />
          <KeyValue label="Average rating" value={`${data.averageReviewRating.toFixed(1)} ⭐`} />
        </div>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exports tab                                                         */
/* ------------------------------------------------------------------ */

function ExportsTab({ notify }: { notify: ReturnType<typeof useToast>["notify"] }) {
  const exports = [
    { label: "Orders CSV", type: "orders" },
    { label: "Customers CSV", type: "customers" },
    { label: "Rewards CSV", type: "rewards" },
    { label: "Subscriptions CSV", type: "subscriptions" },
    { label: "Payments CSV", type: "payments" },
  ];

  const handleExport = (type: string) => {
    void exportAdminCsv(type);
    notify("info", `Exporting ${type} data…`);
  };

  return (
    <div className="space-y-3 lg:space-y-4">
      <SectionCard title="Export data" description="Downloads are generated server-side and include all records.">
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {exports.map((exp) => (
            <SecondaryButton key={exp.type} className="w-full" onClick={() => handleExport(exp.type)}>
              {exp.label}
            </SecondaryButton>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
