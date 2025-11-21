
import React, { useState } from 'react';
import { Review, WebsiteSettings } from '../App';

interface StarRatingProps {
  rating: number;
  setRating?: (rating: number) => void;
  interactive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const Star: React.FC<{ filled: boolean; onClick?: () => void, isInteractive: boolean, size: string }> = ({ filled, onClick, isInteractive, size }) => {
    const sizeClass = size === 'lg' ? 'w-8 h-8' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
    
    return (
        <svg 
            onClick={onClick}
            className={`transition-all duration-200 ${sizeClass} ${isInteractive ? 'cursor-pointer transform hover:scale-110' : ''}`}
            viewBox="0 0 24 24" 
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id="star-gradient-gold" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FBBF24" /> {/* amber-400 */}
                    <stop offset="100%" stopColor="#F59E0B" /> {/* amber-500 */}
                </linearGradient>
                <linearGradient id="star-gradient-gray" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#E5E7EB" />
                    <stop offset="100%" stopColor="#D1D5DB" />
                </linearGradient>
            </defs>
            <path 
                d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"
                fill={filled ? "url(#star-gradient-gold)" : "url(#star-gradient-gray)"}
                stroke={filled ? "#F59E0B" : "#D1D5DB"}
                strokeWidth="0.5"
            />
        </svg>
    );
};

const StarRating: React.FC<StarRatingProps> = ({ rating, setRating, interactive = false, size = 'md' }) => {
    const [hoverRating, setHoverRating] = useState(0);

    return (
        <div 
            className="flex items-center space-x-1"
            onMouseLeave={interactive ? () => setHoverRating(0) : undefined}
        >
            {[1, 2, 3, 4, 5].map((star) => (
                <div 
                    key={star} 
                    onMouseEnter={interactive ? () => setHoverRating(star) : undefined}
                >
                    <Star 
                        filled={star <= (hoverRating || rating)} 
                        onClick={interactive && setRating ? () => setRating(star) : undefined}
                        isInteractive={interactive}
                        size={size}
                    />
                </div>
            ))}
        </div>
    );
};

const RatingBar: React.FC<{ star: number, count: number, total: number }> = ({ star, count, total }) => {
    const percentage = total > 0 ? (count / total) * 100 : 0;
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="w-3 font-bold text-gray-600">{star}</span>
            <span className="text-yellow-400">★</span>
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-yellow-400 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
            <span className="w-8 text-right text-gray-500 text-xs">{percentage.toFixed(0)}%</span>
        </div>
    );
};

interface RatingsAndReviewsProps {
  settings: WebsiteSettings;
  productTitle: string;
  prompt?: string;
  reviews: Review[];
  onAddReview: (reviewData: { rating: number; comment: string }) => void;
}

const RatingsAndReviews: React.FC<RatingsAndReviewsProps> = ({ settings, productTitle, prompt, reviews, onAddReview }) => {
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isWritingReview, setIsWritingReview] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim() === '') return;
    onAddReview({ rating: newRating, comment: newComment });
    setSubmitted(true);
    setTimeout(() => {
        setNewComment('');
        setNewRating(5);
        setSubmitted(false);
        setIsWritingReview(false);
    }, 3000);
  };
  
  const averageRating = reviews.length > 0
    ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length
    : 0;

  const ratingCounts = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: reviews.filter(r => Math.round(r.rating) === star).length
  }));

  return (
    <div className="container mx-auto px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-extrabold text-primary text-center mb-12">
          Customer Reviews
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Left Column: Stats & Breakdown */}
            <div className="lg:col-span-4 space-y-8">
                <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center lg:text-left">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Rating Overview</h3>
                    <div className="flex items-end gap-4 justify-center lg:justify-start mb-6">
                        <span className="text-6xl font-extrabold text-gray-900 leading-none">{averageRating.toFixed(1)}</span>
                        <div className="flex flex-col mb-1">
                            <StarRating rating={averageRating} size="md" />
                            <span className="text-sm text-gray-500 mt-1">{reviews.length} Review{reviews.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        {ratingCounts.map(({ star, count }) => (
                            <RatingBar key={star} star={star} count={count} total={reviews.length} />
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <h4 className="font-semibold text-gray-800 mb-2">Share your thoughts</h4>
                        <p className="text-sm text-gray-500 mb-4">If you’ve used this product, share your thoughts with other customers.</p>
                        <button 
                            onClick={() => setIsWritingReview(!isWritingReview)}
                            className="w-full bg-white border-2 border-primary text-primary font-bold py-2.5 rounded-xl hover:bg-primary hover:text-white transition-all duration-300"
                        >
                            {isWritingReview ? 'Cancel Review' : 'Write a Review'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Column: Reviews List & Form */}
            <div className="lg:col-span-8">
                {/* Review Form */}
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isWritingReview ? 'max-h-[600px] opacity-100 mb-10' : 'max-h-0 opacity-0'}`}>
                    <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100">
                        <h3 className="text-xl font-bold text-gray-800 mb-6">{prompt || 'Write a Review'}</h3>
                        {submitted ? (
                            <div className="flex flex-col items-center justify-center py-8 text-green-600">
                                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-lg font-semibold">Review Submitted!</p>
                                <p className="text-sm opacity-80">Thanks for your feedback.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className="mb-6">
                                    <label className="block text-sm font-bold text-gray-700 mb-2">How would you rate this product?</label>
                                    <StarRating rating={newRating} setRating={setNewRating} interactive={true} size="lg" />
                                </div>
                                <div className="mb-6">
                                    <label htmlFor="comment" className="block text-sm font-bold text-gray-700 mb-2">Your Review</label>
                                    <textarea
                                        id="comment"
                                        rows={4}
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-gray-50 focus:bg-white"
                                        placeholder={`Tell us what you liked or didn't like about the ${productTitle}...`}
                                        required
                                    ></textarea>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="bg-primary text-white font-bold px-8 py-3 rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                                        Submit Review
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>

                {/* Reviews Grid */}
                <div className="space-y-6">
                    {reviews.length === 0 && !isWritingReview && (
                        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            <p className="text-lg text-gray-500 font-medium">No reviews yet.</p>
                            <p className="text-sm text-gray-400">Be the first to share your experience!</p>
                        </div>
                    )}

                    {reviews.map((review, index) => (
                        <div key={index} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-300 flex gap-4 animate-fade-in-up" style={{ animationDelay: `${index * 100}ms`}}>
                            {/* Avatar Placeholder */}
                            <div className="flex-shrink-0">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-inner`} style={{ backgroundColor: `hsl(${(review.name.length * 50) % 360}, 70%, 50%)` }}>
                                    {review.name.charAt(0).toUpperCase()}
                                </div>
                            </div>
                            
                            <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                                    <h4 className="font-bold text-gray-900 text-lg">{review.name}</h4>
                                    <span className="text-xs text-gray-400 font-medium">{review.date}</span>
                                </div>
                                <div className="flex items-center gap-2 mb-3">
                                    <StarRating rating={review.rating} size="sm" />
                                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">Verified Purchase</span>
                                </div>
                                <p className="text-gray-600 leading-relaxed">{review.comment}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default RatingsAndReviews;
