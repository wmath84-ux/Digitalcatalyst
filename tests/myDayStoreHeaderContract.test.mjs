import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const taskList = fs.readFileSync("src/components/myday/TaskList.tsx", "utf8");
const taskItem = fs.readFileSync("src/components/myday/TaskItem.tsx", "utf8");
const remCss = fs.readFileSync("src/myday-reminders.css", "utf8");

test("My Day renders ONE header — the shared store header, rebranded", () => {
  assert.match(myDay, /import StoreHeader from "\.\/components\/Header"/);
  const storeHeader = myDay.indexOf("<StoreHeader");
  assert.ok(storeHeader >= 0, "shared store header is missing");
  // The old second My Day toolbar header is gone — the page must not render
  // a separate sticky "My Day" header below the store header anymore.
  assert.doesNotMatch(myDay, /sticky top-\[68px\]/);
  assert.doesNotMatch(myDay, /Eduvora Tasker/);
  assert.doesNotMatch(myDay, /<h1 className="hidden text-lg font-bold text-slate-900 lg:block">My Day<\/h1>/);
});

test("My Day rebrands the shared header: app-name Tasker + My Day Activities", () => {
  // The title is now driven by the branding context (so the merchant's
  // chosen app name shows up here) and the literal "Eduvora Taskar"
  // string is no longer hardcoded. The brand evolved from "Taskar" to
  // "Tasker" — the test follows the latest source.
  assert.match(myDay, /title=\{`\$\{appName\} Tasker`\}/);
  assert.match(myDay, /subtitle="My Day Activities"/);
});

test("OWNER BRIEF 2026-09-29: the My Day header carries NO search icon", () => {
  // "My day page per header mein search icon nahin dikhna chahiye — remove
  // karo use kyunki already page per hai." The pages own their search
  // (Tasks has its glass search rail, Reminders its search box), so the
  // header's search entry point is gone: no toggle prop, no icon tab, no
  // desktop pill, no phone strip, no Ctrl+K handler.
  assert.match(myDay, /onDownloadReport=\{handleDownloadReport\}/);
  assert.doesNotMatch(myDay, /onToggleSearch/);
  assert.doesNotMatch(myDay, /searchActive/);
  assert.doesNotMatch(myDay, /centerSearch/);
  assert.doesNotMatch(myDay, /showMobileSearch/);
  assert.doesNotMatch(myDay, /myday-header-search/);
  assert.doesNotMatch(myDay, /Search tasks, notes\.\.\./);
  assert.doesNotMatch(myDay, /ctrlKey/);
  // The shared header still SUPPORTS the props (the store keeps its search);
  // My Day simply passes none of them.
  assert.match(header, /onToggleSearch\?:/);
  assert.match(header, /searchActive\?:/);
});

test("the pages keep their own search — the header one was the duplicate", () => {
  // Tasks: the glass search rail.
  assert.match(taskList, /Search tasks by title or subject\.\.\./);
  // Reminders: its own search box.
  const reminders = fs.readFileSync("src/components/myday/Reminders.tsx", "utf8");
  assert.match(reminders, /Search reminders…/);
});

test("OWNER BRIEF 2026-09-29: the Tasks page wears the Reminders type scale", () => {
  // "My day ka reminder page ka jo font hai aur font ka size hai vahi task
  // page per bhi apply karo — jo heading ka size hai jo sub heading ka size
  // hai etc." One shared rule pair in myday-reminders.css drives both pages,
  // so the sizes cannot drift: heading 1.32rem/800 (1.5rem from sm) and sub
  // 0.76rem/500 (0.83rem from sm).
  assert.match(remCss, /\.myrem-title,\s*\n\.myday-tasks-title \{/);
  assert.match(remCss, /\.myrem-sub,\s*\n\.myday-tasks-sub \{/);
  assert.match(remCss, /\.myrem-title,\s*\n\s*\.myday-tasks-title \{ font-size: 1\.5rem; \}/);
  assert.match(remCss, /\.myrem-sub,\s*\n\s*\.myday-tasks-sub \{ font-size: 0\.83rem; \}/);
  // …and the Tasks hero actually wears it (the old 1.9–2.4rem greeting is
  // gone).
  assert.match(taskList, /className="myday-tasks-title"/);
  assert.match(taskList, /className="myday-tasks-sub"/);
  assert.doesNotMatch(taskList, /myday-greeting/);
  assert.doesNotMatch(taskList, /text-\[1\.9rem\]/);
  // The task rows match the Reminders card scale too: title 0.9rem/700
  // (.myrem-card-title), meta note 0.74rem/500 (.myrem-card-note).
  assert.match(taskItem, /myday-task-title truncate text-\[0\.9rem\] font-bold/);
  assert.match(taskItem, /text-\[0\.74rem\] font-medium text-white\/55/);
});
