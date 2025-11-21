import React, { useRef, useEffect } from 'react';
import { NewsArticle, WebsiteSettings } from '../App';

interface BlogModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: NewsArticle[];
  onReadMoreClick: (article: NewsArticle) => void;
  settings: WebsiteSettings;
}

const NewsCard: React.FC<{ article: NewsArticle, onReadMoreClick: () => void, settings: WebsiteSettings }> = ({ article, onReadMoreClick, settings }) => {
    return (
        <div className="bg-white rounded-xl shadow-md overflow-hidden transform hover:-translate-y-2 transition-transform duration-300 group border">
            <div className="relative">
                <div className="aspect-video bg-gray-200">
                    <img src={`https://picsum.photos/seed/${article.imageSeed}/800/600`} alt={article.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
            </div>
            <div className="p-6">
                <p className="text-sm font-semibold text-primary tracking-widest uppercase">{article.category}</p>
                <h3 className="mt-2 text-xl font-bold text-gray-800 group-hover:text-primary transition-colors">{article.title}</h3>
                <p className="mt-3 text-sm text-gray-600">{article.excerpt}</p>
                <button onClick={onReadMoreClick} className="mt-4 inline-block font-semibold text-primary group-hover:underline">
                    Read More &rarr;
                </button>
            </div>
        </div>
    );
};


const BlogModal: React.FC<BlogModalProps> = ({ isOpen, onClose, articles, onReadMoreClick, settings }) => {
    const modalContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !settings.animations.enabled) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    entry.target.classList.toggle('is-visible', entry.isIntersecting);
                });
            },
            { 
                root: modalContentRef.current,
                rootMargin: '0px 0px -50px 0px',
                threshold: 0.1 
            }
        );

        const elements = modalContentRef.current?.querySelectorAll('.scroll-animate');
        if (elements) {
            elements.forEach(el => observer.observe(el));
        }

        return () => {
            if (elements) {
                elements.forEach(el => observer.unobserve(el));
            }
        };
    }, [isOpen, articles, settings.animations.enabled]);

    if (!isOpen) return null;

    return (
        <div className="blog-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="blog-modal-title">
            <div ref={modalContentRef} className="blog-modal-content" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 font-bold text-2xl z-10" aria-label="Close blog modal">&times;</button>
                
                <div className="text-center mb-8">
                    <h2 id="blog-modal-title" className="text-3xl font-extrabold text-primary">Latest from the Catalyst Blog</h2>
                    <p className="mt-2 text-lg text-text-muted">
                        Insights and strategies to help you grow your digital business.
                    </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {articles.map((article) => (
                         <div key={article.id} className={settings.animations.enabled ? 'scroll-animate' : ''}>
                            <NewsCard 
                                settings={settings}
                                article={article} 
                                onReadMoreClick={() => onReadMoreClick(article)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default BlogModal;