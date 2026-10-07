# Module Listing Style Toggle — Classic vs Modern

## ✅ Implementation Complete

### Summary
Added a toggle in the Course Player settings to switch between two module listing styles:
- **Classic (DEFAULT)**: Simple, traditional list without magnification effects
- **Modern**: Dock-style with magnifying icons and motion animations

Both styles are preserved and the learner can switch between them at any time.

---

## 🎯 What Was Implemented

### 1. Preference System (`src/course/playerPreferences.tsx`)
- Added `ModuleListingStyle` type: `"classic" | "modern"`
- Added `loadModuleListingStyle()` — reads from localStorage
- Added `persistModuleListingStyle()` — saves to localStorage
- Added `useModuleListingStyle()` hook — live, persisted preference
- **Default**: `"classic"` (as requested)
- **Storage key**: `dc.moduleStyle.listing.{uid}` (namespaced per user)

### 2. Player Panel Settings (`src/course/PlayerPanel.tsx`)
- Added `moduleListingStyle` prop to `PlayerPanelProps`
- Added `onModuleListingStyleChange` callback prop
- Added toggle in "Player settings" section:
  - Label: "Modern module listing"
  - OFF = Classic style (default)
  - ON = Modern style
- Added accent color: `#FF6BF5` (pink)
- Toast notification on toggle

### 3. Course Player App (`src/CoursePlayerApp.tsx`)
- Imported `useModuleListingStyle` hook
- Added `moduleListingStyleCtl` state
- Passed `moduleListingStyle` and `onModuleListingStyleChange` to `<PlayerPanel>`
- Passed `moduleListingStyle` to `<CourseOverlay>`

### 4. Course Overlay (`src/course/CourseOverlay.tsx`)
- Added `moduleListingStyle` prop to `CourseOverlayProps`
- Passed `moduleListingStyle` to `<StudyContent>`
- Passed `moduleListingStyle` to `<SnapList>`
- Added `data-module-listing-style` attribute to list container
- Added `classic-module-list` CSS class when style is "classic"

### 5. CSS Styles (`src/index.css`)
Added `.classic-module-list` styles that:
- Disable icon magnification (`transform: none !important`)
- Fix icon plate size (36px × 36px)
- Remove spring animations
- Use simpler hover effect (background color only)
- Compact row padding (0.375rem)
- Smaller icon border-radius (10px)

The "modern" style uses the existing dock-style magnification wave.

---

## 🎨 Visual Differences

### Classic Style (DEFAULT)
```
┌─────────────────────────────────────┐
│ [1] Module Title                    │
│     5 files                    ▼    │
├─────────────────────────────────────┤
│ [2] Another Module                  │
│     3 files                    ▶    │
└─────────────────────────────────────┘
```
- Simple numbered badges
- No magnification on hover
- Compact rows
- Traditional list appearance

### Modern Style
```
┌─────────────────────────────────────┐
│  ┌───┐  Module Title                │
│  │ 1 │  5 files                ▼    │
│  └───┘                              │
├─────────────────────────────────────┤
│   ┌──┐  Another Module              │
│   │2 │  3 files                ▶    │
│   └──┘                              │
└─────────────────────────────────────┘
```
- Magnifying icon plates (follow pointer)
- Dock-style spring animations
- Larger icon plates on hover
- Motion effects

---

## 🔧 How to Use

### For Learners
1. Open the Course Player
2. Tap the "Player" button in the footer dock
3. Scroll to "Player settings" section
4. Toggle "Modern module listing":
   - **OFF** = Classic style (simple list)
   - **ON** = Modern style (magnifying icons)
5. The choice is remembered per user

### For Developers
```typescript
// Read the preference
const { style, setStyle } = useModuleListingStyle(user?.id ?? null, "classic");

// style: "classic" | "modern"
// setStyle("classic") or setStyle("modern")

// Pass to CourseOverlay
<CourseOverlay
  moduleListingStyle={style}
  // ... other props
/>
```

---

## 📁 Files Modified

1. `src/course/playerPreferences.tsx` — Added module listing style hooks
2. `src/course/PlayerPanel.tsx` — Added settings toggle
3. `src/CoursePlayerApp.tsx` — Wired up the preference
4. `src/course/CourseOverlay.tsx` — Conditional rendering
5. `src/index.css` — Classic style CSS

---

## ✅ Acceptance Criteria Met

- [x] Both old and new module listing styles are preserved
- [x] Default is the old style (classic)
- [x] Toggle added to Course Player settings page
- [x] Can switch between classic and modern
- [x] Preference is remembered per user (localStorage)
- [x] Works on desktop, tablet, and mobile
- [x] No duplicate components (uses CSS to modify existing SnapList)

---

## 🚀 Testing

### Test the Classic Style (Default)
1. Open Course Player
2. Go to Modules tab
3. Verify: Simple list, no magnification, compact rows

### Test the Modern Style
1. Open Course Player
2. Tap "Player" button in footer dock
3. Scroll to "Player settings"
4. Enable "Modern module listing"
5. Go back to Modules tab
6. Verify: Magnifying icons, dock-style animations

### Test Persistence
1. Switch to Modern style
2. Close and reopen Course Player
3. Verify: Modern style is still active
4. Switch back to Classic
5. Close and reopen
6. Verify: Classic style is still active

### Test Multi-User
1. Log in as User A, set to Modern
2. Log out, log in as User B
3. Verify: User B sees Classic (default)
4. Set User B to Modern
5. Log out, log back in as User A
6. Verify: User A still sees Modern

---

## 📝 Notes

- The classic style is implemented via CSS overrides on the existing SnapList component
- No duplicate rendering logic — just conditional CSS classes
- The preference is stored per user ID, so multiple learners on the same device can have different settings
- The toggle label is "Modern module listing" — OFF means classic, ON means modern
- Default is "classic" as requested by the user

---

**Implementation Date:** 2026-10-07  
**Branch:** arena/cf67dc40-digitalcatalyst  
**Status:** ✅ COMPLETE
