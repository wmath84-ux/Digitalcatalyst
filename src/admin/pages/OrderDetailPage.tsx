"use client";

import { useEffect, useState } from "react";
import { AdminLink as Link } from "@/lib/admin/router";
import { ErrorState, KeyValue, LoadingState, Pill, SectionCard } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client";

type OrderDetail = {
  id: string;
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  purchaseKind: string;
  items: { id: string; kind: string; refId: string; title: string; price: number }[] | null;
  couponCode: string | null;
  coinsUsed: number;
  discountAmount: string;
  cashPaid: string;
  finalAmount: string;
  paymentStatus: string;
  entitlementStatus: string;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  grantedEntitlementIds: string[] | null;
  failureReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
};

export default function OrderDetailPage({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch<{ order: OrderDetail }>(`/api/admin/orders/${id}`);
        setOrder(res.order);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load order.");
      }
    })();
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!order) return <LoadingState label="Loading order…" />;

  return (
    <div className="space-y-3 pb-6">
      <SectionCard title={`Order ${order.id}`} action={<Pill tone={order.paymentStatus === "failed" ? "danger" : "success"}>{order.paymentStatus}</Pill>}>
        <KeyValue label="Customer" value={order.customerName || order.customerEmail || "—"} />
        <KeyValue label="Firebase / customer UID" value={order.customerId} />
        <KeyValue label="Purchase kind" value={order.purchaseKind} />
        <KeyValue label="Entitlement status" value={order.entitlementStatus} />
        <KeyValue label="Created" value={new Date(order.createdAt).toLocaleString()} />
        <KeyValue label="Verified" value={order.verifiedAt ? new Date(order.verifiedAt).toLocaleString() : "—"} />
      </SectionCard>

      <SectionCard title="Line items">
        {order.items?.length ? (
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between text-sm">
                <span>{item.title} <span className="text-xs text-slate-400">({item.kind})</span></span>
                <span className="font-medium">₹{item.price.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No line items recorded.</p>
        )}
      </SectionCard>

      <SectionCard title="Payment breakdown">
        <KeyValue label="Coupon" value={order.couponCode || "—"} />
        <KeyValue label="EduCoins used" value={order.coinsUsed} />
        <KeyValue label="Discount" value={`₹${Number(order.discountAmount).toLocaleString("en-IN")}`} />
        <KeyValue label="Cash paid" value={`₹${Number(order.cashPaid).toLocaleString("en-IN")}`} />
        <KeyValue label="Final amount" value={`₹${Number(order.finalAmount).toLocaleString("en-IN")}`} />
      </SectionCard>

      <SectionCard title="Gateway & entitlement">
        <KeyValue label="Razorpay order ID" value={order.gatewayOrderId || "—"} />
        <KeyValue label="Razorpay payment ID" value={order.gatewayPaymentId || "—"} />
        <KeyValue label="Granted entitlements" value={order.grantedEntitlementIds?.join(", ") || "—"} />
        {order.failureReason && <KeyValue label="Failure reason" value={order.failureReason} />}
      </SectionCard>

      <Link href={`/admin/customers/${order.customerId}`} className="block text-center text-sm text-slate-500 underline">
        View customer profile
      </Link>
    </div>
  );
}
