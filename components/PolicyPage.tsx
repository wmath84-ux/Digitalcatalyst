import React, { useEffect, useRef } from 'react';
import { WebsiteSettings } from '../App';

interface PolicyPageProps {
  settings: WebsiteSettings;
  onBack: () => void;
  scrollToSection: string | null;
  onSectionScrolled: () => void;
}

const PolicySection: React.FC<{id: string, children: React.ReactNode}> = ({ id, children }) => {
    const sectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                entry.target.classList.toggle('is-visible', entry.isIntersecting);
            },
            { threshold: 0.1, rootMargin: "-100px 0px -100px 0px" }
        );
        const currentRef = sectionRef.current;
        if (currentRef) observer.observe(currentRef);
        return () => { if(currentRef) observer.unobserve(currentRef) };
    }, []);

    return (
        <section ref={sectionRef} id={id} className="mb-12 scroll-mt-24 scroll-animate">
            {children}
        </section>
    );
}

const PolicyPage: React.FC<PolicyPageProps> = ({ settings, onBack, scrollToSection, onSectionScrolled }) => {
  useEffect(() => {
    if (scrollToSection) {
      const timer = setTimeout(() => {
        const element = document.getElementById(scrollToSection);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        onSectionScrolled();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollToSection, onSectionScrolled]);

  return (
    <div className="bg-background min-h-screen font-sans">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary">Digital Catalyst Policies</h1>
          <button 
            onClick={onBack}
            className="bg-primary text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition-colors duration-300"
          >
            &larr; Back to Home
          </button>
        </div>
      </header>
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-lg shadow-lg">
          
          <PolicySection id="privacy-policy">
            <h2 className="text-3xl font-extrabold text-primary border-b-2 border-accent pb-2 mb-6">Privacy Policy</h2>
            <div className="space-y-4 text-text-muted">
                <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
                <p>Digital Catalyst ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.</p>
                <h3 className="text-xl font-bold text-text pt-4">Information We Collect</h3>
                <p>We may collect personal information such as your name, email address, and payment information when you purchase our products or services. We also collect non-personal information, such as browser type and IP address, to improve our website.</p>
                <h3 className="text-xl font-bold text-text pt-4">How We Use Your Information</h3>
                <p>We use your information to process transactions, deliver digital products, communicate with you, and improve our services. We partner with Razorpay for secure payment processing and do not store your full credit card details on our servers.</p>
            </div>
          </PolicySection>

          <PolicySection id="terms-and-conditions">
            <h2 className="text-3xl font-extrabold text-primary border-b-2 border-accent pb-2 mb-6">Terms and Conditions</h2>
            <div className="space-y-4 text-text-muted">
                <p>By using this website, you agree to be bound by these terms. If you do not agree, please do not use this site.</p>
                <h3 className="text-xl font-bold text-text pt-4">Intellectual Property</h3>
                <p>All content is the property of Digital Catalyst and protected by copyright laws.</p>
                 <h3 className="text-xl font-bold text-text pt-4">Limitation of Liability</h3>
                <p>This website is offered for informational purposes only; we are not liable for the accuracy or availability of any information.</p>
            </div>
          </PolicySection>
          
          <PolicySection id="shipping-policy">
            <h2 className="text-3xl font-extrabold text-primary border-b-2 border-accent pb-2 mb-6">Shipping and Delivery Policy</h2>
            <div className="space-y-4 text-text-muted">
                <h3 className="text-xl font-bold text-text">Digital Products Only</h3>
                <p>We specialize in digital products. No physical items are shipped.</p>
                <h3 className="text-xl font-bold text-text pt-4">Instant Delivery</h3>
                <p>Upon successful payment, you will receive immediate access to your purchased products via email and in the "My Purchases" section of your account.</p>
            </div>
          </PolicySection>

          <PolicySection id="refund-policy">
            <h2 className="text-3xl font-extrabold text-primary border-b-2 border-accent pb-2 mb-6">Cancellations and Refunds Policy</h2>
            <div className="space-y-4 text-text-muted">
                <h3 className="text-xl font-bold text-text">All Sales Are Final</h3>
                <p>Due to the nature of digital products, all sales are non-refundable.</p>
                <h3 className="text-xl font-bold text-text pt-4">Exceptions</h3>
                <p>For technical issues, please contact support within 7 days. We will work to resolve the issue.</p>
            </div>
          </PolicySection>
          
          <PolicySection id="contact-us">
            <h2 className="text-3xl font-extrabold text-primary border-b-2 border-accent pb-2 mb-6">Contact Us</h2>
            <div className="space-y-4 text-text-muted">
                <p>If you have any questions, please contact us.</p>
                <ul className="list-disc list-inside space-y-2">
                    <li><strong>Email:</strong> <a href="mailto:wmath84@gmail.com" className="text-primary hover:underline">wmath84@gmail.com</a></li>
                    <li><strong>Support:</strong> <a href="tel:+916307730041" className="text-primary hover:underline">+91 6307730041</a></li>
                </ul>
            </div>
          </PolicySection>

        </div>
      </main>
    </div>
  );
};

export default PolicyPage;