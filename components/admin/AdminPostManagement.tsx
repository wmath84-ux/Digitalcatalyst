import React, { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import PremiumImageUrlInput, { PremiumImageUrlStatus } from '../common/PremiumImageUrlInput';

const COMMUNITY_FEED = 'community_feed';
const POST_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const ADMIN_POST_FALLBACK_STORAGE_KEY = 'eduvoraAdminPostFallbacks';
const ADMIN_POST_FALLBACK_EVENT = 'eduvoraAdminPostFallbackUpdated';
type PostType = 'text' | 'image' | 'poll';

const stripUndefinedFields = <T extends Record<string, unknown>>(payload: T): Partial<T> =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as Partial<T>;

const persistLocalAdminPost = (payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  const sanitizedPayload = stripUndefinedFields(payload);
  try {
    const storedPosts = JSON.parse(localStorage.getItem(ADMIN_POST_FALLBACK_STORAGE_KEY) || '[]');
    const posts = Array.isArray(storedPosts) ? storedPosts : [];
    const nextPosts = [sanitizedPayload, ...posts.filter((post) => post?.id !== sanitizedPayload.id)].slice(0, 50);
    localStorage.setItem(ADMIN_POST_FALLBACK_STORAGE_KEY, JSON.stringify(nextPosts));
    window.dispatchEvent(new Event(ADMIN_POST_FALLBACK_EVENT));
  } catch (error) {
    console.error('Unable to save local admin post fallback:', error);
  }
};

const publishRemoteAdminPost = async (payload: Record<string, unknown>) => {
  await addDoc(collection(db, COMMUNITY_FEED), stripUndefinedFields(payload));
};

const AdminPostManagement: React.FC = () => {
  const [type, setType] = useState<PostType>('text');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [imageStatus, setImageStatus] = useState<PremiumImageUrlStatus>('empty');
  const [pollOptions, setPollOptions] = useState(['', '', '']);
  const [feedback, setFeedback] = useState('');
  const [isSaving, setIsSaving] = useState(false);



  const publish = async () => {
    const body = text.trim();
    const options = pollOptions.map((item) => item.trim()).filter(Boolean);

    if (!body || (type === 'poll' && options.length < 2) || (type === 'image' && (!image || imageStatus !== 'valid'))) {
      setFeedback('Please complete the required admin post fields before publishing.');
      return;
    }

    if (!auth.currentUser) {
      setFeedback('Please sign in with a Firebase admin account before publishing admin posts.');
      return;
    }

    const id = Date.now();
    const imagePreview = type === 'image' ? image : '';
    const payload: Record<string, unknown> = {
      id,
      admin: 'Digital Catalyst Admin',
      avatar: '🛡️',
      badge: 'ADMIN POST',
      title: type === 'poll' ? 'Admin poll' : type === 'image' ? 'Admin image update' : 'Admin update',
      body: link.trim() ? `${body}\n\nLink: ${link.trim()}` : body,
      time: 'Just now',
      creatorId: 'admin',
      ownerId: 'admin',
      postType: type,
      type,
      source: 'admin',
      reactions: {},
      reactionCounts: {},
      likedByUsers: {},
      reactionUsers: {},
      pollVoters: {},
      likeCount: 0,
      replyCount: 0,
      replies: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + POST_TTL_MS,
    };

    if (type === 'image') Object.assign(payload, { imagePreview, imageLayout: 'thumbnail', sourceType: 'url' });
    if (type === 'poll') Object.assign(payload, { pollOptions: options, pollVotes: options.map(() => 0) });

    setIsSaving(true);
    setFeedback('');

    try {
      await publishRemoteAdminPost(payload);
      setText('');
      setLink('');
      setImage('');
      setPollOptions(['', '', '']);
      setFeedback('Post published successfully. Admin image post ready.');
    } catch (error) {
      console.error('Admin post publish failed:', error);
      persistLocalAdminPost(payload);
      setFeedback('Post was saved as a local retry draft. Please check admin publishing permissions and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5 rounded-3xl bg-white/85 p-5 shadow-xl sm:p-8">
    <div><p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-600">Community</p><h1 className="mt-2 text-4xl font-black text-slate-900">Admin Post</h1><p className="mt-2 font-semibold text-slate-600">Publish text posts, image-with-text posts, and polls. Users can like, emoji-react, vote, and reply from the ADMIN POST community page.</p></div>
    {feedback && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700">{feedback}</div>}
    <div className="grid gap-3 sm:grid-cols-3">{(['text','image','poll'] as PostType[]).map((item) => <button key={item} onClick={() => setType(item)} className={`rounded-2xl border p-4 text-left font-black capitalize ${type === item ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'}`}>{item}</button>)}</div>
    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write admin post text..." className="min-h-40 w-full rounded-2xl border border-slate-200 p-4 font-semibold outline-none focus:border-indigo-500" />
    <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Optional link with text" className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-indigo-500" />
    {type === 'image' && <section className="overflow-hidden rounded-[1.75rem] border border-indigo-100 bg-white/90 shadow-[0_22px_70px_rgba(79,70,229,0.14)]"><div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white"><p className="text-xs font-black uppercase tracking-[0.24em] text-white/75">Admin image composer</p><h2 className="mt-1 text-2xl font-black">Admin image post ready</h2><p className="mt-2 text-sm font-bold text-white/85">Paste a public image URL and preview it before publishing. File upload requires Firebase Storage. Use Image URL for now.</p></div><div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]"><PremiumImageUrlInput value={image} onChange={setImage} onStatusChange={setImageStatus} label="Admin post image URL" previewAlt="Admin post image preview" aspect="square" helperText="Paste a public https image URL for the admin image post." compact /><div className="rounded-[1.5rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4"><p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-600">Final post feel</p><div className="mt-3 rounded-2xl border border-white bg-white/80 p-3 shadow-sm"><p className="text-sm font-black text-slate-900">ADMIN POST</p><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm font-bold text-slate-600">{text || 'Your admin post text will appear here.'}</p>{imageStatus === 'valid' ? <img src={image} alt="Admin post card preview" className="mt-3 aspect-square w-full rounded-2xl object-cover" /> : <div className="mt-3 flex aspect-square items-center justify-center rounded-2xl bg-indigo-50 text-sm font-black text-indigo-500">URL image preview</div>}</div></div></div></section>}
    {type === 'poll' && <div className="grid gap-3 sm:grid-cols-3">{pollOptions.map((option, index) => <input key={index} value={option} onChange={(e) => setPollOptions((current) => current.map((item, i) => i === index ? e.target.value : item))} placeholder={`Poll option ${index + 1}`} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-indigo-500" />)}</div>}
    <button onClick={publish} disabled={isSaving || !text.trim() || (type === 'image' && (!image || imageStatus !== 'valid')) || (type === 'poll' && pollOptions.filter((item) => item.trim()).length < 2)} className="w-full rounded-2xl bg-indigo-700 px-6 py-4 font-black text-white shadow-lg disabled:bg-slate-300">{isSaving ? 'Publishing...' : 'Publish Admin Post'}</button>
  </div>;
};

export default AdminPostManagement;
