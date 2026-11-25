"""Build Moonbay Market Sign v2: sandstone-shod cedar boardwalk signboard with terracotta-shingled gable hood, recessed painted coastal menu boards, bronze brackets, and brass finial."""
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
    0.50 * np.sin(v * 115.0 + 1.7 * np.sin(u * 14.0 + v * 5.0))
    + 0.30 * np.sin(v * 245.0 + 0.8 * np.cos(u * 26.0))
    + 0.20 * np.sin(u * 22.0 + v * 10.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.91 + 0.10 * grain, 0.74, 1.06)
wood_rgba[..., 0] = np.clip(0.56 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.34 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.17 * tone, 0, 1)
wood_img = make_packed_image("sign-wood", W_TX, H_TX, wood_rgba)

# 2. Clean hand-painted parchment market placard (NO conflicting 3D sticks over painted lines!)
cream = np.array([0.955, 0.905, 0.775], dtype=np.float32)
teal_banner = np.array([0.155, 0.575, 0.505], dtype=np.float32)
citrus = np.array([0.925, 0.545, 0.175], dtype=np.float32)
espresso = np.array([0.275, 0.170, 0.105], dtype=np.float32)
terracotta = np.array([0.825, 0.415, 0.245], dtype=np.float32)
leaf = np.array([0.275, 0.625, 0.265], dtype=np.float32)

face_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
paper_grain = 0.018 * np.sin(xx * 0.9) * np.sin(yy * 0.9) + 0.010 * np.cos(u * 35.0 + v * 28.0)

in_border = ((np.abs(u - 0.5) > 0.435) & (np.abs(u - 0.5) < 0.460) & (np.abs(v - 0.5) < 0.460)) | (
    (np.abs(v - 0.5) > 0.435) & (np.abs(v - 0.5) < 0.460) & (np.abs(u - 0.5) < 0.460)
)
wave_bot = 0.700 + 0.016 * np.sin(u * math.pi * 10.0)
in_banner = (v > wave_bot) & (v < 0.870) & (u > 0.09) & (u < 0.91)
in_sun = np.hypot(u - 0.50, v - 0.795) < 0.064
in_leaf = np.hypot((u - 0.555) * 1.4, (v - 0.855) * 2.2) < 0.032

# Crisp stylized menu lines & right price markers
in_l1 = (np.abs(v - 0.545) < 0.022) & (u > 0.23) & (u < 0.71)
in_l2 = (np.abs(v - 0.400) < 0.022) & (u > 0.23) & (u < 0.66)
in_l3 = (np.abs(v - 0.255) < 0.022) & (u > 0.23) & (u < 0.69)
in_p1 = (np.abs(v - 0.545) < 0.018) & (u > 0.77) & (u < 0.84)
in_p2 = (np.abs(v - 0.400) < 0.018) & (u > 0.77) & (u < 0.84)
in_p3 = (np.abs(v - 0.255) < 0.018) & (u > 0.77) & (u < 0.84)
in_dots = (
    (np.hypot(u - 0.165, v - 0.545) < 0.028)
    | (np.hypot(u - 0.165, v - 0.400) < 0.028)
    | (np.hypot(u - 0.165, v - 0.255) < 0.028)
)
# Tiny bottom wave motif
in_bot_wave = (np.abs(v - (0.125 + 0.010 * np.sin(u * math.pi * 12.0))) < 0.009) & (u > 0.15) & (u < 0.85)

for c in range(3):
    col = np.full((H_TX, W_TX), cream[c], dtype=np.float32)
    col = np.where(in_border | in_banner | in_bot_wave, teal_banner[c], col)
    col = np.where(in_sun, citrus[c], col)
    col = np.where(in_leaf, leaf[c], col)
    col = np.where(in_l1 | in_l2 | in_l3, espresso[c], col)
    col = np.where(in_dots | in_p1 | in_p2 | in_p3, terracotta[c], col)
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

MAT_WOOD = make_tex_mat("SignWood", wood_img, rough=0.74)
MAT_FACE = make_tex_mat("SignPlacard", face_img, rough=0.82)
MAT_METAL = make_vcol_mat("SignMetal", rough=0.38, metal=0.74)
MAT_STONE_ROOF = make_vcol_mat("SignStoneTerracotta", rough=0.84)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
WOOD_LIGHT = (1.06, 1.02, 0.96, 1.0)
WOOD_DARK = (0.85, 0.80, 0.75, 1.0)
SANDSTONE = (0.88, 0.77, 0.62, 1.0)
SANDSTONE_TOP = (0.92, 0.82, 0.68, 1.0)
CLAY_TILE_A = (0.80, 0.41, 0.25, 1.0)
CLAY_TILE_B = (0.85, 0.46, 0.28, 1.0)
BRONZE_DARK = (0.42, 0.32, 0.22, 1.0)
BRASS_GOLD = (0.85, 0.67, 0.29, 1.0)

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

def add_box(center, size, mat_idx, col=WHITE, bevel=0.005, rot=(0.0, 0.0, 0.0), uv_fn=None):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0)),
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
    rings = [
        [bm.verts.new(pos + x_ax * (math.cos(2 * math.pi * i / segs) * r) + y_ax * (math.sin(2 * math.pi * i / segs) * r)) for i in range(segs)]
        for pos, r in [(p0v, r0), (p1v, r1)]
    ]
    faces = [bm.faces.new((rings[0][i], rings[0][(i + 1) % segs], rings[1][(i + 1) % segs], rings[1][i])) for i in range(segs)]
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

def add_ball(center, rad, mat_idx, col, scale_xyz=(1, 1, 1)):
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*scale_xyz, 1.0)), verts=verts)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)

# 1. Grounded Warm Sandstone Footing Pedestals (y in [-0.220, +0.220] -> exact D=0.440, minZ=0.000)
for sx in (-0.215, +0.215):
    # Stepped limestone runner blocks seated flush on flagstones
    add_box((sx, 0.0, 0.026), (0.128, 0.440, 0.052), 3, SANDSTONE, bevel=0.007)
    add_box((sx, 0.0, 0.068), (0.106, 0.360, 0.036), 3, SANDSTONE_TOP, bevel=0.006)
    # Bronze post anchor collars
    add_box((sx, 0.0, 0.102), (0.084, 0.088, 0.036), 2, BRONZE_DARK, bevel=0.004)
    # Twin chamfered cedar posts rising neatly into gable roof header (z in [0.11, 0.99])
    add_box((sx, 0.0, 0.550), (0.068, 0.072, 0.880), 0, WOOD_DARK, bevel=0.007)
    # Gentle low stone-to-post carved knee brackets (tucked cleanly into post face & stone top)
    for sy_b in (-1.0, +1.0):
        add_beam((sx, sy_b * 0.120, 0.084), (sx, sy_b * 0.020, 0.215), 0.038, 0.034, 0, WOOD_DARK)

# Lower slatted cedar crossbar rail + miniature vertical balustrade spindles beneath menu housing
add_box((0.0, 0.0, 0.220), (0.50, 0.048, 0.048), 0, WOOD_LIGHT, bevel=0.005)
add_box((0.0, 0.0, 0.395), (0.50, 0.048, 0.036), 0, WOOD_LIGHT, bevel=0.005)
for tx in (-0.252, +0.252):
    add_box((tx, 0.0, 0.220), (0.016, 0.026, 0.028), 2, BRONZE_DARK, bevel=0.002)
for sx_sp in (-0.115, 0.0, +0.115):
    add_cyl((sx_sp, 0.0, 0.240), (sx_sp, 0.0, 0.382), 0.013, 0.013, 10, 0, WOOD_LIGHT)

# 2. Framed Menu Cabinet Housing (z in [0.40, 0.96])
add_box((0.0, 0.0, 0.680), (0.520, 0.064, 0.530), 0, WOOD_DARK, bevel=0.006)
# Deeper mitered picture-frame molding surround with bronze corner straps
for cz in (0.428, 0.932):
    add_box((0.0, 0.0, cz), (0.552, 0.096, 0.038), 0, WOOD_LIGHT, bevel=0.005)
for cx in (-0.256, +0.256):
    add_box((cx, 0.0, 0.680), (0.040, 0.094, 0.520), 0, WOOD_LIGHT, bevel=0.005)
    for cz in (0.432, 0.928):
        add_box((cx * 1.02, 0.0, cz), (0.028, 0.102, 0.028), 2, BRASS_GOLD, bevel=0.003)

# Recessed Front (-Y) and Back (+Y) Crisp Printed Coastal Parchment Faces (100% clean, zero z-fighting)
for side_sign in (-1.0, +1.0):
    y_out = side_sign * 0.039
    y_back = side_sign * 0.032
    vx = [-0.228, +0.228]
    vz = [0.456, 0.904]
    p00 = bm.verts.new(Vector((vx[0], y_out, vz[0])))
    p10 = bm.verts.new(Vector((vx[1], y_out, vz[0])))
    p11 = bm.verts.new(Vector((vx[1], y_out, vz[1])))
    p01 = bm.verts.new(Vector((vx[0], y_out, vz[1])))
    f_front = bm.faces.new((p00, p10, p11, p01) if side_sign < 0 else (p10, p00, p01, p11))
    f_front.material_index = 1
    f_front.smooth = False
    for loop, uv_c in zip(f_front.loops, [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]):
        loop[vc_layer] = WHITE
        loop[uv_layer].uv = uv_c
    # Solid recessed cream wooden placard backing thickness ending 3mm behind front parchment plane
    add_box((0.0, (y_back + side_sign * 0.0355) * 0.5, 0.680), (0.456, 0.004, 0.448), 1, (0.95, 0.90, 0.77, 1.0), bevel=0.0, uv_fn=lambda co: (0.50, 0.50))

# 3. Carved Cedar Gable Pediment + Scalloped Terracotta Market Roof Tiles (exact W=0.650, maxZ=1.120)
slope_ang = 0.34
# Gable rafters & wooden fascia trim beneath terracotta shingles (exact x in [-0.325, +0.325])
add_box((0.0, 0.0, 0.972), (0.620, 0.145, 0.034), 0, WOOD_DARK, bevel=0.005)
for side_y in (-1.0, +1.0):
    add_box((0.0, side_y * 0.088, 1.018), (0.650, 0.185, 0.022), 0, WOOD_LIGHT, bevel=0.004, rot=(-side_y * slope_ang, 0.0, 0.0))
    # 7 Individual beveled terracotta barrel/scallop clay roof tiles along X (matching Moonbay market shops!)
    for ti in range(7):
        tx = -0.270 + ti * (0.540 / 6.0)
        col_t = CLAY_TILE_A if ti % 2 == 0 else CLAY_TILE_B
        add_box((tx, side_y * 0.095, 1.035), (0.084, 0.175, 0.026), 3, col_t, bevel=0.007, rot=(-side_y * slope_ang, 0.0, 0.0))
        # Curved clay eave barrel cap
        add_cyl((tx, side_y * 0.175, 1.005), (tx, side_y * 0.020, 1.062), 0.019, 0.016, 8, 3, CLAY_TILE_B)

# Ridge clay cap beam + side cedar barge finials + central brass acorn spire at exact maxZ = 1.1200
add_box((0.0, 0.0, 1.064), (0.650, 0.052, 0.032), 3, CLAY_TILE_A, bevel=0.008)
add_cyl((0.0, 0.0, 1.076), (0.0, 0.0, 1.092), 0.017, 0.012, 12, 2, BRASS_GOLD)
add_ball((0.0, 0.0, 1.106), 0.018, 2, BRASS_GOLD, (1.0, 1.0, 0.78))

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Market boardwalk terracotta-hood signboard")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Market boardwalk terracotta-hood signboard", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_WOOD, MAT_FACE, MAT_METAL, MAT_STONE_ROOF):
    obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "MARKET_SIGN_V2",
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
