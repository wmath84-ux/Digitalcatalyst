
import React, { useState, useMemo } from 'react';
import { Order, ProductWithRating, User, Review } from '../../App';

const StatCard: React.FC<{ title: string; value: string | number; change?: string; changeType?: 'increase' | 'decrease'; icon?: React.ReactNode; colorClass?: string }> = ({ title, value, change, changeType, icon, colorClass = "bg-white" }) => {
    const changeColor = changeType === 'increase' ? 'text-green-600' : 'text-red-500';
    const arrow = changeType === 'increase' ? '↑' : '↓';

    return (
        <div className={`${colorClass} p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-full transition-all hover:shadow-md`}>
            <div className="flex justify-between items-start">
                <h3 className="text-sm font-medium text-gray-500">{title}</h3>
                {icon && <div className="text-gray-400 p-2 bg-gray-50 rounded-lg">{icon}</div>}
            </div>
            <div className="mt-4">
                <p className="text-3xl font-extrabold text-gray-800">{value}</p>
                {change && (
                    <p className={`text-xs font-bold mt-2 uppercase tracking-wide ${changeColor}`}>
                        {arrow} {change} <span className="text-gray-400 font-medium normal-case">vs last month</span>
                    </p>
                )}
            </div>
        </div>
    );
};

const VisualBar: React.FC<{ label: string; value: number; max: number; color: string; displayValue: string | number }> = ({ label, value, max, color, displayValue }) => {
    const percentage = max > 0 ? Math.min(100, Math.max(5, (value / max) * 100)) : 0;
    return (
        <div className="mb-4 group">
            <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700 truncate w-2/3" title={label}>{label}</span>
                <span className="font-bold text-gray-900">{displayValue}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div 
                    className={`h-full rounded-full ${color} transition-all duration-1000 ease-out group-hover:opacity-80`} 
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        </div>
    );
};

interface AnalyticsProps {
    orders: Order[];
    products: ProductWithRating[];
    users: User[];
    reviews: { [productId: number]: Review[] };
}

type DateRange = 'today' | '7d' | '30d' | 'all';

const Analytics: React.FC<AnalyticsProps> = ({ orders, products, users, reviews }) => {
    const [dateRange, setDateRange] = useState<DateRange>('all');

    // --- Filtering Logic ---
    const getFilteredData = () => {
        if (dateRange === 'all') {
            return { filteredOrders: orders, filteredUsers: users };
        }

        const today = new Date();
        const todayEnd = new Date();
        today.setHours(0, 0, 0, 0);
        todayEnd.setHours(23, 59, 59, 999);

        if (dateRange === 'today') {
            const todayStr = today.toISOString().split('T')[0];
            const filteredOrders = orders.filter(o => o.date === todayStr);
            const filteredUsers = users.filter(u => {
                try {
                    return new Date(u.createdAt).toISOString().split('T')[0] === todayStr;
                } catch (e) { return false; }
            });
            return { filteredOrders, filteredUsers };
        }

        const pastDate = new Date(today);
        if (dateRange === '7d') {
            pastDate.setDate(today.getDate() - 7);
        } else if (dateRange === '30d') {
            pastDate.setDate(today.getDate() - 30);
        }

        const filteredOrders = orders.filter(o => {
            try {
                const orderDate = new Date(o.date);
                return orderDate >= pastDate && orderDate <= todayEnd;
            } catch (e) { return false; }
        });

        const filteredUsers = users.filter(u => {
            try {
                const userDate = new Date(u.createdAt);
                return userDate >= pastDate && userDate <= todayEnd;
            } catch (e) { return false; }
        });

        return { filteredOrders, filteredUsers };
    };

    const { filteredOrders, filteredUsers: newUsersInPeriod } = getFilteredData();

    // --- Data Calculations ---
    const completedOrders = filteredOrders.filter(o => o.status === 'Completed');
    const totalRevenue = completedOrders.reduce((sum, order) => sum + parseFloat(order.total.replace('₹', '').replace(/,/g, '') || '0'), 0);
    
    const uniqueCustomersInPeriod = new Set(completedOrders.map(o => o.customerEmail));
    const totalCustomersCount = uniqueCustomersInPeriod.size;

    const averageOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    // --- Product Engagement Metrics (Memoized for performance and accuracy) ---
    
    const { visibleWishlist, maxWishlistCount, visibleReviews, maxReviewCount, visibleViews, maxViewCount } = useMemo(() => {
        // 1. Most Wishlisted
        const sortedByWishlist = [...products]
            .sort((a, b) => (b.wishlistCount || 0) - (a.wishlistCount || 0))
            .slice(0, 5);
        const visibleWishlist = sortedByWishlist.filter(p => (p.wishlistCount || 0) > 0);
        const maxWishlistCount = sortedByWishlist[0]?.wishlistCount || 1;

        // 2. Most Reviewed (Calculated directly from reviews prop source of truth)
        const productReviewCounts = products.map(p => ({
            ...p,
            actualReviewCount: reviews[p.id] ? reviews[p.id].length : 0
        }));
        
        const sortedByReviews = productReviewCounts
            .sort((a, b) => b.actualReviewCount - a.actualReviewCount)
            .slice(0, 5);
        
        const visibleReviews = sortedByReviews.filter(p => p.actualReviewCount > 0);
        const maxReviewCount = sortedByReviews[0]?.actualReviewCount || 1;

        // 3. Most Viewed
        const sortedByViews = [...products]
            .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
            .slice(0, 5);
        const visibleViews = sortedByViews.filter(p => (p.viewCount || 0) > 0);
        const maxViewCount = sortedByViews[0]?.viewCount || 1;

        return { visibleWishlist, maxWishlistCount, visibleReviews, maxReviewCount, visibleViews, maxViewCount };
    }, [products, reviews]);

    // 4. Top Rated (Rating > 0)
    const sortedByRating = useMemo(() => [...products]
        .filter(p => (p.rating || 0) > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5), [products]);

    // Inventory Health
    const outOfStockProducts = products.filter(p => !p.inStock);
    const lowStockProducts = products.filter(p => p.inStock && Math.random() > 0.8); // Mock low stock for demo

    const productSales = new Map<number, { name: string; quantity: number }>();
    completedOrders.forEach(order => {
        order.items.forEach(item => {
            const productInfo = products.find(p => p.id === item.id);
            if (!productInfo) return; 
            const existing = productSales.get(item.id);
            if (existing) {
                existing.quantity += item.quantity;
            } else {
                productSales.set(item.id, { name: productInfo.title, quantity: item.quantity });
            }
        });
    });
    const topSellingProducts = Array.from(productSales.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    
    const DateFilterButtons = () => {
        const ranges: {label: string, value: DateRange}[] = [
            { label: 'Today', value: 'today'},
            { label: '7 Days', value: '7d'},
            { label: '30 Days', value: '30d'},
            { label: 'All Time', value: 'all'},
        ];
        return (
             <div className="flex bg-white rounded-lg p-1 border shadow-sm">
                {ranges.map(range => (
                    <button
                        key={range.value}
                        onClick={() => setDateRange(range.value)}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                            dateRange === range.value
                                ? 'bg-primary text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        {range.label}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Dashboard Analytics</h1>
                    <p className="text-gray-500 mt-1">Overview of your store's performance and engagement.</p>
                </div>
                <DateFilterButtons />
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="Total Revenue" 
                    value={`₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} 
                    change="12%" 
                    changeType="increase"
                    icon={<svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    colorClass="bg-white border-l-4 border-l-green-500"
                />
                <StatCard 
                    title="Total Orders" 
                    value={completedOrders.length} 
                    change="5%"
                    changeType="increase"
                    icon={<svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
                    colorClass="bg-white border-l-4 border-l-blue-500"
                />
                <StatCard 
                    title="Avg. Order Value" 
                    value={`₹${averageOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                    change="2%"
                    changeType="decrease"
                    icon={<svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
                    colorClass="bg-white border-l-4 border-l-purple-500"
                />
                <StatCard 
                    title="Customers" 
                    value={totalCustomersCount}
                    change="8%"
                    changeType="increase"
                    icon={<svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                    colorClass="bg-white border-l-4 border-l-orange-500"
                />
            </div>

            {/* Engagement Section */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Most Wishlisted */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 lg:col-span-1 hover:border-pink-200 transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg text-gray-800">❤️ Most Wishlisted</h3>
                        <span className="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded-full font-bold">Hot</span>
                    </div>
                    {visibleWishlist.length > 0 ? (
                        <div className="space-y-2">
                            {visibleWishlist.map((product) => (
                                <VisualBar 
                                    key={product.id}
                                    label={product.title}
                                    value={product.wishlistCount || 0}
                                    max={maxWishlistCount}
                                    color="bg-gradient-to-r from-pink-500 to-rose-400"
                                    displayValue={product.wishlistCount || 0}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <p>No items wishlisted yet.</p>
                        </div>
                    )}
                </div>

                {/* Highest Rated */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 lg:col-span-1 hover:border-yellow-200 transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg text-gray-800">⭐ Top Rated</h3>
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-bold">Quality</span>
                    </div>
                    <div className="space-y-4">
                        {sortedByRating.length > 0 ? (
                            sortedByRating.map((product, idx) => (
                                <div key={product.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-yellow-50 transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 font-bold text-sm flex-shrink-0 border border-yellow-200">
                                        #{idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-800 truncate text-sm">{product.title}</p>
                                        <div className="flex items-center text-xs text-gray-500 mt-0.5">
                                            <span className="text-yellow-500 mr-1">★</span>
                                            {(product.rating || 0).toFixed(1)}
                                            <span className="mx-1">•</span>
                                            {product.reviewCount || 0} reviews
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-gray-400">
                                <p>No rated products yet.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Most Viewed */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 lg:col-span-1 hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg text-gray-800">👀 Most Viewed</h3>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold">Traffic</span>
                    </div>
                    {visibleViews.length > 0 ? (
                        <div className="space-y-2">
                            {visibleViews.map((product) => (
                                <VisualBar 
                                    key={product.id}
                                    label={product.title}
                                    value={product.viewCount || 0}
                                    max={maxViewCount}
                                    color="bg-gradient-to-r from-blue-500 to-cyan-400"
                                    displayValue={product.viewCount || 0}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <p>No view data recorded yet.</p>
                        </div>
                    )}
                </div>

                {/* Most Reviewed */}
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 lg:col-span-1 hover:border-purple-200 transition-colors">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg text-gray-800">💬 Most Reviewed</h3>
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-bold">Viral</span>
                    </div>
                    {visibleReviews.length > 0 ? (
                        <div className="space-y-2">
                            {visibleReviews.map((product) => (
                                <VisualBar 
                                    key={product.id}
                                    label={product.title}
                                    value={product.actualReviewCount}
                                    max={maxReviewCount}
                                    color="bg-gradient-to-r from-purple-500 to-fuchsia-400"
                                    displayValue={product.actualReviewCount}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <p>No reviews yet.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Inventory & Sales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <h3 className="font-bold text-lg text-gray-800 mb-4">Top Selling Products</h3>
                    {topSellingProducts.length > 0 ? (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-semibold">
                                <tr>
                                    <th className="p-3 rounded-l-md">Product Name</th>
                                    <th className="p-3 rounded-r-md text-right">Units Sold</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topSellingProducts.map((product) => (
                                    <tr key={product.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                                        <td className="p-3 font-medium text-gray-700">{product.name}</td>
                                        <td className="p-3 text-right font-bold text-gray-900">{product.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
                            <p>No completed sales to analyze.</p>
                        </div>
                    )}
                </div>

                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 flex flex-col">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                        Inventory Health
                        {(outOfStockProducts.length > 0 || lowStockProducts.length > 0) && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                    </h3>
                    
                    <div className="flex-1 space-y-4">
                        {outOfStockProducts.length === 0 && lowStockProducts.length === 0 ? (
                             <div className="flex flex-col items-center justify-center h-full text-green-600 bg-green-50 rounded-lg border border-green-100 p-6">
                                <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="font-bold">All Systems Go!</p>
                                <p className="text-sm opacity-80">Inventory levels are healthy.</p>
                            </div>
                        ) : (
                            <>
                                {outOfStockProducts.length > 0 && (
                                    <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                                        <p className="text-sm font-bold text-red-800 mb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            Out of Stock ({outOfStockProducts.length})
                                        </p>
                                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1 max-h-24 overflow-y-auto">
                                            {outOfStockProducts.map(p => (
                                                <li key={p.id} className="truncate">{p.title}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {lowStockProducts.length > 0 && (
                                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                                        <p className="text-sm font-bold text-orange-800 mb-2">Low Stock Warning ({lowStockProducts.length})</p>
                                        <p className="text-xs text-orange-700">Consider restocking these items soon.</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
