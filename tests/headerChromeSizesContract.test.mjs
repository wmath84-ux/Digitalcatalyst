// tests/headerChromeSizesContract.test.mjs
//
// The owner's header size pass (2026-10-14), pinned so a later style tweak
// cannot quietly undo it:
//
//   · every icon in the header is 30px — phone, tablet AND desktop. That is the
//     glyph that is drawn; the discs/plates it sits in stay 40px, because they
//     are the hit targets (the plain side-panel trigger is pinned at 40px by
//     tests/headerAvatarRingContract.test.mjs, and the notification plate by
//     header-navigation.css).
//   · the header text is 22px — the page title / greeting / the labels the
//     action pills expand to / the search fields.
//   · the app icon is 36px — the header brand mark and both rail brand blocks
//     (increased by 6px on the owner's request; action glyphs stay at 30px).
//   · the `ad` option is NOT one of the header's icons: it lives in the side
//     panel on every band (tests/openingAdControl.test.mjs pins that).
//
// The tablet/desktop CSS in src/index.css used to fight these numbers (the
// logo grew to 48px, the top-bar title shrank to 16–18px); the last test keeps
// those overrides on the same three values.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const header = read("src/components/Header.tsx");
const homeHeader = read("src/home/components/Header.tsx");
const shell = read("src/components/DesktopShell.tsx");
const notifications = read("src/components/HeaderNotificationsButton.tsx");
const menu = read("src/components/MobileHeaderMenu.tsx");
const headerCss = read("src/components/header-navigation.css");
const indexCss = read("src/index.css");
const landing = read("src/components/landing/Header.tsx");

test("every header action icon is 30px on every band", () => {
  // The shared header (phone + tablet portrait) and the home / FlowPath hero.
  assert.match(header, /className="h-\[30px\] w-\[30px\]"/, "the shared header's icons are 30px boxes");
  assert.doesNotMatch(header, /className="h-10 w-10"/, "…and none of them is still a 40px box");
  assert.match(header, /iconSize=\{30\}/, "ExpandingTabs is told the 30px icon box");
  assert.match(homeHeader, /h-\[30px\] w-\[30px\]/);
  assert.match(homeHeader, /iconSize=\{30\}/);
  // The bell glyph (the plate around it is the 40px hit target).
  assert.match(notifications, /<Bell[^>]*size=\{30\}/);
  // The side-panel trigger's glyph, and the drawer's close control.
  assert.match(menu, /<Menu[^>]*size=\{30\}/);
  assert.match(menu, /<X size=\{30\}/);
  // The desktop top bar: search glyph, the clear control, the Review / Add /
  // Upgrade pill glyphs and the Expanding Tabs cluster.
  assert.match(shell, /icon=\{<Search className="h-\[30px\] w-\[30px\]"/);
  assert.match(shell, /<X size=\{30\} \/>/);
  assert.match(shell, /<Play size=\{30\}/);
  assert.match(shell, /<Plus size=\{30\}/);
  assert.match(shell, /<Crown size=\{30\} aria-hidden="true" \/>/);
  assert.match(shell, /iconSize=\{30\}/);
  // The one 40 left in the shell is the notification plate — the hit target —
  // never a glyph.
  assert.equal(
    (shell.match(/size=\{40\}/g) ?? []).length,
    1,
    "no header icon is left at 40px in the shell",
  );
  assert.match(shell, /<HeaderNotificationsButton[\s\S]{0,80}?size=\{40\}/);
});

test("the header text is 22px, on every band", () => {
  // Shared header title: one size, no `md:` step up to 40px.
  assert.match(header, /truncate text-\[22px\] font-bold leading-\[26px\]/);
  assert.doesNotMatch(header, /md:text-\[40px\]/);
  // Centre search field (desktop my-day style header).
  assert.match(header, /\[&_input\]:text-\[22px\] \[&_input\]:leading-\[26px\]/);
  // Home / FlowPath greeting and its search field.
  assert.match(homeHeader, /text-\[22px\] font-bold leading-\[26px\] tracking-tight/);
  assert.match(homeHeader, /\[&_input\]:text-\[22px\] \[&_input\]:leading-\[26px\]/);
  // Desktop top bar: the page title, the search field and the pill labels.
  assert.match(shell, /truncate text-\[22px\] font-bold leading-\[26px\] tracking-tight text-white" data-desktop-page-title/);
  assert.match(shell, /\[&_input\]:text-\[22px\] \[&_input\]:leading-\[26px\]/);
  assert.match(shell, /text-\[22px\] leading-\[26px\] font-black text-white shadow-sm/);
  // …and the expanded ExpandingTabs pill.
  assert.match(read("src/components/ui/ExpandingTabs.tsx"), /text-\[22px\] font-semibold leading-\[26px\]/);
});

test("the app icon is 36px wherever the chrome shows it", () => {
  assert.match(header, /data-header-app-icon className="flex h-\[36px\] w-\[36px\]/);
  assert.match(header, /<BrandMark className="h-\[36px\] w-\[36px\]" \/>/);
  assert.match(header, /<LogoIcon className="h-\[36px\] w-\[36px\]" \/>/);
  assert.match(homeHeader, /<BrandMark className="h-\[36px\] w-\[36px\]/);
  // Desktop + tablet rail brand blocks (wide and compact glass rails).
  assert.equal(
    (shell.match(/data-header-app-icon className="grid h-\[36px\] w-\[36px\]/g) ?? []).length,
    2,
    "both rail variants show the 36px app icon",
  );
  assert.equal((shell.match(/<BrandMark className="h-\[36px\] w-\[36px\]" \/>/g) ?? []).length, 2);
  assert.equal((shell.match(/<Sparkles className="h-\[26px\] w-\[26px\]" \/>/g) ?? []).length, 2);
  // Landing chrome already uses a 36px brand mark.
  assert.match(landing, /<BrandMark className="h-9 w-9 rounded-xl"/);
});

test("the tablet/desktop CSS keeps the same three numbers instead of fighting them", () => {
  // Tablet band keeps the app-brand container at the new 36px size.
  assert.match(
    indexCss,
    /\[data-site-header\] \[data-header-app-icon\] \{\s*height: 36px;\s*width: 36px;\s*\}/,
  );
  assert.match(indexCss, /\[data-site-header\] h1 \{\s*font-size: 22px;\s*\}/);
  // Desktop band: the title used to shrink through a clamp to 16–18px.
  assert.match(indexCss, /\[data-desktop-page-title\] \{\s*font-size: 22px !important;\s*\}/);
  assert.doesNotMatch(indexCss, /\[data-site-header\] \.h-11\.w-11/, "the 48px tablet logo rule is gone");
});

test("the plates the icons sit in stay the 40px hit targets", () => {
  assert.match(headerCss, /\.dc-header-menu-trigger \{[\s\S]*?width: 40px[\s\S]*?height: 40px/);
  assert.match(headerCss, /\.dc-header-glass-button \{[\s\S]*?width: 40px[\s\S]*?height: 40px/);
});
