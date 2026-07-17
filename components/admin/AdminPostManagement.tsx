import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import PremiumImageUrlInput, { PremiumImageUrlStatus } from '../common/PremiumImageUrlInput';

const COMMUNITY_FEED = 'community_feed';
const COMMUNITY_STATUS = 'community_status';
const VERIFIED_ADMIN_EMAIL = 'wmath84@gmail.com';
const FEED_POST_NEVER_EXPIRES_AT = 253402300799000;
const ADMIN_POST_FALLBACK_STORAGE_KEY = 'eduvoraAdminPostFallbacks';
const ADMIN_POST_FALLBACK_EVENT = 'eduvoraAdminPostFallbackUpdated';
type PostType = 'text' | 'image' | 'poll';
type AdminPostRecord = { id: string; numericId: number; title: string; body: string; type: PostType; imagePreview?: string; createdAt: number };
type LegacyRecord = { collectionName: typeof COMMUNITY_FEED | typeof COMMUNITY_STATUS; id: string; label: string };

const stripUndefinedFields = <T extends Record<string, unknown>>(payload: T): Partial<T> =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as Partial<T>;
const asMillis = (value: any) => typeof value?.toMillis === 'function' ? value.toMillis() : Number(value) || 0;
const normalizeIdentity = (value: unknown) => String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, ' ');
const legacyRamamberNames = new Set(['ramamber', 'ramamber user']);
const isLegacyRamamberPost = (data: Record<string, any>) => [data.admin, data.author, data.authorName, data.displayName, data.name, data.username, data.ownerName].some((value) => legacyRamamberNames.has(normalizeIdentity(value)));

const readLocalAdminPosts = () => {
  if (typeof window === 'undefined') return [] as Record<string, any>[];
  try { const parsed = JSON.parse(localStorage.getItem(ADMIN_POST_FALLBACK_STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const persistLocalAdminPost = (payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  const sanitizedPayload = stripUndefinedFields(payload);
  const nextPosts = [sanitizedPayload, ...readLocalAdminPosts().filter((post) => post?.id !== sanitizedPayload.id)].slice(0, 50);
  localStorage.setItem(ADMIN_POST_FALLBACK_STORAGE_KEY, JSON.stringify(nextPosts));
  window.dispatchEvent(new Event(ADMIN_POST_FALLBACK_EVENT));
};
const removeLocalAdminPost = (numericId: number) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_POST_FALLBACK_STORAGE_KEY, JSON.stringify(readLocalAdminPosts().filter((post) => Number(post?.id) !== numericId)));
  window.dispatchEvent(new Event(ADMIN_POST_FALLBACK_EVENT));
};
const deleteFeedPostWithReplies = async (postId: string) => {
  const replySnapshot = await getDocs(collection(db, COMMUNITY_FEED, postId, 'replies'));
  await Promise.all(replySnapshot.docs.map((reply) => deleteDoc(reply.ref)));
  await deleteDoc(doc(db, COMMUNITY_FEED, postId));
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
  const [deletingId, setDeletingId] = useState('');
  const [remotePosts, setRemotePosts] = useState<AdminPostRecord[]>([]);
  const [legacyRecords, setLegacyRecords] = useState<LegacyRecord[]>([]);
  const [isScanningLegacy, setIsScanningLegacy] = useState(false);
  const [isCleaningLegacy, setIsCleaningLegacy] = useState(false);

  useEffect(() => onSnapshot(query(collection(db, COMMUNITY_FEED), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
    setRemotePosts(snapshot.docs.filter((item) => { const data = item.data(); return data.source === 'admin' || data.creatorId === 'admin' || data.badge === 'ADMIN POST'; }).map((item) => { const data = item.data(); return { id: item.id, numericId: Number(data.id) || 0, title: String(data.title || 'Admin post'), body: String(data.body || ''), type: (data.postType || data.type || 'text') as PostType, imagePreview: data.imagePreview, createdAt: asMillis(data.createdAt) }; }));
  }, (error) => setFeedback(`Admin post list could not load: ${error instanceof Error ? error.message : 'Unknown error'}`)), []);


  const scanLegacyRamamberPosts = async () => {
    setIsScanningLegacy(true); setFeedback('');
    try {
      const [feedSnapshot, statusSnapshot] = await Promise.all([getDocs(query(collection(db, COMMUNITY_FEED), limit(500))), getDocs(query(collection(db, COMMUNITY_STATUS), limit(500)))]);
      const found: LegacyRecord[] = [];
      feedSnapshot.docs.forEach((item) => { const data = item.data(); if (isLegacyRamamberPost(data)) found.push({ collectionName: COMMUNITY_FEED, id: item.id, label: String(data.title || data.body || 'Legacy feed post').slice(0, 90) }); });
      statusSnapshot.docs.forEach((item) => { const data = item.data(); if (isLegacyRamamberPost(data)) found.push({ collectionName: COMMUNITY_STATUS, id: item.id, label: String(data.title || data.body || 'Legacy status').slice(0, 90) }); });
      setLegacyRecords(found);
      setFeedback(found.length ? `Found ${found.length} exact Ramamber test record${found.length === 1 ? '' : 's'}. Review and delete them below.` : 'No exact Ramamber test records were found.');
    } catch (error) { setFeedback(`Legacy scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
    finally { setIsScanningLegacy(false); }
  };

  const cleanupLegacyRamamberPosts = async () => {
    if (!legacyRecords.length || !window.confirm(`Delete ${legacyRecords.length} exact Ramamber test record${legacyRecords.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setIsCleaningLegacy(true); setFeedback('');
    try {
      for (const record of legacyRecords) { if (record.collectionName === COMMUNITY_FEED) await deleteFeedPostWithReplies(record.id); else await deleteDoc(doc(db, COMMUNITY_STATUS, record.id)); }
      setLegacyRecords([]); setFeedback('Legacy Ramamber test posts and stories were deleted successfully.');
    } catch (error) { setFeedback(`Legacy cleanup stopped safely: ${error instanceof Error ? error.message : 'Unknown error'}`); }
    finally { setIsCleaningLegacy(false); }
  };

  const deleteAdminPost = async (post: AdminPostRecord) => {
    if (!window.confirm(`Delete “${post.title}”? Replies under this post will also be removed.`)) return;
    setDeletingId(post.id); setFeedback('');
    try { await deleteFeedPostWithReplies(post.id); removeLocalAdminPost(post.numericId); setFeedback('Admin post deleted successfully.'); }
    catch (error) { setFeedback(`Admin post delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`); }
    finally { setDeletingId(''); }
  };

  const publish = async () => {
    const body = text.trim(); const options = pollOptions.map((item) => item.trim()).filter(Boolean);
    if (!body) return setFeedback('Please complete the required admin post fields before publishing.');
    if (type === 'poll' && options.length < 2) return setFeedback('Please add at least two poll options before publishing.');
    if (type === 'image' && (!image.trim() || imageStatus !== 'valid')) return setFeedback(image.trim() ? 'This image link is not loading. Try another public image URL.' : 'Please paste a valid https image URL.');
    if (!auth.currentUser) return setFeedback('Please sign in with a Firebase admin account before publishing admin posts.');
    const id = Date.now();
    const payload: Record<string, unknown> = { id, admin: 'Digital Catalyst Admin', authorName: auth.currentUser.displayName || 'Digital Catalyst Admin', authorUid: auth.currentUser.uid, authorEmail: (auth.currentUser.email || VERIFIED_ADMIN_EMAIL).trim().toLowerCase(), avatar: auth.currentUser.photoURL || '🛡️', badge: 'ADMIN POST', title: type === 'poll' ? 'Admin poll' : type === 'image' ? 'Admin image update' : 'Admin update', body: link.trim() ? `${body}\n\nLink: ${link.trim()}` : body, link: link.trim() || undefined, time: 'Just now', creatorId: 'admin', ownerId: 'admin', postType: type, type, source: 'admin', reactions: {}, reactionCounts: {}, likedByUsers: {}, reactionUsers: {}, pollVoters: {}, likeCount: 0, replyCount: 0, replies: [], createdAt: Date.now(), expiresAt: FEED_POST_NEVER_EXPIRES_AT };
    if (type === 'image') Object.assign(payload, { imagePreview: image, imageLayout: 'thumbnail', sourceType: 'url' });
    if (type === 'poll') Object.assign(payload, { pollOptions: options, pollVotes: options.map(() => 0) });
    setIsSaving(true); setFeedback('');
    try { await addDoc(collection(db, COMMUNITY_FEED), stripUndefinedFields(payload)); setText(''); setLink(''); setImage(''); setPollOptions(['', '', '']); setFeedback('Post published successfully.'); }
    catch (error) { console.error('Admin post publish failed:', error); persistLocalAdminPost(payload); setFeedback('Post was saved as a local retry draft. Please check admin publishing permissions and try again.'); }
    finally { setIsSaving(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-5 rounded-3xl bg-white/85 p-5 shadow-xl sm:p-8">
    <div><p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-600">Community</p><h1 className="mt-2 text-4xl font-black text-slate-900">Admin Post</h1><p className="mt-2 font-semibold text-slate-600">Publish and safely delete official Community posts. The verified admin identity is {VERIFIED_ADMIN_EMAIL}.</p></div>
    {feedback && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700">{feedback}</div>}
    <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-amber-950">Legacy test-post cleanup</h2><p className="mt-1 text-sm font-semibold text-amber-800">Scans only exact author aliases “Ramamber” and “Ramamber User”; post text is never used as a delete match.</p></div><button type="button" onClick={scanLegacyRamamberPosts} disabled={isScanningLegacy || isCleaningLegacy} className="rounded-2xl bg-amber-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{isScanningLegacy ? 'Scanning…' : 'Scan exact test posts'}</button></div>{legacyRecords.length ? <div className="mt-4 space-y-2"><div className="max-h-48 space-y-2 overflow-y-auto">{legacyRecords.map((record) => <div key={`${record.collectionName}-${record.id}`} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><span className="font-black text-amber-800">{record.collectionName}</span> · {record.label}</div>)}</div><button type="button" onClick={cleanupLegacyRamamberPosts} disabled={isCleaningLegacy} className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{isCleaningLegacy ? 'Deleting safely…' : `Delete ${legacyRecords.length} exact test record${legacyRecords.length === 1 ? '' : 's'}`}</button></div> : null}</section>
    <div className="grid gap-3 sm:grid-cols-3">{(['text','image','poll'] as PostType[]).map((item) => <button key={item} onClick={() => setType(item)} className={`rounded-2xl border p-4 text-left font-black capitalize ${type === item ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'}`}>{item}</button>)}</div>
    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write admin post text..." className="min-h-40 w-full rounded-2xl border border-slate-200 p-4 font-semibold outline-none focus:border-indigo-500" />
    <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Optional link with text" className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-indigo-500" />
    {type === 'image' && <PremiumImageUrlInput value={image} onChange={setImage} onStatusChange={setImageStatus} label="Admin post image URL" previewAlt="Admin post image preview" aspect="square" helperText="Paste a public https image URL for the admin image post." compact />}
    {type === 'poll' && <div className="grid gap-3 sm:grid-cols-3">{pollOptions.map((option, index) => <input key={index} value={option} onChange={(e) => setPollOptions((current) => current.map((item, i) => i === index ? e.target.value : item))} placeholder={`Poll option ${index + 1}`} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-indigo-500" />)}</div>}
    <button onClick={publish} disabled={isSaving || !text.trim() || (type === 'image' && (!image || imageStatus !== 'valid')) || (type === 'poll' && pollOptions.filter((item) => item.trim()).length < 2)} className="w-full rounded-2xl bg-indigo-700 px-6 py-4 font-black text-white shadow-lg disabled:bg-slate-300">{isSaving ? 'Publishing...' : 'Publish Admin Post'}</button>
    <section className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4"><div><h2 className="text-xl font-black text-slate-900">Published admin posts</h2><p className="mt-1 text-sm font-semibold text-slate-600">Deleting a post also deletes its reply documents.</p></div><div className="mt-4 space-y-3">{remotePosts.length ? remotePosts.map((post) => <article key={post.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">{post.type}</p><h3 className="mt-1 truncate text-base font-black text-slate-900">{post.title}</h3><p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-600">{post.body}</p></div><button type="button" onClick={() => deleteAdminPost(post)} disabled={deletingId === post.id} className="shrink-0 rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 ring-1 ring-red-100 disabled:opacity-50">{deletingId === post.id ? 'Deleting…' : 'Delete post'}</button></article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">No published admin posts found.</div>}</div></section>
  </div>;
};

export default AdminPostManagement;
