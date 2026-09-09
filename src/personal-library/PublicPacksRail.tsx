import { useEffect, useState } from "react";
import { discoverStudyPacks, type StudyPackPreview } from "../lib/studyPackClient";

export default function PublicPacksRail() {
  const [packs, setPacks] = useState<StudyPackPreview[]>([]);
  useEffect(() => {
    void discoverStudyPacks().then((result) => setPacks(result.packs.slice(0, 8))).catch(() => setPacks([]));
  }, []);
  if (!packs.length) return null;
  return (
    <section data-home-study-packs className="px-5 pt-6 md:px-8">
      <div className="flex items-center justify-between">
        <h2 className="dc-scene-ink text-base font-bold text-white">Recently shared Study Packs</h2>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => { window.location.hash = `#/pack/${pack.id}`; }}
            className="min-h-28 min-w-[220px] max-w-[240px] rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-left"
          >
            <p className="line-clamp-2 text-sm font-black text-white">{pack.title}</p>
            <p className="mt-1 text-[11px] font-bold text-white/45">{pack.resourceCount} resources</p>
          </button>
        ))}
      </div>
    </section>
  );
}
