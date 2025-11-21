import React, { useState } from 'react';
import { WebsiteSettings } from '../App';

interface FooterProps {
    settings: WebsiteSettings;
    socialLinks: { [key: string]: string };
    onAdminLoginClick: () => void;
    onLoginClick: () => void;
    onNavigateToAllProducts: () => void;
    onNavigateToHomeAndScroll: (sectionId: string) => void;
    onNavigateToPolicies: (sectionId: string) => void;
    onSubscribe: (email: string) => void;
}

const LogoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.59L5.41 12 4 13.41l7 7 9-9L18.59 10 11 17.59z" />
    </svg>
);

const Footer: React.FC<FooterProps> = ({ settings, socialLinks, onAdminLoginClick, onLoginClick, onNavigateToAllProducts, onNavigateToHomeAndScroll, onNavigateToPolicies, onSubscribe }) => {
  const footerText = settings.content.footerText.replace('{year}', new Date().getFullYear().toString());
  const [email, setEmail] = useState('');

  const handleSubscribeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
        onSubscribe(email);
        setEmail('');
    }
  };
  
  const socialIcons: { [key: string]: React.ReactNode } = {
    facebook: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd"></path></svg>,
    twitter: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.71v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path></svg>,
    instagram: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.85s-.011 3.585-.069 4.85c-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07s-3.585-.012-4.85-.07c-3.252-.148-4.771-1.691-4.919-4.919-.058-1.265-.069-1.645-.069-4.85s.011-3.585.069-4.85c.149-3.225 1.664 4.771 4.919-4.919C8.415 2.175 8.796 2.163 12 2.163zm0 1.802c-3.143 0-3.505.012-4.73.068-2.693.123-3.875 1.318-3.998 3.998-.056 1.225-.068 1.585-.068 4.73s.012 3.505.068 4.73c.123 2.68 1.305 3.875 3.998 3.998 1.225.056 1.587.068 4.73.068s3.505-.012 4.73-.068c2.693-.123 3.875-1.318 3.998-3.998.056-1.225.068-1.585.068-4.73s-.012-3.505-.068-4.73c-.123-2.68-1.305-3.875-3.998-3.998C15.505 3.975 15.143 3.965 12 3.965zM12 6.837c-2.853 0-5.163 2.31-5.163 5.163s2.31 5.163 5.163 5.163 5.163-2.31 5.163-5.163S14.853 6.837 12 6.837zm0 8.53c-1.862 0-3.367-1.505-3.367-3.367s1.505-3.367 3.367-3.367 3.367 1.505 3.367 3.367-1.505 3.367-3.367 3.367zm6.406-6.853c-.767 0-1.389.622-1.389 1.389s.622 1.389 1.389 1.389 1.389-.622 1.389-1.389-.622-1.389-1.389-1.389z"></path></svg>,
    linkedin: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"></path></svg>,
    pinterest: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.29 2.8 7.91 6.64 9.38-.08-.38-.14-1.1-.14-1.58 0-.66.38-1.11.83-1.11.41 0 .65.3.65.68 0 .41-.26.91-.41 1.41-.13.43.21.78.61.78.73 0 1.28-1.48 1.28-2.93 0-1.28-.91-2.28-2.04-2.28-1.59 0-2.58 1.18-2.58 2.58 0 .48.18.98.4 1.28.05.08.06.15.04.23-.08.28-.28.88-.33.98-.05.18-.21.23-.38.15-1.18-.53-1.9-1.95-1.9-3.43 0-2.61 1.93-4.9 5.3-4.9 2.83 0 4.93 2.01 4.93 4.58 0 2.88-1.67 5.18-4.13 5.18-1.18 0-1.85-.93-1.6-2.03.28-1.25.85-2.58.85-3.48 0-.83-.48-1.53-1.33-1.53-1.05 0-1.85.98-1.85 2.2 0 .88.33 1.48.33 1.48s-1.1 4.6-1.28 5.33c-.41 1.68.08 3.53.13 3.73.05.18.2.23.3.13.1-.08.68-1.18.9-1.58.15-.3.28-.58.43-.88.23-.48.45-1 .68-1.5.25-.55.58-1.13.58-1.13.38.68.83 1.25 1.38 1.73.9.83 2.08 1.28 3.3 1.28 4.38 0 7.91-3.53 7.91-7.91s-3.53-7.91-7.91-7.91z"/></svg>,
    discord: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.443.804-.656 1.292a18.258 18.258 0 00-5.488 0c-.213-.488-.446-.917-.656-1.292a.074.074 0 00-.079-.037A19.736 19.736 0 003.683 4.37a.077.077 0 00-.035.079C3.388 6.273 3.218 8.16 3.094 10.034a.07.07 0 00.042.08c1.43.436 2.828.788 4.22.992a.075.075 0 00.08-.028 15.11 15.11 0 001.03-1.574.074.074 0 00-.033-.105c-.39-.204-.77-.416-1.14-.645a.075.075 0 00-.094.028c-.28.34-.537.69-.773 1.05a.074.074 0 00.012.105c.818.573 1.638 1.06 2.47 1.422a.075.075 0 00.086-.012c.033-.02.06-.044.086-.068.086-.08.166-.16.24-.244a.075.075 0 00.012-.086c-.286-1.06-1.02-2.824-1.02-2.824a.074.074 0 00-.012-.058c-1.382-.646-2.7-1.15-3.982-1.528a.075.075 0 00-.086.012c-.113.12-.22.244-.32.375a.075.075 0 00-.004-.086c.268.43.512.86.73 1.292a.074.074 0 00.08.046c.9.152 1.81.256 2.72.32a.075.075 0 00.08-.046c.112-.312.21-.636.292-.97a.075.075 0 00-.02-.086c-.276-.152-.56-.3-.836-.456a.075.075 0 00-.086-.012c-.42.516-.8 1.04-1.13 1.574a.074.074 0 00.012.105c.39.232.78.448 1.17.645a.075.075 0 00.094-.028c.236-.36.492-.71.772-1.05a.074.074 0 00.012-.105c-.818-.562-1.638-1.05-2.47-1.422a.075.075 0 00-.086.012c-.033.02-.06.044-.086.068-.086.08-.166.16-.24.244a.075.075 0 00.012.086c.286 1.06 1.02 2.824 1.02 2.824a.074.074 0 00.012.058c1.38.646 2.7 1.15 3.98 1.528a.075.075 0 00.086-.012c.113-.12.22-.244.32-.375a.075.075 0 00.004-.086c-.268-.43-.512-.86-.73-1.292a.074.074 0 00-.08-.046c-.9-.152-1.81-.256-2.72-.32a.075.075 0 00-.08.046c-.112.312-.21.636-.292-.97a.075.075 0 00.02.086c.276.152.56.3.836.456a.075.075 0 00.086-.012c.42-.516.8 1.04 1.13 1.574a.074.074 0 00-.012-.105c-.39-.232-.78-.448-1.17-.645a.075.075 0 00-.094-.028c-.236.36-.492-.71-.772-1.05a.074.074 0 00-.012.105c.818.562 1.638 1.05 2.47 1.422a.075.075 0 00.086.012c.033-.02.06-.044-.086.068.086.08.166.16.24.244a.075.075 0 00.012.086c-.286-1.06-1.02-2.824-1.02-2.824a.074.074 0 00-.012-.058c-1.382-.646-2.7-1.15-3.982-1.528a.075.075 0 00-.086.012c-.113.12-.22.244-.32.375a.075.075 0 00-.004-.086c.268.43.512.86.73 1.292a.074.074 0 00.08.046c.9.152 1.81.256 2.72.32a.075.075 0 00.08-.046c.112-.312.21-.636.292-.97a.075.075 0 00-.02-.086c-.276-.152-.56-.3-.836-.456a.075.075 0 00-.086-.012c-.42.516-.8 1.04-1.13 1.574a.074.074 0 00.012.105c.39.232.78.448 1.17.645a.075.075 0 00.094-.028c.236-.36.492-.71-.772-1.05a.074.074 0 00.012-.105c-.818-.562-1.638-1.05-2.47-1.422a.075.075 0 00-.086.012l-.086.068-.24.244a.075.075 0 00.012.086c.286 1.06 1.02 2.824 1.02 2.824a.074.074 0 00.012.058c1.382.646 2.7 1.15 3.982 1.528a.075.075 0 00.086-.012c.113-.12.22-.244.32-.375a.075.075 0 00.004-.086c-.268-.43-.512-.86-.73-1.292a.074.074 0 00-.08-.046c-.9-.152-1.81-.256-2.72-.32a.075.075 0 00-.08.046c-.112.312-.21.636-.292-.97a.075.075 0 00.02.086c.276.152.56.3.836.456a.075.075 0 00.086-.012c.42-.516.8-1.04 1.13-1.574a.074.074 0 00-.012-.105c-.39-.232-.78-.448-1.17-.645a.075.075 0 00-.094-.028c-.236.36-.492-.71-.772-1.05a.074.074 0 00-.012.105c.818.562 1.638 1.05 2.47 1.422a.075.075 0 00.086.012"></path></svg>,
    reddit: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.25 2.63 7.85 6.2 9.39.45.08.61-.19.61-.42v-1.5c-2.55.55-3.09-1.23-3.09-1.23-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.91.06 1.39.93 1.39.93.81 1.39 2.11 1 2.63.76.08-.59.32-.99.56-1.22-2-.23-4.11-1-4.11-4.44 0-.98.35-1.78 1.02-2.4-.1-.23-.44-1.13.1-2.36 0 0 .76-.24 2.48.92.72-.2 1.49-.3 2.25-.3s1.53.1 2.25.3c1.72-1.16 2.48-.92 2.48-.92.54 1.23.2 2.13.1 2.36.67.62 1.02 1.42 1.02 2.4 0 3.45-2.11 4.21-4.12 4.43.33.28.61.85.61 1.7v2.53c0 .23.16.51.62.42C19.37 19.85 22 16.25 22 12c0-5.52-4.48-10-10-10zm-1.03 13.91c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm2.06-8.81c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2z"></path></svg>,
    quora: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12.82 20.82c-.85 0-1.4-.41-1.4-1.08 0-.62.55-1.08 1.4-1.08.87 0 1.4.46 1.4 1.08 0 .67-.53 1.08-1.4 1.08zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.82 15.82c-1.53 0-2.6-1.03-3.03-1.69l-.31-.56-1.58 3.32H8.32l2.67-5.5a2.24 2.24 0 0 1-.36-1.42c0-1.4.96-2.31 2.37-2.31 1.24 0 2.12.76 2.12 1.86 0 1.43-1.13 2.14-2.28 2.14-.6 0-1.03-.2-1.03-.63 0-.31.33-.51.93-.51.96 0 1.76-.83 1.76-2.28 0-1.87-1.42-3.14-3.5-3.14-2.31 0-3.85 1.5-3.85 3.53 0 .56.12 1.11.36 1.58L6.8 17.65H5.15l1.32-2.76c-.69-.53-1.03-1.28-1.03-2.24 0-2.31 1.93-4.15 4.56-4.15 2.82 0 4.88 2.03 4.88 4.49 0 2.05-1.22 3.47-3.23 4.15l.43.91c.43.91 1.34 1.87 3.12 1.87.55 0 .83-.23.83-.63 0-.36-.33-.6-.78-.6s-.81.26-.81.63c0 .85.86 1.61 2.26 1.61s2.23-.76 2.23-1.61c0-.76-.53-1.29-1.34-1.52l-.4-.12c-.53-.15-.83-.43-.83-.85 0-.53.48-.96 1.21-.96.76 0 1.21.43 1.21.96 0 .43-.28.7-.81.7s-.78-.26-.78-.7c0-1.03.88-1.99 2.26-1.99 1.31 0 2.23.96 2.23 1.99 0 1.06-.93 1.96-2.31 2.11l.46.1c.98.23 1.85 1.11 1.85 2.41 0 1.66-1.48 2.84-3.53 2.84z"></path></svg>,
  };

  return (
    <footer id="contact" className="bg-primary text-white pt-16 pb-8">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">

          {/* Column 1: Logo & Social */}
          <div className="md:col-span-2 lg:col-span-1">
             <div className="flex items-center space-x-2 mb-4">
              <LogoIcon />
              <span className="text-xl font-bold">Digital Catalyst</span>
            </div>
             <p className="text-gray-400 text-sm">
                Your one-stop shop for digital marketing and e-commerce solutions.
            </p>
            <div className="flex space-x-4 mt-6">
                {Object.entries(socialLinks).map(([key, url]) => (
                    socialIcons[key] && url ? (
                        <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                            {socialIcons[key]}
                        </a>
                    ) : null
                ))}
            </div>
          </div>
          
          {/* Column 2: Explore */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Explore</h3>
            <ul className="space-y-2 text-gray-400">
              <li><button onClick={onNavigateToAllProducts} className="hover:text-white transition-colors">Products</button></li>
              <li><button onClick={() => onNavigateToHomeAndScroll('services')} className="hover:text-white transition-colors">Services</button></li>
              <li><button onClick={() => onNavigateToHomeAndScroll('faq')} className="hover:text-white transition-colors">FAQ</button></li>
            </ul>
          </div>
          
          {/* Column 3: Legal */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-gray-400">
              <li><button onClick={() => onNavigateToPolicies('terms-and-conditions')} className="hover:text-white transition-colors">Terms of Service</button></li>
              <li><button onClick={() => onNavigateToPolicies('privacy-policy')} className="hover:text-white transition-colors">Privacy Policy</button></li>
              <li><button onClick={() => onNavigateToPolicies('refund-policy')} className="hover:text-white transition-colors">Refund Policy</button></li>
              <li><button onClick={onLoginClick} className="hover:text-white transition-colors">Login / Register</button></li>
              <li><button onClick={onAdminLoginClick} className="hover:text-white transition-colors">Admin Login</button></li>
            </ul>
          </div>

          {/* Column 4: Stay Updated */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Stay Updated</h3>
            <p className="text-gray-400 text-sm mb-4">Subscribe to our newsletter for the latest products and offers.</p>
            <form onSubmit={handleSubscribeSubmit} className="flex">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full px-3 py-2 text-gray-800 rounded-l-md focus:outline-none"
                />
                <button type="submit" className="bg-accent text-white font-semibold px-4 py-2 rounded-r-md hover:opacity-90 transition-opacity">
                    Subscribe
                </button>
            </form>
          </div>
        </div>
        
        <div className="border-t border-white/20 mt-12 pt-8 text-center text-sm text-gray-400">
          <p>{footerText}</p>
          <p className="mt-2">This is a demo site for a digital marketing and e-commerce business. All transactions are for demonstration purposes.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;