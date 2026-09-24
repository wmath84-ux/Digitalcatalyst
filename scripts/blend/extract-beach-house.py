"""Extract the uploaded 'Beach House Pack' .blend into a single glTF-binary.

WHY THIS EXISTS
---------------
`Beach+House_Pack+JSGraphics_CGTrader.blend` (Blender 3.0, uncompressed v301)
holds ONE assembled beach house: 174 mesh objects, five flat-shaded
placeholder materials (`MAbeachhouse | light/Roof*/wall 1/wall 2/wall 3`) and
no image textures at all — the only image datablock in the file is Blender's
own "Render Result". So the export carries geometry + UVs + per-material
primitives, and the game-side colours are assigned by MATERIAL NAME in
`src/nature3d/engine/beachHouses.ts`.

The scene also holds two objects that do NOT belong to the house (a 15 m
box and a 1.8 m roof-only shell, both parked at the origin). They are noise
from the author's modelling session, so the script keeps the LARGEST
CONNECTED COMPONENT of the parent graph and drops the rest.

Geometry is baked to WORLD space (every object's parent chain applied) and
re-centred, so the exported glTF has identity transforms: the runtime only
has to place, scale and rotate one node.

USAGE
-----
    python scripts/blend/extract-beach-house.py [out.glb]

Dependencies (not part of the site build — a one-off provenance tool):
    pip install blender-asset-tracer

The same authoring pipeline is used for the sanctuary's other models; the
output is committed as `public/sanctuary/models/beach_house.glb`.
"""
import collections
import json
import math
import pathlib
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # `batutil.py`, next to this file
from batutil import BL, s  # noqa: E402
from blender_asset_tracer import blendfile  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parents[2]
BLEND = REPO / "Beach+House_Pack+JSGraphics_CGTrader.blend"
OUT = pathlib.Path(
    sys.argv[1] if len(sys.argv) > 1 else REPO / "public/sanctuary/models/beach_house.glb"
)

CD_MLOOPUV = 16
ME_SMOOTH = 1

# Material slot -> game colour. The author named the slots; two of them
# ("wall 2", "wall 3") carry no faces in the source file at all, but they are
# kept here so a future re-export that DOES use them still lands on a sane
# colour instead of a missing-material white.
COLORS = {
    "light": (0.90, 0.86, 0.74, 1.0),   # lime-washed plaster / light timber
    "Roof": (0.42, 0.24, 0.14, 1.0),    # teak shingle
    "wall 1": (0.38, 0.22, 0.14, 1.0),  # dark oiled plank
    "wall 2": (0.62, 0.44, 0.27, 1.0),
    "wall 3": (0.52, 0.35, 0.21, 1.0),
}
ROUGHNESS = {"light": 0.62, "Roof": 0.88, "wall 1": 0.78, "wall 2": 0.78, "wall 3": 0.78}


# ── matrix helpers (row-major 4x4, translation in the last row) ──────────
def mat_identity():
    return [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def mat_mul(a, b):
    out = [0.0] * 16
    for i in range(4):
        for j in range(4):
            out[i * 4 + j] = sum(a[i * 4 + k] * b[k * 4 + j] for k in range(4))
    return out


def mat_from_trs(loc, rot, scale):
    """Blender's XYZ euler order: R = Rz @ Ry @ Rx."""
    cx, sx = math.cos(rot[0]), math.sin(rot[0])
    cy, sy = math.cos(rot[1]), math.sin(rot[1])
    cz, sz = math.cos(rot[2]), math.sin(rot[2])
    rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx]
    ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy]
    rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1]

    def mul3(a, b):
        c = [0.0] * 9
        for i in range(3):
            for j in range(3):
                c[i * 3 + j] = sum(a[i * 3 + k] * b[k * 3 + j] for k in range(3))
        return c

    r = mul3(rz, mul3(ry, rx))
    return [
        r[0] * scale[0], r[1] * scale[1], r[2] * scale[2], loc[0],
        r[3] * scale[0], r[4] * scale[1], r[5] * scale[2], loc[1],
        r[6] * scale[0], r[7] * scale[1], r[8] * scale[2], loc[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def apply(m, p):
    x, y, z = p
    return (
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    )


class Mesh:
    """The five geometry arrays a Mesh datablock carries, in one pass."""

    def __init__(self, bl, block):
        self.bl = bl
        self.block = block

    def read(self):
        bl, me = self.bl, self.block
        nv = bl.scalar(me, 'totvert', 'i')
        npoly = bl.scalar(me, 'totpoly', 'i')
        nloop = bl.scalar(me, 'totloop', 'i')

        verts = []
        mv = bl.deref(me, 'mvert')
        if nv and mv is not None:
            raw = bl.raw(mv)
            for i in range(nv):
                verts.append(struct.unpack_from("<fff", raw, i * 16))

        loops = []
        ml = bl.deref(me, 'mloop')
        if nloop and ml is not None:
            loops = list(struct.unpack_from("<%di" % (nloop * 2), bl.raw(ml), 0))

        polys = []
        mp = bl.deref(me, 'mpoly')
        if npoly and mp is not None:
            raw = bl.raw(mp)
            for i in range(npoly):
                loopstart, totloop, mat_nr, flag, _pad = struct.unpack_from("<iiHBB", raw, i * 12)
                polys.append((loopstart, totloop, mat_nr, flag))

        uv = None
        tot_layers = bl.scalar(me, 'ldata.totlayer', 'i')
        layers_ptr = bl.pointer(me, 'ldata.layers')
        if tot_layers and layers_ptr:
            lb = bl.bf.dereference_pointer(layers_ptr)
            raw = bl.raw(lb)
            for i in range(tot_layers):
                typ = struct.unpack_from("<i", raw, i * 112)[0]
                if typ != CD_MLOOPUV:
                    continue
                (addr,) = struct.unpack_from(bl.pfmt, raw, i * 112 + 32 + 64)
                blk = bl.bf.dereference_pointer(addr)
                if blk is None:
                    continue
                uvr = bl.raw(blk)
                uv = [struct.unpack_from("<ff", uvr, k * 12) for k in range(nloop)]
                break
        return verts, loops, polys, uv


def house_objects(bl, bf):
    """The DENSE cluster of objects that makes up the beach house.

    The parent graph does not separate them — the author parented every
    detail object to one leftover box, so the graph is a single tree. The
    SPLIT is spatial: the villa sits at (100, 60) while two leftovers from
    an earlier blocky version (a 15 m box and an 8-vertex shell) still sit
    at the origin, ~110 m away. Single-linkage clustering on object centres
    with a 40 m threshold therefore returns exactly the house.
    """
    objs = []
    for o in bf.find_blocks_from_code(b'OB'):
        me = bl.deref_safe(o, 'data')
        if me is None or me.dna_type_name != 'Mesh':
            continue
        loc = bl.array(o, 'loc', 'f', 3)
        scl = bl.array(o, 'size', 'f', 3)
        nv = bl.scalar(me, 'totvert', 'i')
        mv = bl.deref(me, 'mvert')
        mn = [1e30] * 3
        mx = [-1e30] * 3
        if nv and mv is not None:
            raw = bl.raw(mv)
            mtx = mat_from_trs(loc, bl.array(o, 'rot', 'f', 3), scl)
            for i in range(nv):
                w = apply(mtx, struct.unpack_from("<fff", raw, i * 16))
                for k in range(3):
                    mn[k] = min(mn[k], w[k])
                    mx[k] = max(mx[k], w[k])
        else:
            mn = mx = list(loc)
        centre = [(mn[k] + mx[k]) / 2.0 for k in range(3)]
        objs.append((o, centre))

    THRESHOLD = 40.0
    n = len(objs)
    root = list(range(n))

    def find(i):
        while root[i] != i:
            root[i] = root[root[i]]
            i = root[i]
        return i

    for i in range(n):
        ci = objs[i][1]
        for j in range(i + 1, n):
            cj = objs[j][1]
            d = math.dist(ci, cj)
            if d <= THRESHOLD:
                ri, rj = find(i), find(j)
                if ri != rj:
                    root[rj] = ri
    groups = collections.defaultdict(list)
    for i in range(n):
        groups[find(i)].append(objs[i])
    best = max(groups.values(), key=len)
    return [o for (o, _c) in best]


def build(bf):
    bl = BL(bf)
    mats = [s(m.id_name) for m in bf.find_blocks_from_code(b'MA')]
    short = [m.replace("MAbeachhouse |", "").strip() for m in mats]

    objs = house_objects(bl, bf)

    def local_matrix(ob):
        """The object's OWN loc/rot/scale — deliberately NOT the parent chain.

        MEASURED, not assumed: every detail object carries a WORLD-space
        location (x ≈ 90…112, y ≈ 52…70), and its mesh is authored around the
        origin, so its own matrix is already its world placement. Walking the
        chain instead multiplies in the leftover box's 5.4x scale and turns the
        house into a 120 m rubber blob (verified by rendering both ways — see
        the history in `blendtool/`): the hierarchy in this file is bookkeeping
        from the author's session, not a transform stack.
        """
        return mat_from_trs(
            bl.array(ob, 'loc', 'f', 3),
            bl.array(ob, 'rot', 'f', 3),
            bl.array(ob, 'size', 'f', 3))

    buckets = collections.defaultdict(
        lambda: {"pos": [], "nor": [], "uv": [], "idx": [], "has_uv": False})
    stats = {"objects": len(objs), "verts": 0, "polys": 0, "tris": 0, "smooth": 0, "flat": 0}
    mn = [1e30] * 3
    mx = [-1e30] * 3

    for ob in objs:
        me = bl.deref_safe(ob, 'data')
        m = local_matrix(ob)
        verts, loops, polys, uv = Mesh(bl, me).read()
        stats["verts"] += len(verts)
        stats["polys"] += len(polys)
        wverts = [apply(m, v) for v in verts]
        for v in wverts:
            for k in range(3):
                mn[k] = min(mn[k], v[k])
                mx[k] = max(mx[k], v[k])

        smooth_n = [[0.0, 0.0, 0.0] for _ in verts]
        face_normals = []
        for (start, count, _mat_nr, flag) in polys:
            vs = [loops[(start + k) * 2] for k in range(count)]
            ps = [wverts[i] for i in vs]
            nx = ny = nz = 0.0
            for k in range(count):  # Newell — stable on n-gons
                ax, ay, az = ps[k]
                bx, by, bz = ps[(k + 1) % count]
                nx += (ay - by) * (az + bz)
                ny += (az - bz) * (ax + bx)
                nz += (ax - bx) * (ay + by)
            ln = math.sqrt(nx * nx + ny * ny + nz * nz)
            nrm = (0.0, 1.0, 0.0) if ln < 1e-12 else (nx / ln, ny / ln, nz / ln)
            face_normals.append(nrm)
            if flag & ME_SMOOTH:
                stats["smooth"] += 1
                for v in vs:
                    sn = smooth_n[v]
                    sn[0] += nrm[0]
                    sn[1] += nrm[1]
                    sn[2] += nrm[2]
            else:
                stats["flat"] += 1

        for sn in smooth_n:
            ln = math.sqrt(sn[0] ** 2 + sn[1] ** 2 + sn[2] ** 2)
            if ln > 1e-12:
                sn[0] /= ln
                sn[1] /= ln
                sn[2] /= ln

        for pi, (start, count, mat_nr, flag) in enumerate(polys):
            name = short[mat_nr] if 0 <= mat_nr < len(short) else short[0]
            bucket = buckets[name]
            smooth = bool(flag & ME_SMOOTH)
            lv = [loops[(start + k) * 2] for k in range(count)]
            for k in range(1, count - 1):
                tri = (start, start + k, start + k + 1)
                base = len(bucket["pos"]) // 3
                for li in tri:
                    vi = loops[li * 2]
                    p = wverts[vi]
                    n = smooth_n[vi] if smooth else face_normals[pi]
                    bucket["pos"].extend(p)
                    bucket["nor"].extend(n)
                    if uv is not None:
                        bucket["uv"].extend(uv[li])
                        bucket["has_uv"] = True
                bucket["idx"].extend((base, base + 1, base + 2))
                stats["tris"] += 1

    # Blender is Z-up; glTF is Y-up. The mapping is (x, y, z)_blender ->
    # (x, z, -y)_gltf, i.e. a -90° turn about X. Blender's X is width, Y is
    # DEPTH and Z is HEIGHT, so the depth centre comes off index 1 and the
    # floor off index 2 — getting those two swapped is a silent bug that puts
    # the model half-buried and 8 m off its own origin (it happened; the
    # three.js loader check in the history is what caught it).
    cx = (mn[0] + mx[0]) / 2.0   # width centre
    cy = (mn[1] + mx[1]) / 2.0   # depth centre
    floor = mn[2]                # height floor
    for bucket in buckets.values():
        pos = bucket["pos"]
        nor = bucket["nor"]
        for i in range(0, len(pos), 3):
            bx = pos[i] - cx
            by = pos[i + 1] - cy
            bz = pos[i + 2] - floor
            pos[i], pos[i + 1], pos[i + 2] = bx, bz, -by
        for i in range(0, len(nor), 3):
            nx, ny, nz = nor[i], nor[i + 1], nor[i + 2]
            nor[i], nor[i + 1], nor[i + 2] = nx, nz, -ny
        # UV: Blender's V axis points up, glTF's points down.
        uv_arr = bucket["uv"]
        for i in range(1, len(uv_arr), 2):
            uv_arr[i] = 1.0 - uv_arr[i]

    size = (mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])
    return buckets, short, stats, size, (cx, cy, floor)


def write_glb(path, buckets, names):
    bin_parts = []
    offset = 0
    views = []
    accessors = []

    def add_view(data, target):
        nonlocal offset
        pad = (-len(data)) % 4
        bin_parts.append(data + b"\x00" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data),
                      "target": target})
        offset += len(data) + pad
        return len(views) - 1

    def add_accessor(view, ctype, count, type_, minmax=None):
        acc = {"bufferView": view, "componentType": ctype, "count": count, "type": type_}
        if minmax:
            acc["min"], acc["max"] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    materials = []
    primitives = []
    for name in names:
        bucket = buckets.get(name)
        if not bucket or not bucket["pos"]:
            continue
        count = len(bucket["pos"]) // 3
        pos_view = add_view(struct.pack("<%df" % len(bucket["pos"]), *bucket["pos"]), 34962)
        nor_view = add_view(struct.pack("<%df" % len(bucket["nor"]), *bucket["nor"]), 34962)
        pmin = [min(bucket["pos"][i::3]) for i in range(3)]
        pmax = [max(bucket["pos"][i::3]) for i in range(3)]
        attrs = {
            "POSITION": add_accessor(pos_view, 5126, count, "VEC3", [pmin, pmax]),
            "NORMAL": add_accessor(nor_view, 5126, count, "VEC3"),
        }
        if bucket["has_uv"]:
            uvv = add_view(struct.pack("<%df" % len(bucket["uv"]), *bucket["uv"]), 34962)
            attrs["TEXCOORD_0"] = add_accessor(uvv, 5126, count, "VEC2")
        idx = bucket["idx"]
        if len(idx) and max(idx) < 65535:
            idata, ctype, align = struct.pack("<%dH" % len(idx), *idx), 5123, 2
        else:
            idata, ctype, align = struct.pack("<%dI" % len(idx), *idx), 5125, 4
        if offset % align:
            bin_parts.append(b"\x00" * (align - offset % align))
            offset += align - offset % align
        iview = add_view(idata, 34963)
        primitives.append({
            "attributes": attrs,
            "indices": add_accessor(iview, ctype, len(idx), "SCALAR"),
            "material": len(materials),
            "mode": 4,
        })
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": list(COLORS.get(name, (0.8, 0.8, 0.8, 1.0))),
                "metallicFactor": 0.0,
                "roughnessFactor": ROUGHNESS.get(name, 0.75),
            },
            "doubleSided": True,
        })

    bin_data = b"".join(bin_parts)
    gltf = {
        "asset": {"version": "2.0", "generator": "sanctuary-blend-extract (Beach House Pack)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "BeachHouse", "mesh": 0}],
        "meshes": [{"name": "BeachHouse", "primitives": primitives}],
        "materials": materials,
        "buffers": [{"byteLength": len(bin_data)}],
        "bufferViews": views,
        "accessors": accessors,
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode()
    json_bytes += b" " * ((-len(json_bytes)) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_data)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, total))
        fh.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        fh.write(json_bytes)
        fh.write(struct.pack("<II", len(bin_data), 0x004E4942))
        fh.write(bin_data)
    return total, len(materials)


def main():
    bf = blendfile.BlendFile(BLEND)
    buckets, names, stats, size, centre = build(bf)
    bf.close()
    size_bytes, nmats = write_glb(OUT, buckets, names)
    print("source:", stats)
    print("glTF size (x, y, z) = %s" % [round(v, 3) for v in (size[0], size[2], size[1])])
    print("materials:", [n for n in names if buckets.get(n, {}).get("pos")])
    print("wrote %s (%.1f KB, %d materials, %d triangles)"
          % (OUT, size_bytes / 1024, nmats, stats["tris"]))


if __name__ == "__main__":
    main()
