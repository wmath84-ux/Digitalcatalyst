import React from 'react';
import { ProductWithRating, Review } from '../../App';

interface ReportsProps {
    products: ProductWithRating[];
    reviews: { [productId: number]: Review[] };
}

const StatCard: React.FC<{ title: string; value: string | number }> = ({ title, value }) => (
    <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="font-bold text-lg text-razorpay-blue">{title}</h3>
        <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
);

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex items-center">
        {/* Gradient definition needed for SVG fill */}
        <svg width="0" height="0" className="absolute">
            <defs>
                <linearGradient id="report-star-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
            </defs>
        </svg>
        {[...Array(5)].map((_, i) => (
             <svg key={i} className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path 
                    d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"
                    fill={i < Math.round(rating) ? "url(#report-star-gradient)" : "#E5E7EB"}
                    stroke={i < Math.round(rating) ? "#F59E0B" : "#D1D5DB"}
                    strokeWidth="0.5"
                />
            </svg>
        ))}
    </div>
);

const ProductListCard: React.FC<{ title: string; products: ProductWithRating[] }> = ({ title, products }) => (
     <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="font-bold text-lg text-razorpay-blue mb-4">{title}</h3>
        {products.length > 0 ? (
            <ul className="space-y-3">
                {products.map(p => (
                    <li key={p.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium text-gray-700">{p.title}</span>
                         <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800 text-xs">{p.rating.toFixed(1)}</span>
                            <StarRating rating={p.rating} />
                        </div>
                    </li>
                ))}
            </ul>
        ) : (
            <p className="text-sm text-gray-500">Not enough data to display.</p>
        )}
    </div>
);

const Reports: React.FC<ReportsProps> = ({ products, reviews }) => {
    // Create a clean, validated array of all reviews first to prevent errors from malformed data.
    const allValidReviews = Object.values(reviews)
        .filter(Array.isArray) // Ensure we only process arrays of reviews
        .flat()
        .filter((r): r is Review => r && typeof r.rating === 'number');

    const totalReviews = allValidReviews.length;

    const overallAverageRating = () => {
        if (totalReviews === 0) return 0;
        const totalRatingSum = allValidReviews.reduce((acc, r) => acc + r.rating, 0);
        return totalRatingSum / totalReviews;
    };

    const sortedProducts = [...products]
        .filter(p => p.reviewCount > 0)
        .sort((a, b) => b.rating - a.rating);
    
    const topRatedProducts = sortedProducts.slice(0, 3);
    const lowestRatedProducts = sortedProducts.slice(-3).reverse();


    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Store Reports</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <StatCard title="Total Products" value={products.length} />
                <StatCard title="Total Customer Reviews" value={totalReviews} />
                <StatCard title="Overall Average Rating" value={overallAverageRating().toFixed(2)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <ProductListCard title="Top 3 Highest Rated Products" products={topRatedProducts} />
                <ProductListCard title="Top 3 Lowest Rated Products" products={lowestRatedProducts} />
            </div>
        </div>
    );
};

export default Reports;