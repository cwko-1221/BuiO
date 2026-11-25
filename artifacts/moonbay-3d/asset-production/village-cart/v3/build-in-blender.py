"""Build Moonbay Pine Village Mint-Striped Herbal & Bakery Cart (village-cart v2):
Artisan Pine Village market cart harmonizing with honey-oak cottages & #86cabc mint stripes:
- 4 circular 8-spoked wrought-iron & honey-oak carriage wheels grounded gently for grassy slopes (minZ=-0.022m)
- Slatted undercarriage & lower storage shelf with woven hamper + burlapped flour sack visible beneath slightly lifted skirt
- Chamfered paneled wainscot cabinet with cream rails, corner brass bolts & rear vendor cabinet trim with bronze latch plates
- Steam-bent ash push handle (-X) & folding oak flower-prep shelf (+X) on carved oak knee-brackets + bronze hinge straps
- 3 tilted produce crates: terracotta potted blooms w/ leaf blades, diagonally scored bread loaves, leaf-sprigged orchard apples
- Copper watering pitcher, honey/berry jars, miniature framed chalkboard
- Explicitly outward-oriented double-sided striped canvas awning (parallel triangles + closed edges + double-sided scalloped valance + oak corner braces + brass finials).
Matches ASSETS['village-cart'].size = [2.45, 1.26, 2.10].
"""
import math
import random
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(202611259)


def make_packed_image(name, w, h, rgba_array, colorspace="sRGB"):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba_array.ravel())
    out_file = (out_dir / f"{name}.png").resolve()
    img.filepath_raw = str(out_file)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX
rng_np = np.random.default_rng(202611259)

# 1. Straight Linear Country Honey-Oak Texture
col_noise = rng_np.normal(0.0, 1.0, H_TX).astype(np.float32)
k_row = np.array([0.16, 0.22, 0.24, 0.22, 0.16], dtype=np.float32)
row_smooth = np.convolve(np.pad(col_noise, 2, mode="wrap"), k_row, mode="valid")
deflect = 0.004 * np.sin(u * 4.5 * math.pi + v * 3.0)
idx_v = np.clip(((v + deflect) % 1.0 * H_TX).astype(np.int32), 0, H_TX - 1)
fibers = row_smooth[idx_v] * 0.20

grain = (
    0.58
    + fibers * 0.35
    + 0.07 * np.sin(v * 58.0 * math.pi + np.sin(u * 3.0 * math.pi) * 0.4)
    + 0.05 * np.cos(u * 18.0 + v * 28.0)
)
tone = np.clip(0.84 + 0.16 * grain, 0.65, 1.02)

wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
wood_rgba[..., 0] = np.clip(0.62 * tone, 0.0, 1.0)
wood_rgba[..., 1] = np.clip(0.41 * tone, 0.0, 1.0)
wood_rgba[..., 2] = np.clip(0.22 * tone, 0.0, 1.0)
wood_img = make_packed_image("village-cart-wood", W_TX, H_TX, wood_rgba, "sRGB")

w_rough = np.ones((H_TX, W_TX, 4), dtype=np.float32)
wr = np.clip(0.76 - 0.14 * grain, 0.54, 0.88)
w_rough[..., 0] = wr
w_rough[..., 1] = wr
w_rough[..., 2] = wr
wood_rough_img = make_packed_image("village-cart-rough", W_TX, H_TX, w_rough, "Non-Color")

# 2. Woven Mint-Sage & Linen-Cream Striped Awning Texture (#86cabc harmonized)
weave = 0.028 * np.sin(xx * 1.45) * np.sin(yy * 1.45) + 0.016 * np.sin(xx * 0.40 + yy * 0.36)
stripe_phase = (u * 7.0) % 2.0
is_mint = stripe_phase < 1.0
seam = np.exp(-((np.minimum(stripe_phase % 1.0, 1.0 - (stripe_phase % 1.0))) * 28.0) ** 2)
hem = np.exp(-((np.maximum(0.0, 0.11 - v) / 0.11) ** 2))

mint_rgb = np.array([0.36, 0.72, 0.63], dtype=np.float32)
cream_rgb = np.array([0.96, 0.92, 0.80], dtype=np.float32)
canvas_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
for c in range(3):
    base = np.where(is_mint, mint_rgb[c], cream_rgb[c])
    base = np.where(v < 0.068, cream_rgb[c] * 0.96, base)
    shaded = base * (1.0 + weave - 0.10 * seam - 0.06 * hem)
    canvas_rgba[..., c] = np.clip(shaded, 0.0, 1.0)
canvas_img = make_packed_image("village-cart-canvas", W_TX, H_TX, canvas_rgba, "sRGB")


def make_tex_mat(name, img, rough_img=None, rough_const=0.72, spec=0.30):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = spec
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
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
    if rough_img is not None:
        tr = nt.nodes.new("ShaderNodeTexImage")
        tr.image = rough_img
        tr.location = (-460, -240)
        nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = rough_const
    return mat


def make_vcol_mat(name, rough, metal=0.0, spec=0.38):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Specular IOR Level"].default_value = spec
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-240, 180)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


MAT_WOOD = make_tex_mat("VillageCartWood", wood_img, rough_img=wood_rough_img, spec=0.32)
MAT_CANVAS = make_tex_mat("VillageCartMintLinen", canvas_img, rough_const=0.80, spec=0.16)
MAT_METAL = make_vcol_mat("VillageCartHardware", rough=0.38, metal=0.72, spec=0.50)
MAT_WARES = make_vcol_mat("VillageCartWares", rough=0.48, spec=0.36)
MAT_MISC = make_vcol_mat("VillageCartMisc", rough=0.78, spec=0.22)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
BRONZE_IRON = (0.34, 0.26, 0.19, 1.0)
BRASS_GOLD = (0.86, 0.67, 0.28, 1.0)
OAK_CREAM = (0.94, 0.88, 0.74, 1.0)
BURLAP = (0.84, 0.74, 0.54, 1.0)
WICKER = (0.76, 0.56, 0.30, 1.0)
SLATE_DARK = (0.18, 0.22, 0.24, 1.0)
CREAM_CHALK = (0.94, 0.90, 0.78, 1.0)
COPPER_CAN = (0.78, 0.42, 0.22, 1.0)


def paint_faces(faces, mat_idx, col, uv_fn=None, smooth_mode=True, recalc=True):
    if recalc and faces:
        bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            if uv_fn is not None:
                loop[uv_layer].uv = uv_fn(loop.vert.co)
            else:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x * 0.6 + 0.5) % 1.0, (co.y * 0.45 + co.z * 0.65) % 1.0)


def orient_tri(v0, v1, v2, target_n):
    n = (v1.co - v0.co).cross(v2.co - v0.co)
    if n.length > 1e-10 and n.dot(target_n) < 0.0:
        return bm.faces.new((v0, v2, v1))
    return bm.faces.new((v0, v1, v2))


def orient_quad(v0, v1, v2, v3, target_n):
    n = (v1.co - v0.co).cross(v2.co - v0.co)
    if n.length > 1e-10 and n.dot(target_n) < 0.0:
        return bm.faces.new((v0, v3, v2, v1))
    return bm.faces.new((v0, v1, v2, v3))


def add_box(center, size, mat_idx, col=WHITE, bevel=0.008, rot=(0.0, 0.0, 0.0), smooth_mode=True):
    sx, sy, sz = size
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    mat = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1.0))
    bmesh.ops.transform(bm, matrix=mat, verts=verts)
    faces = [f for f in bm.faces if f not in before]
    if bevel > 0.0:
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    faces = [f for f in bm.faces if f not in before]
    paint_faces(faces, mat_idx, col, smooth_mode=smooth_mode)
    return verts


def add_cyl(p0, p1, r0, r1, segs, mat_idx, col=WHITE, cap=True, smooth_mode=True):
    p0v, p1v = Vector(p0), Vector(p1)
    vec = p1v - p0v
    if vec.length < 1e-5:
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
    paint_faces(faces, mat_idx, col, smooth_mode=smooth_mode)


def add_beam(p0, p1, w_beam, h_beam, mat_idx, col=WHITE, bevel=0.004):
    p0v, p1v = Vector(p0), Vector(p1)
    mid = (p0v + p1v) * 0.5
    vec = p1v - p0v
    L = vec.length
    q = Vector((1, 0, 0)).rotation_difference(vec.normalized())
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(mid) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((L, w_beam, h_beam, 1.0)),
        verts=verts,
    )
    faces = [f for f in bm.faces if f not in before]
    if bevel > 0:
        edges = list({e for f in faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    faces = [f for f in bm.faces if f not in before]
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


def add_ball(center, rad, scale_xyz, mat_idx, col, subdiv=2, rot=(0.0, 0.0, 0.0)):
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=rad)["verts"]
    mat = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*scale_xyz, 1.0))
    bmesh.ops.transform(bm, matrix=mat, verts=verts)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)


def add_carriage_wheel(center_x, side_y, cz, r_outer, rim_depth):
    """8-spoked honey-oak & forged-bronze carriage wheel centered at (center_x, side_y, cz)."""
    n_maj = 28
    r_in_wood = r_outer - 0.044
    r_tire_in = r_outer - 0.015
    w_half = rim_depth * 0.5
    sign_y = 1.0 if side_y > 0 else -1.0

    for r_in, r_out, y_h, m_idx, col in [
        (r_in_wood, r_tire_in, w_half, 0, (0.94, 0.90, 0.84, 1.0)),
        (r_tire_in, r_outer, w_half + 0.0025, 2, BRONZE_IRON),
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

    for k in range(8):
        ang = 2.0 * math.pi * k / 8.0 + math.pi / 16.0
        p0 = Vector((center_x + math.cos(ang) * 0.036, side_y, cz + math.sin(ang) * 0.036))
        p1 = Vector((center_x + math.cos(ang) * (r_in_wood + 0.006), side_y, cz + math.sin(ang) * (r_in_wood + 0.006)))
        add_cyl(p0, p1, 0.015, 0.011, 8, 0, (1.0, 0.96, 0.90, 1.0), cap=False)

    add_cyl((center_x, side_y - w_half * 1.15, cz), (center_x, side_y + w_half * 1.15, cz), 0.048, 0.048, 12, 0, (0.90, 0.84, 0.78, 1.0))
    add_cyl((center_x, side_y + sign_y * w_half * 1.15, cz), (center_x, side_y + sign_y * (w_half * 1.55), cz), 0.028, 0.018, 10, 2, BRASS_GOLD)


# Target Footprint: W = 2.45 (x in [-1.225, 1.225]), D = 1.26 (y in [-0.630, 0.630]), minZ = -0.022m, maxZ = 2.078m (H = 2.100m)
WHEEL_R = 0.240
WHEEL_CZ = WHEEL_R - 0.022  # minZ = -0.022m -> ~3cm turf sink in Coast3D eliminates downhill wheel gaps!
AXLE_Y = 0.500
for wx in (-0.68, +0.68):
    add_cyl((wx, -AXLE_Y, WHEEL_CZ), (wx, +AXLE_Y, WHEEL_CZ), 0.024, 0.024, 10, 2, BRONZE_IRON)
    add_box((wx, 0.0, WHEEL_CZ + 0.056), (0.08, 0.86, 0.075), 0, (0.92, 0.88, 0.82, 1.0), bevel=0.006)
    for wy in (-AXLE_Y, +AXLE_Y):
        add_carriage_wheel(wx, wy, WHEEL_CZ, WHEEL_R, 0.056)

# Slatted Undercarriage Frame & Lower Storage Deck (z = 0.30 .. 0.38)
for sx in (-0.90, +0.92):
    add_box((sx, -0.40, 0.365), (0.06, 0.06, 0.14), 0, (0.94, 0.89, 0.82, 1.0), bevel=0.006)
    add_box((sx, +0.40, 0.365), (0.06, 0.06, 0.14), 0, (0.94, 0.89, 0.82, 1.0), bevel=0.006)
for y_rail in (-0.41, +0.41):
    add_box((0.01, y_rail, 0.335), (1.88, 0.055, 0.052), 0, (0.94, 0.90, 0.84, 1.0), bevel=0.005)
for i in range(6):
    sy = -0.32 + i * (0.64 / 5.0)
    add_box((0.01, sy, 0.352), (1.76, 0.095, 0.024), 0, (0.98, 0.94, 0.88, 1.0), bevel=0.004)

# Main Country-Cottage Paneled Cart Body (z in [0.40, 0.86] - slightly higher reveal for under-shelf goods)
for sx in (-0.91, +0.93):
    for sy in (-0.42, +0.42):
        add_box((sx, sy, 0.630), (0.075, 0.075, 0.455), 0, (0.90, 0.85, 0.78, 1.0), bevel=0.008)
        for zb in (0.455, 0.79):
            add_ball((sx + (0.038 if sx > 0 else -0.038), sy + (0.038 if sy > 0 else -0.038), zb), 0.011, (1, 1, 1), 2, BRASS_GOLD, 1)

add_box((0.01, 0.0, 0.630), (1.80, 0.82, 0.42), 0, (0.84, 0.80, 0.75, 1.0), bevel=0.004)
for side_y in (-0.435, +0.435):
    for i in range(12):
        px = -0.82 + (i + 0.5) * (1.66 / 12.0)
        tint = 0.96 + 0.05 * ((i * 5) % 3 - 1)
        add_box((px, side_y, 0.630), (0.120, 0.026, 0.375), 0, (tint, tint * 0.97, tint * 0.92, 1.0), bevel=0.004)
    # Country cream trim molding rails matching village-fence posts
    add_box((0.01, side_y, 0.432), (1.76, 0.038, 0.046), 4, OAK_CREAM, bevel=0.005)
    add_box((0.01, side_y, 0.815), (1.76, 0.038, 0.046), 4, OAK_CREAM, bevel=0.005)

# Rear Vendor Locker Molding (+Y side) with double-door stile & brass latches
add_box((0.01, +0.448, 0.630), (0.045, 0.022, 0.34), 4, OAK_CREAM, bevel=0.004)
for lx in (-0.06, +0.08):
    add_box((lx, +0.456, 0.65), (0.028, 0.014, 0.050), 2, BRASS_GOLD, bevel=0.003)

for end_x in (-0.925, +0.945):
    for j in range(5):
        py = -0.34 + (j + 0.5) * (0.68 / 5.0)
        tint = 0.97 + 0.04 * ((j * 3) % 3 - 1)
        add_box((end_x, py, 0.630), (0.026, 0.118, 0.375), 0, (tint, tint * 0.97, tint * 0.92, 1.0), bevel=0.004)
    add_box((end_x, 0.0, 0.432), (0.038, 0.78, 0.046), 4, OAK_CREAM, bevel=0.005)
    add_box((end_x, 0.0, 0.815), (0.038, 0.78, 0.046), 4, OAK_CREAM, bevel=0.005)

# Planked Countertop Deck (z = 0.855 .. 0.910m)
for k in range(5):
    cy = -0.40 + k * 0.20
    tint = 0.97 + 0.03 * (k % 2)
    add_box((0.01, cy, 0.882), (1.96, 0.188, 0.052), 0, (tint, tint * 0.98, tint * 0.94, 1.0), bevel=0.008)

# Steam-Bent Ash Push Handle (-X reaching exact minX = -1.225m!)
for py in (-0.32, +0.32):
    handle_pts = [
        Vector((-0.92, py, 0.79)),
        Vector((-1.05, py, 0.83)),
        Vector((-1.15, py, 0.91)),
        Vector((-1.207, py, 0.98)),
    ]
    add_tube(handle_pts, 0.018, 0, (1.02, 0.96, 0.88, 1.0), segs=10)
    add_ball((-0.93, py, 0.79), 0.024, (1, 1, 1), 2, BRASS_GOLD, 1)
add_cyl((-1.207, -0.34, 0.98), (-1.207, +0.34, 0.98), 0.018, 0.018, 12, 4, OAK_CREAM)

# Folding Side Flower-Prep Shelf (+X reaching exact maxX = +1.225m -> W = 2.450m!)
# Warm Honey-Oak Knee Brackets + Brushed Bronze Hinges (replaces dark stark bars!)
add_box((1.095, 0.0, 0.840), (0.26, 0.72, 0.036), 0, (0.98, 0.94, 0.88, 1.0), bevel=0.006)
for sy in (-0.25, +0.25):
    add_beam((0.96, sy, 0.67), (1.16, sy, 0.822), 0.026, 0.030, 0, (0.94, 0.89, 0.82, 1.0), bevel=0.004)
    add_box((0.970, sy, 0.832), (0.028, 0.036, 0.022), 2, BRONZE_IRON, bevel=0.003)

# Woven Wicker Basket & Tied Flour Sack on lower storage shelf
add_cyl((-0.38, -0.06, 0.365), (-0.38, -0.06, 0.56), 0.145, 0.190, 14, 4, WICKER)
add_cyl((-0.38, -0.06, 0.555), (-0.38, -0.06, 0.585), 0.198, 0.198, 14, 4, (0.64, 0.44, 0.22, 1.0))
add_ball((0.28, 0.05, 0.42), 0.120, (1.65, 1.15, 0.62), 4, BURLAP, 2)

# --- Distinct Pine Village Wares on Countertop (z = 0.91m): Floral Crates, Artisan Loaves & Berries ---
def build_crate_shell(anchor, tilt):
    rot_m = Euler((tilt, 0.0, 0.0), "XYZ").to_matrix().to_4x4()
    def place(lx, ly, lz, sx, sy, sz, m_idx, col, bev=0.004):
        p = anchor + (rot_m @ Vector((lx, ly, lz)))
        add_box(p, (sx, sy, sz), m_idx, col, bevel=bev, rot=(tilt, 0.0, 0.0))

    place(0.0, 0.0, -0.025, 0.48, 0.38, 0.020, 0, (0.94, 0.90, 0.84, 1.0))
    place(0.0, -0.18, 0.025, 0.48, 0.022, 0.095, 0, (0.88, 0.83, 0.78, 1.0))
    place(0.0, +0.18, 0.025, 0.48, 0.022, 0.095, 0, (0.88, 0.83, 0.78, 1.0))
    place(-0.23, 0.0, 0.025, 0.022, 0.35, 0.095, 0, (0.84, 0.79, 0.74, 1.0))
    place(+0.23, 0.0, 0.025, 0.022, 0.35, 0.095, 0, (0.84, 0.79, 0.74, 1.0))
    place(0.0, 0.0, 0.002, 0.43, 0.33, 0.026, 4, BURLAP)
    return rot_m


# Crate 1 (Left x=-0.56): Potted Lavender, Daisies & Rim-Capped Terracotta Pots w/ Leaf Blades
a1 = Vector((-0.56, 0.02, 0.958))
r1 = build_crate_shell(a1, 0.12)
pot_clay_col = (0.82, 0.44, 0.25, 1.0)
for px, py, bloom_col, tall in [
    (-0.12, -0.06, (0.58, 0.40, 0.82, 1.0), True),
    (+0.02, -0.05, (0.48, 0.72, 0.96, 1.0), False),
    (+0.14, -0.06, (0.98, 0.95, 0.84, 1.0), True),
    (-0.06, +0.08, (0.96, 0.62, 0.72, 1.0), False),
    (+0.09, +0.08, (0.62, 0.42, 0.86, 1.0), True),
]:
    bp = a1 + (r1 @ Vector((px, py, 0.022)))
    tp = a1 + (r1 @ Vector((px, py, 0.082)))
    tr_top = a1 + (r1 @ Vector((px, py, 0.098)))
    add_cyl(bp, tp, 0.040, 0.052, 10, 4, pot_clay_col)
    add_cyl(tp, tr_top, 0.057, 0.059, 10, 4, (0.86, 0.48, 0.29, 1.0))
    for k_leaf in range(4):
        la = k_leaf * math.pi * 0.5 + px * 5.0
        lp = a1 + (r1 @ Vector((px + math.cos(la) * 0.028, py + math.sin(la) * 0.028, 0.112)))
        add_box(lp, (0.044, 0.020, 0.008), 3, (0.20, 0.56, 0.22, 1.0), bevel=0.002, rot=(0.25 * math.sin(la), -0.25 * math.cos(la), la))
    if tall:
        for s_off in (-0.018, 0.0, +0.018):
            add_ball(a1 + (r1 @ Vector((px + s_off, py, 0.172))), 0.020, (0.85, 0.85, 1.55), 3, bloom_col, 1)
    else:
        add_ball(a1 + (r1 @ Vector((px, py, 0.144))), 0.028, (1.15, 1.15, 0.65), 3, bloom_col, 1)

# Crate 2 (Middle x=0.0): Golden Rustic Village Hearth Bread Loaves w/ Flour-Dusted Crust Scores!
a2 = Vector((0.00, 0.02, 0.958))
r2 = build_crate_shell(a2, 0.12)
loaf_gold = (0.88, 0.60, 0.24, 1.0)
loaf_warm = (0.94, 0.72, 0.34, 1.0)
for lx, ly, lz, sc, c_bread in [
    (-0.11, -0.03, 0.058, (1.45, 0.85, 0.62), loaf_gold),
    (+0.11, -0.02, 0.058, (1.40, 0.88, 0.65), loaf_warm),
    (-0.02, +0.07, 0.064, (1.75, 0.80, 0.62), loaf_gold),
    (0.00, -0.09, 0.095, (1.15, 0.82, 0.62), loaf_warm),
]:
    lp_c = a2 + (r2 @ Vector((lx, ly, lz)))
    add_ball(lp_c, 0.062, sc, 3, c_bread, 2)
    for sc_x in (-0.032, 0.0, +0.032):
        sp = a2 + (r2 @ Vector((lx + sc_x, ly, lz + 0.036)))
        add_box(sp, (0.014, 0.050 * sc[1], 0.008), 3, (0.96, 0.86, 0.64, 1.0), bevel=0.002, rot=(0.12, 0.0, 0.35))

# Crate 3 (Right x=+0.56): Plump Ruby Orchard Apples/Berries w/ Stem Leaves
a3 = Vector((+0.56, 0.04, 0.958))
r3 = build_crate_shell(a3, 0.12)
berry_cols = [(0.86, 0.22, 0.24, 1.0), (0.78, 0.18, 0.28, 1.0), (0.92, 0.30, 0.22, 1.0)]
for i, (gx, gy, gz) in enumerate(
    [(x, y, 0.052) for x in (-0.13, -0.045, 0.045, 0.13) for y in (-0.09, 0.0, 0.09)]
    + [(x, y, 0.102) for x in (-0.08, 0.0, 0.08) for y in (-0.045, 0.045)]
):
    wp = a3 + (r3 @ Vector((gx + rng.uniform(-0.007, 0.007), gy + rng.uniform(-0.007, 0.007), gz)))
    add_ball(wp, 0.044, (1.0, 1.0, 0.92), 3, berry_cols[i % 3], 2)
    if i % 2 == 0:
        add_box(wp + Vector((0.010, 0.0, 0.038)), (0.030, 0.015, 0.006), 3, (0.24, 0.60, 0.22, 1.0), bevel=0.002, rot=(0.2, 0.3, i * 0.7))

# Copper Watering Pitcher, Honey Jam Jars & Village Chalkboard on Deck
add_cyl((-0.82, -0.24, 0.910), (-0.82, -0.24, 1.01), 0.048, 0.058, 12, 2, COPPER_CAN)
add_cyl((-0.82, -0.24, 1.01), (-0.82, -0.24, 1.09), 0.058, 0.034, 12, 2, COPPER_CAN)
for jx, j_col in ((-0.76, (0.96, 0.68, 0.16, 1.0)), (-0.68, (0.82, 0.20, 0.28, 1.0))):
    add_cyl((jx, -0.32, 0.910), (jx, -0.32, 0.99), 0.030, 0.030, 10, 3, j_col)
    add_cyl((jx, -0.32, 0.99), (jx, -0.32, 1.012), 0.033, 0.030, 10, 4, OAK_CREAM)

add_box((0.58, -0.28, 0.97), (0.15, 0.020, 0.125), 0, (0.90, 0.86, 0.80, 1.0), bevel=0.004, rot=(-0.24, 0.0, -0.15))
add_box((0.58, -0.286, 0.972), (0.12, 0.016, 0.100), 4, SLATE_DARK, bevel=0.002, rot=(-0.24, 0.0, -0.15))
add_box((0.58, -0.290, 0.982), (0.08, 0.010, 0.014), 4, CREAM_CHALK, bevel=0.001, rot=(-0.24, 0.0, -0.15))

# --- Canopy Frame Posts, Recessed Rafters & Bowed Mint-and-Cream Awning ---
# Gable peak z ~ 1.973 at y=0, finials up to maxZ = 2.078m -> H = 2.100m over minZ = -0.022m!
def roof_z_at(y):
    return 1.973 - 0.32 * (abs(y) / 0.59) - 0.035 * ((y / 0.59) ** 2)


POST_X = (-0.88, +0.90)
POST_Y = (-0.41, +0.41)
for px in POST_X:
    for py in POST_Y:
        top_post_z = roof_z_at(py) - 0.025
        add_box((px, py, 0.90 + (top_post_z - 0.90) * 0.5), (0.052, 0.052, top_post_z - 0.90), 0, (0.94, 0.90, 0.84, 1.0), bevel=0.007)
        add_cyl((px, py, 0.905), (px, py, 0.928), 0.036, 0.032, 10, 2, BRASS_GOLD)
        kx = -0.22 if px > 0 else +0.22
        add_beam((px, py, top_post_z - 0.24), (px + kx, py, roof_z_at(py) - 0.035), 0.030, 0.034, 0, (0.90, 0.85, 0.78, 1.0))
        ky = -0.18 if py > 0 else +0.18
        add_beam((px, py, top_post_z - 0.22), (px, py + ky, roof_z_at(py + ky) - 0.045), 0.030, 0.034, 0, (0.90, 0.85, 0.78, 1.0))

for rx in (-0.88, -0.29, +0.30, +0.90):
    add_beam((rx, -0.56, roof_z_at(-0.56) - 0.036), (rx, 0.0, roof_z_at(0.0) - 0.042), 0.030, 0.034, 0, (0.90, 0.86, 0.80, 1.0))
    add_beam((rx, +0.56, roof_z_at(+0.56) - 0.036), (rx, 0.0, roof_z_at(0.0) - 0.042), 0.030, 0.034, 0, (0.90, 0.86, 0.80, 1.0))
add_beam((-0.90, 0.0, roof_z_at(0.0) - 0.045), (+0.92, 0.0, roof_z_at(0.0) - 0.045), 0.034, 0.038, 0, (0.90, 0.86, 0.80, 1.0))
for ey in (-0.54, +0.54):
    add_beam((-0.90, ey, roof_z_at(ey) - 0.036), (+0.92, ey, roof_z_at(ey) - 0.036), 0.028, 0.032, 0, (0.90, 0.86, 0.80, 1.0))

# Mint-and-Cream Striped Draped Awning Canopy (explicit outward parallel triangulation, NO global recalc!)
NX, NY = 28, 16
top_grid, bot_grid = {}, {}
thick_c = 0.020
for ix in range(NX + 1):
    u_x = ix / NX
    xw = -1.00 + u_x * 2.02
    for iy in range(NY + 1):
        v_y = iy / NY
        yw = -0.630 + v_y * 1.260
        zw = roof_z_at(yw) + 0.008 * math.cos(u_x * math.pi * 7.0)
        top_grid[(ix, iy)] = bm.verts.new(Vector((xw, yw, zw)))
        bot_grid[(ix, iy)] = bm.verts.new(Vector((xw, yw, zw - thick_c)))


def paint_canvas_face(f, uv_map, tint=WHITE, smooth=True):
    f.material_index = 1
    f.smooth = smooth
    for loop in f.loops:
        loop[vc_layer] = tint
        loop[uv_layer].uv = uv_map[loop.vert]


def get_uv(k):
    return (k[0] / NX, 0.14 + 0.84 * (k[1] / NY))


for ix in range(NX):
    for iy in range(NY):
        k00, k10, k11, k01 = (ix, iy), (ix + 1, iy), (ix + 1, iy + 1), (ix, iy + 1)
        slope_n = Vector((0.0, 0.54 if (iy + 0.5) > NY * 0.5 else -0.54, 1.0)).normalized()
        ft1 = orient_tri(top_grid[k00], top_grid[k10], top_grid[k11], slope_n)
        ft2 = orient_tri(top_grid[k00], top_grid[k11], top_grid[k01], slope_n)
        top_uvs = {top_grid[k]: get_uv(k) for k in (k00, k10, k11, k01)}
        paint_canvas_face(ft1, top_uvs)
        paint_canvas_face(ft2, top_uvs)

        fb1 = orient_tri(bot_grid[k00], bot_grid[k11], bot_grid[k10], -slope_n)
        fb2 = orient_tri(bot_grid[k00], bot_grid[k01], bot_grid[k11], -slope_n)
        bot_uvs = {bot_grid[k]: get_uv(k) for k in (k00, k10, k11, k01)}
        paint_canvas_face(fb1, bot_uvs, tint=(0.95, 0.92, 0.88, 1.0))
        paint_canvas_face(fb2, bot_uvs, tint=(0.95, 0.92, 0.88, 1.0))

# Closed eave & gable end edges of the main canvas membrane
for edge_y, outward_n in [(0, Vector((0, -1, 0))), (NY, Vector((0, 1, 0)))]:
    for ix in range(NX):
        vt0, vt1 = top_grid[(ix, edge_y)], top_grid[(ix + 1, edge_y)]
        vb1, vb0 = bot_grid[(ix + 1, edge_y)], bot_grid[(ix, edge_y)]
        f_edge = orient_quad(vt0, vt1, vb1, vb0, outward_n)
        uv0 = get_uv((ix, edge_y))
        uv1 = get_uv((ix + 1, edge_y))
        paint_canvas_face(f_edge, {vt0: uv0, vb0: uv0, vt1: uv1, vb1: uv1}, smooth=False)

for ix, outward_n in [(0, Vector((-1, 0, 0))), (NX, Vector((1, 0, 0)))]:
    for iy in range(NY):
        vt0, vt1 = top_grid[(ix, iy)], top_grid[(ix, iy + 1)]
        vb1, vb0 = bot_grid[(ix, iy + 1)], bot_grid[(ix, iy)]
        f_side = orient_quad(vt0, vt1, vb1, vb0, outward_n)
        side_uv = (ix / NX, 0.04)
        paint_canvas_face(f_side, {vt0: side_uv, vt1: side_uv, vb1: side_uv, vb0: side_uv}, smooth=False)

# Double-sided Scalloped Valance (closed front/back shells + bottom hem; vertex-keyed UV prevents flip/rotation!)
for ix in range(NX):
    for edge_y, sign_y in [(0, -1), (NY, +1)]:
        yv = -0.630 if edge_y == 0 else +0.630
        u0, u1 = ix / NX, (ix + 1) / NX
        x0, x1 = -1.00 + u0 * 2.02, -1.00 + u1 * 2.02
        z0 = roof_z_at(yv) - 0.010
        sc0 = 0.125 + 0.035 * abs(math.sin(u0 * math.pi * 7.0))
        sc1 = 0.125 + 0.035 * abs(math.sin(u1 * math.pi * 7.0))
        va = bm.verts.new(Vector((x0, yv, z0)))
        vb = bm.verts.new(Vector((x1, yv, z0)))
        vc_v = bm.verts.new(Vector((x1, yv + sign_y * 0.008, z0 - sc1)))
        vd = bm.verts.new(Vector((x0, yv + sign_y * 0.008, z0 - sc0)))
        fv = orient_quad(va, vb, vc_v, vd, Vector((0.0, sign_y, 0.0)))
        paint_canvas_face(fv, {va: (u0, 0.12), vb: (u1, 0.12), vc_v: (u1, 0.015), vd: (u0, 0.015)}, tint=WHITE)

        va2 = bm.verts.new(Vector((x0, yv - sign_y * 0.012, z0)))
        vb2 = bm.verts.new(Vector((x1, yv - sign_y * 0.012, z0)))
        vc2 = bm.verts.new(Vector((x1, yv - sign_y * 0.004, z0 - sc1)))
        vd2 = bm.verts.new(Vector((x0, yv - sign_y * 0.004, z0 - sc0)))
        fbv = orient_quad(va2, vb2, vc2, vd2, Vector((0.0, -sign_y, 0.0)))
        u_mid = (u0 + u1) * 0.5
        paint_canvas_face(fbv, {va2: (u_mid, 0.045), vb2: (u_mid, 0.045), vc2: (u_mid, 0.045), vd2: (u_mid, 0.045)}, tint=(0.94, 0.90, 0.85, 1.0))

        # Bottom hem cap
        f_hem = orient_quad(vd, vc_v, vc2, vd2, Vector((0.0, 0.0, -1.0)))
        paint_canvas_face(f_hem, {vd: (u_mid, 0.03), vc_v: (u_mid, 0.03), vc2: (u_mid, 0.03), vd2: (u_mid, 0.03)}, tint=OAK_CREAM, smooth=False)

# Brass Ridge Finials capping cleanly at maxZ = 2.078m -> H = 2.100m
for fx in (-0.88, +0.90):
    fz = roof_z_at(0.0) + 0.008
    add_cyl((fx, 0.0, fz), (fx, 0.0, fz + 0.032), 0.022, 0.016, 12, 2, BRASS_GOLD)
    add_ball((fx, 0.0, fz + 0.064), 0.034, (1.0, 1.0, 1.08), 2, BRASS_GOLD, 2)
    add_cyl((fx, 0.0, fz + 0.088), (fx, 0.0, 2.078), 0.011, 0.002, 8, 2, BRASS_GOLD)

mesh = bpy.data.meshes.new("village-cart")
bm.to_mesh(mesh)
bm.free()
for mat in (MAT_WOOD, MAT_CANVAS, MAT_METAL, MAT_WARES, MAT_MISC):
    mesh.materials.append(mat)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("village-cart", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"VILLAGE_CART_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} maxZ={max(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "village-cart.blend"))
glb_path = out_dir / "village-cart.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_materials="EXPORT",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
)
print(f"EXPORTED {glb_path}")
