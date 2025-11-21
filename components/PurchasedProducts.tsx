
import React, { useState, useEffect, useRef } from 'react';
import { ProductWithRating, WebsiteSettings } from '../App';

const PurchasedProductCard: React.FC<{
  settings: WebsiteSettings;
  product: ProductWithRating;
  onViewProduct: () => void;
  delay: number;
}> = ({ settings, product, onViewProduct, delay }) => {
    const animationClass = settings.animations.enabled ? `animate-child animate-delay-${delay}` : '';
    const buttonText = 'Access Files';

    return (
        <div className={`relative bg-white rounded-xl shadow-md overflow-hidden border border-gray-200 flex flex-col transform hover:-translate-y-2 transition-all duration-300 ease-in-out hover:shadow-xl product-card-shine ${animationClass}`}>
            <div className="h-48 overflow-hidden relative bg-gray-100">
                <img src={product.images[0] || `https://picsum.photos/seed/${product.imageSeed}/600/400`} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                <div className="absolute inset-0 bg-black/10"></div>
                <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded shadow-sm">
                    PURCHASED
                </div>
            </div>
            <div className="p-6 flex flex-col flex-grow">
                <h3 className="text-lg font-bold text-primary line-clamp-1" title={product.title}>{product.title}</h3>
                <p className="mt-2 text-text-muted text-sm flex-grow line-clamp-2">{product.description}</p>
                <div className="mt-6">
                    <button onClick={onViewProduct} className="w-full bg-primary text-white font-semibold px-5 py-3 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95 shadow-md flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
};


interface PurchasedProductsProps {
  settings: WebsiteSettings;
  products: ProductWithRating[];
  onViewPurchasedProduct: (product: ProductWithRating) => void;
}

const PurchasedProducts: React.FC<PurchasedProductsProps> = ({ settings, products, onViewPurchasedProduct }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                }
            });
        },
        { threshold: 0.1, rootMargin: "0px 0px 0px 0px" }
    );

    const currentRef = sectionRef.current;
    if (currentRef) {
        observer.observe(currentRef);
    }

    return () => {
        if (currentRef) {
            observer.unobserve(currentRef);
        }
    };
  }, []);

  return (
    <section 
      ref={sectionRef}
      className={`py-20 bg-blue-50 ${settings.animations.enabled ? 'stagger-animate-container' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 animate-child animate-delay-1">
            <div className="max-w-2xl">
                <h2 className="text-3xl font-bold text-primary">My Purchases</h2>
                <p className="mt-2 text-text-muted">
                    Welcome back! Here are the products you have access to.
                </p>
            </div>
            <div className="mt-4 md:mt-0 text-sm text-gray-500">
                Showing {products.length} item{products.length !== 1 && 's'}
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product, index) => (
            <PurchasedProductCard 
              key={product.id} 
              settings={settings}
              product={product} 
              onViewProduct={() => onViewPurchasedProduct(product)}
              delay={index + 2}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PurchasedProducts;
