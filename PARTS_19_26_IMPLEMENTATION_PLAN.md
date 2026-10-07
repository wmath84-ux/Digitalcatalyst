# Parts 19-26: Implementation Plan & Status

## Overview
This document tracks the implementation of Parts 19-26, including verification of existing code and new implementations.

---

## Part 19: Course Player Progress + Settings Rail

**Status**: ⏳ TO IMPLEMENT

**Reference**: https://aicanvas.me/components/runway-loader

**Current State**:
- Location: `src/CoursePlayerApp.tsx` (lines ~2050-2100)
- Current implementation: Thin progress bar (4px height) with gradient fill
- Width: Current width = W
- Features: Mark-complete interaction, percentage label

**Required Changes**:
1. Double the width to 2W
2. Split into two equal halves (50% each):
   - LEFT: Progress bar with Runway loader animation
   - RIGHT: Settings trigger button
3. Add subtle divider between halves
4. Implement continuous Runway-style animation
5. Settings trigger opens existing Player settings surface

**Files to Modify**:
- `src/CoursePlayerApp.tsx` - Progress rail component

**Constraints**:
- Real progress percentage unchanged
- No fake progress
- No second progress bar
- No duplicate animation
- Runway effect is purely visual

---

## Part 20: Replace Settings with Live Experiment in Footer

**Status**: ⏳ TO IMPLEMENT

**Current State**:
- Location: `src/course/CourseOverlay.tsx` (line ~435)
- Current TABS array includes: `{ key: "player", label: "Player", icon: Settings }`
- FlaskConical icon already imported and used for interactive experiments

**Required Changes**:
1. Remove "player" tab from TABS array
2. Add "experiment" tab with FlaskConical icon in same position
3. Preserve Settings functionality (accessible via Part 19 combined control)
4. Keep all other footer items unchanged

**Files to Modify**:
- `src/course/CourseOverlay.tsx` - TABS array definition

**Constraints**:
- Do not remove Settings page/route/state
- Do not remove other footer items
- Use existing FlaskConical icon
- Accessible label: "Live Experiment"

---

## Part 21: Live Experiment MASTER/SELF Page

**Status**: ✅ ALREADY EXISTS (Partial)

**Current State**:
- `interactive` resource type exists
- `interactiveHtml` payload exists
- Files found:
  - `src/components/admin/products/ExperimentEditor.tsx`
  - `src/course/ExperimentStage.tsx`
  - `src/personal-library/MyCourseExperimentEditor.tsx`
  - `utils/productMapping.js`
  - `utils/productResourceTypes.js`

**Required Changes**:
1. Create dedicated Live Experiment surface
2. Implement MASTER/SELF toggle
3. MASTER: Show official/admin-created interactive resources
4. SELF: Show learner-created interactive resources
5. Remember last selected mode
6. Reuse existing access/entitlement rules

**Files to Create/Modify**:
- Create: `src/course/LiveExperimentPanel.tsx` (new component)
- Reuse: Existing experiment architecture

**Constraints**:
- Do not create second experiment architecture
- Do not create new Firestore collection
- Reuse existing data structures

---

## Part 22: Live Experiment Create New Flow

**Status**: ✅ ALREADY EXISTS

**Current State**:
- `MyCourseExperimentEditor.tsx` exists
- AI prompt generation exists
- HTML upload/paste exists
- Preview exists
- ExperimentStage for rendering exists

**Required Changes**:
1. Integrate create flow into Live Experiment SELF mode
2. Allow selecting existing learner course/module
3. Reuse existing builder and templates

**Files to Modify**:
- `src/course/LiveExperimentPanel.tsx` (from Part 21)
- Reuse: `src/personal-library/MyCourseExperimentEditor.tsx`

**Constraints**:
- Do not create another builder
- Do not create another module database
- Store as normal `interactive` resource

---

## Part 23: Course Player Modules - Branched Menu

**Status**: ⏳ TO IMPLEMENT

**Reference**: https://reactbits.dev/c/micro/branched-menu

**Current State**:
- Module hierarchy exists in course data
- Module selection state exists
- CourseResourceLibrary.tsx exists

**Required Changes**:
1. Implement Branched Menu component
2. Populate from real course/module hierarchy
3. Support nested modules, locked modules, preview modules
4. Show completion state
5. Use existing module-selection state

**Files to Create/Modify**:
- Create: `src/components/ui/BranchedMenu.tsx` (new component)
- Modify: Course Player modules page to use Branched Menu

**Constraints**:
- Do not create another module-selection state
- Do not hard-code module names
- Preserve CourseResourceLibrary.tsx

---

## Part 24: Perfect Freehand Integration

**Status**: ❌ NOT INSTALLED

**Reference**: https://github.com/steveruizok/perfect-freehand

**Current State**:
- `perfect-freehand` NOT in package.json
- Excalidraw exists for Sketch panel
- Canvas/drawing architecture exists

**Required Changes**:
1. Install `perfect-freehand` package
2. Integrate as freehand stroke engine
3. Support mouse, touch, stylus, tablet, mobile
4. Integrate with existing drawing toolbar
5. Provide pen, eraser, size, undo, redo, clear controls
6. Preserve existing Canvas save/restore

**Files to Create/Modify**:
- Install: `perfect-freehand` npm package
- Modify: Sketch/drawing components
- Create: Freehand drawing hook/component

**Constraints**:
- Do not create another drawing application
- Avoid pointer-event conflicts
- Verify touch/stylus behavior

---

## Part 25: Landing Page Gradient Waves

**Status**: ⏳ TO IMPLEMENT

**Reference**: https://reactbits.dev/c/backgrounds/gradient-waves

**Current State**:
- `LandingApp.tsx` exists
- `LandingOverlays.tsx` exists
- Global backdrop architecture exists

**Required Changes**:
1. Implement Gradient Waves background
2. Cover entire landing page surface
3. Integrate with existing backdrop architecture
4. Respect reduced motion
5. Work on mobile/tablet/desktop

**Files to Create/Modify**:
- Create: `src/components/landing/GradientWaves.tsx` (new component)
- Modify: `src/LandingApp.tsx` to include background

**Constraints**:
- Do not create duplicate fullscreen backgrounds
- Background must be behind content
- Never intercept clicks
- No white gaps or horizontal overflow

---

## Part 26: My Day + App-Level Fixes

### 26A: My Day Notebook Delete
**Status**: ⏳ TO VERIFY
- Files: `src/MyDayApp.tsx`, `src/joplin/JoplinWorkspace.tsx`
- Need to verify if delete exists
- If not, implement with confirmation

### 26B: My Day Resize Shrink Bug
**Status**: ⏳ TO INVESTIGATE
- Need to find structural cause
- Fix min-width/min-height, flex/grid constraints

### 26C: My Day Global Header + Joplin Header
**Status**: ⏳ TO VERIFY
- Verify correct visual structure
- Global App Header → Joplin Header → Joplin Workspace

### 26D: FlowPath Remove Duplicate Gear
**Status**: ⏳ TO INVESTIGATE
- Files: `src/FlowPathApp.tsx`, `src/components/flowpath/*`
- Find and remove duplicate footer gear

### 26E: FlowPath Card Content Clipping
**Status**: ⏳ TO INVESTIGATE
- Fix height, flex, grid, content measurement

### 26F: Google ID Picker
**Status**: ⏳ TO INVESTIGATE
- Find current implementation
- Implement proper popup/tab/window behavior

### 26G: Notifications Exact Time + Android Alarm
**Status**: ⏳ TO INVESTIGATE
- Implement SCHEDULE_EXACT_ALARM permission
- Proper permission handling

### 26H: Logout Blank Screen
**Status**: ⏳ TO INVESTIGATE
- Trace logout → auth state → route transition
- Fix blank intermediate screen

### 26I: Course Player Footer/Peek Reveal Bug
**Status**: ⏳ TO INVESTIGATE
- Fix footer visibility
- Correct peek/reveal behavior

### 26J: Course Player Horizontal Navigation Line/Drag Bug
**Status**: ⏳ TO INVESTIGATE
- Fix click/tap/drag responsiveness
- Fix scroll locking

### 26K: Course Player Mark-as-Complete Control
**Status**: ✅ ALREADY EXISTS
- ChargingCompleteButton exists
- Animated circular control exists
- May need refinement

### 26L: Course Player Custom PDF Upload Stuck at 40%
**Status**: ⏳ TO INVESTIGATE
- Different from Part 13 (Read 0% bug)
- Need to trace actual pipeline
- Find root cause

---

## Implementation Order

### Phase 1: Course Player Core (Parts 19-20)
1. Part 19: Progress + Settings Rail
2. Part 20: Replace Settings with Experiment

### Phase 2: Live Experiment System (Parts 21-22)
3. Part 21: Live Experiment MASTER/SELF Page
4. Part 22: Create New Flow Integration

### Phase 3: Navigation & Drawing (Parts 23-24)
5. Part 23: Branched Menu for Modules
6. Part 24: Perfect Freehand Integration

### Phase 4: Landing Page (Part 25)
7. Part 25: Gradient Waves Background

### Phase 5: Bug Fixes (Part 26)
8. Part 26A-26L: Systematic investigation and fixes

---

## Testing Strategy

After each part:
1. Run TypeScript typecheck
2. Run relevant tests
3. Manual verification on mobile/tablet/desktop
4. Check light/dark theme
5. Verify no regressions

---

## Files Changed Tracker

Will be updated as implementation progresses:
- [ ] Part 19: src/CoursePlayerApp.tsx
- [ ] Part 20: src/course/CourseOverlay.tsx
- [ ] Part 21: src/course/LiveExperimentPanel.tsx (new)
- [ ] Part 22: src/course/LiveExperimentPanel.tsx
- [ ] Part 23: src/components/ui/BranchedMenu.tsx (new)
- [ ] Part 24: package.json + drawing components
- [ ] Part 25: src/components/landing/GradientWaves.tsx (new)
- [ ] Part 26: Multiple files (TBD)

---

## Next Steps

1. Start with Part 19 (Progress + Settings Rail)
2. Implement Runway loader animation
3. Test on all viewports
4. Move to Part 20
5. Continue systematically through all parts
