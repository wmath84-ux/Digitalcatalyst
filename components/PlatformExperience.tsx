import React from 'react';
import { WebsiteSettings } from '../App';

interface PlatformExperienceProps {
  settings: WebsiteSettings;
  onLoginClick: () => void;
  onExploreClick: () => void;
}

const capabilities = [
  { title: 'Storefront for notes & courses', text: 'Category filters, favourites, cart, coupons, ratings, reviews, subscriptions, product images, sale pricing, and instant post-purchase access.', icon: '🛍️' },
  { title: 'Google Docs style learning', text: 'A clean document workspace for formatted notes, rich text content, reading focus, editor toolbar actions, and downloadable resources.', icon: '📄' },
  { title: 'Private video classroom', text: 'Embed YouTube lessons from the admin panel, add descriptions and pricing, then let students watch inside the app with side notes.', icon: '🎥' },
  { title: 'AI study assistant', text: 'Students can chat with an AI mentor while watching lessons; admins can configure the shared API key or let learners use their own key.', icon: '🤖' },
  { title: 'Powerful admin panel', text: 'Create products, update content, manage coupons, subscriptions, users, orders, support tickets, review replies, and full website settings.', icon: '⚙️' },
  { title: 'Analytics ready', text: 'Track views, wishlist demand, purchases, reviews, audience behaviour, learning activity, and course engagement for smarter decisions.', icon: '📊' },
];

const PlatformExperience: React.FC<PlatformExperienceProps> = ({ settings, onLoginClick, onExploreClick }) => {
  return (
    <section className="relative bg-slate-950 text-white py-20 sm:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(82,143,240,0.28),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.2),transparent_30%)]" />
      <div className="relative container mx-auto px-6">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 items-center">
          <div>
            <p className="text-sm font-black tracking-[0.3em] uppercase text-blue-300">Creator commerce OS</p>
            <h2 className="mt-4 text-4xl sm:text-5xl font-black leading-tight">A nested, premium learning app for selling notes, subscriptions, and video courses.</h2>
            <p className="mt-5 text-lg text-slate-300 leading-relaxed">{settings.content.siteName} now presents your idea as a polished content marketplace: beautiful landing page, OTP onboarding, Amazon-like discovery, Google Docs inspired reading, course player with notes + AI, and an admin control room.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button onClick={onLoginClick} className="px-7 py-4 rounded-2xl bg-white text-slate-950 font-black hover:-translate-y-1 hover:shadow-2xl transition-all">Login / Sign up</button>
              <button onClick={onExploreClick} className="px-7 py-4 rounded-2xl bg-white/10 border border-white/15 font-black hover:bg-white/15 transition-colors">Explore products</button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {capabilities.map((item, index) => (
              <article key={item.title} className={`rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur ${index === 1 ? 'sm:translate-y-8' : ''}`}>
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlatformExperience;
