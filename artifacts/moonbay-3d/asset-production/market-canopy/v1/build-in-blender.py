"""Build Moonbay Market Canopy v1: tensioned Mediterranean plaza sun-sail over 3 raked hardwood masts."""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

W, D, H = 4.5, 3.1, 3.1
# Pre-balance circular mast radii slightly along X because assets.ts stretches [3.21, 1.48, 1.55]
RX_COMP = 0.60

def make_packed_image(name, w, h, rgba_array):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img

# 1. Warm cedar mast wood grain texture
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX
grain = (
    0.52 * np.sin(u * 140.0 + 1.6 * np.sin(v * 10.0))
    + 0.30 * np.sin(u * 310.0 + 0.9 * np.cos(v * 24.0))
    + 0.18 * np.sin(v * 18.0 + u * 9.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.92 + 0.08 * grain, 0.78, 1.06)
wood_rgba[..., 0] = np.clip(0.55 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.32 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.16 * tone, 0, 1)
wood_img = make_packed_image("canopy-wood", W_TX, H_TX, wood_rgba)

# 2. Tensioned coastal sun-sail texture (u=span, v=0 edge -> 1 interior center)
weave = 0.026 * np.sin(xx * 1.45) * np.sin(yy * 1.45) + 0.015 * np.sin(xx * 0.42 + yy * 0.38)
panel_stripe = 0.5 + 0.5 * np.cos(u * math.pi * 10.0)
teal_deep = np.array([0.135, 0.545, 0.495], dtype=np.float32)
teal_sea = np.array([0.210, 0.655, 0.585], dtype=np.float32)
cream = np.array([0.935, 0.855, 0.675], dtype=np.float32)
seam_dark = np.array([0.100, 0.390, 0.355], dtype=np.float32)

sail_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
stitch_line = np.exp(-((v - 0.155) / 0.014) ** 2)
inner_stripe = np.exp(-((v - 0.225) / 0.018) ** 2)
for c in range(3):
    interior = teal_deep[c] * (1.0 - 0.42 * panel_stripe) + teal_sea[c] * (0.42 * panel_stripe)
    base = np.where(v < 0.145, cream[c], interior)
    base = base * (1.0 - 0.30 * stitch_line) + seam_dark[c] * (0.30 * stitch_line)
    base = base * (1.0 - 0.88 * inner_stripe) + cream[c] * (0.88 * inner_stripe)
    sail_rgba[..., c] = np.clip(base * (1.0 + weave), 0.0, 1.0)
sail_img = make_packed_image("canopy-sail", W_TX, H_TX, sail_rgba)

def make_tex_mat(name, image, rough, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-460, 260)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-460, 30)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-210, 180)
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(vc.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return mat

def make_vcol_mat(name, rough, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-240, 180)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

MAT_SAIL = make_tex_mat("CanopySail", sail_img, rough=0.72)
MAT_WOOD = make_tex_mat("CanopyWood", wood_img, rough=0.66)
MAT_STONE = make_vcol_mat("CanopyStone", rough=0.84)
MAT_METAL = make_vcol_mat("CanopyBrass", rough=0.34, metal=0.78)
MAT_ROPE = make_vcol_mat("CanopyRope", rough=0.88)

STONE_LIGHT = (0.87, 0.80, 0.67, 1.0)
STONE_DARK = (0.72, 0.65, 0.53, 1.0)
BRASS_GOLD = (0.84, 0.66, 0.28, 1.0)
IRON_DARK = (0.28, 0.26, 0.25, 1.0)
ROPE_HEMP = (0.86, 0.77, 0.58, 1.0)
WOOD_CREAM_WHITE = (1.0, 1.0, 1.0, 1.0)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

def paint_faces(faces, mat_idx, color=(1.0, 1.0, 1.0, 1.0), uv_fn=None):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = True
        for loop in f.loops:
            loop[vc_layer] = color
            if uv_fn is not None:
                loop[uv_layer].uv = uv_fn(loop.vert.co)
            else:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x + 2.25) * 0.35 % 1.0, co.z * 0.45 % 1.0)

def add_profile_loft(rings, mat_idx, color, cap_bottom=True, cap_top=True, uv_fn=None):
    v_rings = []
    for ring in rings:
        v_rings.append([bm.verts.new(Vector(p)) for p in ring])
    faces = []
    n_seg = len(v_rings[0])
    for r in range(len(v_rings) - 1):
        a, b = v_rings[r], v_rings[r + 1]
        for i in range(n_seg):
            j = (i + 1) % n_seg
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    if cap_bottom and n_seg >= 3:
        faces.append(bm.faces.new(list(reversed(v_rings[0]))))
    if cap_top and n_seg >= 3:
        faces.append(bm.faces.new(v_rings[-1]))
    paint_faces(faces, mat_idx, color, uv_fn=uv_fn)
    return v_rings

def axis_basis(tangent):
    t = tangent.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((0.0, 1.0, 0.0))
    u_vec = t.cross(ref).normalized()
    v_vec = t.cross(u_vec).normalized()
    return u_vec, v_vec

def add_tube(pts, rad, mat_idx, color, segs=8, rx_comp=RX_COMP, cap_ends=True):
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            tan = pts[1] - pts[0]
        elif i == len(pts) - 1:
            tan = pts[-1] - pts[-2]
        else:
            tan = pts[i + 1] - pts[i - 1]
        u_v, v_v = axis_basis(tan)
        ring = []
        for k in range(segs):
            ang = 2.0 * math.pi * k / segs
            off = u_v * (math.cos(ang) * rad) + v_v * (math.sin(ang) * rad)
            off.x *= rx_comp
            ring.append(p + off)
        rings.append(ring)
    add_profile_loft(rings, mat_idx, color, cap_bottom=cap_ends, cap_top=cap_ends)

def add_ring_torus(center, normal, major_r, minor_r, mat_idx, color, maj_segs=14, min_segs=6):
    u_v, v_v = axis_basis(normal)
    rings = []
    for i in range(maj_segs):
        ang = 2.0 * math.pi * i / maj_segs
        radial = u_v * math.cos(ang) + v_v * math.sin(ang)
        rc = Vector((radial.x * major_r * RX_COMP, radial.y * major_r, radial.z * major_r))
        c_pt = center + rc
        r_dir = rc.normalized() if rc.length > 1e-5 else Vector((1, 0, 0))
        ring = []
        for j in range(min_segs):
            b = 2.0 * math.pi * j / min_segs
            off = r_dir * (math.cos(b) * minor_r) + normal.normalized() * (math.sin(b) * minor_r)
            off.x *= RX_COMP
            ring.append(c_pt + off)
        rings.append(ring)
    faces = []
    for i in range(maj_segs):
        a, b_r = [[bm.verts.new(p) for p in r] for r in [rings[i], rings[(i + 1) % maj_segs]]] if i == -1 else (None, None)
    v_rings = [[bm.verts.new(p) for p in r] for r in rings]
    for i in range(maj_segs):
        a = v_rings[i]
        b = v_rings[(i + 1) % maj_segs]
        for j in range(min_segs):
            jn = (j + 1) % min_segs
            faces.append(bm.faces.new((a[j], b[j], b[jn], a[jn])))
    paint_faces(faces, mat_idx, color)

def oval_ring(center, radius, segs=12, z=None):
    cz = center.z if z is None else z
    ring = []
    for k in range(segs):
        ang = 2.0 * math.pi * k / segs
        ring.append((center.x + math.cos(ang) * radius * RX_COMP, center.y + math.sin(ang) * radius, cz))
    return ring

# Mast layout: exact footprint [-2.25..+2.25] x [-1.55..+1.55] from outer plinth radii (rx=0.081, ry=0.135)
# rx = 0.135 * 0.60 = 0.081, ry = 0.135
PLINTH_R = 0.135
MASTS = [
    {"base": Vector((-2.169, -1.415, 0.0)), "rake": Vector((-0.025, -0.045, 0.0)), "top_h": 2.94, "sail_h": 2.66},
    {"base": Vector((+2.169, -1.350, 0.0)), "rake": Vector((+0.025, -0.045, 0.0)), "top_h": 2.78, "sail_h": 2.50},
    {"base": Vector((0.000, +1.415, 0.0)),  "rake": Vector((0.000, +0.045, 0.0)),  "top_h": 3.01, "sail_h": 2.74},
]

shackle_anchors = []
sail_corners = []
center_xy = Vector((0.0, -0.22, 0.0))

for idx, m in enumerate(MASTS):
    base = m["base"]
    rake = m["rake"]
    top_h = m["top_h"]
    sail_h = m["sail_h"]

    # Stone octagonal plinth with exact z=0 base & chamfered cap (max X/Y strictly inside [-2.25..2.25]x[-1.55..1.55])
    plinth_rings = [
        oval_ring(base, PLINTH_R, 12, 0.000),
        oval_ring(base, PLINTH_R, 12, 0.165),
        oval_ring(base, PLINTH_R * 0.88, 12, 0.215),
        oval_ring(base, PLINTH_R * 0.80, 12, 0.245),
    ]
    add_profile_loft(plinth_rings, 2, STONE_LIGHT)

    # Recessed dark stone shadow groove at z=0.165..0.185 (subtle visual step detail)
    # Cast iron/bronze bolted mast shoe collar
    shoe_rings = [
        oval_ring(base, 0.104, 12, 0.245),
        oval_ring(base, 0.098, 12, 0.345),
        oval_ring(base + rake * 0.04, 0.088, 12, 0.365),
    ]
    add_profile_loft(shoe_rings, 3, IRON_DARK)

    # Tapered hardwood timber mast spar with outward architectural rake
    spar_rings = []
    n_z = 9
    for s in range(n_z):
        t = s / (n_z - 1)
        z_cur = 0.34 + t * (top_h - 0.34)
        rad = 0.082 * (1.0 - 0.27 * t)
        c_xy = base + rake * t
        spar_rings.append(oval_ring(c_xy, rad, 12, z_cur))
    add_profile_loft(spar_rings, 1, WOOD_CREAM_WHITE)

    # Masthead brass collar band & finial (Mast 2 reaches exact maxZ=3.1000)
    t_sail = (sail_h - 0.34) / (top_h - 0.34)
    c_sail = base + rake * t_sail
    c_sail.z = sail_h
    r_sail = 0.082 * (1.0 - 0.27 * t_sail)

    collar_rings = [
        oval_ring(c_sail, r_sail * 1.15, 12, sail_h - 0.06),
        oval_ring(c_sail, r_sail * 1.18, 12, sail_h + 0.06),
    ]
    add_profile_loft(collar_rings, 3, BRASS_GOLD)

    c_top = base + rake
    c_top.z = top_h
    r_top = 0.082 * 0.73
    fin_h = 3.1000 - top_h if idx == 2 else 0.095
    finial_rings = [
        oval_ring(c_top, r_top * 1.24, 12, top_h - 0.02),
        oval_ring(c_top, r_top * 1.32, 12, top_h + fin_h * 0.22),
        oval_ring(c_top, r_top * 0.85, 12, top_h + fin_h * 0.55),
        oval_ring(c_top, r_top * 0.92, 12, top_h + fin_h * 0.78),
        oval_ring(c_top, r_top * 0.20, 12, top_h + fin_h),
    ]
    add_profile_loft(finial_rings, 3, BRASS_GOLD)

    # Rope wrap collar near cleat level z ~ 1.18m for harbor authenticity
    c_wrap = base + rake * 0.32
    c_wrap.z = 1.18
    for r_i in range(4):
        z_r = 1.13 + r_i * 0.028
        add_ring_torus(Vector((c_wrap.x, c_wrap.y, z_r)), Vector((0.0, 0.0, 1.0)), 0.080, 0.015, 4, ROPE_HEMP)

    # Compute inward tension vector from masthead eye toward center
    inward = (center_xy - Vector((c_sail.x, c_sail.y, 0.0))).normalized()
    eye_pt = c_sail + Vector((inward.x * r_sail * RX_COMP * 1.05, inward.y * r_sail * 1.05, 0.0))
    sail_pt = eye_pt + Vector((inward.x * 0.145, inward.y * 0.155, -0.075))
    shackle_anchors.append(eye_pt)
    sail_corners.append(sail_pt)

    # Rigging tension cable & brass shackle ring
    add_tube([eye_pt, sail_pt], 0.013, 4, ROPE_HEMP, segs=8)
    add_ring_torus((eye_pt + sail_pt) * 0.5, sail_pt - eye_pt, 0.024, 0.008, 3, BRASS_GOLD)

# Build the 3-corner catenary sculpted canopy sail (lowest belly >= 2.02m -> >3.98m world headroom above stalls)
N = 28
pA, pB, pC = sail_corners

def sail_point(i, j):
    b = i / N
    c = j / N
    a = 1.0 - b - c
    # Gentle inward catenary scallop pull along all 3 edges
    edge_pull = 0.095 * (a * b + b * c + c * a) * 4.0
    p = a * pA + b * pB + c * pC
    # Edge pull drags toward interior center
    mid = (pA + pB + pC) / 3.0
    p = p.lerp(mid, edge_pull * 0.55)
    # Double-curvature tension sag (center >= 2.04m)
    edge_sag = 0.24 * math.sqrt(max(0.0, (a * b + b * c + c * a) * 3.0))
    belly = 0.28 * (27.0 * a * b * c)
    # Crisp subtle radial panel ridge quilting along edges/diagonals
    ridge = 0.018 * math.sin(max(a, b, c) * math.pi * 6.0) * (1.0 - max(a, b, c))
    p.z = max(2.02, p.z - edge_sag - belly + ridge)
    return p, a, b, c

top_verts = {}
bot_verts = {}
uv_coords = {}
thick = 0.024

for i in range(N + 1):
    for j in range(N + 1 - i):
        pos, a, b, c = sail_point(i, j)
        edge_dist = min(a, b, c)
        v_uv = min(1.0, edge_dist * 3.1)
        u_uv = (pos.x + 2.25) / 4.5
        uv_coords[(i, j)] = (u_uv, v_uv)
        top_verts[(i, j)] = bm.verts.new(pos)
        bot_verts[(i, j)] = bm.verts.new(pos - Vector((0.0, 0.0, thick)))

sail_faces = []
for i in range(N):
    for j in range(N - i):
        tri = [(i, j), (i + 1, j), (i, j + 1)]
        f_top = bm.faces.new([top_verts[k] for k in tri])
        f_bot = bm.faces.new([bot_verts[k] for k in reversed(tri)])
        for f, keys in [(f_top, tri), (f_bot, reversed(tri))]:
            f.material_index = 0
            f.smooth = True
            for loop, k in zip(f.loops, keys):
                loop[vc_layer] = (1.0, 1.0, 1.0, 1.0)
                loop[uv_layer].uv = uv_coords[k]
        if i + j < N - 1:
            tri2 = [(i + 1, j), (i + 1, j + 1), (i, j + 1)]
            f_top2 = bm.faces.new([top_verts[k] for k in tri2])
            f_bot2 = bm.faces.new([bot_verts[k] for k in reversed(tri2)])
            for f, keys in [(f_top2, tri2), (f_bot2, reversed(tri2))]:
                f.material_index = 0
                f.smooth = True
                for loop, k in zip(f.loops, keys):
                    loop[vc_layer] = (1.0, 1.0, 1.0, 1.0)
                    loop[uv_layer].uv = uv_coords[k]

# Close perimeter edge thickness & add sewn cream bolt-rope piping around all 3 catenary edges
edges_idx = [
    [(0, j) for j in range(N + 1)],
    [(i, 0) for i in range(N + 1)],
    [(i, N - i) for i in range(N + 1)],
]
for e_idx, e_chain in enumerate(edges_idx):
    # Stitch rim strip closing top and bottom canopy membrane
    for m in range(len(e_chain) - 1):
        k0, k1 = e_chain[m], e_chain[m + 1]
        verts_rim = [top_verts[k0], top_verts[k1], bot_verts[k1], bot_verts[k0]] if e_idx == 1 else [top_verts[k1], top_verts[k0], bot_verts[k0], bot_verts[k1]]
        try:
            f_rim = bm.faces.new(verts_rim)
            f_rim.material_index = 0
            f_rim.smooth = True
            for loop in f_rim.loops:
                loop[vc_layer] = (0.98, 0.96, 0.90, 1.0)
                loop[uv_layer].uv = (0.5, 0.02)
        except ValueError:
            pass
    # Perimeter bolt-rope cord piping along the catenary edge
    rope_pts = [top_verts[k].co - Vector((0.0, 0.0, thick * 0.5)) for k in e_chain]
    add_tube(rope_pts, 0.017, 4, ROPE_HEMP, segs=6, rx_comp=RX_COMP * 1.15)

# Decorative warm catenary suspension cord hanging just below the long front span (Mast 0 -> Mast 1)
# Kept >= 2.24m high so world clearance >= 4.4m above plaza & stalls
cat_pts = []
p_left = MASTS[0]["base"] + MASTS[0]["rake"] * 0.85
p_left.z = 2.45
p_right = MASTS[1]["base"] + MASTS[1]["rake"] * 0.85
p_right.z = 2.34
for s in range(19):
    t = s / 18.0
    p = p_left.lerp(p_right, t)
    p.z -= 0.16 * 4.0 * t * (1.0 - t)
    cat_pts.append(p)
add_tube(cat_pts, 0.010, 4, ROPE_HEMP, segs=6, rx_comp=RX_COMP)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Market canopy sail and timber masts")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Market canopy sail and timber masts", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_SAIL, MAT_WOOD, MAT_STONE, MAT_METAL, MAT_ROPE):
    obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "MARKET_CANOPY_V1",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "market-canopy.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "market-canopy.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
