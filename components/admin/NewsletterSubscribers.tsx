import React from 'react';
import { NewsletterSubscriber } from '../../App';

const NewsletterSubscribers: React.FC<{ subscribers: NewsletterSubscriber[]; onUpdate: (subscribers: NewsletterSubscriber[]) => void; }> = ({ subscribers, onUpdate }) => {
  const exportCsv = () => {
    const rows = ['Email,Subscribed At', ...subscribers.map(item => `"${item.email}","${new Date(item.subscribedAt).toLocaleString()}"`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'digital-catalyst-subscribers.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="rounded-[2rem] border border-blue-100 bg-white/85 p-6 shadow-[0_18px_45px_rgba(8,26,69,0.08)] backdrop-blur-xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Newsletter</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-black text-slate-900">Subscribers</h1>
            <p className="text-slate-600">Emails collected from the homepage footer subscribe form.</p>
          </div>
          <button onClick={exportCsv} disabled={!subscribers.length} className="rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 font-black text-white shadow-[0_14px_34px_rgba(23,105,255,0.22)] disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white/90 shadow-[0_18px_45px_rgba(8,26,69,0.08)] backdrop-blur-xl">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-blue-100 bg-blue-50/70 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600">
          <span>Email</span><span>Subscribed</span><span>Action</span>
        </div>
        {subscribers.map(subscriber => (
          <div key={subscriber.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-blue-50 px-5 py-4 text-sm last:border-b-0">
            <span className="break-all font-bold text-slate-900">{subscriber.email}</span>
            <span className="text-slate-600">{new Date(subscriber.subscribedAt).toLocaleString()}</span>
            <button onClick={() => onUpdate(subscribers.filter(item => item.id !== subscriber.id))} className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-600">Remove</button>
          </div>
        ))}
        {!subscribers.length && <div className="p-10 text-center font-bold text-slate-500">No subscribers yet.</div>}
      </div>
    </div>
  );
};

export default NewsletterSubscribers;
