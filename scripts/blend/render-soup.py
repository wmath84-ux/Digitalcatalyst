"""Render a triangle soup dumped by the world harness (9 pos floats + 3 rgb).

No GPU, no GL, no browser: an orthographic z-buffered rasteriser with one
directional light. It exists so the sanctuary's placements can be LOOKED AT —
the beach-house district was signed off with the images in `docs/beach-houses/`
that this produced.

Feed it a soup written by a throwaway harness that samples the real
`terrainHeight` / `groundColorAt` / `pathWeight` and places the real GLBs the
way the runtime places them.

Usage:  python3 scripts/blend/render-soup.py <soup.bin> <out.png> <w> <h> <az> <el> <span>
"""
import struct, sys, math, pathlib, zlib

def write_png(path, w, h, pix):
    """Minimal RGB8 PNG writer — keeps this file self-contained."""
    raw = b"".join(b"\x00" + bytes(pix[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    out = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 6))
           + chunk(b"IEND", b""))
    pathlib.Path(path).write_bytes(out)

SZ = 12

def load(path):
    data = pathlib.Path(path).read_bytes()
    n = len(data) // (SZ * 4)
    vals = struct.unpack("<%df" % (n * SZ), data)
    tris = []
    for i in range(n):
        o = i * SZ
        tris.append(((vals[o], vals[o+1], vals[o+2]),
                     (vals[o+3], vals[o+4], vals[o+5]),
                     (vals[o+6], vals[o+7], vals[o+8]),
                     (vals[o+9], vals[o+10], vals[o+11])))
    return tris

def render(tris, path, w, h, az, el, zoom, target=None, span=None, bg=(150, 190, 225)):
    """Orthographic view. `az` is the azimuth of the VIEW DIRECTION (the way the
    camera looks, in world XZ) and `el` its elevation. World +Z is up."""
    xs = [p[0] for t in tris for p in t[:3]]
    ys = [p[1] for t in tris for p in t[:3]]
    zs = [p[2] for t in tris for p in t[:3]]
    lo = [min(xs), min(ys), min(zs)]
    hi = [max(xs), max(ys), max(zs)]
    cx = target if target else [(lo[i] + hi[i]) / 2 for i in range(3)]
    span = span or max(hi[i] - lo[i] for i in range(3))
    a, e = math.radians(az), math.radians(el)
    # L = the direction the camera looks (into the scene); R = screen right;
    # U = L x R, which at a=0, e=0 is (0,0,1): world up.
    L = (math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))
    R = (-math.sin(a), math.cos(a), 0.0)
    U = (L[1] * R[2] - L[2] * R[1], L[2] * R[0] - L[0] * R[2], L[0] * R[1] - L[1] * R[0])
    scale = min(w, h) / (span * zoom)
    light = (-0.40, -0.34, 0.85)
    ln = sum(c * c for c in light) ** 0.5
    light = tuple(c / ln for c in light)

    def proj(p):
        d = [p[i] - cx[i] for i in range(3)]
        return (sum(d[i] * R[i] for i in range(3)) * scale + w / 2,
                h / 2 - sum(d[i] * U[i] for i in range(3)) * scale,
                sum(d[i] * L[i] for i in range(3)))

    zbuf = [1e30] * (w * h)
    img = bytearray(list(bg) * (w * h))
    cache = []
    for (p0, p1, p2, c) in tris:
        a0, a1, a2 = proj(p0), proj(p1), proj(p2)
        cache.append((a0, a1, a2, c, (a0[2] + a1[2] + a2[2]) / 3))
    cache.sort(key=lambda t: t[4], reverse=True)   # far to near
    for (a0, a1, a2, col, _d) in cache:
        (ax, ay, az), (bx, by, bz), (cx2, cy2, cz2) = a0, a1, a2
        area = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax)
        if area == 0:
            continue
        if area < 0:
            (ax, ay, az), (bx, by, bz) = (bx, by, bz), (ax, ay, az)
            area = -area
        minx = max(0, int(min(ax, bx, cx2)))
        maxx = min(w - 1, int(max(ax, bx, cx2)) + 1)
        miny = max(0, int(min(ay, by, cy2)))
        maxy = min(h - 1, int(max(ay, by, cy2)) + 1)
        if minx > maxx or miny > maxy:
            continue
        u = [a1[i] - a0[i] for i in range(3)]
        v = [a2[i] - a0[i] for i in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        nl = sum(x * x for x in n) ** 0.5 or 1.0
        n = [x / nl for x in n]
        if n[2] < 0:
            n = [-x for x in n]
        lam = abs(sum(n[i] * light[i] for i in range(3)))
        shade = 0.42 + 0.58 * lam
        rgb = tuple(min(255, int(col[i] * shade * 255)) for i in range(3))
        inv = 1.0 / area
        for y in range(miny, maxy + 1):
            py = y + 0.5
            base = y * w
            for x in range(minx, maxx + 1):
                px = x + 0.5
                w0 = ((bx - px) * (cy2 - py) - (by - py) * (cx2 - px)) * inv
                w1 = ((cx2 - px) * (ay - py) - (cy2 - py) * (ax - px)) * inv
                if w0 < -1e-6 or w1 < -1e-6 or w0 + w1 > 1 + 1e-6:
                    continue
                w2 = 1 - w0 - w1
                d = w0 * az + w1 * bz + w2 * cz2
                idx = base + x
                if d >= zbuf[idx]:
                    continue
                zbuf[idx] = d
                img[idx * 3] = rgb[0]
                img[idx * 3 + 1] = rgb[1]
                img[idx * 3 + 2] = rgb[2]
    write_png(path, w, h, img)
    return lo, hi

if __name__ == "__main__":
    # render-soup.py <soup.bin> <out.png> <w> <h> <az> <el> <zoom> [span] [tx,ty,tz]
    soup, dest = sys.argv[1], sys.argv[2]
    w, h = int(sys.argv[3]), int(sys.argv[4])
    az, el, zoom = float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])
    span = float(sys.argv[8]) if len(sys.argv) > 8 and sys.argv[8] != "-" else None
    target = None
    if len(sys.argv) > 9 and sys.argv[9] != "-":
        target = [float(v) for v in sys.argv[9].split(",")]
    tris = load(soup)
    print("triangles:", len(tris))
    lo, hi = render(tris, dest, w, h, az, el, zoom, target=target, span=span)
    print("bounds", [round(v, 1) for v in lo], [round(v, 1) for v in hi])
