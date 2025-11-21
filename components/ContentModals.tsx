
import React, { useRef, useEffect } from 'react';
import { ProductWithRating, Announcement, WebsiteSettings } from '../App';
import ProductCard from './ProductCard';

// --- Free Products Modal ---
interface FreeProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductWithRating[];
  settings: WebsiteSettings;
  onAddToCart: (productId: number, quantity?: number) => void;
  onViewProduct: (product: ProductWithRating) => void;
}

export const FreeProductsModal: React.FC<FreeProductsModalProps> = ({ isOpen, onClose, products, settings, onAddToCart, onViewProduct }) => {
    const modalContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !settings.animations.enabled) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    entry.target.classList.toggle('is-visible', entry.isIntersecting);
                });
            },
            { root: modalContentRef.current, rootMargin: '0px 0px -50px 0px', threshold: 0.1 }
        );
        const elements = modalContentRef.current?.querySelectorAll('.scroll-animate');
        if (elements) elements.forEach(el => observer.observe(el));
        return () => { if (elements) elements.forEach(el => observer.unobserve(el)); };
    }, [isOpen, products, settings.animations.enabled]);

    if (!isOpen) return null;

    return (
        <div className="blog-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="free-modal-title">
            <div ref={modalContentRef} className="blog-modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 font-bold text-2xl z-10" aria-label="Close free products modal">&times;</button>
                
                <div className="text-center mb-8">
                    <h2 id="free-modal-title" className="text-3xl font-extrabold text-primary">Free Digital Goodies</h2>
                    <p className="mt-2 text-lg text-text-muted">
                        Enjoy these complimentary resources, on us! A nominal fee of ₹3 applies.
                    </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {products.length > 0 ? products.map((product) => (
                        <div key={product.id} className={settings.animations.enabled ? 'scroll-animate' : ''}>
                            <ProductCard 
                                settings={settings}
                                product={product} 
                                onViewDetails={() => onViewProduct(product)}
                                isWishlisted={false} // Wishlist isn't relevant here
                                onToggleWishlist={() => {}} // No-op
                                onAddToCart={onAddToCart}
                                onQuickView={() => {}} // No quick view from this modal
                                animationDelay={0} // Stagger animation is disabled here
                                coupons={[]} // Empty coupons for free products
                            />
                        </div>
                    )) : (
                        <div className="col-span-full text-center py-12 text-text-muted">
                            <p>No free products available at the moment. Check back soon!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- Announcements Modal ---
interface AnnouncementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcements: Announcement[];
  settings: WebsiteSettings;
  onViewAnnouncement: (announcement: Announcement) => void;
}

const AnnouncementCard: React.FC<{ announcement: Announcement; onView: () => void; }> = ({ announcement, onView }) => {
    return (
        <button onClick={onView} className="bg-white rounded-xl shadow-md overflow-hidden border p-6 text-left w-full hover:shadow-lg hover:border-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
            <div className="flex justify-between items-start">
                <h3 className="text-xl font-bold text-primary">{announcement.title}</h3>
                <span className="text-sm text-text-muted flex-shrink-0 ml-4">{new Date(announcement.date).toLocaleDateString()}</span>
            </div>
            <p className="mt-4 text-text-muted">{announcement.content}</p>
        </button>
    );
};

export const AnnouncementsModal: React.FC<AnnouncementsModalProps> = ({ isOpen, onClose, announcements, settings, onViewAnnouncement }) => {
    const modalContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !settings.animations.enabled) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    entry.target.classList.toggle('is-visible', entry.isIntersecting);
                });
            },
            { root: modalContentRef.current, rootMargin: '0px 0px -50px 0px', threshold: 0.1 }
        );
        const elements = modalContentRef.current?.querySelectorAll('.scroll-animate');
        if (elements) elements.forEach(el => observer.observe(el));
        return () => { if (elements) elements.forEach(el => observer.unobserve(el)); };
    }, [isOpen, announcements, settings.animations.enabled]);

    if (!isOpen) return null;

    return (
        <div className="blog-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="announcements-modal-title">
            <div ref={modalContentRef} className="blog-modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 font-bold text-2xl z-10" aria-label="Close announcements modal">&times;</button>
                
                <div className="text-center mb-8">
                    <h2 id="announcements-modal-title" className="text-3xl font-extrabold text-primary">Latest Announcements</h2>
                    <p className="mt-2 text-lg text-text-muted">
                        Stay up to date with the latest news from Digital Catalyst.
                    </p>
                </div>
                
                <div className="space-y-6">
                     {announcements.length > 0 ? announcements.map((item) => (
                        <div key={item.id} className={settings.animations.enabled ? 'scroll-animate' : ''}>
                            <AnnouncementCard 
                                announcement={item}
                                onView={() => onViewAnnouncement(item)}
                            />
                        </div>
                    )) : (
                         <div className="col-span-full text-center py-12 text-text-muted">
                            <p>No announcements right now. Stay tuned!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
