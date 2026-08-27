"use client";

import { AdminLink as Link } from "@/lib/admin/router";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, Pill, RecordCard, SecondaryButton, Sheet, inputClass, selectClass } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";
import { exportAdminCsv } from "@/lib/admin/export";

type CustomerRow = {
  uid: string;
  name: string | null;
  email: string;
  mobile: string | null;
  provider: string | null;
  role: string;
  status: string;
  subscriptionId: string | null;
  purchaseCount: number;
  joinedAt: string;
  lastLoginAt: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (provider) params.set("provider", provider);
      const res = await adminFetch<{ customers: CustomerRow[] }>(`/api/admin/customers?${params.toString()}`);
      setCustomers(res.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers.");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, provider]);

  const exportCsv = () => void exportAdminCsv("customers");

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!customers) return <LoadingState label="Loading customers…" />;

  return (
    <div className="space-y-3 pb-6">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
        <input className={inputClass + " flex-1"} placeholder="Search name, email, UID" value={q} onChange={(e) => setQ(e.target.value)} />
        <SecondaryButton onClick={() => setFiltersOpen(true)}>Filters</SecondaryButton>
      </form>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{customers.length} customer(s)</p>
        <SecondaryButton onClick={exportCsv}>Export CSV</SecondaryButton>
      </div>

      {customers.length === 0 ? (
        <EmptyState title="No customers found" />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
          {customers.map((c) => (
            <Link key={c.uid} href={`/admin/customers/${c.uid}`}>
              <RecordCard>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{c.name || "Unnamed user"}</span>
                  <Pill tone={c.status === "active" ? "success" : "danger"}>{c.status}</Pill>
                </div>
                <p className="text-xs text-slate-500">{c.email} · {c.mobile || "no phone"}</p>
                <p className="mt-1 text-xs text-slate-600">{c.provider} · {c.purchaseCount} purchase(s)</p>
              </RecordCard>
            </Link>
          ))}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter customers" footer={
        <SecondaryButton className="w-full" onClick={() => setFiltersOpen(false)}>Done</SecondaryButton>
      }>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Status</p>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-700">Provider</p>
            <select className={selectClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">All</option>
              <option value="password">Email/Password</option>
              <option value="google">Google</option>
            </select>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
