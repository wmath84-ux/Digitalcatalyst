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
    <div className="border-b border-gray-200 py-6">
      <button
        className="w-full flex justify-between items-center text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="text-lg font-semibold text-primary">{question}</span>
        <span className="text-accent transform transition-transform duration-300">
           <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-96 mt-4' : 'max-h-0'
        }`}
      >
        <p className="text-text-muted">{answer}</p>
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
      className={`py-20 sm:py-24 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary">Frequently Asked Questions</h2>
          <p className="mt-4 text-lg text-text-muted">
            Have questions? We've got answers.
          </p>
        </div>
        <div className="mt-12 max-w-3xl mx-auto">
          {faqs.map((item) => (
            <FaqItemDisplay key={item.id} question={item.question} answer={item.answer} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Faq;