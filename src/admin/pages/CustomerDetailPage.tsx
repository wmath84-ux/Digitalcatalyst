"use client";

import { useEffect, useState } from "react";
import { AdminLink as Link } from "@/lib/admin/router";
import { DangerButton, ErrorState, Field, KeyValue, LoadingState, Pill, PrimaryButton, SecondaryButton, SectionCard, Sheet, inputClass, textareaClass } from "@/components/admin/ui";
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
  coinBalance: number;
  subscriptionId: string | null;
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
  const [coinSheetOpen, setCoinSheetOpen] = useState(false);
  const [coinAmount, setCoinAmount] = useState("");
  const [coinType, setCoinType] = useState<"earn" | "spend">("earn");
  const [coinReason, setCoinReason] = useState("");
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { notify } = useToast();

  const load = async () => {
    try {
      const res = await adminFetch<{ customer: Customer; orders: OrderRow[]; reviews: ReviewRow[] }>(`/api/admin/customers/${uid}`);
      setCustomer(res.customer);
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

  async function submitCoinAdjustment() {
    const amount = Number(coinAmount);
    if (!amount || amount <= 0) {
      notify("error", "Enter a positive amount.");
      return;
    }
    if (!coinReason.trim()) {
      notify("error", "A reason is mandatory for coin adjustments.");
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch<{ customer: Customer }>(`/api/admin/customers/${uid}/coins`, {
        method: "POST",
        body: JSON.stringify({ amount, type: coinType, reason: coinReason }),
      });
      setCustomer(res.customer);
      notify("success", "Coin balance adjusted.");
      setCoinSheetOpen(false);
      setCoinAmount("");
      setCoinReason("");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to adjust coins.");
    } finally {
      setSaving(false);
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

      <SectionCard title="Wallet & subscription" action={<SecondaryButton onClick={() => setCoinSheetOpen(true)}>Adjust coins</SecondaryButton>}>
        <KeyValue label="Coin balance" value={customer.coinBalance} />
        <KeyValue label="Subscription" value={customer.subscriptionId || "None"} />
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

      <Sheet
        open={coinSheetOpen}
        onClose={() => setCoinSheetOpen(false)}
        title="Manual coin adjustment"
        footer={
          <PrimaryButton className="w-full" loading={saving} onClick={submitCoinAdjustment}>
            Apply adjustment
          </PrimaryButton>
        }
      >
        <div className="space-y-3">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => setCoinType("earn")} className={`h-9 flex-1 rounded-md text-sm font-medium ${coinType === "earn" ? "bg-white shadow-sm" : "text-slate-500"}`}>Add coins</button>
            <button type="button" onClick={() => setCoinType("spend")} className={`h-9 flex-1 rounded-md text-sm font-medium ${coinType === "spend" ? "bg-white shadow-sm" : "text-slate-500"}`}>Deduct coins</button>
          </div>
          <Field label="Amount" required>
            <input className={inputClass} type="number" value={coinAmount} onChange={(e) => setCoinAmount(e.target.value)} />
          </Field>
          <Field label="Reason" required hint="Mandatory for audit log">
            <textarea className={textareaClass} value={coinReason} onChange={(e) => setCoinReason(e.target.value)} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
