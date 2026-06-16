import React from 'react';

export type MobileQuickAction = 'purchases' | 'free' | 'topRated' | 'coupons' | 'news';

interface MobileAppHomeProps {
  searchQuery: string;
  activeAction: MobileQuickAction | null;
  onSearchChange: (query: string) => void;
  onQuickAction: (action: MobileQuickAction) => void;
}

const quickActions: Array<{ id: MobileQuickAction; label: string }> = [
  { id: 'purchases', label: 'My Purchases' },
  { id: 'free', label: 'Free Resources' },
  { id: 'topRated', label: 'Top Rated' },
  { id: 'coupons', label: 'Coupons' },
  { id: 'news', label: 'News' },
];

const MobileAppHome: React.FC<MobileAppHomeProps> = ({ searchQuery, activeAction, onSearchChange, onQuickAction }) => (
  <section className="mx-auto -mt-2 w-full max-w-6xl px-4 pb-5 sm:px-6 lg:hidden" aria-label="Mobile search and quick actions">
    <div className="rounded-[2rem] border border-white/80 bg-white/80 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <label className="relative block">
        <span className="sr-only">Search notes, courses, resources</span>
        <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1967D2]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search notes, courses, resources..."
          className="h-12 w-full rounded-2xl border border-[#DADCE0] bg-white pl-12 pr-4 text-sm font-semibold text-[#202124] shadow-inner outline-none transition placeholder:text-[#5F6368] focus:border-[#1A73E8] focus:ring-4 focus:ring-[#C2E7FF]/70"
        />
      </label>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Quick actions">
        {quickActions.map(action => {
          const isActive = activeAction === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onQuickAction(action.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition-all ${isActive ? 'border-[#1A73E8] bg-[#E8F0FE] text-[#174EA6] shadow-sm' : 'border-[#DADCE0] bg-white text-[#3C4043] hover:border-[#C2E7FF] hover:bg-[#F8FAFF] hover:text-[#1967D2]'}`}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  </section>
);

export default MobileAppHome;
