// tests/courseNotesDarkModeContract.test.mjs
//
// Contract for the Note Library dark-mode legibility fix:
//
//   1. A saved note card must NOT carry a hardcoded white inline background
//      (that inline style used to override the theme-aware stylesheet rules,
//      leaving white boxes in dark mode).
//   2. The card's surface and its text colour come from the course theme
//      variables, so the preview text stays legible in BOTH themes
//      (dark: light text on a dark card; light: dark text on a white card).
//   3. The empty-state pill is theme-variable based too, never
//      `bg-white/80 text-slate-500`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const notesPanel = fs.readFileSync("src/course/NotesPanel.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");
const resourceCardCss = fs.readFileSync("src/course/study-resource-card.css", "utf8");

test("a saved note card has no hardcoded white inline background", () => {
  // The card <li> used to carry style={{ background: "#ffffff", … }} which
  // beat every stylesheet rule (inline styles always win) — that was the
  // white-box-in-dark-mode bug.
  const card = notesPanel.match(/data-course-note[^>]*>/);
  assert.ok(card, "the saved-note card element exists");
  assert.doesNotMatch(card[0], /background:\s*["']?#(?:fff|ffffff)/i, "no inline white background on the card");
  assert.doesNotMatch(notesPanel, /data-course-note[\s\S]{0,200}?style=\{\{ background: "#ffffff"/);
});

test("the note card surface + text are theme-variable driven", () => {
  // The stylesheet paints the card with the course palette in both themes.
  const darkCard = indexCss.match(/\[data-course-notes-grid\] \[data-course-note\] \{[\s\S]*?\}/);
  assert.ok(darkCard, "the dark note-card rule exists");
  assert.match(darkCard[0], /var\(--course-soft\)/);
  // The card pins the theme text colour so preview text never inherits a
  // clashing shell colour (white text on a white box in dark mode).
  assert.match(darkCard[0], /color:\s*var\(--course-text\)/);
  // Part 1 §6/§23 adds a genuine light palette scoped to the player shell; the
  // note card keeps painting from the course palette tokens in both themes.
  assert.match(indexCss, /\.course-player-shell\[data-course-theme="light"\]/);
});

test("the shared resource-card title and note accents stay readable on the player plate", () => {
  const title = resourceCardCss.match(/\.study-resource-card__title \{[\s\S]*?\}/);
  assert.ok(title, "the shared resource title rule exists");
  assert.match(title[0], /color: #fff/);
  assert.match(title[0], /font-size: clamp\(16px/);
  assert.match(resourceCardCss, /\.study-resource-card--note \{[\s\S]*?--resource-accent: #f5ad42/);
});

test("empty, loading and sync-error states use the shared study-library system", () => {
  assert.match(notesPanel, /StudyLibraryEmptyState/);
  assert.match(notesPanel, /StudyLibraryNotice/);
  assert.match(notesPanel, /StudyResourceCardSkeleton/);
  assert.match(resourceCardCss, /\.study-library-empty \{/);
  assert.match(resourceCardCss, /\.study-library-notice \{/);
  assert.doesNotMatch(notesPanel, /No notes yet/);
  assert.doesNotMatch(notesPanel, /border-\[var\(--course-border\)\]/);
  assert.doesNotMatch(notesPanel, /bg-\[var\(--course-soft\)\]/);
  assert.doesNotMatch(notesPanel, /No notes yet[\s\S]{0,300}?bg-white\/80/);
});
