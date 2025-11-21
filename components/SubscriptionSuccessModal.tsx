import React from 'react';
import { ProductWithRating } from '../App';

interface SubscriptionSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  products: ProductWithRating[];
  onNavigateToAllProducts: () => void;
}

const MiniProductCard: React.FC<{ product: ProductWithRating }> = ({ product }) => (
    <div className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow">
        <div className="aspect-video bg-gray-100">
            <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
        </div>
        <div className="p-3">
            <h4 className="font-semibold text-sm truncate text-gray-800">{product.title}</h4>
            <p className="text-xs text-gray-500">{product.salePrice || product.price}</p>
        </div>
    </div>
);

const SubscriptionSuccessModal: React.FC<SubscriptionSuccessModalProps> = ({ isOpen, onClose, email, products, onNavigateToAllProducts }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-gray-100 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in-up" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b bg-white rounded-t-lg flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Check your inbox!</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-2xl" aria-label="Close modal">&times;</button>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
            {/* This div simulates an email client's view */}
            <div className="bg-white rounded-md shadow-md overflow-hidden border">
                <div className="p-4 bg-gray-50 border-b text-xs text-gray-500">
                    <p><strong>From:</strong> Digital Catalyst &lt;hello@digitalcatalyst.com&gt;</p>
                    <p><strong>To:</strong> {email}</p>
                    <p><strong>Subject:</strong> Welcome! Your Digital Journey Starts Now ✨</p>
                </div>

                <div className="p-6">
                    <h3 className="text-2xl font-bold text-primary">Congratulations & Welcome!</h3>
                    <p className="mt-4 text-gray-600">
                        We've sent a welcome email to <strong className="text-primary">{email}</strong> confirming your subscription. You're now part of a community dedicated to success in the digital world. Get ready for exclusive tips, new product announcements, and special offers delivered right to your inbox.
                    </p>

                    <div className="mt-6 pt-6 border-t">
                        <h4 className="text-xl font-semibold text-gray-800 text-center">To get you started, here are some of our top products:</h4>
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                           {products.slice(0, 3).map(p => <MiniProductCard key={p.id} product={p} />)}
                        </div>
                    </div>
                    
                    <div className="mt-8 text-center">
                        <button onClick={onNavigateToAllProducts} className="bg-primary text-white font-bold px-8 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95">
                            Explore All Products
                        </button>
                    </div>
                </div>

                <footer className="p-4 bg-gray-50 border-t text-center text-xs text-gray-400">
                    © {new Date().getFullYear()} Digital Catalyst. All rights reserved. This is a preview of the email sent to your inbox.
                </footer>
            </div>
        </main>
      </div>
    </div>
  );
};

export default SubscriptionSuccessModal;