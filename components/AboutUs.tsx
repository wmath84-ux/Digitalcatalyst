import React, { useRef, useEffect } from 'react';
import { WebsiteSettings } from '../App';

interface AboutUsProps {
  settings: WebsiteSettings;
  title: string;
  text: string;
  imageSeed: string;
}

const AboutUs: React.FC<AboutUsProps> = ({ settings, title, text, imageSeed }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            const [entry] = entries;
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        },
        { threshold: 0.15 }
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
      id="about" 
      ref={sectionRef}
      className={`tagmaster-section-theme relative overflow-hidden bg-sky-50 bg-gradient-to-br from-sky-50 via-indigo-100/50 to-violet-100 py-20 text-[var(--text-body)] sm:py-24 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_65%,rgba(14,165,233,0.30),transparent_30%),radial-gradient(circle_at_82%_36%,rgba(124,58,237,0.30),transparent_30%)]" />
      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-6 sm:gap-10 lg:grid-cols-2">
          <div className="order-2 rounded-[28px] border border-[var(--border-soft)] bg-white p-5 shadow-[var(--shadow-card)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-8 lg:order-1 lg:p-10">
            <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--primary)] sm:text-sm sm:tracking-[0.35em]">About us</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-heading)] sm:mt-3 sm:text-4xl">{title}</h2>
                <div className="mt-5 h-1.5 w-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-sm"></div>
            </div>
            <div className="mt-5 space-y-4 text-base leading-7 text-[var(--text-body)] sm:mt-8 sm:space-y-6 sm:text-lg sm:leading-relaxed">
                {text.split('\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4">
                <div className="rounded-[28px] border border-[var(--border-soft)] bg-white p-4 text-center backdrop-blur-xl sm:p-5">
                    <p className="text-2xl font-bold text-[var(--text-heading)] sm:text-3xl">5k+</p>
                    <p className="mt-1 text-sm text-[var(--text-body)]">Happy Clients</p>
                </div>
                <div className="rounded-[28px] border border-[var(--border-soft)] bg-white p-4 text-center backdrop-blur-xl sm:p-5">
                    <p className="text-2xl font-bold text-[var(--text-heading)] sm:text-3xl">150+</p>
                    <p className="mt-1 text-sm text-[var(--text-body)]">Products</p>
                </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative rounded-[28px] border border-[var(--border-soft)] bg-white p-3 shadow-[var(--shadow-card)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6">
              <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-cyan-500/30 blur-3xl" />
              <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-violet-600/30 blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-white p-4 sm:p-8">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
                <div className="relative min-h-[230px] rounded-2xl bg-gradient-to-br from-blue-600/25 via-violet-600/25 to-cyan-500/20 p-4 sm:min-h-[340px] sm:p-8">
                  <div className="flex h-full min-h-[198px] flex-col justify-between sm:min-h-[284px]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--primary)] sm:text-sm sm:tracking-[0.3em]">Mission control</p>
                      <h3 className="mt-3 text-2xl font-extrabold text-[var(--text-heading)] sm:mt-4 sm:text-3xl">Empowering your digital journey.</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      {['Strategy', 'Automation', imageSeed || 'Growth', 'Scale'].map((item) => (
                        <div key={item} className="rounded-xl border border-[var(--border-soft)] bg-white/80 p-3 text-xs font-semibold text-[var(--text-heading)] backdrop-blur-xl sm:rounded-2xl sm:p-4 sm:text-sm">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutUs;
