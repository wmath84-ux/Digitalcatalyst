import React, { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { db, storage } from '../../firebase';

const COMMUNITY_FEED = 'community_feed';
const POST_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_PUBLISH_TIMEOUT_MS = 20000;
const FIRESTORE_INLINE_IMAGE_MAX_BYTES = 900 * 1024;
type PostType = 'text' | 'image' | 'poll';

const stripUndefinedFields = <T extends Record<string, unknown>>(payload: T): Partial<T> =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as Partial<T>;

const dataUrlBytes = (value = '') => {
  const base64 = value.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
};

const withTimeout = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out. Please check your connection and try again.`)), ADMIN_PUBLISH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const AdminPostManagement: React.FC = () => {
  const [type, setType] = useState<PostType>('text');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [imageName, setImageName] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '', '']);
  const [feedback, setFeedback] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const publish = async () => {
    const body = text.trim();
    const options = pollOptions.map((item) => item.trim()).filter(Boolean);
    if (!body || (type === 'poll' && options.length < 2) || (type === 'image' && !image)) return;
    setIsSaving(true);
    setFeedback('');
    try {
      const id = Date.now();
      let imagePreview = '';
      let storagePath = '';
      if (type === 'image') {
        storagePath = `community/admin-posts/${id}.jpg`;
        try {
          await withTimeout(uploadString(ref(storage, storagePath), image, 'data_url'), 'Admin image upload');
          imagePreview = await withTimeout(getDownloadURL(ref(storage, storagePath)), 'Admin image URL fetch');
        } catch (uploadError) {
          console.error('Admin image upload failed; falling back to inline preview:', uploadError);
          if (dataUrlBytes(image) > FIRESTORE_INLINE_IMAGE_MAX_BYTES) throw uploadError;
          imagePreview = image;
          storagePath = '';
        }
      }
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
      if (type === 'image') Object.assign(payload, { imagePreview, imageLayout: 'thumbnail', storagePath: storagePath || undefined });
      if (type === 'poll') Object.assign(payload, { pollOptions: options, pollVotes: options.map(() => 0) });
      await withTimeout(addDoc(collection(db, COMMUNITY_FEED), stripUndefinedFields(payload)), 'Admin post publish');
      setText(''); setLink(''); setImage(''); setImageName(''); setPollOptions(['', '', '']);
      setFeedback('Admin post published to the community ADMIN POST page and main feed. It will auto-delete after 24 hours.');
    } catch (error) {
      console.error('Admin post publish failed:', error);
      setFeedback('Admin post publish failed. Please check the image/poll fields, internet connection, and try again.');
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
    {type === 'image' && <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-6 text-center font-black text-indigo-700"><input type="file" accept="image/*" onChange={handleImage} className="hidden" />{image ? <img src={image} alt="Admin upload preview" className="mx-auto mb-3 max-h-64 rounded-2xl object-contain" /> : 'Upload image'}<span className="block text-xs text-slate-600">{imageName || 'No image selected'}</span></label>}
    {type === 'poll' && <div className="grid gap-3 sm:grid-cols-3">{pollOptions.map((option, index) => <input key={index} value={option} onChange={(e) => setPollOptions((current) => current.map((item, i) => i === index ? e.target.value : item))} placeholder={`Poll option ${index + 1}`} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-indigo-500" />)}</div>}
    <button onClick={publish} disabled={isSaving || !text.trim() || (type === 'image' && !image) || (type === 'poll' && pollOptions.filter((item) => item.trim()).length < 2)} className="w-full rounded-2xl bg-indigo-700 px-6 py-4 font-black text-white shadow-lg disabled:bg-slate-300">{isSaving ? 'Publishing...' : 'Publish Admin Post'}</button>
  </div>;
};

export default AdminPostManagement;
