import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { copyText } from "../lib/utils";
import { perf } from "../lib/perf";

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="codeblock">
      <div className="codeblock__bar">
        <span className="codeblock__lang">{lang}</span>
        <button
          type="button"
          className="codeblock__copy focus-ring"
          aria-label="Copy code"
          onClick={async () => {
            if (await copyText(code)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }
          }}
        >
          {copied ? <Check size={12.5} aria-hidden="true" /> : <Copy size={12.5} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0} aria-label={`${lang} code`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function PreRenderer(props: any) {
  const codeEl = props?.children?.props;
  const className: string = codeEl?.className ?? "";
  const lang = /language-([\w-]+)/.exec(className)?.[1] ?? "text";
  const raw = String(codeEl?.children ?? "").replace(/\n$/, "");
  return <CodeBlock lang={lang} code={raw} />;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const Markdown = memo(function Markdown({ text, onImageClick }: { text: string; onImageClick?: (src: string, alt: string) => void }) {
  // Instrumented: this body runs only when `text` actually changes
  // (react-markdown parsing is the expensive path — memo gates it).
  perf.bump("markdownParses");
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: PreRenderer,
          code: (props) => {
            const { className, children } = props as { className?: string; children?: React.ReactNode };
            if (/language-/.test(className ?? "")) return <code className={className}>{children}</code>;
            return <code className="is-inline">{children}</code>;
          },
          a: (props) => (
            <a href={props.href} target="_blank" rel="noreferrer noopener">
              {props.children}
            </a>
          ),
          img: (props) => (
            <img
              className="md-img"
              src={typeof props.src === "string" ? props.src : ""}
              alt={props.alt ?? ""}
              loading="lazy"
              onClick={() => onImageClick?.(String(props.src ?? ""), props.alt ?? "image")}
            />
          ),
          table: (props) => (
            <div className="table-wrap">
              <table>{props.children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
