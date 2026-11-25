"""Build Moonbay Mediterranean Terracotta Flower Pot (flower-pot v2):
Wheel-thrown Tuscan terracotta planter with kiln glaze variation, loamy mulch,
rim-clearing arched botanical foliage rosettes & mid-stem bracts, slim branching
stems, green sepal cups, and a rounded lush cottage bouquet (daisies, periwinkles,
coral blossoms, and floral buds). Zero rim poke-through.
"""
import math
import random
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
rng = random.Random(202611252)

W, D, H = 0.59, 0.59, 0.75


def make_packed_image(name, w, h, rgba_array, colorspace="sRGB"):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# Baked kiln-fired terracotta texture with subtle wheel-turning rings & limestone rim bloom
rings = 0.45 * np.sin(v * 76.0 + 0.8 * np.sin(u * 6.0 * math.pi)) + 0.30 * np.sin(v * 165.0)
clay_mottle = 0.25 * np.sin(u * 26.0 + v * 19.0) * np.cos(u * 17.0 - v * 29.0)
bloom = np.clip((v - 0.72) / 0.28, 0.0, 1.0) * (0.35 + 0.35 * np.sin(u * 22.0 + v * 14.0))
pot_tone = np.clip(0.94 + 0.07 * (rings + clay_mottle), 0.80, 1.05)

clay_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
clay_rgba[..., 0] = np.clip(0.84 * pot_tone + 0.08 * bloom, 0.0, 1.0)
clay_rgba[..., 1] = np.clip(0.45 * pot_tone + 0.14 * bloom, 0.0, 1.0)
clay_rgba[..., 2] = np.clip(0.28 * pot_tone + 0.14 * bloom, 0.0, 1.0)
clay_img = make_packed_image("flower-pot-clay", W_TX, H_TX, clay_rgba, "sRGB")

rough_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
r_val = np.clip(0.75 - 0.08 * rings + 0.10 * bloom, 0.58, 0.92)
rough_rgba[..., 0] = r_val
rough_rgba[..., 1] = r_val
rough_rgba[..., 2] = r_val
clay_rough_img = make_packed_image("flower-pot-rough", W_TX, H_TX, rough_rgba, "Non-Color")

mulch = 0.50 * np.sin(xx * 0.65 + yy * 0.52) + 0.35 * np.cos(xx * 1.18 - yy * 0.95) + 0.15 * np.sin(u * 42.0 + v * 38.0)
soil_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
s_tone = np.clip(0.88 + 0.15 * mulch, 0.62, 1.06)
soil_rgba[..., 0] = np.clip(0.32 * s_tone, 0.0, 1.0)
soil_rgba[..., 1] = np.clip(0.21 * s_tone, 0.0, 1.0)
soil_rgba[..., 2] = np.clip(0.12 * s_tone, 0.0, 1.0)
soil_img = make_packed_image("flower-pot-soil", W_TX, H_TX, soil_rgba, "sRGB")


def make_tex_mat(name, image, rough_img=None, rough_const=0.80, spec=0.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = spec
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
    if rough_img is not None:
        tr = nt.nodes.new("ShaderNodeTexImage")
        tr.image = rough_img
        tr.location = (-460, -240)
        nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = rough_const
    return mat


def make_vcol_mat(name, rough, spec=0.36):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = spec
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-240, 180)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


MAT_CLAY = make_tex_mat("PotTerracotta", clay_img, rough_img=clay_rough_img, spec=0.34)
MAT_SOIL = make_tex_mat("PotSoil", soil_img, rough_const=0.95, spec=0.10)
MAT_FOLIAGE = make_vcol_mat("PotFoliage", rough=0.58, spec=0.30)
MAT_FLOWER = make_vcol_mat("PotBlooms", rough=0.50, spec=0.38)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")
WHITE = (1.0, 1.0, 1.0, 1.0)


def paint_faces(faces, mat_idx, col, smooth_mode=False, v_height_scale=2.2):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            co = loop.vert.co
            ang = math.atan2(co.y, co.x) / (2.0 * math.pi) + 0.5
            loop[uv_layer].uv = (ang % 1.0, (co.z * v_height_scale + 0.1) % 1.0)


def add_lathe(profile_rz, segs=24, mat_idx=0, col=WHITE, smooth_mode=True):
    before = set(bm.faces)
    rings = []
    for r, z in profile_rz:
        if r <= 1e-4:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([
                bm.verts.new((r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs), z))
                for k in range(segs)
            ])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) > 1:
            for k in range(segs):
                bm.faces.new((a[0], b[(k + 1) % segs], b[k]))
        elif len(a) > 1 and len(b) == 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        elif len(a) > 1 and len(b) > 1:
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode)


def clamp_clear_of_rim(pt):
    """Guarantee foliage vertices never enter the terracotta rim lip annulus (r<=0.250, z<0.386)."""
    rad = math.hypot(pt.x, pt.y)
    # Pot rim outer radius is 0.242m and top crest is z = 0.374m
    if rad > 0.285:
        pt.x *= 0.285 / rad
        pt.y *= 0.285 / rad
        rad = 0.285
    if 0.160 <= rad <= 0.252 and pt.z < 0.386:
        pt.z = 0.386 + (0.252 - rad) * 0.15
    return pt


def add_leaf_blade(origin, azimuth, pitch, length, width, arch_lift, tip_drop, col_base, col_tip, clamp_pot=True):
    """4-station arched ovate botanical leaf with V-fold midrib and real underside offset thickness."""
    horiz = Vector((math.cos(azimuth), math.sin(azimuth), 0.0))
    fwd = Vector((math.cos(azimuth) * math.cos(pitch), math.sin(azimuth) * math.cos(pitch), math.sin(pitch))).normalized()
    side = Vector((-math.sin(azimuth), math.cos(azimuth), 0.0))
    up = fwd.cross(side).normalized()

    def make_shell(off_vec, col_scale, flip=False):
        rings = []
        # Smooth upward arch cresting around s=0.45 before drooping cleanly outside the pot lip
        stations = (
            (0.00, 0.20, 0.000),
            (0.32, 0.86, arch_lift),
            (0.68, 0.98, arch_lift * 0.65 - tip_drop * 0.35),
            (1.00, 0.00, -tip_drop),
        )
        for s_frac, w_frac, dz in stations:
            pos = origin + horiz * (length * math.cos(pitch) * s_frac) + Vector((0.0, 0.0, length * math.sin(pitch) * s_frac + dz)) + off_vec
            if clamp_pot:
                pos = clamp_clear_of_rim(pos)
            hw = width * 0.5 * w_frac
            if w_frac == 0.0:
                rings.append([bm.verts.new(pos)])
            else:
                v_l = bm.verts.new(pos - side * hw + up * (hw * 0.20))
                v_m = bm.verts.new(pos)
                v_r = bm.verts.new(pos + side * hw + up * (hw * 0.20))
                if clamp_pot:
                    for v in (v_l, v_m, v_r):
                        v.co = clamp_clear_of_rim(v.co.copy())
                rings.append([v_l, v_m, v_r])

        def leaf_face(vs, col_mix):
            f = bm.faces.new(list(reversed(vs)) if flip else vs)
            f.material_index = 2
            f.smooth = True
            for loop in f.loops:
                loop[vc_layer] = tuple(c * col_scale for c in col_mix[:3]) + (1.0,)
                loop[uv_layer].uv = (0.5, 0.5)

        for (r_a, r_b), t_col in zip(zip(rings, rings[1:]), (col_base, col_base, col_tip)):
            if len(r_b) == 1:
                leaf_face((r_a[0], r_a[1], r_b[0]), t_col)
                leaf_face((r_a[1], r_a[2], r_b[0]), t_col)
            else:
                for k in range(2):
                    leaf_face((r_a[k], r_a[k + 1], r_b[k + 1], r_b[k]), t_col)

    make_shell(Vector((0.0, 0.0, 0.0)), 1.0, flip=False)
    make_shell(-up * 0.0026, 0.80, flip=True)


def add_stem(p0, p1, r0=0.009, r1=0.006, segs=6):
    d = p1 - p0
    if d.length < 1e-4:
        return
    z_ax = d.normalized()
    ref = Vector((1, 0, 0)) if abs(z_ax.z) > 0.9 else Vector((0, 0, 1))
    x_ax = z_ax.cross(ref).normalized()
    y_ax = z_ax.cross(x_ax).normalized()
    ring0 = [bm.verts.new(p0 + (x_ax * math.cos(2 * math.pi * k / segs) + y_ax * math.sin(2 * math.pi * k / segs)) * r0) for k in range(segs)]
    ring1 = [bm.verts.new(p1 + (x_ax * math.cos(2 * math.pi * k / segs) + y_ax * math.sin(2 * math.pi * k / segs)) * r1) for k in range(segs)]
    faces = [bm.faces.new((ring0[k], ring0[(k + 1) % segs], ring1[(k + 1) % segs], ring1[k])) for k in range(segs)]
    paint_faces(faces, 2, (0.20, 0.48, 0.16, 1.0), smooth_mode=True)


def add_cupped_bloom(center, normal_dir, r_flower, n_petals, petal_col, center_col=None, with_calyx=True):
    """Add sculpted 3D cupped flower blossom with green calyx base, curved rounded petals & domed pollen center."""
    n = normal_dir.normalized()
    ref = Vector((0, 1, 0)) if abs(n.z) > 0.9 else Vector((0, 0, 1))
    u_v = n.cross(ref).normalized()
    v_v = n.cross(u_v).normalized()

    if with_calyx:
        before = set(bm.faces)
        cal_verts = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=6,
            radius1=r_flower * 0.14, radius2=r_flower * 0.34, depth=r_flower * 0.24,
        )["verts"]
        rot = Matrix((u_v, v_v, n)).transposed().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation(center - n * (r_flower * 0.08)) @ rot, verts=cal_verts)
        paint_faces([f for f in bm.faces if f not in before], 2, (0.18, 0.46, 0.16, 1.0), smooth_mode=False)

    rot_off = rng.uniform(0.0, math.pi * 0.5)
    for p in range(n_petals):
        ang = rot_off + 2.0 * math.pi * p / n_petals
        p_dir = u_v * math.cos(ang) + v_v * math.sin(ang)
        p_side = -u_v * math.sin(ang) + v_v * math.cos(ang)
        base = center + p_dir * (r_flower * 0.14)
        mid = center + p_dir * (r_flower * 0.58) + n * (r_flower * 0.15)
        shoulder = center + p_dir * (r_flower * 0.88) + n * (r_flower * 0.21)
        tip = center + p_dir * r_flower + n * (r_flower * 0.19)
        hw = r_flower * (0.46 if n_petals <= 5 else (0.36 if n_petals == 6 else 0.24))
        t_pts = [
            base - p_side * (hw * 0.34),
            base + p_side * (hw * 0.34),
            mid + p_side * (hw * 0.96),
            shoulder + p_side * (hw * 0.62),
            tip,
            shoulder - p_side * (hw * 0.62),
            mid - p_side * (hw * 0.96),
        ]
        vt = [bm.verts.new(pt) for pt in t_pts]
        vb = [bm.verts.new(pt - n * 0.005) for pt in t_pts]
        faces = [bm.faces.new(vt), bm.faces.new(list(reversed(vb)))]
        npts = len(t_pts)
        for k in range(npts):
            kn = (k + 1) % npts
            faces.append(bm.faces.new((vt[k], vt[kn], vb[kn], vb[k])))
        paint_faces(faces, 3, petal_col, smooth_mode=False)

    if center_col is not None:
        before = set(bm.faces)
        verts = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r_flower * 0.27)["verts"]
        bmesh.ops.transform(
            bm,
            matrix=Matrix.Translation(center + n * (r_flower * 0.12)) @ Matrix.Diagonal((1.0, 1.0, 0.68, 1.0)),
            verts=verts,
        )
        paint_faces([f for f in bm.faces if f not in before], 3, center_col, smooth_mode=True)


def add_flower_bud(center, normal_dir, rad, col):
    n = normal_dir.normalized()
    ref = Vector((0, 1, 0)) if abs(n.z) > 0.9 else Vector((0, 0, 1))
    u_v = n.cross(ref).normalized()
    v_v = n.cross(u_v).normalized()
    rot = Matrix((u_v, v_v, n)).transposed().to_4x4()
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot @ Matrix.Diagonal((0.85, 0.85, 1.35, 1.0)), verts=verts)
    paint_faces([f for f in bm.faces if f not in before], 3, col, smooth_mode=True)


# 1. Wheel-Thrown Terracotta Vessel (minZ = -0.015m grounded foot, outer rim = 0.242m, crest = 0.374m)
pot_profile = [
    (0.000, -0.015),
    (0.146, -0.015),
    (0.156,  0.002),
    (0.148,  0.028),  # plinth foot heel
    (0.138,  0.042),  # waist neck above foot
    (0.172,  0.142),  # tapering belly
    (0.200,  0.242),  # lower decorative cord band
    (0.208,  0.254),
    (0.202,  0.266),
    (0.210,  0.306),  # collar neck
    (0.238,  0.320),  # rolled overhanging lip collar
    (0.242,  0.348),
    (0.234,  0.374),  # top rim crest
    (0.194,  0.376),  # inner beveled lip
    (0.184,  0.335),  # interior wall down to soil
]
add_lathe(pot_profile, segs=24, mat_idx=0, col=(1.00, 0.99, 0.98, 1.0), smooth_mode=True)

# 2. Mounded Loamy Potting Soil Disk (z = 0.332 .. 0.375m)
soil_profile = [
    (0.188, 0.332),
    (0.138, 0.356),
    (0.072, 0.370),
    (0.000, 0.375),
]
add_lathe(soil_profile, segs=18, mat_idx=1, col=(0.95, 0.92, 0.88, 1.0), smooth_mode=True)

# 3. Layered Rim-Clearing Botanical Foliage Rosettes
dark_greens = [(0.16, 0.44, 0.16, 1.0), (0.19, 0.48, 0.17, 1.0), (0.22, 0.52, 0.18, 1.0)]
bright_greens = [(0.30, 0.65, 0.22, 1.0), (0.36, 0.72, 0.24, 1.0), (0.26, 0.60, 0.20, 1.0)]

# Lower outer arching skirt: arches cleanly ABOVE the terracotta rim (z > 0.39) before tipping outside r > 0.252m
n_outer = 14
for i in range(n_outer):
    ang = i * (2.0 * math.pi / n_outer) + rng.uniform(-0.09, 0.09)
    origin = Vector((0.115 * math.cos(ang), 0.115 * math.sin(ang), 0.374))
    add_leaf_blade(
        origin, ang, pitch=rng.uniform(0.32, 0.48),
        length=rng.uniform(0.175, 0.205), width=rng.uniform(0.090, 0.112),
        arch_lift=0.036, tip_drop=0.042,
        col_base=dark_greens[i % 3], col_tip=bright_greens[(i + 1) % 3], clamp_pot=True,
    )

# Mid upward-cupped foliage tier (fills transition between rim leaves & lower blossoms)
n_mid = 12
for i in range(n_mid):
    ang = (i + 0.5) * (2.0 * math.pi / n_mid) + rng.uniform(-0.10, 0.10)
    origin = Vector((0.068 * math.cos(ang), 0.068 * math.sin(ang), 0.376))
    add_leaf_blade(
        origin, ang, pitch=rng.uniform(0.76, 1.04),
        length=rng.uniform(0.155, 0.195), width=rng.uniform(0.075, 0.098),
        arch_lift=0.022, tip_drop=0.024,
        col_base=dark_greens[(i + 1) % 3], col_tip=bright_greens[(i + 2) % 3], clamp_pot=True,
    )

# Elevated mid-stem leafy bracts nestled inside the floral crown (prevents bare flower poles)
for i in range(8):
    ang = (i + 0.25) * (2.0 * math.pi / 8) + rng.uniform(-0.12, 0.12)
    origin = Vector((0.050 * math.cos(ang), 0.050 * math.sin(ang), rng.uniform(0.425, 0.465)))
    add_leaf_blade(
        origin, ang, pitch=rng.uniform(0.55, 0.95),
        length=rng.uniform(0.095, 0.125), width=rng.uniform(0.048, 0.064),
        arch_lift=0.015, tip_drop=0.018,
        col_base=bright_greens[i % 3], col_tip=bright_greens[(i + 1) % 3], clamp_pot=False,
    )

# 4. Stems + Full Rounded Cottage Bouquet (13 blossoms + 4 buds forming an organic domed crown up to ~0.73m)
bloom_specs = [
    # Upper rounded crown trio (no lone flat pancake, gently tilted outward 18-28 deg!)
    ((-0.032,  0.038, 0.688), (-0.28,  0.30, 1.00), 0.082, 10, (1.00, 0.96, 0.85, 1.0), (0.98, 0.74, 0.16, 1.0)),  # ivory daisy
    (( 0.062, -0.028, 0.668), ( 0.38, -0.20, 0.96), 0.078, 10, (0.98, 0.85, 0.32, 1.0), (0.85, 0.48, 0.12, 1.0)),  # golden daisy
    ((-0.025, -0.068, 0.652), (-0.20, -0.40, 0.94), 0.076,  6, (0.96, 0.62, 0.72, 1.0), (0.98, 0.84, 0.26, 1.0)),  # coral blossom
    (( 0.048,  0.065, 0.642), ( 0.30,  0.38, 0.94), 0.074,  5, (0.50, 0.75, 0.98, 1.0), (0.96, 0.96, 0.88, 1.0)),  # periwinkle blue

    # Mid bouquet halo (5 lush medium blossoms bridging crown and foliage)
    (( 0.118,  0.015, 0.585), ( 0.58,  0.10, 0.84), 0.070,  6, (0.98, 0.66, 0.76, 1.0), (0.98, 0.84, 0.26, 1.0)),
    ((-0.112, -0.020, 0.580), (-0.56, -0.14, 0.84), 0.070, 10, (1.00, 0.96, 0.86, 1.0), (0.98, 0.74, 0.16, 1.0)),
    (( 0.015,  0.118, 0.576), ( 0.10,  0.58, 0.84), 0.068,  5, (0.48, 0.72, 0.96, 1.0), (0.96, 0.96, 0.88, 1.0)),
    ((-0.022, -0.118, 0.568), (-0.14, -0.56, 0.84), 0.070, 10, (0.98, 0.84, 0.34, 1.0), (0.85, 0.48, 0.12, 1.0)),
    (( 0.090,  0.088, 0.556), ( 0.46,  0.44, 0.80), 0.066, 10, (1.00, 0.96, 0.86, 1.0), (0.98, 0.74, 0.16, 1.0)),

    # Lower rim-tuck accent blossoms (nestled closely above the leaves for plush dome density)
    ((-0.102,  0.082, 0.518), (-0.54,  0.42, 0.74), 0.062,  6, (0.96, 0.62, 0.72, 1.0), (0.98, 0.84, 0.26, 1.0)),
    (( 0.108, -0.088, 0.512), ( 0.56, -0.44, 0.74), 0.062,  5, (0.50, 0.75, 0.98, 1.0), (0.96, 0.96, 0.88, 1.0)),
    ((-0.126, -0.082, 0.492), (-0.64, -0.42, 0.68), 0.060,  5, (0.50, 0.75, 0.98, 1.0), (0.96, 0.96, 0.88, 1.0)),
    (( 0.008, -0.132, 0.486), ( 0.06, -0.68, 0.68), 0.060, 10, (0.98, 0.84, 0.34, 1.0), (0.85, 0.48, 0.12, 1.0)),
]
for pos_t, norm_t, rad, petals, p_col, c_col in bloom_specs:
    p_top = Vector(pos_t)
    p_base = Vector((pos_t[0] * 0.38, pos_t[1] * 0.38, 0.360))
    add_stem(p_base, p_top)
    add_cupped_bloom(p_top, Vector(norm_t), rad, petals, p_col, c_col, with_calyx=True)

# Floral buds peeking gracefully between crown blooms
bud_specs = [
    (( 0.002,  0.005, 0.715), ( 0.05,  0.06, 1.0), 0.022, (0.99, 0.95, 0.82, 1.0)),
    (( 0.122, -0.032, 0.618), ( 0.42, -0.16, 0.9), 0.020, (0.96, 0.64, 0.74, 1.0)),
    ((-0.072,  0.106, 0.610), (-0.30,  0.42, 0.9), 0.020, (0.50, 0.75, 0.98, 1.0)),
    (( 0.068,  0.118, 0.592), ( 0.28,  0.45, 0.9), 0.019, (0.98, 0.85, 0.32, 1.0)),
]
for pos_t, norm_t, rad, col in bud_specs:
    p_top = Vector(pos_t)
    p_base = Vector((pos_t[0] * 0.38, pos_t[1] * 0.38, 0.365))
    add_stem(p_base, p_top, r0=0.007, r1=0.005)
    add_flower_bud(p_top, Vector(norm_t), rad, col)

# Normalize X/Y exact to <=0.59m while preserving vertical pot grounding (-0.015 .. ~0.735)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
xs = [v.co.x for v in bm.verts]
ys = [v.co.y for v in bm.verts]
cx = 0.5 * (max(xs) + min(xs))
cy = 0.5 * (max(ys) + min(ys))
sx = 0.588 / max(1e-4, max(xs) - min(xs))
sy = 0.588 / max(1e-4, max(ys) - min(ys))
s_xy = min(1.03, sx, sy)
bmesh.ops.transform(bm, matrix=Matrix.Translation((-cx, -cy, 0.0)) @ Matrix.Diagonal((s_xy, s_xy, 1.0, 1.0)), verts=bm.verts)

mesh = bpy.data.meshes.new("flower-pot")
bm.to_mesh(mesh)
bm.free()
for m in (MAT_CLAY, MAT_SOIL, MAT_FOLIAGE, MAT_FLOWER):
    mesh.materials.append(m)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("flower-pot", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"FLOWER_POT_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} maxZ={max(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "flower-pot.blend"))
glb_path = out_dir / "flower-pot.glb"
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
