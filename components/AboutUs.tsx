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
      className={`relative overflow-hidden bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 py-24 text-slate-900 ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_65%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_82%_36%,rgba(139,92,246,0.20),transparent_30%)]" />
      <div className="container relative z-10 mx-auto px-6">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="order-2 rounded-3xl border border-white/50 bg-white/70 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:order-1 lg:p-10">
            <div className="relative">
                <p className="text-sm font-bold uppercase tracking-[0.35em] text-cyan-200">About us</p>
                <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900">{title}</h2>
                <div className="mt-5 h-1.5 w-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-sm"></div>
            </div>
            <div className="mt-8 space-y-6 text-lg leading-relaxed text-slate-600">
                {text.split('\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                ))}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/50 bg-white/70 p-5 text-center backdrop-blur-xl">
                    <p className="text-3xl font-bold text-slate-900">5k+</p>
                    <p className="mt-1 text-sm text-slate-600">Happy Clients</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/70 p-5 text-center backdrop-blur-xl">
                    <p className="text-3xl font-bold text-slate-900">150+</p>
                    <p className="mt-1 text-sm text-slate-600">Products</p>
                </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative rounded-3xl border border-white/50 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-purple-500/20 blur-3xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/50 bg-white/70 p-8">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
                <div className="relative min-h-[340px] rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-cyan-400/10 p-8">
                  <div className="flex h-full min-h-[284px] flex-col justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">Mission control</p>
                      <h3 className="mt-4 text-3xl font-extrabold text-slate-900">Empowering your digital journey.</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {['Strategy', 'Automation', imageSeed || 'Growth', 'Scale'].map((item) => (
                        <div key={item} className="rounded-2xl border border-white/50 bg-white/70 p-4 text-sm font-semibold text-slate-900 backdrop-blur-xl">
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
