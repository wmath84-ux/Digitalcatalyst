import React, { useState, useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

interface FaqItemProps {
  question: string;
  answer: string;
}

const FaqItemDisplay: React.FC<FaqItemProps> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`rounded-2xl border bg-white/5 p-5 backdrop-blur-xl transition-all duration-300 ${isOpen ? 'border-purple-300/50 shadow-[0_0_30px_rgba(139,92,246,0.2)]' : 'border-white/10 hover:border-white/20 hover:shadow-[0_0_24px_rgba(139,92,246,0.12)]'}`}>
      <button
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="text-lg font-semibold text-white">{question}</span>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${isOpen ? 'border-purple-300/50 bg-purple-400/20 text-purple-100' : 'border-white/10 bg-white/5 text-cyan-100'}`}>
           <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-96 pt-4 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="leading-relaxed text-slate-300">{answer}</p>
      </div>
    </div>
  );
};

interface FaqProps {
    settings: WebsiteSettings;
    faqs: FaqItem[];
}

const Faq: React.FC<FaqProps> = ({ settings, faqs }) => {
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
      id="faq" 
      ref={sectionRef}
      className={`relative overflow-hidden bg-slate-950 py-20 text-white sm:py-24 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_30%_80%,rgba(139,92,246,0.20),transparent_34%)]" />
      <div className="container relative z-10 mx-auto px-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-200">FAQ</p>
          <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Frequently Asked Questions</h2>
          <p className="mt-4 text-lg text-slate-300">
            Have questions? We've got answers.
          </p>
        </div>
        <div className="mx-auto mt-12 max-w-3xl space-y-4">
          {faqs.map((item) => (
            <FaqItemDisplay key={item.id} question={item.question} answer={item.answer} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Faq;
