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

test('Dock Settings are saved once and consumed by mobile dock, desktop bottom dock and side panel', () => {
  assert.match(settings, /store-config-dock-studio/);
  assert.match(settings, /Real navigation deployment/);
  assert.match(settings, /Show mobile dock/);
  assert.match(settings, /Show numeric badges/);
  assert.match(settings, /Auto-hide bottom dock on scroll/);
  assert.match(settings, /Items and order/);
  assert.match(settings, /Surface and color/);
  assert.match(settings, /Desktop side panel preview/);

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
    assert.match(app, new RegExp(marker));
    assert.match(mobileDock + desktopDock, new RegExp(marker));
  }

  assert.match(mobileDock, /showOnDesktop = settings\.desktop\.navigationMode === 'dock'/);
  assert.match(desktopDock, /desktopExpandedWidth/);
});

test('new-content glow remains mobile only while desktop keeps numeric badges', () => {
  assert.match(mobileDock, /dock-new-content-glow/);
  assert.match(mobileDock, /@media \(max-width: 767px\)/);
  assert.match(mobileDock, /item\.badge > 99 \? '99\+'/);
  assert.doesNotMatch(desktopDock, /dock-new-content-glow/);
  assert.match(desktopDock, /item\.badge > 99 \? '99\+'/);
});
