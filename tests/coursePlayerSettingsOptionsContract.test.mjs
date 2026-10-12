import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const panel = fs.readFileSync('src/course/PlayerPanel.tsx', 'utf8');
const player = fs.readFileSync('src/CoursePlayerApp.tsx', 'utf8');
test('removed appearance and legacy footer options are not exposed in player settings', () => {
  for (const label of ['Modern module listing', 'Always-visible footer dock', 'Sketch Clean / Optimised Look']) {
    assert.ok(!panel.includes(label), label);
  }
  for (const prop of ['onModuleListingStyleChange', 'onSketchCleanLookChange', 'onLegacyFooterDockChange']) {
    assert.ok(!panel.includes(prop), prop);
    assert.ok(!player.includes(prop), prop);
  }
});
test('other settings and existing module/sketch behaviour remain intact', () => {
  for (const label of ['Snowfall', 'Desktop view', 'Hide status bar']) assert.ok(panel.includes(label));
  assert.ok(player.includes('moduleListingStyle={moduleListingStyleCtl.style}'));
  assert.ok(player.includes('cleanLook={sketchCleanLookCtl.value}'));
  assert.ok(player.includes('<CoursePeekDock'));
});
