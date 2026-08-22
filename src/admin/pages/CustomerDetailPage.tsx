"use client";

import { useEffect, useState } from "react";
import { AdminLink as Link } from "@/lib/admin/router";
import { DangerButton, ErrorState, KeyValue, LoadingState, Pill, PrimaryButton, SectionCard } from "@/components/admin/ui";
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

type Customer = {
  uid: string;
  name: string | null;
  email: string;
  mobile: string | null;
  provider: string | null;
  role: string;
  status: string;
  subscriptionId: string | null;
  subscriptionCycle: "monthly" | "yearly" | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: string | null;
  revisionTestBankLimit: number | null;
  purchaseCount: number;
  wishlist: string[] | null;
  cart: string[] | null;
  joinedAt: string;
  lastLoginAt: string;
};

type OrderRow = { id: string; finalAmount: string; paymentStatus: string; createdAt: string; items: { title: string }[] | null };
type ReviewRow = { id: string; productTitle: string | null; rating: number; status: string };

export default function CustomerDetailPage({ uid }: { uid: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bankLimit, setBankLimit] = useState<string>("");
  const [savingBankLimit, setSavingBankLimit] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ customer: Customer; orders: OrderRow[]; reviews: ReviewRow[] }>(`/api/admin/customers/${uid}`);
      setCustomer(res.customer);
      setBankLimit(res.customer.revisionTestBankLimit === null || res.customer.revisionTestBankLimit === undefined ? "" : String(res.customer.revisionTestBankLimit));
      setOrders(res.orders);
      setReviews(res.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function toggleStatus() {
    if (!customer) return;
    const nextStatus = customer.status === "active" ? "blocked" : "active";
    const { confirmed, reason } = await confirm({
      title: nextStatus === "blocked" ? "Block this customer?" : "Reactivate this customer?",
      description: nextStatus === "blocked" ? "The user will lose access until reactivated." : undefined,
      confirmLabel: nextStatus === "blocked" ? "Block user" : "Activate user",
      destructive: nextStatus === "blocked",
      requireReason: nextStatus === "blocked",
    });
    if (!confirmed) return;
    try {
      const res = await adminFetch<{ customer: Customer }>(`/api/admin/customers/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      setCustomer(res.customer);
      notify("success", `Customer ${nextStatus === "blocked" ? "blocked" : "activated"}.`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to update customer.");
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!customer) return <LoadingState label="Loading customer…" />;

  return (
    <div className="space-y-3 pb-6">
      <SectionCard title={customer.name || "Unnamed user"} action={<Pill tone={customer.status === "active" ? "success" : "danger"}>{customer.status}</Pill>}>
        <KeyValue label="Firebase UID" value={customer.uid} />
        <KeyValue label="Email" value={customer.email} />
        <KeyValue label="Mobile" value={customer.mobile || "—"} />
        <KeyValue label="Provider" value={customer.provider || "—"} />
        <KeyValue label="Role" value={customer.role} />
        <KeyValue label="Joined" value={new Date(customer.joinedAt).toLocaleDateString()} />
        <KeyValue label="Last login" value={new Date(customer.lastLoginAt).toLocaleString()} />
        <div className="mt-3 flex gap-2">
          {customer.status === "active" ? (
            <DangerButton className="flex-1" onClick={toggleStatus}>Block user</DangerButton>
          ) : (
            <PrimaryButton className="flex-1" onClick={toggleStatus}>Activate user</PrimaryButton>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Library & subscription">
        <KeyValue label="Subscription" value={customer.subscriptionId || "None"} />
        <KeyValue label="Cycle" value={customer.subscriptionCycle ? (customer.subscriptionCycle === "yearly" ? "Yearly" : "Monthly") : "—"} />
        <KeyValue label="Status" value={customer.subscriptionStatus || "—"} />
        <KeyValue label="Expires" value={customer.subscriptionExpiresAt ? new Date(customer.subscriptionExpiresAt).toLocaleDateString() : "—"} />
        <KeyValue
          label="Test Bank capacity"
          value={customer.revisionTestBankLimit === -1 ? "Unlimited" : customer.revisionTestBankLimit === null || customer.revisionTestBankLimit === undefined ? "—" : `${customer.revisionTestBankLimit} saved tests`}
        />
        {customer.subscriptionStatus && customer.subscriptionId ? (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
            <p className="text-xs font-bold text-slate-900">Adjust existing subscriber's Test Bank</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Set a higher saved-test capacity for this term. Use −1 for unlimited. The server keeps the higher of this value and the plan limit, so a purchased benefit is never reduced — this only ever helps the subscriber.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                type="number"
                min={-1}
                max={1000}
                placeholder={customer.revisionTestBankLimit === -1 ? "Unlimited" : "Saved tests (e.g. 100)"}
                value={bankLimit}
                onChange={(event) => setBankLimit(event.target.value)}
              />
              <PrimaryButton
                className="h-9 shrink-0"
                loading={savingBankLimit}
                disabled={bankLimit.trim() === ""}
                onClick={async () => {
                  if (!customer || bankLimit.trim() === "") return;
                  setSavingBankLimit(true);
                  try {
                    const res = await adminFetch<{ customer: Customer }>(`/api/admin/customers/${uid}`, {
                      method: "PATCH",
                      body: JSON.stringify({ revisionTestBankLimit: Number(bankLimit) }),
                    });
                    setCustomer(res.customer);
                    setBankLimit(String(res.customer.revisionTestBankLimit));
                    notify("success", `Test Bank capacity updated${res.customer.revisionTestBankLimit === -1 ? " (Unlimited)" : ` to ${res.customer.revisionTestBankLimit} saved tests`}.`);
                  } catch (err) {
                    notify("error", err instanceof Error ? err.message : "Failed to update Test Bank capacity.");
                  } finally {
                    setSavingBankLimit(false);
                  }
                }}
              >
                Save capacity
              </PrimaryButton>
            </div>
          </div>
        ) : null}
        <KeyValue label="Wishlist items" value={customer.wishlist?.length ?? 0} />
        <KeyValue label="Cart items" value={customer.cart?.length ?? 0} />
      </SectionCard>

      <SectionCard title={`Purchases (${orders.length})`}>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">No purchases yet.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-sm active:bg-slate-50">
                  <span>{o.items?.map((i) => i.title).join(", ") || o.id}</span>
                  <span className="font-medium">₹{Number(o.finalAmount).toLocaleString("en-IN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Reviews (${reviews.length})`}>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews submitted.</p>
        ) : (
          <ul className="space-y-1">
            {reviews.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.productTitle}</span>
                <span>⭐ {r.rating} · {r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Danger zone">
        <p className="text-xs text-slate-500">Legacy identity cleanup and irreversible actions live in a restricted area, not in the normal workflow.</p>
        <DangerButton
          className="mt-2 w-full"
          onClick={async () => {
            const { confirmed } = await confirm({
              title: "This action is restricted",
              description: "Legacy identity cleanup is intentionally not available from the standard customer view.",
              confirmLabel: "Understood",
            });
            void confirmed;
          }}
        >
          Legacy identity cleanup (restricted)
        </DangerButton>
      </SectionCard>
    </div>
  );
}
