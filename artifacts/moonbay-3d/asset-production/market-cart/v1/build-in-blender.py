"""Build Moonbay Market Cart v1: citrus-striped awning street cart with 4 spoked carriage wheels, bent oak push handle, citrus crates, pitcher, and chalkboard."""
import math
import random
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
rng = random.Random(20261125)

# Target dimensions [2.3, 1.25, 2.05] -> Blender X [-1.15..1.15], Y [-0.625..0.625], Z [0.0..2.05]
W, D, H = 2.30, 1.25, 2.05

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

# 1. Warm cedar/honey carriage wood grain texture
grain = (
    0.50 * np.sin(v * 105.0 + 1.8 * np.sin(u * 13.0 + v * 5.0))
    + 0.30 * np.sin(v * 240.0 + 0.9 * np.cos(u * 25.0))
    + 0.20 * np.sin(u * 20.0 + v * 12.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.92 + 0.09 * grain, 0.76, 1.07)
wood_rgba[..., 0] = np.clip(0.58 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.35 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.18 * tone, 0, 1)
wood_img = make_packed_image("cart-wood", W_TX, H_TX, wood_rgba)

# 2. Woven tangerine-and-cream 7-bay striped awning fabric (#e7a96a / warm tangerine citrus palette)
weave = 0.030 * np.sin(xx * 1.4) * np.sin(yy * 1.4) + 0.018 * np.sin(xx * 0.42 + yy * 0.35)
stripe_phase = (u * 7.0) % 2.0
is_citrus = stripe_phase < 1.0
seam = np.exp(-((np.minimum(stripe_phase % 1.0, 1.0 - (stripe_phase % 1.0))) * 26.0) ** 2)
hem = np.exp(-((np.maximum(0.0, 0.10 - v) / 0.10) ** 2))

citrus_rgb = np.array([0.895, 0.545, 0.235], dtype=np.float32)
cream_rgb = np.array([0.960, 0.895, 0.725], dtype=np.float32)
canvas_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
for c in range(3):
    base = np.where(is_citrus, citrus_rgb[c], cream_rgb[c])
    base = np.where(v < 0.065, cream_rgb[c] * 0.97, base)
    shaded = base * (1.0 + weave - 0.10 * seam - 0.06 * hem)
    canvas_rgba[..., c] = np.clip(shaded, 0.0, 1.0)
canvas_img = make_packed_image("cart-canvas", W_TX, H_TX, canvas_rgba)

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

MAT_WOOD = make_tex_mat("CartWood", wood_img, rough=0.70)
MAT_CANVAS = make_tex_mat("CartCanvas", canvas_img, rough=0.80)
MAT_METAL = make_vcol_mat("CartMetal", rough=0.38, metal=0.72)
MAT_PRODUCE = make_vcol_mat("CartProduce", rough=0.45)
MAT_MISC = make_vcol_mat("CartMisc", rough=0.78)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
BRONZE_IRON = (0.34, 0.28, 0.24, 1.0)
BRASS_GOLD = (0.86, 0.67, 0.28, 1.0)
BURLAP = (0.82, 0.72, 0.50, 1.0)
SLATE_DARK = (0.20, 0.22, 0.25, 1.0)
CREAM_CHALK = (0.94, 0.90, 0.78, 1.0)
TERRACOTTA_PITCHER = (0.84, 0.48, 0.26, 1.0)

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
                loop[uv_layer].uv = ((co.x + 1.2) * 0.65 % 1.0, (co.y * 0.5 + co.z * 0.65) % 1.0)

def add_box(center, size, mat_idx, col=WHITE, bevel=0.008, rot=(0.0, 0.0, 0.0)):
    sx, sy, sz = size
    before_faces = set(bm.faces)
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    mat_rot = Euler(rot, "XYZ").to_matrix().to_4x4()
    mat_loc = Matrix.Translation(center)
    mat_scl = Matrix.Diagonal((sx, sy, sz, 1.0))
    bmesh.ops.transform(bm, matrix=mat_loc @ mat_rot @ mat_scl, verts=verts)
    faces = list({f for v in verts for f in v.link_faces})
    if bevel > 0.0:
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    faces = [f for f in bm.faces if f not in before_faces]
    paint_faces(faces, mat_idx, col)
    return verts

def add_cyl(p0, p1, r0, r1, segs, mat_idx, col=WHITE, cap=True):
    p0v, p1v = Vector(p0), Vector(p1)
    vec = p1v - p0v
    length = vec.length
    if length < 1e-5:
        return
    z_ax = vec.normalized()
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
    if cap:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
        faces.append(bm.faces.new(rings[1]))
    paint_faces(faces, mat_idx, col)

def add_beam(p0, p1, w_beam, h_beam, mat_idx, col=WHITE, bevel=0.004):
    p0v, p1v = Vector(p0), Vector(p1)
    mid = (p0v + p1v) * 0.5
    vec = p1v - p0v
    L = vec.length
    q = Vector((1, 0, 0)).rotation_difference(vec.normalized())
    before_faces = set(bm.faces)
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(mid) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((L, w_beam, h_beam, 1.0)),
        verts=verts,
    )
    faces = list({f for v in verts for f in v.link_faces})
    if bevel > 0:
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    faces = [f for f in bm.faces if f not in before_faces]
    paint_faces(faces, mat_idx, col)

def add_tube(pts, rad, mat_idx, col, segs=8):
    rings = []
    for i, p in enumerate(pts):
        tan = pts[1] - pts[0] if i == 0 else (pts[-1] - pts[-2] if i == len(pts) - 1 else pts[i + 1] - pts[i - 1])
        t = tan.normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
        u_v = t.cross(ref).normalized()
        v_v = t.cross(u_v).normalized()
        rings.append([bm.verts.new(p + u_v * (math.cos(2 * math.pi * k / segs) * rad) + v_v * (math.sin(2 * math.pi * k / segs) * rad)) for k in range(segs)])
    faces = []
    for r in range(len(rings) - 1):
        a, b = rings[r], rings[r + 1]
        for k in range(segs):
            kn = (k + 1) % segs
            faces.append(bm.faces.new((a[k], a[kn], b[kn], b[k])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[-1]))
    paint_faces(faces, mat_idx, col)

def add_ball(center, rad, scale_xyz, mat_idx, col, subdiv=2):
    ret = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=rad)
    verts = ret["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*scale_xyz, 1.0)), verts=verts)
    faces = list({f for v in verts for f in v.link_faces})
    paint_faces(faces, mat_idx, col)

def add_carriage_wheel(center_x, side_y, r_outer, tire_thick, rim_depth, mat_wood=0, mat_iron=2):
    """Build 8-spoked wooden carriage wheel with iron tire resting cleanly at z=0."""
    cz = r_outer
    n_maj = 24
    # 1. Outer wrought-bronze iron tire rim (radius r_outer - tire_thick*0.5 .. r_outer)
    r_in_wood = r_outer - 0.044
    r_tire_in = r_outer - 0.015
    w_half = rim_depth * 0.5
    sign_y = 1.0 if side_y > 0 else -1.0

    # Wood felloe ring + outer iron tire band constructed as clean rectangular-section toroidal rings
    for r_in, r_out, y_h, m_idx, col in [
        (r_in_wood, r_tire_in, w_half, mat_wood, (0.88, 0.84, 0.80, 1.0)),
        (r_tire_in, r_outer, w_half + 0.002, mat_iron, BRONZE_IRON),
    ]:
        ring_verts = []
        for i in range(n_maj):
            ang = 2.0 * math.pi * i / n_maj
            ca, sa = math.cos(ang), math.sin(ang)
            v0 = bm.verts.new(Vector((center_x + ca * r_in, side_y - y_h, cz + sa * r_in)))
            v1 = bm.verts.new(Vector((center_x + ca * r_out, side_y - y_h, cz + sa * r_out)))
            v2 = bm.verts.new(Vector((center_x + ca * r_out, side_y + y_h, cz + sa * r_out)))
            v3 = bm.verts.new(Vector((center_x + ca * r_in, side_y + y_h, cz + sa * r_in)))
            ring_verts.append((v0, v1, v2, v3))
        faces = []
        for i in range(n_maj):
            a = ring_verts[i]
            b = ring_verts[(i + 1) % n_maj]
            for k in range(4):
                kn = (k + 1) % 4
                faces.append(bm.faces.new((a[k], a[kn], b[kn], b[k])))
        paint_faces(faces, m_idx, col)

    # 8 turned wooden spokes
    for k in range(8):
        ang = 2.0 * math.pi * k / 8.0 + math.pi / 16.0
        p0 = Vector((center_x + math.cos(ang) * 0.035, side_y, cz + math.sin(ang) * 0.035))
        p1 = Vector((center_x + math.cos(ang) * (r_in_wood + 0.006), side_y, cz + math.sin(ang) * (r_in_wood + 0.006)))
        add_cyl(p0, p1, 0.015, 0.011, 8, mat_wood, (0.98, 0.94, 0.88, 1.0), cap=False)

    # Central wooden wheel hub + protruding outer brass axle cap
    add_cyl((center_x, side_y - w_half * 1.15, cz), (center_x, side_y + w_half * 1.15, cz), 0.048, 0.048, 12, mat_wood, (0.85, 0.80, 0.75, 1.0))
    add_cyl((center_x, side_y + sign_y * w_half * 1.15, cz), (center_x, side_y + sign_y * (w_half * 1.55), cz), 0.028, 0.018, 10, mat_iron, BRASS_GOLD)

# Chassis bounds: W = 2.30 (x in [-1.15, 1.15]), D = 1.25 (y in [-0.625, 0.625])
# Cart body occupies x in [-0.88, 0.92], y in [-0.46, 0.46]; canopy eaves hit y in [-0.625, 0.625].
# Left push handle reaches exact minX = -1.150, right drop-shelf reaches maxX = +1.150 (exact cx=0, w=2.30).
WHEEL_R = 0.230
AXLE_Y = 0.495
for wx in (-0.64, +0.64):
    # Transverse iron/wood axle shaft & mounting blocks
    add_cyl((wx, -AXLE_Y, WHEEL_R), (wx, +AXLE_Y, WHEEL_R), 0.024, 0.024, 8, 2, BRONZE_IRON)
    add_box((wx, 0.0, WHEEL_R + 0.055), (0.08, 0.84, 0.08), 0, (0.88, 0.84, 0.80, 1.0), bevel=0.006)
    for wy in (-AXLE_Y, +AXLE_Y):
        add_carriage_wheel(wx, wy, WHEEL_R, 0.015, 0.056)

# Slatted carriage underframe & recessed lower storage shelf (z = 0.30..0.38)
for sx in (-0.84, +0.86):
    add_box((sx, -0.40, 0.36), (0.06, 0.06, 0.14), 0, (0.90, 0.85, 0.80, 1.0), bevel=0.006)
    add_box((sx, +0.40, 0.36), (0.06, 0.06, 0.14), 0, (0.90, 0.85, 0.80, 1.0), bevel=0.006)
for y_rail in (-0.41, +0.41):
    add_box((0.02, y_rail, 0.33), (1.76, 0.055, 0.055), 0, (0.90, 0.86, 0.82, 1.0), bevel=0.005)
for i in range(6):
    sy = -0.32 + i * (0.64 / 5.0)
    add_box((0.02, sy, 0.35), (1.66, 0.095, 0.024), 0, (0.94, 0.90, 0.86, 1.0), bevel=0.004)

# Main paneled cart cabinet box (x in [-0.88, 0.90], y in [-0.45, 0.45], z in [0.38, 0.84])
# Corner posts + chamfered horizontal/vertical wood slat apron on all 4 sides
for sx in (-0.85, +0.87):
    for sy in (-0.42, +0.42):
        add_box((sx, sy, 0.61), (0.075, 0.075, 0.46), 0, (0.86, 0.81, 0.76, 1.0), bevel=0.008)
        # Decorative brass corner bolts
        for zb in (0.44, 0.78):
            add_ball((sx + (0.038 if sx > 0 else -0.038), sy + (0.038 if sy > 0 else -0.038), zb), 0.011, (1, 1, 1), 2, BRASS_GOLD, 1)

# Recessed wainscot inner core + exterior vertical tongue-and-groove slats (12 bays long, 6 bays short)
add_box((0.01, 0.0, 0.61), (1.68, 0.82, 0.42), 0, (0.78, 0.74, 0.70, 1.0), bevel=0.004)
for side_y in (-0.435, +0.435):
    for i in range(12):
        px = -0.76 + (i + 0.5) * (1.54 / 12.0)
        tint = 0.94 + 0.06 * ((i * 5) % 3 - 1)
        add_box((px, side_y, 0.61), (0.112, 0.026, 0.38), 0, (tint, tint * 0.97, tint * 0.93, 1.0), bevel=0.004)
    # Trim rails top/bottom
    add_box((0.01, side_y, 0.415), (1.64, 0.036, 0.045), 0, (0.90, 0.86, 0.82, 1.0), bevel=0.005)
    add_box((0.01, side_y, 0.805), (1.64, 0.036, 0.045), 0, (0.90, 0.86, 0.82, 1.0), bevel=0.005)

for end_x in (-0.865, +0.885):
    for j in range(5):
        py = -0.34 + (j + 0.5) * (0.68 / 5.0)
        tint = 0.95 + 0.05 * ((j * 3) % 3 - 1)
        add_box((end_x, py, 0.61), (0.026, 0.118, 0.38), 0, (tint, tint * 0.97, tint * 0.93, 1.0), bevel=0.004)
    add_box((end_x, 0.0, 0.415), (0.036, 0.78, 0.045), 0, (0.90, 0.86, 0.82, 1.0), bevel=0.005)
    add_box((end_x, 0.0, 0.805), (0.036, 0.78, 0.045), 0, (0.90, 0.86, 0.82, 1.0), bevel=0.005)

# Countertop planked deck (z = 0.84..0.895, overhangs cart apron slightly)
for k in range(5):
    cy = -0.40 + k * 0.20
    tint = 0.96 + 0.04 * (k % 2)
    add_box((0.01, cy, 0.868), (1.84, 0.188, 0.052), 0, (tint, tint * 0.98, tint * 0.94, 1.0), bevel=0.008)

# Steamed bent oak push handle on -X reaching exact minX = -1.150
for py in (-0.31, +0.31):
    handle_pts = [
        Vector((-0.86, py, 0.78)),
        Vector((-0.98, py, 0.82)),
        Vector((-1.08, py, 0.90)),
        Vector((-1.132, py, 0.96)),
    ]
    add_tube(handle_pts, 0.018, 0, (0.96, 0.92, 0.86, 1.0), segs=10)
    add_ball((-0.87, py, 0.78), 0.024, (1, 1, 1), 2, BRASS_GOLD, 1)
# Turned handle grip crossbar spanning [-0.31, +0.31] at exact x = -1.132 (radius 0.018 -> minX = -1.150)
add_cyl((-1.132, -0.33, 0.96), (-1.132, +0.33, 0.96), 0.018, 0.018, 12, 0, (1.02, 0.96, 0.88, 1.0))

# Hinged folding wooden side leaf shelf + brass support brackets on +X reaching exact maxX = +1.150
add_box((1.03, 0.0, 0.825), (0.24, 0.70, 0.036), 0, (0.96, 0.92, 0.87, 1.0), bevel=0.006)
for sy in (-0.25, +0.25):
    add_beam((0.90, sy, 0.65), (1.10, sy, 0.81), 0.022, 0.026, 2, BRONZE_IRON)

# Folded burlap grain sack tucked neatly on the lower shelf
add_ball((-0.35, -0.05, 0.42), 0.12, (1.75, 1.15, 0.55), 4, BURLAP, 2)
add_ball((0.25, 0.08, 0.415), 0.11, (1.55, 1.05, 0.52), 4, (0.76, 0.66, 0.46, 1.0), 2)

# Three tilted citrus display crates + ceramic juice pitcher & counter chalkboard on z=0.895
# Note Blender -Y is Three +Z front, so tilt crates toward -Y (rx < 0 drops front edge slightly wait: +Z top tilted toward -Y is rx = -0.14? Let's place front edge at z_base and lift rear lip slightly!)
orange_cols = [(0.96, 0.46, 0.10, 1.0), (0.98, 0.54, 0.13, 1.0), (0.92, 0.40, 0.08, 1.0)]
lemon_cols  = [(0.96, 0.80, 0.16, 1.0), (0.92, 0.74, 0.14, 1.0), (0.98, 0.84, 0.22, 1.0)]
lime_cols   = [(0.42, 0.72, 0.22, 1.0), (0.36, 0.66, 0.18, 1.0), (0.52, 0.78, 0.24, 1.0)]
leaf_col    = (0.24, 0.58, 0.20, 1.0)

def add_citrus_crate(cx, cy, fruit_pal, scale_f=(1.0, 1.0, 1.0), is_lemon=False):
    # Crate base centered cleanly on deck z=0.895 with slight 8-deg forward tilt toward -Y front
    tilt = 0.14
    z0 = 0.945
    rot_m = Euler((tilt, 0.0, 0.0), "XYZ").to_matrix().to_4x4()
    anchor = Vector((cx, cy, z0))
    def place_part(lx, ly, lz, sx, sy, sz, m_idx, col, bev=0.004):
        p = anchor + (rot_m @ Vector((lx, ly, lz)))
        add_box(p, (sx, sy, sz), m_idx, col, bevel=bev, rot=(tilt, 0.0, 0.0))

    # Crate bottom, front/back walls, left/right walls & warm burlap liner
    place_part(0.0, 0.0, -0.025, 0.46, 0.36, 0.020, 0, (0.92, 0.88, 0.82, 1.0))
    place_part(0.0, -0.17, 0.025, 0.46, 0.022, 0.095, 0, (0.86, 0.81, 0.76, 1.0))
    place_part(0.0, +0.17, 0.025, 0.46, 0.022, 0.095, 0, (0.86, 0.81, 0.76, 1.0))
    place_part(-0.22, 0.0, 0.025, 0.022, 0.33, 0.095, 0, (0.82, 0.77, 0.72, 1.0))
    place_part(+0.22, 0.0, 0.025, 0.022, 0.33, 0.095, 0, (0.82, 0.77, 0.72, 1.0))
    place_part(0.0, 0.0, 0.002, 0.41, 0.31, 0.028, 4, BURLAP)

    # Stacked 2-layer citrus heap inside crate
    pts_grid = []
    for gx in (-0.13, -0.045, +0.045, +0.13):
        for gy in (-0.09, 0.0, +0.09):
            pts_grid.append((gx, gy, 0.048))
    for gx in (-0.08, 0.0, +0.08):
        for gy in (-0.045, +0.045):
            pts_grid.append((gx, gy, 0.100))
    for i, (fx, fy, fz) in enumerate(pts_grid):
        jx = fx + rng.uniform(-0.008, 0.008)
        jy = fy + rng.uniform(-0.008, 0.008)
        world_p = anchor + (rot_m @ Vector((jx, jy, fz)))
        col = fruit_pal[i % len(fruit_pal)]
        sc = (scale_f[0] * (1.28 if is_lemon else 1.0), scale_f[1], scale_f[2])
        add_ball(world_p, 0.044, sc, 3, col, 2)
        if i % 3 == 0:
            add_box(world_p + Vector((0.015, 0.0, 0.036)), (0.030, 0.014, 0.006), 3, leaf_col, bevel=0.002, rot=(0.2, 0.3, i * 0.8))

add_citrus_crate(-0.54, +0.02, orange_cols, (1.0, 1.0, 0.94))
add_citrus_crate(+0.01, +0.02, lemon_cols, (1.0, 0.90, 0.90), is_lemon=True)
add_citrus_crate(+0.54, +0.04, lime_cols, (0.96, 0.96, 0.92))

# Small rustic ceramic marmalade pitcher & front price chalkboard (adds storytelling & breaks boxy grid)
add_cyl((-0.78, -0.25, 0.895), (-0.78, -0.25, 0.97), 0.045, 0.056, 12, 4, TERRACOTTA_PITCHER)
add_cyl((-0.78, -0.25, 0.97), (-0.78, -0.25, 1.055), 0.056, 0.034, 12, 4, TERRACOTTA_PITCHER)
add_box((0.56, -0.27, 0.96), (0.14, 0.020, 0.12), 0, (0.86, 0.82, 0.78, 1.0), bevel=0.004, rot=(-0.24, 0.0, -0.15))
add_box((0.56, -0.276, 0.962), (0.115, 0.016, 0.095), 4, SLATE_DARK, bevel=0.002, rot=(-0.24, 0.0, -0.15))
add_box((0.56, -0.280, 0.972), (0.075, 0.010, 0.014), 4, CREAM_CHALK, bevel=0.001, rot=(-0.24, 0.0, -0.15))

# Counter corner canopy upright posts + angled timber knee braces STRICTLY underneath roof line
# Roof peak is ridge (z ~ 1.945 at y=0) sloping cleanly down to eave (z = 1.625 at y=+-0.58)
def roof_z_at(y):
    return 1.945 - 0.32 * (abs(y) / 0.58) - 0.035 * ((y / 0.58) ** 2)

POST_X = (-0.82, +0.84)
POST_Y = (-0.41, +0.41)
for px in POST_X:
    for py in POST_Y:
        top_post_z = roof_z_at(py) - 0.025
        add_box((px, py, 0.89 + (top_post_z - 0.89) * 0.5), (0.052, 0.052, top_post_z - 0.89), 0, (0.90, 0.86, 0.82, 1.0), bevel=0.007)
        # Diagonal knee braces inward along X and inward toward center along Y, capped strictly below roof_z_at
        kx = -0.22 if px > 0 else +0.22
        add_beam((px, py, top_post_z - 0.24), (px + kx, py, roof_z_at(py) - 0.035), 0.030, 0.034, 0, (0.88, 0.83, 0.78, 1.0))
        ky = -0.18 if py > 0 else +0.18
        add_beam((px, py, top_post_z - 0.22), (px, py + ky, roof_z_at(py + ky) - 0.045), 0.030, 0.034, 0, (0.88, 0.83, 0.78, 1.0))

# Rafters running along Y from front eave (-0.58) through ridge (0) to back eave (+0.58) STRICTLY below canopy surface
for rx in (-0.82, -0.27, +0.29, +0.84):
    add_beam((rx, -0.56, roof_z_at(-0.56) - 0.036), (rx, 0.0, roof_z_at(0.0) - 0.042), 0.030, 0.034, 0, (0.88, 0.84, 0.80, 1.0))
    add_beam((rx, +0.56, roof_z_at(+0.56) - 0.036), (rx, 0.0, roof_z_at(0.0) - 0.042), 0.030, 0.034, 0, (0.88, 0.84, 0.80, 1.0))
# Longitudinal ridge purlin & eave purlins safely below canvas
add_beam((-0.84, 0.0, roof_z_at(0.0) - 0.045), (+0.86, 0.0, roof_z_at(0.0) - 0.045), 0.034, 0.038, 0, (0.88, 0.84, 0.80, 1.0))
for ey in (-0.54, +0.54):
    add_beam((-0.84, ey, roof_z_at(ey) - 0.036), (+0.86, ey, roof_z_at(ey) - 0.036), 0.028, 0.032, 0, (0.88, 0.84, 0.80, 1.0))

# Draped tangerine-and-cream 7-stripe awning canopy (exact D=1.25 from y=-0.625..+0.625)
NX, NY = 28, 16
top_grid, bot_grid = {}, {}
thick_c = 0.020
for ix in range(NX + 1):
    u_x = ix / NX
    xw = -0.94 + u_x * 1.90  # overhangs cart counter symmetrically (-0.94..+0.96)
    for iy in range(NY + 1):
        v_y = iy / NY
        yw = -0.625 + v_y * 1.250
        zw = roof_z_at(yw) + 0.008 * math.cos(u_x * math.pi * 7.0)
        # Drop scalloped vertical valance curtain cleanly along front (v_y=0) and back (v_y=1)
        top_grid[(ix, iy)] = bm.verts.new(Vector((xw, yw, zw)))
        bot_grid[(ix, iy)] = bm.verts.new(Vector((xw, yw, zw - thick_c)))

def assign_canvas_uv(f, grid_keys, is_valance=False):
    f.material_index = 1
    f.smooth = True
    for loop, (ix, iy) in zip(f.loops, grid_keys):
        loop[vc_layer] = WHITE
        ux = ix / NX
        vy = 0.03 if is_valance else (0.14 + 0.84 * (iy / NY))
        loop[uv_layer].uv = (ux, vy)

for ix in range(NX):
    for iy in range(NY):
        quad = [(ix, iy), (ix + 1, iy), (ix + 1, iy + 1), (ix, iy + 1)]
        ft = bm.faces.new([top_grid[k] for k in quad])
        fb = bm.faces.new([bot_grid[k] for k in reversed(quad)])
        assign_canvas_uv(ft, quad)
        assign_canvas_uv(fb, list(reversed(quad)))

# Close 4 perimeter edges of awning roof & add continuous front+back scalloped valances
for ix in range(NX):
    # Front eave valance drape (dropping down 0.14m below y=-0.625)
    for edge_y, sign_y in [(0, -1), (NY, +1)]:
        yv = -0.625 if edge_y == 0 else +0.625
        u0, u1 = ix / NX, (ix + 1) / NX
        x0, x1 = -0.94 + u0 * 1.90, -0.94 + u1 * 1.90
        z0, z1 = roof_z_at(yv) - 0.01, roof_z_at(yv) - 0.01
        sc0 = 0.125 + 0.035 * abs(math.sin(u0 * math.pi * 7.0))
        sc1 = 0.125 + 0.035 * abs(math.sin(u1 * math.pi * 7.0))
        va = bm.verts.new(Vector((x0, yv, z0)))
        vb = bm.verts.new(Vector((x1, yv, z1)))
        vc_v = bm.verts.new(Vector((x1, yv + sign_y * 0.008, z1 - sc1)))
        vd = bm.verts.new(Vector((x0, yv + sign_y * 0.008, z0 - sc0)))
        fv = bm.faces.new((va, vb, vc_v, vd) if edge_y == 0 else (vb, va, vd, vc_v))
        fv.material_index = 1
        fv.smooth = True
        for loop, uv_p in zip(fv.loops, [(u0, 0.12), (u1, 0.12), (u1, 0.015), (u0, 0.015)] if edge_y == 0 else [(u1, 0.12), (u0, 0.12), (u0, 0.015), (u1, 0.015)]):
            loop[vc_layer] = WHITE
            loop[uv_layer].uv = uv_p
        # Back face of valance so opaque from underneath
        va2 = bm.verts.new(Vector((x0, yv - sign_y * 0.012, z0)))
        vb2 = bm.verts.new(Vector((x1, yv - sign_y * 0.012, z1)))
        vc2 = bm.verts.new(Vector((x1, yv - sign_y * 0.004, z1 - sc1)))
        vd2 = bm.verts.new(Vector((x0, yv - sign_y * 0.004, z0 - sc0)))
        fbv = bm.faces.new((vb2, va2, vd2, vc2) if edge_y == 0 else (va2, vb2, vc2, vd2))
        fbv.material_index = 1
        fbv.smooth = True
        for loop in fbv.loops:
            loop[vc_layer] = (0.94, 0.90, 0.85, 1.0)
            loop[uv_layer].uv = ((u0 + u1) * 0.5, 0.05)

# Close left & right gable canvas edges (ix=0 and ix=NX)
for ix, rev in [(0, False), (NX, True)]:
    for iy in range(NY):
        k0, k1 = (ix, iy), (ix, iy + 1)
        verts_side = [top_grid[k1], top_grid[k0], bot_grid[k0], bot_grid[k1]] if not rev else [top_grid[k0], top_grid[k1], bot_grid[k1], bot_grid[k0]]
        fs = bm.faces.new(verts_side)
        fs.material_index = 1
        for loop in fs.loops:
            loop[vc_layer] = WHITE
            loop[uv_layer].uv = (ix / NX, 0.04)

# Brass finials rising along roof ridge ends (-0.90 and +0.92 at y=0 -> exact maxZ = 2.0500)
for fx in (-0.82, +0.84):
    fz = roof_z_at(0.0) + 0.008
    add_cyl((fx, 0.0, fz), (fx, 0.0, fz + 0.032), 0.022, 0.016, 12, 2, BRASS_GOLD)
    add_ball((fx, 0.0, fz + 0.064), 0.034, (1.0, 1.0, 1.08), 2, BRASS_GOLD, 2)
    # Peak spire tip hits exact 2.0500
    add_cyl((fx, 0.0, fz + 0.088), (fx, 0.0, 2.0500), 0.011, 0.002, 8, 2, BRASS_GOLD)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Market citrus striped awning cart")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Market citrus striped awning cart", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_WOOD, MAT_CANVAS, MAT_METAL, MAT_PRODUCE, MAT_MISC):
    obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "MARKET_CART_V1",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "market-cart.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "market-cart.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
