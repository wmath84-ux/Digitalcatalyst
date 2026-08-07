#!/usr/bin/env node
// Send web push notifications from the command line.
//
// Targets:
//   --all                          send to every stored subscription (requires FIREBASE_SERVICE_ACCOUNT)
//   --uid <uid>                    send to one user's stored subscriptions (requires FIREBASE_SERVICE_ACCOUNT)
//   --file <subscriptions.json>    send to subscriptions read from a JSON file
//
// Message:
//   --title <text>   --body <text>   --tag <tag>   --url <url>
//   --icon <url>     --badge <url>
//
// Credentials (env or .env):
//   WEB_PUSH_VAPID_PUBLIC_KEY  WEB_PUSH_VAPID_PRIVATE_KEY  WEB_PUSH_SUBJECT (mailto:...)
//   FIREBASE_SERVICE_ACCOUNT   (JSON string or path to service account file)

import webpush from 'web-push';

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const hasFlag = (name) => args.includes(name);

const title = getArg('--title') || 'Eduvora';
const body = getArg('--body') || '';
const tag = getArg('--tag');
const url = getArg('--url');
const icon = getArg('--icon');
const badge = getArg('--badge');
const uid = getArg('--uid');
const file = getArg('--file');
const sendToAll = hasFlag('--all');

const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
if (!publicKey || !privateKey) {
  console.error('Missing WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY.');
  process.exit(1);
}
webpush.setVapidDetails(
  process.env.WEB_PUSH_SUBJECT || 'mailto:admin@eduvora.app',
  publicKey,
  privateKey,
);

const toPushSub = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.endpoint === 'string' && item.keys && typeof item.keys.p256dh === 'string' && typeof item.keys.auth === 'string') {
    return { endpoint: item.endpoint, keys: { p256dh: item.keys.p256dh, auth: item.keys.auth } };
  }
  if (typeof item.endpoint === 'string' && typeof item.p256dh === 'string' && typeof item.auth === 'string') {
    return { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } };
  }
  return null;
};

const loadServiceAccount = async () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (raw.trim().startsWith('{')) return JSON.parse(raw);
  const fs = await import('node:fs');
  return JSON.parse(fs.readFileSync(raw, 'utf8'));
};

let subscriptions = [];

if (file) {
  const fs = await import('node:fs');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
  subscriptions = list.map(toPushSub).filter(Boolean);
} else if (uid || sendToAll) {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const account = await loadServiceAccount();
  if (!account) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT for --uid / --all mode.');
    process.exit(1);
  }
  const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(account) });
  const firestore = getFirestore(app);
  const snapshot = sendToAll
    ? await firestore.collectionGroup('webPushSubscriptions').get()
    : await firestore.collection('users').doc(uid).collection('webPushSubscriptions').get();
  subscriptions = snapshot.docs.map(item => toPushSub(item.data())).filter(Boolean);
}

if (subscriptions.length === 0) {
  console.error('No subscriptions to send to. Provide --file, --uid, or --all.');
  process.exit(1);
}

const payload = JSON.stringify({ title, body, tag: tag || undefined, url: url || undefined, icon: icon || undefined, badge: badge || undefined });
const results = [];
for (const subscription of subscriptions) {
  try {
    await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 });
    results.push({ ok: true, endpoint: subscription.endpoint });
  } catch (error) {
    results.push({ ok: false, endpoint: subscription.endpoint, status: error.statusCode || 0, error: error.message || String(error) });
  }
}
const sent = results.filter(result => result.ok).length;
console.log(`Sent ${sent}/${results.length} notifications.`);
for (const result of results) {
  console.log(`  ${result.ok ? 'OK ' : 'FAIL'} ${result.endpoint}${result.status ? ` (${result.status})` : ''}${result.error ? ` ${result.error}` : ''}`);
}
process.exit(sent === results.length ? 0 : 2);
