// Smoke harness for the REAL eighteen-foot player, its placeholder body and
// the authorized character asset pipeline.
// Detailed behavior/asset/browser regressions: npm run test:sanctuary:character
// Run this alongside the existing shader/world harnesses via verify-nature3d.sh.
import * as THREE from "three";
import { createEmptyAvatar } from "../src/nature3d/engine/characterPlayer";
import { FALLBACK_CHARACTER_STATUS } from "../src/nature3d/engine/characterManifest";
import { CharacterController } from "../src/nature3d/engine/characterController";
import { CharacterCollisionWorld } from "../src/nature3d/engine/characterCollision";
import { CHARACTER_HEIGHT, CHARACTER_TUNING } from "../src/nature3d/engine/characterConfig";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
// The Sanctuary must never draw a stand-in figure: a procedural look-alike
// used to cover for a character that had not loaded at all.
const avatar = createEmptyAvatar();
check("placeholder: no procedural stand-in body", avatar.group.children.length === 0 && avatar.group.userData.characterSource === "none");
check("placeholder: still reports the eighteen-foot capsule", avatar.group.userData.characterHeight === CHARACTER_HEIGHT && avatar.group.name === "sanctuary-character");
check("placeholder: status is honest about having no substitute figure",
  FALLBACK_CHARACTER_STATUS.kind === "loading" && /no substitute figure/.test(FALLBACK_CHARACTER_STATUS.detail));
const world = new CharacterCollisionWorld(() => 0);
const player = new CharacterController(world);
const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 4000);
player.reset(0, 0); player.setMode("third-person"); player.setInput(0, 1, true, false);
for (let i = 0; i < 120; i++) player.update(1 / 60, camera);
check("controller: moves forward at metre-scale run speed", player.position.z < -8 && Math.abs(player.speed - CHARACTER_TUNING.runSpeed) < 1e-6);
player.clearInput(); player.jump(); let max = 0; const states = new Set<string>();
for (let i = 0; i < 120; i++) { player.update(1 / 60, camera); max = Math.max(max, player.position.y); states.add(player.state); }
check("controller: physical jump and landing", max > 1.2 && player.grounded && states.has("jump") && states.has("fall") && states.has("land"));
player.setMode("first-person"); player.update(1 / 60, camera);
check("camera: FPP hides body and places eye inside standing capsule", !player.cameraRig.bodyVisible && camera.position.y < CHARACTER_HEIGHT && camera.position.y > 1.6);
player.setMode("third-person");
let finite = true;
for (let i = 0; i < 180; i++) {
  player.setInput(Math.sin(i * 0.02), 1, false, true); player.update(1 / 60, camera);
  if (!Number.isFinite(player.position.lengthSq() + player.rotation + player.speed)) finite = false;
}
check("pose: mixed-input controller remains finite", finite);
avatar.dispose(); world.dispose();
console.log(failures ? `\n${failures} AVATAR CHECK(S) FAILED` : "\nALL AVATAR CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
