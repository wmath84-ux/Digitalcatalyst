// Build the pinned, locally optimized upstream app in isolation: it pins Three 0.184.0,
// while the learning app uses a different version and a single-file build.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const vendor = path.join(root, "vendor/threejs-world");
const output = path.join(root, "public/game-world");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const lockHash = createHash("sha256").update(readFileSync(path.join(vendor, "package-lock.json"))).digest("hex");
const marker = path.join(vendor, "node_modules/.dc-installed-lock");

function run(args) {
  const result = spawnSync(npm, args, { cwd: vendor, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(marker) || readFileSync(marker, "utf8") !== lockHash) {
  run(["ci", "--include=dev", "--no-audit", "--no-fund"]);
  writeFileSync(marker, lockHash);
}
// The Vite config stays upstream; mobile optimization changes are recorded
// in vendor/threejs-world.local.json.
// Relative asset URLs work in Vercel, the preview proxy and Capacitor.
run(["run", "build", "--", "--base=./", `--outDir=${output}`, "--emptyOutDir"]);
copyFileSync(path.join(vendor, "LICENSE"), path.join(output, "LICENSE.txt"));
copyFileSync(path.join(vendor, "node_modules/three/LICENSE"), path.join(output, "THREE-LICENSE.txt"));
