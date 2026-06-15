import React, { useMemo, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { SupportTicket } from '../../App';
import { geminiSetupHint, getGeminiApiKey } from '../../utils/gemini';

const StatusBadge: React.FC<{ status: SupportTicket['status'] }> = ({ status }) => {
  const styles = { Open: 'bg-rose-100 text-rose-700', Resolved: 'bg-emerald-100 text-emerald-700', Pending: 'bg-amber-100 text-amber-700' };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status]}`}>{status}</span>;
};

type TicketPageMode = 'list' | 'details' | 'reply';
type ReplyTone = 'according' | 'professional' | 'friendly' | 'apology' | 'concise';

const replyToneOptions: Array<{ value: ReplyTone; label: string; hint: string }> = [
  { value: 'according', label: 'According to reply', hint: 'Customer message aur aapke short note ke according best tone choose kare.' },
  { value: 'professional', label: 'Professional', hint: 'Formal, polished, business support language.' },
  { value: 'friendly', label: 'Friendly', hint: 'Warm, simple, human conversation style.' },
  { value: 'apology', label: 'Apology + Solution', hint: 'Empathy ke saath clear solution aur next steps.' },
  { value: 'concise', label: 'Short & Clear', hint: 'Seedha, brief, action-focused answer.' },
];

const dispatchSupportTicketsUpdate = (updatedTickets: SupportTicket[]) => {
  localStorage.setItem('siteSupportTickets', JSON.stringify(updatedTickets));
  window.dispatchEvent(new Event('siteSupportTicketsUpdated'));
};

const buildLocalAiReply = (ticket: SupportTicket, note: string, tone: ReplyTone) => {
  const normalizedNote = note.trim() || 'Please acknowledge the concern and share that our support team is checking it with priority.';
  const toneLine = tone === 'according'
    ? 'I have reviewed your message and prepared the response according to your concern.'
    : tone === 'friendly'
      ? 'Thanks for reaching out — I am happy to help you with this.'
      : tone === 'apology'
        ? 'I am sorry for the inconvenience caused, and I appreciate your patience while we help you resolve this.'
        : tone === 'concise'
          ? 'Thanks for contacting us. Here is the quick update.'
          : 'Thank you for contacting Digital Catalyst Support.';

  return `${toneLine}\n\nRegarding your request: "${ticket.subject}", ${normalizedNote}\n\nNext steps:\n• We will verify the details shared in your message.\n• If anything else is required, we will contact you on this email.\n• You can reply to this email anytime with screenshots or extra details.\n\nBest regards,\nDigital Catalyst Support Team`;
};

const SupportManagement: React.FC<{ tickets: SupportTicket[]; onUpdate: (updatedTickets: SupportTicket[]) => void; }> = ({ tickets, onUpdate }) => {
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<TicketPageMode>('list');
  const [replyText, setReplyText] = useState('');
  const [aiBrief, setAiBrief] = useState('');
  const [aiTone, setAiTone] = useState<ReplyTone>('according');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'All' | SupportTicket['status']>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [query, setQuery] = useState('');

  const masterTagCategories = useMemo(() => ['All', ...Array.from(new Set(tickets.filter(ticket => ticket.source === 'masterTag').map(ticket => ticket.category || 'General')))], [tickets]);
  const activeTicket = useMemo(() => tickets.find(ticket => ticket.id === activeTicketId) || null, [activeTicketId, tickets]);
  const stats = useMemo(() => ({ open: tickets.filter(t => t.status === 'Open').length, pending: tickets.filter(t => t.status === 'Pending').length, resolved: tickets.filter(t => t.status === 'Resolved').length }), [tickets]);
  const visibleTickets = tickets.filter(ticket => (filter === 'All' || ticket.status === filter) && (categoryFilter === 'All' || (ticket.category || 'General') === categoryFilter) && `${ticket.subject} ${ticket.customerName} ${ticket.customerEmail} ${ticket.message}`.toLowerCase().includes(query.toLowerCase()));
  const handleStatusChange = (id: string, status: SupportTicket['status']) => {
    const updatedTickets = tickets.map(t => t.id === id ? { ...t, status } : t);
    onUpdate(updatedTickets);
    dispatchSupportTicketsUpdate(updatedTickets);
  };

  const openTicketPage = (ticket: SupportTicket, mode: Exclude<TicketPageMode, 'list'>) => {
    setActiveTicketId(ticket.id);
    setPageMode(mode);
    setAiError(null);
    if (mode === 'reply') {
      setReplyText('');
      setAiBrief('');
      setAiTone('according');
    }
  };

  const closeTicketPage = () => {
    setActiveTicketId(null);
    setPageMode('list');
    setReplyText('');
    setAiBrief('');
    setAiError(null);
    setIsGeneratingReply(false);
  };

  const handleSendReply = () => {
    if (!activeTicket || !replyText.trim()) return;
    const trimmedReply = replyText.trim();
    const repliedAt = new Date().toISOString();
    const inboxMessage = `Master ne aapke @Master message par reply kiya hai: ${trimmedReply}`;
    const updatedTickets = tickets.map(t => t.id === activeTicket.id ? { ...t, status: 'Resolved' as const, adminReply: trimmedReply, repliedAt, inboxMessage, inboxRead: false } : t);
    onUpdate(updatedTickets);
    dispatchSupportTicketsUpdate(updatedTickets);
    closeTicketPage();
  };

  const handleOpenEmailDraft = () => {
    if (!activeTicket || !replyText.trim()) return;
    const subject = encodeURIComponent(`Re: ${activeTicket.subject}`);
    const body = encodeURIComponent(replyText.trim());
    window.open(`mailto:${activeTicket.customerEmail}?subject=${subject}&body=${body}`);
  };

  const generateAiReply = async () => {
    if (!activeTicket) return;
    setIsGeneratingReply(true);
    setAiError(null);

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      setReplyText(buildLocalAiReply(activeTicket, aiBrief, aiTone));
      setAiError(geminiSetupHint);
      setIsGeneratingReply(false);
      return;
    }

    try {
      const toneInstruction = replyToneOptions.find(option => option.value === aiTone)?.hint || replyToneOptions[0].hint;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are Digital Catalyst's customer support assistant. Draft only the email body, no subject line. Use professional formatting with short paragraphs and bullets where useful. Keep it helpful, polished, and ready to paste into a reply box.\n\nTone option: ${toneInstruction}\nAdmin's short instruction in any/random language: ${aiBrief || 'Acknowledge and help the customer with a clear next step.'}\n\nCustomer name: ${activeTicket.customerName}\nCustomer email: ${activeTicket.customerEmail}\nTicket subject: ${activeTicket.subject}\nTicket message: ${activeTicket.message}`,
      });
      setReplyText(response.text || buildLocalAiReply(activeTicket, aiBrief, aiTone));
    } catch (error) {
      console.warn('AI support reply generation failed:', error);
      setReplyText(buildLocalAiReply(activeTicket, aiBrief, aiTone));
      setAiError('AI generation failed, so a safe local draft was created instead.');
    } finally {
      setIsGeneratingReply(false);
    }
  };

  if (activeTicket && pageMode !== 'list') {
    const isReplyPage = pageMode === 'reply';

    return (
      <div className="animate-fade-in-up space-y-6">
        <button onClick={closeTicketPage} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-black text-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-x-0.5">
          <span>←</span> Back to support board
        </button>

        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-sky-500 p-6 text-white sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/75">{activeTicket.source === 'masterTag' ? 'Eduvora master tag' : 'Nested ticket page'} • #{activeTicket.id}</p>
                <h1 className="mt-2 text-3xl font-black sm:text-4xl">{isReplyPage ? 'Compose customer reply' : 'Ticket details'}</h1>
                <p className="mt-2 max-w-2xl text-sm font-semibold text-white/80">{activeTicket.subject}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={activeTicket.status} />
                {!isReplyPage && <button onClick={() => setPageMode('reply')} className="rounded-2xl bg-white px-5 py-3 font-black text-indigo-700 shadow-sm">Reply</button>}
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.4fr]">
            <aside className="space-y-4 border-b border-slate-100 bg-slate-50/80 p-6 lg:border-b-0 lg:border-r sm:p-8">
              <div className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Customer</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{activeTicket.customerName}</h2>
                <a href={`mailto:${activeTicket.customerEmail}`} className="mt-1 block break-all text-sm font-bold text-indigo-600">{activeTicket.customerEmail}</a>
                {activeTicket.source === 'masterTag' && <p className="mt-3 rounded-2xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">Community Master Tag • {activeTicket.category || 'General'}</p>}
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Ticket actions</p>
                <div className="mt-4 grid gap-2">
                  <button onClick={() => handleStatusChange(activeTicket.id, 'Pending')} className="rounded-2xl bg-amber-100 px-4 py-3 text-left font-black text-amber-700">Mark Pending</button>
                  <button onClick={() => handleStatusChange(activeTicket.id, 'Resolved')} className="rounded-2xl bg-emerald-100 px-4 py-3 text-left font-black text-emerald-700">Resolve Ticket</button>
                  <button onClick={() => handleStatusChange(activeTicket.id, 'Open')} className="rounded-2xl bg-rose-100 px-4 py-3 text-left font-black text-rose-700">Re-open</button>
                </div>
              </div>
            </aside>

            <main className="space-y-5 p-6 sm:p-8">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Customer message</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900">{activeTicket.subject}</h3>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{activeTicket.message}</p>
                {activeTicket.adminReply && <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Last admin reply</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-emerald-900">{activeTicket.adminReply}</p></div>}
              </div>

              {isReplyPage ? (
                <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
                  <section className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-xl text-white">✨</span>
                      <div>
                        <h3 className="font-black text-slate-900">AI Reply Designer</h3>
                        <p className="text-xs font-bold text-slate-500">Short mein batao kya jawab dena hai; AI professional draft bana dega.</p>
                      </div>
                    </div>

                    <label className="mt-5 block text-xs font-black uppercase tracking-widest text-slate-500">Aap kya reply dena chahte hain?</label>
                    <textarea value={aiBrief} onChange={e => setAiBrief(e.target.value)} rows={5} className="mt-2 w-full rounded-2xl border border-indigo-100 bg-white/90 p-4 text-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" placeholder="Example: user ko bolo ki humne issue receive kar liya hai, 24 hours me download link resend kar denge..." />

                    <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">Language style</p>
                    <div className="mt-2 grid gap-2">
                      {replyToneOptions.map(option => (
                        <button key={option.value} onClick={() => setAiTone(option.value)} className={`rounded-2xl border p-3 text-left transition ${aiTone === option.value ? 'border-indigo-300 bg-white shadow-sm' : 'border-transparent bg-white/55 hover:bg-white'}`}>
                          <span className="block font-black text-slate-900">{option.label}</span>
                          <span className="text-xs font-semibold text-slate-500">{option.hint}</span>
                        </button>
                      ))}
                    </div>

                    {aiError && <p className="mt-3 rounded-2xl bg-amber-100 p-3 text-xs font-bold leading-5 text-amber-800">{aiError}</p>}
                    <button onClick={generateAiReply} disabled={isGeneratingReply} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60">
                      {isGeneratingReply ? 'AI reply likh raha hai...' : 'AI se reply likhwao'}
                    </button>
                  </section>

                  <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Reply box</p>
                        <h3 className="text-xl font-black text-slate-900">Review and send</h3>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Master Tag sync ready</span>
                    </div>
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={15} className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm leading-6 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" placeholder="Write a helpful reply or generate one with AI..." />
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <button onClick={() => setReplyText('')} className="rounded-xl px-5 py-3 font-bold text-slate-600 hover:bg-slate-100">Clear</button>
                      <button onClick={handleOpenEmailDraft} disabled={!replyText.trim()} className="rounded-xl bg-slate-100 px-5 py-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">Open email draft</button>
                      <button onClick={handleSendReply} disabled={!replyText.trim()} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60">Publish under community message</button>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <button onClick={() => setPageMode('reply')} className="rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-left font-black text-white shadow-sm transition hover:-translate-y-0.5">Reply to customer →</button>
                  <button onClick={() => handleStatusChange(activeTicket.id, activeTicket.status === 'Resolved' ? 'Open' : 'Resolved')} className="rounded-3xl bg-slate-100 p-5 text-left font-black text-slate-700 transition hover:-translate-y-0.5">{activeTicket.status === 'Resolved' ? 'Re-open ticket' : 'Resolve ticket'} →</button>
                </div>
              )}
            </main>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div><p className="font-black uppercase tracking-[0.25em] text-blue-500">Help desk</p><h1 className="text-4xl font-black text-slate-900">Support</h1><p className="text-slate-600">A cleaner ticket board for replies, details, AI-assisted responses, and Firebase-backed Master Tag reply sync.</p></div>
      <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-3xl bg-rose-50 p-5 text-rose-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><p className="font-bold opacity-70">Open</p><p className="text-3xl font-black">{stats.open}</p></div><div className="rounded-3xl bg-amber-50 p-5 text-amber-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><p className="font-bold opacity-70">Pending</p><p className="text-3xl font-black">{stats.pending}</p></div><div className="rounded-3xl bg-emerald-50 p-5 text-emerald-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><p className="font-bold opacity-70">Resolved</p><p className="text-3xl font-black">{stats.resolved}</p></div></div>
      <div className="rounded-[1.5rem] border border-slate-100 bg-white/80 backdrop-blur-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tickets..." className="rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-3 lg:w-96" /><div className="flex flex-wrap gap-2">{(['All', 'Open', 'Pending', 'Resolved'] as const).map(tab => <button key={tab} onClick={() => setFilter(tab)} className={`rounded-full px-4 py-2 text-sm font-black ${filter === tab ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{tab}</button>)}</div></div><div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{masterTagCategories.map(category => <button key={category} onClick={() => setCategoryFilter(category)} className={`rounded-full px-4 py-2 text-xs font-black ${categoryFilter === category ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>{category === 'All' ? 'All categories' : category}</button>)}</div></div>
      <div className="grid gap-4 xl:grid-cols-2">{visibleTickets.map(ticket => <article key={ticket.id} className="rounded-[1.5rem] border border-slate-100 bg-white/80 backdrop-blur-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-600">#{ticket.id}</p><h3 className="mt-1 text-xl font-black text-slate-900">{ticket.subject}</h3><p className="text-sm text-slate-600">{ticket.customerName} • {ticket.customerEmail}</p>{ticket.source === 'masterTag' && <p className="mt-2 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">Eduvora Master Tag</p>}</div><StatusBadge status={ticket.status} /></div><p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{ticket.message}</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={() => openTicketPage(ticket, 'details')} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700">Details</button><button onClick={() => openTicketPage(ticket, 'reply')} className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 font-bold text-white">Reply</button><button onClick={() => openTicketPage(ticket, 'reply')} className="rounded-xl bg-indigo-50 px-4 py-2 font-bold text-indigo-700">AI Reply</button></div></article>)}</div>
      {!visibleTickets.length && <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 p-8 text-center font-bold text-slate-500">No support tickets found.</div>}
    </div>
  );
};

export default SupportManagement;
