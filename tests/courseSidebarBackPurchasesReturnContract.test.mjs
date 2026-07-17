import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');
const course = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');

test('lesson selection closes the mobile module panel with a back-to-modules history sentinel', () => {
  assert.match(course, /const closeCourseSidebarAfterLessonSelection = useCallback\(\(fileId: string\) =>/);
  assert.match(course, /dcCourseLessonSelection: false/);
  assert.match(course, /window\.history\.pushState\(\{\s*\.\.\.modulesState,\s*dcCourseLayer: null,\s*dcCourseLessonSelection: true,/s);
  assert.match(course, /closeCourseSidebarAfterLessonSelection\(file\.id\)/);
  assert.doesNotMatch(course, /setYoutubeWatchSeconds\(0\);\s*closeCourseSidebar\(\);/);
});

test('CoursePlayer back reopens modules before leaving after lesson selection', () => {
  assert.match(course, /window\.history\.state\?\.dcCourseLessonSelection === true/);
  assert.match(course, /window\.history\.back\(\);\s*return;/);
  assert.match(course, /const handleCoursePopState = \(event: PopStateEvent\) =>/);
  assert.match(course, /setIsSidebarOpen\(layer === 'modules'\)/);
  assert.match(course, /if \(isSidebarOpenRef\.current && forceOverlaySidebarRef\.current\) \{\s*closeCourseSidebar\(\);/s);
});

test('module expansion still resets only on real CoursePlayer exit', () => {
  assert.match(course, /const closeCourseSidebar = useCallback\(\(\) => \{\s*setIsSidebarOpen\(false\);\s*closeCourseLayerHistory\('modules'\);/s);
  assert.match(course, /resetCourseModulePanel\(\);\s*void flushYoutubeCoins\('closed'\);\s*onBack\(\);/);
  const lessonCloseBlock = course.slice(course.indexOf('const closeCourseSidebarAfterLessonSelection'), course.indexOf('const openCourseSidebar'));
  assert.doesNotMatch(lessonCloseBlock, /resetCourseModulePanel\(\)/);
});

test('Product Detail to My Purchases records and preserves an exact product return target', () => {
  assert.match(app, /PURCHASES_RETURN_SESSION_KEY = 'eduvora\.purchasesReturn\.v1'/);
  assert.match(app, /currentViewRef\.current === 'product' \? selectedProductRef\.current : null/);
  assert.match(app, /dcPurchasesReturnView: 'product'/);
  assert.match(app, /dcPurchasesReturnProductId: originProduct\.id/);
  assert.match(app, /writePurchasesReturnContext\(returnContext\)/);
});

test('Access Files replaces the intermediate Purchases entry with CoursePlayer while keeping Product Detail directly behind it', () => {
  assert.match(app, /const returnContext = purchasesReturnContextRef\.current/);
  assert.match(app, /syncStackForHistoryView\('product'\)/);
  assert.match(app, /historyNavigationRef\.current = true/);
  assert.match(app, /dcView: 'coursePlayer',\s*dcAppEntry: true,\s*dcProductId: originProduct\.id,\s*dcCourseProductId: product\.id/s);
  assert.match(app, /dcPurchasesOriginEntryReady: true/);
  assert.match(app, /setCurrentView\('coursePlayer'\)/);
  assert.match(app, /onBack=\{handleBackFromCoursePlayer\}/);
});

test('system and header back restore a product or use a safe nonblank fallback', () => {
  assert.match(app, /if \(nextView === 'product'\)/);
  assert.match(app, /restoreProductForNavigation\(targetProductId\)/);
  assert.match(app, /nextView = 'allProducts'/);
  assert.match(app, /!rawNextView \|\| nextView !== rawNextView/);
  assert.match(app, /window\.history\.state\?\.dcPurchasesOriginEntryReady === true/);
  assert.match(app, /if \(previousView === 'product'\)/);
  assert.match(app, /if \(!selectedProduct\) return renderMobileSessionStatus\('Restoring product…'/);
  assert.match(app, /window\.history\.back\(\);\s*return;\s*\}\s*handleNavigateBack\('myPurchases'\)/s);
});
