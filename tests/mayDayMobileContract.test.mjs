import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const dock = readFileSync(new URL('../components/BottomGlassDock.tsx', import.meta.url), 'utf8');
const mayDay = readFileSync(new URL('../components/MayDayMobile.tsx', import.meta.url), 'utf8');

test('mobile May Day is wired into the app view and dock before Home', () => {
  assert.match(app, /import MayDayMobile from '\.\/components\/MayDayMobile';/);
  assert.match(app, /'home',\s*'mayDay',/);
  assert.match(app, /case 'mayDay': return/);
  assert.match(app, /onOpenMayDay=\{handleNavigateToMayDay\}/);
  assert.match(dock, /map\['May Day'\] = onOpenMayDay/);
  assert.match(dock, /\[map\['May Day'\], \.\.\.configuredItems/);
  assert.match(dock, /item\.mobileOnly \? 'md:hidden'/);
});

test('May Day has real feature navigation, persistence and premium streak gating', () => {
  assert.match(mayDay, /MAY_DAY_MOBILE_V1/);
  assert.match(mayDay, /mayDayWorkspace: snapshot/);
  assert.match(mayDay, /window\.localStorage\.setItem\(storageKey/);
  for (const label of ['May Day', 'Goals', 'Reminders', 'Focus', 'Progress']) {
    assert.ok(mayDay.includes(`label: '${label}'`), `missing ${label} internal destination`);
  }
  assert.match(mayDay, /isPremium \? 'Daily Streak' : 'Daily Progress'/);
  assert.match(mayDay, /Normal users can use tasks, notes, reminders, focus sessions, and daily progress/);
  assert.match(mayDay, /Notification\.requestPermission/);
  assert.match(mayDay, /registration\.showNotification/);
});

