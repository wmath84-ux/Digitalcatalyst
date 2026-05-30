import React, { useMemo, useState } from 'react';
import { SupportTicket } from '../../App';
import MacWindowModal from '../ui/MacWindowModal';

const StatusBadge: React.FC<{ status: SupportTicket['status'] }> = ({ status }) => {
  const styles = { Open: 'bg-rose-100 text-rose-700', Resolved: 'bg-emerald-100 text-emerald-700', Pending: 'bg-amber-100 text-amber-700' };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status]}`}>{status}</span>;
};

const SupportManagement: React.FC<{ tickets: SupportTicket[]; onUpdate: (updatedTickets: SupportTicket[]) => void; }> = ({ tickets, onUpdate }) => {
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyingTicket, setReplyingTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [filter, setFilter] = useState<'All' | SupportTicket['status']>('All');
  const [query, setQuery] = useState('');
  const stats = useMemo(() => ({ open: tickets.filter(t => t.status === 'Open').length, pending: tickets.filter(t => t.status === 'Pending').length, resolved: tickets.filter(t => t.status === 'Resolved').length }), [tickets]);
  const visibleTickets = tickets.filter(ticket => (filter === 'All' || ticket.status === filter) && `${ticket.subject} ${ticket.customerName} ${ticket.customerEmail}`.toLowerCase().includes(query.toLowerCase()));
  const handleStatusChange = (id: string, status: SupportTicket['status']) => onUpdate(tickets.map(t => t.id === id ? { ...t, status } : t));
  const handleSendReply = () => {
    if (!replyingTicket || !replyText.trim()) return;
    const subject = encodeURIComponent(`Re: ${replyingTicket.subject}`);
    const body = encodeURIComponent(replyText);
    window.open(`mailto:${replyingTicket.customerEmail}?subject=${subject}&body=${body}`);
    handleStatusChange(replyingTicket.id, 'Resolved');
    setReplyingTicket(null);
    setReplyText('');
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div><p className="font-black uppercase tracking-[0.25em] text-blue-500">Help desk</p><h1 className="text-4xl font-black text-slate-900">Support</h1><p className="text-slate-600">A cleaner ticket board for replies, details, and status updates.</p></div>
      <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-3xl bg-rose-50 p-5 text-rose-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><p className="font-bold opacity-70">Open</p><p className="text-3xl font-black">{stats.open}</p></div><div className="rounded-3xl bg-amber-50 p-5 text-amber-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><p className="font-bold opacity-70">Pending</p><p className="text-3xl font-black">{stats.pending}</p></div><div className="rounded-3xl bg-emerald-50 p-5 text-emerald-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><p className="font-bold opacity-70">Resolved</p><p className="text-3xl font-black">{stats.resolved}</p></div></div>
      <div className="rounded-[1.5rem] border border-slate-100 bg-white/70 backdrop-blur-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets..." className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:w-96" /><div className="flex flex-wrap gap-2">{(['All', 'Open', 'Pending', 'Resolved'] as const).map(tab => <button key={tab} onClick={() => setFilter(tab)} className={`rounded-full px-4 py-2 text-sm font-black ${filter === tab ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{tab}</button>)}</div></div></div>
      <div className="grid gap-4 xl:grid-cols-2">{visibleTickets.map(ticket => <article key={ticket.id} className="rounded-[1.5rem] border border-slate-100 bg-white/70 backdrop-blur-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-600">#{ticket.id}</p><h3 className="mt-1 text-xl font-black text-slate-900">{ticket.subject}</h3><p className="text-sm text-slate-600">{ticket.customerName} • {ticket.customerEmail}</p></div><StatusBadge status={ticket.status} /></div><p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{ticket.message}</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setSelectedTicket(ticket)} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700">Details</button><button onClick={() => setReplyingTicket(ticket)} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 font-bold text-white">Reply</button></div></article>)}</div>
      {selectedTicket && <MacWindowModal title={`Ticket #${selectedTicket.id}`} subtitle={selectedTicket.customerEmail} onClose={() => setSelectedTicket(null)} maxWidth="max-w-2xl"><div className="space-y-5 p-6"><div className="rounded-2xl bg-slate-50 p-5"><h3 className="text-xl font-black text-slate-900">{selectedTicket.subject}</h3><p className="mt-3 leading-7 text-slate-600">{selectedTicket.message}</p></div><div className="flex flex-wrap justify-end gap-3"><button onClick={() => { setReplyingTicket(selectedTicket); setSelectedTicket(null); }} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 font-bold text-white">Reply</button><button onClick={() => { handleStatusChange(selectedTicket.id, 'Pending'); setSelectedTicket(null); }} className="rounded-xl bg-amber-100 px-5 py-3 font-bold text-amber-700">Mark Pending</button><button onClick={() => { handleStatusChange(selectedTicket.id, 'Resolved'); setSelectedTicket(null); }} className="rounded-xl bg-emerald-100 px-5 py-3 font-bold text-emerald-700">Resolve</button></div></div></MacWindowModal>}
      {replyingTicket && <MacWindowModal title={`Reply to ${replyingTicket.customerName}`} subtitle={replyingTicket.subject} onClose={() => setReplyingTicket(null)} maxWidth="max-w-2xl"><div className="space-y-4 p-6"><textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={8} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4" placeholder="Write a helpful reply..." /><div className="flex justify-end gap-3"><button onClick={() => setReplyingTicket(null)} className="rounded-xl px-5 py-3 font-bold text-slate-600">Cancel</button><button onClick={handleSendReply} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 font-black text-white">Send via email</button></div></div></MacWindowModal>}
    </div>
  );
};

export default SupportManagement;
