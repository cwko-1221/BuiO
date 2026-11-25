"""Build Moonbay Market Sign v1: double-sided carved cedar standing placard with trestle feet, pitched shingle hood, painted menu board, and brass fittings."""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

# Exact target dims [0.65, 0.44, 1.12]
W, D, H = 0.65, 0.44, 1.12

def make_packed_image(name, w, h, rgba_array):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img

W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# 1. Warm cedar sign timber grain
grain = (
    0.50 * np.sin(v * 110.0 + 1.7 * np.sin(u * 14.0 + v * 5.0))
    + 0.30 * np.sin(v * 240.0 + 0.8 * np.cos(u * 26.0))
    + 0.20 * np.sin(u * 22.0 + v * 10.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.91 + 0.10 * grain, 0.75, 1.06)
wood_rgba[..., 0] = np.clip(0.56 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.34 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.17 * tone, 0, 1)
wood_img = make_packed_image("sign-wood", W_TX, H_TX, wood_rgba)

# 2. Hand-painted cream market placard menu face (coastal teal header band + citrus crest + menu lines)
cream = np.array([0.945, 0.895, 0.765], dtype=np.float32)
teal_banner = np.array([0.165, 0.595, 0.525], dtype=np.float32)
citrus = np.array([0.905, 0.525, 0.185], dtype=np.float32)
espresso = np.array([0.285, 0.175, 0.105], dtype=np.float32)
terracotta = np.array([0.815, 0.425, 0.255], dtype=np.float32)

face_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
paper_grain = 0.018 * np.sin(xx * 0.9) * np.sin(yy * 0.9) + 0.012 * np.cos(u * 35.0 + v * 28.0)

# Border pinstripe frame
in_border = ((np.abs(u - 0.5) > 0.42) & (np.abs(u - 0.5) < 0.445) & (np.abs(v - 0.5) < 0.445)) | (
    (np.abs(v - 0.5) > 0.42) & (np.abs(v - 0.5) < 0.445) & (np.abs(u - 0.5) < 0.445)
)
# Teal top ribbon banner (v in 0.71..0.85) with scalloped lower wave
wave_bot = 0.705 + 0.016 * np.sin(u * math.pi * 10.0)
in_banner = (v > wave_bot) & (v < 0.855) & (u > 0.10) & (u < 0.90)
# Citrus sun disc emblem centered inside banner
r_sun = np.hypot((u - 0.50), (v - 0.785))
in_sun = r_sun < 0.062
# Three stylized horizontal menu lines below banner
in_l1 = (np.abs(v - 0.53) < 0.024) & (u > 0.24) & (u < 0.80)
in_l2 = (np.abs(v - 0.39) < 0.024) & (u > 0.24) & (u < 0.74)
in_l3 = (np.abs(v - 0.25) < 0.024) & (u > 0.24) & (u < 0.68)
# Bullet dots left of each menu row
in_dots = (
    (np.hypot(u - 0.175, v - 0.53) < 0.025)
    | (np.hypot(u - 0.175, v - 0.39) < 0.025)
    | (np.hypot(u - 0.175, v - 0.25) < 0.025)
)

for c in range(3):
    col = np.full((H_TX, W_TX), cream[c], dtype=np.float32)
    col = np.where(in_border, teal_banner[c], col)
    col = np.where(in_banner, teal_banner[c], col)
    col = np.where(in_sun, citrus[c], col)
    col = np.where(in_l1 | in_l2 | in_l3, espresso[c], col)
    col = np.where(in_dots, terracotta[c], col)
    face_rgba[..., c] = np.clip(col * (1.0 + paper_grain), 0.0, 1.0)
face_img = make_packed_image("sign-face", W_TX, H_TX, face_rgba)

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

MAT_WOOD = make_tex_mat("SignWood", wood_img, rough=0.72)
MAT_FACE = make_tex_mat("SignPlacard", face_img, rough=0.80)
MAT_METAL = make_vcol_mat("SignBrass", rough=0.35, metal=0.76)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
WOOD_LIGHT = (1.08, 1.04, 0.98, 1.0)
WOOD_DARK = (0.84, 0.80, 0.75, 1.0)
BRASS_GOLD = (0.85, 0.67, 0.29, 1.0)
BRONZE_DARK = (0.38, 0.30, 0.24, 1.0)
TEAL_TRIM = (0.19, 0.62, 0.55, 1.0)

def paint_faces(faces, mat_idx, col, uv_fn=None):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = True
        for loop in f.loops:
            loop[vc_layer] = col
            if uv_fn is not None:
                loop[uv_layer].uv = uv_fn(loop.vert.co)
            else:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x + 0.4) * 1.4 % 1.0, (co.y * 0.6 + co.z * 0.9) % 1.0)

def add_box(center, size, mat_idx, col=WHITE, bevel=0.006, rot=(0.0, 0.0, 0.0), uv_fn=None):
    sx, sy, sz = size
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1.0)),
        verts=verts,
    )
    if bevel > 0.0:
        edges = list({e for v in verts for f in v.link_faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col, uv_fn=uv_fn)

def add_cyl(p0, p1, r0, r1, segs, mat_idx, col):
    p0v, p1v = Vector(p0), Vector(p1)
    z_ax = (p1v - p0v).normalized()
    ref = Vector((0, 0, 1)) if abs(z_ax.z) < 0.9 else Vector((0, 1, 0))
    x_ax = z_ax.cross(ref).normalized()
    y_ax = z_ax.cross(x_ax).normalized()
    rings = []
    for pos, r in [(p0v, r0), (p1v, r1)]:
        rings.append([bm.verts.new(pos + x_ax * (math.cos(2 * math.pi * i / segs) * r) + y_ax * (math.sin(2 * math.pi * i / segs) * r)) for i in range(segs)])
    faces = []
    for i in range(segs):
        j = (i + 1) % segs
        faces.append(bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[1]))
    paint_faces(faces, mat_idx, col)

def add_beam(p0, p1, w_beam, h_beam, mat_idx, col=WHITE, bevel=0.004):
    p0v, p1v = Vector(p0), Vector(p1)
    mid = (p0v + p1v) * 0.5
    vec = p1v - p0v
    q = Vector((1, 0, 0)).rotation_difference(vec.normalized())
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(mid) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((vec.length, w_beam, h_beam, 1.0)),
        verts=verts,
    )
    if bevel > 0.0:
        edges = list({e for v in verts for f in v.link_faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)

def add_ball(center, rad, mat_idx, col):
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center), verts=verts)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)

# 1. Dual arched cedar trestle runner feet (y in [-0.220, +0.220], minZ = 0.000)
# Front and back pad shoes touch z=0.000 while arched waist lifts cleanly over flagstones.
for sx in (-0.215, +0.215):
    for sy_pad in (-0.172, +0.172):
        add_box((sx, sy_pad, 0.018), (0.088, 0.096, 0.036), 0, WOOD_DARK, bevel=0.005)
    # Upper bridged runner bar across y in [-0.20, +0.20]
    add_box((sx, 0.0, 0.056), (0.076, 0.400, 0.052), 0, WHITE, bevel=0.006)
    # Twin chamfered upright cedar posts (x = +-0.215) rising to hood header
    add_box((sx, 0.0, 0.525), (0.064, 0.068, 0.90), 0, WOOD_DARK, bevel=0.006)
    # Diagonal mortised knee braces stabilizing upright posts fore and aft
    for sy_b in (-1.0, +1.0):
        add_beam((sx, sy_b * 0.165, 0.072), (sx, sy_b * 0.025, 0.255), 0.044, 0.042, 0, WOOD_LIGHT)

# Lower slatted cedar crossbar stretcher + mortise tenon pegs
add_box((0.0, 0.0, 0.235), (0.50, 0.046, 0.052), 0, WOOD_LIGHT, bevel=0.005)
for tx in (-0.252, +0.252):
    add_box((tx, 0.0, 0.235), (0.016, 0.026, 0.030), 2, BRONZE_DARK, bevel=0.002)

# 2. Carved Signboard Housing & Double-Sided Painted Menu Placards (z in [0.43, 0.96])
# Main cedar backing cabinet + beveled molding frame
add_box((0.0, 0.0, 0.700), (0.520, 0.068, 0.530), 0, WOOD_DARK, bevel=0.006)
# Raised mitered outer cedar trim surround + brass corner L-brackets
for cz in (0.450, 0.950):
    add_box((0.0, 0.0, cz), (0.548, 0.088, 0.036), 0, WOOD_LIGHT, bevel=0.005)
for cx in (-0.255, +0.255):
    add_box((cx, 0.0, 0.700), (0.038, 0.086, 0.510), 0, WOOD_LIGHT, bevel=0.005)
    for cz in (0.455, 0.945):
        add_box((cx * 1.03, 0.0, cz), (0.026, 0.094, 0.026), 2, BRASS_GOLD, bevel=0.003)

# Front (-Y) and Back (+Y) recessed painted cream placard menu panels mapped cleanly to sign-face.png!
# Panel center z = 0.700, width = 0.456 (x in [-0.228, +0.228]), height = 0.440 (z in [0.480, 0.920])
for side_sign in (-1.0, +1.0):
    y_out = side_sign * 0.042
    y_in = side_sign * 0.032
    vx = [-0.228, +0.228]
    vz = [0.480, 0.920]
    p00 = bm.verts.new(Vector((vx[0], y_out, vz[0])))
    p10 = bm.verts.new(Vector((vx[1], y_out, vz[0])))
    p11 = bm.verts.new(Vector((vx[1], y_out, vz[1])))
    p01 = bm.verts.new(Vector((vx[0], y_out, vz[1])))
    f_front = bm.faces.new((p00, p10, p11, p01) if side_sign < 0 else (p10, p00, p01, p11))
    f_front.material_index = 1
    f_front.smooth = False
    # Map U cleanly left-to-right when viewing that face, V bottom-to-top
    uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for loop, uv_c in zip(f_front.loops, uvs):
        loop[vc_layer] = WHITE
        loop[uv_layer].uv = uv_c
    # Subtle inner lip backing box so panel thickness sits solidly in frame
    add_box((0.0, y_in, 0.700), (0.464, 0.018, 0.448), 1, (0.94, 0.89, 0.76, 1.0), bevel=0.003,
            uv_fn=lambda co: (0.06, 0.06))

# Raised carved wood bar accents inside face frame matching reference's 3-bar silhouette subtly
for bz, bw in [(0.713, 0.24), (0.651, 0.21), (0.589, 0.18)]:
    for side_sign in (-1.0, +1.0):
        add_box((0.02, side_sign * 0.044, bz), (bw, 0.008, 0.014), 0, (0.95, 0.90, 0.85, 1.0), bevel=0.002)

# 3. Protective Mini Gable Weather Hood & Finial Crown (x in [-0.325, +0.325] -> exact W=0.650, maxZ = 1.120)
# Gable rafters / sloped shingle boards meeting cleanly at ridge x=0..+-0.325
hood_slope = 0.26  # ~15 deg gentle pitch
for side_y in (-1.0, +1.0):
    add_box((0.0, side_y * 0.072, 1.028), (0.640, 0.165, 0.028), 0, WOOD_LIGHT, bevel=0.005, rot=(-side_y * hood_slope, 0.0, 0.0))
# Solid teal/copper decorative ridge cap & turned center brass acorn finial reaching exact maxZ = 1.1200
add_box((0.0, 0.0, 1.055), (0.650, 0.044, 0.030), 2, BRONZE_DARK, bevel=0.006)
add_cyl((0.0, 0.0, 1.066), (0.0, 0.0, 1.084), 0.016, 0.012, 12, 2, BRASS_GOLD)
add_ball((0.0, 0.0, 1.100), 0.020, 2, BRASS_GOLD)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Market standing cedar signboard")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Market standing cedar signboard", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_WOOD, MAT_FACE, MAT_METAL):
    obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "MARKET_SIGN_V1",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "market-sign.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "market-sign.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
