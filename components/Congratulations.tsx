
import React, { useState, useEffect } from 'react';
import Faq from './Faq';
import Services from './Services';
import RatingsAndReviews from './RatingsAndReviews';
import { ProductWithRating, Review, ProductFile, CourseModule, WebsiteSettings } from '../App';

interface CongratulationsProps {
  settings: WebsiteSettings;
  onBack: () => void;
  product: ProductWithRating | null;
  reviews: Review[];
  onAddReview: (reviewData: Omit<Review, 'name' | 'date'>) => void;
}

const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

const Congratulations: React.FC<CongratulationsProps> = ({ settings, onBack, product, reviews, onAddReview }) => {
  const [showProduct, setShowProduct] = useState(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  
  const getFirstPurchasedFile = (): ProductFile | null => {
    if (!product || !product.courseContent) return null;
    const findFirstFile = (modules: CourseModule[]): ProductFile | null => {
        for (const module of modules) {
            if (module.files.length > 0) return module.files[0];
            const foundInSub = findFirstFile(module.modules);
            if (foundInSub) return foundInSub;
        }
        return null;
    }
    return findFirstFile(product.courseContent);
  }

  const file = getFirstPurchasedFile();

  useEffect(() => {
    if (!file || file.type !== 'pdf') {
        setPdfObjectUrl(null);
        return;
    }
    setIsPdfLoading(true);
    let objectUrl: string | undefined;
    const blob = dataURLtoBlob(file.url);
    if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setPdfObjectUrl(objectUrl);
    } else {
        setPdfObjectUrl(null);
    }
    setIsPdfLoading(false);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);


  const renderProductPreview = () => {
      if (!file) return <p className="text-text-muted">Your product is being processed and will be available in your account shortly.</p>;
      if (file.type === 'video') return <video src={file.url} controls className="w-full h-auto rounded-lg" />;
      if (file.type === 'audio') return <audio src={file.url} controls className="w-full" />;
      if (file.type === 'pdf') {
          if (isPdfLoading) return <div className="p-8 text-center text-text-muted">Loading PDF Preview...</div>;
          if (pdfObjectUrl) {
            return (
              <iframe src={`${pdfObjectUrl}#toolbar=1`} title={file.name} className="w-full h-[80vh] border-0">
                  <div className="p-8 text-center text-text-muted bg-gray-100 h-full flex flex-col justify-center items-center">
                      <h3 className="text-xl font-bold mb-4">PDF Preview Unavailable</h3>
                      <p>Your browser cannot display the PDF file directly.</p>
                      <a href={file.url} download={file.name} className="mt-4 px-6 py-2 rounded-lg bg-primary text-white hover:opacity-90 font-semibold no-underline transform active:scale-95 transition-transform">Download PDF</a>
                  </div>
              </iframe>
            );
          }
          return (
             <div className="p-8 text-center text-text-muted bg-gray-100 h-full flex flex-col justify-center items-center">
                <h3 className="text-xl font-bold mb-4 text-red-600">PDF Preview Error</h3>
                <p>Could not load the PDF file.</p>
                <a href={file.url} download={file.name} className="mt-4 px-6 py-2 rounded-lg bg-primary text-white hover:opacity-90 font-semibold no-underline transform active:scale-95 transition-transform">Download PDF</a>
            </div>
          );
      }
      return <p className="text-text-muted">Preview is not available. Access it from "My Purchases".</p>;
  }

  const animationClass = (delay: string) => settings.animations.enabled ? `animate-fade-in-up style={{ animationDelay: '${delay}' }}` : '';

  return (
    <div className="bg-white min-h-screen">
      <header className="bg-background py-6 border-b">
        <div className="container mx-auto px-6 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-primary">Digital Catalyst</h1>
            <button onClick={onBack} className="bg-primary text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition-all duration-300 transform active:scale-95">
              Back to Home
            </button>
        </div>
      </header>

      {/* Hero Celebration Section */}
      <main className="relative bg-gradient-to-b from-blue-50 to-white overflow-hidden py-20">
        {/* Confetti decoration (simple CSS circles for effect) */}
        <div className="absolute top-10 left-10 w-4 h-4 bg-red-400 rounded-full animate-bounce"></div>
        <div className="absolute top-20 right-20 w-6 h-6 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
        <div className="absolute bottom-10 left-1/4 w-3 h-3 bg-green-400 rounded-full animate-bounce [animation-delay:0.5s]"></div>
        
        <div className="container mx-auto px-6 text-center relative z-10">
            <div className="inline-block p-6 rounded-full bg-green-100 mb-8 animate-pop-in shadow-lg border-4 border-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </div>
            
            <h2 className={`text-5xl sm:text-6xl font-extrabold text-gray-900 tracking-tight mb-6 ${animationClass('0.2s')}`}>
                Congratulations!
            </h2>
            
            <p className={`text-xl sm:text-2xl text-gray-600 max-w-2xl mx-auto leading-relaxed ${animationClass('0.4s')}`}>
                You've successfully unlocked <span className="text-primary font-bold">{product?.title || "your product"}</span>. 
                Get ready to level up!
            </p>

            <div className={`mt-12 flex flex-col sm:flex-row justify-center gap-4 ${animationClass('0.6s')}`}>
                <button onClick={() => setShowProduct(!showProduct)} className="bg-primary text-white font-bold text-lg px-10 py-4 rounded-xl hover:bg-opacity-90 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl">
                    {showProduct ? 'Hide Content' : 'Start Learning Now'}
                </button>
                <button onClick={onBack} className="bg-white text-gray-700 font-bold text-lg px-10 py-4 rounded-xl border-2 border-gray-200 hover:border-primary hover:text-primary transition-all duration-300">
                    Continue Shopping
                </button>
            </div>
        </div>
      </main>

      {/* Content Viewer */}
      <div className={`transition-all duration-700 ease-in-out overflow-hidden ${showProduct ? 'max-h-[150vh] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-gray-900 py-12">
                <div className="container mx-auto px-6">
                    <h3 className="text-white text-2xl font-bold mb-6 text-center">Product Preview</h3>
                    <div className="max-w-5xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-gray-700 bg-black">
                        {renderProductPreview()}
                    </div>
                </div>
            </div>
      </div>
      
      {/* Enhanced Reviews Section */}
      {settings.features.showReviews && product && (
        <div className="py-20 bg-white border-t">
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto bg-blue-50 rounded-3xl p-10 shadow-inner border border-blue-100 text-center">
                    <h3 className="text-3xl font-bold text-primary mb-4">Share Your Experience</h3>
                    <p className="text-gray-600 mb-8">Your feedback fuels our community. Let others know what you think!</p>
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
      )}

      <div className="bg-gray-900 text-white py-16" id="contact">
          <div className="container mx-auto px-6 text-center">
              <h3 className="text-3xl font-bold mb-6">Need Support?</h3>
              <p className="text-gray-400 mb-8 max-w-xl mx-auto">Our team is ready to assist you with any questions regarding your new purchase.</p>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
                  <a href="mailto:wmath84@gmail.com" className="flex items-center gap-2 font-semibold text-lg hover:text-blue-400 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      wmath84@gmail.com
                  </a>
                  <a href="https://wa.me/916307730041" target="_blank" rel="noopener noreferrer" className="bg-green-500 text-white font-bold px-8 py-3 rounded-full hover:bg-green-600 transition-all duration-300 transform active:scale-95 shadow-lg flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg>
                      Chat on WhatsApp
                  </a>
              </div>
          </div>
      </div>
      
      <Faq settings={settings} faqs={settings.content.faqs} />
    </div>
  );
};

export default Congratulations;
