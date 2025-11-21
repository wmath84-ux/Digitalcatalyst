
import React, { useState } from 'react';
import { Order, OrderItem } from '../../App';

// ... (Keep StatusBadge and OrderDetailsModal exactly as before)
const StatusBadge: React.FC<{ status: Order['status'] }> = ({ status }) => {
    const styles = {
        Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
        Shipped: "bg-blue-100 text-blue-700 border-blue-200",
        Pending: "bg-amber-100 text-amber-700 border-amber-200",
        Cancelled: "bg-rose-100 text-rose-700 border-rose-200",
    };
    return (
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
            {status}
        </span>
    );
};

const OrderDetailsModal: React.FC<{ order: Order; onClose: () => void }> = ({ order, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in-up" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Order #{order.id}</h2>
                        <p className="text-sm text-slate-500">{new Date(order.date).toLocaleDateString()} • <StatusBadge status={order.status} /></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">✕</button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Customer Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Customer</h3>
                            <p className="font-semibold text-slate-800">{order.customerName}</p>
                            <p className="text-slate-600 text-sm">{order.customerEmail}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Billing Address</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">{order.billingAddress}</p>
                        </div>
                    </div>

                    {/* Items */}
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 mb-3">Items</h3>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="p-3 font-semibold text-slate-600">Product</th>
                                        <th className="p-3 font-semibold text-slate-600 text-center">Qty</th>
                                        <th className="p-3 font-semibold text-slate-600 text-right">Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {order.items.map(item => (
                                        <tr key={item.id}>
                                            <td className="p-3 text-slate-800">{item.name}</td>
                                            <td className="p-3 text-slate-600 text-center">{item.quantity}</td>
                                            <td className="p-3 text-slate-800 text-right font-mono">{item.price}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t border-slate-200">
                                    <tr>
                                        <td colSpan={2} className="p-3 text-right font-bold text-slate-700">Total</td>
                                        <td className="p-3 text-right font-bold text-primary text-lg">{order.total}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors">Close</button>
                </div>
            </div>
        </div>
    );
};

const OrderManagement: React.FC<{ orders: Order[] }> = ({ orders }) => {
    const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

    const handleExportCSV = () => {
        if (orders.length === 0) {
            alert("No orders to export.");
            return;
        }

        const headers = ["Order ID", "Customer Name", "Email", "Date", "Status", "Total", "Items"];
        const escapeCsv = (field: string | number) => {
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = orders.map(order => [
            escapeCsv(order.id),
            escapeCsv(order.customerName),
            escapeCsv(order.customerEmail),
            escapeCsv(order.date),
            escapeCsv(order.status),
            escapeCsv(order.total.replace(/,/g, '')), 
            escapeCsv(order.items.map(i => `${i.quantity}x ${i.name}`).join('; ')) 
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
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
    };

    return (
        <div className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800">Order Management</h1>
                    <p className="text-slate-500 mt-1">Track and manage customer purchases.</p>
                </div>
                <button 
                    onClick={handleExportCSV}
                    className="bg-white border border-slate-300 text-slate-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-sm flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export CSV
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                 <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Order ID</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Customer</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-slate-50/80 transition-all duration-200 hover:shadow-inner group">
                                    <td className="p-3 sm:p-5 font-mono text-sm font-bold text-blue-600">{order.id}</td>
                                    <td className="p-3 sm:p-5">
                                        <p className="font-bold text-slate-800 text-sm">{order.customerName}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{order.customerEmail}</p>
                                    </td>
                                    <td className="p-3 sm:p-5 text-sm text-slate-600 font-medium">
                                        {new Date(order.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="p-3 sm:p-5 text-sm font-bold text-slate-800">{order.total}</td>
                                    <td className="p-3 sm:p-5">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="p-3 sm:p-5 text-right">
                                        <button 
                                            onClick={() => setViewingOrder(order)}
                                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {viewingOrder && <OrderDetailsModal order={viewingOrder} onClose={() => setViewingOrder(null)} />}
        </div>
    );
};

export default OrderManagement;
