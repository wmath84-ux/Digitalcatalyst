"use client";

// Admin · Product editor — Mind Map Resource Editor.
//
// This component provides the admin interface for creating and editing Mind Map
// resources. It offers two creation modes:
//   1. Copy/Paste Code — for importing mind map data from AI-generated code
//   2. Build From Scratch — for creating mind maps using the visual editor
//
// Both modes produce the same canonical mind map data format that is compatible
// with the Course Player's Mind Map renderer.

import { useState, useCallback, useMemo, useEffect } from "react";
import { Check, Copy, AlertCircle, Brain, Code2, Plus, Trash2 } from "lucide-react";
import { Field, SecondaryButton } from "@/components/admin/ui";
import { lazy, Suspense } from "react";
import { GlassSurface } from "../../../components/ui/glass";

// Lazy load the MindMapPanel to avoid bundling the heavy React Flow library
// unless the scratch builder is actually used
const MindMapPanel = lazy(() => import("../../../course/MindMapPanel"));
import {
  createMindMap,
  parseMindMap,
  isMindMap,
  type MindMap,
  MIND_MAP_VERSION,
  MAX_MIND_MAP_NODES,
  MAX_TOPIC_LENGTH,
  sanitizeTopic,
  sanitizeTitle,
  rootId,
} from "../../../../utils/mindMapTree";
import type { ProductResource } from "@/lib/admin/types";

/**
 * Validation result for mind map code import.
 */
interface ValidationResult {
  valid: boolean;
  mindMap?: MindMap;
  errors: string[];
  warnings: string[];
}

/**
 * Schema for the AI prompt generation.
 * This matches the canonical mind map structure that the application can consume.
 */
const MIND_MAP_SCHEMA = {
  version: MIND_MAP_VERSION,
  title: "string (optional, max 120 chars)",
  rootTopic: "string (required, max 400 chars)",
  nodes: "array of node objects",
  nodeStructure: {
    id: "string (required, unique)",
    topic: "string (required, max 400 chars)",
    parentId: "string or null (required, references another node id or null for root children)",
    side: "'left' | 'right' | null (optional, for root-level children)",
    collapsed: "boolean (optional, default false)",
    fx: "number or null (optional, manual x position)",
    fy: "number or null (optional, manual y position)",
  },
  constraints: {
    maxNodes: MAX_MIND_MAP_NODES,
    maxTopicLength: MAX_TOPIC_LENGTH,
    rootId: rootId(),
  },
};

/**
 * Generate an AI prompt that will produce mind map data in the exact format
 * that this application can consume.
 */
const generateAIPrompt = (): string => {
  return `Generate a valid mind map data structure for a Digitalcatalyst course. 

REQUIREMENTS:
- Output ONLY a valid JSON object, no explanations, no markdown, no extra text
- The JSON must match this exact schema:

{
  "version": ${MIND_MAP_VERSION},
  "title": "string (optional, max 120 chars)",
  "rootTopic": "string (required, max 400 chars) - the central idea",
  "nodes": [
    {
      "id": "string (required, unique, cannot be '${rootId()}')",
      "topic": "string (required, max 400 chars)",
      "parentId": "string or null (required, use '${rootId()}' for root children, null for root)",
      "side": "left" | "right" | null (optional, only for direct root children)",
      "collapsed": boolean (optional, default false),
      "fx": number | null (optional, manual x position),
      "fy": number | null (optional, manual y position)
    }
  ]
}

CONSTRAINTS:
- Maximum ${MAX_MIND_MAP_NODES} total nodes (including root)
- Maximum ${MAX_TOPIC_LENGTH} characters per topic
- All node IDs must be unique strings
- parentId must reference an existing node or '${rootId()}' for root children
- No circular references allowed
- Root node is implied by rootTopic, don't include it in nodes array
- Use meaningful, educational topics for a course mind map

EXAMPLE OUTPUT:
{
  "version": ${MIND_MAP_VERSION},
  "title": "Mathematics Fundamentals",
  "rootTopic": "Mathematics",
  "nodes": [
    {"id": "n1", "topic": "Algebra", "parentId": "${rootId()}", "side": "right"},
    {"id": "n2", "topic": "Geometry", "parentId": "${rootId()}", "side": "left"},
    {"id": "n3", "topic": "Equations", "parentId": "n1"},
    {"id": "n4", "topic": "Shapes", "parentId": "n2"}
  ]
}`;
};

/**
 * Validate and parse mind map code into the canonical format.
 */
const validateMindMapCode = (code: string): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Basic validation
  if (!code || !code.trim()) {
    errors.push("Code is empty");
    return { valid: false, errors, warnings };
  }

  try {
    // Try to parse as JSON
    let parsed;
    try {
      parsed = JSON.parse(code.trim());
    } catch (e) {
      errors.push(`Invalid JSON: ${e instanceof Error ? e.message : 'Syntax error'}`);
      return { valid: false, errors, warnings };
    }

    // Validate structure
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push("Root must be an object");
      return { valid: false, errors, warnings };
    }

    // Check version
    if (parsed.version !== undefined && parsed.version !== MIND_MAP_VERSION) {
      warnings.push(`Version ${parsed.version} may need migration (expected ${MIND_MAP_VERSION})`);
    }

    // Check rootTopic
    if (!parsed.rootTopic || typeof parsed.rootTopic !== "string") {
      errors.push("rootTopic is required and must be a string");
      return { valid: false, errors, warnings };
    }

    if (parsed.rootTopic.length > MAX_TOPIC_LENGTH) {
      errors.push(`rootTopic exceeds maximum length of ${MAX_TOPIC_LENGTH} characters`);
      return { valid: false, errors, warnings };
    }

    // Validate title
    if (parsed.title !== undefined) {
      if (typeof parsed.title !== "string") {
        errors.push("title must be a string");
        return { valid: false, errors, warnings };
      }
      if (parsed.title.length > 120) {
        warnings.push("title exceeds recommended length of 120 characters");
      }
    }

    // Validate nodes
    if (!Array.isArray(parsed.nodes)) {
      errors.push("nodes must be an array");
      return { valid: false, errors, warnings };
    }

    // Check total node count (root + nodes array)
    if (parsed.nodes.length + 1 > MAX_MIND_MAP_NODES) {
      errors.push(`Total nodes (${parsed.nodes.length + 1}) exceeds maximum of ${MAX_MIND_MAP_NODES}`);
      return { valid: false, errors, warnings };
    }

    const nodeIds = new Set<string>();
    const nodeMap = new Map<string, any>();

    // Validate each node
    for (const node of parsed.nodes) {
      if (!node || typeof node !== "object") {
        errors.push("Each node must be an object");
        return { valid: false, errors, warnings };
      }

      // Check id
      if (!node.id || typeof node.id !== "string") {
        errors.push("Each node must have a string id");
        return { valid: false, errors, warnings };
      }

      if (node.id === rootId()) {
        errors.push(`Node ID cannot be '${rootId()}' (reserved for root)`);
        return { valid: false, errors, warnings };
      }

      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`);
        return { valid: false, errors, warnings };
      }
      nodeIds.add(node.id);
      nodeMap.set(node.id, node);

      // Check topic
      if (!node.topic || typeof node.topic !== "string") {
        errors.push(`Node ${node.id} must have a string topic`);
        return { valid: false, errors, warnings };
      }

      if (node.topic.length > MAX_TOPIC_LENGTH) {
        warnings.push(`Node ${node.id} topic exceeds maximum length of ${MAX_TOPIC_LENGTH} characters`);
      }

      // Check parentId
      if (node.parentId === undefined || node.parentId === null) {
        // This is allowed for nodes that should be attached to root
        node.parentId = rootId();
      } else if (typeof node.parentId !== "string") {
        errors.push(`Node ${node.id} parentId must be a string or null`);
        return { valid: false, errors, warnings };
      }

      // Check side
      if (node.side !== undefined && node.side !== null && !["left", "right"].includes(node.side)) {
        warnings.push(`Node ${node.id} side should be 'left', 'right', or null`);
      }

      // Check collapsed
      if (node.collapsed !== undefined && typeof node.collapsed !== "boolean") {
        warnings.push(`Node ${node.id} collapsed should be boolean`);
      }

      // Check fx/fy
      if (node.fx !== undefined && typeof node.fx !== "number" && node.fx !== null) {
        warnings.push(`Node ${node.id} fx should be number or null`);
      }
      if (node.fy !== undefined && typeof node.fy !== "number" && node.fy !== null) {
        warnings.push(`Node ${node.id} fy should be number or null`);
      }
    }

    // Check for circular references and orphaned nodes
    // Build a parent-child graph
    const childrenMap = new Map<string, string[]>();
    for (const node of parsed.nodes) {
      const parentId = node.parentId || rootId();
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(node.id);
    }

    // Check that all parentIds reference existing nodes (except root)
    for (const node of parsed.nodes) {
      const parentId = node.parentId || rootId();
      if (parentId !== rootId() && !nodeIds.has(parentId) && !childrenMap.has(parentId)) {
        errors.push(`Node ${node.id} references non-existent parent: ${parentId}`);
        return { valid: false, errors, warnings };
      }
    }

    // Check for circular references using DFS
    const hasCycle = (startId: string, visited: Set<string> = new Set()): boolean => {
      if (visited.has(startId)) return true;
      visited.add(startId);
      
      const children = childrenMap.get(startId) || [];
      for (const childId of children) {
        if (hasCycle(childId, new Set(visited))) {
          return true;
        }
      }
      return false;
    };

    // Check for cycles starting from root children
    const rootChildren = childrenMap.get(rootId()) || [];
    for (const childId of rootChildren) {
      if (hasCycle(childId)) {
        errors.push("Circular reference detected in node hierarchy");
        return { valid: false, errors, warnings };
      }
    }

    // If we got here, the structure is valid
    // Parse through the canonical parser to ensure compatibility
    const canonicalMindMap = parseMindMap(parsed);
    
    return {
      valid: true,
      mindMap: canonicalMindMap,
      errors: [],
      warnings: warnings.length > 0 ? warnings : [],
    };

  } catch (error) {
    errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { valid: false, errors, warnings };
  }
};

/**
 * Default AI prompt for mind map generation.
 */
const DEFAULT_AI_PROMPT = generateAIPrompt();

interface MindMapResourceEditorProps {
  resource: ProductResource;
  onChange: (patch: Partial<ProductResource>) => void;
}

export default function MindMapResourceEditor({
  resource,
  onChange,
}: MindMapResourceEditorProps) {
  const [mode, setMode] = useState<"code" | "scratch">("code");
  const [codeInput, setCodeInput] = useState<string>("");
  const [validationResult, setValidationResult] = useState<ValidationResult>({ valid: false, errors: [], warnings: [] });
  const [showAIPrompt, setShowAIPrompt] = useState<boolean>(false);
  const [editorKey, setEditorKey] = useState<number>(0); // Force remount
  
  // State for scratch editor mode
  const [currentMindMap, setCurrentMindMap] = useState<MindMap | null>(null);
  const [editorLoaded, setEditorLoaded] = useState<boolean>(false);
  
  // Initialize code input from existing mind map data
  useEffect(() => {
    if (resource.mindMapData) {
      try {
        setCodeInput(JSON.stringify(resource.mindMapData, null, 2));
        const result = validateMindMapCode(JSON.stringify(resource.mindMapData));
        setValidationResult(result);
      } catch {
        setCodeInput("");
        setValidationResult({ valid: false, errors: ["Invalid existing mind map data"], warnings: [] });
      }
    } else {
      setCodeInput("");
      setValidationResult({ valid: false, errors: [], warnings: [] });
    }
  }, [resource.mindMapData]);

  // Initialize scratch editor when switching to scratch mode
  useEffect(() => {
    if (mode === "scratch") {
      if (resource.mindMapData) {
        try {
          const parsed = parseMindMap(resource.mindMapData);
          setCurrentMindMap(parsed);
        } catch {
          // Create new mind map with resource name as root topic
          setCurrentMindMap(createMindMap(
            resource.mindMapRootTopic || resource.name || "Central Idea",
            resource.name || "Untitled Mind Map"
          ));
        }
      } else {
        // Create new mind map with resource name as root topic
        setCurrentMindMap(createMindMap(
          resource.name || "Central Idea",
          resource.name || "Untitled Mind Map"
        ));
      }
      setEditorLoaded(true);
    }
  }, [mode, resource.mindMapData, resource.mindMapRootTopic, resource.name]);

  // Handle AI prompt copy
  const handleCopyAIPrompt = useCallback(() => {
    navigator.clipboard.writeText(DEFAULT_AI_PROMPT).then(() => {
      // Could show a toast here
    }).catch(() => {
      // Handle error
    });
  }, []);

  // Handle code validation
  const handleValidateCode = useCallback((code: string) => {
    const result = validateMindMapCode(code);
    setValidationResult(result);
    return result;
  }, []);

  // Handle code change
  const handleCodeChange = useCallback((code: string) => {
    setCodeInput(code);
    // Debounce validation for better performance
    const result = validateMindMapCode(code);
    setValidationResult(result);
  }, []);

  // Handle save from code mode
  const handleSaveFromCode = useCallback(() => {
    const result = handleValidateCode(codeInput);
    if (!result.valid || !result.mindMap) {
      return false;
    }

    // Update resource with validated mind map data
    onChange({
      mindMapData: result.mindMap,
      mindMapSourceMode: "code_import",
      mindMapRootTopic: result.mindMap.rootTopic,
      name: resource.name || result.mindMap.title || result.mindMap.rootTopic || "Untitled Mind Map",
      url: "", // Mind maps don't have URLs
      provider: "Mind Map",
    });

    return true;
  }, [codeInput, resource.name, onChange, handleValidateCode]);

  // Handle mind map changes in scratch editor
  const handleMindMapChange = useCallback((updater: MindMap | ((current: MindMap) => MindMap)) => {
    setCurrentMindMap(prev => {
      const next = typeof updater === "function" ? updater(prev || createMindMap()) : updater;
      return next;
    });
  }, []);

  // Handle save from scratch mode
  const handleSaveFromScratch = useCallback(() => {
    if (!currentMindMap) return;
    
    onChange({
      mindMapData: currentMindMap,
      mindMapSourceMode: "scratch_builder",
      mindMapRootTopic: currentMindMap.rootTopic,
      name: resource.name || currentMindMap.title || currentMindMap.rootTopic || "Untitled Mind Map",
      url: "",
      provider: "Mind Map",
    });
  }, [currentMindMap, resource.name, onChange]);

  // Handle mode switch
  const handleSwitchToCode = useCallback(() => {
    setMode("code");
    setEditorLoaded(false); // Reset editor state when switching away
  }, []);

  const handleSwitchToScratch = useCallback(() => {
    setMode("scratch");
    setEditorLoaded(true);
  }, []);

  // Check if the current resource has valid mind map data
  const hasValidMindMapData = useMemo(() => {
    if (!resource.mindMapData) return false;
    return isMindMap(resource.mindMapData);
  }, [resource.mindMapData]);

  // Check if the resource is ready for publishing
  const isReady = useMemo(() => {
    if (mode === "code") {
      return validationResult.valid && validationResult.mindMap !== undefined;
    }
    // For scratch mode, check if we have a valid mind map
    return currentMindMap !== null && isMindMap(currentMindMap);
  }, [mode, validationResult, currentMindMap]);

  return (
    <div className="space-y-4" data-admin-mindmap-editor>
      {/* Mode selection */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3" data-admin-mindmap-mode-selector>
        <p className="text-sm font-semibold text-indigo-950 mb-3">
          Create Mind Map
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSwitchToCode}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${mode === "code" ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            data-admin-mindmap-mode="code"
          >
            <Code2 size={16} />
            Copy / Paste Code
          </button>
          <button
            type="button"
            onClick={handleSwitchToScratch}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${mode === "scratch" ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            data-admin-mindmap-mode="scratch"
          >
            <Brain size={16} />
            Build From Scratch
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {mode === "code" 
            ? "Paste AI-generated mind map code in the canonical format"
            : "Use the visual editor to create your mind map from scratch"}
        </p>
      </div>

      {/* Code Mode */}
      {mode === "code" && (
        <div className="space-y-3" data-admin-mindmap-code-mode>
          {/* AI Prompt Section */}
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-violet-900">AI Prompt</p>
              <SecondaryButton
                className="h-8 px-3 text-xs"
                onClick={() => setShowAIPrompt(!showAIPrompt)}
              >
                {showAIPrompt ? "Hide" : "Show AI Prompt"}
              </SecondaryButton>
            </div>
            
            {showAIPrompt && (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  Copy this prompt to generate mind map code that works with this application.
                </p>
                <div className="relative">
                  <textarea
                    className="w-full rounded-lg border border-violet-200 bg-white p-3 text-xs font-mono leading-5 min-h-[120px] resize-none"
                    value={DEFAULT_AI_PROMPT}
                    readOnly
                    rows={6}
                  />
                  <button
                    type="button"
                    onClick={handleCopyAIPrompt}
                    className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-violet-600 text-white text-xs active:bg-violet-700"
                    title="Copy AI Prompt"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Code Input */}
          <Field
            label="Mind Map Code"
            required
            hint={validationResult.errors.length > 0 
              ? "Fix the errors below to continue"
              : validationResult.warnings.length > 0
                ? `⚠️ ${validationResult.warnings.length} warning(s)`
                : "Paste valid mind map JSON code"}
          >
            <textarea
              className={`min-h-[200px] font-mono text-sm ${validationResult.valid ? "border-emerald-300 bg-emerald-50/20" : validationResult.errors.length > 0 ? "border-red-300 bg-red-50/20" : "border-slate-200 bg-white"}`}
              value={codeInput}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder={`{
  "version": ${MIND_MAP_VERSION},
  "title": "My Mind Map",
  "rootTopic": "Central Idea",
  "nodes": [
    {"id": "n1", "topic": "Main Topic", "parentId": "${rootId()}"}
  ]
}`}
            />
          </Field>

          {/* Validation Results */}
          {validationResult.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/40 p-3" role="alert">
              <p className="text-sm font-semibold text-red-800 mb-2">
                <AlertCircle size={16} className="inline mr-1" />
                Validation Errors
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-red-700">
                {validationResult.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResult.warnings.length > 0 && validationResult.errors.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                ⚠️ Warnings
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-700">
                {validationResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Code Mode Actions */}
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              className="h-9 px-4 text-sm"
              disabled={!codeInput.trim()}
              onClick={() => handleCodeChange("{\n  \"version\": " + MIND_MAP_VERSION + ",\n  \"title\": \"\",\n  \"rootTopic\": \"Central Idea\",\n  \"nodes\": []\n}")}
            >
              <Plus size={16} />
              Start Empty
            </SecondaryButton>
            
            <SecondaryButton
              className="h-9 px-4 text-sm"
              disabled={!codeInput.trim()}
              onClick={() => handleValidateCode(codeInput)}
            >
              <Check size={16} />
              Validate
            </SecondaryButton>

            <button
              type="button"
              className="h-9 rounded-lg border border-emerald-200 bg-emerald-600 px-4 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!validationResult.valid || !validationResult.mindMap}
              onClick={handleSaveFromCode}
            >
              <Check size={16} />
              Save Mind Map
            </button>
          </div>
        </div>
      )}

      {/* Scratch Mode */}
      {mode === "scratch" && (
        <div className="space-y-3" data-admin-mindmap-scratch-mode>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <p className="text-sm text-indigo-800 mb-3">
              The visual Mind Map Editor provides the same full functionality that learners use in the Course Player.
              Create nodes, connect them, edit labels, style, zoom, pan, and more.
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <SecondaryButton
                className="h-8 px-3 text-xs"
                onClick={handleSwitchToCode}
              >
                <Code2 size={14} />
                Switch to Code Mode
              </SecondaryButton>
            </div>

            {/* Mind Map Editor Integration */}
            <div className="rounded-lg border border-indigo-200 bg-white p-2 min-h-[400px]">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <GlassSurface className="p-6 text-center">
                    <Brain size={32} className="mx-auto text-indigo-400 animate-pulse" />
                    <p className="text-sm text-slate-500 mt-2">Loading Mind Map Editor...</p>
                  </GlassSurface>
                </div>
              }>
                <MindMapPanel
                  mind={currentMindMap}
                  onMindChange={handleMindMapChange}
                  status="ready"
                  errorMessage={null}
                  onFlush={handleSaveFromScratch}
                  landscape={false}
                  open={true}
                  maps={[]}
                  activeMapKey="main"
                  onSelectMap={() => {}}
                  onCreateMap={() => {}}
                  onRenameMap={() => {}}
                  onDeleteMap={() => {}}
                  mapsLoading={false}
                  atMapLimit={false}
                  courseTitle={resource.name || "Untitled Mind Map"}
                  modules={[]}
                  moduleId="admin-editor"
                  personalModules={[]}
                  onRetryMaps={() => {}}
                />
              </Suspense>
            </div>

            {/* Scratch mode save button */}
            <div className="flex gap-2">
              <button
                type="button"
                className="h-9 rounded-lg border border-emerald-200 bg-emerald-600 px-4 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!currentMindMap || !currentMindMap.rootTopic}
                onClick={handleSaveFromScratch}
              >
                <Check size={16} />
                Save Mind Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource Name Field (common to both modes) */}
      <Field
        label="Resource name"
        required
        hint="The name that will appear in the Course Player library"
      >
        <input
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm"
          value={resource.name || ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., Chapter 1: Algebra Fundamentals"
        />
      </Field>

      {/* Status indicator */}
      <div className={`rounded-lg border p-3 text-sm ${isReady ? "border-emerald-200 bg-emerald-50/40 text-emerald-800" : "border-amber-200 bg-amber-50/40 text-amber-800"}`}>
        {isReady ? (
          <p className="flex items-center gap-2">
            <Check size={16} />
            Mind Map is ready for publishing
          </p>
        ) : (
          <p className="flex items-center gap-2">
            <AlertCircle size={16} />
            {mode === "code" 
              ? validationResult.errors.length > 0 
                ? `Fix ${validationResult.errors.length} error(s) to continue`
                : "Complete the mind map code"
              : "Create your mind map using the editor"}
          </p>
        )}
      </div>
    </div>
  );
}