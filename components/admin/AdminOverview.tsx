import React, { useMemo, useState } from 'react';
import type { AdminUser, Order, ProductWithRating, Review, SupportTicket, User } from '../../App';
import type { AdminView } from './AdminDashboard';

interface AdminOverviewProps {
    products: ProductWithRating[];
    reviews: { [productId: number]: Review[] };
    users: User[];
    orders: Order[];
    tickets: SupportTicket[];
    currentAdminUser: AdminUser;
    onNavigate: (view: AdminView) => void;
}

type DashboardOrderFilter = 'All' | Order['status'];

const parseCurrency = (value: string) => Number.parseFloat(String(value || '').replace('₹', '').replace(/,/g, '')) || 0;

const safeDateValue = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const statusClass: Record<Order['status'], string> = {
    Pending: 'bg-[#fff1df] text-[#b66d15]',
    'Awaiting Verification': 'bg-[#fff0e5] text-[#c15d2e]',
    Shipped: 'bg-[#eaf0ff] text-[#4867b3]',
    Completed: 'bg-[#e7f6ed] text-[#278654]',
    Cancelled: 'bg-[#fdebed] text-[#c34a57]',
};

const progressForStatus: Record<Order['status'], number> = {
    Pending: 25,
    'Awaiting Verification': 45,
    Shipped: 75,
    Completed: 100,
    Cancelled: 0,
};

const StatCard: React.FC<{
    label: string;
    value: string | number;
    helper: string;
    tone: 'rose' | 'amber' | 'blue' | 'green';
    icon: React.ReactNode;
}> = ({ label, value, helper, tone, icon }) => {
    const toneClass = {
        rose: 'bg-[#fdebed] text-[#d94857]',
        amber: 'bg-[#fff1df] text-[#b66d15]',
        blue: 'bg-[#eaf0ff] text-[#4867b3]',
        green: 'bg-[#e7f6ed] text-[#278654]',
    }[tone];

    return (
        <div className="rounded-xl border border-[#efebeb] bg-white p-4 shadow-[0_4px_16px_rgba(45,33,36,0.035)]">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-[10px] font-bold text-[#969094]">{label}</p>
                    <p className="mt-2 truncate text-[24px] font-black tracking-[-0.04em] text-[#25272b]">{value}</p>
                </div>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div>
            </div>
            <p className="mt-2 truncate text-[9px] font-semibold text-[#a19b9e]">{helper}</p>
        </div>
    );
};

const AdminOverview: React.FC<AdminOverviewProps> = ({ products, reviews, users, orders, tickets, currentAdminUser, onNavigate }) => {
    const [statusFilter, setStatusFilter] = useState<DashboardOrderFilter>('All');
    const [searchQuery, setSearchQuery] = useState('');

    const completedOrders = useMemo(() => orders.filter((order) => order.status === 'Completed'), [orders]);
    const pendingOrders = useMemo(() => orders.filter((order) => order.status === 'Pending' || order.status === 'Awaiting Verification'), [orders]);
    const shippedOrders = useMemo(() => orders.filter((order) => order.status === 'Shipped'), [orders]);
    const totalRevenue = useMemo(() => completedOrders.reduce((sum, order) => sum + parseCurrency(order.total), 0), [completedOrders]);
    const totalReviews = useMemo(() => (Object.values(reviews) as Review[][]).reduce((sum, list) => sum + list.length, 0), [reviews]);
    const openTickets = useMemo(() => tickets.filter((ticket) => ticket.status !== 'Resolved').length, [tickets]);

    const filteredOrders = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return [...orders]
            .sort((a, b) => safeDateValue(b.date) - safeDateValue(a.date))
            .filter((order) => statusFilter === 'All' || order.status === statusFilter)
            .filter((order) => {
                if (!query) return true;
                const itemNames = order.items.map((item) => item.name).join(' ');
                return [order.id, order.customerName, order.customerEmail, order.total, itemNames, order.status]
                    .join(' ')
                    .toLowerCase()
                    .includes(query);
            })
            .slice(0, 12);
    }, [orders, searchQuery, statusFilter]);

    const orderFilters: DashboardOrderFilter[] = ['All', 'Pending', 'Awaiting Verification', 'Shipped', 'Completed', 'Cancelled'];

    return (
        <div data-admin-overview="SHIPNOW_ADMIN_OVERVIEW_V1" className="space-y-4 animate-fade-in">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[10px] font-bold text-[#a29c9f]">Welcome back, {currentAdminUser.email.split('@')[0]}</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#24262a] sm:text-2xl">Store operations overview</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onNavigate('support')} className="rounded-lg border border-[#e9e5e5] bg-white px-3 py-2 text-[10px] font-bold text-[#686268] transition hover:border-[#efb7bc] hover:text-[#d94857]">
                        {openTickets} open support
                    </button>
                    <button type="button" onClick={() => onNavigate('orders')} className="rounded-lg bg-[#202124] px-3.5 py-2 text-[10px] font-black text-white transition hover:bg-black">
                        View all orders
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    label="Total Revenue"
                    value={`₹${totalRevenue.toLocaleString('en-IN')}`}
                    helper={`${completedOrders.length} completed order${completedOrders.length === 1 ? '' : 's'}`}
                    tone="rose"
                    icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
                />
                <StatCard
                    label="Pending"
                    value={pendingOrders.length}
                    helper={`${orders.length} total order${orders.length === 1 ? '' : 's'}`}
                    tone="amber"
                    icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
                />
                <StatCard
                    label="In Delivery"
                    value={shippedOrders.length}
                    helper={`${products.length} product${products.length === 1 ? '' : 's'} in catalog`}
                    tone="blue"
                    icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0m4 0h6m-10 0H3V6a1 1 0 0 1 1-1h9v12m2 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0m0 0h2v-6l-3-3h-5" /></svg>}
                />
                <StatCard
                    label="Completed"
                    value={completedOrders.length}
                    helper={`${users.length} users · ${totalReviews} reviews`}
                    tone="green"
                    icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
                />
            </div>

            <section className="overflow-hidden rounded-xl border border-[#efebeb] bg-white shadow-[0_4px_18px_rgba(45,33,36,0.035)]">
                <div className="flex flex-col gap-3 border-b border-[#f0eded] p-3.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="shipnow-admin-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-lg bg-[#f7f5f5] p-1">
                        {orderFilters.map((filter) => (
                            <button
                                type="button"
                                key={filter}
                                onClick={() => setStatusFilter(filter)}
                                className={`shrink-0 rounded-md px-3 py-1.5 text-[9px] font-black transition ${statusFilter === filter ? 'bg-[#202124] text-white shadow-sm' : 'text-[#817b7e] hover:bg-white hover:text-[#d94857]'}`}
                            >
                                {filter === 'Awaiting Verification' ? 'Awaiting' : filter}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="relative min-w-0 flex-1 lg:w-[250px] lg:flex-none">
                            <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#aaa4a6]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" /></svg>
                            <input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search order, customer, product..."
                                className="h-9 w-full rounded-lg border border-[#e8e4e4] bg-white pl-9 pr-3 text-[10px] font-medium text-[#393b40] placeholder:text-[#b6b0b2]"
                            />
                        </label>
                        <button type="button" onClick={() => onNavigate('orders')} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#e8e4e4] bg-white px-3 text-[9px] font-black text-[#706a6d] transition hover:border-[#efb7bc] hover:text-[#d94857]">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 .8 1.6L14 13.667V19a1 1 0 0 1-.553.894l-4 2A1 1 0 0 1 8 21v-7.333L3.2 4.6A1 1 0 0 1 3 4Z" /></svg>
                            Full orders
                        </button>
                    </div>
                </div>

                <div className="shipnow-admin-scrollbar overflow-x-auto">
                    <table className="min-w-[900px] w-full text-left">
                        <thead>
                            <tr>
                                <th className="px-4 py-3">Order ID</th>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Products</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Progress</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => {
                                const progress = progressForStatus[order.status];
                                const displayDate = safeDateValue(order.date)
                                    ? new Date(order.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : order.date;
                                return (
                                    <tr key={order.id} className="border-t border-[#f1eeee] transition hover:bg-[#fcfafa]">
                                        <td className="px-4 py-3">
                                            <button type="button" onClick={() => onNavigate('orders')} className="text-[10px] font-black text-[#d94857] hover:underline">#{order.id}</button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2eeee] text-[9px] font-black text-[#6f696c]">{order.customerName.charAt(0).toUpperCase()}</div>
                                                <div className="min-w-0">
                                                    <p className="max-w-[170px] truncate text-[10px] font-bold text-[#33353a]">{order.customerName}</p>
                                                    <p className="max-w-[170px] truncate text-[8px] font-medium text-[#aaa4a6]">{order.customerEmail}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="max-w-[220px] truncate text-[10px] font-semibold text-[#54575d]">{order.items.map((item) => item.name).join(', ') || 'No item name'}</p>
                                            <p className="mt-0.5 text-[8px] font-medium text-[#aaa4a6]">{order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
                                        </td>
                                        <td className="px-4 py-3 text-[10px] font-black text-[#33353a]">{order.total}</td>
                                        <td className="px-4 py-3 text-[9px] font-semibold text-[#777176]">{displayDate}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#f1eeee]">
                                                    <div className={`h-full rounded-full ${order.status === 'Completed' ? 'bg-[#36a269]' : order.status === 'Cancelled' ? 'bg-[#d1cbcd]' : 'bg-[#ee5261]'}`} style={{ width: `${progress}%` }} />
                                                </div>
                                                <span className="w-7 text-right text-[8px] font-bold text-[#918b8e]">{progress}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex rounded-full px-2 py-1 text-[8px] font-black ${statusClass[order.status]}`}>{order.status}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredOrders.length === 0 && (
                    <div className="px-6 py-12 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f5f5] text-[#aaa4a6]">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-4l-2 3h-4l-2-3H4" /></svg>
                        </div>
                        <p className="mt-3 text-xs font-black text-[#4f5258]">No matching orders</p>
                        <p className="mt-1 text-[9px] font-medium text-[#aaa4a6]">Change the status tab or search term.</p>
                    </div>
                )}

                <div className="flex items-center justify-between border-t border-[#f0eded] px-4 py-3 text-[9px] font-semibold text-[#9d979a]">
                    <span>Showing {filteredOrders.length} of {orders.length} orders</span>
                    <button type="button" onClick={() => onNavigate('orders')} className="font-black text-[#d94857] hover:underline">Open order management</button>
                </div>
            </section>
        </div>
    );
};

export default AdminOverview;
