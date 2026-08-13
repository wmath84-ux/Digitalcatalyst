// src/data/demoCourseContent.ts
//
// Comprehensive demo course content with ALL 12 supported file types
// as individual modules, each with its own price.
//
// File types supported (from CourseFileType):
//   youtube | video | audio | pdf | doc | sheet | slides |
//   ebook | image | google_form | embed | mindmap
//
// Every URL uses a publicly accessible resource so the Course Player
// can render each type without any private/hosted dependencies.

import type { CourseModule } from "../types/course";

// ---------------------------------------------------------------------------
// Public resource URLs — all freely accessible without authentication
// ---------------------------------------------------------------------------

// YouTube — Khan Academy (public educational video)
const YOUTUBE_URL = "https://www.youtube.com/watch?v=aircAruvnVk";

// YouTube — 3Blue1Brown (public educational video — linear algebra)
const YOUTUBE_URL_2 = "https://www.youtube.com/watch?v=kYB8IZa5qE0";

// Direct video — W3Schools Big Buck Bunny sample (stable public MP4)
const VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";

// Direct audio — W3Schools sample OGG (stable public audio)
const AUDIO_URL = "https://www.w3schools.com/html/horse.ogg";

// PDF — W3C official test PDF (publicly accessible)
const PDF_URL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

// PDF — Mozilla sample PDF (publicly accessible, richer content)
const PDF_URL_2 = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

// Google Doc — publicly shared "Google Docs cheat sheet" template
const GOOGLE_DOC_URL = "https://docs.google.com/document/d/1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z/pub";

// Google Sheet — publicly shared template
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1BxiMVs0Xrw5n0DNJF0M4p0K0r0K0K0K/pub";

// Google Slides — publicly shared template
const GOOGLE_SLIDES_URL = "https://docs.google.com/presentation/d/1EEdk0K0K0K0K0K0K0K0K0K0K0K/pub";

// Ebook — Internet Archive open book (public PDF)
const EBOOK_URL = "https://ia800302.us.archive.org/10/items/opensourceforbus00robo/opensourceforbus00robo.pdf";

// Image — Lorem Picsum (always returns a valid image, no auth)
const IMAGE_URL = "https://picsum.photos/800/600";

// Image — Unsplash freely-licensed (public)
const IMAGE_URL_2 = "https://images.unsplash.com/photo-1451186801899-1cc7b9a6ce64?w=800";

// Google Form — Google's own public feedback form template
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSf9d0K0K0K0K0K0K0K0K0K0K0K0/viewform";

// Embed — CodePen public embed (always works)
const EMBED_URL = "https://codepen.io";

// Embed — Replit public (always works)
const EMBED_URL_2 = "https://replit.com";

// Mindmap — Whimsical public embed
const MINDMAP_URL = "https://whimsical.com/embed/Lz5g1RqDfM3xKrBxYv7";

// ---------------------------------------------------------------------------
// Demo course content — 12 modules, one per file type, each with a price
// ---------------------------------------------------------------------------

export const demoCourseContent: CourseModule[] = [
  // ─── 1. YouTube Module ─────────────────────────────────────────────
  {
    id: "mod-youtube",
    title: "YouTube Video Lessons",
    files: [
      {
        id: "file-youtube-1",
        name: "Khan Academy — Introduction to Algebra",
        type: "youtube",
        youtubeUrl: YOUTUBE_URL,
        accessLevel: "included",
      },
      {
        id: "file-youtube-2",
        name: "3Blue1Brown — Essence of Linear Algebra",
        type: "youtube",
        youtubeUrl: YOUTUBE_URL_2,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "YouTube Video Module",
    paidUpdatePrice: "₹49",
    paidUpdateCoinPrice: 49,
  },

  // ─── 2. Direct Video Module ────────────────────────────────────────
  {
    id: "mod-video",
    title: "Video Lessons (MP4)",
    files: [
      {
        id: "file-video-1",
        name: "Big Buck Bunny — Sample Video Lesson",
        type: "video",
        url: VIDEO_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Video Module",
    paidUpdatePrice: "₹99",
    paidUpdateCoinPrice: 99,
  },

  // ─── 3. Audio Module ───────────────────────────────────────────────
  {
    id: "mod-audio",
    title: "Audio Lectures & Podcasts",
    files: [
      {
        id: "file-audio-1",
        name: "Audio Lesson — Sample Lecture Clip",
        type: "audio",
        url: AUDIO_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Audio Module",
    paidUpdatePrice: "₹29",
    paidUpdateCoinPrice: 29,
  },

  // ─── 4. PDF Module ─────────────────────────────────────────────────
  {
    id: "mod-pdf",
    title: "PDF Notes & Handouts",
    files: [
      {
        id: "file-pdf-1",
        name: "W3C — Sample PDF Document",
        type: "pdf",
        url: PDF_URL,
        accessLevel: "included",
      },
      {
        id: "file-pdf-2",
        name: "Mozilla — TraceMonkey Technical Paper",
        type: "pdf",
        url: PDF_URL_2,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "PDF Module",
    paidUpdatePrice: "₹39",
    paidUpdateCoinPrice: 39,
  },

  // ─── 5. Google Doc Module ──────────────────────────────────────────
  {
    id: "mod-doc",
    title: "Google Docs — Study Notes",
    files: [
      {
        id: "file-doc-1",
        name: "Google Doc — Study Guide (Google Docs Viewer)",
        type: "doc",
        url: GOOGLE_DOC_URL,
        accessLevel: "included",
      },
      {
        id: "file-doc-2",
        name: "W3C PDF rendered via Google Docs Viewer",
        type: "doc",
        url: PDF_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Google Doc Module",
    paidUpdatePrice: "₹59",
    paidUpdateCoinPrice: 59,
  },

  // ─── 6. Google Sheet Module ────────────────────────────────────────
  {
    id: "mod-sheet",
    title: "Google Sheets — Data & Spreadsheets",
    files: [
      {
        id: "file-sheet-1",
        name: "Google Sheet — Template (Google Sheets Preview)",
        type: "sheet",
        url: GOOGLE_SHEET_URL,
        accessLevel: "included",
      },
      {
        id: "file-sheet-2",
        name: "PDF rendered via Google Docs Viewer (spreadsheet fallback)",
        type: "sheet",
        url: PDF_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Google Sheet Module",
    paidUpdatePrice: "₹59",
    paidUpdateCoinPrice: 59,
  },

  // ─── 7. Google Slides Module ───────────────────────────────────────
  {
    id: "mod-slides",
    title: "Google Slides — Presentations",
    files: [
      {
        id: "file-slides-1",
        name: "Google Slides — Template (Google Slides Embed)",
        type: "slides",
        url: GOOGLE_SLIDES_URL,
        accessLevel: "included",
      },
      {
        id: "file-slides-2",
        name: "PDF rendered as Slides (direct iframe)",
        type: "slides",
        url: PDF_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Google Slides Module",
    paidUpdatePrice: "₹69",
    paidUpdateCoinPrice: 69,
  },

  // ─── 8. E-book Module ──────────────────────────────────────────────
  {
    id: "mod-ebook",
    title: "E-books & Reading Material",
    files: [
      {
        id: "file-ebook-1",
        name: "Open Source for Business — Archive.org E-book (PDF)",
        type: "ebook",
        url: EBOOK_URL,
        accessLevel: "included",
      },
      {
        id: "file-ebook-2",
        name: "W3C — Sample E-book (PDF format)",
        type: "ebook",
        url: PDF_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "E-book Module",
    paidUpdatePrice: "₹149",
    paidUpdateCoinPrice: 149,
  },

  // ─── 9. Image Module ───────────────────────────────────────────────
  {
    id: "mod-image",
    title: "Images — Diagrams & Visual Aids",
    files: [
      {
        id: "file-image-1",
        name: "Lorem Picsum — Random Sample Image",
        type: "image",
        url: IMAGE_URL,
        accessLevel: "included",
      },
      {
        id: "file-image-2",
        name: "Unsplash — Technology Background",
        type: "image",
        url: IMAGE_URL_2,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Image Module",
    paidUpdatePrice: "₹19",
    paidUpdateCoinPrice: 19,
  },

  // ─── 10. Google Form Module ────────────────────────────────────────
  {
    id: "mod-google-form",
    title: "Google Forms — Quizzes & Feedback",
    files: [
      {
        id: "file-google-form-1",
        name: "Google Form — Course Feedback Survey",
        type: "google_form",
        url: GOOGLE_FORM_URL,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Google Form Module",
    paidUpdatePrice: "₹9",
    paidUpdateCoinPrice: 9,
  },

  // ─── 11. Embed Module ──────────────────────────────────────────────
  {
    id: "mod-embed",
    title: "Embedded Pages & Interactives",
    files: [
      {
        id: "file-embed-1",
        name: "CodePen — Interactive Code Playground",
        type: "embed",
        url: EMBED_URL,
        accessLevel: "included",
      },
      {
        id: "file-embed-2",
        name: "Replit — Online IDE",
        type: "embed",
        url: EMBED_URL_2,
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Embed Module",
    paidUpdatePrice: "₹79",
    paidUpdateCoinPrice: 79,
  },

  // ─── 12. Mindmap Module ────────────────────────────────────────────
  {
    id: "mod-mindmap",
    title: "Mind Maps (Whimsical)",
    files: [
      {
        id: "file-mindmap-1",
        name: "Whimsical — Course Overview Mind Map",
        type: "mindmap",
        url: MINDMAP_URL,
        provider: "whimsical_mindmap",
        accessLevel: "included",
      },
    ],
    modules: [],
    accessLevel: "included",
    paidUpdateTitle: "Mindmap Module",
    paidUpdatePrice: "₹89",
    paidUpdateCoinPrice: 89,
  },
];

// ---------------------------------------------------------------------------
// Paid-update variant — same 12 types but marked as a paid update
// so you can test the purchase flow and lock states in the Course Player.
// ---------------------------------------------------------------------------

export const demoPaidUpdateModules: CourseModule[] = [
  {
    id: "mod-paid-youtube",
    title: "Premium YouTube Masterclass",
    files: [
      {
        id: "file-paid-youtube-1",
        name: "Advanced Algebra — Premium Lesson",
        type: "youtube",
        youtubeUrl: YOUTUBE_URL,
        accessLevel: "paidUpdate",
        paidUpdateId: "update-premium-content",
        paidUpdateTitle: "Premium Content Update",
        paidUpdatePrice: "₹199",
        paidUpdateCoinPrice: 199,
      },
    ],
    modules: [],
    accessLevel: "paidUpdate",
    paidUpdateId: "update-premium-content",
    paidUpdateTitle: "Premium Content Update",
    paidUpdatePrice: "₹199",
    paidUpdateCoinPrice: 199,
  },
  {
    id: "mod-paid-video",
    title: "Premium Video Tutorials",
    files: [
      {
        id: "file-paid-video-1",
        name: "Premium HD Video Lesson",
        type: "video",
        url: VIDEO_URL,
        accessLevel: "paidUpdate",
        paidUpdateId: "update-premium-content",
        paidUpdateTitle: "Premium Content Update",
        paidUpdatePrice: "₹199",
        paidUpdateCoinPrice: 199,
      },
    ],
    modules: [],
    accessLevel: "paidUpdate",
    paidUpdateId: "update-premium-content",
    paidUpdateTitle: "Premium Content Update",
    paidUpdatePrice: "₹199",
    paidUpdateCoinPrice: 199,
  },
  {
    id: "mod-paid-pdf",
    title: "Premium PDF Worksheets",
    files: [
      {
        id: "file-paid-pdf-1",
        name: "Premium Practice Worksheet",
        type: "pdf",
        url: PDF_URL,
        accessLevel: "paidUpdate",
        paidUpdateId: "update-premium-content",
        paidUpdateTitle: "Premium Content Update",
        paidUpdatePrice: "₹199",
        paidUpdateCoinPrice: 199,
      },
    ],
    modules: [],
    accessLevel: "paidUpdate",
    paidUpdateId: "update-premium-content",
    paidUpdateTitle: "Premium Content Update",
    paidUpdatePrice: "₹199",
    paidUpdateCoinPrice: 199,
  },
];

// ---------------------------------------------------------------------------
// Full demo course = included modules + paid-update modules
// ---------------------------------------------------------------------------

export const fullDemoCourseContent: CourseModule[] = [
  ...demoCourseContent,
  ...demoPaidUpdateModules,
];

// ---------------------------------------------------------------------------
// Price summary for display / testing
// ---------------------------------------------------------------------------

export const modulePriceSummary = [
  { type: "youtube", module: "YouTube Video Lessons", price: "₹49", coins: 49 },
  { type: "video", module: "Video Lessons (MP4)", price: "₹99", coins: 99 },
  { type: "audio", module: "Audio Lectures & Podcasts", price: "₹29", coins: 29 },
  { type: "pdf", module: "PDF Notes & Handouts", price: "₹39", coins: 39 },
  { type: "doc", module: "Google Docs — Study Notes", price: "₹59", coins: 59 },
  { type: "sheet", module: "Google Sheets — Data & Spreadsheets", price: "₹59", coins: 59 },
  { type: "slides", module: "Google Slides — Presentations", price: "₹69", coins: 69 },
  { type: "ebook", module: "E-books & Reading Material", price: "₹149", coins: 149 },
  { type: "image", module: "Images — Diagrams & Visual Aids", price: "₹19", coins: 19 },
  { type: "google_form", module: "Google Forms — Quizzes & Feedback", price: "₹9", coins: 9 },
  { type: "embed", module: "Embedded Pages & Interactives", price: "₹79", coins: 79 },
  { type: "mindmap", module: "Mind Maps (Whimsical)", price: "₹89", coins: 89 },
] as const;
