export const ANIMATION_KEYS = [
  "idle", "walkForward", "walkBack", "walkLeft", "walkRight",
  "runForward", "runBack", "runLeft", "runRight",
  "startForward", "stopForward", "turnLeft", "turnRight", "jump", "fall", "land",
  "crouchIdle", "crouchForward", "crouchBack", "crouchLeft", "crouchRight",
  "coverIdle", "coverLeft", "coverRight", "coverLeanLeft", "coverLeanRight",
] as const;
export type AnimationKey = typeof ANIMATION_KEYS[number];
export const BONE_ROLES = ["head", "chest", "leftHip", "leftKnee", "leftFoot", "rightHip", "rightKnee", "rightFoot"] as const;
export interface CharacterManifest {
  version: 1;
  label: string;
  modelUrl: string | null;
  modelForward: "-Z" | "+Z";
  licenseConfirmed: boolean;
  animationMap: Partial<Record<AnimationKey, string>>;
  boneMap?: Partial<Record<typeof BONE_ROLES[number], string>>;
}
export interface CharacterAssetStatus {
  kind: "procedural" | "imported" | "error";
  label: string;
  detail: string;
}
export const FALLBACK_CHARACTER_STATUS: CharacterAssetStatus = Object.freeze({
  kind: "procedural",
  label: "Sanctuary guide · 18 ft",
  detail: "Original web guide. Exact Unreal character/animations require a licensed GLB export; they are not installed yet.",
});

export function parseCharacterManifest(value: unknown): CharacterManifest {
  if (!value || typeof value !== "object") throw new Error("Character manifest is not an object");
  const m = value as Record<string, unknown>;
  if (m.version !== 1) throw new Error("Unsupported character manifest version");
  if (m.modelUrl !== null && (typeof m.modelUrl !== "string" || !/^\/sanctuary\/character\/[a-zA-Z0-9_./-]+\.glb$/.test(m.modelUrl) || m.modelUrl.includes(".."))) {
    throw new Error("Character model must be a local /sanctuary/character/*.glb asset");
  }
  if (m.modelUrl && m.licenseConfirmed !== true) throw new Error("Confirm the rights to deploy the character before importing its assets");
  if (m.modelForward !== "-Z" && m.modelForward !== "+Z") throw new Error("Character forward axis must be -Z or +Z");
  if (!m.animationMap || typeof m.animationMap !== "object" || Array.isArray(m.animationMap)) throw new Error("Invalid character animation map");
  for (const [key, clip] of Object.entries(m.animationMap)) {
    if (!ANIMATION_KEYS.includes(key as AnimationKey) || typeof clip !== "string" || !clip.trim()) throw new Error(`Invalid animation mapping: ${key}`);
  }
  if (m.boneMap !== undefined) {
    if (!m.boneMap || typeof m.boneMap !== "object" || Array.isArray(m.boneMap)) throw new Error("Invalid character bone map");
    for (const [role, bone] of Object.entries(m.boneMap)) {
      if (!BONE_ROLES.includes(role as typeof BONE_ROLES[number]) || typeof bone !== "string" || !bone.trim()) throw new Error(`Invalid bone mapping: ${role}`);
    }
  }
  return {
    version: 1, label: typeof m.label === "string" ? m.label : "Imported character",
    modelUrl: m.modelUrl as string | null, modelForward: m.modelForward,
    licenseConfirmed: m.licenseConfirmed === true,
    animationMap: m.animationMap as CharacterManifest["animationMap"],
    boneMap: m.boneMap && typeof m.boneMap === "object" ? m.boneMap as CharacterManifest["boneMap"] : undefined,
  };
}

/** Local deployment manifest; absence of a model deliberately keeps the web guide. */
export async function readCharacterManifest(baseUrl = "/"): Promise<CharacterManifest> {
  const response = await fetch(`${baseUrl}sanctuary/character/manifest.json`);
  if (!response.ok) throw new Error(`Character manifest HTTP ${response.status}`);
  return parseCharacterManifest(await response.json());
}
