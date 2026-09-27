"use client";

import { useState, type MouseEvent } from "react";

// Published by android-build.yml after a successful signed main-branch build.
// Actions artifacts are login-only ZIP files that expire after seven days.
export const LATEST_APK_URL =
  "https://github.com/wmath84-ux/Digitalcatalyst/releases/download/android-apk/app-release.apk";
const RELEASE_API_URL =
  "https://api.github.com/repos/wmath84-ux/Digitalcatalyst/releases/tags/android-apk";

export default function ApkDownloadButton({ large = false }: { large?: boolean }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (checking) return;

    setChecking(true);
    setError("");
    try {
      // The first signed release has not been published yet. Avoid sending
      // people to a GitHub 404 until the main-branch workflow creates it.
      const response = await fetch(RELEASE_API_URL, { cache: "no-store" });
      if (response.status === 404) {
        setError("APK is not published yet. It will be available after the next successful main build.");
        return;
      }
      if (!response.ok) throw new Error("Release check failed");
      const release: { assets?: { name: string; state: string }[] } = await response.json();
      if (!release.assets?.some((asset) => asset.name === "app-release.apk" && asset.state === "uploaded")) {
        setError("The Android APK is still being published. Please try again shortly.");
        return;
      }
      window.location.assign(LATEST_APK_URL);
    } catch {
      setError("Could not check the APK right now. Please try again shortly.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <a
        href={LATEST_APK_URL}
        onClick={(event) => void handleDownload(event)}
        aria-label="Install APK — download the latest Android app"
        aria-disabled={checking}
        className={`inline-flex items-center justify-center rounded-full bg-emerald-600 font-bold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${large ? "px-10 py-4 text-lg" : "px-8 py-4 text-base"}`}
      >
        {checking ? "Checking APK…" : "⬇️ Install APK"}
      </a>
      {error && <p role="status" className="max-w-xs text-left text-xs leading-relaxed text-amber-200">{error}</p>}
    </div>
  );
}
