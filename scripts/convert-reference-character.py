#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Original Katiusza UE5.1 editor-source -> character-only binary glTF.

Standalone build tool, NOT part of the application bundle. Requires the GPL-3.0
unreal-assets-to-glb==5.5.0 package for its package/property reader, plus numpy
and Pillow. The skeletal/animation conversion here reads actual source vertices,
weights, reference poses and keys; it does not generate a substitute likeness.
Serialization references: CUE4Parse (Apache-2.0), UE5 skeletal editor structures.
Supports ONLY the inspected/pinned reference mesh, not arbitrary uasset formats.

Use: PYTHONPATH=.cache/character-conversion/python python3
     scripts/convert-reference-character.py [--all-animations]
Output remains private/ignored by default. Deployment requires the separate
license-confirmed installer. --all-animations retains all original source keys
in a large external archive; runtime mode samples 1920Hz retargeted curves at
60Hz and keeps the 26 mapped controller clips. No environment is exported.
"""
import argparse
import hashlib
import json
import struct
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
from uasset.package import Package
from uasset.properties import read_properties, skip_properties
from uasset.reader import BinaryReader
from uasset.mesh import extract_trailer_payload, decompress_compressed_buffer

PIN = "bf56bcd56c5dd149590d1e5a0dc45575ae2fa95c"
MESH_SHA = "da714540cec5b64267ac7430507445b65fe1305638a8413d904784077e14dc56"
MOTIONS = {
    "idle": "InPlace/Idle", "walkForward": "InPlace/WalkFwd", "walkBack": "InPlace/WalkBwd",
    "walkLeft": "InPlace/WalkLeft", "walkRight": "InPlace/WalkRight", "runForward": "InPlace/RunFwd",
    "runBack": "InPlace/RunBwd", "runLeft": "InPlace/RunLeft", "runRight": "InPlace/RunRight",
    "startForward": "InPlace/WalkFwdStart", "stopForward": "InPlace/WalkFwdStop_LU",
    "turnLeft": "Retargeted/A_Left_Turn_90", "turnRight": "Retargeted/A_Right_Turn_90",
    "jump": "InPlace/JumpPlace1_Start", "fall": "InPlace/FallingLoop", "land": "InPlace/JumpPlace1_Land",
    "crouchIdle": "InPlace/CrouchLoop", "crouchForward": "InPlace/Crouch_WalkFwd",
    "crouchBack": "InPlace/Crouch_WalkBwd", "crouchLeft": "InPlace/Crouch_WalkLt", "crouchRight": "InPlace/Crouch_WalkRt",
    "coverIdle": "Retargeted/A_Cover_Idle_L", "coverLeft": "Retargeted/A_Cover_Move_L",
    "coverRight": "Retargeted/A_Cover_Move_R", "coverLeanLeft": "Retargeted/A_Cover_Look_L", "coverLeanRight": "Retargeted/A_Cover_Look_R",
}
BONES = {"head": "head", "chest": "spine_03", "leftHip": "thigh_l", "leftKnee": "calf_l", "leftFoot": "foot_l",
         "rightHip": "thigh_r", "rightKnee": "calf_r", "rightFoot": "foot_r"}
# Unreal left-handed Z-up -> right-handed Y-up; original mesh faces -Y.
C = np.array([[0, 1, 0], [0, 0, 1], [-1, 0, 0]], dtype=float)
VERTEX = np.dtype([("position", "<f4", (3,)), ("tangentX", "<f4", (3,)), ("tangentY", "<f4", (3,)),
                   ("tangentZ", "<f4", (4,)), ("uv", "<f4", (4, 2)), ("color", "u1", (4,)),
                   ("joints", "<u2", (12,)), ("weights", "u1", (12,))])


def require(condition, message):
    if not condition:
        raise ValueError(message)


def properties(pkg, index):
    return read_properties(pkg.get_export_data(index), pkg.name_map, pkg.file_version_ue5)


def read_mesh(file):
    require(hashlib.sha256(file.read_bytes()).hexdigest() == MESH_SHA, "Unreviewed mesh/version: refusing speculative decoding")
    p = Package(str(file)); require((p.file_version_ue4, p.file_version_ue5) == (522, 1008), "Expected UE5.1 package versions")
    r = p.get_export_data(p.find_exports_by_class("SkeletalMesh")[0]); skip_properties(r, p.name_map, 1008)
    require(not r.read_bool(), "Unexpected object GUID layout"); require(r.read_bytes(2) == b"\0\0", "Expected unstripped editor mesh")
    bounds = struct.unpack("<7d", r.read_bytes(56)); slots = []
    for _ in range(r.read_int32()):
        ref = r.read_int32(); name = r.read_fname(p.name_map)
        if r.read_bool(): r.read_fname(p.name_map)
        r.skip(24); slots.append({"name": name, "material": ref})
    bones = [{"name": r.read_fname(p.name_map), "parent": r.read_int32(), "exportName": r.read_fstring()} for _ in range(r.read_int32())]
    require(r.read_int32() == len(bones), "Reference pose/bone count mismatch")
    poses = [struct.unpack("<10d", r.read_bytes(80)) for _ in bones]
    for _ in range(r.read_int32()): r.read_fname(p.name_map); r.read_int32()
    require(r.read_bytes(2) == b"\0\0" and r.read_int32() == 1, "Expected one source LOD")
    require(r.read_bytes(2) == b"\0\0", "Expected source LOD data"); sections = []
    for _ in range(r.read_int32()):
        require(r.read_bytes(2) == b"\0\0", "Unsupported section flags")
        mat = r.read_int16(); start = r.read_int32(); triangles = r.read_int32()
        r.read_bool(); r.read_uint8(); r.read_bool(); r.read_bool()
        base_vertex = r.read_uint32(); count = r.read_int32()
        require(0 <= mat < len(slots) and 0 < count < 100000, "Invalid section size/material")
        vertices = np.frombuffer(r.read_bytes(count * VERTEX.itemsize), dtype=VERTEX).copy()
        r.read_bool(); mapping = np.frombuffer(r.read_bytes(r.read_int32() * 2), dtype="<u2").copy()
        require(r.read_int32() == count, "Section vertex count mismatch"); r.read_int32()
        for _ in range(r.read_int32()): r.skip(r.read_int32() * 64)  # cloth mapping, not cloth physics
        r.read_int16(); r.skip(20)
        for _ in range(r.read_int32()): r.skip(4); r.skip(r.read_int32() * 4)
        disabled = r.read_bool(); r.read_int32(); r.read_int32(); r.read_int32()
        require(np.isfinite(vertices["position"]).all(), "Non-finite source vertices")
        require((vertices["weights"].sum(1) == 255).all(), "Invalid source weights")
        require((vertices["joints"][vertices["weights"] > 0] < len(mapping)).all(), "Invalid source bone index")
        sections.append({"material": mat, "baseIndex": start, "triangles": triangles,
                         "baseVertex": base_vertex, "disabled": disabled, "vertices": vertices, "bonemap": mapping})
    for _ in range(r.read_int32()):
        r.read_int32(); strip = r.read_bytes(2)
        if not strip[0] & 1:
            r.read_bool(); r.read_uint8(); r.read_bool(); r.read_bool(); r.read_bool()
            r.read_int32(); r.read_int16(); r.skip(20)
    indices = np.frombuffer(r.read_bytes(r.read_int32() * 4), dtype="<u4").copy()
    require(len(indices) == sum(s["triangles"] * 3 for s in sections), "Source triangle count mismatch")
    require(indices.max() < sum(len(s["vertices"]) for s in sections), "Invalid source triangle index")
    return slots, bones, poses, sections, indices, bounds


def read_texture(file, limit):
    p = Package(str(file)); props = properties(p, p.find_exports_by_class("Texture2D")[0])
    source = read_properties(BinaryReader(props["Source"]), p.name_map, p.file_version_ue5)
    fmt = p.resolve_fname(struct.unpack_from("<i", source["Format"])[0]); w, h = source["SizeX"], source["SizeY"]
    require(fmt in ("TSF_BGRA8", "TSF_G8"), "Unsupported source texture format: " + fmt)
    compressed = extract_trailer_payload(p.reader.data)
    require(compressed is not None and compressed[:4] == b"\xb7\x75\x63\x62", "Missing source texture payload")
    size = struct.unpack_from(">Q", compressed, 16)[0]
    raw = compressed[64:64 + size] if compressed[8] == 0 else decompress_compressed_buffer(compressed)
    require(raw is not None and len(raw) == size, "Texture decompression mismatch")
    if raw.startswith(b"\x89PNG") or raw.startswith(b"\xff\xd8"):
        image = Image.open(BytesIO(raw)).convert("RGBA")
        # The reference's TSF_BGRA8 source PNG channels are in BGRA order.
        if fmt == "TSF_BGRA8":
            a = np.array(image); a[:, :, [0, 2]] = a[:, :, [2, 0]]; image = Image.fromarray(a)
    elif fmt == "TSF_BGRA8": image = Image.frombytes("RGBA", (w, h), raw[:w * h * 4], "raw", "BGRA")
    else: image = Image.frombytes("L", (w, h), raw[:w * h]).convert("RGBA")
    require(image.size == (w, h), "Source texture dimensions differ")
    image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    return image, (w, h)


def position(a): return (a @ C.T * 0.01).astype("<f4")
def quaternion(a): return np.column_stack((-a[:, 1], -a[:, 2], a[:, 0], a[:, 3])).astype("<f4")


def transform(q, t, s):
    x, y, z, w = q
    m = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), t[0]],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), t[1]],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), t[2]], [0, 0, 0, 1]])
    return m @ np.diag([*s, 1])


def sample_at_60(a, rotation, duration):
    count = min(len(a), int(np.ceil(duration * 60)) + 1)
    points = np.linspace(0, len(a)-1, count); lo = points.astype(int); hi = np.minimum(lo+1, len(a)-1)
    f = (points-lo)[:, None]; left, right = a[lo], a[hi]
    if not rotation: return (left*(1-f) + right*f).astype("<f4")
    cosine = np.sum(left*right, axis=1, keepdims=True); right = np.where(cosine < 0, -right, right)
    angle = np.arccos(np.abs(cosine).clip(0, 1)); sine = np.sin(angle)
    alpha = np.divide(np.sin((1-f)*angle), sine, out=1-f, where=sine > 1e-7)
    beta = np.divide(np.sin(f*angle), sine, out=f.copy(), where=sine > 1e-7)
    result = (left*alpha + right*beta).astype("<f4"); result /= np.linalg.norm(result, axis=1, keepdims=True)
    return result


class Export:
    def __init__(self, base, output, all_animations, texture_size):
        self.base, self.output, self.all, self.texture_size = base, output, all_animations, texture_size
        self.blob = bytearray(); self.texture_cache = {}; self.texture_report = []; self.animation_report = []
        self.j = {"asset": {"version": "2.0", "generator": "Original Katiusza editor-source converter"}, "scene": 0,
                  "scenes": [{"nodes": [0]}], "nodes": [{"name": "Katiusza", "rotation": [0, -2**-0.5, 0, 2**-0.5]}],
                  "meshes": [], "skins": [], "materials": [], "buffers": [], "bufferViews": [], "accessors": [],
                  "textures": [], "images": [], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
                  "animations": [], "extensionsUsed": ["KHR_materials_specular"]}

    def buffer(self, data):
        self.blob.extend(b"\0" * (-len(self.blob) % 4)); offset = len(self.blob); self.blob.extend(data)
        i = len(self.j["bufferViews"]); self.j["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        return i

    def accessor(self, a, component, kind, bounds=False):
        a = np.ascontiguousarray(a); i = len(self.j["accessors"])
        e = {"bufferView": self.buffer(a.tobytes()), "componentType": component, "type": kind, "count": len(a)}
        if bounds: e.update(min=a.min(0).astype(float).tolist(), max=a.max(0).astype(float).tolist())
        self.j["accessors"].append(e); return i

    def texture(self, name, role):
        key = (name, role)
        if key in self.texture_cache: return self.texture_cache[key]
        image, size = read_texture(self.base / "Models/Textures" / (name + ".uasset"), self.texture_size)
        if role == "normal":
            a = np.array(image); a[:, :, 1] = 255-a[:, :, 1]; image = Image.fromarray(a)
        if role == "roughness":
            gray = image.convert("L"); image = Image.merge("RGBA", (Image.new("L", image.size, 255), gray,
                         Image.new("L", image.size, 0), Image.new("L", image.size, 255)))
        if role == "specular":
            image = Image.merge("RGBA", (Image.new("L", image.size, 255),)*3 + (image.convert("L"),))
        data = BytesIO()
        if role == "base" and np.array(image.getchannel("A")).min() == 255:
            image.convert("RGB").save(data, format="JPEG", quality=96, subsampling=0); mime = "image/jpeg"
        else: image.save(data, format="PNG", compress_level=4); mime = "image/png"
        i = len(self.j["images"]); self.j["images"].append({"name": name+"_"+role, "mimeType": mime, "bufferView": self.buffer(data.getvalue())})
        index = len(self.j["textures"]); self.j["textures"].append({"sampler": 0, "source": i}); self.texture_cache[key] = index
        self.texture_report.append({"source": name, "role": role, "sourceSize": size, "webSize": image.size})
        return index

    def material(self, file):
        p = Package(str(file)); entries = {i+1: properties(p, i) for i in range(len(p.exports)) if p.get_export_class_name(i).startswith("Material")}
        settings = entries[1]; editor = entries[settings["EditorOnlyData"]]
        def pin(name):
            raw = editor.get(name); return entries.get(struct.unpack_from("<i", raw)[0], {}) if isinstance(raw, bytes) else {}
        def value(name, default):
            e = pin(name); raw = e.get("DefaultValue", e.get("Constant")); return struct.unpack_from("<f", raw)[0] if isinstance(raw, bytes) else default
        def image(name):
            target = pin(name).get("Texture"); return p.imports[-target-1].object_name if target and target < 0 else None
        m = {"name": file.stem, "doubleSided": settings.get("TwoSided", False),
             "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": value("Metallic", 0), "roughnessFactor": value("Roughness", 0.5)}}
        for key, field, role in [("BaseColor", "baseColorTexture", "base"), ("Normal", "normalTexture", "normal"), ("AmbientOcclusion", "occlusionTexture", "occlusion")]:
            name = image(key)
            if name:
                target = m["pbrMetallicRoughness"] if key == "BaseColor" else m; target[field] = {"index": self.texture(name, role)}
        rough = image("Roughness")
        if rough:
            m["pbrMetallicRoughness"].update(metallicRoughnessTexture={"index": self.texture(rough, "roughness")}, roughnessFactor=1)
        spec = image("Specular")
        m["extensions"] = {"KHR_materials_specular": {"specularFactor": 1 if spec else value("Specular", 0)*2}}
        if spec: m["extensions"]["KHR_materials_specular"]["specularTexture"] = {"index": self.texture(spec, "specular")}
        return m

    def animation(self, file):
        p = Package(str(file)); model = p.find_exports_by_class("AnimDataModel")
        if not model: return
        props = properties(p, model[0]); raw = props.get("BoneAnimationTracks")
        if not raw: return
        duration = props["PlayLength"]; r = BinaryReader(raw); count = r.read_int32()
        # Inner struct-array property tag, validated instead of searching bytes.
        require(r.read_fname(p.name_map) == "BoneAnimationTracks" and r.read_fname(p.name_map) == "StructProperty", "Bad animation struct-array tag")
        r.read_int32(); r.read_int32(); require(r.read_fname(p.name_map) == "BoneAnimationTrack", "Bad source track type")
        r.skip(16); require(r.read_uint8() == 0, "Unexpected source property GUID")
        name = file.relative_to(self.base / "Animations").with_suffix("").as_posix()
        animation = {"name": name, "samplers": [], "channels": []}
        for _ in range(count):
            track = read_properties(r, p.name_map, p.file_version_ue5); bone = track["Name"]; reader = BinaryReader(track["InternalTrackData"])
            for kind, width in [("translation", 3), ("rotation", 4), ("scale", 3)]:
                size, n = reader.read_int32(), reader.read_int32(); require(size == width*4 and 0 <= n < 10000, "Invalid raw animation bulk array")
                a = np.frombuffer(reader.read_bytes(n*size), dtype="<f4").reshape(n, width).copy()
                if not n or bone not in self.bone_names: continue
                if kind == "translation": a = position(a)
                if kind == "rotation":
                    a = quaternion(a); a /= np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-8)
                    for i in range(1, len(a)):
                        if a[i-1] @ a[i] < 0: a[i] *= -1
                if kind == "scale": a = a[:, [1, 2, 0]].copy()
                require(np.isfinite(a).all(), "Non-finite animation keys")
                if len(a) == 1 or np.max(np.abs(a-a[0])) < 1e-7: a = np.stack([a[0], a[0]])
                if not self.all and len(a) > int(duration*120)+2: a = sample_at_60(a, kind == "rotation", duration)
                time = np.linspace(0, duration, len(a)).astype("<f4"); index = len(animation["samplers"])
                animation["samplers"].append({"input": self.accessor(time, 5126, "SCALAR", True), "output": self.accessor(a, 5126, "VEC4" if width == 4 else "VEC3"), "interpolation": "LINEAR"})
                animation["channels"].append({"sampler": index, "target": {"node": self.bone_names[bone], "path": kind}})
            require(reader.position() == len(reader.data), "Trailing raw track data")
        require(r.position() == len(r.data), "Trailing source track-array data")
        if animation["channels"]:
            self.j["animations"].append(animation); self.animation_report.append({"name": name, "sourceTracks": count, "duration": duration})

    def run(self):
        file = self.base / "Models/Katia/SKM_Katiusza.uasset"
        slots, bones, poses, sections, indices, bounds = read_mesh(file); self.bone_names = {b["name"]: i+1 for i, b in enumerate(bones)}
        worlds = []
        for i, (bone, pose) in enumerate(zip(bones, poses)):
            q = quaternion(np.array([pose[:4]]))[0]; t = position(np.array([pose[4:7]]))[0]; s = np.array(pose[7:10])[[1, 2, 0]]
            self.j["nodes"].append({"name": bone["name"], "translation": t.tolist(), "rotation": q.tolist(), "scale": s.tolist()})
            parent = bone["parent"]; self.j["nodes"][0 if parent < 0 else parent+1].setdefault("children", []).append(i+1)
            local = transform(q, t, s); worlds.append(local if parent < 0 else worlds[parent] @ local)
        ibm = np.array([np.linalg.inv(m).T.flatten() for m in worlds], dtype="<f4")
        self.j["skins"].append({"name": "SK_Katiusza", "skeleton": 1, "joints": list(range(1, len(bones)+1)), "inverseBindMatrices": self.accessor(ibm, 5126, "MAT4")})
        for slot in slots: self.j["materials"].append(self.material(self.base / "Models/Materials" / (slot["name"] + ".uasset")))
        primitives = []; max_influences = 0
        for section in sections:
            if section["disabled"]: continue  # Original disabled duplicate, NOT missing clothing.
            v, mapping = section["vertices"], section["bonemap"]
            ix = indices[section["baseIndex"]:section["baseIndex"] + section["triangles"]*3].copy() - section["baseVertex"]
            require(ix.max() < len(v), "Section triangle out of bounds")
            ix = ix.reshape(-1, 3)[:, [0, 2, 1]].flatten().astype("<u4")
            normal = (v["tangentZ"][:, :3] @ C.T).astype("<f4"); normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-8)
            influences = int((v["weights"] > 0).sum(1).max()); max_influences = max(max_influences, influences)
            require(influences <= 4, "Source needs >4 weights: do not silently discard them for Three.js")
            order = np.argsort(-v["weights"].astype(int), axis=1)[:, :4]
            weights = np.take_along_axis(v["weights"], order, axis=1).astype("<f4"); weights /= weights.sum(1, keepdims=True)
            joints = mapping[np.take_along_axis(v["joints"], order, axis=1)].astype("<u2")
            attrs = {"POSITION": self.accessor(position(v["position"]), 5126, "VEC3", True), "NORMAL": self.accessor(normal, 5126, "VEC3"),
                     "TEXCOORD_0": self.accessor(v["uv"][:, 0].astype("<f4"), 5126, "VEC2"), "JOINTS_0": self.accessor(joints, 5123, "VEC4"), "WEIGHTS_0": self.accessor(weights, 5126, "VEC4")}
            primitives.append({"attributes": attrs, "indices": self.accessor(ix, 5125, "SCALAR"), "material": section["material"]})
        self.j["meshes"].append({"name": "SKM_Katiusza", "primitives": primitives})
        self.j["nodes"].append({"name": "KatiuszaMesh", "mesh": 0, "skin": 0}); self.j["nodes"][0]["children"].append(len(self.j["nodes"])-1)
        for file in sorted((self.base / "Animations").rglob("*.uasset")):
            name = file.relative_to(self.base / "Animations").with_suffix("").as_posix()
            if self.all or name in MOTIONS.values(): self.animation(file)
        names = {a["name"] for a in self.j["animations"]}
        require(set(MOTIONS.values()).issubset(names), "Missing controller source animation(s)")
        self.blob.extend(b"\0" * (-len(self.blob) % 4)); self.j["buffers"] = [{"byteLength": len(self.blob)}]
        text = json.dumps(self.j, separators=(",", ":")).encode(); text += b" " * (-len(text) % 4)
        size = 12+8+len(text)+8+len(self.blob)
        glb = struct.pack("<III", 0x46546c67, 2, size)+struct.pack("<II", len(text), 0x4e4f534a)+text+struct.pack("<II", len(self.blob), 0x004e4942)+self.blob
        self.output.mkdir(parents=True, exist_ok=True); destination = self.output / ("Katiusza.full.glb" if self.all else "Katiusza.runtime.glb")
        destination.write_bytes(glb)
        report = {"sourceCommit": PIN, "meshSHA256": MESH_SHA, "glbSHA256": hashlib.sha256(glb).hexdigest(), "bytes": size,
                  "sourceVertices": sum(len(s["vertices"]) for s in sections), "exportedVertices": sum(len(s["vertices"]) for s in sections if not s["disabled"]),
                  "triangles": sum(s["triangles"] for s in sections if not s["disabled"]), "materials": len(slots), "bones": len(bones),
                  "originalAnimations": len(self.j["animations"]), "maxSourceInfluences": max_influences, "textures": self.texture_report,
                  "sourceBoundsCm": bounds, "sourceTextureChannels": "BGRA decoded to RGBA; DirectX normals green flipped for glTF",
                  "sourceDirection": "Original -Y converted to +Z (the runtime rotates +Z models onto its -Z travel axis)", "environmentImported": False, "clothPhysicsPorted": False, "nativeAnimationGraphsPorted": False}
        tag = "full" if self.all else "runtime"
        (self.output / (tag+"-export-report.json")).write_text(json.dumps(report, indent=2)+"\n")
        (self.output / (tag+"-animations.json")).write_text(json.dumps(self.animation_report, indent=2)+"\n")
        manifest = {"version": 1, "label": "Original Katiusza", "modelUrl": "/sanctuary/character/character.glb", "modelForward": "+Z",
                    "licenseConfirmed": False, "animationMap": MOTIONS, "boneMap": BONES,
                    "source": {"repository": "https://github.com/VeryHotShark/RealisticThirdPersonCharacter", "commit": PIN,
                               "engine": "Unreal Engine 5.1", "conversion": "Actual original editor-source mesh/rig/outfit/textures/keys, not a generated likeness",
                               "textureMaxDimension": self.texture_size, "nativePhysics": "Unreal cloth/ragdoll/Blueprint graphs do not execute in GLB"}}
        (self.output / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
        print(f"EXPORTED {destination}: {size:,} bytes; {len(bones)} bones, {len(slots)} materials, {len(names)} original clips", flush=True)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--source", type=Path, default=Path(".cache/upstream/RealisticThirdPersonCharacter/Content/Characters/Katiusza"))
    args.add_argument("--output", type=Path, default=Path(".cache/character-conversion/export"))
    args.add_argument("--texture-size", type=int, default=2048)
    args.add_argument("--all-animations", action="store_true")
    options = args.parse_args(); require(256 <= options.texture_size <= 8192, "Texture dimension must be 256–8192")
    require(options.output.resolve() != options.source.resolve(), "Output must not overwrite source assets")
    Export(options.source, options.output, options.all_animations, options.texture_size).run()


if __name__ == "__main__": main()
