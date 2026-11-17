"""Ferramentas mínimas para montar arquivos .glb (glTF binário) em Python."""
import json, struct, math

def _pad4(b, fill=b'\x00'):
    while len(b) % 4:
        b += fill
    return b

class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views = []
        self.accessors = []
        self.materials = []
        self.meshes_prims = []   # primitivas do mesh único
        self.images = []
        self.textures = []

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        self.views.append(v)
        return len(self.views) - 1

    def material(self, rgba=(0.8, 0.8, 0.8, 1.0), metallic=0.0, rough=0.8, alpha_blend=False, tex=None, double=False):
        m = {"pbrMetallicRoughness": {"baseColorFactor": list(rgba), "metallicFactor": metallic, "roughnessFactor": rough}}
        if tex is not None:
            m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": tex}
            m["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, 1]
        if alpha_blend:
            m["alphaMode"] = "BLEND"
        if double:
            m["doubleSided"] = True
        self.materials.append(m)
        return len(self.materials) - 1

    def image(self, data, mime='image/jpeg'):
        vi = self._view(data)
        self.images.append({"bufferView": vi, "mimeType": mime})
        self.textures.append({"source": len(self.images) - 1})
        return len(self.textures) - 1

    def primitive(self, positions, normals, mat, uvs=None, indices=None):
        pb = b''.join(struct.pack('<3f', *p) for p in positions)
        nb = b''.join(struct.pack('<3f', *n) for n in normals)
        mn = [min(p[k] for p in positions) for k in range(3)]
        mx = [max(p[k] for p in positions) for k in range(3)]
        pv = self._view(pb, 34962)
        nv = self._view(nb, 34962)
        self.accessors.append({"bufferView": pv, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": mn, "max": mx})
        ai_p = len(self.accessors) - 1
        self.accessors.append({"bufferView": nv, "componentType": 5126, "count": len(normals), "type": "VEC3"})
        ai_n = len(self.accessors) - 1
        attrs = {"POSITION": ai_p, "NORMAL": ai_n}
        if uvs is not None:
            ub = b''.join(struct.pack('<2f', *u) for u in uvs)
            uv = self._view(ub, 34962)
            self.accessors.append({"bufferView": uv, "componentType": 5126, "count": len(uvs), "type": "VEC2"})
            attrs["TEXCOORD_0"] = len(self.accessors) - 1
        prim = {"attributes": attrs, "material": mat}
        if indices is not None:
            use32 = max(indices) > 65535
            ib = b''.join(struct.pack('<I' if use32 else '<H', i) for i in indices)
            iv = self._view(ib, 34963)
            self.accessors.append({"bufferView": iv, "componentType": 5125 if use32 else 5123, "count": len(indices), "type": "SCALAR"})
            prim["indices"] = len(self.accessors) - 1
        self.meshes_prims.append(prim)

    def box(self, mat, cx, cy, cz, sx, sy, sz):
        """Caixa alinhada aos eixos (não indexada, normais por face)."""
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        faces = [
            ((1, 0, 0), [(hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz), (hx, -hy, hz)]),
            ((-1, 0, 0), [(-hx, -hy, hz), (-hx, hy, hz), (-hx, hy, -hz), (-hx, -hy, -hz)]),
            ((0, 1, 0), [(-hx, hy, -hz), (-hx, hy, hz), (hx, hy, hz), (hx, hy, -hz)]),
            ((0, -1, 0), [(-hx, -hy, hz), (-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz)]),
            ((0, 0, 1), [(-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]),
            ((0, 0, -1), [(hx, -hy, -hz), (-hx, -hy, -hz), (-hx, hy, -hz), (hx, hy, -hz)]),
        ]
        pos, nor = [], []
        for n, vs in faces:
            for tri in ((0, 1, 2), (0, 2, 3)):
                for i in tri:
                    v = vs[i]
                    pos.append((v[0] + cx, v[1] + cy, v[2] + cz)); nor.append(n)
        return pos, nor

    def to_bytes(self):
        js = {
            "asset": {"version": "2.0", "generator": "plankraft-tools"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": self.meshes_prims}],
            "materials": self.materials,
            "buffers": [{"byteLength": len(self.bin)}],
            "bufferViews": self.views,
            "accessors": self.accessors,
        }
        if self.images:
            js["images"] = self.images
            js["textures"] = self.textures
        jb = _pad4(json.dumps(js, separators=(',', ':')).encode(), b' ')
        bb = _pad4(bytes(self.bin))
        total = 12 + 8 + len(jb) + 8 + len(bb)
        return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(bb), b'BIN\x00') + bb
