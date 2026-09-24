"""Extract the uploaded 'Beach House Pack' .blend into a single glTF-binary.

WHY THIS EXISTS
---------------
`Beach+House_Pack+JSGraphics_CGTrader.blend` (Blender 3.0, uncompressed v301)
holds ONE assembled beach house: 174 mesh objects, five flat-shaded
placeholder VIEWPORT fields (`MAbeachhouse | light/Roof*/wall 1/wall 2/wall 3`)
and no image textures at all — the only image datablock in the file is
Blender's own "Render Result". The COLOURS are real, though: the author put
them in the material node trees, and this script READS THEM OUT (see the
"author's materials" section below) instead of guessing from the slot names.
So the export carries geometry + UVs + the author's exact materials.

COLOUR NOTE: five of the house's objects carry NO material slot at all (Blender
draws those with its own 0.8 grey), and they are some of the biggest, most
visible panels. They are not instances of any materialed mesh, so the file
holds no "correct" colour for them; rather than invent one, the bake drops them
and prints what it dropped. `--keep-unassigned` keeps them in Blender's grey.

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
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FLAGS = {a for a in sys.argv[1:] if a.startswith("--")}
OUT = pathlib.Path(
    ARGS[0] if ARGS else REPO / "public/sanctuary/models/beach_house.glb"
)
# Six objects in this file have NO material slot at all; Blender draws those
# with its own default grey (0.8), which is the white the owner saw. See
# `unassigned_objects()` below.
KEEP_UNASSIGNED = "--keep-unassigned" in FLAGS

CD_MLOOPUV = 16
ME_SMOOTH = 1

# ── the author's materials, READ OUT OF THE FILE ─────────────────────────
#
# MEASURED, and the reason this script was rewritten once already:
#
#   * `Material.r/g/b/a` and `Object.col` are the LEGACY viewport fields. Both
#     sit at Blender's defaults in this file (0.8 grey / 1.0 white) and are
#     NOT the author's colours. Neither is the material NAME.
#
#   * The colours live in the node trees, as socket `default_value`s.
#     `bNodeSocket.type` uses `eNodeSocketDatatype` — FLOAT=0, VECTOR=1,
#     RGBA=2, SHADER=3, BOOLEAN=4, INT=5, STRING=6 — whose order is NOT the
#     RNA enum's. `default_value` resolves to a real DNA block:
#     `bNodeSocketValueRGBA` (4 floats at +0) or `bNodeSocketValueFloat`
#     (`{ int subtype; float value; float min; float max; }` — value at +4).
#
#   * `MPoly.mat_nr` indexes the MESH's OWN `Material **mat` slot array, NOT
#     the order the MA blocks happen to sit in the file. Reading the wrong
#     list painted 8 341 of this house's 22 410 faces with the wrong
#     material — and since the first MA block is `light`, the whole house
#     came out white. `mat` is an array of POINTERS, so it takes two
#     dereferences. THIS was the bug the owner saw.
#
# Blender's own default for a face that has no material at all.
DEFAULT_MATERIAL = (0.8, 0.8, 0.8, 1.0)
NO_MATERIAL = "(no material)"

SOCK_FLOAT = 0
SOCK_VECTOR = 1
SOCK_RGBA = 2
SOCK_INT = 5


def strfield(bl, block, path, n=64):
    """A fixed-size `char[n]` DNA field, read as a NUL-terminated string."""
    off, _ = bl.resolve(block, path)
    return bl.raw(block)[off:off + n].split(b"\x00")[0].decode(errors="replace")


def list_blocks(bl, block, path, limit=500):
    try:
        return bl.list_all(block, path, limit=limit)
    except Exception:
        return []


def nodes_of(bl, ma):
    """(nodetree, [nodes]) — the author's real shader setup, or (None, [])."""
    nt = bl.deref_safe(ma, "nodetree")
    if nt is None:
        return None, []
    return nt, list_blocks(bl, nt, "nodes", 200)


def input_named(bl, node, name):
    for sock in list_blocks(bl, node, "inputs", 200):
        if strfield(bl, sock, "name") == name:
            return sock
    return None


def socket_value(bl, sock):
    """(type, value) for a socket's stored default value."""
    typ = struct.unpack_from("<h", bl.raw(sock), bl.resolve(sock, "type")[0])[0]
    ptr, = struct.unpack_from(bl.pfmt, bl.raw(sock), bl.resolve(sock, "default_value")[0])
    if not ptr:
        return typ, None
    blk = bl.bf.dereference_pointer(ptr)
    if blk is None:
        return typ, None
    raw = bl.raw(blk)
    if typ == SOCK_RGBA and len(raw) >= 16:
        return typ, struct.unpack_from("<4f", raw, 0)
    if typ == SOCK_VECTOR and len(raw) >= 12:
        return typ, struct.unpack_from("<3f", raw, 0)
    if typ in (SOCK_FLOAT, SOCK_INT) and len(raw) >= 8:
        if typ == SOCK_FLOAT:
            return typ, struct.unpack_from("<f", raw, 4)[0]
        return typ, struct.unpack_from("<i", raw, 4)[0]
    return typ, None


def incoming_link(bl, nt, node, sock):
    """(from_node, from_sock) of the link feeding `sock`, else (None, None)."""
    want_node = getattr(node, "addr_old", None)
    want_sock = getattr(sock, "addr_old", None)
    for lk in list_blocks(bl, nt, "links", 500):
        tn = bl.deref_safe(lk, "tonode")
        ts = bl.deref_safe(lk, "tosock")
        if tn is None or ts is None:
            continue
        if (getattr(tn, "addr_old", None) == want_node
                and getattr(ts, "addr_old", None) == want_sock):
            return bl.deref_safe(lk, "fromnode"), bl.deref_safe(lk, "fromsock")
    return None, None


def constant_rgba(bl, nt, node, name, depth=0):
    """The constant colour a socket settles on, following links upstream.

    `Roof` drives Base Color through a Hue/Saturation node whose `Value` comes
    from Object Info's per-object Random. That part is procedural; what is
    read here is the chain's CONSTANT colour — the HSV node's own `Color`
    input, exactly as the file stores it. Nothing is invented either way.
    """
    sock = input_named(bl, node, name)
    if sock is None or depth > 6:
        return None
    from_node, from_sock = incoming_link(bl, nt, node, sock)
    if from_node is None:
        _typ, val = socket_value(bl, sock)
        return val if isinstance(val, tuple) and len(val) >= 3 else None
    return constant_rgba(bl, nt, from_node, strfield(bl, from_sock, "name"), depth + 1)


def material_appearance(bl, ma):
    """Exactly what this file says the material looks like.

    `base` / `emissive` come out as LINEAR floats — the same space glTF's
    `baseColorFactor` / `emissiveFactor` are defined in — so they are copied
    across verbatim, with no gamma conversion anywhere.
    """
    nt, nodes = nodes_of(bl, ma)
    principled = None
    emission = None
    for nd in nodes:
        idname = strfield(bl, nd, "idname")
        if idname == "ShaderNodeBsdfPrincipled" and principled is None:
            principled = nd
        elif idname == "ShaderNodeEmission" and emission is None:
            emission = nd

    look = {"base": None, "metallic": 0.0, "roughness": 0.5, "emissive": None}
    if principled is not None:
        rgba = constant_rgba(bl, nt, principled, "Base Color")
        if rgba:
            look["base"] = (rgba[0], rgba[1], rgba[2], rgba[3] if len(rgba) > 3 else 1.0)
        for key, sock_name in (("metallic", "Metallic"), ("roughness", "Roughness")):
            sock = input_named(bl, principled, sock_name)
            if sock is not None:
                _t, v = socket_value(bl, sock)
                if isinstance(v, float):
                    look[key] = v
        emit = constant_rgba(bl, nt, principled, "Emission")
        if emit and max(emit[:3]) > 0.0:
            look["emissive"] = (emit[0], emit[1], emit[2])
    if emission is not None:
        # A LAMP: the Emission node's colour IS the material's colour, and it
        # glows. (The author drives its Strength from a Light Falloff node,
        # which is a distance curve, not a colour.)
        rgba = constant_rgba(bl, nt, emission, "Color")
        if rgba:
            look["base"] = (rgba[0], rgba[1], rgba[2], rgba[3] if len(rgba) > 3 else 1.0)
            look["emissive"] = (rgba[0], rgba[1], rgba[2])
            look["roughness"] = 1.0
    return look


def mesh_slots(bl, me):
    """The mesh's OWN material slot array — what `mat_nr` really indexes.

    `mat` is a `Material **`: Blender writes the pointer array itself as an
    untyped block, so this is a pointer to the array, then the array's
    entries. `totcol` is a SHORT.
    """
    totcol = bl.scalar(me, "totcol", "h")
    if not totcol:
        return []
    arr = bl.deref_safe(me, "mat")
    if arr is None:
        return []
    raw = bl.raw(arr)
    out = []
    for i in range(totcol):
        ptr, = struct.unpack_from(bl.pfmt, raw, i * bl.psize)
        out.append(bl.bf.dereference_pointer(ptr))
    return out


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


def short_name(full):
    """`MAbeachhouse | wall 1` -> `wall 1` (the author's own slot label)."""
    return full.replace("MAbeachhouse |", "").strip()


def build(bf):
    bl = BL(bf)

    # Every material, with the appearance the FILE actually stores. The order
    # of `find_blocks_from_code` is deliberately NOT used to index anything —
    # see the note at the top of this file.
    looks = {}
    for ma in bf.find_blocks_from_code(b'MA'):
        looks[short_name(s(ma.id_name))] = material_appearance(bl, ma)
    print("materials in file:")
    for name in sorted(looks):
        look = looks[name]
        base = look["base"] or DEFAULT_MATERIAL
        emit = look["emissive"]
        print("   %-8s base(linear)=(%.6f, %.6f, %.6f)  rough=%.2f metal=%.2f%s"
              % (name, base[0], base[1], base[2], look["roughness"], look["metallic"],
                 "  EMISSIVE(%.3f, %.3f, %.3f)" % emit if emit else ""))

    # Deterministic slot order: the file's own, then the no-material bucket.
    names = [short_name(s(ma.id_name)) for ma in bf.find_blocks_from_code(b'MA')]
    names.append(NO_MATERIAL)

    # ── the author's unfinished objects ─────────────────────────────────
    #
    # Six of the house's objects carry NO material slot at all, so Blender
    # renders them with its own default grey — and because they are the
    # house's biggest wall panels, that grey is most of what the player sees.
    # MEASURED: `Object.totcol = 0`, `Mesh.totcol = 0`, and they are not
    # instances of any materialed mesh either (their vertex data is unique —
    # verified by hashing), so there is no "correct" colour hiding anywhere in
    # the file. Rather than invent one — the owner asked for the FILE's
    # colours, not for a nicer guess — the bake DROPS them and says so.
    # `--keep-unassigned` restores them in Blender's grey.
    objs = house_objects(bl, bf)
    unassigned = [o for o in objs if not mesh_slots(bl, bl.deref_safe(o, 'data'))]
    if unassigned and not KEEP_UNASSIGNED:
        dropped_faces = 0
        for o in unassigned:
            dropped_faces += bl.scalar(bl.deref_safe(o, 'data'), 'totpoly', 'i') or 0
        objs = [o for o in objs if o not in unassigned]
        print("unassigned-material objects DROPPED (the file gives them no colour):")
        for o in unassigned:
            me = bl.deref_safe(o, 'data')
            print("   %-18s mesh=%-14s polys=%-4d  in Blender this draws as its "
                  "0.8 grey default" % (s(o.id_name), s(me.id_name),
                                        bl.scalar(me, 'totpoly', 'i')))
        print("   -> %d objects, %d faces (%.1f%% of the house). "
              "Pass --keep-unassigned to keep them."
              % (len(unassigned), dropped_faces,
                 100.0 * dropped_faces / max(1, sum(
                     bl.scalar(bl.deref_safe(x, 'data'), 'totpoly', 'i') or 0
                     for x in house_objects(bl, bf)))))
    elif unassigned:
        print("unassigned-material objects KEPT (--keep-unassigned): %d"
              % len(unassigned))

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
    stats = {"objects": len(objs), "verts": 0, "polys": 0, "tris": 0, "smooth": 0,
             "flat": 0, "no_material_faces": 0}
    mn = [1e30] * 3
    mx = [-1e30] * 3

    for ob in objs:
        me = bl.deref_safe(ob, 'data')
        m = local_matrix(ob)
        verts, loops, polys, uv = Mesh(bl, me).read()
        # THIS mesh's own slots. Six objects in the file carry none at all
        # (106 faces) — Blender draws those with its default material, which
        # is what they get here too.
        slots = [short_name(s(x.id_name)) if x is not None else None
                 for x in mesh_slots(bl, me)]
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
            name = slots[mat_nr] if 0 <= mat_nr < len(slots) else None
            if name is None:
                name = NO_MATERIAL
                stats["no_material_faces"] += 1
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
    return buckets, names, stats, size, (cx, cy, floor), looks


def write_glb(path, buckets, names, looks, no_material):
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
        # The FILE's own numbers, verbatim. `baseColorFactor` and
        # `emissiveFactor` are LINEAR in glTF and the socket values are
        # LINEAR in Blender, so nothing is converted anywhere.
        look = looks.get(name) or {}
        base = look.get("base")
        if base is None:
            if name != no_material:
                raise SystemExit("no colour for material %r - refusing to invent one" % name)
            base = DEFAULT_MATERIAL  # Blender's own default for a faceless material
        entry = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [base[0], base[1], base[2], base[3] if len(base) > 3 else 1.0],
                "metallicFactor": look.get("metallic", 0.0),
                "roughnessFactor": look.get("roughness", 0.5),
            },
            "doubleSided": True,
        }
        emit = look.get("emissive")
        if emit:
            entry["emissiveFactor"] = [emit[0], emit[1], emit[2]]
        materials.append(entry)

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
    buckets, names, stats, size, centre, looks = build(bf)
    bf.close()
    size_bytes, nmats = write_glb(OUT, buckets, names, looks, NO_MATERIAL)
    print("source:", stats)
    print("glTF size (x, y, z) = %s" % [round(v, 3) for v in (size[0], size[2], size[1])])
    print("materials:", [n for n in names if buckets.get(n, {}).get("pos")])
    print("wrote %s (%.1f KB, %d materials, %d triangles)"
          % (OUT, size_bytes / 1024, nmats, stats["tris"]))


if __name__ == "__main__":
    main()
