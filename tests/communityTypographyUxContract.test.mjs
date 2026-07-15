import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const community = fs.readFileSync('components/EduvoraCommunity.tsx', 'utf8');

test('community social desktop typography gets readable v2 hierarchy', () => {
  assert.match(community, /Premium readable desktop community typography v2/);
  assert.match(community, /font-size: 16px !important/);
  assert.match(community, /width: min\(100%, 58rem\) !important/);
  assert.match(community, /community-social-commandbar,\n    \.community-desktop-social \.community-social-stories,\n    \.community-desktop-social \.community-social-feed-panel/);
  assert.match(community, /community-mobile-feed-card-title[\s\S]*font-size: 1\.05rem !important/);
  assert.match(community, /community-mobile-feed-card-body[\s\S]*font-size: 0\.96rem !important/);
});

test('community social desktop header, nav, stories and right rail are enlarged', () => {
  assert.match(community, /community-desktop-sidebar[\s\S]*width: 15\.75rem !important/);
  assert.match(community, /community-desktop-header h1[\s\S]*clamp\(1\.38rem, 1\.9vw, 1\.9rem\)/);
  assert.match(community, /community-desktop-nav-item[\s\S]*font-size: 0\.95rem !important/);
  assert.match(community, /community-social-story-avatar[\s\S]*height: 3\.55rem !important/);
  assert.match(community, /community-social-right-rail[\s\S]*width: 22rem !important/);
});
