"""
Gera os modelos 3D (.glb) do PlanKraft que não vêm prontos:
  - piano, aquário, esteira e berço: modelos procedurais (obra do projeto);
  - moto e bicicleta: conversão de OBJ (OpenGameArt, CC0) para .glb;
  - Fire Pit e Masonry Heater: glTF do Poly Haven (CC0) reempacotado com textura de 512 px.

Requer Python 3 + Pillow. Os arquivos de origem (OBJ/glTF) ficam em ./dl (não versionados;
fontes em docs/CREDITOS.md). A saída vai para ./out; depois cada .glb é convertido para
base64 e salvo como src/renderer/src/assets/models/<nome>.b64.txt.
"""
import json, struct, io, os, sys, base64
sys.path.insert(0, os.path.dirname(__file__))
from glbtools import Glb, _pad4
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

def hexrgba(h, a=1.0):
    h = h.lstrip('#')
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)

# ------------------------------------------------------------------ OBJ -> GLB
def obj_to_glb(path, colors, default_color='#999999', metallic=0.1, rough=0.6):
    V, N = [], []
    groups = {}  # material -> list of (pos[3], nor[3|None]) triangles
    cur = 'default'
    for line in open(path, encoding='utf-8', errors='ignore'):
        p = line.split()
        if not p: continue
        if p[0] == 'v': V.append(tuple(map(float, p[1:4])))
        elif p[0] == 'vn': N.append(tuple(map(float, p[1:4])))
        elif p[0] == 'usemtl': cur = p[1]
        elif p[0] == 'f':
            idx = []
            for t in p[1:]:
                parts = t.split('/')
                vi = int(parts[0]); vi = vi - 1 if vi > 0 else len(V) + vi
                ni = None
                if len(parts) >= 3 and parts[2]:
                    ni = int(parts[2]); ni = ni - 1 if ni > 0 else len(N) + ni
                idx.append((vi, ni))
            for k in range(1, len(idx) - 1):
                groups.setdefault(cur, []).append((idx[0], idx[k], idx[k + 1]))
    g = Glb()
    for name, tris in groups.items():
        pos, nor = [], []
        for tri in tris:
            vs = [V[a] for a, _ in tri]
            # normal da face (fallback)
            ux, uy, uz = (vs[1][i] - vs[0][i] for i in range(3))
            wx, wy, wz = (vs[2][i] - vs[0][i] for i in range(3))
            fn = (uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
            l = (fn[0] ** 2 + fn[1] ** 2 + fn[2] ** 2) ** 0.5 or 1
            fn = (fn[0] / l, fn[1] / l, fn[2] / l)
            for a, ni in tri:
                pos.append(V[a]); nor.append(N[ni] if ni is not None and ni < len(N) else fn)
        col = colors.get(name, default_color)
        m = g.material(hexrgba(col), metallic=metallic, rough=rough, double=True)
        g.primitive(pos, nor, m)
    return g.to_bytes()

# ------------------------------------------------------------------ glTF (Poly Haven) -> GLB leve
def repack_polyhaven(folder, name, tex_size=512, quality=80):
    gj = json.load(open(f'{folder}/{name}_1k.gltf', encoding='utf-8'))
    binb = bytearray(open(f"{folder}/{gj['buffers'][0]['uri']}", 'rb').read())
    diff = [i['uri'] for i in gj['images'] if '_diff_' in i['uri']][0]
    im = Image.open(f'{folder}/{diff}').convert('RGB')
    im.thumbnail((tex_size, tex_size))
    bio = io.BytesIO(); im.save(bio, 'JPEG', quality=quality, optimize=True)
    img = bio.getvalue()
    while len(binb) % 4: binb.append(0)
    off = len(binb); binb += img
    gj['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(img)})
    gj['images'] = [{'bufferView': len(gj['bufferViews']) - 1, 'mimeType': 'image/jpeg'}]
    gj['textures'] = [{'source': 0}]
    gj.pop('samplers', None)
    for m in gj['materials']:
        m.pop('normalTexture', None)
        pbr = m['pbrMetallicRoughness']
        pbr.pop('metallicRoughnessTexture', None)
        pbr['baseColorTexture'] = {'index': 0}
        pbr['metallicFactor'] = 0.0
        pbr['roughnessFactor'] = 0.85
    gj['buffers'] = [{'byteLength': len(binb)}]
    gj.pop('extensionsUsed', None); gj.pop('extensionsRequired', None)
    jb = _pad4(json.dumps(gj, separators=(',', ':')).encode(), b' ')
    bb = _pad4(bytes(binb))
    total = 12 + 8 + len(jb) + 8 + len(bb)
    return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(bb), b'BIN\x00') + bb

# ------------------------------------------------------------------ modelos procedurais (metros; frente = +Z)
def add_boxes(g, mat, boxes):
    pos, nor = [], []
    for b in boxes:
        p, n = g.box(mat, *b)
        pos += p; nor += n
    g.primitive(pos, nor, mat)

def piano():
    g = Glb()
    wood = g.material(hexrgba('#2b1d16'), rough=0.45)
    white = g.material(hexrgba('#f3efe6'), rough=0.4)
    black = g.material(hexrgba('#121212'), rough=0.4)
    brass = g.material(hexrgba('#b08d3c'), metallic=0.6, rough=0.4)
    # caixa principal (z de -0.30 a 0.15), pés, sapata do teclado e painéis
    add_boxes(g, wood, [
        (0, 0.675, -0.075, 1.50, 1.15, 0.45),     # corpo
        (0, 1.26, -0.075, 1.54, 0.04, 0.48),      # tampo
        (0, 0.69, 0.215, 1.50, 0.06, 0.17),       # sapata do teclado
        (-0.70, 0.30, 0.20, 0.09, 0.60, 0.20),    # pernas laterais
        (0.70, 0.30, 0.20, 0.09, 0.60, 0.20),
        (0, 0.05, 0.12, 1.30, 0.10, 0.06),        # rodapé
        (0, 1.00, 0.16, 0.95, 0.28, 0.02),        # porta-partitura
    ])
    ws, bs = [], []
    x0 = -0.65
    n_white = 52
    for i in range(n_white):
        ws.append((x0 + i * 0.025 + 0.0125, 0.735, 0.22, 0.023, 0.03, 0.14))
    pattern = {0, 1, 3, 4, 5}  # posições (dentro da oitava de 7 brancas) que têm tecla preta após
    for i in range(n_white - 1):
        if (i % 7) in pattern:
            bs.append((x0 + (i + 1) * 0.025, 0.762, 0.185, 0.014, 0.022, 0.085))
    add_boxes(g, white, ws)
    add_boxes(g, black, bs)
    add_boxes(g, brass, [(-0.06, 0.04, 0.27, 0.05, 0.02, 0.04), (0, 0.04, 0.27, 0.05, 0.02, 0.04), (0.06, 0.04, 0.27, 0.05, 0.02, 0.04)])
    return g.to_bytes()

def aquarium():
    g = Glb()
    wood = g.material(hexrgba('#3a2a20'), rough=0.6)
    glass = g.material(hexrgba('#cfeeff', 0.22), rough=0.05, alpha_blend=True)
    water = g.material(hexrgba('#2f8fc9', 0.32), rough=0.1, alpha_blend=True)
    sand = g.material(hexrgba('#d8c79a'), rough=0.95)
    plant = g.material(hexrgba('#2f9a4a'), rough=0.8)
    fish = g.material(hexrgba('#ff8a2b'), rough=0.5)
    rock = g.material(hexrgba('#7d7f85'), rough=0.9)
    add_boxes(g, wood, [(0, 0.30, 0, 1.00, 0.60, 0.40), (0, 1.015, 0, 1.00, 0.03, 0.40), (0, 0.61, 0, 1.02, 0.02, 0.42)])
    add_boxes(g, sand, [(0, 0.645, 0, 0.94, 0.05, 0.34)])
    add_boxes(g, rock, [(-0.25, 0.70, 0.05, 0.14, 0.10, 0.10), (-0.18, 0.68, 0.0, 0.08, 0.07, 0.08)])
    add_boxes(g, plant, [(0.28, 0.78, -0.08, 0.05, 0.22, 0.05), (0.33, 0.75, -0.04, 0.04, 0.16, 0.04), (0.22, 0.74, -0.1, 0.04, 0.14, 0.04)])
    add_boxes(g, fish, [(-0.05, 0.85, 0.05, 0.08, 0.04, 0.025), (0.2, 0.92, -0.02, 0.07, 0.035, 0.025), (-0.3, 0.78, -0.05, 0.06, 0.03, 0.02)])
    add_boxes(g, water, [(0, 0.82, 0, 0.94, 0.36, 0.34)])
    add_boxes(g, glass, [(0, 0.81, 0, 0.98, 0.40, 0.38)])
    return g.to_bytes()

def treadmill():
    g = Glb()
    dark = g.material(hexrgba('#2a2d33'), rough=0.5)
    belt = g.material(hexrgba('#101010'), rough=0.9)
    metal = g.material(hexrgba('#c8ccd2'), metallic=0.6, rough=0.4)
    screen = g.material(hexrgba('#3d7fc9'), rough=0.3)
    add_boxes(g, dark, [(0, 0.16, 0.06, 0.70, 0.12, 1.55), (0, 0.22, -0.68, 0.70, 0.28, 0.26), (0, 1.22, -0.70, 0.52, 0.20, 0.10)])
    add_boxes(g, belt, [(0, 0.225, 0.10, 0.50, 0.02, 1.35)])
    add_boxes(g, metal, [(-0.30, 0.22, 0.10, 0.05, 0.05, 1.45), (0.30, 0.22, 0.10, 0.05, 0.05, 1.45),
                         (-0.33, 0.72, -0.66, 0.045, 1.0, 0.045), (0.33, 0.72, -0.66, 0.045, 1.0, 0.045),
                         (-0.33, 0.98, -0.40, 0.04, 0.04, 0.55), (0.33, 0.98, -0.40, 0.04, 0.04, 0.55)])
    add_boxes(g, screen, [(0, 1.23, -0.645, 0.40, 0.11, 0.012)])
    return g.to_bytes()

def crib():
    g = Glb()
    wood = g.material(hexrgba('#e6d3b0'), rough=0.6)
    mattress = g.material(hexrgba('#f4f1ea'), rough=0.9)
    boxes = []
    for sx in (-0.33, 0.33):
        for sz in (-0.62, 0.62):
            boxes.append((sx, 0.50, sz, 0.05, 1.00, 0.05))        # pés/montantes
    for y in (0.30, 0.95):
        for sx in (-0.33, 0.33): boxes.append((sx, y, 0, 0.04, 0.04, 1.24))   # travessas laterais
        for sz in (-0.62, 0.62): boxes.append((0, y, sz, 0.62, 0.04, 0.04))   # cabeceira e peseira
    z = -0.55
    while z <= 0.551:
        for sx in (-0.33, 0.33): boxes.append((sx, 0.625, z, 0.02, 0.65, 0.02))   # barras laterais
        z += 0.07
    x = -0.28
    while x <= 0.281:
        for sz in (-0.62, 0.62): boxes.append((x, 0.625, sz, 0.02, 0.65, 0.02))    # barras das pontas
        x += 0.07
    add_boxes(g, wood, boxes)
    add_boxes(g, mattress, [(0, 0.36, 0, 0.62, 0.10, 1.20)])
    return g.to_bytes()

if __name__ == '__main__':
    dl = os.path.join(os.path.dirname(__file__), 'dl')
    files = {
        'motorcycle': obj_to_glb(f'{dl}/motorcycle.obj', {'neta': '#b02a2a', 'tire': '#151515'}, '#444444', metallic=0.35, rough=0.45),
        'bicycleLow': obj_to_glb(f'{dl}/bicycle.obj', {}, '#2c7fb8', metallic=0.3, rough=0.5),
        'stoneFirePit': repack_polyhaven(f'{dl}/stone_fire_pit', 'stone_fire_pit'),
        'masonryHeater': repack_polyhaven(f'{dl}/scandinavian_masonry_heater', 'scandinavian_masonry_heater'),
        'pianoUpright': piano(),
        'aquariumTank': aquarium(),
        'treadmillSimple': treadmill(),
        'cribWood': crib(),
    }
    for n, data in files.items():
        open(f'{OUT}/{n}.glb', 'wb').write(data)
        print(n, len(data) // 1024, 'KB')
