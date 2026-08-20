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

test("after creation, dashboard shows plan details without another generation shortcut", () => {
  assert.match(dashboard, /<RevisionPlanCarousel plans=\{revisionPlans\}/);
  assert.match(dashboard, /Start Revision/);
  assert.match(dashboard, /details\.subjectNames/);
  assert.match(dashboard, /details\.chapterNames/);
  assert.match(dashboard, /details\.topicNames/);
  assert.doesNotMatch(dashboard, /New AI test|Generate another test/);
});

test("multiple plans support direct swipe and previous/next controls", () => {
  assert.match(dashboard, /drag=\{plans\.length > 1 \? "x" : false\}/);
  assert.match(dashboard, /onDragEnd=\{onDragEnd\}/);
  assert.match(dashboard, /Previous revision plan/);
  assert.match(dashboard, /Next revision plan/);
  assert.match(dashboard, /Swipe to change plan/);
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
