import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dashboard = fs.readFileSync("src/revision/pages/DashboardPage.tsx", "utf8");
const generator = fs.readFileSync("src/revision/pages/AiGeneratePage.tsx", "utf8");
const customTests = fs.readFileSync("src/revision/engine/customTestService.ts", "utf8");
const stats = fs.readFileSync("src/revision/engine/statsService.ts", "utf8");

test("dashboard replaces the random Daily 5 hero with an AI revision-plan entry", () => {
  assert.doesNotMatch(dashboard, /TodayTestCard|Daily 5|Today&apos;s Test/);
  assert.match(dashboard, /revisionPlans\.length === 0/);
  assert.match(dashboard, /Generate Questions with AI/);
  assert.match(dashboard, /Create my revision plan/);
  assert.match(dashboard, /onRequireAccess/);
});

test("after creation, the dashboard hero is the saved-test SLIDE DECK", () => {
  // Owner's reference (2026-10-04): https://aicanvas.me/components/slide-deck.
  // The glass hero card and its arrow carousel are GONE; the deck — ported
  // from that reference in src/revision/components/PlanSlideDeck.tsx — is the
  // dashboard's hero, and it is built from the learner's saved tests.
  const deck = fs.readFileSync("src/revision/components/PlanSlideDeck.tsx", "utf8");
  assert.match(dashboard, /<PlanSlideDeck/);
  assert.match(dashboard, /slides=\{revisionPlans\.map/);
  assert.match(dashboard, /planToSlide\(plan, index, revisionPlans\.length\)/);
  // The card's content is the owner's mapping: SUBJECT on top, the test's own
  // COUNT as the big numeral, the TEST NAME under it and the CHAPTER NAME as
  // the supporting line. Test name / chapter come FROM THE DATA (the import
  // type-in or the generator's own selection) — nothing is invented here.
  assert.match(dashboard, /const subject = displayList\(details\.subjectNames, "General"\);/);
  assert.match(dashboard, /const chapter = displayList\(details\.chapterNames, "Not labelled"\);/);
  assert.match(dashboard, /countLabel: String\(plan\.totalQuestions\),/);
  assert.match(dashboard, /title: plan\.title,/);
  assert.match(dashboard, /chapter,/);
  assert.match(dashboard, /Start Revision/);
  assert.match(deck, /data-slide-subject/);
  assert.match(deck, /data-slide-count/);
  assert.match(deck, /data-slide-title/);
  assert.match(deck, /data-slide-chapter/);
  assert.doesNotMatch(dashboard, /New AI test|Generate another test/);
  // The old hero design left no trace: no carousel, no arrow buttons.
  assert.doesNotMatch(dashboard, /RevisionPlanCarousel|RevisionPlanCard/);
  assert.doesNotMatch(dashboard, /Previous revision plan|Next revision plan/);
});

test("the deck keeps the existing count, swipes, and navigates by its dots", () => {
  // The reference ships four fixed slides; this deck must hold EVERY saved
  // test — the existing count, unchanged — so the ring is built from the
  // plans and each card's slot is the reference's own `(id - current) % n`.
  const deck = fs.readFileSync("src/revision/components/PlanSlideDeck.tsx", "utf8");
  assert.match(dashboard, /slides=\{revisionPlans\.map/);
  assert.match(deck, /const offset = \(index - current \+ count\) % count;/);
  assert.match(deck, /data-slide-count=\{count\}/);
  // Swipe + dots: the drag lives on the front card only, and navigation is
  // dots-only (the reference has no arrows).
  assert.match(deck, /drag=\{isFront && count > 1 \? "x" : false\}/);
  assert.match(deck, /onDragEnd=\{onDragEnd\}/);
  assert.match(deck, /data-rev-plan-dots/);
  assert.match(deck, /Swipe the card for the next test/);
  assert.doesNotMatch(deck, /Previous revision plan|Next revision plan|overflow-x-auto/);
});

test("generator persists the exact syllabus metadata used by dashboard cards", () => {
  assert.match(generator, /planDetails:\s*\{/);
  assert.match(generator, /classNames: Array\.from/);
  assert.match(generator, /subjectNames: Array\.from/);
  assert.match(generator, /chapterNames: Array\.from/);
  assert.match(generator, /topicNames: Array\.from/);
  assert.match(customTests, /planDetails: input\.planDetails/);
  assert.match(customTests, /Old saved tests did not have planDetails/);
});

test("revision dashboard metrics do not create a random daily test", () => {
  const overview = stats.slice(stats.indexOf("export function getRevisionOverview"), stats.indexOf("/** @deprecated"));
  assert.doesNotMatch(overview, /getOrCreateDailyTests|markExpiredAttempts/);
  assert.match(dashboard, /getRevisionOverview\(uid\)/);
});
