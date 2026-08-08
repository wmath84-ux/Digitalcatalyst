import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_COURSE_DOC_TYPES,
  buildCoursePromptContext,
  buildStarterPrompts,
  collectCourseKnowledgeItems,
  stripHtmlToPlainText,
} from '../utils/aiCourseContext.js';

const courseTree = [
  {
    id: 'm1',
    title: 'Physics Basics',
    files: [
      {
        id: 'f-docs',
        name: 'Motion Notes',
        type: 'doc',
        docPages: [
          { id: 'p1', title: 'Intro', content: '<h1>Laws of Motion</h1><p>Newton gave <b>three</b> laws of motion.</p>' },
          { id: 'p2', title: 'Inertia', content: '<p>Inertia is the tendency of a body to resist change.</p>' },
        ],
      },
      { id: 'f-video', name: 'Lecture Video', type: 'video', url: 'https://youtu.be/x' },
    ],
    modules: [
      {
        id: 'm1a',
        title: 'Practice',
        files: [
          {
            id: 'f-quiz',
            name: 'Motion Quiz',
            type: 'quiz',
            quiz: {
              questions: [
                { prompt: 'What is inertia?', options: ['A force', 'Resistance to change', 'Energy'], correctAnswer: 1 },
                { prompt: 'SI unit of force?', options: ['Newton', 'Joule'], correctAnswer: 0 },
              ],
            },
          },
        ],
        modules: [],
      },
    ],
  },
];

test('stripHtmlToPlainText removes tags and keeps readable text', () => {
  const text = stripHtmlToPlainText('<h1>Title</h1><p>Hello <b>world</b> &amp; friends</p>');
  assert.ok(text.includes('Title'));
  assert.ok(text.includes('Hello world & friends'));
  assert.ok(!text.includes('<b>'));
});

test('collectCourseKnowledgeItems walks nested modules and keeps only text-carrying docs/quiz files', () => {
  const items = collectCourseKnowledgeItems(courseTree);
  assert.equal(items.length, 2);
  const docsItem = items.find(item => item.fileId === 'f-docs');
  const quizItem = items.find(item => item.fileId === 'f-quiz');
  assert.ok(docsItem, 'docs item missing');
  assert.ok(quizItem, 'quiz item missing');
  assert.equal(docsItem.kind, 'docs');
  assert.equal(quizItem.kind, 'quiz');
  assert.equal(quizItem.modulePath, 'Physics Basics › Practice');
  assert.ok(docsItem.text.includes('Laws of Motion'));
  assert.ok(docsItem.text.includes('Inertia'));
  assert.ok(quizItem.text.includes('What is inertia?'));
  assert.ok(quizItem.text.includes('Correct: Resistance to change'));
  assert.ok(items.every(item => AI_COURSE_DOC_TYPES.includes(item.fileType) || item.fileType === 'quiz'));
  assert.ok(!items.some(item => item.fileId === 'f-video'), 'non-text files must be excluded');
});

test('buildCoursePromptContext includes every text module and can scope to one module only', () => {
  const items = collectCourseKnowledgeItems(courseTree);
  const full = buildCoursePromptContext(items);
  assert.ok(full.includes('Physics Basics / Motion Notes'));
  assert.ok(full.includes('Motion Quiz'));
  assert.ok(full.includes('Laws of Motion'));

  const scoped = buildCoursePromptContext(items, { scopeFileId: 'f-quiz' });
  assert.ok(scoped.includes('Motion Quiz'));
  assert.ok(!scoped.includes('Laws of Motion'), 'scoped context must not leak other modules');
});

test('buildCoursePromptContext enforces the total character budget', () => {
  const big = [{
    fileId: 'big', fileName: 'Big Doc', fileType: 'doc', kind: 'docs',
    modulePath: 'M', hasText: true, text: 'x'.repeat(5000),
  }];
  const context = buildCoursePromptContext(big, { maxTotalChars: 1200, maxFileChars: 4000 });
  assert.ok(context.length < 1300, `context too large: ${context.length}`);
});

test('buildStarterPrompts derives prompts from real course text and quiz questions', () => {
  const items = collectCourseKnowledgeItems(courseTree);
  const prompts = buildStarterPrompts(items, 10);
  assert.equal(prompts.length, 10);
  assert.ok(prompts.some(p => p.includes('What is inertia?')), 'quiz-derived prompt missing');
  assert.ok(prompts.some(p => p.toLowerCase().includes('tough')), 'tough prompt missing');
  const unique = new Set(prompts.map(p => p.toLowerCase()));
  assert.equal(unique.size, prompts.length, 'prompts must be unique');
});

test('buildStarterPrompts still returns 10 prompts for an empty course', () => {
  const prompts = buildStarterPrompts([], 10);
  assert.equal(prompts.length, 10);
});
