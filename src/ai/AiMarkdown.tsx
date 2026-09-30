// src/ai/AiMarkdown.tsx
//
// Renders a mentor ANSWER. The server lays every answer out as Markdown with a
// fixed skeleton per format (`utils/mentorAnswer.js`): a lead line, `###`
// sections, numbered steps, bullet lists, a GFM table, a fenced code block and
// a `> **Watch out:**` callout. `AiProse` — the plain-prose renderer used for
// summaries and explanations — only understands paragraphs and all-bullet
// blocks, so a structured answer shown through it arrived as raw `###` and
// `**` and `|---|` characters. This one renders the whole skeleton.
//
// react-markdown never renders raw HTML, so model output cannot inject markup.

import { memo } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../utils/cn";

/*
 * A section label, deliberately NOT an <h3>: the app's global tablet pass sets
 * `h1/h2/h3 { font-size: clamp(...) !important }` on every screen between 640
 * and 1366px, which beats any utility class and blew these small labels up to
 * 18px. A `role="heading"` element keeps the semantics for assistive tech and
 * is out of reach of every element selector in the global stylesheet.
 */
const SectionHeading = ({ children }: { children?: ReactNode }) => (
  <div role="heading" aria-level={3} className="pt-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-violet-300">{children}</div>
);

const COMPONENTS: Components = {
  h1: SectionHeading,
  h2: SectionHeading,
  h3: SectionHeading,
  h4: SectionHeading,
  p: ({ children }) => <p className="break-words">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-violet-400/70">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5 marker:font-black marker:text-violet-300/80">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 [&>ul]:mt-1">{children}</li>,
  strong: ({ children }) => <strong className="font-black text-white">{children}</strong>,
  em: ({ children }) => <em className="text-white/70">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="font-bold text-violet-300 underline underline-offset-2">
      {children}
    </a>
  ),
  hr: () => <hr className="border-white/10" />,
  code: ({ className, children }: ComponentPropsWithoutRef<"code">) => (
    <code className={cn("rounded-md bg-white/10 px-1 py-0.5 font-mono text-[0.92em] text-violet-100", className)}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre
      tabIndex={0}
      className="custom-scrollbar overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-5 text-white/90 [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[12px] [&_code]:text-inherit"
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="rounded-r-xl border-l-2 border-amber-400/60 bg-amber-500/[0.08] px-3 py-2 text-amber-50/90 [&>p]:m-0">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="custom-scrollbar overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full border-collapse text-left text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/60">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-white/[0.07] px-2.5 py-1.5 align-top">{children}</td>,
};

export const AiMarkdown = memo(function AiMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn("space-y-2.5 text-[13px] font-medium leading-[1.65] text-white/85", className)}
      data-module-ai-prose=""
      data-module-ai-markdown=""
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {String(text || "")}
      </ReactMarkdown>
    </div>
  );
});

export default AiMarkdown;
