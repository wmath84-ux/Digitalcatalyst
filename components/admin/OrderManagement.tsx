import React, { useState } from 'react';
import { Order } from '../../App';

type OrderViewState = 'list' | 'details';
type OrderFilter = 'all' | 'coinsOnly' | 'priceOnly' | 'couponPrice' | 'allBenefits';

const glassCard = 'rounded-[2rem] border border-white/50 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl';
const subtleCard = 'rounded-[1.5rem] border border-white/50 bg-white/80 p-5 backdrop-blur-xl';

const parseCurrency = (value: string | number | undefined | null) => parseFloat(String(value || '0').replace('₹', '').replace('🪙', '').replace(/,/g, '')) || 0;
const formatMoney = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDate = (date: string, options?: Intl.DateTimeFormatOptions) => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date || 'Unknown date';
    return parsed.toLocaleDateString('en-US', options || { year: 'numeric', month: 'short', day: 'numeric' });
};

const StatusBadge: React.FC<{ status: Order['status'] }> = ({ status }) => {
    const styles: Record<Order['status'], string> = {
        Completed: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-700',
        Shipped: 'border-blue-300/30 bg-blue-400/10 text-blue-700',
        Pending: 'border-amber-300/30 bg-amber-400/10 text-amber-700',
        'Awaiting Verification': 'border-purple-300/30 bg-purple-400/10 text-purple-700',
        Cancelled: 'border-rose-300/30 bg-rose-400/10 text-rose-700',
    };

    return (
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${styles[status]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status}
        </span>
    );
};

const MetricCard: React.FC<{ label: string; value: string | number; accent: string; helper?: string }> = ({ label, value, accent, helper }) => (
    <div className="rounded-[1.5rem] border border-white/50 bg-white/80 p-5 backdrop-blur-xl">
        <p className="text-sm font-bold text-slate-600">{label}</p>
        <p className={`mt-2 text-3xl font-black ${accent}`}>{value}</p>
        {helper && <p className="mt-1 text-xs font-semibold text-slate-600">{helper}</p>}
    </div>
);

const getOrderBreakdown = (order: Order) => {
    const items = order.items || [];
    const itemSubtotal = items.reduce((sum, item) => sum + parseCurrency(item.price) * (item.quantity || 0), 0);
    const saved = order.paymentBreakdown;
    const baseTotal = saved?.baseTotal ?? itemSubtotal;
    const finalPrice = saved?.finalPrice ?? (order.total?.includes('🪙') && !order.total.includes('₹') ? 0 : parseCurrency(order.total));
    const couponDiscount = saved?.couponDiscount || 0;
    const eduCoinsUsed = saved?.eduCoinsUsed || (order.total?.includes('🪙') ? parseCurrency(order.total) : 0);
    const eduCoinDiscount = saved?.eduCoinDiscount || 0;
    const coinOnlyPurchase = Boolean(saved?.coinOnlyPurchase || (eduCoinsUsed > 0 && finalPrice === 0 && !saved?.couponCode));
    const hasCoupon = Boolean(saved?.couponCode && couponDiscount > 0);
    const hasCoins = coinOnlyPurchase || eduCoinsUsed > 0 || eduCoinDiscount > 0;

    return {
        purchaseKind: saved?.purchaseKind || 'product',
        baseTotal,
        finalPrice,
        couponCode: saved?.couponCode || null,
        couponDiscount,
        couponType: saved?.couponType,
        couponValue: saved?.couponValue,
        eduCoinsUsed,
        eduCoinDiscount,
        coinOnlyPurchase,
        hasCoupon,
        hasCoins,
        paymentLabel: saved?.paymentLabel,
        unlockedProductIds: saved?.unlockedProductIds || [],
    };
};

const getOrderSegment = (order: Order): OrderFilter => {
    const breakdown = getOrderBreakdown(order);
    if (breakdown.coinOnlyPurchase) return 'coinsOnly';
    if (breakdown.hasCoupon && breakdown.hasCoins && breakdown.finalPrice > 0) return 'allBenefits';
    if (breakdown.hasCoupon && breakdown.finalPrice > 0) return 'couponPrice';
    if (!breakdown.hasCoupon && !breakdown.hasCoins && breakdown.finalPrice > 0) return 'priceOnly';
    return 'all';
};

const segmentLabels: Record<OrderFilter, { title: string; shortTitle: string; description: string; accent: string }> = {
    all: { title: 'All orders', shortTitle: 'All', description: 'Every order together', accent: 'from-slate-700 to-slate-900' },
    coinsOnly: { title: 'Only EduCoin purchases', shortTitle: 'Coin only', description: 'Product/subscription bought only with coins', accent: 'from-amber-400 to-orange-500' },
    priceOnly: { title: 'Only price purchases', shortTitle: 'Price only', description: 'No coupon and no coin discount', accent: 'from-emerald-400 to-teal-500' },
    couponPrice: { title: 'Coupon discount + price', shortTitle: 'Coupon + price', description: 'Coupon used and balance paid by price', accent: 'from-violet-400 to-fuchsia-500' },
    allBenefits: { title: 'Coupon + coin + price', shortTitle: 'All used', description: 'Coupon, EduCoins, and price all used', accent: 'from-cyan-400 to-blue-600' },
};

const OrderDetailsPage: React.FC<{ order: Order; onBack: () => void }> = ({ order, onBack }) => {
    const items = order.items || [];
    const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotal = items.reduce((sum, item) => sum + parseCurrency(item.price) * (item.quantity || 0), 0);
    const breakdown = getOrderBreakdown(order);
    const finalDiscount = breakdown.couponDiscount + breakdown.eduCoinDiscount;

    return (
        <div className="min-h-screen bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] text-slate-900">
            <header className="sticky top-0 z-30 border-b border-white/50 bg-white/80 px-4 py-4 backdrop-blur-2xl sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={onBack} className="rounded-2xl border border-white/50 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm">← Back to Orders</button>
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Order Details</p>
                            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Order #{order.id}</h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase text-cyan-700">{breakdown.purchaseKind}</span>
                        <StatusBadge status={order.status} />
                        <span className="rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-sm font-bold text-slate-600">{formatDate(order.date, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    <section className="space-y-8 lg:col-span-2">
                        <div className={glassCard}>
                            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Purchased Items</p>
                                    <h2 className="mt-2 text-2xl font-black text-slate-900">Order contents</h2>
                                </div>
                                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-700">{itemCount} total units</div>
                            </div>

                            <div className="overflow-hidden rounded-[1.5rem] border border-white/50 bg-white/80">
                                <table className="w-full text-left">
                                    <thead className="border-b border-white/50 bg-white/80 text-xs uppercase tracking-[0.24em] text-slate-600">
                                        <tr>
                                            <th className="p-4 font-black">Product / Subscription</th>
                                            <th className="p-4 text-center font-black">Qty</th>
                                            <th className="p-4 text-right font-black">Listed Price</th>
                                            <th className="p-4 text-right font-black">Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {items.length > 0 ? items.map(item => {
                                            const lineTotal = parseCurrency(item.price) * (item.quantity || 0);
                                            return (
                                                <tr key={item.id} className="transition hover:bg-white/80 hover:shadow-sm">
                                                    <td className="p-4">
                                                        <p className="font-black text-slate-900">{item.name}</p>
                                                        <p className="mt-1 text-xs font-mono text-slate-600">ITEM-{item.id}</p>
                                                    </td>
                                                    <td className="p-4 text-center font-bold text-slate-600">{item.quantity}</td>
                                                    <td className="p-4 text-right font-mono text-slate-600">{item.price}</td>
                                                    <td className="p-4 text-right font-black text-cyan-700">{item.price.includes('🪙') ? `🪙 ${lineTotal.toLocaleString('en-IN')}` : formatMoney(lineTotal)}</td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={4} className="p-10 text-center text-slate-600">No items were attached to this order.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className={glassCard}>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Purchase Logic</p>
                            <h2 className="mt-2 text-2xl font-black text-slate-900">How this order was purchased</h2>
                            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Base amount</p>
                                    <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(breakdown.baseTotal || subtotal)}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Final payable</p>
                                    <p className="mt-2 text-2xl font-black text-cyan-700">{breakdown.coinOnlyPurchase ? `🪙 ${breakdown.eduCoinsUsed.toLocaleString('en-IN')}` : formatMoney(breakdown.finalPrice)}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Coupon used</p>
                                    <p className="mt-2 font-black text-slate-900">{breakdown.couponCode || 'No coupon used'}</p>
                                    <p className="mt-1 text-sm font-bold text-slate-600">Discount: {formatMoney(breakdown.couponDiscount)}{breakdown.couponType ? ` • ${breakdown.couponType} ${breakdown.couponValue}` : ''}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">EduCoins used</p>
                                    <p className="mt-2 font-black text-slate-900">{breakdown.eduCoinsUsed > 0 ? `🪙 ${breakdown.eduCoinsUsed.toLocaleString('en-IN')}` : 'No EduCoins used'}</p>
                                    <p className="mt-1 text-sm font-bold text-slate-600">Coin discount value: {formatMoney(breakdown.eduCoinDiscount)}</p>
                                </div>
                            </div>
                            <div className="mt-5 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-400/10 p-5">
                                <p className="text-sm font-black text-cyan-800">Payment path: {breakdown.paymentLabel || (breakdown.coinOnlyPurchase ? 'EduCoin only' : breakdown.hasCoupon ? 'Coupon + price checkout' : 'Regular price checkout')}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-600">Total discount received: {formatMoney(finalDiscount)}. Recorded total: <span className="font-black text-slate-900">{order.total}</span></p>
                                {breakdown.unlockedProductIds.length > 0 && <p className="mt-2 text-sm font-semibold text-slate-600">Unlocked product IDs: {breakdown.unlockedProductIds.join(', ')}</p>}
                            </div>
                        </div>

                        <div className={glassCard}>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Timeline</p>
                            <h2 className="mt-2 text-2xl font-black text-slate-900">Fulfilment overview</h2>
                            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                                {[
                                    { title: 'Order placed', subtitle: formatDate(order.date), active: true },
                                    { title: 'Verification', subtitle: order.status === 'Awaiting Verification' ? 'In progress' : 'Reviewed', active: order.status !== 'Pending' },
                                    { title: 'Delivery', subtitle: order.status === 'Completed' ? 'Completed' : order.status === 'Shipped' ? 'Shipped' : 'Pending', active: order.status === 'Completed' || order.status === 'Shipped' },
                                ].map(step => (
                                    <div key={step.title} className={`rounded-2xl border p-4 ${step.active ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/50 bg-white/80'}`}>
                                        <p className="font-black text-slate-900">{step.title}</p>
                                        <p className="mt-1 text-sm text-slate-600">{step.subtitle}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <aside className="space-y-8 lg:col-span-1">
                        <div className={glassCard}>
                            <h2 className="text-xl font-black text-slate-900">Payment Summary</h2>
                            <div className="mt-5 space-y-3">
                                <div className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/80 p-4 text-sm">
                                    <span className="text-slate-600">Calculated subtotal</span>
                                    <span className="font-black text-slate-900">{formatMoney(subtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/80 p-4 text-sm">
                                    <span className="text-slate-600">Recorded total</span>
                                    <span className="text-2xl font-black text-cyan-700">{order.total}</span>
                                </div>
                            </div>
                        </div>

                        <div className={glassCard}>
                            <h2 className="text-xl font-black text-slate-900">Customer</h2>
                            <div className="mt-5 space-y-4">
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Name</p>
                                    <p className="mt-2 font-black text-slate-900">{order.customerName}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Email</p>
                                    <p className="mt-2 break-words text-sm font-bold text-cyan-700">{order.customerEmail}</p>
                                </div>
                            </div>
                        </div>

                        <div className={glassCard}>
                            <h2 className="text-xl font-black text-slate-900">Addresses</h2>
                            <div className="mt-5 space-y-4">
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Billing</p>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{order.billingAddress || 'No billing address provided.'}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">Shipping</p>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{order.shippingAddress || 'No shipping address provided.'}</p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
};

const OrderManagement: React.FC<{ orders: Order[] }> = ({ orders }) => {
    const [viewState, setViewState] = useState<OrderViewState>('list');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [activeFilter, setActiveFilter] = useState<OrderFilter>('all');
    const safeOrders = orders || [];

    const openOrderDetails = (order: Order) => {
        setSelectedOrder({ ...order, items: order.items || [] });
        setViewState('details');
    };

    const closeOrderDetails = () => {
        setSelectedOrder(null);
        setViewState('list');
    };

    const handleExportCSV = () => {
        if (safeOrders.length === 0) {
            alert('No orders to export.');
            return;
        }

        const headers = ['Order ID', 'Customer Name', 'Email', 'Date', 'Status', 'Segment', 'Total', 'Coupon', 'EduCoins Used', 'Coin Discount', 'Items'];
        const escapeCsv = (field: string | number) => {
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = safeOrders.map(order => {
            const breakdown = getOrderBreakdown(order);
            return [
                escapeCsv(order.id),
                escapeCsv(order.customerName),
                escapeCsv(order.customerEmail),
                escapeCsv(order.date),
                escapeCsv(order.status),
                escapeCsv(segmentLabels[getOrderSegment(order)].shortTitle),
                escapeCsv((order.total || '').replace(/,/g, '')),
                escapeCsv(breakdown.couponCode || ''),
                escapeCsv(breakdown.eduCoinsUsed),
                escapeCsv(breakdown.eduCoinDiscount),
                escapeCsv((order.items || []).map(item => `${item.quantity}x ${item.name}`).join('; ')),
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(',')),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `orders-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const completedOrders = safeOrders.filter(order => order.status === 'Completed');
    const pendingOrders = safeOrders.filter(order => order.status === 'Pending' || order.status === 'Awaiting Verification');
    const totalRevenue = completedOrders.reduce((sum, order) => sum + getOrderBreakdown(order).finalPrice, 0);
    const filteredOrders = activeFilter === 'all' ? safeOrders : safeOrders.filter(order => getOrderSegment(order) === activeFilter);
    const segmentCounts = (['coinsOnly', 'priceOnly', 'couponPrice', 'allBenefits'] as OrderFilter[]).reduce<Record<string, number>>((counts, segment) => {
        counts[segment] = safeOrders.filter(order => getOrderSegment(order) === segment).length;
        return counts;
    }, { all: safeOrders.length });

    if (viewState === 'details' && selectedOrder) {
        return <OrderDetailsPage order={selectedOrder} onBack={closeOrderDetails} />;
    }

    return (
        <div className="min-h-screen bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] p-4 text-slate-900 animate-fade-in-up sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Admin Orders</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Order Management</h1>
                        <p className="mt-2 max-w-2xl text-slate-600">Track product and subscription purchases with coupon, EduCoin, discount, and final payable details.</p>
                    </div>
                    <button
                        onClick={handleExportCSV}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-6 py-4 text-sm font-black text-cyan-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition hover:-translate-y-0.5 hover:bg-cyan-400/20"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <MetricCard label="Total Orders" value={safeOrders.length} accent="text-slate-900" />
                    <MetricCard label="Completed Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} accent="text-emerald-300" helper={`${completedOrders.length} completed orders`} />
                    <MetricCard label="Needs Attention" value={pendingOrders.length} accent="text-amber-300" helper="Pending or awaiting verification" />
                </div>

                <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
                    {(['all', 'coinsOnly', 'priceOnly', 'couponPrice', 'allBenefits'] as OrderFilter[]).map(filter => {
                        const isActive = activeFilter === filter;
                        const meta = segmentLabels[filter];
                        const count = filter === 'all' ? safeOrders.length : segmentCounts[filter] || 0;
                        return (
                            <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={`rounded-[1.5rem] border p-5 text-left transition hover:-translate-y-0.5 ${isActive ? 'border-cyan-300/40 bg-white shadow-[0_12px_35px_rgb(14,165,233,0.16)]' : 'border-white/50 bg-white/70 hover:bg-white/90'}`}>
                                <span className={`inline-flex rounded-full bg-gradient-to-r ${meta.accent} px-3 py-1 text-xs font-black text-white`}>{count} orders</span>
                                <p className="mt-4 text-lg font-black text-slate-900">{meta.shortTitle}</p>
                                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{meta.description}</p>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/50 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl">
                    <div className="border-b border-white/50 bg-white/70 p-5">
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-400">{segmentLabels[activeFilter].title}</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-900">{filteredOrders.length} matching orders</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-max text-left">
                            <thead className="border-b border-white/50 bg-white/80 text-xs uppercase tracking-[0.24em] text-slate-600">
                                <tr>
                                    <th className="p-5 font-black">Order ID</th>
                                    <th className="p-5 font-black">Customer</th>
                                    <th className="p-5 font-black">Date</th>
                                    <th className="p-5 font-black">Segment</th>
                                    <th className="p-5 font-black">Coupon / Coins</th>
                                    <th className="p-5 font-black">Final</th>
                                    <th className="p-5 font-black">Status</th>
                                    <th className="p-5 text-right font-black">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {filteredOrders.length > 0 ? filteredOrders.map(order => {
                                    const orderItems = order.items || [];
                                    const quantity = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                                    const breakdown = getOrderBreakdown(order);
                                    const segment = getOrderSegment(order);

                                    return (
                                        <tr key={order.id} className="group transition hover:bg-white/80 hover:shadow-sm">
                                            <td className="p-5 font-mono text-sm font-black text-cyan-700">#{order.id}</td>
                                            <td className="p-5">
                                                <p className="font-black text-slate-900 group-hover:text-cyan-700">{order.customerName}</p>
                                                <p className="mt-1 text-xs text-slate-600">{order.customerEmail}</p>
                                                <p className="mt-1 text-xs font-bold text-slate-500">{quantity} units</p>
                                            </td>
                                            <td className="p-5 text-sm font-bold text-slate-600">{formatDate(order.date)}</td>
                                            <td className="p-5"><span className="rounded-full border border-white/50 bg-white/80 px-3 py-1 text-xs font-black text-slate-600">{segmentLabels[segment].shortTitle}</span></td>
                                            <td className="p-5 text-xs font-bold text-slate-600">
                                                <p>{breakdown.couponCode ? `🎟️ ${breakdown.couponCode} (${formatMoney(breakdown.couponDiscount)} off)` : '🎟️ No coupon'}</p>
                                                <p className="mt-1">{breakdown.eduCoinsUsed > 0 ? `🪙 ${breakdown.eduCoinsUsed.toLocaleString('en-IN')} used` : '🪙 No coins'}</p>
                                            </td>
                                            <td className="p-5 text-sm font-black text-slate-900">{breakdown.coinOnlyPurchase ? `🪙 ${breakdown.eduCoinsUsed.toLocaleString('en-IN')}` : formatMoney(breakdown.finalPrice)}</td>
                                            <td className="p-5"><StatusBadge status={order.status} /></td>
                                            <td className="p-5 text-right">
                                                <button
                                                    onClick={() => openOrderDetails(order)}
                                                    className="rounded-2xl border border-cyan-300/30 px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-400/10"
                                                >
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={8} className="p-12 text-center text-slate-600">
                                            <p className="text-4xl">🧾</p>
                                            <p className="mt-3 text-lg font-black text-slate-900">No matching orders</p>
                                            <p className="mt-1">Try the All filter or wait for purchases in this payment category.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderManagement;
