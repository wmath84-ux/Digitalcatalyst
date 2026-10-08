import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const homeDataModule = { exports: {} };
const compiledHomeData = ts.transpile(read("src/home/data/homeDashboardData.ts"), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 });
new Function("exports", "require", "module", compiledHomeData)(homeDataModule.exports, () => { throw new Error("Unexpected runtime import in Home data helpers"); }, homeDataModule);
const { calculateCourseProgress, findCurrentLesson, clampProgress, wrapCarouselIndex } = homeDataModule.exports;
const app = read("src/home/App.tsx");
const styles = read("src/home/home.css");
const continueLearning = read("src/home/components/ContinueLearning.tsx");
const productCard = read("src/home/components/ProductCard.tsx");
const hero = read("src/home/components/HeroCarousel.tsx");
const reviews = read("src/home/components/Reviews.tsx");
const feedback = read("src/home/components/FeedbackSection.tsx");

const renderStart = app.indexOf("{homeBanners.length > 0 ? (");

test("Home renders the requested dashboard sequence", () => {
  const order = [
    renderStart,
    app.indexOf("<div data-home-category-nav>", renderStart),
    app.indexOf("<div data-home-continue>", renderStart),
    app.indexOf("<section data-home-trending", renderStart),
    app.indexOf('title="Recommended for You"', renderStart),
    app.indexOf("<div data-home-reviews>", renderStart),
    app.indexOf("<FeedbackSection", renderStart),
  ];
  assert.ok(order.every((index) => index >= 0), `all Home sections should be present: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "section source order should match the dashboard flow");
  assert.doesNotMatch(app, /PublicPacksRail|StickerWall|SocialProfileCard/);
});

test("hero uses configured content or actual catalog data, never placeholder claims", () => {
  assert.match(app, /if \(usingCustom\) return configuredBanners/);
  assert.match(app, /tags\.includes\("FEATURED"\)/);
  assert.match(app, /tags\.includes\("TRENDING"\)/);
  assert.match(app, /right\.reviews > 0 && Number\.isFinite\(right\.rating\)/);
  assert.match(app, /return rightRating - leftRating \|\| right\.reviews - left\.reviews/);
  assert.match(app, /countCourseModules\(modules\)/);
  assert.match(app, /collectCourseResources\(modules\)\.length/);
  assert.match(app, /if \(!featured\) return \[\]/);
  assert.match(app, /<HeroCarousel banners=\{homeBanners\}/);
  assert.match(app, /catalogLoading \? \([\s\S]*?<HeroSkeleton \/>/);
});

test("Continue Learning uses saved progress and current lesson, and handles variable values", () => {
  assert.match(app, /collection\(db, "users", user\.id, "courseProgress"\)/);
  assert.match(app, /lastOpenedFileId: typeof data\.lastOpenedFileId === "string"/);
  assert.match(app, /calculateCourseProgress\(record\.completedFileIds, resources\.map/);
  assert.match(app, /findCurrentLesson\(resources, record\.lastOpenedFileId\)/);
  assert.match(continueLearning, /clampProgress\(item\.progress\)/);
  assert.match(continueLearning, /aria-valuenow=\{progress\}/);
  assert.match(styles, /\.dc-home-continue-title \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?-webkit-line-clamp: 2;/);
  assert.match(continueLearning, /title=\{item\.title\}/);
  assert.match(app, /onResume: \(\) => onNavigateToCourse\(item\)/);
});

test("Home progress helpers cover empty, partial, complete, stale, and out-of-range values", () => {
  const resources = ["r1", "r2", "r3", "r4"];
  assert.equal(calculateCourseProgress([], resources), 0);
  assert.equal(calculateCourseProgress(["r1"], resources), 25);
  assert.equal(calculateCourseProgress(["r1", "r3"], resources), 50);
  assert.equal(calculateCourseProgress(["r1", "r1", "stale"], resources), 25);
  assert.equal(calculateCourseProgress(resources, resources), 100);
  assert.equal(calculateCourseProgress(["r1"], []), 0);

  assert.equal(clampProgress(-20), 0);
  assert.equal(clampProgress(32.6), 33);
  assert.equal(clampProgress(100), 100);
  assert.equal(clampProgress(140), 100);
  assert.equal(clampProgress(Number.NaN), 0);

  const locations = [
    { moduleTitle: "Algebra", resource: { id: "r2", name: "Linear equations" } },
    { moduleTitle: "", resource: { id: "r3", name: "Practice set" } },
  ];
  assert.equal(findCurrentLesson(locations, "r2"), "Algebra · Linear equations");
  assert.equal(findCurrentLesson(locations, "r3"), "Practice set");
  assert.equal(findCurrentLesson(locations, "missing"), undefined);
  assert.equal(findCurrentLesson(locations), undefined);
});

test("carousel index wraps safely for zero, one, and multiple banner counts", () => {
  assert.equal(wrapCarouselIndex(0, 0), 0);
  assert.equal(wrapCarouselIndex(0, 1), 0);
  assert.equal(wrapCarouselIndex(8, 1), 0);
  assert.equal(wrapCarouselIndex(2, 3), 2);
  assert.equal(wrapCarouselIndex(3, 3), 0);
  assert.equal(wrapCarouselIndex(-1, 3), 2);
  assert.match(hero, /wrapCarouselIndex\(index, total\)/);
  assert.match(hero, /if \(total < 2 \|\| isDragging/);
});

test("category trends and product proof are catalog-backed and guarded", () => {
  assert.match(app, /visibleCategories = useMemo\(\(\) => categories\.filter/);
  assert.match(app, /activeCategory === "all"/);
  assert.match(app, /explicitlyTrending\.length > 0 \? explicitlyTrending : categoryProducts/);
  assert.match(app, /slice\(0, HOME_PRODUCT_LIMIT\)/);
  assert.match(productCard, /product\.ratingCount > 0/);
  assert.match(productCard, /product\.isFree === true/);
  assert.match(productCard, /product\.mrp > product\.price/);
  assert.match(productCard, /GENERIC_SUBJECTS/);
  assert.match(productCard, /title=\{product\.title\}/);
  assert.match(styles, /\.dc-home-product-title \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?-webkit-line-clamp: 2;/);
});

test("recommendations stay absent without a real learner signal and useful matches", () => {
  assert.match(app, /if \(continueLearningEntries\.length > 0\) return continueLearningEntries\.map/);
  assert.match(app, /return products\.filter\(\(product\) => purchasedIds\.has\(product\.id\)\)/);
  assert.match(app, /if \(recommendationSources\.length === 0\) return \[\]/);
  assert.match(app, /\.filter\(\(\{ relevance \}\) => relevance > 0\)/);
  assert.match(app, /recommendedProducts\.length > 0 \?/);
});

test("reviews show published data only and make verification conditional", () => {
  assert.match(app, /review\.source === "live"/);
  assert.match(app, /Number\.isFinite\(review\.rating\)/);
  assert.match(reviews, /review\.verifiedPurchase \? <BadgeCheck/);
  assert.match(reviews, /review\.verifiedPurchase \? <><span>Verified learner/);
  assert.match(reviews, /onOpenReview\(review\.productId\)/);
});

test("feedback stays compact and reuses the existing query submission flow", () => {
  assert.match(feedback, /createUserQuery\(trimmed\.slice\(0, MAX_FEEDBACK_LENGTH\)\)/);
  assert.match(feedback, /MAX_FEEDBACK_LENGTH = 500/);
  assert.match(app, /returnHash = window\.location\.hash \|\| "#\/home"/);
  assert.match(app, /mode=login&return=/);
  assert.match(styles, /\.dc-home-feedback-content/);
  assert.match(styles, /@media \(max-width: 480px\)/);
});

test("layout is Home-scoped, responsive, reduced-motion aware, and keeps nav clearance", () => {
  assert.match(styles, /\[data-home-content\] \{/);
  assert.match(styles, /@media \(min-width: 640px\)/);
  assert.match(styles, /@media \(min-width: 960px\)/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /@media \(max-width: 350px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /<main className="flex-1 overflow-y-auto pb-2">/);
  assert.match(app, /<BottomNav[\s\S]*?peekAlwaysOpen/);
  assert.doesNotMatch(styles, /(?:^|\n)\s*(?:body|header|footer|nav|\.dc-app-frame|\.dc-app-shell)\s*\{/);
});

test("hero carousel remains safe with one or no slides and respects reduced motion", () => {
  assert.match(hero, /if \(total === 0\) return null/);
  assert.match(hero, /if \(total === 0\) return/);
  assert.match(hero, /total < 2 \|\| isDragging/);
  assert.match(hero, /prefers-reduced-motion: reduce/);
  assert.match(hero, /setActiveIndex\(\(current\) => wrapCarouselIndex\(current, total\)\)/);
});
