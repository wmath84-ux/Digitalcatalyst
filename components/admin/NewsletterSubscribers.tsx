import React from 'react';
import { NewsletterSubscriber } from '../../App';

const NewsletterSubscribers: React.FC<{ subscribers: NewsletterSubscriber[] }> = ({ subscribers }) => {
  const sortedSubscribers = [...subscribers].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return (
    <div className="space-y-8 animate-fade-in-up">
      <div>
        <p className="font-black uppercase tracking-[0.25em] text-blue-500">Newsletter</p>
        <h1 className="text-4xl font-black text-slate-900">Subscribers</h1>
        <p className="text-slate-600">Emails collected from the footer subscribe form.</p>
      </div>
      <div className="rounded-[1.5rem] border border-slate-100 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
        <p className="text-sm font-bold text-slate-500">Total subscribers</p>
        <p className="mt-2 text-4xl font-black text-slate-900">{sortedSubscribers.length}</p>
      </div>
      <div className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
          <span>Email</span><span>Date</span>
        </div>
        {sortedSubscribers.map(subscriber => (
          <div key={subscriber.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0">
            <span className="break-all font-bold text-slate-900">{subscriber.email}</span>
            <span className="text-sm font-semibold text-slate-500">{new Date(subscriber.date).toLocaleString()}</span>
          </div>
        ))}
        {!sortedSubscribers.length && <div className="p-8 text-center font-bold text-slate-500">No newsletter subscribers yet.</div>}
      </div>
    </div>
  );
};

export default NewsletterSubscribers;
