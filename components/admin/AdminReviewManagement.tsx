
import React from 'react';
import { ProductWithRating, Review } from '../../App';

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex items-center">
        {/* Gradient definition needed for SVG fill */}
        <svg width="0" height="0" className="absolute">
            <defs>
                <linearGradient id="admin-star-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
            </defs>
        </svg>
        {[...Array(5)].map((_, i) => (
             <svg
                key={i}
                className="w-5 h-5"
                viewBox="0 0 24 24" 
                xmlns="http://www.w3.org/2000/svg"
            >
                <path 
                    d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"
                    fill={i < Math.round(rating) ? "url(#admin-star-gradient)" : "#E5E7EB"}
                    stroke={i < Math.round(rating) ? "#F59E0B" : "#D1D5DB"}
                    strokeWidth="0.5"
                />
            </svg>
        ))}
    </div>
);


const AdminReviewManagement: React.FC<{
    products: ProductWithRating[];
    reviews: { [productId: number]: Review[] };
}> = ({ products, reviews }) => {
    
    const allReviews = Object.keys(reviews).flatMap((productIdStr) => {
        const productId = parseInt(productIdStr, 10);
        const product = products.find(p => p.id === productId);
        const productReviewsForId = reviews[productId];
        if (!Array.isArray(productReviewsForId)) {
            return [];
        }
        return productReviewsForId.map(review => ({
            ...review,
            productId: parseInt(productIdStr),
            productTitle: product?.title || 'Unknown Product'
        }));
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Customer Reviews</h1>
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="p-4 font-semibold">Product</th>
                                <th className="p-4 font-semibold">Customer</th>
                                <th className="p-4 font-semibold">Rating</th>
                                <th className="p-4 font-semibold">Comment</th>
                                <th className="p-4 font-semibold">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allReviews.length > 0 ? (
                                allReviews.map((review, index) => (
                                    <tr key={index} className="border-b hover:bg-gray-50">
                                        <td className="p-4 font-medium text-gray-800">{review.productTitle}</td>
                                        <td className="p-4 text-gray-600">{review.name}</td>
                                        <td className="p-4"><StarRating rating={review.rating} /></td>
                                        <td className="p-4 text-gray-600 max-w-sm whitespace-normal">{review.comment}</td>
                                        <td className="p-4 text-gray-500">{review.date}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="text-center p-8 text-gray-500">
                                        No customer reviews have been submitted yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminReviewManagement;
