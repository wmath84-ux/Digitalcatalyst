/**
 * Course AI Mentor context engine.
 *
 * Builds a plain-text knowledge base from the course tree (doc pages,
 * quizzes, ebooks — anything that carries readable text) so the AI mentor
 * can (a) ground its answers in the actual course material, (b) restrict
 * itself to a single module when the learner asks, and (c) pre-generate
 * study prompts from real course text.
 *
 * Pure logic only — safe to import in Node for unit tests.
 */

export const AI_COURSE_DOC_TYPES = ['doc', 'docs', 'ebook', 'pdf', 'sheet', 'text', 'notes'];
export const AI_COURSE_KNOWLEDGE_TYPES = [...AI_COURSE_DOC_TYPES, 'quiz'];

const DEFAULT_MAX_FILE_CHARS = 6000;
const DEFAULT_MAX_TOTAL_CHARS = 24000;
const DEFAULT_MAX_SCOPED_CHARS = 20000;
const MIN_TEXT_LENGTH = 12;

const decodeEntities = (value) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

/** Strip HTML down to readable text without needing a DOM. */
export const stripHtmlToPlainText = (html) => {
  if (!html || typeof html !== 'string') return '';
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|section|article|blockquote|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ');
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const clipText = (text, maxChars) => {
  const clean = String(text || '').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).trimEnd()}…`;
};

const quizToText = (quiz) => {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  return questions.map((question, index) => {
    const options = Array.isArray(question?.options) ? question.options : [];
    const optionLines = options
      .map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}) ${String(option || '').trim()}`)
      .filter(line => line.length > 3)
      .join(' | ');
    const correct = options[question?.correctAnswer] ? ` Correct: ${String(options[question.correctAnswer]).trim()}` : '';
    return `Q${index + 1}: ${String(question?.prompt || '').trim()}${optionLines ? ` Options: ${optionLines}.` : ''}${correct}`;
  }).filter(line => !/^Q\d+: $/.test(line)).join('\n');
};

const docsToText = (file) => {
  const parts = [];
  const pages = Array.isArray(file?.docPages) ? file.docPages : [];
  pages.forEach(page => {
    const text = stripHtmlToPlainText(page?.content || '');
    if (text) parts.push(`## ${String(page?.title || 'Page').trim()}\n${text}`);
  });
  const legacy = stripHtmlToPlainText(file?.content || '');
  if (legacy && !(parts.length > 0 && parts[0].includes(legacy.slice(0, 80)))) {
    parts.push(legacy);
  }
  return parts.join('\n\n').trim();
};

/** Walk the course tree and collect every file that carries readable text. */
export const collectCourseKnowledgeItems = (modules, parentPath = []) => {
  const items = [];
  const walk = (mod, trail) => {
    if (!mod || typeof mod !== 'object') return;
    const title = String(mod.title || mod.name || 'Module').trim() || 'Module';
    const nextTrail = [...trail, title];
    const files = Array.isArray(mod.files) ? mod.files : [];
    files.forEach(file => {
      if (!file || typeof file !== 'object') return;
      const type = String(file.type || '').toLowerCase();
      if (!AI_COURSE_KNOWLEDGE_TYPES.includes(type)) return;
      const text = type === 'quiz' ? quizToText(file.quiz) : docsToText(file);
      items.push({
        fileId: String(file.id || ''),
        fileName: String(file.name || file.title || 'Untitled').trim() || 'Untitled',
        fileType: type,
        kind: type === 'quiz' ? 'quiz' : 'docs',
        modulePath: nextTrail.join(' › '),
        text,
        hasText: text.length >= MIN_TEXT_LENGTH,
      });
    });
    (Array.isArray(mod.modules) ? mod.modules : []).forEach(child => walk(child, nextTrail));
  };
  (Array.isArray(modules) ? modules : []).forEach(mod => walk(mod, parentPath));
  return items;
};

/**
 * Build the reference block injected into the AI system prompt.
 * When scopeFileId is provided ONLY that module's text is returned.
 */
export const buildCoursePromptContext = (items, options = {}) => {
  const list = Array.isArray(items) ? items : [];
  const scopeFileId = options.scopeFileId ? String(options.scopeFileId) : '';
  const maxTotalChars = Math.max(1000, Number(options.maxTotalChars) || (scopeFileId ? DEFAULT_MAX_SCOPED_CHARS : DEFAULT_MAX_TOTAL_CHARS));
  const maxFileChars = Math.max(500, Number(options.maxFileChars) || DEFAULT_MAX_FILE_CHARS);

  const source = scopeFileId ? list.filter(item => item.fileId === scopeFileId) : list;
  const withText = source.filter(item => item.hasText);
  const sections = [];
  let used = 0;

  for (const item of withText) {
    const room = Math.min(maxFileChars, maxTotalChars - used);
    if (room <= 0) break;
    const body = clipText(item.text, room);
    used += body.length;
    sections.push(`### ${item.modulePath} / ${item.fileName} (${item.kind})\n${body}`);
  }

  if (!sections.length) {
    const names = source.map(item => `- ${item.modulePath} / ${item.fileName} (${item.kind})`).join('\n');
    return names ? `Course modules available (names only, text not embedded):\n${names}` : '';
  }

  const omitted = withText.length - sections.length;
  return sections.join('\n\n') + (omitted > 0 ? `\n\n(Plus ${omitted} more text module(s) not shown for brevity.)` : '');
};

const firstMeaningfulLine = (text, minLength = 12, maxLength = 90) => {
  const lines = String(text || '').split('\n').map(line => line.replace(/^#+\s*/, '').trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < minLength || line.length > maxLength) continue;
    if (/^(page|untitled|chapter)\s*\d*$/i.test(line)) continue;
    if (line.startsWith('Q')) continue;
    return line;
  }
  return '';
};

const extractTopics = (items) => {
  const topics = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item.hasText) continue;
    if (item.kind === 'docs') {
      const headings = String(item.text).split('\n')
        .map(line => line.replace(/^#+\s*/, '').trim())
        .filter(line => line.length >= 8 && line.length <= 80 && !line.startsWith('Q'))
        .slice(0, 3);
      headings.forEach(heading => topics.push({ type: 'topic', value: heading }));
      continue;
    }
    // Only the question stem — never the options/answer — goes into a chip.
    const question = (item.text.match(/Q\d+:\s*([^\n]+?)(?:\s+Options:|$)/) || [])[1];
    if (question && question.trim().length >= 10) topics.push({ type: 'question', value: question.trim().slice(0, 120) });
    const brief = firstMeaningfulLine(item.text);
    if (brief) topics.push({ type: 'module', value: item.fileName });
  }
  return topics;
};

/** Deterministic starter prompts derived from REAL course text. */
export const buildStarterPrompts = (items, count = 10) => {
  const topics = extractTopics(items);
  const prompts = [];
  const seen = new Set();
  const push = (text) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    prompts.push(clean);
  };

  topics.filter(t => t.type === 'question').slice(0, 3)
    .forEach(t => push(`Tough question: ${t.value} — iska step-by-step answer samjhao`));
  topics.filter(t => t.type === 'topic').slice(0, 4)
    .forEach((t, index) => {
      if (index % 2 === 0) push(`"${t.value}" ko simple shabdon me samjhao`);
      else push(`"${t.value}" ke sabse important points do`);
    });
  topics.filter(t => t.type === 'topic').slice(0, 2)
    .forEach(t => push(`"${t.value}" par 5 tough practice questions banao (answers ke saath)`));
  topics.filter(t => t.type === 'module').slice(0, 2)
    .forEach(t => push(`Module "${t.value}" ka poora summary banao`));

  const fallbackPrompts = [
    'Is course ka study plan banao — 7 din ka',
    'Jo abhi padh raha hoon uska quick revision do',
    'Is topic ke sabse confusing points clear karo',
    'Mujhse 5 rapid-fire questions pucho aur mera level test karo',
    'Important formulas/definitions ek table me do',
    'Ek real-life example se samjhao jo abhi padha',
    'Exam ke liye most important 5 questions batao is course se',
    'Is module ko 5 bullet points me summarize karo',
    'Is topic ka ek tricky doubt common students ko aata hai — clear karo',
    'Jo padha hai use apni words me test karne ke liye 3 fill-in-the-blanks do',
  ];
  for (const prompt of fallbackPrompts) {
    if (prompts.length >= count) break;
    push(prompt);
  }

  return prompts.slice(0, count);
};
