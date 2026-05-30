import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NewsArticle, WebsiteSettings } from '../../App';
import { ContentDatabaseAdapter, ContentPostRecord, ContentPostType, runContentAutomation } from '../../utils/contentAutomator';

const glassCard = 'rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl';
const fieldClass = 'w-full rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-400/10';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-600';

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
type EditablePost = NewsArticle & { type: ContentPostType; thumbnailImage?: string; createdAt: string; };

const normalizePost = (post: NewsArticle): EditablePost => ({
  ...post,
  type: ((post as NewsArticle & { type?: ContentPostType }).type || 'blog') as ContentPostType,
  createdAt: (post as NewsArticle & { createdAt?: string }).createdAt || `${post.date || new Date().toISOString().split('T')[0]}T00:00:00.000Z`,
  thumbnailImage: (post as NewsArticle & { thumbnailImage?: string }).thumbnailImage || '',
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
  excerpt: '',
  content: '<h2>Start with the big idea</h2><p>Write a clear, student-focused introduction here.</p><ul><li>Add practical takeaways.</li><li>Keep paragraphs readable.</li></ul>',
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
    <div className="overflow-hidden rounded-3xl border border-white/50 bg-white/70">
      <div className="flex flex-wrap gap-2 border-b border-white/50 bg-white/70 p-3 backdrop-blur-xl">
        {(editorCommands || []).map(([command, label, value]) => (
          <button key={`${command}-${label}`} type="button" onClick={() => runCommand(command, value)} className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm">
            {label}
          </button>
        ))}
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={() => onChange(editorRef.current?.innerHTML || '')} className="prose prose-invert min-h-96 max-w-none bg-white/70 p-6 text-slate-900 outline-none" />
    </div>
  );
};

const NewsBlogManagement: React.FC<NewsBlogManagementProps> = ({ settings, onSettingsChange }) => {
  const posts = useMemo(() => ((settings.content.newsArticles || []) as NewsArticle[]).map(normalizePost), [settings.content.newsArticles]);
  const [mode, setMode] = useState<AdminMode>('list');
  const [editingPost, setEditingPost] = useState<EditablePost>(emptyPost());
  const [autopilotEnabled, setAutopilotEnabled] = useState(() => localStorage.getItem('dailyAiContentAutopilot') === 'enabled');
  const [automationStatus, setAutomationStatus] = useState('Idle — ready for the next editorial run.');
  const [isRunning, setIsRunning] = useState(false);

  const updatePosts = (nextPosts: EditablePost[]) => {
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

  const savePost = () => {
    const now = new Date().toISOString();
    const preparedPost: EditablePost = {
      ...editingPost,
      id: editingPost.id || Date.now(),
      date: editingPost.date || now.split('T')[0],
      createdAt: editingPost.createdAt || now,
      imageSeed: editingPost.imageSeed || `post-${Date.now()}`,
      excerpt: editingPost.excerpt || editingPost.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 180),
    };

    const nextPosts = editingPost.id
      ? posts.map((post) => post.id === editingPost.id ? preparedPost : post)
      : [preparedPost, ...posts];

    updatePosts(nextPosts);
    setMode('list');
  };

  const deletePost = (id: number) => {
    if (!window.confirm('Permanently delete this news/blog post?')) return;
    updatePosts(posts.filter((post) => post.id !== id));
  };

  const runAiFetchNow = async () => {
    setIsRunning(true);
    setAutomationStatus('Running AI fetch, generating 20 posts, and purging expired content…');

    let workingPosts = [...posts];
    const localAdapter: ContentDatabaseAdapter<ContentPostRecord> = {
      listPosts: async () => workingPosts as unknown as ContentPostRecord[],
      deletePosts: async (ids) => {
        workingPosts = workingPosts.filter((post) => !ids.includes(post.id));
      },
      createPosts: async (generated) => {
        const generatedArticles = generated.map((post) => ({
          id: Number(post.id) || Date.now() + Math.floor(Math.random() * 10000),
          title: post.title,
          type: post.type,
          category: post.category,
          date: post.date,
          createdAt: post.createdAt,
          imageSeed: post.imageSeed || `ai-${post.type}-${post.id}`,
          thumbnailImage: post.thumbnailImage || '',
          excerpt: post.excerpt,
          content: post.content,
        })) as EditablePost[];
        workingPosts = [...generatedArticles, ...workingPosts.filter((post) => !generated.some((generatedPost) => generatedPost.id === post.id))];
        updatePosts(workingPosts);
      },
    };

    try {
      const result = await runContentAutomation(localAdapter, { idFactory: () => Date.now() + Math.floor(Math.random() * 100000) });
      setAutomationStatus(`Completed: generated ${result.generated.length} posts and purged ${result.purgedIds.length} expired posts.`);
    } catch (error) {
      console.error('AI content automation failed:', error);
      setAutomationStatus(error instanceof Error ? error.message : 'AI automation failed. Check the console for details.');
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
      <div className="min-h-full bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/80">News & Blog Management</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">{editingPost.id ? 'Edit reading post' : 'Create reading post'}</h1>
            <p className="mt-3 max-w-3xl text-slate-600">Full-page editor with Smart Docs formatting, no cramped modals.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setMode('list')} className="rounded-2xl border border-white/50 bg-white/70 px-5 py-3 font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm">Cancel</button>
            <button onClick={savePost} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 font-black text-white shadow-sm transition hover:scale-105">Save Post</button>
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
            <label className={labelClass}>Thumbnail Image</label>
            <input value={editingPost.thumbnailImage || ''} onChange={(event) => setEditingPost({ ...editingPost, thumbnailImage: event.target.value })} className={fieldClass} placeholder="Paste image URL, or leave blank to use generated image seed" />
          </div>
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
    <div className="min-h-full bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-cyan-200/80">Daily Reading Hub CMS</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">News & Blog Management</h1>
          <p className="mt-3 max-w-3xl text-slate-600">Manage manual posts or let AI Autopilot generate fresh student reading content every day.</p>
        </div>
        <button onClick={openAddView} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 font-black text-white shadow-sm transition hover:scale-105">+ Add News/Blog</button>
      </div>

      <section className={`${glassCard} mb-8 overflow-hidden`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-fuchsia-200/80">AI Autopilot Status</p>
            <h2 className="mt-3 text-2xl font-black text-slate-900">Daily AI Fetch</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Generates 10 educational news updates and 10 student-focused blogs, then permanently purges posts older than 72 hours.</p>
            <p className="mt-4 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-sm text-slate-600">{automationStatus}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={toggleAutopilot} className={`rounded-2xl border px-5 py-3 font-black transition ${autopilotEnabled ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-700' : 'border-white/50 bg-white/70 text-slate-600 hover:bg-white/80 hover:shadow-sm'}`}>
              {autopilotEnabled ? 'Daily AI Fetch Enabled' : 'Enable Daily AI Fetch'}
            </button>
            <button onClick={runAiFetchNow} disabled={isRunning} className="rounded-2xl border border-purple-300/30 bg-purple-400/15 px-5 py-3 font-black text-purple-700 transition hover:bg-purple-400/25 disabled:cursor-not-allowed disabled:opacity-60">
              {isRunning ? 'Running…' : 'Run AI Fetch Now'}
            </button>
          </div>
        </div>
      </section>

      <section className={glassCard}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">Current News & Blogs</h2>
          <span className="rounded-full border border-white/50 bg-white/70 px-3 py-1 text-xs font-black text-slate-600">{posts.length} posts</span>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/70 text-xs uppercase tracking-[0.22em] text-slate-600">
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
                        <button onClick={() => openEditView(post)} className="rounded-2xl border border-cyan-300/30 px-4 py-2 font-black text-cyan-200 transition hover:bg-cyan-400/10">Edit</button>
                        <button onClick={() => deletePost(post.id)} className="rounded-2xl border border-red-300/30 px-4 py-2 font-black text-red-200 transition hover:bg-red-400/10">Delete</button>
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
