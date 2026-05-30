import React, { useState } from 'react';
import { Order } from '../../App';

type OrderViewState = 'list' | 'details';

const glassCard = 'rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl';
const subtleCard = 'rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5 backdrop-blur-xl';

const parseCurrency = (value: string) => parseFloat((value || '0').replace('₹', '').replace(/,/g, '')) || 0;

const formatDate = (date: string, options?: Intl.DateTimeFormatOptions) => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date || 'Unknown date';
    return parsed.toLocaleDateString('en-US', options || { year: 'numeric', month: 'short', day: 'numeric' });
};

const StatusBadge: React.FC<{ status: Order['status'] }> = ({ status }) => {
    const styles: Record<Order['status'], string> = {
        Completed: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
        Shipped: 'border-blue-300/30 bg-blue-400/10 text-blue-200',
        Pending: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
        'Awaiting Verification': 'border-purple-300/30 bg-purple-400/10 text-purple-200',
        Cancelled: 'border-rose-300/30 bg-rose-400/10 text-rose-200',
    };

    return (
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${styles[status]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status}
        </span>
    );
};

const MetricCard: React.FC<{ label: string; value: string | number; accent: string; helper?: string }> = ({ label, value, accent, helper }) => (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
        <p className="text-sm font-bold text-slate-400">{label}</p>
        <p className={`mt-2 text-3xl font-black ${accent}`}>{value}</p>
        {helper && <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>}
    </div>
);

const OrderDetailsPage: React.FC<{ order: Order; onBack: () => void }> = ({ order, onBack }) => {
    const items = order.items || [];
    const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const subtotal = items.reduce((sum, item) => sum + parseCurrency(item.price) * (item.quantity || 0), 0);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 px-4 py-4 backdrop-blur-2xl sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={onBack} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-white/10">← Back to Orders</button>
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Order Details</p>
                            <h1 className="text-2xl font-black text-white sm:text-3xl">Order #{order.id}</h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={order.status} />
                        <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-300">{formatDate(order.date, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
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
                                    <h2 className="mt-2 text-2xl font-black text-white">Order contents</h2>
                                </div>
                                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100">{itemCount} total units</div>
                            </div>

                            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/60">
                                <table className="w-full text-left">
                                    <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-[0.24em] text-slate-400">
                                        <tr>
                                            <th className="p-4 font-black">Product</th>
                                            <th className="p-4 text-center font-black">Qty</th>
                                            <th className="p-4 text-right font-black">Price</th>
                                            <th className="p-4 text-right font-black">Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {items.length > 0 ? items.map(item => {
                                            const lineTotal = parseCurrency(item.price) * (item.quantity || 0);
                                            return (
                                                <tr key={item.id} className="transition hover:bg-white/5">
                                                    <td className="p-4">
                                                        <p className="font-black text-white">{item.name}</p>
                                                        <p className="mt-1 text-xs font-mono text-slate-500">ITEM-{item.id}</p>
                                                    </td>
                                                    <td className="p-4 text-center font-bold text-slate-300">{item.quantity}</td>
                                                    <td className="p-4 text-right font-mono text-slate-300">{item.price}</td>
                                                    <td className="p-4 text-right font-black text-cyan-200">₹{lineTotal.toLocaleString('en-IN')}</td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={4} className="p-10 text-center text-slate-400">No items were attached to this order.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className={glassCard}>
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Timeline</p>
                            <h2 className="mt-2 text-2xl font-black text-white">Fulfilment overview</h2>
                            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                                {[
                                    { title: 'Order placed', subtitle: formatDate(order.date), active: true },
                                    { title: 'Verification', subtitle: order.status === 'Awaiting Verification' ? 'In progress' : 'Reviewed', active: order.status !== 'Pending' },
                                    { title: 'Delivery', subtitle: order.status === 'Completed' ? 'Completed' : order.status === 'Shipped' ? 'Shipped' : 'Pending', active: order.status === 'Completed' || order.status === 'Shipped' },
                                ].map(step => (
                                    <div key={step.title} className={`rounded-2xl border p-4 ${step.active ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-slate-950/60'}`}>
                                        <p className="font-black text-white">{step.title}</p>
                                        <p className="mt-1 text-sm text-slate-400">{step.subtitle}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <aside className="space-y-8 lg:col-span-1">
                        <div className={glassCard}>
                            <h2 className="text-xl font-black text-white">Payment Summary</h2>
                            <div className="mt-5 space-y-3">
                                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm">
                                    <span className="text-slate-400">Calculated subtotal</span>
                                    <span className="font-black text-slate-100">₹{subtotal.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm">
                                    <span className="text-slate-400">Recorded total</span>
                                    <span className="text-2xl font-black text-cyan-200">{order.total}</span>
                                </div>
                            </div>
                        </div>

                        <div className={glassCard}>
                            <h2 className="text-xl font-black text-white">Customer</h2>
                            <div className="mt-5 space-y-4">
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Name</p>
                                    <p className="mt-2 font-black text-white">{order.customerName}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Email</p>
                                    <p className="mt-2 break-words text-sm font-bold text-cyan-200">{order.customerEmail}</p>
                                </div>
                            </div>
                        </div>

                        <div className={glassCard}>
                            <h2 className="text-xl font-black text-white">Addresses</h2>
                            <div className="mt-5 space-y-4">
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Billing</p>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{order.billingAddress || 'No billing address provided.'}</p>
                                </div>
                                <div className={subtleCard}>
                                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Shipping</p>
                                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{order.shippingAddress || 'No shipping address provided.'}</p>
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

        const headers = ['Order ID', 'Customer Name', 'Email', 'Date', 'Status', 'Total', 'Items'];
        const escapeCsv = (field: string | number) => {
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = safeOrders.map(order => [
            escapeCsv(order.id),
            escapeCsv(order.customerName),
            escapeCsv(order.customerEmail),
            escapeCsv(order.date),
            escapeCsv(order.status),
            escapeCsv((order.total || '').replace(/,/g, '')),
            escapeCsv((order.items || []).map(item => `${item.quantity}x ${item.name}`).join('; ')),
        ]);

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
    const totalRevenue = completedOrders.reduce((sum, order) => sum + parseCurrency(order.total), 0);

    if (viewState === 'details' && selectedOrder) {
        return <OrderDetailsPage order={selectedOrder} onBack={closeOrderDetails} />;
    }

    return (
        <div className="min-h-screen bg-slate-950 p-4 text-slate-100 animate-fade-in-up sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Admin Orders</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Order Management</h1>
                        <p className="mt-2 max-w-2xl text-slate-400">Track customer purchases from a nested full-page workflow. Order details now open as a dedicated page instead of a cramped modal window.</p>
                    </div>
                    <button
                        onClick={handleExportCSV}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-6 py-4 text-sm font-black text-cyan-100 shadow-2xl shadow-cyan-500/10 transition hover:-translate-y-0.5 hover:bg-cyan-400/20"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <MetricCard label="Total Orders" value={safeOrders.length} accent="text-white" />
                    <MetricCard label="Completed Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} accent="text-emerald-300" helper={`${completedOrders.length} completed orders`} />
                    <MetricCard label="Needs Attention" value={pendingOrders.length} accent="text-amber-300" helper="Pending or awaiting verification" />
                </div>

                <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-max text-left">
                            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-[0.24em] text-slate-400">
                                <tr>
                                    <th className="p-5 font-black">Order ID</th>
                                    <th className="p-5 font-black">Customer</th>
                                    <th className="p-5 font-black">Date</th>
                                    <th className="p-5 font-black">Items</th>
                                    <th className="p-5 font-black">Total</th>
                                    <th className="p-5 font-black">Status</th>
                                    <th className="p-5 text-right font-black">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {safeOrders.length > 0 ? safeOrders.map(order => {
                                    const orderItems = order.items || [];
                                    const quantity = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

                                    return (
                                        <tr key={order.id} className="group transition hover:bg-white/5">
                                            <td className="p-5 font-mono text-sm font-black text-cyan-200">#{order.id}</td>
                                            <td className="p-5">
                                                <p className="font-black text-white group-hover:text-cyan-200">{order.customerName}</p>
                                                <p className="mt-1 text-xs text-slate-500">{order.customerEmail}</p>
                                            </td>
                                            <td className="p-5 text-sm font-bold text-slate-300">{formatDate(order.date)}</td>
                                            <td className="p-5"><span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-black text-slate-300">{quantity} units</span></td>
                                            <td className="p-5 text-sm font-black text-slate-100">{order.total}</td>
                                            <td className="p-5"><StatusBadge status={order.status} /></td>
                                            <td className="p-5 text-right">
                                                <button
                                                    onClick={() => openOrderDetails(order)}
                                                    className="rounded-2xl border border-cyan-300/30 px-4 py-2 text-sm font-black text-cyan-200 transition hover:bg-cyan-400/10"
                                                >
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} className="p-12 text-center text-slate-400">
                                            <p className="text-4xl">🧾</p>
                                            <p className="mt-3 text-lg font-black text-white">No orders yet</p>
                                            <p className="mt-1">Customer purchases will appear here when orders are created.</p>
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
