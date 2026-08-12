import { Download, ExternalLink, FileQuestion, Maximize2 } from "lucide-react";
import type { CourseFile } from "../types/course";
import { getCourseDownload, getCourseEmbed } from "../utils/courseEmbed";

export default function ResourceViewer({ file }: { file: CourseFile | null }) {
  if (!file) return <div className="grid h-full min-h-[280px] place-items-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-8 text-center text-white"><div><FileQuestion className="mx-auto h-12 w-12 text-white/30" /><p className="mt-4 font-black">Choose a lesson or resource</p><p className="mt-1 text-sm text-white/45">Your course content will open here without leaving the app.</p></div></div>;

  const embed = getCourseEmbed(file);
  const download = getCourseDownload(file);
  const pages = file.docPages?.length ? file.docPages : file.content ? [{ id: file.id, title: file.name, content: file.content }] : [];
  const canNativeRender = pages.length > 0;

  const viewer = (() => {
    if (canNativeRender) return <div className="h-full overflow-y-auto bg-slate-100 p-4 sm:p-6">{pages.map((page) => <iframe key={page.id} title={page.title} sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font-family:Inter,system-ui,sans-serif;margin:0;padding:28px;color:#1e293b;line-height:1.7}h1,h2,h3{line-height:1.2;color:#0f172a}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:8px}</style></head><body><h2>${page.title.replace(/[<>&]/g, "")}</h2>${page.content}</body></html>`} className="mx-auto mb-4 min-h-[70vh] w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-sm" />)}</div>;
    if (!embed.url) return <div className="grid h-full place-items-center bg-slate-950 p-8 text-center text-white"><div><FileQuestion className="mx-auto h-12 w-12 text-amber-400" /><p className="mt-4 font-black">Preview is unavailable</p><p className="mt-1 max-w-md text-sm text-white/50">Add a public HTTPS URL in product management. Google files must be shared as “Anyone with the link”.</p></div></div>;
    if (file.type === "video") return <video src={embed.url} controls playsInline className="h-full w-full bg-black object-contain" />;
    if (file.type === "audio") return <div className="grid h-full place-items-center bg-gradient-to-br from-slate-950 to-violet-950 p-8"><audio src={embed.url} controls className="w-full max-w-xl" /></div>;
    if (file.type === "image") return <div className="grid h-full place-items-center overflow-auto bg-slate-950 p-4"><img src={embed.url} alt={file.name} className="max-h-full max-w-full object-contain" /></div>;
    return <iframe key={embed.url} src={embed.url} title={file.name} className="h-full min-h-[420px] w-full border-0 bg-white" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 text-white">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{file.name}</p><p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{embed.kind.replace("direct", file.type)} preview</p></div>
        {download.url && <a href={download.url} target="_blank" rel="noopener noreferrer" download={download.downloadable ? file.name : undefined} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15">{download.downloadable ? <Download size={14} /> : <ExternalLink size={14} />}<span className="hidden sm:inline">{download.label}</span></a>}
        {embed.url && <a href={embed.url} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-lg bg-white/10" aria-label="Open preview in new tab"><Maximize2 size={15} /></a>}
      </div>
      <div className="min-h-0 flex-1">{viewer}</div>
    </div>
  );
}
