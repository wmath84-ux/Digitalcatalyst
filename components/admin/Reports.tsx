import React from 'react';
import { Order, ProductWithRating, Review, SupportTicket, User } from '../../App';

interface ReportsProps {
    products: ProductWithRating[];
    reviews: { [productId: number]: Review[] };
    orders: Order[];
    users: User[];
    tickets: SupportTicket[];
}

const parseMoney = (value: string | number | undefined | null) => Number(String(value || '0').replace(/[^\d.]/g, '')) || 0;
const formatMoney = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const formatDate = (value?: string) => {
    if (!value) return 'Unknown';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const StatCard: React.FC<{ title: string; value: string | number; helper?: string }> = ({ title, value, helper }) => (
    <div className="rounded-[1.5rem] border border-white/60 bg-white/85 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{title}</h3>
        <p className="mt-3 text-3xl font-black text-slate-900">{value}</p>
        {helper && <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{helper}</p>}
    </div>
);

const DataCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="rounded-[1.5rem] border border-white/60 bg-white/85 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
        <h3 className="text-lg font-black text-slate-900">{title}</h3>
        <div className="mt-4">{children}</div>
    </section>
);

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
             <svg key={i} className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z" fill={i < Math.round(rating) ? '#F59E0B' : '#E5E7EB'} />
            </svg>
        ))}
    </div>
);

const Reports: React.FC<ReportsProps> = ({ products, reviews, orders, users, tickets }) => {
    const allValidReviews = Object.values(reviews).filter(Array.isArray).flat().filter((r): r is Review => r && typeof r.rating === 'number');
    const completedOrders = orders.filter(order => order.status === 'Completed');
    const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.paymentBreakdown?.finalPrice ?? parseMoney(order.total)), 0);
    const openTickets = tickets.filter(ticket => ticket.status !== 'Resolved').length;
    const uniqueCustomerEmails = new Set(orders.map(order => String(order.customerEmail || '').toLowerCase()).filter(Boolean));
    const topRatedProducts = [...products].filter(product => product.reviewCount > 0).sort((a, b) => b.rating - a.rating).slice(0, 5);
    const latestOrders = [...orders].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Database-backed reports</p>
                <h1 className="mt-2 text-3xl font-black text-slate-900">Store Reports</h1>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Connected to live products, orders, users, support tickets, and review data already synced into the admin dashboard.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Lifetime revenue" value={formatMoney(totalRevenue)} helper={`${completedOrders.length} completed order${completedOrders.length === 1 ? '' : 's'}`} />
                <StatCard title="Logged-in users" value={users.length} helper="From Firebase users collection when admin is signed in" />
                <StatCard title="Order customers" value={uniqueCustomerEmails.size} helper={`${orders.length} total order record${orders.length === 1 ? '' : 's'}`} />
                <StatCard title="Open support" value={openTickets} helper={`${tickets.length} total ticket${tickets.length === 1 ? '' : 's'}`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <DataCard title="Latest real orders">
                    {latestOrders.length ? (
                        <div className="space-y-3">
                            {latestOrders.map(order => (
                                <div key={order.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-black text-slate-900">#{order.id}</p>
                                            <p className="text-xs font-bold text-slate-500">{order.customerEmail || order.customerName}</p>
                                        </div>
                                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{order.status}</span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-sm font-bold text-slate-600"><span>{formatDate(order.date)}</span><span>{formatMoney(order.paymentBreakdown?.finalPrice ?? parseMoney(order.total))}</span></div>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-sm font-bold text-slate-500">No real orders found.</p>}
                </DataCard>

                <DataCard title="Top rated products from real reviews">
                    {topRatedProducts.length ? (
                        <div className="space-y-3">
                            {topRatedProducts.map(product => (
                                <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <div className="min-w-0"><p className="truncate font-black text-slate-900">{product.title}</p><p className="text-xs font-bold text-slate-500">{product.reviewCount} review{product.reviewCount === 1 ? '' : 's'}</p></div>
                                    <div className="text-right"><p className="font-black text-slate-900">{product.rating.toFixed(1)}</p><StarRating rating={product.rating} /></div>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-sm font-bold text-slate-500">Not enough review data to display.</p>}
                </DataCard>
            </div>

            <DataCard title="Data source contract">
                <div className="grid gap-3 text-sm font-bold text-slate-600 md:grid-cols-2">
                    <p className="rounded-2xl bg-slate-50 p-4">Products: live siteProducts collection via dashboard state.</p>
                    <p className="rounded-2xl bg-slate-50 p-4">Orders: live siteOrders collection via dashboard state.</p>
                    <p className="rounded-2xl bg-slate-50 p-4">Users: live users collection for admin sessions.</p>
                    <p className="rounded-2xl bg-slate-50 p-4">Support: live siteSupportTickets collection via dashboard state.</p>
                </div>
            </DataCard>
        </div>
    );
};

export default Reports;
