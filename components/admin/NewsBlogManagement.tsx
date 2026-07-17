import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NewsArticle, WebsiteSettings } from '../../App';
import { ContentDatabaseAdapter, ContentPostRecord, ContentPostType, ContentRetentionUnit, DEFAULT_CONTENT_PURGE_POLICY, getExpiredContentIds, normalizeContentPurgePolicy, runContentAutomation } from '../../utils/contentAutomator';
import PremiumImageUrlInput, { PremiumImageUrlStatus } from '../common/PremiumImageUrlInput';
import { isCloudinaryImageUploadConfigured, uploadImageToCloudinary } from '../../utils/cloudinaryUpload';

const glassCard = 'rounded-[2rem] border border-white/50 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl';
const fieldClass = 'w-full rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-400/10';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-600';
const AI_GENERATION_COUNT_OPTIONS = Array.from({ length: 11 }, (_, index) => index);
const readStoredGenerationCount = (key: string, fallback: number) => {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) ? Math.min(10, Math.max(0, Math.round(stored))) : fallback;
};

const editorCommands: Array<[string, string, string?]> = [
  ['bold', 'B'],
  ['italic', 'I'],
  ['formatBlock', 'H1', '<h1>'],
  ['formatBlock', 'H2', '<h2>'],
  ['insertUnorderedList', '• List'],
  ['justifyLeft', 'Left'],
  ['justifyCenter', 'Center'],
  ['justifyRight', 'Right'],
];

interface NewsBlogManagementProps {
  settings: WebsiteSettings;
  onSettingsChange: (settings: WebsiteSettings) => void;
}

type AdminMode = 'list' | 'form';
type EditablePost = NewsArticle & { type: ContentPostType; thumbnailImage?: string; coverImage: string; createdAt: string; imageLayout?: 'thumbnail' | 'cover'; sourceType?: 'url'; };

const normalizePost = (post: NewsArticle): EditablePost => ({
  ...post,
  type: ((post as NewsArticle & { type?: ContentPostType }).type || 'blog') as ContentPostType,
  createdAt: (post as NewsArticle & { createdAt?: string }).createdAt || `${post.date || new Date().toISOString().split('T')[0]}T00:00:00.000Z`,
  thumbnailImage: (post as NewsArticle & { thumbnailImage?: string }).thumbnailImage || '',
  coverImage: (post as NewsArticle & { coverImage?: string }).coverImage || (post as NewsArticle & { thumbnailImage?: string }).thumbnailImage || '',
  imageLayout: (post as NewsArticle & { imageLayout?: 'thumbnail' | 'cover' }).imageLayout || ((post as NewsArticle & { coverImage?: string }).coverImage ? 'cover' : undefined),
  sourceType: (post as NewsArticle & { sourceType?: 'url' }).sourceType || ((post as NewsArticle & { coverImage?: string; thumbnailImage?: string }).coverImage || (post as NewsArticle & { coverImage?: string; thumbnailImage?: string }).thumbnailImage ? 'url' : undefined),
  showPremiumLearningCta: Boolean((post as NewsArticle & { showPremiumLearningCta?: boolean }).showPremiumLearningCta),
});

const emptyPost = (): EditablePost => ({
  id: 0,
  title: '',
  type: 'blog',
  category: 'Student Success',
  date: new Date().toISOString().split('T')[0],
  createdAt: new Date().toISOString(),
  imageSeed: `post-${Date.now()}`,
  thumbnailImage: '',
  coverImage: '',
  imageLayout: 'cover',
  excerpt: '',
  content: '<h2>Start with the big idea</h2><p>Write a clear, student-focused introduction here.</p><ul><li>Add practical takeaways.</li><li>Keep paragraphs readable.</li></ul>',
  showPremiumLearningCta: false,
});

const SmartDocsEditor: React.FC<{ value: string; onChange: (value: string) => void; }> = ({ value, onChange }) => {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value;
  }, [value]);

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current?.innerHTML || '');
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/50 bg-white/80">
      <div className="flex flex-wrap gap-2 border-b border-white/50 bg-white/80 p-3 backdrop-blur-xl">
        {(editorCommands || []).map(([command, label, value]) => (
          <button key={`${command}-${label}`} type="button" onClick={() => runCommand(command, value)} className="rounded-xl border border-white/50 bg-white/80 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm">
            {label}
          </button>
        ))}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={() => onChange(editorRef.current?.innerHTML || '')} className="prose prose-invert min-h-96 max-w-none bg-white/80 p-6 text-slate-900 outline-none" />
    </div>
  );
};

const NewsBlogManagement: React.FC<NewsBlogManagementProps> = ({ settings, onSettingsChange }) => {
  const settingsPosts = useMemo(() => ((settings.content.newsArticles || []) as NewsArticle[]).map(normalizePost), [settings.content.newsArticles]);
  const [articles, setArticles] = useState<EditablePost[]>(settingsPosts);
  const posts = articles;

  const [mode, setMode] = useState<AdminMode>('list');
  const [editingPost, setEditingPost] = useState<EditablePost>(emptyPost());
  const [autopilotEnabled, setAutopilotEnabled] = useState(() => localStorage.getItem('dailyAiContentAutopilot') === 'enabled');
  const [automationStatus, setAutomationStatus] = useState('Idle — ready for the next editorial run.');
  const [isRunning, setIsRunning] = useState(false);
  const [newsGenerationCount, setNewsGenerationCount] = useState(() => readStoredGenerationCount('aiNewsGenerationCount', 3));
  const [blogGenerationCount, setBlogGenerationCount] = useState(() => readStoredGenerationCount('aiBlogGenerationCount', 3));
  const totalGenerationCount = newsGenerationCount + blogGenerationCount;
  const storedPurgePolicy = normalizeContentPurgePolicy((settings.content as any).readingAutomation || DEFAULT_CONTENT_PURGE_POLICY);
  const [autoPurgeEnabled, setAutoPurgeEnabled] = useState(storedPurgePolicy.autoPurgeEnabled);
  const [retentionValue, setRetentionValue] = useState(storedPurgePolicy.retentionValue);
  const [retentionUnit, setRetentionUnit] = useState<ContentRetentionUnit>(storedPurgePolicy.retentionUnit);
  const [isPurging, setIsPurging] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState('');
  const [coverImageStatus, setCoverImageStatus] = useState<PremiumImageUrlStatus>('empty');

  useEffect(() => {
    setArticles(settingsPosts);
  }, [settingsPosts]);

  useEffect(() => {
    const nextPolicy = normalizeContentPurgePolicy((settings.content as any).readingAutomation || DEFAULT_CONTENT_PURGE_POLICY);
    setAutoPurgeEnabled(nextPolicy.autoPurgeEnabled);
    setRetentionValue(nextPolicy.retentionValue);
    setRetentionUnit(nextPolicy.retentionUnit);
  }, [(settings.content as any).readingAutomation]);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => setSuccessToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [successToast]);

  useEffect(() => {
    localStorage.setItem('aiNewsGenerationCount', String(newsGenerationCount));
    localStorage.setItem('aiBlogGenerationCount', String(blogGenerationCount));
  }, [blogGenerationCount, newsGenerationCount]);

  const updatePosts = (nextPosts: EditablePost[]) => {
    setArticles(nextPosts);
    onSettingsChange({
      ...settings,
      content: {
        ...settings.content,
        newsArticles: nextPosts,
      },
    });
  };

  const openAddView = () => {
    setEditingPost(emptyPost());
    setMode('form');
  };

  const openEditView = (post: EditablePost) => {
    setEditingPost(post);
    setMode('form');
  };

  const uploadCoverImage = async (file: File) => {
    setCoverUploadError('');
    if (!isCloudinaryImageUploadConfigured()) {
      setCoverUploadError('Direct upload is not configured. Use a public HTTPS image URL.');
      return;
    }

    setIsUploadingCover(true);
    try {
      const hostedUrl = await uploadImageToCloudinary(file, { folder: 'news-blog', tags: ['news-blog-cover'] });
      setEditingPost((post) => ({ ...post, coverImage: hostedUrl, thumbnailImage: hostedUrl }));
      setCoverImageStatus('checking');
    } catch (error) {
      setCoverUploadError(error instanceof Error ? error.message : 'Upload failed. Try again or use a public image URL.');
    } finally {
      setIsUploadingCover(false);
    }
  };


  const savePost = () => {
    if ((editingPost.coverImage || '').trim() && coverImageStatus !== 'valid') {
      setCoverUploadError(coverImageStatus === 'invalid' ? 'This image link is not loading. Try another public image URL.' : 'Please paste a valid https image URL.');
      return;
    }
    const now = new Date().toISOString();
    const resolvedCoverImage = (editingPost.coverImage || editingPost.thumbnailImage || '').trim();
    const preparedPost: EditablePost = {
      ...editingPost,
      id: editingPost.id || Date.now(),
      date: editingPost.date || now.split('T')[0],
      createdAt: editingPost.createdAt || now,
      imageSeed: editingPost.imageSeed || `post-${Date.now()}`,
      coverImage: resolvedCoverImage,
      thumbnailImage: resolvedCoverImage,
      ...(resolvedCoverImage ? { imageLayout: 'cover' as const, sourceType: 'url' as const } : {}),
      excerpt: editingPost.excerpt || editingPost.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 180),
      showPremiumLearningCta: Boolean(editingPost.showPremiumLearningCta),
    };

    const nextPosts = editingPost.id
      ? posts.map((post) => post.id === editingPost.id ? preparedPost : post)
      : [preparedPost, ...posts];

    updatePosts(nextPosts);
    setSuccessToast('News/blog post saved successfully.');
    setMode('list');
  };

  const deletePost = (id: number) => {
    if (!window.confirm('Permanently delete this news/blog post?')) return;
    updatePosts(posts.filter((post) => post.id !== id));
  };

  const currentPurgePolicy = normalizeContentPurgePolicy({ autoPurgeEnabled, retentionValue, retentionUnit });

  const savePurgePolicy = (updates: Partial<typeof currentPurgePolicy>) => {
    const nextPolicy = normalizeContentPurgePolicy({ ...currentPurgePolicy, ...updates });
    setAutoPurgeEnabled(nextPolicy.autoPurgeEnabled);
    setRetentionValue(nextPolicy.retentionValue);
    setRetentionUnit(nextPolicy.retentionUnit);
    onSettingsChange({
      ...settings,
      content: { ...settings.content, readingAutomation: nextPolicy },
    });
    setAutomationStatus(nextPolicy.autoPurgeEnabled
      ? `Auto purge enabled for News/Blog older than ${nextPolicy.retentionValue} ${nextPolicy.retentionUnit}.`
      : 'Auto purge disabled. AI generation will not delete old content.');
  };

  const purgeOldContentNow = async () => {
    const eligibleIds = getExpiredContentIds(posts, currentPurgePolicy);
    if (eligibleIds.length === 0) {
      setAutomationStatus(`No News or Blog items are older than ${currentPurgePolicy.retentionValue} ${currentPurgePolicy.retentionUnit}.`);
      return;
    }
    if (!window.confirm(`Permanently purge ${eligibleIds.length} eligible News/Blog item${eligibleIds.length === 1 ? '' : 's'} older than ${currentPurgePolicy.retentionValue} ${currentPurgePolicy.retentionUnit}? Store products, purchases and community content are not included.`)) return;

    setIsPurging(true);
    try {
      const eligibleSet = new Set(eligibleIds);
      updatePosts(posts.filter(post => !eligibleSet.has(post.id)));
      setSuccessToast(`Purged ${eligibleIds.length} old News/Blog item${eligibleIds.length === 1 ? '' : 's'}.`);
      setAutomationStatus(`Manual purge complete. Removed ${eligibleIds.length} eligible reading item${eligibleIds.length === 1 ? '' : 's'}.`);
    } finally {
      setIsPurging(false);
    }
  };

  const runAiFetchNow = async () => {
    if (totalGenerationCount === 0) {
      setAutomationStatus('Select at least one News or Blog item before starting AI generation.');
      return;
    }

    setIsRunning(true);
    setSuccessToast('');
    setAutomationStatus(`Generating ${newsGenerationCount} news + ${blogGenerationCount} blogs in small verified batches${currentPurgePolicy.autoPurgeEnabled ? `, then purging items older than ${currentPurgePolicy.retentionValue} ${currentPurgePolicy.retentionUnit}` : ' with auto purge disabled'}…`);

    let workingPosts = [...posts];
    const localAdapter: ContentDatabaseAdapter<ContentPostRecord> = {
      listPosts: async () => workingPosts as unknown as ContentPostRecord[],
      deletePosts: async (ids) => {
        workingPosts = workingPosts.filter((post) => !ids.includes(post.id));
      },
      createPosts: async () => undefined,
    };

    try {
      const result = await runContentAutomation(localAdapter, {
        newsCount: newsGenerationCount,
        blogCount: blogGenerationCount,
        autoPurgeEnabled: currentPurgePolicy.autoPurgeEnabled,
        retentionValue: currentPurgePolicy.retentionValue,
        retentionUnit: currentPurgePolicy.retentionUnit,
        idFactory: () => Date.now() + Math.floor(Math.random() * 100000),
      });
      const newArticles = result.generated.map((post) => ({
        id: Number(post.id) || Date.now() + Math.floor(Math.random() * 10000),
        title: post.title,
        type: post.type,
        category: post.category,
        date: post.date,
        createdAt: post.createdAt,
        imageSeed: post.imageSeed || `ai-${post.type}-${post.id}`,
        thumbnailImage: post.thumbnailImage || post.coverImage || '',
        coverImage: post.coverImage || post.thumbnailImage || '',
        imageLayout: 'cover' as const,
        sourceType: 'url' as const,
        excerpt: post.excerpt,
        content: post.content,
        showPremiumLearningCta: false,
      })) as EditablePost[];
      const purgedPostIds = new Set(result.purgedIds);
      const nextPosts = [...newArticles, ...workingPosts.filter((post) => !purgedPostIds.has(post.id))];
      updatePosts(nextPosts);
      setSuccessToast(`AI fetch complete — added ${newArticles.filter(post => post.type === 'news').length} news + ${newArticles.filter(post => post.type === 'blog').length} blogs with topic-matched image URLs.`);
      setAutomationStatus(`Completed safely: generated ${result.generated.length} validated posts${currentPurgePolicy.autoPurgeEnabled ? ` and purged ${result.purgedIds.length} eligible old posts` : '; auto purge was OFF and no old content was deleted'}.`);
    } catch (error) {
      console.error('AI content automation failed:', error);
      const message = error instanceof Error ? error.message : 'AI automation failed. Check the console for details.';
      setAutomationStatus(`${message} Existing News and Blog posts were not changed.`);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleAutopilot = () => {
    const next = !autopilotEnabled;
    setAutopilotEnabled(next);
    localStorage.setItem('dailyAiContentAutopilot', next ? 'enabled' : 'disabled');
    setAutomationStatus(next ? 'Daily AI Fetch enabled. Connect this handler to a Cron/Firebase scheduled function for production.' : 'Daily AI Fetch disabled.');
  };

  if (mode === 'form') {
    return (
      <div className="min-h-full bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] text-slate-900">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-700/80">News & Blog Management</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">{editingPost.id ? 'Edit reading post' : 'Create reading post'}</h1>
            <p className="mt-3 max-w-3xl text-slate-600">Full-page editor with Smart Docs formatting, no cramped modals.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setMode('list')} className="rounded-2xl border border-white/50 bg-white/80 px-5 py-3 font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm">Cancel</button>
            <button onClick={savePost} disabled={Boolean((editingPost.coverImage || '').trim()) && coverImageStatus !== 'valid'} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 font-black text-white shadow-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50">Save Post</button>
          </div>
        </div>

        <div className={`${glassCard} grid gap-6 lg:grid-cols-12`}>
          <div className="lg:col-span-8">
            <label className={labelClass}>Title</label>
            <input value={editingPost.title} onChange={(event) => setEditingPost({ ...editingPost, title: event.target.value })} className={fieldClass} placeholder="e.g. Five AI study habits students can use this week" />
          </div>
          <div className="lg:col-span-2">
            <label className={labelClass}>Type</label>
            <select value={editingPost.type} onChange={(event) => setEditingPost({ ...editingPost, type: event.target.value as ContentPostType })} className={fieldClass}>
              <option value="news">News</option>
              <option value="blog">Blog</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className={labelClass}>Date</label>
            <input type="date" value={editingPost.date} onChange={(event) => setEditingPost({ ...editingPost, date: event.target.value })} className={fieldClass} />
          </div>
          <div className="lg:col-span-4">
            <label className={labelClass}>Category</label>
            <input value={editingPost.category} onChange={(event) => setEditingPost({ ...editingPost, category: event.target.value })} className={fieldClass} placeholder="Education News" />
          </div>
          <div className="lg:col-span-8">
            <PremiumImageUrlInput value={editingPost.coverImage || ''} onChange={(url) => { setCoverUploadError(''); setEditingPost({ ...editingPost, coverImage: url, thumbnailImage: url }); }} onStatusChange={setCoverImageStatus} label="News/blog cover image URL" previewAlt={`${editingPost.title || 'Article'} cover preview`} aspect="video" compact helperText="Choose a cover image, preview it, then save the article." />
          </div>
          <div className="lg:col-span-12 rounded-[1.5rem] border border-white/50 bg-white/70 p-5 shadow-sm">
            <label className="flex cursor-pointer flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="block text-sm font-black text-slate-900">Enable “Explore premium learning resources” button</span>
                <span className="mt-1 block text-sm font-semibold text-slate-600">Keep this off unless this specific news/blog should show the premium resources CTA inside the reading view. AI-generated posts also stay off by default.</span>
              </span>
              <span className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${editingPost.showPremiumLearningCta ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <input type="checkbox" checked={Boolean(editingPost.showPremiumLearningCta)} onChange={(event) => setEditingPost({ ...editingPost, showPremiumLearningCta: event.target.checked })} className="sr-only" />
                <span className={`h-6 w-6 rounded-full bg-white shadow-sm transition ${editingPost.showPremiumLearningCta ? 'translate-x-7' : 'translate-x-1'}`} />
              </span>
            </label>
          </div>

          <section className="lg:col-span-12 overflow-hidden rounded-[2rem] border border-white/50 bg-white/60 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl">
            <div className="grid gap-6 rounded-[1.75rem] bg-white/60 p-5 backdrop-blur-2xl lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-300/90">Cover Image</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">Premium editorial cover</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">Choose a cover image, confirm the preview, then save the article.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-indigo-200/70 bg-white/80 px-5 py-3 text-sm font-black text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md">
                    <input type="file" accept="image/*,.heic,.heif,image/heic,image/heif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCoverImage(file); event.currentTarget.value = ''; }} />
                    {isUploadingCover ? 'Uploading…' : 'Choose image'}
                  </label>
                  <button type="button" onClick={() => setEditingPost({ ...editingPost, coverImage: '', thumbnailImage: '' })} className="rounded-2xl border border-white/50 bg-white/80 px-5 py-3 text-sm font-black text-slate-600 transition hover:bg-white/90 hover:shadow-sm">Clear Image</button>
                </div>
                {coverUploadError && <p className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm font-bold text-rose-700">{coverUploadError}</p>}
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-white/60 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-2 shadow-sm">
                <div className="relative aspect-video overflow-hidden rounded-[1.15rem] bg-white/80">
                  {editingPost.coverImage && coverImageStatus === 'valid' ? (
                    <><div className="absolute left-4 top-4 z-10 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">Cover image ready</div><img src={editingPost.coverImage} alt={`${editingPost.title || 'Article'} cover preview`} className="h-full w-full object-cover transition duration-700 hover:scale-105" /></>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-slate-500">
                      <span className="text-4xl">🖼️</span>
                      <span className="mt-3 text-sm font-bold">No cover selected yet</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          <div className="lg:col-span-12">
            <label className={labelClass}>Excerpt</label>
            <textarea value={editingPost.excerpt} onChange={(event) => setEditingPost({ ...editingPost, excerpt: event.target.value })} className={fieldClass} rows={3} placeholder="Short card summary for the reading hub." />
          </div>
          <div className="lg:col-span-12">
            <label className={labelClass}>Content — Smart Docs Rich Text</label>
            <SmartDocsEditor value={editingPost.content} onChange={(content) => setEditingPost({ ...editingPost, content })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#d8e0ef] bg-[radial-gradient(circle_at_12%_8%,rgba(79,70,229,0.14),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.12),transparent_26%),linear-gradient(135deg,#d8e0ef,#e6ebf4_48%,#d5deec)] text-slate-900">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-700/80">Daily Reading Hub CMS</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">News & Blog Management</h1>
          <p className="mt-3 max-w-3xl text-slate-600">Manage manual posts or let AI Autopilot generate fresh student reading content every day.</p>
        </div>
        <button onClick={openAddView} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 font-black text-white shadow-sm transition hover:scale-105">+ Add News/Blog</button>
      </div>

      <section className={`${glassCard} mb-8 overflow-hidden`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-700/80">AI Autopilot Status</p>
            <h2 className="mt-3 text-2xl font-black text-slate-900">Daily AI Fetch</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Choose exactly how many News and Blog items to add. Generation uses small schema-validated batches and topic-matched image URLs. Old content is never deleted unless Auto purge is explicitly ON or you press Purge now.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-cyan-200/70 bg-cyan-50/80 p-4">
                <span className="block text-xs font-black uppercase tracking-[0.18em] text-cyan-800">News to add</span>
                <select value={newsGenerationCount} onChange={(event) => setNewsGenerationCount(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 font-black text-slate-900 outline-none focus:ring-4 focus:ring-cyan-200/60">
                  {AI_GENERATION_COUNT_OPTIONS.map((count) => <option key={`news-count-${count}`} value={count}>{count} news item{count === 1 ? '' : 's'}</option>)}
                </select>
              </label>
              <label className="rounded-2xl border border-fuchsia-200/70 bg-fuchsia-50/80 p-4">
                <span className="block text-xs font-black uppercase tracking-[0.18em] text-fuchsia-800">Blogs to add</span>
                <select value={blogGenerationCount} onChange={(event) => setBlogGenerationCount(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-fuchsia-200 bg-white px-3 py-2 font-black text-slate-900 outline-none focus:ring-4 focus:ring-fuchsia-200/60">
                  {AI_GENERATION_COUNT_OPTIONS.map((count) => <option key={`blog-count-${count}`} value={count}>{count} blog item{count === 1 ? '' : 's'}</option>)}
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-500">Selected run: {newsGenerationCount} News + {blogGenerationCount} Blogs = {totalGenerationCount} new items.</p>
            <div className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50/85 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Old-content purge control</p>
                  <p className="mt-1 text-sm leading-6 text-amber-950">Auto purge is OFF by default. The rule applies only to News and Blog records.</p>
                </div>
                <label className="inline-flex items-center gap-3 font-black text-amber-950">
                  <input type="checkbox" checked={autoPurgeEnabled} onChange={event => savePurgePolicy({ autoPurgeEnabled: event.target.checked })} className="h-5 w-5 rounded border-amber-300" />
                  Auto purge {autoPurgeEnabled ? 'ON' : 'OFF'}
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
                <label className="text-xs font-black uppercase tracking-[0.14em] text-amber-900">Retention value
                  <input type="number" min="1" max={retentionUnit === 'hours' ? 8760 : 3650} value={retentionValue} onChange={event => savePurgePolicy({ retentionValue: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-base font-black normal-case tracking-normal text-slate-900" />
                </label>
                <label className="text-xs font-black uppercase tracking-[0.14em] text-amber-900">Unit
                  <select value={retentionUnit} onChange={event => savePurgePolicy({ retentionUnit: event.target.value as ContentRetentionUnit })} className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-base font-black normal-case tracking-normal text-slate-900">
                    <option value="hours">Hours</option><option value="days">Days</option>
                  </select>
                </label>
                <button type="button" onClick={purgeOldContentNow} disabled={isPurging} className="self-end rounded-xl border border-red-200 bg-white px-4 py-2.5 font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50">{isPurging ? 'Purging…' : 'Purge now'}</button>
              </div>
            </div>
            <p className="mt-4 rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-sm text-slate-600">{automationStatus}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={toggleAutopilot} className={`rounded-2xl border px-5 py-3 font-black transition ${autopilotEnabled ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-700' : 'border-white/50 bg-white/80 text-slate-600 hover:bg-white/80 hover:shadow-sm'}`}>
              {autopilotEnabled ? 'Daily AI Fetch Enabled' : 'Enable Daily AI Fetch'}
            </button>
            <button onClick={runAiFetchNow} disabled={isRunning || totalGenerationCount === 0} className="rounded-2xl border border-purple-300/30 bg-purple-400/15 px-5 py-3 font-black text-purple-700 transition hover:bg-purple-400/25 disabled:cursor-not-allowed disabled:opacity-60">
              {isRunning ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-700/30 border-t-purple-700" /> Fetching…</span> : `Generate ${totalGenerationCount} item${totalGenerationCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </section>

      {successToast && (
        <div className="mb-8 rounded-3xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-4 font-bold text-emerald-700 shadow-sm backdrop-blur-xl" role="status">
          ✅ {successToast}
        </div>
      )}

      <section className={glassCard}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">Current News & Blogs</h2>
          <span className="rounded-full border border-white/50 bg-white/80 px-3 py-1 text-xs font-black text-slate-600">{posts.length} posts</span>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/80 text-xs uppercase tracking-[0.22em] text-slate-600">
                <tr>
                  <th className="p-5">Title</th>
                  <th className="p-5">Type</th>
                  <th className="p-5">Date</th>
                  <th className="p-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {posts.length > 0 ? (posts || []).map((post) => (
                  <tr key={post.id} className="transition hover:bg-white/80 hover:shadow-sm">
                    <td className="p-5">
                      <p className="font-black text-slate-900">{post.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-600">{post.category} • {post.excerpt}</p>
                    </td>
                    <td className="p-5">
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${post.type === 'news' ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-700' : 'border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-700'}`}>{post.type === 'news' ? 'News' : 'Blog'}</span>
                    </td>
                    <td className="p-5 text-slate-600">{new Date(post.date).toLocaleDateString()}</td>
                    <td className="p-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEditView(post)} className="rounded-2xl border border-cyan-300/30 px-4 py-2 font-black text-cyan-700 transition hover:bg-cyan-400/10">Edit</button>
                        <button onClick={() => deletePost(post.id)} className="rounded-2xl border border-red-300/30 px-4 py-2 font-black text-red-700 transition hover:bg-red-400/10">Delete</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-600">
                      <p className="text-4xl">📰</p>
                      <p className="mt-3 text-lg font-black text-slate-900">No reading posts yet</p>
                      <p className="mt-1">Create one manually or run the AI fetch now.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NewsBlogManagement;
