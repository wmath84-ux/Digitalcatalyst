// tests/socialCardScaleContract.test.mjs
//
// CSS-only contract for the Home social card's proportional internal ramp.
// The values are read from the shipped stylesheet so this test can prove the
// ladder and its arithmetic without a browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(ROOT, "src/home/components/social-profile-card.css"), "utf8");
const cardSource = fs.readFileSync(path.join(ROOT, "src/home/components/SocialProfileCard.tsx"), "utf8");
const homeApp = fs.readFileSync(path.join(ROOT, "src/home/App.tsx"), "utf8");
const brandingPage = fs.readFileSync(path.join(ROOT, "src/admin/pages/BrandingPage.tsx"), "utf8");

const PX_PER_REM = 16;
const SCALE_SECTION = "/* ── Internal scaling";
const scaleStart = css.indexOf(SCALE_SECTION);
assert.notEqual(scaleStart, -1, "the stylesheet has a named internal scaling section");
const baseCss = css.slice(0, scaleStart);

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBody(source, selector) {
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped(selector)}\\s*\\{([^{}]*)\\}`, "m"));
  assert.ok(match, `rule exists: ${selector}`);
  return match[1];
}

function iconRuleBody(source) {
  const match = source.match(/(?:^|\n)\s*\.dc-social-icon svg,\s*\.dc-social-icon img\s*\{([^{}]*)\}/m);
  assert.ok(match, "shared SVG/image icon rule exists");
  return match[1];
}

function mediaBlock(width) {
  const start = css.indexOf(`@media (min-width: ${width}px)`);
  assert.notEqual(start, -1, `scaling media block exists for ${width}px`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  assert.fail(`unterminated media block for ${width}px`);
}

function declaration(body, property) {
  const match = body.match(new RegExp(`(?:^|;)\\s*${escaped(property)}\\s*:\\s*([^;]+);`));
  assert.ok(match, `${property} declaration exists`);
  return match[1].trim();
}

function length(value) {
  if (value === "0") return 0;
  const match = value.match(/^(-?\d+(?:\.\d+)?)(px|rem)$/);
  assert.ok(match, `CSS length is px/rem: ${value}`);
  return Number(match[1]) * (match[2] === "rem" ? PX_PER_REM : 1);
}

function number(value) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  assert.ok(match, `CSS number exists: ${value}`);
  return Number(match[0]);
}

function lengths(value) {
  return value.trim().split(/\s+/).map(length);
}

function expandBox(value) {
  const values = lengths(value);
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  assert.equal(values.length, 4, `box shorthand has at most four values: ${value}`);
  return values;
}

function boxValues(body, shorthand, sides) {
  const raw = declaration(body, shorthand);
  return expandBox(raw);
}

function metricSet(source, { base = false } = {}) {
  const card = ruleBody(source, ".dc-social-card");
  const hover = ruleBody(source, ".dc-social-card:hover");
  const pic = ruleBody(source, ".dc-social-pic");
  const name = ruleBody(source, ".dc-social-name");
  const bio = ruleBody(source, ".dc-social-name span");
  const media = ruleBody(source, ".dc-social-media");
  const divider = ruleBody(source, ".dc-social-media::before");
  const icon = iconRuleBody(source);
  const iconItem = ruleBody(source, ".dc-social-icon");
  const tooltip = ruleBody(source, ".dc-social-tooltip");
  const arrow = ruleBody(source, ".dc-social-tooltip::after");

  const padding = base
    ? [
      length(declaration(card, "padding-top")),
      length(declaration(card, "padding-right")),
      length(declaration(card, "padding-bottom")),
      length(declaration(card, "padding-left")),
    ]
    : boxValues(card, "padding");
  const tooltipPadding = expandBox(declaration(tooltip, "padding"));

  const border = number(declaration(card, base ? "border" : "border-width"));
  const logoBorder = number(declaration(pic, base ? "border" : "border-width"));
  const dividerMargin = expandBox(declaration(divider, "margin"));
  const arrowWidths = expandBox(declaration(arrow, "border-width"));

  const referenceName = ruleBody(baseCss, ".dc-social-name");
  const referenceBio = ruleBody(baseCss, ".dc-social-name span");

  return {
    paddingTop: padding[0],
    paddingRight: padding[1],
    paddingBottom: padding[2],
    paddingLeft: padding[3],
    radius: length(declaration(card, "border-radius")),
    border,
    hoverLift: Math.abs(number(declaration(hover, "transform"))),
    logo: length(declaration(pic, "width")),
    logoBorder,
    name: length(declaration(name, "font-size")),
    nameLineHeight: number(declaration(base ? name : referenceName, "line-height")),
    bio: length(declaration(bio, "font-size")),
    bioLineHeight: number(declaration(base ? bio : referenceBio, "line-height")),
    nameMarginTop: length(declaration(name, "margin-top")),
    divider: length(declaration(divider, "height")),
    dividerMarginTop: dividerMargin[0],
    dividerMarginBottom: dividerMargin[2],
    icon: length(declaration(icon, "width")),
    iconGap: length(declaration(iconItem, "margin-right")),
    iconRowGap: length(declaration(media, "row-gap")),
    tooltip: length(declaration(tooltip, "font-size")),
    tooltipPaddingTop: tooltipPadding[0],
    tooltipPaddingRight: tooltipPadding[1],
    tooltipPaddingBottom: tooltipPadding[2],
    tooltipPaddingLeft: tooltipPadding[3],
    tooltipArrowTop: arrowWidths[0],
    tooltipArrowRight: arrowWidths[1],
    tooltipArrowBottom: arrowWidths[2],
    tooltipArrowLeft: arrowWidths[3],
  };
}

const base = metricSet(baseCss, { base: true });
const at640 = metricSet(mediaBlock(640));
const at768 = metricSet(mediaBlock(768));
const steps = [base, at640, at768];
const boxes = [520, 640, 740];

const metricKeys = [
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "radius", "border", "hoverLift",
  "logo", "logoBorder", "name", "bio", "nameMarginTop", "divider", "dividerMarginTop",
  "dividerMarginBottom", "icon", "iconGap", "iconRowGap", "tooltip", "tooltipPaddingTop",
  "tooltipPaddingRight", "tooltipPaddingBottom", "tooltipPaddingLeft", "tooltipArrowTop",
  "tooltipArrowRight", "tooltipArrowLeft",
];

function expectedTolerance(target) {
  return Math.max(target * 0.05, 1);
}

test("the 640px and 768px scaling media blocks are present", () => {
  assert.match(css, /@media \(min-width: 640px\)\s*\{/);
  assert.match(css, /@media \(min-width: 768px\)\s*\{/);
  assert.match(css, /Internal scaling[\s\S]*?box height \/ 520/);
});

test("the 520px phone step pins the enlarged brand metrics", () => {
  assert.equal(base.paddingTop, 25);
  assert.equal(base.paddingRight, 20);
  assert.equal(base.paddingBottom, 25);
  assert.equal(base.paddingLeft, 20);
  assert.equal(base.border, 4);
  assert.equal(base.radius, 10);
  assert.equal(base.hoverLift, 10);
  assert.equal(base.logo, 288);
  assert.equal(base.logoBorder, 4);
  assert.equal(base.name, 22);
  assert.equal(base.bio, 18);
  assert.equal(base.nameMarginTop, 16);
  assert.equal(base.divider, 2);
  assert.equal(base.dividerMarginTop, 16);
  assert.equal(base.dividerMarginBottom, 16);
  assert.equal(base.icon, 24);
  assert.equal(base.iconGap, 18);
  assert.equal(base.iconRowGap, 14);
  assert.equal(base.tooltip, 14.4);
  assert.deepEqual(
    [base.tooltipPaddingTop, base.tooltipPaddingRight, base.tooltipPaddingBottom, base.tooltipPaddingLeft],
    [10, 8, 10, 8],
  );
  assert.deepEqual(
    [base.tooltipArrowTop, base.tooltipArrowRight, base.tooltipArrowBottom, base.tooltipArrowLeft],
    [12, 12, 0, 12],
  );
  assert.match(baseCss, /background: #2cb5a0;/);
  assert.match(baseCss, /border: 4px solid #7cdacc;/);
  assert.match(baseCss, /box-shadow: 0 6px 10px rgba\(207, 212, 222, 1\);/);
  assert.match(baseCss, /font-weight: 600;/);
  assert.match(baseCss, /\.dc-social-name span[\s\S]*?font-weight: 200;/);
  assert.match(baseCss, /\.dc-social-media::before[\s\S]*?background: #7cdacc;/);
  assert.match(baseCss, /fill: currentColor;/);
  assert.match(baseCss, /filter: brightness\(0\) invert\(1\);/);
  assert.match(baseCss, /transform: translate\(-50%, -130%\);/);
});

test("every stepped metric is within five percent or one pixel of boxHeight / 520", () => {
  for (const [stepIndex, metric] of steps.entries()) {
    const scale = boxes[stepIndex] / 520;
    for (const key of metricKeys) {
      const target = base[key] * scale;
      const difference = Math.abs(metric[key] - target);
      assert.ok(
        difference <= expectedTolerance(target),
        `${key} at ${boxes[stepIndex]}px is ${metric[key]}, expected ${target.toFixed(3)} ± ${expectedTolerance(target).toFixed(3)}`,
      );
    }
    // The zero bottom side is the fixed part of the arrow shorthand; the
    // three visible arrow sides are the stepped metric above.
    assert.equal(metric.tooltipArrowBottom, 0);
  }
});

test("every stepped metric is strictly monotonic", () => {
  for (const key of metricKeys) {
    assert.ok(at640[key] > base[key], `${key} grows at 640px`);
    assert.ok(at768[key] > at640[key], `${key} grows at 768px`);
  }
});

function contentStack(metric, nameLines = 1, bioLines = 1) {
  // box-sizing:border-box means the declared logo size already contains its
  // two ring borders. Account for the face and ring explicitly without
  // double-counting those borders in the vertical stack.
  const logoFace = metric.logo - (2 * metric.logoBorder);
  const logoWithRing = logoFace + (2 * metric.logoBorder);
  const nameHeight = nameLines * metric.name * base.nameLineHeight;
  const bioHeight = bioLines * metric.bio * base.bioLineHeight;
  const dividerHeight = metric.divider
    + metric.dividerMarginTop
    + metric.dividerMarginBottom;
  const iconRowHeight = metric.iconRowGap + metric.icon;

  return metric.paddingTop
    + metric.border
    + logoWithRing
    + metric.nameMarginTop
    + nameHeight
    + bioHeight
    + dividerHeight
    + iconRowHeight
    + metric.paddingBottom
    + metric.border;
}

test("the content stack stays proportional and a typical name + bio still fit", () => {
  const normalStacks = steps.map((metric) => contentStack(metric));
  const ratios = normalStacks.map((stack, index) => stack / (boxes[index] - (2 * steps[index].border)));
  const baselineRatio = ratios[0];

  for (const [index, ratio] of ratios.entries()) {
    assert.ok(
      Math.abs((ratio / baselineRatio) - 1) <= 0.08,
      `normal content ratio at ${boxes[index]}px stays within 8% of ${baselineRatio.toFixed(4)}`,
    );
  }

  // The circular logo is half the phone box (18rem). A one-line name +
  // one-line bio must still sit under it inside the reserved 520 / 640 /
  // 740 slot; wrapping copy can use the remaining flex space.
  for (const [index, metric] of steps.entries()) {
    const slack = boxes[index] - normalStacks[index];
    assert.ok(slack >= 20, `${boxes[index]}px card has ${slack.toFixed(1)}px typical-copy slack`);
  }
});

test("the ramp is CSS-only and contains no forbidden viewport/container sizing", () => {
  assert.doesNotMatch(css, /\b\d+(?:\.\d+)?(?:vw|vmin|cqw|cqi)\b/i);
  assert.doesNotMatch(cardSource, /\b(?:innerWidth|innerHeight|outerWidth|outerHeight|matchMedia|getBoundingClientRect|ResizeObserver)\b/);
  assert.doesNotMatch(cardSource, /\bstyle\s*=/i);
  assert.doesNotMatch(css.slice(scaleStart), /\b(?:javascript|onclick)\b/i);
});

test("Home and Admin keep the matching 520 / 640 / 740 boxes", () => {
  const homeBoxes = homeApp.match(/h-\[520px\][^"`]*sm:h-\[640px\][^"`]*md:h-\[740px\]/g) || [];
  assert.equal(homeBoxes.length, 2, "Home wall and social slot each keep the height ladder");
  assert.ok(homeBoxes.every((box) => box.includes("w-full")));
  assert.match(brandingPage, /h-\[520px\] w-full sm:h-\[640px\] md:h-\[740px\]/);
  assert.match(homeApp, /data-home-social-slot/);
});

test("static, preview, reduced-motion and data-hook contracts survive", () => {
  assert.match(css, /\.dc-social-card--static\s*\{/);
  assert.match(css, /\.dc-social-card--static:hover\s*\{[\s\S]*?transform: none;/);
  assert.match(css, /\.dc-social-card--preview\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  for (const hook of [
    "data-home-social-card",
    "data-home-social-card-linked",
    "data-home-social-card-static",
    "data-home-social-card-name",
    "data-home-social-links",
    "data-home-social-icon",
    "data-social-platform",
  ]) {
    assert.match(cardSource, new RegExp(hook));
  }
});
