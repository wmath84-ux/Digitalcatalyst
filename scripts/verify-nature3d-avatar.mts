// Smoke harness for the REAL six-foot player and visual rig.
// Detailed behavior/asset/browser regressions: npm run test:sanctuary:character
// Run this alongside the existing shader/world harnesses via verify-nature3d.sh.
import * as THREE from "three";
import { createTrekAvatar } from "../src/nature3d/engine/trekAvatar";
import { CharacterController } from "../src/nature3d/engine/characterController";
import { CharacterCollisionWorld } from "../src/nature3d/engine/characterCollision";
import { CHARACTER_HEIGHT, CHARACTER_TUNING } from "../src/nature3d/engine/characterConfig";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const avatar = createTrekAvatar(false);
const box = new THREE.Box3().setFromObject(avatar.group);
check("rig: neutral mesh is exactly six feet", Math.abs(box.getSize(new THREE.Vector3()).y - CHARACTER_HEIGHT) < 1e-6);
check("rig: standing, explicitly procedural, never the original Unreal character", !avatar.seated && avatar.group.userData.characterSource === "procedural");
let triangles = 0, meshes = 0;
const materials = new Set<THREE.Material>();
avatar.group.traverse(o => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return;
  meshes++;
  triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
});
check("rig: low-end geometry/material budget", triangles <= 8000 && materials.size <= 2 && meshes <= 24, `${triangles} tris, ${materials.size} materials, ${meshes} meshes`);
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
  avatar.group.position.copy(player.position); avatar.group.rotation.y = player.rotation;
  avatar.update(1 / 60, i / 60, player, camera);
  avatar.group.traverse(o => { if (!Number.isFinite(o.position.lengthSq() + o.quaternion.lengthSq())) finite = false; });
}
check("pose: moving/crouched rig remains finite", finite);
avatar.dispose(); world.dispose();
console.log(failures ? `\n${failures} AVATAR CHECK(S) FAILED` : "\nALL AVATAR CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
