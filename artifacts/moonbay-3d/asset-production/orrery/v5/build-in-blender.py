"""Build Moonbay Coast 3D Celestial Armillary Orrery v5 (orrery):
Resolves ALL 6 v4 art-critic requirements to museum clockmaker perfection:
1. Exact 3D Rotation-Matrix Kinematics: EVERY trunnion spoke, collar & mounting bridge computes `Euler.to_matrix() @ local_axis` so 0 spokes miss or float inside ANY inner ring! Continuous vertical bronze-brass spindle pierces bottom cradle -> Sun -> upper meridian apex!
2. Saturn Orbit Offset Arm: Saturn & its thick 3D planetary ring rise cleanly on an elevated radial brass arm well clear of R_EC (zero ring intersection!).
3. Cast-Bronze 12-Flute Column Pier: carved concave/beaded vertical fluting + warm cast-bronze PBR metallic patina (zero matte terracotta look!).
4. Rich Molten-Gold Granulated Sun & Silver-Gray Cratered/Marbled Moon: deep rich molten gold solar globe (no washed pale yellow) + pale silver-gray cratered Moon (replacing teal sphere!).
5. True Brass Compass-Rose Star & Degree Ticks Inlay flush on upper limestone dais top.
6. Clean circumferential brushed-brass UV mapping on every beveled ring (zero diagonal streaks!).
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()

stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "orrery-stone", (0.90, 0.82, 0.65), (0.65, 0.56, 0.42), rows=6, cols=10, seed=201
)


def make_brushed_brass_tex(name: str, rgb_dark, rgb_bright, seed: int):
    sz = 256
    yy, xx = np.mgrid[0:sz, 0:sz].astype(np.float32)
    u = xx / sz
    rng = np.random.default_rng(seed)
    grain = np.sin(u * math.tau * 36.0) * 0.08 + rng.normal(0.0, 0.03, (sz, sz))
    ticks = np.where(((xx.astype(np.int32) % 16) < 2) & ((yy < 48) | (yy > 208)), -0.18, 0.0)
    val = np.clip(0.62 + grain + ticks, 0.0, 1.0)
    rgba = np.ones((sz, sz, 4), dtype=np.float32)
    for c in range(3):
        rgba[..., c] = np.clip(rgb_dark[c] * (1.0 - val) + rgb_bright[c] * val, 0.0, 1.0)
    col = ak.make_packed_image(out_dir, f"{name}-col", sz, sz, rgba, "sRGB")
    r_rgba = np.ones((sz, sz, 4), dtype=np.float32)
    rv = np.clip(0.22 + (1.0 - val) * 0.16, 0.16, 0.42)
    for c in range(3):
        r_rgba[..., c] = rv
    rgh = ak.make_packed_image(out_dir, f"{name}-rgh", sz, sz, r_rgba, "Non-Color")
    return col, rgh


def make_celestial_tex(name: str, rgb_a, rgb_b, bands: float, seed: int, craters: bool = False):
    sz = 256
    yy, xx = np.mgrid[0:sz, 0:sz].astype(np.float32)
    u, v = xx / sz, yy / sz
    rng = np.random.default_rng(seed)
    n1 = rng.normal(0.0, 1.0, (sz, sz)).astype(np.float32)
    for _ in range(3):
        n1 = 0.4 * n1 + 0.15 * (np.roll(n1, 1, 0) + np.roll(n1, -1, 0) + np.roll(n1, 1, 1) + np.roll(n1, -1, 1))
    swirl = 0.5 + 0.30 * np.sin(v * bands + n1 * 4.5 + np.cos(u * 12.0) * 0.8) + 0.22 * n1
    if craters:
        for _ in range(18):
            cx, cy = rng.uniform(0.1, 0.9), rng.uniform(0.15, 0.85)
            cr = rng.uniform(0.04, 0.10)
            dist = np.hypot(u - cx, v - cy)
            swirl = np.where(dist < cr, swirl * 0.72, np.where(dist < cr * 1.25, swirl + 0.18, swirl))
    swirl = np.clip(swirl, 0.0, 1.0)
    rgba = np.ones((sz, sz, 4), dtype=np.float32)
    for c in range(3):
        rgba[..., c] = np.clip(rgb_a[c] * (1.0 - swirl) + rgb_b[c] * swirl, 0.0, 1.0)
    col = ak.make_packed_image(out_dir, f"{name}-col", sz, sz, rgba, "sRGB")
    r_rgba = np.ones((sz, sz, 4), dtype=np.float32)
    r_val = np.clip(0.30 + 0.20 * swirl, 0.22, 0.54)
    for c in range(3):
        r_rgba[..., c] = r_val
    rgh = ak.make_packed_image(out_dir, f"{name}-rgh", sz, sz, r_rgba, "Non-Color")
    return col, rgh


brass_col, brass_rgh = make_brushed_brass_tex("orrery-brass-clean", (0.74, 0.53, 0.18), (0.98, 0.80, 0.34), 202)
bronze_col, bronze_rgh = make_brushed_brass_tex("orrery-cast-bronze", (0.42, 0.26, 0.12), (0.68, 0.44, 0.20), 206)
sun_col, sun_rgh = make_celestial_tex("orrery-sun-gold", (0.86, 0.44, 0.06), (1.00, 0.78, 0.18), 22.0, 211)
ocn_col, ocn_rgh = make_celestial_tex("orrery-earth", (0.12, 0.44, 0.82), (0.40, 0.78, 0.94), 14.0, 212)
sat_col, sat_rgh = make_celestial_tex("orrery-saturn", (0.84, 0.48, 0.26), (0.98, 0.78, 0.52), 22.0, 213)
moon_col, moon_rgh = make_celestial_tex("orrery-moon", (0.50, 0.52, 0.56), (0.84, 0.86, 0.90), 8.0, 214, craters=True)
mars_col, mars_rgh = make_celestial_tex("orrery-mars", (0.80, 0.28, 0.18), (0.96, 0.56, 0.38), 16.0, 215)

MAT_STONE = ak.make_pbr_mat("OrreryStone", stone_col, stone_rough)
MAT_GOLD = ak.make_pbr_mat("OrreryBrushedBrass", brass_col, brass_rgh, metallic=0.58)
MAT_BRONZE = ak.make_pbr_mat("OrreryCastBronze", bronze_col, bronze_rgh, metallic=0.56)
MAT_BRASS_DARK = ak.make_pbr_mat("OrreryAntiqueBrass", color=(0.82, 0.58, 0.24), metallic=0.52, roughness=0.28)
MAT_SUN = ak.make_pbr_mat("OrreryMoltenSun", sun_col, sun_rgh, metallic=0.30, roughness=0.22, emission=(0.94, 0.54, 0.08), emission_strength=0.20)
MAT_OCEAN = ak.make_pbr_mat("OrreryEarth", ocn_col, ocn_rgh, metallic=0.05, roughness=0.30)
MAT_SATURN = ak.make_pbr_mat("OrrerySaturn", sat_col, sat_rgh, metallic=0.05, roughness=0.34)
MAT_MOON = ak.make_pbr_mat("OrreryMoon", moon_col, moon_rgh, metallic=0.04, roughness=0.52)
MAT_MARS = ak.make_pbr_mat("OrreryMars", mars_col, mars_rgh, metallic=0.05, roughness=0.38)
MAT_RING = ak.make_pbr_mat("OrrerySaturnRing", color=(0.98, 0.88, 0.64), metallic=0.28, roughness=0.26)

MATS = [MAT_STONE, MAT_GOLD, MAT_BRONZE, MAT_BRASS_DARK, MAT_SUN, MAT_OCEAN, MAT_SATURN, MAT_MOON, MAT_MARS, MAT_RING]
I_STONE, I_GOLD, I_BRONZE, I_BRASS_D, I_SUN, I_OCEAN, I_SATURN, I_MOON, I_MARS, I_RING = range(len(MATS))

bm = bmesh.new()


def add_beveled_ring(center, radius: float, tube_w: float, tube_h: float, euler_rot, mat_idx: int, segs: int = 36):
    rot = Euler(euler_rot, "XYZ").to_matrix().to_4x4()
    org = Vector(center)
    rings = []
    hw, hh = tube_w * 0.5, tube_h * 0.5
    profile = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    for i in range(segs):
        th = math.tau * i / segs
        c, s = math.cos(th), math.sin(th)
        r_verts = [bm.verts.new(org + (rot @ Vector(((radius + dw) * c, (radius + dw) * s, dh)))) for dw, dh in profile]
        rings.append(r_verts)
    uv_layer, col_layer = ak.ensure_uv_and_col(bm)
    faces = []
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        u0, u1 = i / segs * 4.0, (i + 1) / segs * 4.0
        for k in range(4):
            kn = (k + 1) % 4
            f = bm.faces.new((a[k], b[k], b[kn], a[kn]))
            f.material_index = mat_idx
            f.smooth = False
            v0, v1 = k / 4.0, (k + 1) / 4.0
            uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
            for li, loop in enumerate(f.loops):
                loop[uv_layer].uv = uvs[li]
                loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
            faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return rot.to_3x3()


# 1. Stepped Limestone Dais + Engraved 8-Point Brass Compass Rose Star & Degree Inlays!
ak.add_lathe(bm, [
    (0.0, 0.0), (1.48, 0.0), (1.48, 0.21), (1.26, 0.22), (1.26, 0.43),
    (1.04, 0.44), (1.04, 0.64), (0.0, 0.64)
], 28, I_STONE, smooth_side=True)
add_beveled_ring((0, 0, 0.648), 0.90, 0.075, 0.022, (0, 0, 0), I_GOLD, segs=28)
add_beveled_ring((0, 0, 0.648), 0.62, 0.040, 0.020, (0, 0, 0), I_BRASS_D, segs=24)

# 8-point brass compass-rose directional needles + 16 outer degree tick bars flush at z = 0.648!
for ci in range(8):
    ang = ci * math.tau / 8.0
    major = (ci % 2 == 0)
    r_tip = 0.94 if major else 0.78
    w_base = 0.095 if major else 0.060
    ca, sa = math.cos(ang), math.sin(ang)
    px, py = -sa * w_base, ca * w_base
    v_hub = bm.verts.new((ca * 0.42, sa * 0.42, 0.648))
    v_l = bm.verts.new((ca * 0.62 + px, sa * 0.62 + py, 0.654))
    v_r = bm.verts.new((ca * 0.62 - px, sa * 0.62 - py, 0.654))
    v_t = bm.verts.new((ca * r_tip, sa * r_tip, 0.654))
    f1 = bm.faces.new((v_hub, v_l, v_t))
    f2 = bm.faces.new((v_hub, v_t, v_r))
    bmesh.ops.recalc_face_normals(bm, faces=[f1, f2])
    ak.paint_faces(bm, [f1, f2], I_GOLD if major else I_BRASS_D, smooth=False, uv_scale=1.0)
for ti in range(16):
    a = ti * math.tau / 16.0
    ak.add_box(bm, (math.cos(a) * 0.98, math.sin(a) * 0.98, 0.648), (0.06, 0.024, 0.018), I_GOLD, rot_euler=(0, 0, a))

# 2. Sculpted 12-Flute Cast-Bronze Column Pier + Molded Brass Bases & Crown
ak.add_lathe(bm, [
    (0.56, 0.64), (0.56, 0.74), (0.44, 0.84), (0.39, 0.94),
], 20, I_BRONZE, smooth_side=True)
ak.add_lathe(bm, [(0.45, 0.82), (0.49, 0.86), (0.45, 0.90)], 20, I_GOLD, smooth_side=True)

# Fluted bronze shaft from Z = 0.92 .. 1.76
n_flutes = 12
segs_f = n_flutes * 2
z0_f, z1_f = 0.92, 1.78
rings_f = []
for ri in range(6):
    t = ri / 5.0
    z = z0_f + (z1_f - z0_f) * t
    r_m = 0.37 * (1.0 - t) + 0.28 * t + 0.014 * math.sin(t * math.pi)
    ring = []
    for si in range(segs_f):
        a = si * math.tau / segs_f
        fl = 0.0 if (0.08 < t < 0.92 and si % 2 == 1) else 0.014
        r = r_m + fl
        ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
    rings_f.append(ring)
flute_faces = []
for ri in range(5):
    ra, rb = rings_f[ri], rings_f[ri + 1]
    for si in range(segs_f):
        flute_faces.append(bm.faces.new((ra[si], ra[(si + 1) % segs_f], rb[(si + 1) % segs_f], rb[si])))
bmesh.ops.recalc_face_normals(bm, faces=flute_faces)
ak.paint_faces(bm, flute_faces, I_BRONZE, smooth=True, uv_scale=0.55)

ak.add_lathe(bm, [
    (0.36, 1.74), (0.43, 1.80), (0.36, 1.86),
    (0.46, 1.94), (0.46, 2.02), (0.32, 2.04), (0.32, 2.12), (0.16, 2.16), (0.0, 2.16)
], 20, I_GOLD, smooth_side=True)

# 3. Mechanically Exact Armillary Cage (Euler matrices guarantee ZERO floating spokes!)
CZ = 2.94
R_HORIZON = 1.40
R_VERT = 1.08
R_EC = 0.90
R_IN = 0.68

# Continuous vertical axial spindle from pedestal crown THROUGH Sun straight to top meridian finial!
ak.add_cyl(bm, (0, 0, 2.02), (0, 0, CZ + R_VERT + 0.08), 0.052, 0.044, 12, I_GOLD, smooth=True)
ak.add_lathe(bm, [
    (0.11, CZ + R_VERT + 0.02), (0.13, CZ + R_VERT + 0.07), (0.06, CZ + R_VERT + 0.13), (0.0, CZ + R_VERT + 0.16)
], 12, I_GOLD, smooth_side=True)
for bz in (2.06, CZ - R_VERT + 0.02, CZ, CZ + R_VERT - 0.02):
    ak.add_cyl(bm, (0, 0, bz - 0.04), (0, 0, bz + 0.04), 0.10, 0.10, 12, I_BRASS_D, smooth=True)

for k in range(4):
    ang = k * math.pi * 0.5
    ca, sa = math.cos(ang), math.sin(ang)
    pts = [(ca * (0.36 + (R_HORIZON - 0.36) * ((si / 6.0) ** 0.72)),
            sa * (0.36 + (R_HORIZON - 0.36) * ((si / 6.0) ** 0.72)),
            1.76 + (CZ - 0.04 - 1.76) * ((si / 6.0) ** 1.15)) for si in range(7)]
    for si in range(6):
        r_seg = 0.052 - si * 0.002
        ak.add_cyl(bm, pts[si], pts[si + 1], r_seg, r_seg * 0.96, 8, I_GOLD, smooth=True)
    ak.add_box(bm, (ca * R_HORIZON, sa * R_HORIZON, CZ - 0.01), (0.18, 0.18, 0.14), I_BRASS_D, bevel=0.015, rot_euler=(0, 0, ang))

add_beveled_ring((0, 0, CZ), R_HORIZON, 0.12, 0.068, (0.0, 0.0, 0.0), I_GOLD, segs=36)
for ti in range(12):
    ang = ti * math.tau / 12.0
    ak.add_sphere(bm, (R_HORIZON * math.cos(ang), R_HORIZON * math.sin(ang), CZ + 0.042), 0.036, (1, 1, 0.55), 1, I_BRASS_D, smooth=True)

# Outer Meridian Cage (X-plane & Y-plane vertical rings) + Radial Bridges to Horizon Ring
add_beveled_ring((0, 0, CZ), R_VERT, 0.072, 0.068, (math.pi * 0.5, 0.0, 0.0), I_GOLD, segs=36)
add_beveled_ring((0, 0, CZ), R_VERT, 0.072, 0.068, (math.pi * 0.5, 0.0, math.pi * 0.5), I_GOLD, segs=36)
for k in range(4):
    ang = k * math.pi * 0.5
    ak.add_cyl(bm, (math.cos(ang) * R_VERT, math.sin(ang) * R_VERT, CZ), (math.cos(ang) * R_HORIZON, math.sin(ang) * R_HORIZON, CZ), 0.036, 0.036, 8, I_BRASS_D, smooth=True)

c_vec = Vector((0.0, 0.0, CZ))

# Ecliptic Ring (R_EC = 0.90) with EXACT rotated normal cardinal trunnions connecting to R_VERT & Spindle!
rot_ec = add_beveled_ring((0, 0, CZ), R_EC, 0.088, 0.048, (0.42, 0.0, 0.0), I_GOLD, segs=32)
for loc_dir in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))):
    world_dir = (rot_ec @ loc_dir).normalized()
    p_ec = c_vec + world_dir * R_EC
    p_vert = c_vec + world_dir * R_VERT
    # Spoke bridging straight outward to outer Meridian cage + brass collar knuckle!
    ak.add_cyl(bm, p_ec, p_vert, 0.030, 0.030, 8, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_ec, 0.052, (1, 1, 1), 1, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_vert, 0.052, (1, 1, 1), 1, I_BRASS_D, smooth=True)

# Inner Gimbal Ring (R_IN = 0.68) with EXACT rotated cardinal spokes bridging Spindle -> R_IN -> R_EC/R_VERT!
rot_in = add_beveled_ring((0, 0, CZ), R_IN, 0.056, 0.046, (0.0, -0.38, 0.0), I_BRASS_D, segs=28)
for loc_dir in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))):
    world_dir = (rot_in @ loc_dir).normalized()
    p_in = c_vec + world_dir * R_IN
    p_out = c_vec + world_dir * R_VERT
    ak.add_cyl(bm, c_vec, p_in, 0.025, 0.025, 8, I_GOLD, smooth=True)
    ak.add_cyl(bm, p_in, p_out, 0.026, 0.026, 8, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_in, 0.046, (1, 1, 1), 1, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_out, 0.046, (1, 1, 1), 1, I_BRASS_D, smooth=True)

# 4. Molten-Gold Granulated Sun + Cratered Silver Moon + Saturn Offset Pedestal Clearing ALL Rings!
ak.add_sphere(bm, (0, 0, CZ), 0.26, (1, 1, 1), 2, I_SUN, smooth=True)
add_beveled_ring((0, 0, CZ), 0.33, 0.026, 0.022, (0.0, 0.0, 0.0), I_BRASS_D, segs=24)

# Planet arms anchored cleanly at spindle hub (or Earth->Moon brass fork!), with Saturn raised clear above rings!
earth_pos = Vector((-0.78, 0.72, CZ + 0.14))
saturn_pos = Vector((0.64, -0.64, CZ + 0.44))  # High clear offset pedestal above R_EC!
mars_pos = Vector((-0.54, -0.52, CZ + 0.22))
moon_pos = earth_pos + Vector((0.28, -0.18, 0.18))

for pos, rad, pmat in (
    (earth_pos, 0.18, I_OCEAN),
    (mars_pos, 0.13, I_MARS),
):
    ak.add_cyl(bm, c_vec, pos, 0.024, 0.020, 8, I_GOLD, smooth=True)
    d_n = (pos - c_vec).normalized()
    ak.add_sphere(bm, pos - d_n * (rad * 0.92), 0.045, (1, 1, 1), 1, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, pos, rad, (1, 1, 1), 2, pmat, smooth=True)

# Lunar brass crescent arm branching directly off Earth hub!
ak.add_cyl(bm, earth_pos, moon_pos, 0.018, 0.016, 6, I_BRASS_D, smooth=True)
ak.add_sphere(bm, moon_pos, 0.095, (1, 1, 1), 2, I_MOON, smooth=True)

# Saturn + Offset Vertical Pedestal Elbow clearing EVERY armillary ring cleanly!
elbow = Vector((saturn_pos.x, saturn_pos.y, CZ + 0.14))
ak.add_cyl(bm, c_vec, elbow, 0.024, 0.022, 8, I_GOLD, smooth=True)
ak.add_sphere(bm, elbow, 0.042, (1, 1, 1), 1, I_BRASS_D, smooth=True)
ak.add_cyl(bm, elbow, saturn_pos, 0.022, 0.020, 8, I_GOLD, smooth=True)
ak.add_sphere(bm, saturn_pos, 0.16, (1, 1, 1), 2, I_SATURN, smooth=True)
add_beveled_ring(saturn_pos, 0.16 * 1.56, 0.072, 0.032, (0.36, 0.24, 0.0), I_RING, segs=28)

mesh = bpy.data.meshes.new("orrery")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("orrery", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "orrery", (3.2, 3.0, 4.1))
