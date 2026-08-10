import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');
const course = fs.readFileSync('components/CoursePlayer.tsx', 'utf8');
const mobileDock = fs.readFileSync('components/BottomGlassDock.tsx', 'utf8');
const desktopDock = fs.readFileSync('components/HomeSideDock.tsx', 'utf8');
const settings = fs.readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');

test('normal CoursePlayer document preview locks pinch while explicit Drive interface allows it', () => {
  assert.match(course, /data-pinch-zoom="disabled"/);
  assert.match(course, /touchAction: 'pan-x pan-y'/);
  assert.match(course, /Normal preview keeps pinch zoom locked/);
  assert.match(course, /Interactive Drive mode · pinch zoom enabled/);
  assert.match(course, /data-pinch-zoom="enabled"/);
  assert.match(course, /touchAction: 'auto'/);
  assert.match(course, /Close interactive Drive interface/);
});

test('Store Config removes Round Effects without deleting public product roundness settings', () => {
  assert.doesNotMatch(settings, /case 'roundness':/);
  assert.doesNotMatch(settings, /label="Round Effects"/);
  assert.match(settings, /store-config-workspace/);
  assert.match(app, /productRoundness/);
});

test('Dock customization is removed from admin while the dock keeps hardcoded defaults', () => {
  assert.doesNotMatch(settings, /case 'dock':/);
  assert.doesNotMatch(settings, /store-config-dock-studio/);
  assert.doesNotMatch(settings, /Dock Settings/);
  assert.doesNotMatch(settings, /updateDockStyle/);
  assert.doesNotMatch(settings, /toggleDockItem/);
  assert.doesNotMatch(settings, /moveDockItem/);

  // The dock components still expose their hardcoded default style and item markers.
  for (const marker of [
    'itemColor',
    'accentColor',
    'textColor',
    'borderColor',
    'gap',
    'radius',
    'itemRadius',
    'bottomOffset',
    'blur',
    'shadowStrength',
    'showLabels',
    'showBadges',
    'autoHideOnScroll',
    'mobileEnabled',
    'desktopExpandedWidth',
    'desktopCollapsedWidth',
  ]) {
    assert.match(mobileDock + desktopDock, new RegExp(marker));
  }

  // Bottom dock is hardcoded to mobile-only (default sidebar desktop navigation).
  assert.match(mobileDock, /const showOnDesktop = false;/);
  // Side dock reads its appearance from the hardcoded default style.
  assert.match(desktopDock, /const dockStyle = defaultDockStyle;/);
  assert.match(desktopDock, /desktopExpandedWidth/);
});

test('new-content glow remains mobile only while desktop keeps numeric badges', () => {
  assert.match(mobileDock, /dock-new-content-glow/);
  assert.match(mobileDock, /@media \(max-width: 767px\)/);
  assert.match(mobileDock, /item\.badge > 99 \? '99\+'/);
  assert.doesNotMatch(desktopDock, /dock-new-content-glow/);
  assert.match(desktopDock, /item\.badge > 99 \? '99\+'/);
});
