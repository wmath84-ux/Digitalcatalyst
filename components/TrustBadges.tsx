import React, { useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

interface TrustBadgesProps {
    settings: WebsiteSettings;
}

const trustItems = [
  { title: 'Secure Payments', text: 'All transactions are encrypted and processed securely through Razorpay.', icon: '🔐' },
  { title: 'High-Quality Products', text: 'Our digital products and services are curated and created by industry experts.', icon: '⭐' },
  { title: 'Dedicated Support', text: 'Our support team is ready to help you with any questions or issues.', icon: '🤝' },
];

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
      className={`relative overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 py-20 text-slate-900 sm:py-24 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_22%,rgba(34,211,238,0.18),transparent_26%),radial-gradient(circle_at_85%_12%,rgba(59,130,246,0.22),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.95))]" />
      <div className="absolute left-1/2 top-0 h-px w-[82%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-200">Trusted learning platform</p>
          <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Why Choose Digital Catalyst?</h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            We are committed to providing a secure, reliable, and valuable experience for every learner and customer.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {trustItems.map((item) => (
            <article key={item.title} className="group relative overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 p-7 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/80 hover:shadow-sm">
              <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/50 bg-white/70 text-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">{item.icon}</div>
              <h3 className="text-xl font-black text-slate-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustBadges;
