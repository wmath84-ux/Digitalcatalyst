import React, { useState, useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

interface TrustBadgesProps {
    settings: WebsiteSettings;
}

const TrustBadges: React.FC<TrustBadgesProps> = ({ settings }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            const [entry] = entries;
            entry.target.classList.toggle('is-visible', entry.isIntersecting);
        },
        { threshold: 0.05 }
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
      className={`bg-gray-100 py-16 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-primary">Why Choose Digital Catalyst?</h2>
          <p className="mt-3 text-text-muted">
            We are committed to providing a secure, reliable, and valuable experience for all our customers.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="relative overflow-hidden bg-white p-6 rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 product-card-shine">
                <h3 className="font-semibold text-lg text-primary">Secure Payments</h3>
                <p className="text-sm text-text-muted mt-2">All transactions are encrypted and processed securely through Razorpay.</p>
            </div>
            <div className="relative overflow-hidden bg-white p-6 rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 product-card-shine">
                <h3 className="font-semibold text-lg text-primary">High-Quality Products</h3>
                <p className="text-sm text-text-muted mt-2">Our digital products and services are curated and created by industry experts.</p>
            </div>
            <div className="relative overflow-hidden bg-white p-6 rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 product-card-shine">
                <h3 className="font-semibold text-lg text-primary">Dedicated Support</h3>
                <p className="text-sm text-text-muted mt-2">Our support team is ready to help you with any questions or issues.</p>
            </div>
        </div>
      </div>
    </section>
  );
};

export default TrustBadges;