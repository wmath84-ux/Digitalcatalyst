import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('the Course Player route contains render failures instead of blanking the app', () => {
  const main = read('src/main.tsx');
  const boundary = read('src/components/CoursePlayerErrorBoundary.tsx');

  assert.match(main, /import \{ CoursePlayerErrorBoundary \} from "\.\/components\/CoursePlayerErrorBoundary"/);
  assert.match(main, /<CoursePlayerErrorBoundary onBack=\{backToPurchases\}>[\s\S]*?<CourseRouteGuard[\s\S]*?<\/CoursePlayerErrorBoundary>/);
  assert.match(boundary, /static getDerivedStateFromError\(error: unknown\)/);
  assert.match(boundary, /componentDidCatch\(error: Error, info: ErrorInfo\)/);
  assert.match(boundary, /data-course-player-error/);
  assert.match(boundary, /Technical details/);
  assert.match(boundary, /Reload and retry/);
  assert.match(boundary, /Back to purchases/);
  assert.match(boundary, /Go to Home/);
  assert.match(boundary, /window\.addEventListener\("hashchange"/);
});

test('course audio is initialized before the study pane eagerly creates the Music tab', () => {
  const player = read('src/CoursePlayerApp.tsx');
  const audioDeclaration = player.indexOf('const courseAudio = useMemo(');
  const studyPaneBuild = player.indexOf('const studyOverlay = (');

  assert.ok(audioDeclaration >= 0, 'the access-scoped course audio collection remains memoized');
  assert.ok(studyPaneBuild >= 0, 'the main study pane is built during render');
  assert.ok(audioDeclaration < studyPaneBuild, 'buildStudyPane eagerly reads courseAudio while creating its MusicPanel element');
  assert.match(
    player,
    /<MusicPanel\n\s+uid=\{user\?.id \?\? null\}\n\s+courseAudio=\{courseAudio\}/,
  );
});

test('the player reuses the guard’s resolved access instead of opening a second loading gate', () => {
  const guard = read('src/components/CourseRouteGuard.tsx');
  const player = read('src/CoursePlayerApp.tsx');

  assert.match(guard, /initialAccess=\{resolution\}/);
  assert.match(player, /initialAccess\?: CourseAccessResolution/);
  assert.match(player, /initialAccess && accessState\.loading \? initialAccess : accessState\.resolution/);
  assert.match(player, /access: Boolean\(initialAccess\) \|\| !accessState\.loading/);
  assert.match(player, /const isReady = readinessStages\.access && readinessStages\.playback/);
});
