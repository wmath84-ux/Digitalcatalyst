import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const advanced = readFileSync('utils/cleanNeutralAdvancedCustomizer.ts', 'utf8');
const base = readFileSync('utils/cleanNeutralCustomizer.ts', 'utf8');
const studio = readFileSync('components/admin/CleanNeutralAdvancedStudio.tsx', 'utf8');
const icons = readFileSync('components/common/ProfessionalIcon.tsx', 'utf8');
const settings = readFileSync('components/admin/WebsiteSettings.tsx', 'utf8');
const bottomDock = readFileSync('components/BottomGlassDock.tsx', 'utf8');
const sideDock = readFileSync('components/HomeSideDock.tsx', 'utf8');
const mobileHome = readFileSync('components/MobileAppHome.tsx', 'utf8');
const css = readFileSync('public/styles/clean-neutral-theme.css', 'utf8');

test('advanced customizer has stable finite region and icon registries', () => {
  assert.match(advanced, /CLEAN_NEUTRAL_REGION_REGISTRY/);
  assert.match(advanced, /CLEAN_NEUTRAL_ICON_SLOT_REGISTRY/);
  assert.match(advanced, /PROFESSIONAL_ICON_LIBRARY/);
  assert.match(studio, /cleanNeutralAdvancedRegionCount/);
  assert.match(studio, /cleanNeutralAdvancedIconSlotCount/);
});

test('advanced values are sparse validated and page-device scoped', () => {
  assert.match(advanced, /regionTargets: Record<string/);
  assert.match(advanced, /iconTargets: Record<string/);
  assert.match(advanced, /TARGET_PATTERN/);
  assert.match(advanced, /normalizeCleanNeutralAdvancedCustomizer/);
  assert.match(base, /advanced: CleanNeutralAdvancedCustomizerSettings/);
  assert.match(base, /applyCleanNeutralAdvancedRuntime/);
});

test('Admin exposes searchable region and professional icon studios', () => {
  assert.match(settings, /CleanNeutralAdvancedStudio/);
  assert.match(studio, /Search pages/);
  assert.match(studio, /Search regions/);
  assert.match(studio, /Search professional icons/);
  assert.match(studio, /Icon only/);
  assert.match(studio, /Icon with text/);
  assert.match(studio, /Stroke width/);
  assert.match(studio, /Icon\/text gap/);
});

test('Admin accepts no raw CSS selector HTML JavaScript or pasted SVG editor', () => {
  assert.doesNotMatch(studio, /<textarea\b/i);
  assert.doesNotMatch(studio, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(studio, /contentEditable/);
  assert.doesNotMatch(studio, /selector\s*:/i);
  assert.doesNotMatch(studio, /rawCss/i);
});

test('professional icon component uses allowlisted SVG paths and runtime slot overrides', () => {
  assert.match(icons, /ICON_PATHS/);
  assert.match(icons, /useSyncExternalStore/);
  assert.match(icons, /data-clean-neutral-icon-slot/);
  assert.match(icons, /resolveProfessionalIconOverride/);
  assert.doesNotMatch(icons, /dangerouslySetInnerHTML/);
});

test('desktop and mobile primary navigation no longer render emoji icon values', () => {
  for (const source of [bottomDock, sideDock]) {
    assert.match(source, /ProfessionalIcon/);
    assert.doesNotMatch(source, /icon: '🏠'/);
    assert.doesNotMatch(source, /icon: '🛍/);
    assert.doesNotMatch(source, /icon: '📚'/);
    assert.doesNotMatch(source, /icon: '❤️'/);
    assert.doesNotMatch(source, /icon: '🛒'/);
  }
});

test('Home exposes stable shell hero and navigation regions', () => {
  assert.match(mobileHome, /data-clean-neutral-region="shell\.page"/);
  assert.match(mobileHome, /data-clean-neutral-region="shell\.header"/);
  assert.match(mobileHome, /data-clean-neutral-region="content\.hero"/);
  assert.match(mobileHome, /data-clean-neutral-region="shell\.navigation"/);
});

test('screenshot-specific Clean Neutral precision fixes exist', () => {
  assert.match(css, /CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER_PHASE2_V2/);
  assert.match(css, /community-ai-mentor-panel/);
  assert.match(css, /course-player/);
  assert.match(css, /data-clean-neutral-page="home"/);
  assert.match(css, /background-image: none/);
});
