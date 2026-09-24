"""Small reflective helpers around blender_asset_tracer's raw DNA access.

BAT gives us the .blend's DNA and every datablock's raw bytes; this module
adds just enough reflection to read nested/embedded fields by their C path
(`ldata.totlayer`, `nodes.first`, `mat`) without hand-rolling offsets.
"""
import struct as _struct


def s(x):
    if isinstance(x, (bytes, bytearray)):
        return x.decode(errors="replace")
    inner = getattr(x, "name_only", None)
    if isinstance(inner, (bytes, bytearray)):
        return inner.decode(errors="replace")
    inner = getattr(x, "name_full", None)
    if isinstance(inner, (bytes, bytearray)):
        return inner.decode(errors="replace")
    return str(x)


class BL:
    def __init__(self, bf):
        self.bf = bf
        self.psize = bf.header.pointer_size
        self.pfmt = "<Q" if self.psize == 8 else "<I"
        self._fields = {}

    # ── DNA reflection ────────────────────────────────────────────────
    def fields(self, sname):
        if isinstance(sname, bytes):
            sname = sname.decode()
        if sname not in self._fields:
            st = self.bf.struct(sname.encode())
            self._fields[sname] = {f.name.name_only.decode(): f for f in st.fields}
        return self._fields[sname]

    def resolve(self, block, path):
        """(byte offset, final dna.Field) for a dotted C path."""
        if isinstance(path, str):
            parts = path.split(".")
        else:
            parts = list(path)
        off = 0
        field_struct = self.bf.struct(block.dna_type_name.encode())
        field = None
        for part in parts:
            field = None
            for cand in field_struct.fields:
                if cand.name.name_only.decode() == part:
                    field = cand
                    break
            if field is None:
                raise KeyError("no field %r on %s" % (part, field_struct.dna_type_id))
            off += field.offset
            field_struct = field.dna_type
        return off, field

    # ── readers ───────────────────────────────────────────────────────
    def raw(self, block):
        return block.raw_data()

    def scalar(self, block, path, fmt, index=0):
        off, field = self.resolve(block, path)
        n = field.name.array_size
        return _struct.unpack_from("<" + fmt, self.raw(block), off + index * _struct.calcsize(fmt))[0]

    def array(self, block, path, fmt, count=None, index=0):
        off, field = self.resolve(block, path)
        if count is None:
            count = field.name.array_size
        step = _struct.calcsize(fmt) * count
        return _struct.unpack_from("<" + fmt * count, self.raw(block), off + index * step)

    def pointer(self, block, path, index=0):
        off, field = self.resolve(block, path)
        return _struct.unpack_from(self.pfmt, self.raw(block), off + index * self.psize)[0]

    def deref(self, block, path, index=0):
        return self.bf.dereference_pointer(self.pointer(block, path, index))

    def deref_safe(self, block, path, index=0):
        """Like deref(), but a stale/dangling pointer reads as None."""
        try:
            return self.bf.dereference_pointer(self.pointer(block, path, index))
        except Exception:
            if not getattr(self, "_warned", False):
                print("[extract] warning: dangling pointer on %s.%s" % (block.dna_type_name, path))
                self._warned = True
            return None

    def list_first(self, block, path):
        return self.bf.dereference_pointer(self.pointer(block, path + ".first"))

    def list_all(self, block, path, field="next", limit=20000):
        node = self.list_first(block, path)
        out = []
        while node is not None and len(out) < limit:
            out.append(node)
            try:
                node = self.deref(node, field)
            except Exception:
                break
        return out

    def tmatrix(self, path_field):
        raise NotImplementedError
