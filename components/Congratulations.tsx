import React, { useEffect } from 'react';
import Faq from './Faq';
import RatingsAndReviews from './RatingsAndReviews';
import { ProductWithRating, Review, WebsiteSettings } from '../App';

interface CongratulationsProps {
  settings: WebsiteSettings;
  onBack: () => void;
  onCheckProduct: () => void;
  product: ProductWithRating | null;
  reviews: Review[];
  onAddReview: (reviewData: Omit<Review, 'name' | 'date'>) => void;
}

const celebrationStats = [
  { label: 'Access status', value: 'Unlocked', icon: '✅' },
  { label: 'Delivery', value: 'My Purchases', icon: '📚' },
  { label: 'Support', value: 'Available', icon: '💬' },
];

const Congratulations: React.FC<CongratulationsProps> = ({ settings, onBack, onCheckProduct, product, reviews, onAddReview }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
    return () => {
      document.body.classList.remove('overflow-hidden', 'pointer-events-none');
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, []);

  return (
    <div data-clean-neutral-workspace="congratulations" className="min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/50 to-cyan-50 text-slate-900">
      <header className="border-b border-white/60 bg-white/75 py-4 shadow-sm backdrop-blur-2xl">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500 sm:text-xs sm:tracking-[0.28em]">Digital Catalyst</p>
            <h1 className="text-xl font-black text-primary sm:text-2xl">Purchase Complete</h1>
          </div>
          <button onClick={onBack} className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white sm:px-5 sm:py-2.5 sm:text-sm">
            Back to Home
          </button>
        </div>
      </header>

      <main className="relative py-10 sm:py-20">
        <div className="absolute left-10 top-10 h-5 w-5 rounded-full bg-rose-300 animate-bounce" />
        <div className="absolute right-16 top-24 h-7 w-7 rounded-full bg-amber-300 animate-bounce [animation-delay:0.2s]" />
        <div className="absolute bottom-20 left-1/4 h-4 w-4 rounded-full bg-emerald-300 animate-bounce [animation-delay:0.5s]" />
        <div className="absolute inset-x-0 top-0 mx-auto h-80 max-w-3xl rounded-full bg-indigo-300/20 blur-3xl" />

        <div className="container relative z-10 mx-auto px-4 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/75 shadow-[0_30px_90px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:rounded-[2.5rem]">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div data-clean-neutral-panel="congratulations-summary" className="relative min-h-[260px] bg-gradient-to-br from-emerald-500 via-cyan-500 to-indigo-600 p-5 text-white sm:min-h-[320px] sm:p-10">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.32),transparent_25%),radial-gradient(circle_at_75%_70%,rgba(255,255,255,0.18),transparent_24%)]" />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/60 bg-white/20 text-3xl shadow-2xl backdrop-blur-xl sm:h-24 sm:w-24 sm:text-5xl">
                    ✅
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-white/75 sm:text-sm sm:tracking-[0.3em]">Congratulations</p>
                    <h2 className="mt-3 text-3xl font-black leading-tight sm:mt-4 sm:text-5xl">Your learning product is ready.</h2>
                    <p className="mt-3 text-sm font-semibold leading-6 text-white/80 sm:mt-4 sm:text-base sm:leading-7">Open your purchases page to access the unlocked content and start learning without refreshing the website.</p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-10">
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 sm:rounded-3xl sm:p-5">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Unlocked product</p>
                  <h3 className="mt-2 text-2xl font-black text-slate-950 sm:mt-3 sm:text-3xl">{product?.title || 'Your product'}</h3>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Access has been added to your account. Use the button below to go directly to My Purchases.</p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
                  {celebrationStats.map(stat => (
                    <div key={stat.label} className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-center shadow-sm sm:p-4">
                      <div className="text-xl sm:text-2xl">{stat.icon}</div>
                      <p className="mt-2 text-[11px] font-black uppercase tracking-widest text-slate-500">{stat.label}</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row">
                  <button onClick={onCheckProduct} className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3.5 text-base font-black text-white shadow-[0_16px_40px_rgba(79,70,229,0.25)] transition hover:-translate-y-0.5 active:scale-95 sm:px-8 sm:py-4 sm:text-lg">
                    Check Product
                  </button>
                  <button onClick={onBack} className="flex-1 rounded-2xl border border-slate-200 bg-white/80 px-6 py-3.5 text-base font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white active:scale-95 sm:px-8 sm:py-4 sm:text-lg">
                    Continue Shopping
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {settings.features.showReviews && product && (
        <section className="border-y border-white/70 bg-white/65 py-10 backdrop-blur-xl sm:py-16">
          <div className="container mx-auto px-6">
            <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-indigo-100 bg-indigo-50/70 p-4 text-center shadow-inner sm:rounded-[2rem] sm:p-10">
              <h3 className="text-2xl font-black text-primary sm:text-3xl">Share Your Experience</h3>
              <p className="mx-auto mt-3 max-w-2xl text-slate-600">Your feedback helps other learners choose the right resource.</p>
              <div className="mt-5 sm:mt-8">
                <RatingsAndReviews
                  settings={settings}
                  productTitle={product.title}
                  prompt=""
                  reviews={reviews}
                  onAddReview={onAddReview}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="bg-white/70 py-10 text-slate-900 sm:py-16" id="contact">
        <div className="container mx-auto px-4 text-center sm:px-6">
          <h3 className="text-2xl font-black sm:text-3xl">Need Support?</h3>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">Our team is ready to assist you with any questions regarding your new purchase.</p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-4">
            <a href="mailto:wmath84@gmail.com" className="rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:text-primary sm:px-6 sm:text-base">
              ✉️ wmath84@gmail.com
            </a>
            <a href="https://wa.me/916307730041" target="_blank" rel="noopener noreferrer" className="rounded-full bg-green-500 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-green-600 sm:px-6 sm:text-base">
              💬 Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <Faq settings={settings} faqs={settings.content.faqs} />
    </div>
  );
};

export default Congratulations;
