// src/course/LiveExperimentPanel.tsx
//
// Part 21: Live Experiment MASTER/SELF Page
//
// A dedicated surface for interactive 2D experiments with MASTER/SELF toggle:
// - MASTER: Official/admin-created interactive resources from the course
// - SELF: Learner-created interactive resources from My Study Library
//
// Reuses existing experiment architecture:
// - ExperimentStage for rendering
// - interactive resource type
// - interactiveHtml payload
// - Existing access/entitlement rules

import { useState, useEffect, useMemo } from "react";
import { FlaskConical, Plus, Lock, Eye } from "lucide-react";
import { GlassButton } from "../components/ui/glass-button";
import type { CourseFile, CourseModule } from "../types/course";
import type { MyCourse, MyCourseModule } from "../types/myCourse";
import type { CourseAccessResolution } from "../../utils/courseAccess";

interface LiveExperimentPanelProps {
  // MASTER data
  modules: CourseModule[];
  resolution: CourseAccessResolution;
  
  // SELF data
  myCourses: MyCourse[];
  
  // User context
  uid: string | null;
  
  // Callbacks
  onSelectExperiment: (file: CourseFile | MyCourseFile, source: "master" | "self") => void;
  onCreateNew?: () => void;
}

// Unified file type for both MASTER and SELF
type MyCourseFile = {
  id: string;
  name: string;
  type: "interactive";
  interactiveHtml?: string;
  url?: string;
  moduleId: string;
  moduleTitle: string;
};

type ExperimentItem = {
  file: CourseFile | MyCourseFile;
  source: "master" | "self";
  moduleTitle: string;
  isLocked?: boolean;
  isPreview?: boolean;
};

export default function LiveExperimentPanel({
  modules,
  resolution,
  myCourses,
  uid,
  onSelectExperiment,
  onCreateNew,
}: LiveExperimentPanelProps) {
  // Persist last selected mode
  const [mode, setMode] = useState<"master" | "self">(() => {
    if (typeof window === "undefined" || !uid) return "master";
    try {
      const stored = localStorage.getItem(`live-experiment-mode-${uid}`);
      return stored === "self" ? "self" : "master";
    } catch {
      return "master";
    }
  });

  // Save mode preference
  useEffect(() => {
    if (typeof window === "undefined" || !uid) return;
    try {
      localStorage.setItem(`live-experiment-mode-${uid}`, mode);
    } catch {
      // Ignore storage errors
    }
  }, [mode, uid]);

  // Collect MASTER experiments (official course interactive resources)
  const masterExperiments = useMemo<ExperimentItem[]>(() => {
    const items: ExperimentItem[] = [];
    
    const collectFromModule = (module: CourseModule, depth: number = 0) => {
      if (module.files) {
        module.files.forEach((file) => {
          if (file.type === "interactive" && (file.interactiveHtml || file.url)) {
            const isLocked = !resolution.accessibleModuleIds.has(module.id);
            const isPreview = resolution.previewModuleIds.has(module.id);
            
            items.push({
              file,
              source: "master",
              moduleTitle: module.title,
              isLocked,
              isPreview,
            });
          }
        });
      }
      
      // Recurse into nested modules
      if (module.modules) {
        module.modules.forEach((submodule) => collectFromModule(submodule, depth + 1));
      }
    };
    
    modules.forEach((module) => collectFromModule(module));
    return items;
  }, [modules, resolution]);

  // Collect SELF experiments (learner's My Study Library interactive resources)
  const selfExperiments = useMemo<ExperimentItem[]>(() => {
    const items: ExperimentItem[] = [];
    
    myCourses.forEach((course) => {
      if (course.modules) {
        course.modules.forEach((module: MyCourseModule) => {
          if (module.resources) {
            module.resources.forEach((resource) => {
              if (resource.type === "interactive" && resource.interactiveHtml) {
                items.push({
                  file: {
                    id: resource.id,
                    name: resource.name || "Untitled Experiment",
                    type: "interactive",
                    interactiveHtml: resource.interactiveHtml,
                    moduleId: module.id,
                    moduleTitle: module.title,
                  },
                  source: "self",
                  moduleTitle: module.title,
                });
              }
            });
          }
        });
      }
    });
    
    return items;
  }, [myCourses]);

  const experiments = mode === "master" ? masterExperiments : selfExperiments;

  return (
    <div className="flex h-full flex-col">
      {/* Header with MASTER/SELF toggle */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-[#FF6BF5]" />
          <h2 className="text-lg font-bold text-white">Live Experiment</h2>
        </div>
        
        {/* MASTER/SELF Toggle */}
        <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setMode("master")}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              mode === "master"
                ? "bg-[#FF6BF5] text-white"
                : "text-white/60 hover:text-white"
            }`}
            aria-pressed={mode === "master"}
          >
            MASTER
          </button>
          <button
            type="button"
            onClick={() => setMode("self")}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              mode === "self"
                ? "bg-[#FF6BF5] text-white"
                : "text-white/60 hover:text-white"
            }`}
            aria-pressed={mode === "self"}
          >
            SELF
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {experiments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="mb-4 h-12 w-12 text-white/20" />
            <p className="text-sm text-white/60">
              {mode === "master"
                ? "No experiments in this course yet."
                : "You haven't created any experiments yet."}
            </p>
            {mode === "self" && onCreateNew && (
              <GlassButton
                variant="capsule"
                className="mt-4"
                onClick={onCreateNew}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New Experiment
              </GlassButton>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {mode === "self" && onCreateNew && (
              <button
                type="button"
                onClick={onCreateNew}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-white/80 transition-colors hover:border-[#FF6BF5] hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-4 w-4" />
                Create New Experiment
              </button>
            )}
            
            {experiments.map((item) => (
              <button
                key={`${item.source}-${item.file.id}`}
                type="button"
                onClick={() => !item.isLocked && onSelectExperiment(item.file, item.source)}
                disabled={item.isLocked}
                className={`group flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all ${
                  item.isLocked
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-[#FF6BF5]/50 hover:bg-white/10"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF6BF5]/20">
                  <FlaskConical className="h-5 w-5 text-[#FF6BF5]" />
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-white">
                      {item.file.name}
                    </h3>
                    {item.isLocked && (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    )}
                    {item.isPreview && (
                      <Eye className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-white/60">
                    {item.moduleTitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
