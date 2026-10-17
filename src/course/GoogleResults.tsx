// src/course/GoogleResults.tsx
//
// The GOOGLE results page — shaped like Google's own results page, and fed
// by everything Google's own API said about each hit.
//
// What Google shows for a web result, and what this shows:
//
//   · the site's mark and its name, then the URL's own path;
//   · the title, in Google's link blue;
//   · the file's own badge (PDF, XLS…) and its size, when Google counted them;
//   · the snippet, with the MATCHED WORDS in bold, exactly as Google marks
//     them (the API's `htmlSnippet` carries those marks);
//   · the page's picture, on the right, when the page has one;
//   · the page's own date, when it published one.
//
// The image results are Google's Images tab: a grid of the pictures, each
// with the page it came from.
//
// Nothing here reaches out to the internet on its own — every picture is the
// URL Google itself handed over in the response.

import type { ReactNode } from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { GoogleResult } from "./googleSearch";
import "./googleResults.css";

/**
 * The snippet, with Google's own `<b>` marks turned into real bold words.
 * The markup is NOT injected as HTML — the text is split and re-built, so a
 * page can never smuggle markup into the app.
 */
export function renderMarkedSnippet(marked: string, fallback: string): ReactNode {
  const source = marked || fallback;
  if (!source) return null;
  const parts = source.split(/(<\/?b>)/i);
  let bold = false;
  const nodes: ReactNode[] = [];
  parts.forEach((part, index) => {
    if (!part) return;
    if (/^<b>$/i.test(part)) {
      bold = true;
      return;
    }
    if (/^<\/b>$/i.test(part)) {
      bold = false;
      return;
    }
    nodes.push(
      bold ? <strong key={index} className="gweb__mark">{part}</strong> : <span key={index}>{part}</span>,
    );
  });
  return nodes;
}

/** The path part of a URL — the "/one" in "example.com/one". */
const pathOf = (link: string): string => {
  try {
    const url = new URL(link);
    const path = decodeURIComponent(url.pathname || "");
    const search = url.search || "";
    if (path === "/" && !search) return "";
    return `${path}${search}`;
  } catch {
    return "";
  }
};

/** The little square Google's own row shows for a site's mark. */
const markOf = (result: GoogleResult): string => {
  const host = result.source || result.displayUrl || "";
  return host.replace(/^www\./, "").slice(0, 1).toUpperCase() || "•";
};

/**
 * ONE web result, in Google's own row shape: the mark and the site's name on
 * top, the title, then the snippet with its bold words.
 */
export function GoogleWebResult({ result }: { result: GoogleResult }) {
  const path = pathOf(result.url);
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      data-library-google-hit
      data-library-google-hit-kind="web"
      data-library-hit-id={result.url}
      data-library-hit-format="list"
      className="gweb"
    >
      <span className="gweb__mark" aria-hidden="true" data-library-google-mark>
        {markOf(result)}
      </span>
      <span className="gweb__body">
        <span className="gweb__crumb">
          <span className="gweb__site" data-library-google-site>{result.source || result.displayUrl}</span>
          {path ? <span className="gweb__path">{path}</span> : null}
          {result.isPopular ? <span className="gweb__popular">Popular</span> : null}
        </span>
        <span className="gweb__title" data-library-google-title>
          {result.title}
          {result.fileFormat ? (
            <span className="gweb__badge" data-library-google-fileformat>{result.fileFormat}</span>
          ) : null}
        </span>
        {result.snippet || result.htmlSnippet ? (
          <span className="gweb__snippet" data-library-google-snippet>
            {renderMarkedSnippet(result.htmlSnippet, result.snippet)}
          </span>
        ) : null}
        {result.publishedAt || result.fileSize ? (
          <span className="gweb__meta" data-library-google-meta>
            {result.publishedAt ? <span>{result.publishedAt}</span> : null}
            {result.fileSize ? <span>{result.fileSize}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="gweb__aside">
        {result.imageUrl ? (
          <img
            className="gweb__thumb"
            data-library-google-image
            src={result.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <ExternalLink size={13} aria-hidden="true" className="gweb__external" />
      </span>
    </a>
  );
}

/**
 * The same web result in its CARD form — the picture on top, then the title
 * and the site. It is the library's own "grid" format, carrying exactly what
 * Google's API said about the page.
 */
export function GoogleWebCard({ result }: { result: GoogleResult }) {
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      data-library-google-hit
      data-library-google-hit-kind="web-card"
      data-library-hit-id={result.url}
      data-library-hit-format="grid"
      className="gcard"
    >
      <span className="gcard__plate">
        {result.imageUrl ? (
          <img
            className="gcard__img"
            data-library-google-image
            src={result.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="gcard__mark" aria-hidden="true" data-library-google-mark>{markOf(result)}</span>
        )}
      </span>
      <span className="gcard__title" data-library-google-title>{result.title}</span>
      <span className="gcard__site" data-library-google-site>{result.source || result.displayUrl}</span>
    </a>
  );
}

/**
 * ONE image result — Google's Images tab: the picture, the page's title and
 * the site it came from. The picture links to the page that owns it.
 */
export function GoogleImageResult({ result }: { result: GoogleResult }) {
  const picture = result.thumbnailUrl || result.imageUrl;
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      data-library-google-hit
      data-library-google-hit-kind="image"
      data-library-hit-id={result.url}
      data-library-hit-format="grid"
      className="gimage"
    >
      <span className="gimage__plate">
        {picture ? (
          <img
            className="gimage__img"
            data-library-google-image
            src={picture}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <FileText size={22} aria-hidden="true" />
        )}
      </span>
      <span className="gimage__title" data-library-google-title>{result.title}</span>
      <span className="gimage__site" data-library-google-site>{result.source || result.displayUrl}</span>
    </a>
  );
}
