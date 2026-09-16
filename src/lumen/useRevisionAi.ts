import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { loadUserAiConfig, saveUserAiConfig, normalizeCatalogAiSettings, type CatalogAiSettings } from "../revision/engine/aiConfig";
import type { AIModel } from "./lib/types";

/** A subscribed view of Revision's existing storage, not another configuration. */
export function useRevisionAi(uid: string) {
  const [saved, setSaved] = useState(() => loadUserAiConfig(uid));
  const [school, setSchool] = useState<CatalogAiSettings | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  useEffect(() => {
    const refresh = () => setSaved(loadUserAiConfig(uid));
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("revision-ai-config-changed", refresh);
    const unsubscribe = onSnapshot(doc(db, "settings", "revisionCatalog"), snap => {
      const raw = snap.data()?.aiSettings;
      setSchool(raw ? { ...normalizeCatalogAiSettings(raw), model: String(raw.model || "").trim() } : null);
      setCatalogLoading(false);
      setCatalogError(false);
    }, () => { setSchool(null); setCatalogError(true); setCatalogLoading(false); });
    return () => {
      unsubscribe();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("revision-ai-config-changed", refresh);
    };
  }, [uid]);

  // Memoize the models array so the Header memo can compare by identity —
  // without this, every render creates a new array and the memo is useless,
  // causing unnecessary re-renders during streaming.
  const models: AIModel[] = useMemo(() => [
    {
      id: "default",
      name: "School Provided AI",
      short: school?.model || "School AI",
      desc: catalogLoading
        ? "Loading school configuration…"
        : catalogError
          ? "Unable to load school configuration. Reconnect and reopen."
          : school?.model
            ? `${school.provider} · ${school.model}${school.sharedApiKey ? "" : " · School key not published"}`
            : "Not configured — Revision → AI Configuration",
    },
    {
      id: "own",
      name: "Your Own Key",
      short: saved.config.model || "Own key",
      desc: saved.config.model
        ? `${saved.config.provider} · ${saved.config.model}${saved.config.apiKey ? "" : " · API key missing"}`
        : "Not configured — Revision → AI Configuration",
    },
  ], [school, catalogLoading, catalogError, saved.config.provider, saved.config.model, saved.config.apiKey]);

  const select = useCallback((source: string) => {
    if (source !== "own" && source !== "default") return;
    saveUserAiConfig(uid, { ...loadUserAiConfig(uid), source: source as "own" | "default" });
    // Immediately update local state so the dropdown reflects the change
    // without waiting for the storage event round-trip.
    setSaved(loadUserAiConfig(uid));
  }, [uid]);

  return { source: saved.source, models, select };
}
