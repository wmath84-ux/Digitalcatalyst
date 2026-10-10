// src/components/branched-menu/branchedTree.ts
//
// Pure helpers that turn flat resource lists into the nested BranchedMenu tree.
// Every Course Player listing (Modules, Notes, Mind Maps) groups its rows by a
// real hierarchy path — course → module → submodule … — so they all share this
// one builder instead of each re-implementing grouping.

import type { ReactNode } from "react";
import type { BranchedMenuItem } from "./BranchedMenu";

/** One level of a path: a stable key (module id, "course", …) and its visible title. */
export interface BranchSegment {
  key: string;
  label: string;
}

export interface BranchEntry {
  /** Ancestors, outermost first. An empty path places the item at the top level. */
  path: BranchSegment[];
  item: BranchedMenuItem;
}

export interface BuildBranchTreeOptions {
  /**
   * Paths that must appear even when they hold no entries — a module with no
   * resources yet still shows in the hierarchy (as an empty section).
   */
  ensurePaths?: BranchSegment[][];
  /** Meta for a section, given its own resource count (leaves beneath it, all depths). */
  sectionMeta?: (info: { key: string; label: string; count: number; depth: number }) => ReactNode;
  /** Extra data attributes for a section head. */
  sectionDataAttrs?: (info: { key: string; depth: number }) => Record<string, string | undefined>;
}

interface TrieNode {
  key: string;
  label: string;
  depth: number;
  value: string;
  /** Ordered: sections and leaves in the order they were first seen. */
  order: Array<{ kind: "section"; node: TrieNode } | { kind: "leaf"; item: BranchedMenuItem }>;
  sections: Map<string, TrieNode>;
}

const SEP = "\u001f";

/** Section values are namespaced so they can never collide with leaf values. */
export const sectionValue = (path: BranchSegment[]) => `section:${path.map((segment) => segment.key).join(SEP)}`;

const newNode = (segment: BranchSegment, depth: number, parentPath: BranchSegment[]): TrieNode => ({
  key: segment.key,
  label: segment.label,
  depth,
  value: sectionValue([...parentPath, segment]),
  order: [],
  sections: new Map(),
});

export function buildBranchTree(entries: BranchEntry[], options: BuildBranchTreeOptions = {}): BranchedMenuItem[] {
  const root: TrieNode = { key: "", label: "", depth: -1, value: "", order: [], sections: new Map() };

  const ensure = (path: BranchSegment[]): TrieNode => {
    let cursor = root;
    path.forEach((segment, index) => {
      let next = cursor.sections.get(segment.key);
      if (!next) {
        next = newNode(segment, index, path.slice(0, index));
        cursor.sections.set(segment.key, next);
        cursor.order.push({ kind: "section", node: next });
      }
      cursor = next;
    });
    return cursor;
  };

  for (const path of options.ensurePaths ?? []) ensure(path);
  for (const entry of entries) {
    ensure(entry.path).order.push({ kind: "leaf", item: entry.item });
  }

  const countLeaves = (node: TrieNode): number =>
    node.order.reduce((sum, child) => sum + (child.kind === "leaf" ? 1 : countLeaves(child.node)), 0);

  const toItem = (node: TrieNode): BranchedMenuItem => {
    const count = countLeaves(node);
    return {
      value: node.value,
      label: node.label,
      children: node.order.map((child) => (child.kind === "leaf" ? child.item : toItem(child.node))),
      meta: options.sectionMeta?.({ key: node.key, label: node.label, count, depth: node.depth }),
      dataAttrs: options.sectionDataAttrs?.({ key: node.key, depth: node.depth }),
    };
  };

  return root.order.map((child) => (child.kind === "leaf" ? child.item : toItem(child.node)));
}

/** Every section value in the tree (used to expand everything while searching). */
export function allSectionValues(items: BranchedMenuItem[], out: string[] = []): string[] {
  for (const item of items) {
    if (item.children) {
      out.push(item.value);
      allSectionValues(item.children, out);
    }
  }
  return out;
}

/** The section values that enclose `leafValue`, outermost first (for auto-expansion). */
export function ancestorSectionValues(items: BranchedMenuItem[], leafValue: string | null | undefined): string[] {
  if (!leafValue) return [];
  const walk = (nodes: BranchedMenuItem[], trail: string[]): string[] | null => {
    for (const node of nodes) {
      if (node.value === leafValue) return trail;
      if (node.children) {
        const found = walk(node.children, [...trail, node.value]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(items, []) ?? [];
}

/** Total leaves beneath an item (a leaf counts as one). */
export function countBranchLeaves(item: BranchedMenuItem): number {
  if (!item.children) return 1;
  return item.children.reduce((sum, child) => sum + countBranchLeaves(child), 0);
}
