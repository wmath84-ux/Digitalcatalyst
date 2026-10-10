// src/utils/selfExperiments.ts
//
// SELF side of the Course Player's Experiment tab — the learner's OWN 2D
// experiments, created from the page's “+” with the very same builder My Study
// Library offers (AI prompt → paste / upload / template → live preview →
// Create), and stored on the Study Library shelf.
//
// ── Where they live, and why ───────────────────────────────────────────────
// A learner-made experiment is an `interactive` resource — the same shape the
// Study Library's builder already writes (`interactiveHtml`, see
// src/utils/experimentSpec.ts) — inside ONE dedicated library course,
// `users/{uid}/myCourses/my-experiments` (“My experiments”). Consequences, all
// deliberate:
//
//   · it syncs to every device and survives a reinstall (myCourses is the
//     Study Library's own cloud shelf, already writable by its owner);
//   · it opens in the Study Library like any other resource and is editable
//     there with the existing experiment editor
//     (src/personal-library/MyCourseExperimentEditor.tsx), so nothing about
//     the library changes;
//   · the Experiment tab does NOT have to guess which experiments are “for
//     this course”: every created resource carries `experimentSourceProductId`
//     — the `storageProductId` of the player it was created from — and only
//     experiments tagged for the open course are listed in SELF;
//   · the 200 KB / 640 KB budgets the library and the server already enforce
//     (myCourseClient / utils/myCourseDoc.js) keep applying untouched.
//
// The library document itself is built by `src/lib/myCourseClient.ts`
// (`createMyCourse` / `createMyModule` / `createMyResource`), so the stored
// schema stays defined in ONE place; `placeSelfExperiment` only decides WHICH
// module an experiment lands in and what the resource carries. That is also
// why the document builders arrive as `factories` — this module stays pure, so
// the node test runner can exercise every rule with stub factories.

// The explicit `.ts` extension is the repo's convention for a runtime import
// between two TypeScript modules (src/joplin/*): it is what lets `node --test`
// load this file directly, next to the Vite bundle.
import {
  experimentBlockingIssues,
  experimentByteLength,
  experimentHasSource,
} from "./experimentSpec.ts";
import { formatMindMapIssue, validateMindMapObject } from "../../utils/mindMapImport.js";
import type { CourseFile } from "../types/course";
import type { MyCourse, MyCourseModule, MyCourseResource, MyCourseResourceType } from "../types/myCourse";

/** The stable id of the learner's “My experiments” library course. */
export const SELF_EXPERIMENTS_COURSE_ID = "my-experiments";
/** The title that course carries on the Study Library shelf. */
export const SELF_EXPERIMENTS_COURSE_TITLE = "My experiments";
/** One line of shelf copy: says where they came from and where to edit them. */
export const SELF_EXPERIMENTS_COURSE_DESCRIPTION =
  "Interactive 2D experiments you created from the Course Player's Experiment page. Open one here to edit its code or preview it.";

/**
 * One item the Experiment page lists and opens: a learner's own 2D experiment
 * (`kind: "experiment"`) or their own mind map (`kind: "mind_map"`, with the
 * validated map JSON in `mindMapData`). Both share the same scope tag and the
 * same “My experiments” shelf course.
 */
export interface SelfExperiment {
  id: string;
  kind: SelfExperimentKind;
  moduleId: string;
  moduleTitle: string;
  title: string;
  html: string;
  url: string;
  mindMapData?: Record<string, unknown>;
}

export type SelfExperimentKind = "experiment" | "mind_map";

export interface SelfExperimentFactories {
  createCourse: (uid: string, title: string) => MyCourse;
  createModule: (title: string) => MyCourseModule;
  createResource: (type?: MyCourseResourceType) => MyCourseResource;
}

export interface SelfExperimentPlacementInput {
  /** The live “My experiments” course, when the shelf already holds it. */
  course?: MyCourse | null;
  uid?: string;
  /** The player scope the experiment belongs to (`storageProductId`). */
  productId?: string;
  /** Used for the shelf copy only — never for access. */
  courseTitle?: string;
  /** The module being watched, else the course title. */
  moduleTitle?: string;
  name?: string;
  html?: string;
  url?: string;
  /** A learner mind map's JSON (`placeSelfMindMap` only). */
  mindMapData?: Record<string, unknown>;
}

export interface SelfExperimentPlacement {
  course: MyCourse | null;
  resource: MyCourseResource | null;
  issues: string[];
}

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();

const cloneCourse = (course: MyCourse): MyCourse =>
  typeof structuredClone === "function" ? structuredClone(course) : (JSON.parse(JSON.stringify(course)) as MyCourse);

/**
 * Every reason a draft experiment cannot be created yet. Only HARD failures
 * (over-size, nothing to run) block — the softer advice (`experimentIssues`
 * warns) stays in the builder, where the learner can hand it back to the AI.
 * Reads the shared rules from `experimentSpec`, so the player, the Study
 * Library builder and the server agree on what a valid experiment is.
 */
export const selfExperimentIssues = (html?: string | null, url?: string | null): string[] => {
  const source = String(html ?? "");
  if (source.trim()) return experimentBlockingIssues(source).map((issue) => issue.message);
  return experimentHasSource(source, url) ? [] : ["add the experiment's HTML first"];
};

/** True when the draft would be accepted — what the Create button reads. */
export const selfExperimentReady = (html?: string | null, url?: string | null): boolean =>
  selfExperimentIssues(html, url).length === 0;

/**
 * Every reason a learner's mind map cannot be saved yet, named by path (the same
 * wording the admin editor and the Mind Map JSON import use). Empty when it fits.
 */
export const selfMindMapIssues = (data: unknown): string[] => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["paste the mind map JSON first"];
  const check = validateMindMapObject(data);
  return check.valid ? [] : check.errors.map((issue) => formatMindMapIssue(issue));
};

const visitModules = (modules: MyCourseModule[] | null | undefined, scope: string, out: SelfExperiment[]) => {
  for (const module of Array.isArray(modules) ? modules : []) {
    if (!module) continue;
    for (const resource of Array.isArray(module.resources) ? module.resources : []) {
      if (!resource) continue;
      if (toText(resource.experimentSourceProductId) !== scope) continue;
      const base = {
        id: String(resource.id || ""),
        moduleId: String(module.id || ""),
        moduleTitle: toText(module.title) || SELF_EXPERIMENTS_COURSE_TITLE,
      };
      if (resource.type === "mind_map") {
        // A map is listed only when its stored JSON still validates: an entry
        // the page cannot draw would only ever show an error.
        const data = resource.mindMapData;
        if (!data || selfMindMapIssues(data).length) continue;
        out.push({
          ...base,
          kind: "mind_map",
          title: toText(resource.name) || "Mind map",
          html: "",
          url: "",
          mindMapData: data as Record<string, unknown>,
        });
        continue;
      }
      if (resource.type !== "interactive") continue;
      const html = String(resource.interactiveHtml || "");
      const url = String(resource.url || "");
      if (!experimentHasSource(html, url)) continue;
      out.push({
        ...base,
        kind: "experiment",
        title: toText(resource.name) || "Experiment",
        html,
        url,
      });
    }
    visitModules(module.modules, scope, out);
  }
};

/**
 * The SELF list for one player scope: every `interactive` resource in “My
 * experiments” tagged with this course, in shelf order.
 */
export const selfExperimentsFromCourses = (
  courses: MyCourse[] | null | undefined,
  productId?: string | null,
): SelfExperiment[] => {
  const scope = toText(productId);
  if (!scope) return [];
  const out: SelfExperiment[] = [];
  for (const course of Array.isArray(courses) ? courses : []) {
    if (!course || String(course.id) !== SELF_EXPERIMENTS_COURSE_ID) continue;
    visitModules(course.modules, scope, out);
  }
  return out.filter((experiment) => Boolean(experiment.id));
};

/**
 * Shared placement: find or create the “My experiments” course, the module for
 * this source, and append ONE resource carrying the scope tag. Returns the course
 * document to save (`myLibrary.save`) — or the reasons it cannot be placed.
 */
const placeInSelfCourse = (
  source: SelfExperimentPlacementInput,
  factories: SelfExperimentFactories,
  resource: MyCourseResource,
): SelfExperimentPlacement => {
  const uid = toText(source.uid);
  const courseTitle = toText(source.courseTitle);
  const moduleTitle = toText(source.moduleTitle) || courseTitle || SELF_EXPERIMENTS_COURSE_TITLE;
  const scope = toText(source.productId);
  const now = Date.now();

  let working: MyCourse;
  if (source.course && String(source.course.id) === SELF_EXPERIMENTS_COURSE_ID) {
    working = cloneCourse(source.course);
  } else {
    if (!uid) return { course: null, resource: null, issues: ["sign in to save experiments"] };
    working = factories.createCourse(uid, SELF_EXPERIMENTS_COURSE_TITLE);
    // Pin the fixed id: createCourse would otherwise hand out a generated one,
    // and the lookup above (and in placeSelfExperiment) would never find it again.
    working.id = SELF_EXPERIMENTS_COURSE_ID;
    working.description = SELF_EXPERIMENTS_COURSE_DESCRIPTION;
    working.modules = [];
  }
  if (!Array.isArray(working.modules)) working.modules = [];

  const wanted = moduleTitle.toLowerCase();
  let module = working.modules.find((entry) => toText(entry && entry.title).toLowerCase() === wanted);
  if (!module) {
    module = factories.createModule(moduleTitle);
    module.resources = [];
    working.modules = [...working.modules, module];
  }
  if (!Array.isArray(module.resources)) module.resources = [];

  const placed: MyCourseResource = {
    ...resource,
    experimentSourceProductId: scope,
  };
  module.resources = [...module.resources, placed];
  module.updatedAt = now;
  working.updatedAt = now;

  return { course: working, resource: placed, issues: [] };
};

/**
 * Put a finished experiment into the library: the “My experiments” course
 * (created on first use through `factories.createCourse`), one root module per
 * source — the module the learner was watching, else the course title — and
 * one `interactive` resource inside it carrying the HTML and the scope tag.
 *
 * Returns the course document to save (`myLibrary.save`) plus the resource
 * that was added; returns `{ issues }` instead when the draft is not runnable,
 * so a broken experiment can never reach the shelf.
 */
export const placeSelfExperiment = (
  input: SelfExperimentPlacementInput | null | undefined,
  factories: SelfExperimentFactories | null | undefined,
): SelfExperimentPlacement => {
  const source = input ?? {};
  if (!isFactories(factories)) {
    return { course: null, resource: null, issues: ["this build cannot save experiments"] };
  }
  const html = String(source.html ?? "");
  const url = toText(source.url);
  const issues = selfExperimentIssues(html, url);
  if (issues.length) return { course: null, resource: null, issues };

  const name = toText(source.name) || "Experiment";
  const courseTitle = toText(source.courseTitle);
  return placeInSelfCourse(source, factories, {
    ...factories.createResource("interactive"),
    name,
    description: courseTitle ? `Created from Live Experiment · ${courseTitle}` : "Created from Live Experiment",
    interactiveHtml: html,
    url,
    size: experimentByteLength(html),
  });
};

/**
 * Put a learner's mind map into the library, in the same “My experiments” course
 * and under the same player scope as the experiments, so it is listed in SELF
 * for this course only and on every device. Refuses invalid JSON with the
 * validator's path-level reasons.
 */
export const placeSelfMindMap = (
  input: SelfExperimentPlacementInput | null | undefined,
  factories: SelfExperimentFactories | null | undefined,
): SelfExperimentPlacement => {
  const source = input ?? {};
  if (!isFactories(factories)) {
    return { course: null, resource: null, issues: ["this build cannot save mind maps"] };
  }
  const issues = selfMindMapIssues(source.mindMapData);
  if (issues.length) return { course: null, resource: null, issues };

  const name = toText(source.name) || "Mind map";
  const courseTitle = toText(source.courseTitle);
  return placeInSelfCourse(source, factories, {
    ...factories.createResource("mind_map"),
    name,
    description: courseTitle ? `Created from Live Experiment · ${courseTitle}` : "Created from Live Experiment",
    mindMapData: source.mindMapData,
    url: "",
  });
};

const isFactories = (factories: SelfExperimentFactories | null | undefined): factories is SelfExperimentFactories =>
  Boolean(
    factories &&
      typeof factories.createCourse === "function" &&
      typeof factories.createModule === "function" &&
      typeof factories.createResource === "function",
  );

/**
 * The stored experiment, as the Course Player's viewer stack wants it. Mirrors
 * the interactive branch of `myCourseAdapter.toCourseFile` — the player opens
 * it in the SAME sandboxed stage as an official experiment.
 */
export const selfExperimentCourseFile = (experiment: SelfExperiment): CourseFile =>
  experiment.kind === "mind_map"
    ? {
        id: experiment.id,
        name: experiment.title || "Mind map",
        type: "mind_map",
        mindMapData: experiment.mindMapData,
        accessLevel: "included",
      }
    : {
        id: experiment.id,
        name: experiment.title || "Experiment",
        type: "interactive",
        interactiveHtml: experiment.html,
        url: experiment.url || undefined,
        provider: "dc_experiment",
        accessLevel: "included",
      };
