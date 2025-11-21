
import React, { useState } from 'react';
import EmailPreviewModal from './EmailPreviewModal';
import { SupportTicket } from '../../App';

// ... (Keep StatusBadge, TicketDetailModal, ReplyInputModal exactly as before)
const StatusBadge: React.FC<{ status: SupportTicket['status'] }> = ({ status }) => {
    const styles = { Open: "bg-red-100 text-red-700 border-red-200", Resolved: "bg-emerald-100 text-emerald-700 border-emerald-200", Pending: "bg-amber-100 text-amber-700 border-amber-200" };
    return <span className={`text-xs font-bold px-3 py-1 rounded-full border ${styles[status]}`}>{status}</span>;
};

const TicketDetailModal: React.FC<{ ticket: SupportTicket; onClose: () => void; onStatusChange: (id: string, status: SupportTicket['status']) => void; onReply: (ticket: SupportTicket) => void; }> = ({ ticket, onClose, onStatusChange, onReply }) => {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 animate-scale-in-up">
                <div className="flex justify-between mb-4 items-center">
                    <h2 className="text-xl font-bold text-slate-800">Ticket Details #{ticket.id}</h2>
                    <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-600">&times;</button>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>From: {ticket.customerName} ({ticket.customerEmail})</span>
                        <span>{new Date(ticket.date).toLocaleString()}</span>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="font-bold text-lg text-slate-800 mb-2">{ticket.subject}</p>
                        <p className="text-slate-600 leading-relaxed">{ticket.message}</p>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button 
                            onClick={() => { onReply(ticket); onClose(); }} 
                            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            Reply
                        </button>
                        {ticket.status !== 'Resolved' && (
                            <button onClick={() => { onStatusChange(ticket.id, 'Resolved'); onClose(); }} className="px-5 py-2 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold hover:bg-emerald-200">
                                Mark Resolved
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ReplyInputModal: React.FC<{ ticket: SupportTicket; onClose: () => void; onPreview: (text: string) => void; onSendGmail: (text: string) => void }> = ({ ticket, onClose, onPreview, onSendGmail }) => {
    const [replyText, setReplyText] = useState('');
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[55] flex justify-center items-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 animate-scale-in-up">
                <h3 className="text-lg font-bold mb-4">Reply to {ticket.customerName}</h3>
                <textarea 
                    className="w-full p-4 border rounded-lg bg-gray-50 h-40 focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="Type your response here..." 
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                />
                <div className="flex justify-end gap-3 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                    
                    <button 
                        onClick={() => { if(replyText.trim()) onSendGmail(replyText); }}
                        className="px-5 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 flex items-center gap-2"
                        disabled={!replyText.trim()}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                        </svg>
                        Send via Gmail
                    </button>

                    <button 
                        onClick={() => { if(replyText.trim()) onPreview(replyText); }} 
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        disabled={!replyText.trim()}
                    >
                        Preview AI Email
                    </button>
                </div>
            </div>
        </div>
    );
};

const SupportManagement: React.FC<{ tickets: SupportTicket[]; onUpdate: (updatedTickets: SupportTicket[]) => void; }> = ({ tickets, onUpdate }) => {
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [replyingTicket, setReplyingTicket] = useState<SupportTicket | null>(null);
    const [replyText, setReplyText] = useState('');
    const [showEmailPreview, setShowEmailPreview] = useState(false);

    const handleStatusChange = (id: string, status: SupportTicket['status']) => onUpdate(tickets.map(t => t.id === id ? { ...t, status } : t));

    const handleSendViaGmail = (text: string) => {
        if (replyingTicket) {
            const subject = encodeURIComponent(`Re: ${replyingTicket.subject}`);
            const body = encodeURIComponent(text);
            window.open(`mailto:${replyingTicket.customerEmail}?subject=${subject}&body=${body}`);
            
            // Optionally mark as resolved since user took action
            handleStatusChange(replyingTicket.id, 'Resolved');
            setReplyingTicket(null);
        }
    };

    const handleSendEmailInternal = () => {
        // Simulate sending (in a real app this calls backend)
        alert(`Email sent to ${replyingTicket?.customerEmail}!`);
        setShowEmailPreview(false);
        setReplyingTicket(null);
        setReplyText('');
        if (replyingTicket) handleStatusChange(replyingTicket.id, 'Resolved');
    };

    return (
        <div className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div><h1 className="text-3xl font-extrabold text-slate-800">Support</h1><p className="text-slate-500 mt-1">Customer inquiries and tickets.</p></div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Ticket ID</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Subject</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Customer</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tickets.map(ticket => (
                                <tr key={ticket.id} className="hover:bg-slate-50/80 transition-all duration-200 hover:shadow-inner">
                                    <td className="p-3 sm:p-5 font-mono text-xs font-bold text-slate-400">{ticket.id}</td>
                                    <td className="p-3 sm:p-5 font-bold text-slate-700 truncate max-w-xs">{ticket.subject}</td>
                                    <td className="p-3 sm:p-5 text-sm text-slate-600">{ticket.customerName}</td>
                                    <td className="p-3 sm:p-5"><StatusBadge status={ticket.status} /></td>
                                    <td className="p-3 sm:p-5 text-right space-x-2">
                                        <button 
                                            onClick={() => setReplyingTicket(ticket)} 
                                            className="text-blue-600 font-bold text-sm hover:underline mr-2"
                                        >
                                            Reply
                                        </button>
                                        <button onClick={() => setSelectedTicket(ticket)} className="text-gray-500 font-bold text-sm hover:underline">Details</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            {selectedTicket && (
                <TicketDetailModal 
                    ticket={selectedTicket} 
                    onClose={() => setSelectedTicket(null)} 
                    onStatusChange={handleStatusChange}
                    onReply={(t) => setReplyingTicket(t)} 
                />
            )}

            {replyingTicket && !showEmailPreview && (
                <ReplyInputModal 
                    ticket={replyingTicket} 
                    onClose={() => setReplyingTicket(null)} 
                    onPreview={(text) => { setReplyText(text); setShowEmailPreview(true); }}
                    onSendGmail={handleSendViaGmail}
                />
            )}

            {showEmailPreview && replyingTicket && (
                <EmailPreviewModal 
                    ticket={replyingTicket} 
                    replyText={replyText} 
                    attachment={null} 
                    onClose={() => setShowEmailPreview(false)} 
                    onConfirmSend={handleSendEmailInternal} 
                />
            )}
        </div>
    );
};

export default SupportManagement;
