"""Build Moonbay Mediterranean Terracotta Flower Pot (flower-pot v3):
Wheel-thrown Tuscan terracotta planter with kiln glaze variation, loamy mulch,
organic curved 6-station ovate botanical leaves (varied roll/arch/length breaking
symmetry, throat-to-tip shading, zero rim intersection), smooth cambered petals
with luminous throat-to-tip floral color gradients, smooth domed centers, and calyx cups.
"""
import math
import random
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(202611253)

W, D, H = 0.59, 0.59, 0.75


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


def make_vcol_mat(name, rough, spec=0.34):
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
MAT_FOLIAGE = make_vcol_mat("PotFoliage", rough=0.60, spec=0.28)
MAT_FLOWER = make_vcol_mat("PotBlooms", rough=0.52, spec=0.34)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")
WHITE = (1.0, 1.0, 1.0, 1.0)


def lerp_col(c0, c1, t):
    return tuple(c0[i] + (c1[i] - c0[i]) * t for i in range(4))


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


def guard_clear_of_rim(pt):
    """Safety guard: prevent foliage vertices from entering terracotta rim annulus (r<=0.250, z<0.382)."""
    rad = math.hypot(pt.x, pt.y)
    if rad > 0.285:
        pt.x *= 0.285 / rad
        pt.y *= 0.285 / rad
        rad = 0.285
    if 0.165 <= rad <= 0.250 and pt.z < 0.382:
        pt.z = 0.382 + (0.250 - rad) * 0.12
    return pt


def add_ovate_leaf(origin, azimuth, pitch, roll, bend, length, width, arch_lift, tip_drop, col_base, col_mid, col_tip, clamp_pot=True):
    """6-station smooth curved ovate botanical leaf with lateral bend, roll twist, and throat-to-tip vertex gradient."""
    horiz = Vector((math.cos(azimuth), math.sin(azimuth), 0.0))
    fwd = Vector((math.cos(azimuth) * math.cos(pitch), math.sin(azimuth) * math.cos(pitch), math.sin(pitch))).normalized()
    side_0 = Vector((-math.sin(azimuth), math.cos(azimuth), 0.0))
    up_0 = fwd.cross(side_0).normalized()
    side = (side_0 * math.cos(roll) + up_0 * math.sin(roll)).normalized()
    up = fwd.cross(side).normalized()

    # Smooth elliptical-ovate botanical blade silhouette (soft tapered rounded apex, no arrow-triangle kink)
    stations = (
        (0.00, 0.18, 0.000, col_base),
        (0.22, 0.68, arch_lift * 0.72, lerp_col(col_base, col_mid, 0.55)),
        (0.46, 0.96, arch_lift, col_mid),
        (0.70, 0.86, arch_lift * 0.55 - tip_drop * 0.30, lerp_col(col_mid, col_tip, 0.55)),
        (0.88, 0.44, -tip_drop * 0.72, lerp_col(col_mid, col_tip, 0.88)),
        (1.00, 0.06, -tip_drop, col_tip),
    )

    def make_shell(off_vec, shade_mul, flip=False):
        rings = []
        ring_cols = []
        for s_frac, w_frac, dz, s_col in stations:
            lat = bend * (s_frac ** 1.7) * length
            pos = (
                origin
                + horiz * (length * math.cos(pitch) * s_frac)
                + side_0 * lat
                + Vector((0.0, 0.0, length * math.sin(pitch) * s_frac + dz))
                + off_vec
            )
            hw = width * 0.5 * w_frac
            cup_up = hw * 0.14
            v_l = bm.verts.new(pos - side * hw + up * cup_up)
            v_m = bm.verts.new(pos)
            v_r = bm.verts.new(pos + side * hw + up * cup_up)
            if clamp_pot:
                for v in (v_l, v_m, v_r):
                    v.co = guard_clear_of_rim(v.co.copy())
            rings.append([v_l, v_m, v_r])
            ring_cols.append(tuple(c * shade_mul for c in s_col[:3]) + (1.0,))

        for idx in range(len(rings) - 1):
            ra, rb = rings[idx], rings[idx + 1]
            ca, cb = ring_cols[idx], ring_cols[idx + 1]
            c_mid_a = lerp_col(ca, cb, 0.1)
            c_mid_b = lerp_col(ca, cb, 0.9)
            for k in range(2):
                vs = (ra[k], ra[k + 1], rb[k + 1], rb[k])
                vc_list = [ca, ca, cb, cb]
                if flip:
                    vs = tuple(reversed(vs))
                    vc_list = list(reversed(vc_list))
                f = bm.faces.new(vs)
                f.material_index = 2
                f.smooth = True
                for lp, vc_val in zip(f.loops, vc_list):
                    lp[vc_layer] = vc_val
                    lp[uv_layer].uv = (0.5, 0.5)

    make_shell(Vector((0.0, 0.0, 0.0)), 1.0, flip=False)
    make_shell(-up * 0.0022, 0.78, flip=True)


def add_stem(p0, p1, r0=0.0085, r1=0.0055, segs=6):
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
    paint_faces(faces, 2, (0.18, 0.44, 0.14, 1.0), smooth_mode=True)


def add_cupped_bloom(center, normal_dir, r_flower, n_petals, throat_col, tip_col, center_col=None, with_calyx=True):
    """Smooth cambered botanical flower with 4-ring curved petals, throat-to-tip vertex gradient & smooth dome center."""
    n = normal_dir.normalized()
    ref = Vector((0, 1, 0)) if abs(n.z) > 0.9 else Vector((0, 0, 1))
    u_v = n.cross(ref).normalized()
    v_v = n.cross(u_v).normalized()

    if with_calyx:
        before = set(bm.faces)
        cal_verts = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=7,
            radius1=r_flower * 0.13, radius2=r_flower * 0.34, depth=r_flower * 0.22,
        )["verts"]
        rot = Matrix((u_v, v_v, n)).transposed().to_4x4()
        bmesh.ops.transform(bm, matrix=Matrix.Translation(center - n * (r_flower * 0.08)) @ rot, verts=cal_verts)
        paint_faces([f for f in bm.faces if f not in before], 2, (0.16, 0.42, 0.14, 1.0), smooth_mode=True)

    rot_off = rng.uniform(0.0, math.pi * 0.6)
    petal_w_mul = 0.44 if n_petals <= 5 else (0.35 if n_petals == 6 else 0.23)

    for p in range(n_petals):
        ang = rot_off + 2.0 * math.pi * p / n_petals + rng.uniform(-0.04, 0.04)
        p_dir = u_v * math.cos(ang) + v_v * math.sin(ang)
        p_side = -u_v * math.sin(ang) + v_v * math.cos(ang)
        r_var = r_flower * rng.uniform(0.94, 1.06)
        hw = r_var * petal_w_mul

        # 4 arched longitudinal stations creating organic cupped spoon curvature (smooth double-sided shell)
        p_stations = (
            (0.14, 0.34, 0.01, throat_col),
            (0.46, 0.90, 0.14, lerp_col(throat_col, tip_col, 0.48)),
            (0.82, 0.88, 0.22, lerp_col(throat_col, tip_col, 0.88)),
            (1.00, 0.26, 0.16, tip_col),
        )

        def build_petal_side(offset_n, shade_mul, flip=False):
            rings = []
            r_cols = []
            for s_rad, s_wid, s_cup, s_col in p_stations:
                pos = center + p_dir * (r_var * s_rad) + n * (r_var * s_cup + offset_n)
                w = hw * s_wid
                bowl_edge = n * (r_var * 0.03 * s_wid)
                v_l = bm.verts.new(pos - p_side * w + bowl_edge)
                v_m = bm.verts.new(pos)
                v_r = bm.verts.new(pos + p_side * w + bowl_edge)
                rings.append([v_l, v_m, v_r])
                r_cols.append(tuple(c * shade_mul for c in s_col[:3]) + (1.0,))
            for i in range(len(rings) - 1):
                ra, rb = rings[i], rings[i + 1]
                ca, cb = r_cols[i], r_cols[i + 1]
                for k in range(2):
                    vs = (ra[k], ra[k + 1], rb[k + 1], rb[k])
                    vcs = [ca, ca, cb, cb]
                    if flip:
                        vs = tuple(reversed(vs))
                        vcs = list(reversed(vcs))
                    f = bm.faces.new(vs)
                    f.material_index = 3
                    f.smooth = True
                    for lp, cval in zip(f.loops, vcs):
                        lp[vc_layer] = cval
                        lp[uv_layer].uv = (0.5, 0.5)

        build_petal_side(0.0, 1.0, flip=False)
        build_petal_side(-0.0022, 0.84, flip=True)

    if center_col is not None:
        before = set(bm.faces)
        verts = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r_flower * 0.26)["verts"]
        bmesh.ops.transform(
            bm,
            matrix=Matrix.Translation(center + n * (r_flower * 0.11)) @ Matrix.Diagonal((1.0, 1.0, 0.62, 1.0)),
            verts=verts,
        )
        # Subtle pollen dome shading: warmer darker ring base -> sunny golden apex
        for f in [f for f in bm.faces if f not in before]:
            f.material_index = 3
            f.smooth = True
            for lp in f.loops:
                rel = (lp.vert.co - center).dot(n) / max(1e-4, r_flower * 0.25)
                t = max(0.0, min(1.0, rel * 0.85))
                lp[vc_layer] = lerp_col(tuple(c * 0.72 for c in center_col[:3]) + (1.0,), center_col, t)
                lp[uv_layer].uv = (0.5, 0.5)


def add_flower_bud(center, normal_dir, rad, col):
    n = normal_dir.normalized()
    ref = Vector((0, 1, 0)) if abs(n.z) > 0.9 else Vector((0, 0, 1))
    u_v = n.cross(ref).normalized()
    v_v = n.cross(u_v).normalized()
    rot = Matrix((u_v, v_v, n)).transposed().to_4x4()
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot @ Matrix.Diagonal((0.82, 0.82, 1.32, 1.0)), verts=verts)
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

# 2. Mounded Loamy Potting Soil Disk (z = 0.332 .. 0.376m)
soil_profile = [
    (0.188, 0.332),
    (0.138, 0.356),
    (0.072, 0.370),
    (0.000, 0.376),
]
add_lathe(soil_profile, segs=18, mat_idx=1, col=(0.95, 0.92, 0.88, 1.0), smooth_mode=True)

# 3. Organic Assorted Foliage Crown (broken symmetry, smooth ovate blades, shaded forest->sun green)
base_greens = [(0.11, 0.33, 0.12, 1.0), (0.13, 0.37, 0.13, 1.0), (0.14, 0.39, 0.14, 1.0)]
mid_greens = [(0.19, 0.50, 0.18, 1.0), (0.22, 0.54, 0.19, 1.0), (0.18, 0.46, 0.16, 1.0)]
tip_greens = [(0.30, 0.64, 0.22, 1.0), (0.34, 0.68, 0.23, 1.0), (0.27, 0.58, 0.20, 1.0)]

# Outer organic draping leaves: varied lengths, uneven azimuthal clustering, lifted origins (0.382..0.396m) so curves remain natural above rim
n_outer = 13
for i in range(n_outer):
    ang = i * (2.0 * math.pi / n_outer) + rng.uniform(-0.22, 0.22)
    r_org = rng.uniform(0.095, 0.132)
    z_org = rng.uniform(0.382, 0.396)
    origin = Vector((r_org * math.cos(ang), r_org * math.sin(ang), z_org))
    add_ovate_leaf(
        origin, ang,
        pitch=rng.uniform(0.28, 0.54),
        roll=rng.uniform(-0.24, 0.24),
        bend=rng.uniform(-0.14, 0.14),
        length=rng.uniform(0.145, 0.205),
        width=rng.uniform(0.072, 0.102),
        arch_lift=rng.uniform(0.024, 0.042),
        tip_drop=rng.uniform(0.032, 0.062),
        col_base=base_greens[i % 3], col_mid=mid_greens[(i + 1) % 3], col_tip=tip_greens[(i + 2) % 3],
        clamp_pot=True,
    )

# Mid tier ascending cottage leaves (pitch 0.70..1.05, overlapping rim gap naturally)
n_mid = 12
for i in range(n_mid):
    ang = (i + 0.45) * (2.0 * math.pi / n_mid) + rng.uniform(-0.20, 0.20)
    origin = Vector((rng.uniform(0.052, 0.085) * math.cos(ang), rng.uniform(0.052, 0.085) * math.sin(ang), rng.uniform(0.378, 0.392)))
    add_ovate_leaf(
        origin, ang,
        pitch=rng.uniform(0.68, 1.02),
        roll=rng.uniform(-0.22, 0.22),
        bend=rng.uniform(-0.12, 0.12),
        length=rng.uniform(0.135, 0.185),
        width=rng.uniform(0.065, 0.090),
        arch_lift=rng.uniform(0.018, 0.028),
        tip_drop=rng.uniform(0.015, 0.030),
        col_base=base_greens[(i + 1) % 3], col_mid=mid_greens[(i + 2) % 3], col_tip=tip_greens[i % 3],
        clamp_pot=True,
    )

# Inner mid-stem leafy bracts nestled among stems (z ~ 0.43..0.48m)
for i in range(8):
    ang = (i + 0.25) * (2.0 * math.pi / 8) + rng.uniform(-0.20, 0.20)
    origin = Vector((0.045 * math.cos(ang), 0.045 * math.sin(ang), rng.uniform(0.425, 0.470)))
    add_ovate_leaf(
        origin, ang,
        pitch=rng.uniform(0.45, 0.90),
        roll=rng.uniform(-0.20, 0.20),
        bend=rng.uniform(-0.12, 0.12),
        length=rng.uniform(0.090, 0.125),
        width=rng.uniform(0.046, 0.064),
        arch_lift=0.012,
        tip_drop=0.016,
        col_base=mid_greens[i % 3], col_mid=tip_greens[(i + 1) % 3], col_tip=tip_greens[(i + 2) % 3],
        clamp_pot=False,
    )

# 4. Stems + Full Rounded Cottage Bouquet with throat-to-tip color gradients
# Format: (center_xyz, normal_xyz, radius, n_petals, throat_col, tip_col, center_col)
IVORY_THROAT = (0.94, 0.84, 0.56, 1.0)
IVORY_TIP = (1.00, 0.98, 0.90, 1.0)
GOLD_THROAT = (0.92, 0.62, 0.18, 1.0)
GOLD_TIP = (1.00, 0.88, 0.36, 1.0)
CORAL_THROAT = (0.86, 0.38, 0.48, 1.0)
CORAL_TIP = (0.98, 0.68, 0.78, 1.0)
BLUE_THROAT = (0.32, 0.52, 0.88, 1.0)
BLUE_TIP = (0.60, 0.82, 1.00, 1.0)

bloom_specs = [
    # Rounded upper crown quartet
    ((-0.032,  0.038, 0.686), (-0.28,  0.30, 1.00), 0.082, 10, IVORY_THROAT, IVORY_TIP, (0.98, 0.72, 0.14, 1.0)),
    (( 0.062, -0.028, 0.666), ( 0.38, -0.20, 0.96), 0.078, 10, GOLD_THROAT,  GOLD_TIP,  (0.84, 0.45, 0.10, 1.0)),
    ((-0.025, -0.068, 0.650), (-0.20, -0.40, 0.94), 0.076,  6, CORAL_THROAT, CORAL_TIP, (0.98, 0.84, 0.24, 1.0)),
    (( 0.048,  0.065, 0.640), ( 0.30,  0.38, 0.94), 0.074,  5, BLUE_THROAT,  BLUE_TIP,  (0.96, 0.96, 0.88, 1.0)),

    # Mid bouquet halo (5 lush medium blossoms)
    (( 0.118,  0.015, 0.584), ( 0.58,  0.10, 0.84), 0.070,  6, CORAL_THROAT, CORAL_TIP, (0.98, 0.84, 0.24, 1.0)),
    ((-0.112, -0.020, 0.578), (-0.56, -0.14, 0.84), 0.070, 10, IVORY_THROAT, IVORY_TIP, (0.98, 0.72, 0.14, 1.0)),
    (( 0.015,  0.118, 0.574), ( 0.10,  0.58, 0.84), 0.068,  5, BLUE_THROAT,  BLUE_TIP,  (0.96, 0.96, 0.88, 1.0)),
    ((-0.022, -0.118, 0.566), (-0.14, -0.56, 0.84), 0.070, 10, GOLD_THROAT,  GOLD_TIP,  (0.84, 0.45, 0.10, 1.0)),
    (( 0.090,  0.088, 0.554), ( 0.46,  0.44, 0.80), 0.066, 10, IVORY_THROAT, IVORY_TIP, (0.98, 0.72, 0.14, 1.0)),

    # Lower rim-tuck blossoms
    ((-0.102,  0.082, 0.518), (-0.54,  0.42, 0.74), 0.062,  6, CORAL_THROAT, CORAL_TIP, (0.98, 0.84, 0.24, 1.0)),
    (( 0.108, -0.088, 0.512), ( 0.56, -0.44, 0.74), 0.062,  5, BLUE_THROAT,  BLUE_TIP,  (0.96, 0.96, 0.88, 1.0)),
    ((-0.126, -0.082, 0.492), (-0.64, -0.42, 0.68), 0.060,  5, BLUE_THROAT,  BLUE_TIP,  (0.96, 0.96, 0.88, 1.0)),
    (( 0.008, -0.132, 0.486), ( 0.06, -0.68, 0.68), 0.060, 10, GOLD_THROAT,  GOLD_TIP,  (0.84, 0.45, 0.10, 1.0)),
]
for pos_t, norm_t, rad, petals, t_col, tip_c, c_col in bloom_specs:
    p_top = Vector(pos_t)
    p_base = Vector((pos_t[0] * 0.38, pos_t[1] * 0.38, 0.360))
    add_stem(p_base, p_top)
    add_cupped_bloom(p_top, Vector(norm_t), rad, petals, t_col, tip_c, c_col, with_calyx=True)

bud_specs = [
    (( 0.002,  0.005, 0.712), ( 0.05,  0.06, 1.0), 0.022, IVORY_TIP),
    (( 0.122, -0.032, 0.616), ( 0.42, -0.16, 0.9), 0.020, CORAL_TIP),
    ((-0.072,  0.106, 0.608), (-0.30,  0.42, 0.9), 0.020, BLUE_TIP),
    (( 0.068,  0.118, 0.590), ( 0.28,  0.45, 0.9), 0.019, GOLD_TIP),
]
for pos_t, norm_t, rad, col in bud_specs:
    p_top = Vector(pos_t)
    p_base = Vector((pos_t[0] * 0.38, pos_t[1] * 0.38, 0.365))
    add_stem(p_base, p_top, r0=0.007, r1=0.005)
    add_flower_bud(p_top, Vector(norm_t), rad, col)

# Normalize X/Y exact to <=0.59m while keeping vertical grounding (-0.015 .. ~0.735)
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
