// tests/mydayTaskTimePickerContract.test.mjs
//
// My Day's task modal used a free-text box with an "e.g., 04:00 PM"
// placeholder, so tapping Time never opened a clock — while the
// schedule and reminder modals both used `<input type="time">`. These
// tests pin the native picker in place and cover the coercion that
// keeps already-saved free-text times ("4 pm", "04:00 PM") from being
// wiped by a control that only accepts "HH:MM".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatTime12, to24h, toMinutes } from "../utils/timeOfDay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

test("every My Day time field uses the native picker", () => {
  const taskModal = read("src/components/myday/TaskModal.tsx");
  assert.match(taskModal, /type="time"/, "the task modal must render a native time input");
  assert.doesNotMatch(taskModal, /placeholder="e\.g\., 04:00 PM"/, "the free-text placeholder must be gone");

  // The two modals that already worked must not regress.
  assert.match(read("src/components/myday/ScheduleModal.tsx"), /type="time"/);
  assert.match(read("src/components/myday/Reminders.tsx"), /type="time"/);
});

test("the task modal opens the picker on tap and can clear the value", () => {
  const src = read("src/components/myday/TaskModal.tsx");
  assert.match(src, /showPicker/, "tapping the field should call showPicker()");
  assert.match(src, /data-myday-task-time/);
  // Time is optional — there must be a way back to 'no time'.
  assert.match(src, /Clear/);
});

test("stored free-text times are coerced before reaching the input", () => {
  const src = read("src/components/myday/TaskModal.tsx");
  assert.match(src, /to24h\(/, "initial task time must be normalised for the native input");
});

test("the shared util replaces the duplicated time helpers", () => {
  for (const file of ["src/components/myday/Timeline.tsx", "src/components/myday/Reminders.tsx", "src/components/myday/TaskItem.tsx"]) {
    assert.match(read(file), /utils\/timeOfDay/, `${file} should use the shared helpers`);
  }
  // The old copy-pasted implementations must be gone.
  assert.doesNotMatch(read("src/components/myday/Timeline.tsx"), /function toMinutes\(/);
  assert.doesNotMatch(read("src/components/myday/Reminders.tsx"), /function formatTime12\(/);
});

test("to24h normalises the formats real task data contains", () => {
  assert.equal(to24h("04:00 PM"), "16:00");
  assert.equal(to24h("4 pm"), "16:00");
  assert.equal(to24h("9:05 AM"), "09:05");
  assert.equal(to24h("12:00 AM"), "00:00");
  assert.equal(to24h("12:30 PM"), "12:30");
  assert.equal(to24h("16:00"), "16:00");
  assert.equal(to24h("9:5"), "09:05");
  assert.equal(to24h("16"), "16:00");
  // Unusable input must yield "" so the native input stays blank
  // rather than rendering an invalid value.
  assert.equal(to24h(""), "");
  assert.equal(to24h("tea time"), "");
  assert.equal(to24h("25:00"), "");
  assert.equal(to24h("10:75"), "");
  assert.equal(to24h(null), "");
});

test("formatTime12 round-trips and never destroys unparseable text", () => {
  assert.equal(formatTime12("16:00"), "4:00 PM");
  assert.equal(formatTime12("00:05"), "12:05 AM");
  assert.equal(formatTime12("12:00"), "12:00 PM");
  // A value we cannot parse is shown as-is instead of blanked.
  assert.equal(formatTime12("tea time"), "tea time");
});

test("toMinutes sorts unparseable values first instead of at midnight", () => {
  assert.equal(toMinutes("00:00"), 0);
  assert.equal(toMinutes("16:30"), 990);
  assert.equal(toMinutes("nonsense"), -1);
});
