import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const sideDock = readFileSync(new URL('../components/HomeSideDock.tsx', import.meta.url), 'utf8');
const mayDay = readFileSync(new URL('../components/MayDayMobile.tsx', import.meta.url), 'utf8');

test('desktop My Day uses the real shared workspace and is routed for non-mobile users', () => {
  assert.match(app, /desktop=\{!isMobileViewport\}/);
  assert.match(app, /mayDay: 'My Day'/);
  assert.match(mayDay, /MAY_DAY_DESKTOP_V1/);
  assert.match(mayDay, /mayDayWorkspace: snapshot/);
  assert.match(mayDay, /eduvora\.mayDay\.workspace\.v1/);
  assert.match(mayDay, /activeTab === 'dashboard'/);
  assert.match(mayDay, /activeTab === 'notes'/);
  assert.match(mayDay, /activeTab === 'goals' \|\| activeTab === 'reminders'/);
  assert.match(mayDay, /activeTab === 'progress'/);
});

test('website desktop side panel places My Day directly before Home and keeps Community wiring', () => {
  const mayIndex = sideDock.indexOf("id: 'My Day'");
  const homeIndex = sideDock.indexOf("id: 'Home'");
  assert.ok(mayIndex >= 0, 'missing My Day side-panel item');
  assert.ok(homeIndex > mayIndex, 'My Day must be declared before Home');
  assert.match(sideDock, /\['My Day', \.\.\.configuredWithHome\.filter/);
  assert.match(app, /onOpenMayDay=\{handleNavigateToMayDay\}/);
  assert.match(app, /onOpenMayDay=\{\(\) => \{ setCurrentView\('mayDay'\)/);
  assert.match(app, /activeItem="Community"/);
});

test('desktop May Day controls are connected to real handlers and calculated analytics', () => {
  for (const handler of [
    'saveNote',
    'addTask',
    'toggleTask',
    'addGoal',
    'updateGoalProgress',
    'addReminder',
    'toggleReminder',
    'requestBrowserPermission',
    'selectFocusMinutes',
    'completeFocusSession',
    'exportWorkspace',
    'forceSync',
  ]) {
    assert.ok(mayDay.includes(handler), `missing ${handler}`);
  }
  assert.match(mayDay, /focusChartPoints/);
  assert.match(mayDay, /categoryStats/);
  assert.match(mayDay, /totalCompletedTasks/);
  assert.match(mayDay, /totalFocusMinutes/);
  assert.match(mayDay, /isPremium \? currentStreak/);
});

