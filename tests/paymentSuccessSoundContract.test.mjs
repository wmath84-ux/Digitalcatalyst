import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sounds = fs.readFileSync("src/utils/paymentSounds.ts", "utf8");
const gateway = fs.readFileSync("src/components/PaymentGateway.tsx", "utf8");

test("success chime is synthesized with Web Audio — no asset download", () => {
  assert.match(sounds, /export const preparePaymentSound/);
  assert.match(sounds, /export const playPaymentSuccessChime/);
  assert.match(sounds, /AudioContext/);
  assert.match(sounds, /webkitAudioContext/); // iOS Safari prefix
  assert.match(sounds, /createOscillator/);
  assert.match(sounds, /exponentialRampToValueAtTime/); // click-free envelopes
  // Paytm-style confirmation buzz alongside the chime.
  assert.match(sounds, /vibrate/);
});

test("audio is unlocked inside the Pay-button gesture for autoplay policies", () => {
  // The shared AudioContext must be created/resumed within the click
  // itself, otherwise verification-time playback stays suspended.
  assert.match(gateway, /const startPayment = async \(\) => \{\s*preparePaymentSound\(\);/);
});

test("chime fires exactly when the server verifies — paid and free paths", () => {
  const hits = gateway.match(/playPaymentSuccessChime\(\);/g) || [];
  assert.equal(hits.length, 2, "expected exactly one chime per verified payment path");
  // Immediately at the moment the payment flips to success — not later
  // on the receipt screen — so the feedback matches the money event.
  assert.match(gateway, /setPaymentState\("success"\);\s*playPaymentSuccessChime\(\);/);
});
