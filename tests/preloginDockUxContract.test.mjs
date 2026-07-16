import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const dock = fs.readFileSync('components/BottomGlassDock.tsx', 'utf8');

test('pre-login dock reuses logged-in Profile visual design without changing auth action', () => {
  assert.match(dock, /const isLoggedOutProfileVisual = !isLoggedIn && \(item\.label === authButtonLabel \|\| item\.label === 'Login'\);/);
  assert.match(dock, /const visualLabel = isLoggedOutProfileVisual \? 'Profile' : item\.label;/);
  assert.match(dock, /const visualIcon = isLoggedOutProfileVisual \? '🪙' : item\.icon;/);
  assert.match(dock, /const tone = dockToneClasses\[visualLabel\] \|\| dockToneClasses\[item\.label\]/);
  assert.match(dock, /aria-label=\{isLoggedOutProfileVisual \? authButtonLabel : item\.label\}/);
  assert.match(dock, /item\.action\(\);/);
});

test('logged-out dock still keeps the same navigation and auth logic contracts', () => {
  assert.match(dock, /\{ label: isLoggedIn \? 'Profile' : authButtonLabel, action: \(\) => \{/);
  assert.match(dock, /if \(typeof onProfileClick === 'function'\) \{/);
  assert.match(dock, /onProfileClick\(\);/);
  assert.match(dock, /map\['Profile'\] = map\['Profile'\] \|\| \{ label: isLoggedIn \? 'Profile' : authButtonLabel/);
  assert.match(dock, /id="main-bottom-dock"/);
});
