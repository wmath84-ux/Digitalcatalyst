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

    if (type === 'image') Object.assign(payload, { imagePreview, imageLayout: 'thumbnail' });
    if (type === 'poll') Object.assign(payload, { pollOptions: options, pollVotes: options.map(() => 0) });

    setIsSaving(true);
    setFeedback('');

    try {
      await publishRemoteAdminPost(payload);
      setText('');
      setLink('');
      setImage('');
      setPollOptions(['', '', '']);
      setFeedback('Admin post published to Firebase community feed. Image URL saved successfully. It will auto-delete after 15 days.');
    } catch (error) {
      console.error('Admin post publish failed:', error);
      persistLocalAdminPost(payload);
      setFeedback('Admin post was NOT published publicly. Firebase publish failed, so a local retry draft was saved only on this device. Please verify admin Firebase permissions and try again.');
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
    {type === 'image' && <PremiumImageUrlInput value={image} onChange={setImage} onStatusChange={setImageStatus} label="Admin post image URL" previewAlt="Admin post image preview" aspect="square" helperText="Paste an https image URL for the admin image post. Firebase Storage upload is currently disabled." />}
    {type === 'poll' && <div className="grid gap-3 sm:grid-cols-3">{pollOptions.map((option, index) => <input key={index} value={option} onChange={(e) => setPollOptions((current) => current.map((item, i) => i === index ? e.target.value : item))} placeholder={`Poll option ${index + 1}`} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-indigo-500" />)}</div>}
    <button onClick={publish} disabled={isSaving || !text.trim() || (type === 'image' && (!image || imageStatus !== 'valid')) || (type === 'poll' && pollOptions.filter((item) => item.trim()).length < 2)} className="w-full rounded-2xl bg-indigo-700 px-6 py-4 font-black text-white shadow-lg disabled:bg-slate-300">{isSaving ? 'Publishing...' : 'Publish Admin Post'}</button>
  </div>;
};

export default AdminPostManagement;
