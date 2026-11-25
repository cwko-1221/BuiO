"""Build Moonbay Plaza Stone Flower Bed v2: paneled travertine trough with dense organic leaf-rosette sprays, multi-floret hydrangea umbels, and layered daisies/cosmos."""
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
rng = random.Random(20261127)

W, D, H = 2.15, 1.00, 0.64

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

strata = (
    0.45 * np.sin(v * 72.0 + 1.5 * np.sin(u * 13.0 + v * 5.0))
    + 0.30 * np.sin(u * 42.0 + v * 17.0)
    + 0.25 * np.cos(xx * 0.35) * np.sin(yy * 0.42)
)
stone_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.95 + 0.065 * strata, 0.84, 1.05)
stone_rgba[..., 0] = np.clip(0.93 * tone, 0, 1)
stone_rgba[..., 1] = np.clip(0.80 * tone, 0, 1)
stone_rgba[..., 2] = np.clip(0.62 * tone, 0, 1)
stone_img = make_packed_image("bed-stone", W_TX, H_TX, stone_rgba)

mulch = 0.50 * np.sin(xx * 0.62 + yy * 0.48) + 0.35 * np.cos(xx * 1.15 - yy * 0.92) + 0.15 * np.sin(u * 40.0 + v * 40.0)
soil_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
s_tone = np.clip(0.88 + 0.14 * mulch, 0.65, 1.06)
soil_rgba[..., 0] = np.clip(0.36 * s_tone, 0, 1)
soil_rgba[..., 1] = np.clip(0.24 * s_tone, 0, 1)
soil_rgba[..., 2] = np.clip(0.14 * s_tone, 0, 1)
soil_img = make_packed_image("bed-soil", W_TX, H_TX, soil_rgba)

def make_tex_mat(name, image, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
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

def make_vcol_mat(name, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-240, 180)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

MAT_STONE = make_tex_mat("BedLimestone", stone_img, rough=0.84)
MAT_SOIL = make_tex_mat("BedMulch", soil_img, rough=0.95)
MAT_FOLIAGE = make_vcol_mat("BedFoliage", rough=0.64)
MAT_FLOWER = make_vcol_mat("BedBlooms", rough=0.54)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
STONE_COPING = (1.03, 1.01, 0.97, 1.0)
STONE_PANEL = (0.93, 0.90, 0.86, 1.0)
STONE_PLINTH = (0.87, 0.84, 0.80, 1.0)

def paint_faces(faces, mat_idx, col, smooth_mode=False):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + 1.1) * 0.45 % 1.0, (co.y + co.z) * 0.82 % 1.0)

def add_box(center, size, mat_idx, col=WHITE, bevel=0.008, rot=(0.0, 0.0, 0.0), smooth_mode=False):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0)),
        verts=verts,
    )
    if bevel > 0.0:
        edges = list({e for v in verts for f in v.link_faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode)

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
    paint_faces(faces, mat_idx, col, smooth_mode=True)

def add_ball(center, rad, scale_xyz, mat_idx, col, subdiv=1):
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ Matrix.Diagonal((*scale_xyz, 1.0)), verts=verts)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=True)

def add_leaf_blade(anchor, yaw, pitch, length, width, col_base, col_tip):
    """Build broad curved botanical leaf spray with longitudinal midrib crease and closed solid thickness."""
    ca, sa = math.cos(yaw), math.sin(yaw)
    dir_v = Vector((ca, sa, 0.0))
    side_v = Vector((-sa, ca, 0.0))
    sp, cp = math.sin(pitch), math.cos(pitch)
    # Curved arching leaf spine profile
    pts = [
        (0.00, 0.000, width * 0.22),
        (length * 0.30 * cp, length * 0.36 * sp, width * 0.56),
        (length * 0.68 * cp, length * 0.56 * sp - 0.015, width * 0.44),
        (length * 1.00 * cp, length * 0.48 * sp - 0.048, 0.002),
    ]
    top_rings, bot_rings = [], []
    for s_idx, (df, dz, hw) in enumerate(pts):
        c = anchor + dir_v * df + Vector((0.0, 0.0, dz))
        if hw <= 0.004:
            top_rings.append([bm.verts.new(c)])
            bot_rings.append([bm.verts.new(c - Vector((0.0, 0.0, 0.003)))])
        else:
            # Raised lateral margins forming gentle trough/midrib V-crease
            t_pts = [
                c - side_v * hw + Vector((0.0, 0.0, hw * 0.14)),
                c,
                c + side_v * hw + Vector((0.0, 0.0, hw * 0.14)),
            ]
            b_pts = [p - Vector((0.0, 0.0, 0.004)) for p in t_pts]
            top_rings.append([bm.verts.new(p) for p in t_pts])
            bot_rings.append([bm.verts.new(p) for p in b_pts])
    for r in range(len(top_rings) - 1):
        ta, tb = top_rings[r], top_rings[r + 1]
        ba, bb = bot_rings[r], bot_rings[r + 1]
        col_cur = col_tip if r >= 1 else col_base
        r_faces = []
        if len(tb) == 1:
            for k in range(2):
                r_faces.append(bm.faces.new((ta[k], ta[k + 1], tb[0])))
                r_faces.append(bm.faces.new((bb[0], ba[k + 1], ba[k])))
        else:
            for k in range(2):
                r_faces.append(bm.faces.new((ta[k], ta[k + 1], tb[k + 1], tb[k])))
                r_faces.append(bm.faces.new((ba[k], bb[k], bb[k + 1], ba[k + 1])))
            r_faces.append(bm.faces.new((ta[0], tb[0], bb[0], ba[0])))
            r_faces.append(bm.faces.new((ta[2], ba[2], bb[2], tb[2])))
        paint_faces(r_faces, 2, col_cur, smooth_mode=False)

def add_petal_flower(center, normal_dir, r_flower, n_petals, petal_col, center_col=None):
    """Add sculpted multi-petal bloom (used for both daisies/cosmos and 4-petal hydrangea florets)."""
    n = normal_dir.normalized()
    ref = Vector((0, 1, 0)) if abs(n.z) > 0.9 else Vector((0, 0, 1))
    u_v = n.cross(ref).normalized()
    v_v = n.cross(u_v).normalized()
    rot_off = rng.uniform(0.0, math.pi * 0.5)
    for p in range(n_petals):
        ang = rot_off + 2.0 * math.pi * p / n_petals
        p_dir = u_v * math.cos(ang) + v_v * math.sin(ang)
        p_side = -u_v * math.sin(ang) + v_v * math.cos(ang)
        base = center + p_dir * (r_flower * 0.18)
        mid = center + p_dir * (r_flower * 0.68) + n * (r_flower * 0.08)
        tip = center + p_dir * r_flower + n * (r_flower * 0.04)
        hw = r_flower * (0.42 if n_petals == 4 else 0.24)
        t_pts = [base - p_side * (hw * 0.4), base + p_side * (hw * 0.4), mid + p_side * hw, tip, mid - p_side * hw]
        vt = [bm.verts.new(pt) for pt in t_pts]
        vb = [bm.verts.new(pt - n * 0.004) for pt in t_pts]
        faces = [bm.faces.new(vt), bm.faces.new(list(reversed(vb)))]
        for k in range(5):
            kn = (k + 1) % 5
            faces.append(bm.faces.new((vt[k], vt[kn], vb[kn], vb[k])))
        paint_faces(faces, 3, petal_col, smooth_mode=False)
    if center_col is not None:
        add_ball(center + n * (r_flower * 0.12), r_flower * 0.25, (1.0, 1.0, 0.7), 3, center_col, 1)

# 1. Grounded Carved Sandstone Planter Box (exact X [-1.075..+1.075], Y [-0.500..+0.500], minZ=0.000)
add_box((0.0, 0.0, 0.045), (2.150, 1.000, 0.090), 0, STONE_PLINTH, bevel=0.010)
add_box((0.0, 0.0, 0.105), (2.060, 0.920, 0.035), 0, STONE_PANEL, bevel=0.007)

add_box((0.0, -0.390, 0.245), (2.000, 0.120, 0.260), 0, WHITE, bevel=0.006)
add_box((0.0, +0.390, 0.245), (2.000, 0.120, 0.260), 0, WHITE, bevel=0.006)
add_box((-0.950, 0.0, 0.245), (0.120, 0.720, 0.260), 0, WHITE, bevel=0.006)
add_box((+0.950, 0.0, 0.245), (0.120, 0.720, 0.260), 0, WHITE, bevel=0.006)

for cx in (-0.985, +0.985):
    for cy in (-0.425, +0.425):
        add_box((cx, cy, 0.250), (0.140, 0.140, 0.280), 0, STONE_COPING, bevel=0.008)
for side_y in (-0.456, +0.456):
    for px in (-0.580, 0.000, +0.580):
        add_box((px, side_y, 0.248), (0.480, 0.018, 0.175), 0, STONE_PANEL, bevel=0.005)
for end_x in (-1.016, +1.016):
    add_box((end_x, 0.0, 0.248), (0.018, 0.560, 0.175), 0, STONE_PANEL, bevel=0.005)

add_box((0.0, -0.425, 0.390), (2.150, 0.150, 0.062), 0, STONE_COPING, bevel=0.010)
add_box((0.0, +0.425, 0.390), (2.150, 0.150, 0.062), 0, STONE_COPING, bevel=0.010)
add_box((-0.990, 0.0, 0.390), (0.170, 0.730, 0.062), 0, STONE_COPING, bevel=0.010)
add_box((+0.990, 0.0, 0.390), (0.170, 0.730, 0.062), 0, STONE_COPING, bevel=0.010)

# Mounded textured dark garden soil filling trough rim cleanly
add_box((0.0, 0.0, 0.365), (1.840, 0.720, 0.075), 1, WHITE, bevel=0.012)
for mx in (-0.54, 0.0, +0.54):
    add_ball((mx, 0.0, 0.378), 0.22, (1.8, 1.4, 0.22), 1, (0.95, 0.93, 0.90, 1.0), 2)

# 2. Lush Botanical Leaf Rosettes (ZERO green bowling-ball spheres! Pure layered broad foliage sprays!)
dark_greens = [(0.16, 0.44, 0.16, 1.0), (0.19, 0.48, 0.17, 1.0), (0.22, 0.52, 0.18, 1.0)]
bright_greens = [(0.28, 0.62, 0.22, 1.0), (0.34, 0.68, 0.24, 1.0), (0.25, 0.58, 0.20, 1.0)]

rosette_anchors = [
    (-0.80, -0.14), (-0.52, +0.12), (-0.24, -0.15), (+0.04, +0.13),
    (+0.34, -0.12), (+0.62, +0.13), (+0.82, -0.12), (-0.72, +0.16),
    (-0.14, +0.17), (+0.44, +0.17), (+0.12, -0.17), (-0.42, -0.02),
]
for idx, (fx, fy) in enumerate(rosette_anchors):
    # Outer broad lower arching collar of 7 pointing rosette leaves
    n_outer = 7
    for k in range(n_outer):
        ang = idx * 0.9 + k * (2.0 * math.pi / n_outer) + rng.uniform(-0.18, 0.18)
        pitch = rng.uniform(0.32, 0.58)
        length = rng.uniform(0.20, 0.27)
        # Keep foliage cleanly clear above coping rim without clipping outside footprint
        if fy + math.sin(ang) * length * 0.7 > 0.46 or fy + math.sin(ang) * length * 0.7 < -0.46:
            pitch += 0.28
        if abs(fx + math.cos(ang) * length * 0.7) > 0.98:
            pitch += 0.28
        add_leaf_blade(
            Vector((fx, fy, 0.395)),
            ang,
            pitch,
            length,
            rng.uniform(0.085, 0.115),
            dark_greens[idx % 3],
            bright_greens[(idx + k) % 3],
        )
    # Inner upright tuft of 4 younger bright foliage blades
    for k in range(4):
        ang = idx * 1.4 + k * (math.pi * 0.5) + 0.35
        add_leaf_blade(
            Vector((fx, fy, 0.405)),
            ang,
            rng.uniform(0.88, 1.15),
            rng.uniform(0.14, 0.19),
            rng.uniform(0.068, 0.088),
            dark_greens[(idx + 1) % 3],
            bright_greens[(idx + k + 1) % 3],
        )

# 3. Fluffy Blue/Periwinkle Hydrangea Umbel Florets (12 open 4-petal mini-blossoms per dome!)
hydrangea_cols = [
    (0.38, 0.62, 0.94, 1.0),
    (0.48, 0.70, 0.98, 1.0),
    (0.32, 0.54, 0.88, 1.0),
    (0.56, 0.75, 0.98, 1.0),
]
for hx, hy, hz_base in [(-0.66, -0.02, 0.510), (+0.02, +0.02, 0.525), (+0.68, -0.03, 0.508)]:
    add_cyl((hx, hy, 0.39), (hx, hy, hz_base - 0.02), 0.012, 0.010, 6, 2, dark_greens[0])
    for fi in range(13):
        theta = fi * 2.39996 + hx * 2.0
        elev = 0.025 + 0.075 * math.sqrt(fi / 12.0)
        offset_dir = Vector((math.cos(theta) * elev, math.sin(theta) * elev, 0.055 * (1.0 - fi / 18.0)))
        floret_pos = Vector((hx, hy, hz_base)) + offset_dir
        floret_n = (offset_dir + Vector((0.0, 0.0, 0.055))).normalized()
        add_petal_flower(floret_pos, floret_n, rng.uniform(0.042, 0.052), 4, hydrangea_cols[fi % 4], (0.96, 0.92, 0.72, 1.0))

# 4. Crisp Coastal Daisies, Pink Cosmos & Marigold Accent Blooms rising rhythmically cleanly to H=0.640
cream_petal = (0.98, 0.95, 0.82, 1.0)
rose_petal = (0.96, 0.60, 0.70, 1.0)
apricot_petal = (0.98, 0.72, 0.36, 1.0)
gold_center = (0.98, 0.76, 0.14, 1.0)

bloom_specs = [
    (-0.86, +0.14, 0.575, cream_petal, 0.068),
    (-0.46, -0.14, 0.612, rose_petal, 0.076),
    (-0.34, +0.15, 0.590, cream_petal, 0.068),
    (-0.18, +0.05, 0.640, cream_petal, 0.078),  # crown apex
    (+0.18, -0.16, 0.595, apricot_petal, 0.070),
    (+0.30, +0.12, 0.625, rose_petal, 0.074),
    (+0.48, -0.12, 0.585, cream_petal, 0.068),
    (+0.86, +0.12, 0.572, apricot_petal, 0.068),
    (+0.54, +0.18, 0.560, cream_petal, 0.064),
    (-0.78, -0.16, 0.555, rose_petal, 0.064),
]
for i, (bx, by, bz, p_col, r_fl) in enumerate(bloom_specs):
    stem_base = Vector((bx * 0.92, by * 0.80, 0.38))
    stem_top = Vector((bx, by, bz - 0.012))
    add_cyl(stem_base, stem_top, 0.009, 0.007, 6, 2, dark_greens[1])
    tilt_v = Vector((math.cos(i * 1.7) * 0.24, math.sin(i * 1.7) * 0.24, 1.0))
    add_petal_flower(stem_top, tilt_v, r_fl, 8, p_col, gold_center)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Moonbay carved limestone floral planter bed")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Moonbay carved limestone floral planter bed", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_STONE, MAT_SOIL, MAT_FOLIAGE, MAT_FLOWER):
    obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
scale_x = W / (hi[0] - lo[0])
scale_y = D / (hi[1] - lo[1])
scale_z = H / (hi[2] - lo[2])
mid_x = (lo[0] + hi[0]) * 0.5
mid_y = (lo[1] + hi[1]) * 0.5
for v in obj.data.vertices:
    v.co.x = (v.co.x - mid_x) * scale_x
    v.co.y = (v.co.y - mid_y) * scale_y
    v.co.z = (v.co.z - lo[2]) * scale_z

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "FLOWER_BED_V2",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "flower-bed.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "flower-bed.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
