# Course Player — All 12 File Types Module System

## Overview

Every course in the app now includes a comprehensive demo module system with **all 12 supported file types**, each with its own individual price. The course player can render every type natively without any external dependencies.

---

## Supported File Types & Prices

| # | File Type     | Module Name                          | Price  | Source                          |
|---|--------------|--------------------------------------|--------|---------------------------------|
| 1 | YouTube       | YouTube Video Lessons                | ₹49   | YouTube (public)               |
| 2 | Video (MP4)   | Video Lessons (MP4)                  | ₹99   | W3Schools (public)             |
| 3 | Audio         | Audio Lectures & Podcasts            | ₹29   | W3Schools (public)             |
| 4 | PDF           | PDF Notes & Handouts                 | ₹39   | W3C / Mozilla (public)         |
| 5 | Doc           | Google Docs — Study Notes            | ₹59   | Google Docs Viewer (public)    |
| 6 | Sheet         | Google Sheets — Data & Spreadsheets  | ₹59   | Google Sheets Preview (public) |
| 7 | Slides        | Google Slides — Presentations        | ₹69   | Google Slides Embed (public)   |
| 8 | E-book        | E-books & Reading Material           | ₹149  | Archive.org / W3C (public)     |
| 9 | Image         | Images — Diagrams & Visual Aids      | ₹19   | Picsum / Unsplash (public)     |
|10 | Google Form   | Google Forms — Quizzes & Feedback    | ₹9    | Google Forms (public)          |
|11 | Embed         | Embedded Pages & Interactives        | ₹79   | CodePen / Replit (public)      |
|12 | Mindmap       | Mind Maps (Whimsical)                | ₹89   | Whimsical (public)             |

**Total value: ₹749** (included modules) + **₹199** (premium paid update)

---

## How Each File Type Works in the Course Player

### 1. YouTube (`type: "youtube"`)
- **Embed URL**: `https://www.youtube-nocookie.com/embed/{videoId}?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1`
- **Source**: Any public YouTube video URL or 11-character video ID
- **Viewer**: Sandboxed, full-height iframe with native controls. The iframe is strictly contained between the side rails, so it cannot extend below the short mobile-landscape viewport; the available height also keeps YouTube's settings/quality menu visible and easy to dismiss.
- **Demo URLs**: Khan Academy, 3Blue1Brown educational videos

### 2. Video (`type: "video"`)
- **Embed URL**: Direct URL to MP4/WebM file
- **Viewer**: Native `<video>` element with controls, playsInline
- **Demo URL**: W3Schools Big Buck Bunny sample MP4

### 3. Audio (`type: "audio"`)
- **Embed URL**: Direct URL to OGG/MP3 file
- **Viewer**: Native `<audio>` element with controls, centered layout
- **Demo URL**: W3Schools horse sound OGG

### 4. PDF (`type: "pdf"`)
- **Embed URL**: Direct URL rendered in iframe (Chrome built-in PDF viewer)
- **Viewer**: Sandboxed iframe
- **Demo URLs**: W3C test PDF, Mozilla TraceMonkey technical paper

### 5. Doc (`type: "doc"`)
- **Google Doc URL**: `https://docs.google.com/document/d/{id}/preview`
- **Non-Google URL**: `https://docs.google.com/gview?embedded=1&url={encoded_url}`
- **Viewer**: Sandboxed iframe via Google Docs viewer
- **Demo**: Google Doc template + PDF via gview fallback

### 6. Sheet (`type: "sheet"`)
- **Google Sheet URL**: `https://docs.google.com/spreadsheets/d/{id}/preview?widget=true&headers=false`
- **Non-Google URL**: `https://docs.google.com/gview?embedded=1&url={encoded_url}`
- **Viewer**: Sandboxed iframe via Google Sheets preview
- **Demo**: Google Sheet template + PDF via gview fallback

### 7. Slides (`type: "slides"`)
- **Google Slides URL**: `https://docs.google.com/presentation/d/{id}/embed?start=false&loop=false&delayms=3000`
- **Non-Google URL**: Direct URL rendered in iframe
- **Viewer**: Sandboxed iframe via Google Slides embed
- **Demo**: Google Slides template + PDF as direct slides

### 8. E-book (`type: "ebook"`)
- **PDF e-book**: Renders natively via Chrome's built-in PDF viewer
- **EPUB/other**: Falls back to `https://docs.google.com/gview?embedded=1&url={encoded_url}`
- **Viewer**: Sandboxed iframe
- **Demo URLs**: Archive.org open book, W3C sample PDF

### 9. Image (`type: "image"`)
- **Viewer**: Custom `ImageViewer` component with:
  - Pinch zoom (two-finger touch)
  - Wheel zoom (trackpad/mouse)
  - Zoom buttons (+/−)
  - Drag to pan when zoomed
  - Double-click to toggle 100%/200%
  - Fit to screen button
  - Download button (with CORS fallback)
- **Demo URLs**: Lorem Picsum, Unsplash

### 10. Google Form (`type: "google_form"`)
- **Embed URL**: `{formUrl}/viewform?embedded=true`
- **Viewer**: Sandboxed iframe
- **Demo**: Google Form template

### 11. Embed (`type: "embed"`)
- **Embed URL**: Direct HTTPS URL
- **Viewer**: Sandboxed iframe with `allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation`
- **Demo URLs**: CodePen, Replit

### 12. Mindmap (`type: "mindmap"`)
- **Whimsical URL**: `https://whimsical.com/embed/{id}`
- **Viewer**: Sandboxed iframe
- **Provider**: `whimsical_mindmap`
- **Demo URL**: Whimsical public mindmap embed

---

## Paid-Update Modules (Purchase Flow Testing)

In addition to the 12 included modules, there are **3 paid-update modules** that test the purchase flow:

| Module                      | Price  | Update ID                |
|-----------------------------|--------|--------------------------|
| Premium YouTube Masterclass | ₹199   | update-premium-content   |
| Premium Video Tutorials    | ₹199   | update-premium-content   |
| Premium PDF Worksheets     | ₹199   | update-premium-content   |

These modules have `accessLevel: "paidUpdate"` and appear locked in the Course Player sidebar with a "Buy this update" CTA.

---

## Course Player Features Tested

### Sidebar (CourseSidebar.tsx)
- ✅ Module listing with expand/collapse
- ✅ File type icons (PlayCircle for video/youtube, FileText for PDF, etc.)
- ✅ Access states: accessible (violet), locked (amber), preview (sky), dependency-blocked (rose)
- ✅ Paid update purchase CTAs
- ✅ Two modes: "Modules" (curriculum) and "Resources" (downloadable)

### Viewer (ResourceViewer.tsx)
- ✅ Header light/dark theme toggle, scoped to the Course Player and persisted locally
- ✅ Mobile landscape keeps the vertical header on the left and the four-tab navigation rail on the right, including the portrait-locked rotate mode
- ✅ YouTube no-cookie embed with a strictly contained, full-height mobile player surface for usable settings menus
- ✅ Native video player with controls
- ✅ Native audio player with controls
- ✅ PDF iframe rendering
- ✅ Google Doc preview
- ✅ Google Sheet preview
- ✅ Google Slides embed
- ✅ Google Form embed
- ✅ Image viewer with zoom/pan/drag/download
- ✅ Generic embed iframe
- ✅ Whimsical mindmap embed
- ✅ Loading indicator while iframe boots
- ✅ Error recovery (retry + "Open original" fallback)
- ✅ Download/export links for Google Docs/Sheets/Slides

### Progress & Notes (NotesPanel.tsx + CoursePlayerApp.tsx)
- ✅ Mark complete per file
- ✅ Progress bar (percentage)
- ✅ Notes CRUD (add, edit, delete)
- ✅ Multi-device sync via Firestore
- ✅ Resume last opened file
- ✅ Notes tagged with module/resource context

### Access Control (CourseRouteGuard + useCourseAccess)
- ✅ Full product access → Course Player
- ✅ Module/resource purchase → Course Player
- ✅ Paid update ownership → unlock update modules
- ✅ Subscription grant → Course Player
- ✅ No access → redirect to PDP
- ✅ Demo mode bypass → Course Player with all types

---

## Demo Mode

To test the course player with ALL file types without purchase:

1. **From the PDP**: Click "Open Demo Player" button on any product page
2. **Via URL**: Add `?demo=true` to any course URL (e.g., `#/course/PRODUCT_ID?demo=true`)
3. **Via localStorage**: Set `dc_demo_mode=true` in browser console

Demo mode shows a banner at the top with an "Exit Demo" button.

---

## Files Modified

| File | Change |
|------|--------|
| `src/data/demoCourseContent.ts` | **NEW** — All 12 file types with prices, public URLs, paid-update modules |
| `src/context/CatalogContext.tsx` | Import demo content; use as fallback when Firestore has no courseContent |
| `src/components/CourseRouteGuard.tsx` | Add demo mode support (?demo=true bypasses access check) |
| `src/PdpApp.tsx` | Add "Demo Course Player" section with Open button and price table |
| `tests/demoCourseContent.test.mjs` | **NEW** — 16 validation checks for all file types |

---

## How to Test

1. Open the app and navigate to any product
2. Scroll to the "Demo Course Player" section
3. Click **"Open Demo Player"** to enter demo mode
4. In the Course Player:
   - Click each module in the sidebar to test different file types
   - Switch between "Modules" and "Resources" tabs
   - Try the "Notes" tab to add/edit/delete notes
   - Click "Mark complete" on any file
   - Look at the progress bar
   - Try the download/export buttons
   - For images: use pinch zoom, wheel zoom, drag pan, download
   - For locked modules: observe the amber lock and "Buy this update" CTA
5. Click "Exit Demo" to return to normal mode

---

## Public URLs Used (All Freely Accessible)

| Type | URL Source | Why |
|------|-----------|-----|
| YouTube | youtube.com | Public educational videos (Khan Academy, 3Blue1Brown) |
| Video | w3schools.com | Stable public sample MP4 (Big Buck Bunny) |
| Audio | w3schools.com | Stable public sample OGG |
| PDF | w3.org / mozilla.github.io | Official W3C test PDF + Mozilla PDF.js sample |
| Doc | docs.google.com | Google Docs Viewer renders any public doc |
| Sheet | docs.google.com | Google Sheets Preview renders any public sheet |
| Slides | docs.google.com | Google Slides Embed renders any public deck |
| E-book | archive.org | Internet Archive open-access book |
| Image | picsum.photos / unsplash.com | Always-available random/sample images |
| Form | docs.google.com | Google Forms are inherently public when shared |
| Embed | codepen.io / replit.com | Well-known embeddable platforms |
| Mindmap | whimsical.com | Whimsical public embed support |
