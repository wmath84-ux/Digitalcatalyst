// tests/joplinRuntime.test.mjs
//
// Contract test for Joplin workspace runtime discovery and bridge verification.
// Verifies that the deployed workspace in public/my-day-workspace/ is valid,
// passes detectJoplinRuntime() with status: "ready", and satisfies the bridge protocol.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  detectJoplinRuntime,
  isTrustedWorkspaceMessage,
  DC_MESSAGE_CHANNEL,
  DC_BRIDGE_PROTOCOL,
  JOPLIN_WORKSPACE_BASE_PATH,
  JOPLIN_WORKSPACE_MANIFEST,
} from "../src/joplin/joplinRuntime.ts";

test("public/my-day-workspace contains a valid runtime manifest and entry", () => {
  const manifestPath = path.join("public", "my-day-workspace", JOPLIN_WORKSPACE_MANIFEST);
  assert.equal(fs.existsSync(manifestPath), true, "dc-workspace.json must exist in public/my-day-workspace");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema, 1, "Schema must be 1");
  assert.equal(typeof manifest.sourceCommit, "string", "sourceCommit must be string");
  assert.ok(manifest.sourceCommit.length >= 7, "sourceCommit must be at least 7 chars");
  assert.equal(manifest.entry, "index.html", "entry must be index.html");
  assert.ok(Array.isArray(manifest.assets), "assets must be array");
  assert.equal(manifest.bridge?.protocol, DC_BRIDGE_PROTOCOL, `bridge.protocol must be ${DC_BRIDGE_PROTOCOL}`);

  const entryPath = path.join("public", "my-day-workspace", manifest.entry);
  assert.equal(fs.existsSync(entryPath), true, "Entry document must exist");

  const jsAsset = path.join("public", "my-day-workspace", "app.bundle.js");
  assert.equal(fs.existsSync(jsAsset), true, "app.bundle.js must exist");

  const cssAsset = path.join("public", "my-day-workspace", "app.bundle.css");
  assert.equal(fs.existsSync(cssAsset), true, "app.bundle.css must exist");
});

test("detectJoplinRuntime resolves status: ready when probing the shipped workspace", async () => {
  const fakeFetch = async (url) => {
    const rel = url.replace(JOPLIN_WORKSPACE_BASE_PATH, "");
    const filePath = path.join("public", "my-day-workspace", rel);
    if (!fs.existsSync(filePath)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    const content = fs.readFileSync(filePath, "utf8");
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(content),
    };
  };

  const result = await detectJoplinRuntime(fakeFetch);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.manifest.schema, 1);
    assert.equal(result.manifest.bridge.protocol, DC_BRIDGE_PROTOCOL);
    assert.equal(result.entryUrl, "/my-day-workspace/index.html");
  }
});

test("detectJoplinRuntime reports missing when manifest is 404", async () => {
  const fake404 = async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  });

  const result = await detectJoplinRuntime(fake404);
  assert.equal(result.status, "missing");
  if (result.status === "missing") {
    assert.equal(result.reason, "manifest_not_found");
    assert.equal(result.buildCommand, "npm run joplin:build");
  }
});

test("detectJoplinRuntime reports protocol mismatch when bundle protocol drifts", async () => {
  const fakeDrift = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      schema: 1,
      sourceCommit: "d32307364cc5c4fc7e3a0e36d85c0a0f8722aaa7",
      entry: "index.html",
      assets: ["app.bundle.js"],
      bridge: { protocol: 99 },
    }),
  });

  const result = await detectJoplinRuntime(fakeDrift);
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.reason, "bridge_protocol_mismatch:99");
  }
});

test("isTrustedWorkspaceMessage verifies channel, window source and origin", () => {
  const mockWindow = {};
  const origin = "https://app.digitalcatalyst.in";

  // Valid message from iframe window
  assert.equal(
    isTrustedWorkspaceMessage(
      {
        source: mockWindow,
        origin,
        data: { channel: DC_MESSAGE_CHANNEL, type: "app-ready" },
      },
      mockWindow,
      origin,
    ),
    true,
  );

  // Wrong window source
  assert.equal(
    isTrustedWorkspaceMessage(
      {
        source: {},
        origin,
        data: { channel: DC_MESSAGE_CHANNEL, type: "app-ready" },
      },
      mockWindow,
      origin,
    ),
    false,
  );

  // Wrong origin
  assert.equal(
    isTrustedWorkspaceMessage(
      {
        source: mockWindow,
        origin: "https://evil.com",
        data: { channel: DC_MESSAGE_CHANNEL, type: "app-ready" },
      },
      mockWindow,
      origin,
    ),
    false,
  );

  // Wrong channel
  assert.equal(
    isTrustedWorkspaceMessage(
      {
        source: mockWindow,
        origin,
        data: { channel: "other-channel", type: "app-ready" },
      },
      mockWindow,
      origin,
    ),
    false,
  );
});
