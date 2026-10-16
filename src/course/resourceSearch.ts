// src/course/resourceSearch.ts
//
// THE COURSE LIBRARY'S SEARCH — the maths, with no React in it, so the rule can
// be tested directly and reused by the page's own search surface.
//
// Owner brief (2026-10-16):
//
//   "Ek hi search box hoga ... usi se sab library ki content bhi dikhenge aur
//    direct YouTube song ya lectures jo bhi search karega user."
//
// So one query has to be answered twice: the course library's OWN resources
// (lessons, notes, mind maps, brain cards, experiments, PDFs — the rows of the
// Modules library) and YouTube (through the SAME key-gated, never-scraping
// search the Music pane already owns; the network half lives in the panel).
//
// This file is the first half: which library rows match, and in what order.
//
//   · every term in the query must appear somewhere (so "note algebra" finds
//     the algebra note, and never everything that mentions "note");
//   · a term found in the TITLE outweighs one found in the kind/subtitle,
//     which outweighs the module path and the row's own metadata — a learner
//     searching "algebra" wants the algebra lesson above a note filed under an
//     algebra module;
//   · ties break by title, so the same query always lists the same way.

/** The row shape the matcher needs (CourseResourceLibrary's LibraryResource fits it). */
export interface SearchableResource {
  id: string;
  title: string;
  subtitle?: string;
  /** "lesson" | "note" | "mind-map" | "brain" | "experiment" | "read" … */
  kind?: string;
  /** The presenter's own small facts, e.g. "12 words", the root topic. */
  metadata?: string[];
  /** Module / submodule names, outermost first. */
  modulePath?: string[];
  /** Extra words a row wants to be found by (a file type's own name, say). */
  keywords?: string[];
}

export interface ResourceMatch<T extends SearchableResource> {
  resource: T;
  score: number;
}

/** Weights: a title hit is worth three path hits, a subtitle/kind hit two. */
const TITLE_WEIGHT = 3;
const SECONDARY_WEIGHT = 2;
const TAIL_WEIGHT = 1;

const hay = (value: string | undefined): string => String(value ?? "").toLowerCase();

const termsOf = (query: string): string[] =>
  String(query ?? "").toLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter(Boolean);

/** How much weight ONE term earns for ONE row (0 = this row does not match). */
export const termWeight = (resource: SearchableResource, term: string): number => {
  const title = hay(resource.title);
  if (title === term) return TITLE_WEIGHT * 3;
  if (title.startsWith(term)) return TITLE_WEIGHT * 2;
  if (title.includes(term)) return TITLE_WEIGHT;
  const secondary = [resource.subtitle, resource.kind].map(hay).join(" ");
  if (secondary.includes(term)) return SECONDARY_WEIGHT;
  const tail = [...(resource.metadata ?? []), ...(resource.modulePath ?? []), ...(resource.keywords ?? [])]
    .map(hay)
    .join(" ");
  if (tail.includes(term)) return TAIL_WEIGHT;
  return 0;
};

/**
 * The score for a whole query: every term must land somewhere, and the score is
 * the sum of the terms' weights. 0 means "this row is not a result".
 */
export const scoreResource = (resource: SearchableResource, query: string): number => {
  const terms = termsOf(query);
  if (!terms.length) return 0;
  let score = 0;
  for (const term of terms) {
    const weight = termWeight(resource, term);
    if (!weight) return 0;
    score += weight;
  }
  return score;
};

/**
 * The matching rows, best first, capped — the search page's library half.
 * `query` is expected to be normalised by the caller (`normaliseSearchQuery`).
 */
export const matchResources = <T extends SearchableResource>(
  resources: readonly T[],
  query: string,
  limit = 40,
): ResourceMatch<T>[] =>
  resources
    .map((resource) => ({ resource, score: scoreResource(resource, query) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => (b.score - a.score) || a.resource.title.localeCompare(b.resource.title))
    .slice(0, Math.max(0, limit));
