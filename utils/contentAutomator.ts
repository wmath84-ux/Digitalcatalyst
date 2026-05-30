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
Generate exactly 20 fresh, factual-sounding, non-clickbait content items for separate News and Blog experiences.

STRICT CATEGORIZATION:
- Generate exactly 10 items with type "news".
  - News means current education events, quick exam updates, student alerts, scholarships, policy/watch-list updates, student technology announcements, and employability signals.
  - News must be concise, timely, and update-oriented.
- Generate exactly 10 items with type "blog".
  - Blog means in-depth educational articles, how-to guides, study tips, revision systems, career readiness advice, digital skills explainers, side-project guides, and deep learning strategy.
  - Blog must be evergreen, practical, and tutorial-style.
- Do not mix categories. A news item must never read like a long study guide, and a blog item must never read like a breaking update.

STRICT MARKDOWN FORMATTING:
- The "content" field MUST be rich Markdown, not HTML.
- Every post MUST include:
  - At least two "##" headings
  - At least two "###" subheadings
  - At least one bullet list using "- " bullets
  - Short readable paragraphs of 2-4 sentences each
  - A final "## Key Takeaways" section with bullets
- No massive walls of plain text. Break ideas into scannable sections.

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
      "content": "Rich Markdown with ## Headings, ### Subheadings, - bullet lists, short paragraphs, and a ## Key Takeaways section. Write 550-850 words per post with useful student-focused examples, concrete actions, and no fake citations."
    }
  ]
}

Quality rules:
- Content must be original, educational, detailed, and safe for students.
- Avoid promising real-time breaking news unless phrased as trend analysis or an alert-style explainer.
- Markdown must be clean enough to render directly in a reading view.
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
    content: `## Why this ${type === 'news' ? 'update' : 'guide'} matters\n\nThis demo-mode ${type} item is generated locally because no Gemini API key is configured. It mirrors the Markdown structure the AI autopilot will produce in production with short paragraphs and scannable sections.\n\n### Quick context\n\nStudents can use this item as a focused reading prompt before a study sprint. The goal is to turn reading into action instead of passive scrolling.\n\n## What to do next\n\n### Student action plan\n\n- **Focus:** Turn the idea into one concrete study action today.\n- **Review:** Summarize the lesson in three bullet points.\n- **Apply:** Use a 25-minute sprint to practice the skill.\n\n## Key Takeaways\n\n- Small daily reading habits compound into better exam confidence.\n- Separate news alerts from deeper blog guides to keep your learning workflow clear.`,
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
  const validPosts = posts.filter((post) => post && (post.type === 'news' || post.type === 'blog') && post.title && post.content);
  return [
    ...validPosts.filter((post) => post.type === 'news').slice(0, 10),
    ...validPosts.filter((post) => post.type === 'blog').slice(0, 10),
  ];
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
    excerpt: post.excerpt || post.content.replace(/<[^>]+>/g, ' ').replace(/[#*_`>-]/g, ' ').slice(0, 180),
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
