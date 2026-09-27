"use client";

import { useEffect, useState, type MouseEvent } from "react";

// Published by android-build.yml after a successful signed main-branch build.
// Actions artifacts are login-only ZIP files that expire after seven days, so
// the release asset is the only stable, unauthenticated download URL — which
// is exactly what a plain <a href> needs. Keep this URL in sync with the
// `gh release create android-apk` step in .github/workflows/android-build.yml.
export const LATEST_APK_URL =
  "https://github.com/wmath84-ux/Digitalcatalyst/releases/download/android-apk/app-release.apk";
const RELEASE_API_URL =
  "https://api.github.com/repos/wmath84-ux/Digitalcatalyst/releases/tags/android-apk";
const RELEASE_PAGE_URL =
  "https://github.com/wmath84-ux/Digitalcatalyst/releases/tag/android-apk";

// "unknown" means we could not find out — offline, rate limited, probe failed.
// The link must still work in that state, so ONLY a confirmed "no release yet"
// stops the download.
type ApkState = "unknown" | "ready" | "pending";

type Cached = { at: number; state: ApkState; label: string };

const CACHE_KEY = "eduvora:apk-release";
const CACHE_TTL_MS = 5 * 60 * 1000;

function formatLabel(name: string | undefined, size: number | undefined) {
  const parts: string[] = [];
  // Release title looks like "Android APK (build #323)".
  const build = name?.match(/build #(\d+)/i)?.[1];
  if (build) parts.push(`build #${build}`);
  if (size) parts.push(`${(size / 1024 / 1024).toFixed(1)} MB`);
  return parts.join(" · ");
}

// sessionStorage so a returning visitor re-uses the answer instead of burning
// the 60 requests/hour that GitHub's unauthenticated API allows per IP.
function readCache(): Cached | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed || typeof parsed.at !== "number") return null;
    return Date.now() - parsed.at > CACHE_TTL_MS ? null : parsed;
  } catch {
    return null;
  }
}

function writeCache(value: Cached) {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* private mode or storage disabled — we just probe again next time */
  }
}

async function probeRelease(): Promise<Cached> {
  const at = Date.now();
  try {
    const response = await fetch(RELEASE_API_URL, { cache: "no-store" });
    // Confirmed: the workflow has not published a release yet. Say so here
    // rather than bouncing the click off a GitHub 404 page.
    if (response.status === 404) return { at, state: "pending", label: "" };
    // Rate limited (403/429) or GitHub is down. Stay optimistic: guessing
    // "pending" would block a download that actually works.
    if (!response.ok) return { at, state: "unknown", label: "" };

    const release: {
      name?: string;
      assets?: { name: string; state: string; size: number }[];
    } = await response.json();
    const asset = release.assets?.find(
      (entry) => entry.name === "app-release.apk" && entry.state === "uploaded",
    );
    if (!asset) return { at, state: "pending", label: "" };
    return { at, state: "ready", label: formatLabel(release.name, asset.size) };
  } catch {
    return { at, state: "unknown", label: "" };
  }
}

export default function ApkDownloadButton({ large = false }: { large?: boolean }) {
  const [release, setRelease] = useState<Cached | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const fresh = readCache();
    if (fresh) {
      setRelease(fresh);
      return;
    }
    let active = true;
    void probeRelease().then((result) => {
      writeCache(result);
      if (active) setRelease(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const notPublished = release?.state === "pending";

  const handleDownload = (event: MouseEvent<HTMLAnchorElement>) => {
    // The APK is live (or we could not confirm either way): let the browser
    // follow the link. No preventDefault, no extra round trip, so
    // middle-click, "Save as…" and Android's download manager all work.
    if (!notPublished) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setAsked(true);
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <a
        href={LATEST_APK_URL}
        onClick={handleDownload}
        aria-label="Install APK — download the latest Android app"
        className={`inline-flex items-center justify-center rounded-full bg-emerald-600 font-bold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${large ? "px-10 py-4 text-lg" : "px-8 py-4 text-base"}`}
      >
        ⬇️ Install APK
      </a>

      {release?.state === "ready" && release.label ? (
        <p className="text-left text-xs text-white/55">Latest APK · {release.label}</p>
      ) : null}

      {notPublished ? (
        <p role="status" className="max-w-xs text-left text-xs leading-relaxed text-amber-200">
          {asked
            ? "No published APK to download yet — the first signed main build is still running."
            : "The first signed APK is still being published."}{" "}
          <a
            href={RELEASE_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-amber-100"
          >
            Releases page
          </a>
        </p>
      ) : null}
    </div>
  );
}
