// api/_lib/webpush.ts
//
// CJS/ESM interop shim for the `web-push` package.
//
// `web-push` ships as CommonJS and only attaches `setVapidDetails` /
// `sendNotification` to its `module.exports`. Under Node's native ESM
// loader — which Vercel's Node runtime uses for `"type": "module"`
// projects — `import * as webpush from "web-push"` returns a namespace
// object whose real methods live under `webpush.default`, so calling
// `webpush.setVapidDetails(...)` throws:
//
//     TypeError: webpush.setVapidDetails is not a function
//
// That 500 is exactly what took the push cron down. A default import
// (`import webpush from "web-push"`) resolves correctly on Node, but can
// break under other bundlers that don't synthesise the default. Loading
// the CJS module through `createRequire` returns the real export object
// in every environment, so every API module imports this one shim
// instead of the package directly.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type WebPushOptions = {
  TTL?: number;
  vapidDetails?: {
    subject: string;
    publicKey: string;
    privateKey: string;
  };
  [key: string]: unknown;
};

type VapidKeys = { publicKey: string; privateKey: string };

export type WebPushError = Error & {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
};

type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: WebPushSubscription,
    payload?: string | Buffer,
    options?: WebPushOptions,
  ) => Promise<unknown>;
  generateVAPIDKeys: () => VapidKeys;
  setGCMAPIKey: (apiKey: string | null) => void;
};

const loaded = require("web-push") as Partial<WebPushModule> & { default?: WebPushModule };
const resolved: WebPushModule = loaded.default ?? (loaded as WebPushModule);

if (typeof resolved.setVapidDetails !== "function" || typeof resolved.sendNotification !== "function") {
  throw new Error(
    "web-push module did not expose setVapidDetails/sendNotification. Check the installed web-push version (expect 3.x).",
  );
}

export const { setVapidDetails, sendNotification, generateVAPIDKeys, setGCMAPIKey } = resolved;

export default resolved;
export type { WebPushSubscription, WebPushOptions };
