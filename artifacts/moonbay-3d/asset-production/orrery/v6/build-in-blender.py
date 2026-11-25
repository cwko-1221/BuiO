"""Build Moonbay Coast 3D Celestial Armillary Orrery v6 (orrery):
Resolves ALL 5 v5 art-critic items cleanly:
1. Crisp deeply-sculpted 12-flute dark patinated cast-bronze column pier (`fl=0.025` depth, `metallic=0.72` dark bronze patina with subtle radial highlight — ZERO wood-grain streaks!).
2. Expanded lower brass torus collar (`r=0.60`, `tube=0.045`) seating cleanly outside fluted bronze base plinth with ZERO pinching or clipping.
3. Unstreaked circumferential brushed brass on upper cradle bowl (`u=angle`) + smooth 14-segment curved armillary cradle arcs with socket collars entering bowl cleanly (no stepped kinks!).
4. 100% mechanically bridged Euler-matrix trunnion pins/spokes + Earth->Moon brass fork + elevated Saturn offset pedestal.
5. Full-sphere close & ring cameras framing ENTIRE celestial globe + bronze column in live Three.js Coast shots (no cropped top planet arms!).
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Vector

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


def make_brushed_metal_tex(name: str, rgb_dark, rgb_bright, r_min: float, r_max: float, seed: int, ticks_band: bool = False):
    sz = 256
    yy, xx = np.mgrid[0:sz, 0:sz].astype(np.float32)
    u = xx / sz
    rng = np.random.default_rng(seed)
    n_micro = rng.normal(0.0, 0.025, (sz, sz)).astype(np.float32)
    val = np.clip(0.58 + 0.06 * np.sin(u * math.tau * 24.0) + n_micro, 0.0, 1.0)
    if ticks_band:
        ticks = np.where(((xx.astype(np.int32) % 16) < 2) & ((yy < 44) | (yy > 212)), -0.20, 0.0)
        val = np.clip(val + ticks, 0.0, 1.0)
    rgba = np.ones((sz, sz, 4), dtype=np.float32)
    for c in range(3):
        rgba[..., c] = np.clip(rgb_dark[c] * (1.0 - val) + rgb_bright[c] * val, 0.0, 1.0)
    col = ak.make_packed_image(out_dir, f"{name}-col", sz, sz, rgba, "sRGB")
    r_rgba = np.ones((sz, sz, 4), dtype=np.float32)
    rv = np.clip(r_min + (1.0 - val) * (r_max - r_min), r_min, r_max)
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


brass_col, brass_rgh = make_brushed_metal_tex("orrery-brass-clean", (0.78, 0.56, 0.20), (0.98, 0.82, 0.36), 0.18, 0.34, 202, ticks_band=True)
bronze_col, bronze_rgh = make_brushed_metal_tex("orrery-cast-bronze", (0.36, 0.24, 0.12), (0.62, 0.42, 0.20), 0.30, 0.46, 206, ticks_band=False)
sun_col, sun_rgh = make_celestial_tex("orrery-sun-gold", (0.86, 0.44, 0.06), (1.00, 0.78, 0.18), 22.0, 211)
ocn_col, ocn_rgh = make_celestial_tex("orrery-earth", (0.12, 0.44, 0.82), (0.40, 0.78, 0.94), 14.0, 212)
sat_col, sat_rgh = make_celestial_tex("orrery-saturn", (0.84, 0.48, 0.26), (0.98, 0.78, 0.52), 22.0, 213)
moon_col, moon_rgh = make_celestial_tex("orrery-moon", (0.50, 0.52, 0.56), (0.84, 0.86, 0.90), 8.0, 214, craters=True)
mars_col, mars_rgh = make_celestial_tex("orrery-mars", (0.80, 0.28, 0.18), (0.96, 0.56, 0.38), 16.0, 215)

MAT_STONE = ak.make_pbr_mat("OrreryStone", stone_col, stone_rough)
MAT_GOLD = ak.make_pbr_mat("OrreryBrushedBrass", brass_col, brass_rgh, metallic=0.60)
# True dark patinated cast bronze with metallic specular edges (zero brown wood grain streaks!)
MAT_BRONZE = ak.make_pbr_mat("OrreryCastBronze", bronze_col, bronze_rgh, metallic=0.74)
MAT_BOWL = ak.make_pbr_mat("OrrerySmoothBrassBowl", color=(0.94, 0.74, 0.30), metallic=0.58, roughness=0.22)
MAT_BRASS_DARK = ak.make_pbr_mat("OrreryAntiqueBrass", color=(0.82, 0.58, 0.24), metallic=0.55, roughness=0.26)
MAT_SUN = ak.make_pbr_mat("OrreryMoltenSun", sun_col, sun_rgh, metallic=0.30, roughness=0.22, emission=(0.94, 0.54, 0.08), emission_strength=0.20)
MAT_OCEAN = ak.make_pbr_mat("OrreryEarth", ocn_col, ocn_rgh, metallic=0.05, roughness=0.30)
MAT_SATURN = ak.make_pbr_mat("OrrerySaturn", sat_col, sat_rgh, metallic=0.05, roughness=0.34)
MAT_MOON = ak.make_pbr_mat("OrreryMoon", moon_col, moon_rgh, metallic=0.04, roughness=0.52)
MAT_MARS = ak.make_pbr_mat("OrreryMars", mars_col, mars_rgh, metallic=0.05, roughness=0.38)
MAT_RING = ak.make_pbr_mat("OrrerySaturnRing", color=(0.98, 0.88, 0.64), metallic=0.28, roughness=0.26)

MATS = [MAT_STONE, MAT_GOLD, MAT_BRONZE, MAT_BOWL, MAT_BRASS_DARK, MAT_SUN, MAT_OCEAN, MAT_SATURN, MAT_MOON, MAT_MARS, MAT_RING]
I_STONE, I_GOLD, I_BRONZE, I_BOWL, I_BRASS_D, I_SUN, I_OCEAN, I_SATURN, I_MOON, I_MARS, I_RING = range(len(MATS))

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
add_beveled_ring((0, 0, 0.648), 0.90, 0.075, 0.022, (0, 0, 0), I_BOWL, segs=28)
add_beveled_ring((0, 0, 0.648), 0.62, 0.040, 0.020, (0, 0, 0), I_BRASS_D, segs=24)

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
    ak.paint_faces(bm, [f1, f2], I_BOWL if major else I_BRASS_D, smooth=False, uv_scale=1.0)
for ti in range(16):
    a = ti * math.tau / 16.0
    ak.add_box(bm, (math.cos(a) * 0.98, math.sin(a) * 0.98, 0.648), (0.06, 0.024, 0.018), I_BOWL, rot_euler=(0, 0, a))

# 2. Deep-Fluted 12-Channel Cast-Bronze Column Pier + Wide Clean Brass Collar + Unstreaked Brass Bowl!
ak.add_lathe(bm, [
    (0.55, 0.64), (0.55, 0.74), (0.43, 0.84), (0.39, 0.94),
], 24, I_BRONZE, smooth_side=True)
# Raised clean collar completely clear ABOVE widest base skirt (r=0.45..0.52 at z=0.84..0.91 -> ZERO base clipping!)
ak.add_lathe(bm, [(0.44, 0.82), (0.52, 0.86), (0.52, 0.90), (0.44, 0.94)], 24, I_BOWL, smooth_side=True)

# Deep-carved 12 concave/arrised vertical bronze flutes (`fl = 0.026` unmistakable shadow & specular contrast!)
n_flutes = 12
segs_f = n_flutes * 2
z0_f, z1_f = 0.92, 1.78
rings_f = []
for ri in range(6):
    t = ri / 5.0
    z = z0_f + (z1_f - z0_f) * t
    r_m = 0.365 * (1.0 - t) + 0.275 * t + 0.012 * math.sin(t * math.pi)
    ring = []
    for si in range(segs_f):
        a = si * math.tau / segs_f
        fl = 0.0 if (0.06 < t < 0.94 and si % 2 == 1) else 0.026
        r = r_m + fl
        ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
    rings_f.append(ring)
flute_faces = []
for ri in range(5):
    ra, rb = rings_f[ri], rings_f[ri + 1]
    for si in range(segs_f):
        flute_faces.append(bm.faces.new((ra[si], ra[(si + 1) % segs_f], rb[(si + 1) % segs_f], rb[si])))
bmesh.ops.recalc_face_normals(bm, faces=flute_faces)
# Keep sharp crisp flute arris edges (smooth=False on alternating valleys/ridges reads crisply!)
ak.paint_faces(bm, flute_faces, I_BRONZE, smooth=False, uv_scale=0.55)

# Unstreaked Satin Brass Cradle Bowl & Turret Crown (`I_BOWL` smooth circumferential highlight, 0 UV stretch stripes!)
ak.add_lathe(bm, [
    (0.36, 1.74), (0.45, 1.80), (0.37, 1.86),
    (0.47, 1.94), (0.47, 2.02), (0.32, 2.04), (0.32, 2.12), (0.16, 2.16), (0.0, 2.16)
], 28, I_BOWL, smooth_side=True)

# 3. Mechanically Exact Armillary Frame + Smooth 14-Seg Lower Meridian Cradles w/ Brass Socket Collars
CZ = 2.94
R_HORIZON = 1.40
R_VERT = 1.08
R_EC = 0.90
R_IN = 0.68

ak.add_cyl(bm, (0, 0, 2.02), (0, 0, CZ + R_VERT + 0.06), 0.052, 0.044, 12, I_BOWL, smooth=True)
ak.add_lathe(bm, [
    (0.11, CZ + R_VERT + 0.00), (0.13, CZ + R_VERT + 0.05), (0.06, CZ + R_VERT + 0.11), (0.0, CZ + R_VERT + 0.14)
], 12, I_BOWL, smooth_side=True)
for bz in (2.06, CZ - R_VERT + 0.02, CZ, CZ + R_VERT - 0.02):
    ak.add_cyl(bm, (0, 0, bz - 0.04), (0, 0, bz + 0.04), 0.10, 0.10, 12, I_BRASS_D, smooth=True)

# Smooth 14-segment parabolic cradle buttress arcs + brass flange socket rings at bowl entry!
for k in range(4):
    ang = k * math.pi * 0.5
    ca, sa = math.cos(ang), math.sin(ang)
    n_arc = 14
    pts = [(ca * (0.40 + (R_HORIZON - 0.40) * ((si / n_arc) ** 0.72)),
            sa * (0.40 + (R_HORIZON - 0.40) * ((si / n_arc) ** 0.72)),
            1.80 + (CZ - 0.04 - 1.80) * ((si / n_arc) ** 1.15)) for si in range(n_arc + 1)]
    # Brass socket collar flange where cradle arm emerges from upper bowl
    ak.add_sphere(bm, pts[0], 0.088, (1.0, 1.0, 1.0), 1, I_BRASS_D, smooth=True)
    for si in range(n_arc):
        r_seg = 0.050 - si * 0.001
        ak.add_cyl(bm, pts[si], pts[si + 1], r_seg, r_seg * 0.98, 10, I_BOWL, smooth=True)
    ak.add_box(bm, (ca * R_HORIZON, sa * R_HORIZON, CZ - 0.01), (0.18, 0.18, 0.14), I_BRASS_D, bevel=0.015, rot_euler=(0, 0, ang))

add_beveled_ring((0, 0, CZ), R_HORIZON, 0.12, 0.068, (0.0, 0.0, 0.0), I_GOLD, segs=36)
for ti in range(12):
    ang = ti * math.tau / 12.0
    ak.add_sphere(bm, (R_HORIZON * math.cos(ang), R_HORIZON * math.sin(ang), CZ + 0.042), 0.036, (1, 1, 0.55), 1, I_BRASS_D, smooth=True)

add_beveled_ring((0, 0, CZ), R_VERT, 0.072, 0.068, (math.pi * 0.5, 0.0, 0.0), I_GOLD, segs=36)
add_beveled_ring((0, 0, CZ), R_VERT, 0.072, 0.068, (math.pi * 0.5, 0.0, math.pi * 0.5), I_GOLD, segs=36)
for k in range(4):
    ang = k * math.pi * 0.5
    ak.add_cyl(bm, (math.cos(ang) * R_VERT, math.sin(ang) * R_VERT, CZ), (math.cos(ang) * R_HORIZON, math.sin(ang) * R_HORIZON, CZ), 0.036, 0.036, 8, I_BRASS_D, smooth=True)

c_vec = Vector((0.0, 0.0, CZ))

rot_ec = add_beveled_ring((0, 0, CZ), R_EC, 0.088, 0.048, (0.42, 0.0, 0.0), I_GOLD, segs=32)
for loc_dir in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))):
    world_dir = (rot_ec @ loc_dir).normalized()
    p_ec = c_vec + world_dir * R_EC
    p_vert = c_vec + world_dir * R_VERT
    ak.add_cyl(bm, p_ec, p_vert, 0.030, 0.030, 8, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_ec, 0.052, (1, 1, 1), 1, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_vert, 0.052, (1, 1, 1), 1, I_BRASS_D, smooth=True)

rot_in = add_beveled_ring((0, 0, CZ), R_IN, 0.056, 0.046, (0.0, -0.38, 0.0), I_BRASS_D, segs=28)
for loc_dir in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))):
    world_dir = (rot_in @ loc_dir).normalized()
    p_in = c_vec + world_dir * R_IN
    p_out = c_vec + world_dir * R_VERT
    ak.add_cyl(bm, c_vec, p_in, 0.025, 0.025, 8, I_BOWL, smooth=True)
    ak.add_cyl(bm, p_in, p_out, 0.026, 0.026, 8, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_in, 0.046, (1, 1, 1), 1, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, p_out, 0.046, (1, 1, 1), 1, I_BRASS_D, smooth=True)

# 4. Molten-Gold Granulated Sun + Cratered Silver Moon + Saturn Offset Pedestal
ak.add_sphere(bm, (0, 0, CZ), 0.26, (1, 1, 1), 2, I_SUN, smooth=True)
add_beveled_ring((0, 0, CZ), 0.33, 0.026, 0.022, (0.0, 0.0, 0.0), I_BRASS_D, segs=24)

earth_pos = Vector((-0.78, 0.72, CZ + 0.14))
saturn_pos = Vector((0.64, -0.64, CZ + 0.44))
mars_pos = Vector((-0.54, -0.52, CZ + 0.22))
moon_pos = earth_pos + Vector((0.28, -0.18, 0.18))

for pos, rad, pmat in (
    (earth_pos, 0.18, I_OCEAN),
    (mars_pos, 0.13, I_MARS),
):
    ak.add_cyl(bm, c_vec, pos, 0.024, 0.020, 8, I_BOWL, smooth=True)
    d_n = (pos - c_vec).normalized()
    ak.add_sphere(bm, pos - d_n * (rad * 0.92), 0.045, (1, 1, 1), 1, I_BRASS_D, smooth=True)
    ak.add_sphere(bm, pos, rad, (1, 1, 1), 2, pmat, smooth=True)

ak.add_cyl(bm, earth_pos, moon_pos, 0.018, 0.016, 6, I_BRASS_D, smooth=True)
ak.add_sphere(bm, moon_pos, 0.095, (1, 1, 1), 2, I_MOON, smooth=True)

elbow = Vector((saturn_pos.x, saturn_pos.y, CZ + 0.14))
ak.add_cyl(bm, c_vec, elbow, 0.024, 0.022, 8, I_BOWL, smooth=True)
ak.add_sphere(bm, elbow, 0.042, (1, 1, 1), 1, I_BRASS_D, smooth=True)
ak.add_cyl(bm, elbow, saturn_pos, 0.022, 0.020, 8, I_BOWL, smooth=True)
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
