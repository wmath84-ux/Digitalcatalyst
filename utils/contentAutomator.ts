import { GoogleGenAI, Type } from '@google/genai';
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
  coverImage: string;
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
  imagePrompt?: string;
  thumbnailImage?: string;
  coverImage?: string;
}

export interface ContentGenerationCounts {
  newsCount: number;
  blogCount: number;
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

export interface ContentAutomationOptions<TPost extends ContentPostRecord = ContentPostRecord> {
  now?: Date;
  idFactory?: () => TPost['id'];
  newsCount?: number;
  blogCount?: number;
}

const THREE_DAYS_IN_MS = 72 * 60 * 60 * 1000;
const MAX_ITEMS_PER_TYPE = 10;
const GENERATION_BATCH_SIZE = 2;
const DEFAULT_GENERATION_COUNTS: ContentGenerationCounts = { newsCount: 3, blogCount: 3 };

const clampGenerationCount = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_ITEMS_PER_TYPE, Math.max(0, Math.round(numeric)));
};

export const normalizeContentGenerationCounts = (counts: Partial<ContentGenerationCounts> = {}): ContentGenerationCounts => ({
  newsCount: clampGenerationCount(counts.newsCount, DEFAULT_GENERATION_COUNTS.newsCount),
  blogCount: clampGenerationCount(counts.blogCount, DEFAULT_GENERATION_COUNTS.blogCount),
});

const typeLabel = (type: ContentPostType) => type === 'news' ? 'news update' : 'blog guide';

const buildContentPrompt = (type: ContentPostType, count: number) => `
You are the editorial AI for Eduvora, a premium student learning platform.
Generate exactly ${count} original ${type === 'news' ? 'student news updates' : 'student-focused educational blog guides'}.

CONTENT MODE:
- Every item must use type "${type}".
- ${type === 'news'
    ? 'Write timely alert-style explainers about education trends, exams, scholarships, policies, student technology, or employability. Do not invent a specific breaking event, official deadline, statistic, or citation.'
    : 'Write evergreen how-to guides about study systems, revision, career readiness, digital skills, side projects, or deep learning strategies.'}
- Keep titles distinct from one another and useful to students.
- Use a short category label and a two-sentence card excerpt.
- Write ${type === 'news' ? '280-420' : '500-700'} words per item.

MARKDOWN RULES FOR content:
- Markdown only, never HTML.
- At least two ## headings.
- At least two ### subheadings.
- At least one - bullet list.
- Short readable paragraphs.
- End with ## Key Takeaways and bullets.
- No fake citations, no raw JSON examples, and no markdown code fences.

IMAGE DIRECTION:
- imagePrompt must be a concise English visual concept for this exact title and category.
- Describe a clean 16:9 education editorial illustration with no logos, no written text, no watermark, and no realistic noisy stock-photo look.
- News visuals should feel current and alert-oriented; blog visuals should feel calm, practical, and tutorial-oriented.

Return only the schema-compliant JSON response.
`;

const buildContentResponseSchema = (type: ContentPostType) => ({
  type: Type.OBJECT,
  properties: {
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Distinct headline under 90 characters.' },
          type: { type: Type.STRING, enum: [type], description: `Must be ${type}.` },
          category: { type: Type.STRING, description: 'Short category label.' },
          excerpt: { type: Type.STRING, description: 'Two-sentence card summary.' },
          imagePrompt: { type: Type.STRING, description: 'Topic-specific 16:9 editorial illustration prompt. No URL and no written text in the image.' },
          content: { type: Type.STRING, description: 'Complete Markdown article following the requested headings, lists, short paragraphs, and Key Takeaways section.' },
        },
        required: ['title', 'type', 'category', 'excerpt', 'imagePrompt', 'content'],
      },
    },
  },
  required: ['posts'],
});

const stripJsonFence = (raw: string) => raw
  .trim()
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/i, '')
  .replace(/```\s*$/i, '')
  .trim();

const escapeRawControlCharactersInsideJsonStrings = (value: string) => {
  let output = '';
  let insideString = false;
  let escaped = false;

  for (const character of value) {
    if (!insideString) {
      output += character;
      if (character === '"') insideString = true;
      continue;
    }

    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      output += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      output += character;
      insideString = false;
      continue;
    }

    if (character === '\n') {
      output += '\\n';
      continue;
    }
    if (character === '\r') {
      output += '\\r';
      continue;
    }
    if (character === '\t') {
      output += '\\t';
      continue;
    }

    const codePoint = character.charCodeAt(0);
    output += codePoint < 0x20 ? ' ' : character;
  }

  return output;
};

const safeJsonParse = (raw: string): { posts?: unknown[] } => {
  const trimmed = stripJsonFence(raw);
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  const jsonSlice = firstBrace >= 0 && lastBrace >= firstBrace
    ? trimmed.slice(firstBrace, lastBrace + 1)
    : trimmed;

  try {
    return JSON.parse(jsonSlice);
  } catch (firstError) {
    try {
      return JSON.parse(escapeRawControlCharactersInsideJsonStrings(jsonSlice));
    } catch {
      const reason = firstError instanceof Error ? firstError.message : 'Unknown JSON parser error';
      throw new Error(`Gemini returned malformed JSON: ${reason}`);
    }
  }
};

const normalizeGeneratedPost = (raw: unknown, expectedType: ContentPostType): GeneratedContentPost | null => {
  if (!raw || typeof raw !== 'object') return null;
  const post = raw as Record<string, unknown>;
  const title = String(post.title || '').trim().replace(/\s+/g, ' ');
  const category = String(post.category || '').trim().replace(/\s+/g, ' ');
  const excerpt = String(post.excerpt || '').trim().replace(/\s+/g, ' ');
  const content = String(post.content || '').trim();
  const imagePrompt = String(post.imagePrompt || '').trim().replace(/\s+/g, ' ');

  if (post.type !== expectedType || title.length < 10 || content.length < 700) return null;
  if (!content.includes('## ') || !content.includes('### ') || !content.includes('- ') || !/##\s+Key Takeaways/i.test(content)) return null;

  return {
    title: title.slice(0, 100),
    type: expectedType,
    category: (category || (expectedType === 'news' ? 'Education News' : 'Student Success')).slice(0, 60),
    excerpt: (excerpt || content.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)).slice(0, 300),
    imagePrompt: imagePrompt.slice(0, 420),
    content,
  };
};

const stableImageSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const premiumImagePromptForPost = (post: Pick<GeneratedContentPost, 'title' | 'type' | 'category' | 'imagePrompt'>) => {
  const topic = `${post.category || (post.type === 'news' ? 'Student News' : 'Study Blog')} ${post.title || ''}`.trim();
  const typeDirection = post.type === 'news'
    ? 'current student education alert, clean editorial newsroom energy, exam scholarship technology symbols'
    : 'calm student study desk, practical learning roadmap, notebooks course progress and skill building symbols';
  return [
    'premium Eduvora education editorial illustration',
    topic,
    post.imagePrompt || typeDirection,
    typeDirection,
    'soft white and ice blue background',
    'deep navy and royal blue accents',
    'subtle violet gradient',
    'clean modern vector illustration',
    'spacious balanced composition',
    'no letters',
    'no words',
    'no logo',
    'no watermark',
    'no realistic noisy stock photo',
    '16:9',
  ].filter(Boolean).join(', ').slice(0, 900);
};

export const buildContextualCoverImage = (post: Pick<GeneratedContentPost, 'title' | 'type' | 'category' | 'imagePrompt'>, index = 0) => {
  const prompt = premiumImagePromptForPost(post);
  const seed = stableImageSeed(`${post.type}:${post.category}:${post.title}:${index}`);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=675&nologo=true&enhance=true&model=flux&seed=${seed}`;
};

const fallbackGeneratedPosts = (counts: ContentGenerationCounts): GeneratedContentPost[] => {
  const nowLabel = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const buildPost = (index: number, type: ContentPostType): GeneratedContentPost => ({
    title: `${type === 'news' ? 'Student Learning Update' : 'Study Strategy Brief'} ${index + 1}`,
    type,
    category: type === 'news' ? 'Education News' : 'Student Success',
    excerpt: `A premium ${type} briefing for ${nowLabel} with practical takeaways for focused learners.`,
    imagePrompt: type === 'news'
      ? 'student education update dashboard with exam calendar scholarship bell and laptop icons'
      : 'organized student study desk with notebook learning roadmap and progress icons',
    content: `## Why this ${type === 'news' ? 'update' : 'guide'} matters\n\nThis demo-mode ${type} item is generated locally because no Gemini API key is configured. It mirrors the Markdown structure the AI autopilot will produce in production with short paragraphs and scannable sections.\n\n### Quick context\n\nStudents can use this item as a focused reading prompt before a study sprint. The goal is to turn reading into action instead of passive scrolling.\n\n## What to do next\n\n### Student action plan\n\n- **Focus:** Turn the idea into one concrete study action today.\n- **Review:** Summarize the lesson in three bullet points.\n- **Apply:** Use a 25-minute sprint to practice the skill.\n\n## Key Takeaways\n\n- Small daily reading habits compound into better exam confidence.\n- Separate news alerts from deeper blog guides to keep your learning workflow clear.`,
  });

  return [
    ...Array.from({ length: counts.newsCount }, (_, index) => buildPost(index, 'news')),
    ...Array.from({ length: counts.blogCount }, (_, index) => buildPost(index, 'blog')),
  ];
};

const generateContentBatch = async (
  ai: GoogleGenAI,
  type: ContentPostType,
  count: number,
): Promise<GeneratedContentPost[]> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: buildContentPrompt(type, count),
        config: {
          responseMimeType: 'application/json',
          responseSchema: buildContentResponseSchema(type),
          maxOutputTokens: 8192,
          temperature: 0.65,
        },
      });

      const finishReason = String(response.candidates?.[0]?.finishReason || '');
      if (/MAX_TOKENS|LENGTH/i.test(finishReason)) {
        throw new Error(`Gemini stopped before completing the ${typeLabel(type)} batch.`);
      }

      const parsed = safeJsonParse(response.text || '{}');
      const normalized = Array.isArray(parsed.posts)
        ? parsed.posts.map(item => normalizeGeneratedPost(item, type)).filter((item): item is GeneratedContentPost => Boolean(item))
        : [];

      if (normalized.length !== count) {
        throw new Error(`Gemini returned ${normalized.length} valid ${type} items instead of ${count}.`);
      }

      return normalized;
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : 'Unknown generation error';
  throw new Error(`${reason} The batch was retried and no posts were changed. Try a smaller quantity.`);
};

export const generateEducationalContent = async (
  requestedCounts: Partial<ContentGenerationCounts> = DEFAULT_GENERATION_COUNTS,
): Promise<GeneratedContentPost[]> => {
  const counts = normalizeContentGenerationCounts(requestedCounts);
  const totalRequested = counts.newsCount + counts.blogCount;
  if (totalRequested === 0) return [];

  const apiKey = getGeminiApiKey();
  if (!apiKey) return fallbackGeneratedPosts(counts);

  const ai = new GoogleGenAI({ apiKey });
  const generated: GeneratedContentPost[] = [];

  for (const [type, requestedCount] of [['news', counts.newsCount], ['blog', counts.blogCount]] as const) {
    let remaining = requestedCount;
    while (remaining > 0) {
      const batchCount = Math.min(GENERATION_BATCH_SIZE, remaining);
      generated.push(...await generateContentBatch(ai, type, batchCount));
      remaining -= batchCount;
    }
  }

  return generated;
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
  options: ContentAutomationOptions<TPost> = {},
): Promise<ContentAutomationResult<TPost>> => {
  const now = options.now || new Date();
  const counts = normalizeContentGenerationCounts({ newsCount: options.newsCount, blogCount: options.blogCount });
  const generatedPosts = await generateEducationalContent(counts);
  const purgedIds = await purgeExpiredContent(database, now);

  const hydratedPosts = generatedPosts.map((post, index) => {
    const contextualCoverImage = buildContextualCoverImage(post, index);
    return {
      id: options.idFactory ? options.idFactory() : `${now.getTime()}-${index}`,
      title: post.title,
      content: post.content,
      type: post.type,
      category: post.category || (post.type === 'news' ? 'Education News' : 'Student Success'),
      excerpt: post.excerpt || post.content.replace(/<[^>]+>/g, ' ').replace(/[#*_`>-]/g, ' ').slice(0, 180),
      coverImage: contextualCoverImage,
      thumbnailImage: contextualCoverImage,
      imageSeed: `${post.type}-${now.getTime()}-${index}`,
      date: now.toISOString().split('T')[0],
      createdAt: now.toISOString(),
    };
  }) as TPost[];

  await database.createPosts(hydratedPosts);

  return {
    generated: hydratedPosts,
    purgedIds,
    generatedAt: now.toISOString(),
  };
};

// Cron/Firebase Function integration sketch:
// export const dailyContentAutopilot = onSchedule('every day 06:00', async () => {
//   await runContentAutomation(firestoreContentAdapter, { newsCount: 3, blogCount: 3 });
// });
