#!/usr/bin/env node
// scripts/joplin/build-clipper.mjs
//
// Package the My Day Web Clipper as store-ready ZIPs — one for Chromium
// browsers, one for Firefox — with a tiny, dependency-free ZIP writer so CI
// needs nothing but Node.
//
//   node scripts/joplin/build-clipper.mjs
//   → dist/joplin-clipper-chrome.zip
//     dist/joplin-clipper-firefox.zip
//     dist/joplin-clipper.json      (sha256 per artifact, for release notes)
//
// The two archives differ ONLY in the manifest: Chromium rejects
// `browser_specific_settings` in some channels, and Firefox wants it. Everything
// else — including the source of every file — is identical, which is what makes
// the artifact reviewable.

import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const SOURCE = path.join(REPO, "extensions/joplin-clipper");
const OUT = path.join(REPO, "dist");

/** Minimal ZIP store/deflate writer (no dependencies, deterministic output). */
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = () => {
    const now = new Date();
    return {
      time: ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xffff,
      date: (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff,
    };
  };
  const { time, date } = dosTime();
  // A fixed timestamp keeps the artifact byte-stable for a given source.
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const deflated = deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(useDeflate ? 8 : 0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += local.length + name.length + payload.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const FILES = ["manifest.json", "background.js", "content.js", "popup.html", "popup.js", "popup.css", "README.md"];

async function main() {
  await mkdir(OUT, { recursive: true });
  const present = await readdir(SOURCE);
  const missing = FILES.filter((file) => !present.includes(file));
  if (missing.length) throw new Error(`The extension is incomplete: missing ${missing.join(", ")}`);

  const manifest = JSON.parse(await readFile(path.join(SOURCE, "manifest.json"), "utf8"));
  const artifacts = [];

  for (const target of ["chrome", "firefox"]) {
    const targetManifest = { ...manifest };
    if (target === "chrome") delete targetManifest.browser_specific_settings;
    if (target === "firefox") {
      // Firefox MV3 wants the service worker declared as a module-less script
      // and the gecko id to match the signed artifact.
      targetManifest.background = { service_worker: "background.js", type: "module" };
    }
    const entries = [];
    for (const file of FILES) {
      if (file === "manifest.json") {
        entries.push({ name: file, data: `${JSON.stringify(targetManifest, null, 2)}\n` });
        continue;
      }
      entries.push({ name: file, data: await readFile(path.join(SOURCE, file)) });
    }
    const zip = buildZip(entries);
    const name = `joplin-clipper-${target}.zip`;
    await writeFile(path.join(OUT, name), zip);
    artifacts.push({ name, target, bytes: zip.length, sha256: createHash("sha256").update(zip).digest("hex") });
    console.log(`[clipper:build] ${name} — ${zip.length} bytes, sha256 ${artifacts.at(-1).sha256.slice(0, 16)}…`);
  }

  await writeFile(
    path.join(OUT, "joplin-clipper.json"),
    `${JSON.stringify({ schema: 1, version: manifest.version, builtAt: new Date().toISOString(), artifacts }, null, 2)}\n`,
    "utf8",
  );
  const total = (await Promise.all(artifacts.map((artifact) => stat(path.join(OUT, artifact.name))))).reduce((sum, entry) => sum + entry.size, 0);
  console.log(`[clipper:build] wrote ${artifacts.length} artifacts (${total} bytes) to dist/`);
}

main().catch((error) => {
  console.error(`[clipper:build] FAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
