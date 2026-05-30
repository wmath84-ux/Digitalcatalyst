import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from './gemini';

export type ContentPostType = 'news' | 'blog';

export interface ContentPostRecord {
  id: number | string;
  title: string;
  content: string;
  type: ContentPostType;
  category: string;
  excerpt: string;
  thumbnailImage?: string;
  imageSeed?: string;
  date: string;
  createdAt: string;
}

export interface GeneratedContentPost {
  title: string;
  content: string;
  type: ContentPostType;
  category: string;
  excerpt?: string;
  thumbnailImage?: string;
}

export interface ContentDatabaseAdapter<TPost extends ContentPostRecord = ContentPostRecord> {
  listPosts: () => Promise<TPost[]>;
  createPosts: (posts: TPost[]) => Promise<void>;
  deletePosts: (ids: Array<TPost['id']>) => Promise<void>;
}

export interface ContentAutomationResult<TPost extends ContentPostRecord = ContentPostRecord> {
  generated: TPost[];
  purgedIds: Array<TPost['id']>;
  generatedAt: string;
}

const THREE_DAYS_IN_MS = 72 * 60 * 60 * 1000;

const buildContentPrompt = () => `
You are the editorial AI for Digital Catalyst, a premium student learning platform.
Generate exactly 20 fresh, factual-sounding, non-clickbait content items for a Daily Reading Hub:
- 10 items with type "news" focused on education, exams, productivity, AI tools for learning, scholarships, student technology, study policy updates, and employability.
- 10 items with type "blog" focused on practical student habits, revision systems, career readiness, digital skills, side projects, deep work, and learning strategy.

Return ONLY valid JSON. No markdown fence. No commentary.
The JSON shape must be:
{
  "posts": [
    {
      "title": "Clear premium headline under 90 characters",
      "type": "news" | "blog",
      "category": "Short category label",
      "excerpt": "A punchy two-sentence summary for cards.",
      "thumbnailImage": "A stable Unsplash Source URL or empty string",
      "content": "Formatting-ready rich HTML with <h2>, <p>, <ul>, <li>, <strong>, and <blockquote>. Write 650-900 words per post, with useful detail, student-focused examples, concrete takeaways, and no fake citations."
    }
  ]
}

Quality rules:
- Content must be original, educational, detailed, and safe for students.
- Avoid promising real-time breaking news unless phrased as trend analysis.
- Use rich HTML that can be inserted directly into a contentEditable Smart Docs editor.
- Include actionable takeaways in every post.
`;

const safeJsonParse = (raw: string): { posts?: GeneratedContentPost[] } => {
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  const jsonSlice = firstBrace >= 0 && lastBrace >= firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;
  return JSON.parse(jsonSlice);
};

const fallbackGeneratedPosts = (): GeneratedContentPost[] => {
  const nowLabel = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const buildPost = (index: number, type: ContentPostType): GeneratedContentPost => ({
    title: `${type === 'news' ? 'Student Learning Update' : 'Study Strategy Brief'} ${index + 1}`,
    type,
    category: type === 'news' ? 'Education News' : 'Student Success',
    excerpt: `A premium ${type} briefing for ${nowLabel} with practical takeaways for focused learners.`,
    thumbnailImage: '',
    content: `<h2>Why this matters</h2><p>This demo-mode ${type} item is generated locally because no Gemini API key is configured. It shows the same formatting-ready structure the AI autopilot will produce in production.</p><h2>Student takeaways</h2><ul><li><strong>Focus:</strong> Turn the idea into one concrete study action today.</li><li><strong>Review:</strong> Summarize the lesson in three bullet points.</li><li><strong>Apply:</strong> Use a 25-minute sprint to practice the skill.</li></ul><blockquote>Small daily reading habits compound into better exam confidence.</blockquote>`,
  });

  return [
    ...Array.from({ length: 10 }, (_, index) => buildPost(index, 'news')),
    ...Array.from({ length: 10 }, (_, index) => buildPost(index, 'blog')),
  ];
};

export const generateEducationalContent = async (): Promise<GeneratedContentPost[]> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return fallbackGeneratedPosts();

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: buildContentPrompt(),
    config: { responseMimeType: 'application/json' },
  });

  const parsed = safeJsonParse(response.text || '{}');
  const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  return posts
    .filter((post) => post && (post.type === 'news' || post.type === 'blog') && post.title && post.content)
    .slice(0, 20);
};

export const purgeExpiredContent = async <TPost extends ContentPostRecord>(
  database: ContentDatabaseAdapter<TPost>,
  now = new Date(),
): Promise<Array<TPost['id']>> => {
  const cutoff = now.getTime() - THREE_DAYS_IN_MS;
  const posts = await database.listPosts();
  const expiredIds = (posts || [])
    .filter((post) => new Date(post.createdAt || post.date).getTime() < cutoff)
    .map((post) => post.id);

  if (expiredIds.length > 0) await database.deletePosts(expiredIds);
  return expiredIds;
};

export const runContentAutomation = async <TPost extends ContentPostRecord = ContentPostRecord>(
  database: ContentDatabaseAdapter<TPost>,
  options: { now?: Date; idFactory?: () => TPost['id'] } = {},
): Promise<ContentAutomationResult<TPost>> => {
  const now = options.now || new Date();
  const purgedIds = await purgeExpiredContent(database, now);
  const generatedPosts = await generateEducationalContent();

  const hydratedPosts = generatedPosts.map((post, index) => ({
    id: options.idFactory ? options.idFactory() : `${now.getTime()}-${index}`,
    title: post.title,
    content: post.content,
    type: post.type,
    category: post.category || (post.type === 'news' ? 'Education News' : 'Student Success'),
    excerpt: post.excerpt || post.content.replace(/<[^>]+>/g, ' ').slice(0, 180),
    thumbnailImage: post.thumbnailImage || '',
    imageSeed: `${post.type}-${now.getTime()}-${index}`,
    date: now.toISOString().split('T')[0],
    createdAt: now.toISOString(),
  })) as TPost[];

  await database.createPosts(hydratedPosts);

  return {
    generated: hydratedPosts,
    purgedIds,
    generatedAt: now.toISOString(),
  };
};

// Cron/Firebase Function integration sketch:
// export const dailyContentAutopilot = onSchedule('every day 06:00', async () => {
//   await runContentAutomation(firestoreContentAdapter);
// });
