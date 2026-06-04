import React, { useState } from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';
import ProductMusicPlayer from './ProductMusicPlayer';

interface QuickViewModalProps {
  settings: WebsiteSettings;
  product: ProductWithRating;
  onClose: () => void;
  onAddToCart: (productId: number, quantity: number) => void;
  onBuyNow: (product: ProductWithRating) => void;
  isWishlisted: boolean;
  onToggleWishlist: (id: number) => void;
  onViewFullDetails: () => void;
}

const QuickViewModal: React.FC<QuickViewModalProps> = ({ settings, product, onClose, onAddToCart, onBuyNow, isWishlisted, onToggleWishlist, onViewFullDetails }) => {
  const [quantity, setQuantity] = useState(1);
  const [mainImage, setMainImage] = useState((product.images || [])[0] || `https://picsum.photos/seed/${product.imageSeed}/800/600`);

  const handleAddToCartClick = () => {
    onAddToCart(product.id, quantity);
    onClose();
  };

  const handleBuyNowClick = () => {
    onClose();
    onBuyNow(product);
  };

  return (
    <div className="fixed inset-0 bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 bg-opacity-60 z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-4xl max-h-[90vh] overflow-y-auto relative transform transition-all animate-scale-in-up flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-600 hover:text-gray-600 z-10" aria-label="Close modal">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="w-full md:w-1/2 p-4">
            <div className="bg-gray-100 rounded-lg overflow-hidden">
                <img src={mainImage} alt={product.title} className="w-full h-auto object-cover aspect-square"/>
            </div>
            <div className="mt-2 flex space-x-2">
                {(product.images || []).map((img, i) => (
                    <button key={i} onClick={() => setMainImage(img)} className={`w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${mainImage === img ? 'border-primary' : 'border-transparent hover:border-gray-400'}`}>
                        <img src={img} alt={`thumbnail ${i+1}`} className="w-full h-full object-cover"/>
                    </button>
                ))}
            </div>
        </div>

        <div className="w-full md:w-1/2 p-8 flex flex-col">
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{product.title}</h2>
          
          {product.isFree ? (
             <div className="mt-4">
                <span className="text-3xl font-bold text-blue-600">FREE</span>
                <p className="text-sm text-text-muted mt-1">Nominal Fee: ₹3</p>
            </div>
          ) : (
             <div className="mt-4">
                {product.salePrice ? (
                    <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-bold text-primary">{product.salePrice}</span>
                        <span className="text-xl font-medium text-slate-600 line-through">{product.price}</span>
                    </div>
                ) : ( <span className="text-3xl font-bold text-primary">{product.price}</span> )}
            </div>
          )}
          
          <p className="mt-4 text-text-muted text-sm">{product.description}</p>
          <ProductMusicPlayer product={product} variant="compact" className="mt-5" />
          
          <div className="mt-auto pt-6">
            <div className="flex gap-4 items-center">
                <div className="flex items-center border rounded-lg">
                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-2 text-lg font-bold text-gray-600 hover:bg-gray-100 rounded-l-lg">-</button>
                    <input type="number" value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 text-center border-l border-r font-semibold focus:outline-none" />
                    <button onClick={() => setQuantity(q => q + 1)} className="px-3 py-2 text-lg font-bold text-gray-600 hover:bg-gray-100 rounded-r-lg">+</button>
                </div>
                <button onClick={handleBuyNowClick} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold px-8 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95">
                    Buy Now
                </button>
                {settings.features.showFavourites && (
                    <button onClick={() => onToggleWishlist(product.id)} className="p-3 border rounded-lg text-slate-600 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={isWishlisted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>
                    </button>
                )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={handleAddToCartClick} className="rounded-lg border border-indigo-200 bg-white/80 px-4 py-3 text-sm font-black text-indigo-700 hover:bg-indigo-50">
                Add to Cart
              </button>
              <button onClick={onViewFullDetails} className="rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-sm font-black text-primary hover:bg-slate-50">
                Details →
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default QuickViewModal;