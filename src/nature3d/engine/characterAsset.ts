import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { damp } from "./controls";
import { CHARACTER_HEIGHT, CHARACTER_SCALE } from "./characterConfig";
import { terrainNormal } from "./terrain";
import type { TrekAvatar, TrekPlayer } from "./trekAvatar";

import { ANIMATION_KEYS, readCharacterManifest, type AnimationKey, type CharacterManifest, type CharacterAssetStatus } from "./characterManifest";
export { ANIMATION_KEYS, BONE_ROLES, FALLBACK_CHARACTER_STATUS, parseCharacterManifest } from "./characterManifest";
export type { AnimationKey, CharacterManifest, CharacterAssetStatus } from "./characterManifest";

/**
 * Y rotation that turns the model's own forward axis onto the runtime travel
 * axis. The controller/camera read "forward" as -Z at zero yaw, so a GLB
 * whose face looks down +Z must be turned half a circle; otherwise the
 * character walks backwards and every arm swing reads in reverse.
 */
export function characterFacingYaw(modelForward: "-Z" | "+Z"): number {
  return modelForward === "+Z" ? Math.PI : 0;
}

/** Remove horizontal root translation: physics is authoritative, never double-move. */
export function inPlaceClip(source: THREE.AnimationClip, rootNames: ReadonlySet<string> = new Set()): THREE.AnimationClip {
  const clip = source.clone();
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position") || track.getValueSize() !== 3) continue;
    const node = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    if (!/(^|[/.])(?:root|pelvis|hips|mixamorigHips)\.position$/i.test(track.name) && !rootNames.has(node)) continue;
    const x = track.values[0];
    const z = track.values[2];
    for (let i = 0; i < track.values.length; i += 3) { track.values[i] = x; track.values[i + 2] = z; }
  }
  return clip;
}

type Layer = { key: AnimationKey; action: THREE.AnimationAction; weight: number; target: number; gait: boolean };
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

class ExportedFootIK {
  private h = new THREE.Vector3();
  private k = new THREE.Vector3();
  private f = new THREE.Vector3();
  private t = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private pole = new THREE.Vector3();
  private kneeTarget = new THREE.Vector3();
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private delta = new THREE.Quaternion();
  private worldQ = new THREE.Quaternion();
  private parentQ = new THREE.Quaternion();
  private footQ = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  apply(hip: THREE.Bone, knee: THREE.Bone, foot: THREE.Bone, player: TrekPlayer, soleOffset: number) {
    hip.getWorldPosition(this.h); knee.getWorldPosition(this.k); foot.getWorldPosition(this.f);
    foot.getWorldQuaternion(this.footQ);
    const ground = player.groundAt(this.f.x, this.f.z) + soleOffset;
    const offset = THREE.MathUtils.clamp(ground - this.f.y, -0.2 * CHARACTER_SCALE, 0.25 * CHARACTER_SCALE);
    if (Math.abs(offset) < 0.003 * CHARACTER_SCALE) return;
    this.t.copy(this.f); this.t.y += offset;
    const thigh = this.h.distanceTo(this.k);
    const calf = this.k.distanceTo(this.f);
    if (thigh < 0.01 || calf < 0.01) return;
    this.dir.copy(this.t).sub(this.h);
    const distance = THREE.MathUtils.clamp(this.dir.length(), Math.abs(thigh - calf) + 0.005, thigh + calf - 0.005);
    this.dir.normalize();
    this.pole.copy(this.k).sub(this.h);
    this.pole.addScaledVector(this.dir, -this.pole.dot(this.dir));
    if (this.pole.lengthSq() < 1e-7) this.pole.set(-Math.sin(player.rotation), 0, -Math.cos(player.rotation));
    this.pole.normalize();
    const along = (thigh * thigh - calf * calf + distance * distance) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, thigh * thigh - along * along));
    this.kneeTarget.copy(this.h).addScaledVector(this.dir, along).addScaledVector(this.pole, bend);
    this.from.copy(this.k).sub(this.h).normalize(); this.to.copy(this.kneeTarget).sub(this.h).normalize();
    this.delta.setFromUnitVectors(this.from, this.to);
    hip.getWorldQuaternion(this.worldQ); this.worldQ.premultiply(this.delta);
    hip.parent!.getWorldQuaternion(this.parentQ).invert();
    hip.quaternion.copy(this.parentQ.multiply(this.worldQ)); hip.updateMatrixWorld(true);
    knee.getWorldPosition(this.k); foot.getWorldPosition(this.f);
    this.from.copy(this.f).sub(this.k).normalize(); this.to.copy(this.t).sub(this.k).normalize();
    this.delta.setFromUnitVectors(this.from, this.to);
    knee.getWorldQuaternion(this.worldQ); this.worldQ.premultiply(this.delta);
    knee.parent!.getWorldQuaternion(this.parentQ).invert();
    knee.quaternion.copy(this.parentQ.multiply(this.worldQ)); knee.updateMatrixWorld(true);
    terrainNormal(this.t.x, this.t.z, this.normal);
    this.delta.setFromUnitVectors(this.up, this.normal);
    this.footQ.premultiply(this.delta);
    foot.parent!.getWorldQuaternion(this.parentQ).invert();
    foot.quaternion.copy(this.parentQ.multiply(this.footQ)); foot.updateMatrixWorld(true);
  }
}

/**
 * Character-only glTF adapter. Imports the complete mesh/materials/textures,
 * skeleton and mapped animation clips — never the upstream land/sky/map.
 * Call once; failure leaves the original procedural guide and world running.
 */
export async function loadCharacterAvatar(shadows: boolean, installedManifest?: CharacterManifest): Promise<{ avatar: TrekAvatar; status: CharacterAssetStatus } | null> {
  const manifest = installedManifest ?? await readCharacterManifest(import.meta.env.BASE_URL);
  if (!manifest.modelUrl) return null;
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${manifest.modelUrl.slice(1)}`);
  let skinned = 0;
  let environmentNodes = false;
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  const bones: THREE.Bone[] = [];
  gltf.scene.traverse(o => {
    if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) environmentNodes = true;
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    mesh.castShadow = shadows; mesh.receiveShadow = false;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) { skinned++; skeletons.add((mesh as THREE.SkinnedMesh).skeleton); }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const v of Object.values(material)) if (v instanceof THREE.Texture) textures.add(v);
    }
  });
  const disposeAssets = () => {
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    textures.forEach(t => t.dispose()); skeletons.forEach(s => s.dispose()); gltf.scene.clear();
  };
  if (environmentNodes) { disposeAssets(); throw new Error("Export the character skeletal mesh only, not an Unreal level, lights or cameras"); }
  if (!skinned || !gltf.animations.length) { disposeAssets(); throw new Error("Character GLB needs a skinned mesh AND animations"); }
  const clips = new Map(gltf.animations.map(c => [c.name, c]));
  for (const [key, name] of Object.entries(manifest.animationMap)) {
    if (!clips.has(name)) { disposeAssets(); throw new Error(`Character ${key} animation missing: ${name}`); }
  }
  for (const key of ["idle", "walkForward", "runForward", "jump", "fall", "land", "crouchIdle"] as const) {
    if (!manifest.animationMap[key]) { disposeAssets(); throw new Error(`Character requires a ${key} animation mapping`); }
  }
  for (const [role, name] of Object.entries(manifest.boneMap ?? {})) {
    if (!bones.some(b => b.name === THREE.PropertyBinding.sanitizeNodeName(name))) {
      disposeAssets(); throw new Error(`Character ${role} bone missing: ${name}`);
    }
  }
  // FBX/DCC exports can name the root Armature/Rig.001, not just "root".
  // Strip horizontal motion on actual skeleton roots and their wrappers too.
  const rootMotionNames = new Set<string>();
  for (const bone of bones) {
    if ((bone.parent as THREE.Bone | null)?.isBone) continue;
    let ancestor: THREE.Object3D | null = bone;
    while (ancestor) { rootMotionNames.add(ancestor.name || ancestor.uuid); ancestor = ancestor.parent; }
  }
  const group = new THREE.Group(); group.name = "sanctuary-character";
  const model = gltf.scene;
  model.rotation.y = characterFacingYaw(manifest.modelForward);
  group.add(model);
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) { disposeAssets(); throw new Error("Character has invalid bounds"); }
  if (Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) > height * 2.25) {
    disposeAssets(); throw new Error("GLB bounds include environment-sized geometry; export only the character");
  }
  const scale = CHARACTER_HEIGHT / height;
  model.scale.multiplyScalar(scale);
  model.position.set(-(bounds.min.x + bounds.max.x) * 0.5 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * 0.5 * scale);
  group.userData.characterHeight = CHARACTER_HEIGHT;
  group.userData.characterSource = "imported";
  const mixer = new THREE.AnimationMixer(model);
  const layers: Layer[] = [];
  const byKey: Partial<Record<AnimationKey, Layer>> = {};
  for (const key of ANIMATION_KEYS) {
    const name = manifest.animationMap[key];
    if (!name) continue;
    const action = mixer.clipAction(inPlaceClip(clips.get(name)!, rootMotionNames));
    const gait = /^(walk|run|crouch(?:Forward|Back|Left|Right)|cover(?:Left|Right))/.test(key);
    const oneShot = /^(start|stop|turn|jump|land)/.test(key);
    if (oneShot) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    action.paused = gait;
    action.play().setEffectiveWeight(0);
    const layer = { key, action, weight: 0, target: 0, gait };
    byKey[key] = layer; layers.push(layer);
  }
  const findBone = (role: keyof NonNullable<CharacterManifest["boneMap"]>, aliases: string[]) => {
    const explicit = manifest.boneMap?.[role];
    return bones.find(b => explicit ? b.name === THREE.PropertyBinding.sanitizeNodeName(explicit) : aliases.some(a => normName(b.name).endsWith(normName(a))));
  };
  const head = findBone("head", ["head"]);
  const chest = findBone("chest", ["spine_03", "spine2", "chest"]);
  const left = [findBone("leftHip", ["thigh_l", "LeftUpLeg"]), findBone("leftKnee", ["calf_l", "LeftLeg"]), findBone("leftFoot", ["foot_l", "LeftFoot"])];
  const right = [findBone("rightHip", ["thigh_r", "RightUpLeg"]), findBone("rightKnee", ["calf_r", "RightLeg"]), findBone("rightFoot", ["foot_r", "RightFoot"])];
  // Procedural aim/IK must start from a fresh pose every frame. Exporters may
  // omit constant head/leg channels; without this, unanimated bones accumulate
  // the added rotations and eventually twist/spin instead of following camera.
  const boneRest = bones.map(bone => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));
  // Original foot joints are ANKLES, above the boot sole. Calibrate that
  // distance after normalization; forcing an ankle to ground clips the boot.
  group.updateMatrixWorld(true);
  const soleProbe = new THREE.Vector3();
  const soleOffset = (foot: THREE.Bone | undefined) => foot
    ? THREE.MathUtils.clamp(foot.getWorldPosition(soleProbe).y, 0.02 * CHARACTER_SCALE, 0.28 * CHARACTER_SCALE)
    : 0.035 * CHARACTER_SCALE;
  const leftSoleOffset = soleOffset(left[2]), rightSoleOffset = soleOffset(right[2]);
  const ik = new ExportedFootIK();
  const aimQ = new THREE.Quaternion(); const parentQ = new THREE.Quaternion(); const worldQ = new THREE.Quaternion();
  const aimUp = new THREE.Vector3(0, 1, 0); const aimRight = new THREE.Vector3(); const pitchQ = new THREE.Quaternion();
  let lowEnd = false;
  let previousState = "";
  let ikClock = 0;
  function desire(key: AnimationKey, weight = 1, fallback: AnimationKey = "idle") {
    const layer = byKey[key] ?? byKey[fallback];
    if (layer) layer.target += weight;
  }
  function aim(bone: THREE.Bone | undefined, player: TrekPlayer, amount: number) {
    if (!bone?.parent) return;
    aimQ.setFromAxisAngle(aimUp, player.lookYaw * amount);
    aimRight.set(Math.cos(player.rotation), 0, -Math.sin(player.rotation));
    pitchQ.setFromAxisAngle(aimRight, player.lookPitch * amount * 0.7);
    bone.getWorldQuaternion(worldQ); worldQ.premultiply(aimQ.multiply(pitchQ));
    bone.parent.getWorldQuaternion(parentQ).invert();
    bone.quaternion.copy(parentQ.multiply(worldQ)); bone.updateMatrixWorld(true);
  }
  const avatar: TrekAvatar = {
    group,
    get seated() { return false; },
    setSeated() { /* No seated student; this adapter is a standing player. */ },
    setVisible(visible) { model.visible = visible; },
    setLowEnd(value) { lowEnd = value; },
    update(dt, _time, player, camera) {
      for (const layer of layers) layer.target = 0;
      const inCover = player.state.startsWith("cover");
      if (!player.grounded || player.state === "land") desire(player.state === "jump" ? "jump" : player.state === "land" ? "land" : "fall");
      else if (inCover) {
        if (Math.abs(player.coverLean) > 0.1) desire(player.coverLean < 0 ? "coverLeanLeft" : "coverLeanRight", 1, "coverIdle");
        else if (player.speed > 0.05) desire(Math.sin(player.strafeAngle) > 0 ? "coverLeft" : "coverRight", 1, "coverIdle");
        else desire("coverIdle", 1, "crouchIdle");
      } else if (player.speed < 0.05) desire(player.crouchAmount > 0.5 ? "crouchIdle" : "idle");
      else {
        const base = player.crouchAmount > 0.5 ? "crouch" : player.speed > 3.2 ? "run" : "walk";
        const f = Math.cos(player.strafeAngle); const side = Math.sin(player.strafeAngle);
        const total = Math.max(1e-6, Math.abs(f) + Math.abs(side));
        const fallback = `${base}Forward` as AnimationKey;
        desire(`${base}Forward` as AnimationKey, Math.max(f, 0) / total, fallback);
        desire(`${base}Back` as AnimationKey, Math.max(-f, 0) / total, fallback);
        desire(`${base}Left` as AnimationKey, Math.max(side, 0) / total, fallback);
        desire(`${base}Right` as AnimationKey, Math.max(-side, 0) / total, fallback);
      }
      const transition: AnimationKey | null = player.state === "start" ? "startForward" : player.state === "stop" ? "stopForward" : player.state === "turn" ? player.lookYaw < 0 ? "turnRight" : "turnLeft" : null;
      if (transition && byKey[transition]) {
        for (const layer of layers) layer.target *= 0.45;
        desire(transition, 0.55);
      }
      if (previousState !== player.state) {
        const key = transition ?? (player.state === "jump" ? "jump" : player.state === "land" ? "land" : null);
        if (key && byKey[key]) byKey[key]!.action.reset().play();
        previousState = player.state;
      }
      let weightSum = 0;
      for (const layer of layers) { layer.weight = THREE.MathUtils.lerp(layer.weight, layer.target, damp(14, dt)); weightSum += layer.weight; }
      for (const layer of layers) {
        layer.action.setEffectiveWeight(layer.weight / Math.max(weightSum, 1e-6));
        if (layer.gait) { layer.action.paused = true; layer.action.time = player.gaitPhase / (2 * Math.PI) * layer.action.getClip().duration; }
      }
      for (const pose of boneRest) {
        pose.bone.position.copy(pose.position); pose.bone.quaternion.copy(pose.quaternion); pose.bone.scale.copy(pose.scale);
      }
      mixer.update(dt);
      group.updateMatrixWorld(true);
      aim(chest, player, 0.25); aim(head, player, 0.7);
      ikClock += dt;
      if (player.grounded && camera.position.distanceToSquared(group.position) < (30 * CHARACTER_SCALE) ** 2 && ikClock >= (lowEnd ? 1 / 15 : 1 / 30)) {
        ikClock = 0;
        if (left.every(Boolean)) ik.apply(left[0]!, left[1]!, left[2]!, player, leftSoleOffset);
        if (right.every(Boolean)) ik.apply(right[0]!, right[1]!, right[2]!, player, rightSoleOffset);
      }
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); disposeAssets(); group.removeFromParent(); group.clear(); },
  };
  const missing = ANIMATION_KEYS.filter(key => !manifest.animationMap[key]);
  return { avatar, status: { kind: "imported", label: `${manifest.label} · 18 ft`, detail: `Licensed character-only GLB; web movement/camera. Native Unreal cloth/ragdoll/Blueprints are not running.${missing.length ? ` Missing optional motions: ${missing.join(", ")}.` : ""}` } };
}
