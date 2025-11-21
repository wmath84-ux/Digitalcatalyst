
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
      className={`py-24 bg-white overflow-hidden ${settings.animations.enabled ? 'scroll-animate' : ''}`}
    >
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Text Column */}
          <div className="order-2 lg:order-1">
            <div className="relative">
                <h2 className="text-4xl font-extrabold text-primary tracking-tight">{title}</h2>
                <div className="w-20 h-1.5 bg-accent mt-4 rounded-full"></div>
            </div>
            <div className="mt-8 text-lg text-gray-600 leading-relaxed space-y-6">
                {text.split('\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                ))}
            </div>
            <div className="mt-8 flex gap-4">
                <div className="text-center">
                    <p className="text-3xl font-bold text-primary">5k+</p>
                    <p className="text-sm text-gray-500">Happy Clients</p>
                </div>
                <div className="w-px bg-gray-300 h-12"></div>
                <div className="text-center">
                    <p className="text-3xl font-bold text-primary">150+</p>
                    <p className="text-sm text-gray-500">Products</p>
                </div>
            </div>
          </div>

          {/* Image Column */}
          <div className="order-1 lg:order-2 relative">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -z-10"></div>

            <div className="relative rounded-2xl shadow-2xl overflow-hidden border-8 border-white transform md:rotate-3 transition-all duration-500 hover:rotate-0 hover:scale-[1.02] group">
                 <img src={`https://picsum.photos/seed/${imageSeed}/800/600`} alt="Digital Catalyst Team" className="w-full h-auto object-cover transform group-hover:scale-110 transition-transform duration-700" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-60"></div>
                 <div className="absolute bottom-6 left-6 text-white">
                     <p className="font-bold text-xl">Our Mission</p>
                     <p className="text-sm opacity-90">Empowering your digital journey.</p>
                 </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default AboutUs;
