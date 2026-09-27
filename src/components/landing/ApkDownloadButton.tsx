// This asset is published by android-build.yml after a successful signed
// main-branch build. Do not link to Actions artifacts: those are ZIPs, require
// GitHub authentication, and expire after seven days.
export const LATEST_APK_URL =
  "https://github.com/wmath84-ux/Digitalcatalyst/releases/download/android-apk/app-release.apk";

export default function ApkDownloadButton({ large = false }: { large?: boolean }) {
  return (
    <a
      href={LATEST_APK_URL}
      aria-label="Install APK — download the latest Android app"
      className={`inline-flex items-center justify-center rounded-full bg-emerald-600 font-bold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${large ? "px-10 py-4 text-lg" : "px-8 py-4 text-base"}`}
    >
      ⬇️ Install APK
    </a>
  );
}
