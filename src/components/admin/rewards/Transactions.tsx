"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState, Pill, RecordCard, SecondaryButton, inputClass, selectClass } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";
import { exportAdminCsv } from "@/lib/admin/export";

type Transaction = {
  id: number;
  customerId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  source: string;
  reason: string | null;
  referenceId: string | null;
  adminId: string | null;
  flagged: boolean;
  createdAt: string;
};

export function TransactionsPanel() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      const res = await adminFetch<{ transactions: Transaction[] }>(`/api/admin/rewards/transactions?${params.toString()}`);
      setTransactions(res.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const exportCsv = () => void exportAdminCsv("rewards");

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!transactions) return <LoadingState />;

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
        <input className={inputClass + " flex-1"} placeholder="Search user UID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={selectClass + " w-32"} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All</option>
          <option value="earn">Earn</option>
          <option value="spend">Spend</option>
        </select>
      </form>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{transactions.length} transaction(s)</p>
        <SecondaryButton onClick={exportCsv}>Export CSV</SecondaryButton>
      </div>
      {transactions.length === 0 ? <EmptyState title="No transactions" /> : (
        <div className="space-y-2">
          {transactions.map((t) => (
            <RecordCard key={t.id}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">{t.customerId}</span>
                <Pill tone={t.type === "earn" ? "success" : "warn"}>{t.type}</Pill>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{t.reason || t.source}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                <span>{t.balanceBefore} → {t.balanceAfter}</span>
                <span className="font-semibold">{t.amount > 0 ? "+" : ""}{t.amount}</span>
              </div>
              {t.adminId && <p className="mt-0.5 text-[11px] text-slate-400">Manual adjustment by admin #{t.adminId}</p>}
              {t.flagged && <Pill tone="danger">Flagged</Pill>}
            </RecordCard>
          ))}
        </div>
      )}
    </div>
  );
}
