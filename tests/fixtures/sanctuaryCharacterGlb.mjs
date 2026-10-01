// An ORIGINAL tiny skinned box for loader/installer tests only. Not Katiusza,
// not a substitute design, not a runtime asset; no upstream content is copied.
export const MOTIONS = ['idle', 'walkForward', 'walkBack', 'walkLeft', 'walkRight', 'runForward', 'runBack', 'runLeft', 'runRight', 'startForward', 'stopForward', 'turnLeft', 'turnRight', 'jump', 'fall', 'land', 'crouchIdle', 'crouchForward', 'crouchBack', 'crouchLeft', 'crouchRight', 'coverIdle', 'coverLeft', 'coverRight', 'coverLeanLeft', 'coverLeanRight'];
export const BONE_MAP = { head: 'head', chest: 'spine_03', leftHip: 'thigh_l', leftKnee: 'calf_l', leftFoot: 'foot_l', rightHip: 'thigh_r', rightKnee: 'calf_r', rightFoot: 'foot_r' };
export const MAPPING = { version: 1, label: 'Owned test fixture', modelUrl: '/sanctuary/character/character.glb', modelForward: '-Z', licenseConfirmed: true, animationMap: Object.fromEntries(MOTIONS.map(k => [k, k])), boneMap: BONE_MAP };

export function characterFixtureJson() {
  const positions = new Float32Array([-0.5, 0, -0.2, 0.5, 0, -0.2, 0.5, 2, -0.2, -0.5, 2, -0.2, -0.5, 0, 0.2, 0.5, 0, 0.2, 0.5, 2, 0.2, -0.5, 2, 0.2]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3, 7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4]);
  const joints = new Uint16Array(8 * 4);
  const weights = new Float32Array(8 * 4); for (let i = 0; i < 8; i++) weights[i * 4] = 1;
  const times = new Float32Array([0, 1]);
  const translations = new Float32Array([0, 0, 0, 0, 0.1, 0]);
  const chunks = [positions, indices, joints, weights, times, translations].map(a => Buffer.from(a.buffer));
  let offset = 0;
  const bufferViews = chunks.map(c => { const v = { buffer: 0, byteOffset: offset, byteLength: c.length }; offset += c.length; return v; });
  const binary = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'Sanctuary original test fixture' }, scene: 0, scenes: [{ nodes: [0] }],
    buffers: [{ byteLength: binary.length }], bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, 0, -0.2], max: [0.5, 2, 0.2] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
      { bufferView: 2, componentType: 5123, count: 8, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 8, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 5, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    nodes: [
      { name: 'TestCharacter', mesh: 0, skin: 0, children: [1] },
      { name: 'hips', children: [2, 4, 7] },
      { name: 'spine_03', translation: [0, 1, 0], children: [3] },
      { name: 'head', translation: [0, 0.7, 0] },
      { name: 'thigh_l', translation: [-0.1, 1, 0], children: [5] },
      { name: 'calf_l', translation: [0, -0.5, 0], children: [6] },
      { name: 'foot_l', translation: [0, -0.5, 0] },
      { name: 'thigh_r', translation: [0.1, 1, 0], children: [8] },
      { name: 'calf_r', translation: [0, -0.5, 0], children: [9] },
      { name: 'foot_r', translation: [0, -0.5, 0] },
    ],
    skins: [{ skeleton: 1, joints: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.15, 0.65, 0.4, 1], roughnessFactor: 0.8, metallicFactor: 0 } }],
    animations: MOTIONS.map(name => ({ name, samplers: [{ input: 4, output: 5, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] })),
  };
  return { json, binary };
}

export function encodeGlb(json, binary = characterFixtureJson().binary) {
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20); text.copy(padded);
  const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(bin);
  const bytes = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  const at = 20 + padded.length; bytes.writeUInt32LE(bin.length, at); bytes.writeUInt32LE(0x004e4942, at + 4); bin.copy(bytes, at + 8);
  return bytes;
}
