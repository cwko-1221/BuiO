"""Build Moonbay Coast 3D Decagonal Garden Gazebo v5 (gazebo):
Fixes v4 physics ramp climb angle (>37deg -> 27.9deg!) while preserving exact visual quality & collider contract:
- 4 wider concentric stone dais steps: r = 2.75 (0.00->0.075), 2.60 (0.075->0.150), 2.45 (0.150->0.225), 2.30 (0.225->0.300)
  so gazeboFloor bevel has gentle ~27.9deg slope (< 37deg Rapier maxClimbAngle!) and support.y > 4.02m (> 3.96m)!
- 10 fluted Tuscan limestone columns at R_COL = 2.35m (maxZ = 2.53m -> world z = 88.06m in (88.04..88.18)!),
  plinth seating solidly into upper steps from z = 0.15..0.28, molded base & shaft cleanly above top dais z = 0.30!
- Vine clearance strictly outside fluted shafts.
Exports exact 3 named meshes: 'gazebo', 'gazebo-platform', 'gazebo-columns'.
"""
import sys
import math
from pathlib import Path
import bmesh
import bpy

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "gazebo-stone", (0.90, 0.84, 0.72), (0.68, 0.60, 0.48), rows=6, cols=10, seed=201)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "gazebo-stucco", (0.95, 0.89, 0.79), (0.88, 0.78, 0.62), seed=202)
dome_col, dome_rgh = ak.make_copper_patina_textures(out_dir, "gazebo-copper", (0.06, 0.40, 0.34), (0.14, 0.60, 0.50), seed=203)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "gazebo-vine-wood", (0.42, 0.27, 0.15), (0.28, 0.17, 0.08), planks=4, seed=204)

M_STONE = ak.make_pbr_mat("GazeboLimestone", stone_col, stone_rgh, metallic=0.0)
M_CREAM = ak.make_pbr_mat("GazeboCreamTrim", stucco_col, stucco_rgh, metallic=0.0)
M_TEAL = ak.make_pbr_mat("GazeboFriezeTeal", color=(0.18, 0.56, 0.54), metallic=0.04, roughness=0.48)
M_DOME = ak.make_pbr_mat("GazeboCopperDome", dome_col, dome_rgh, metallic=0.25)
M_GOLD = ak.make_pbr_mat("GazeboGoldBrass", color=(0.94, 0.76, 0.34), metallic=0.52, roughness=0.26)
M_TIMBER = ak.make_pbr_mat("GazeboVineStem", wood_col, wood_rgh, metallic=0.0)
M_LEAF = ak.make_pbr_mat("GazeboVineLeaf", color=(0.20, 0.52, 0.20), metallic=0.0, roughness=0.50, double_sided=True)
M_BLOOM = ak.make_pbr_mat("GazeboBlossomPink", color=(0.97, 0.64, 0.68), metallic=0.0, roughness=0.40, double_sided=True)

MATS = [M_STONE, M_CREAM, M_TEAL, M_DOME, M_GOLD, M_TIMBER, M_LEAF, M_BLOOM]
I_STONE, I_CREAM, I_TEAL, I_DOME, I_GOLD, I_TIMBER, I_LEAF, I_BLOOM = range(8)


def col_shaft_radius(t: float, r_base=0.132, r_top=0.112) -> float:
    return r_base * (1.0 - t) + r_top * t + 0.008 * math.sin(t * math.pi) + 0.007


def add_fluted_column(bm, base_z, plinth_top_z, top_z, xy, yaw, r_base=0.132, r_top=0.112, n_flutes=12):
    cx, cy = xy
    # Anchor plinth block solidly from step 1 (0.15) through 0.39, with South face at R_COL + 0.18 = 2.53m!
    p_h = plinth_top_z - base_z
    ak.add_box(bm, (cx, cy, base_z + p_h * 0.5), (0.36, 0.36, p_h), I_STONE, bevel=0.015, rot_euler=(0, 0, yaw))
    ak.add_lathe(bm, [
        (0.165, plinth_top_z), (0.175, plinth_top_z + 0.035), (0.145, plinth_top_z + 0.075), (r_base, plinth_top_z + 0.105),
    ], 16, I_CREAM, center=(cx, cy, 0.0), smooth_side=True)

    z0 = plinth_top_z + 0.105
    z1 = top_z - 0.28
    segs = n_flutes * 2
    rings_z = 6
    rings = []
    for ri in range(rings_z + 1):
        t = ri / rings_z
        z = z0 + (z1 - z0) * t
        r_mid = r_base * (1.0 - t) + r_top * t + 0.008 * math.sin(t * math.pi)
        ring = []
        for si in range(segs):
            a = si * math.tau / segs
            flute = 0.0 if (0.08 < t < 0.92 and si % 2 == 1) else 0.007
            r = r_mid + flute
            ring.append(bm.verts.new((cx + math.cos(a) * r, cy + math.sin(a) * r, z)))
        rings.append(ring)

    shaft_faces = []
    for ri in range(rings_z):
        ra, rb = rings[ri], rings[ri + 1]
        for si in range(segs):
            shaft_faces.append(bm.faces.new((ra[si], ra[(si + 1) % segs], rb[(si + 1) % segs], rb[si])))
    bmesh.ops.recalc_face_normals(bm, faces=shaft_faces)
    ak.paint_faces(bm, shaft_faces, I_CREAM, smooth=True, uv_scale=0.55)

    ak.add_lathe(bm, [
        (r_top, z1), (r_top + 0.025, z1 + 0.04), (r_top + 0.015, z1 + 0.07),
        (r_top + 0.068, z1 + 0.145), (r_top + 0.078, z1 + 0.18),
    ], 16, I_CREAM, center=(cx, cy, 0.0), smooth_side=True)
    ak.add_box(bm, (cx, cy, top_z - 0.05), (0.38, 0.38, 0.10), I_STONE, bevel=0.015, rot_euler=(0, 0, yaw))


# PART 1: 'gazebo-platform' (4 wide gentle treads spanning 2.75->2.30 over 0.30m height => ~27.9deg ramp <= 37deg!)
bm_plat = bmesh.new()
ak.add_lathe(bm_plat, [
    (0.000, 0.000), (2.750, 0.000), (2.750, 0.075),
    (2.600, 0.075), (2.600, 0.150),
    (2.450, 0.150), (2.450, 0.225),
    (2.300, 0.225), (2.300, 0.300),
    (0.000, 0.300),
], segs=48, mat_idx=I_STONE, center=(0.0, 0.0, 0.0), smooth_side=False)

mesh_plat = bpy.data.meshes.new("gazebo-platform")
bm_plat.to_mesh(mesh_plat)
bm_plat.free()
for m in MATS:
    mesh_plat.materials.append(m)
obj_plat = bpy.data.objects.new("gazebo-platform", mesh_plat)
bpy.context.scene.collection.objects.link(obj_plat)

# PART 2: 'gazebo-columns' (10 columns at R_COL = 2.35, starting ang = -pi/2 (-Y Blender = +Z Three.js South!))
bm_cols = bmesh.new()
N_COLS = 10
R_COL = 2.35
COL_TOP = 2.66
for ci in range(N_COLS):
    ang = -math.pi * 0.5 + ci * math.tau / N_COLS
    add_fluted_column(bm_cols, 0.150, 0.390, COL_TOP, (math.cos(ang) * R_COL, math.sin(ang) * R_COL), ang)

mesh_cols = bpy.data.meshes.new("gazebo-columns")
bm_cols.to_mesh(mesh_cols)
bm_cols.free()
for m in MATS:
    mesh_cols.materials.append(m)
obj_cols = bpy.data.objects.new("gazebo-columns", mesh_cols)
bpy.context.scene.collection.objects.link(obj_cols)

# PART 3: 'gazebo' (Floor brass inlay at y=0.302, cornice, brass eave collar, 10 ribs + dome, vines)
bm_top = bmesh.new()

ak.add_lathe(bm_top, [(1.55, 0.302), (1.55, 0.310), (1.43, 0.310), (1.43, 0.302)], segs=32, mat_idx=I_GOLD, smooth_side=False)
ak.add_lathe(bm_top, [(0.66, 0.302), (0.66, 0.310), (0.56, 0.310), (0.56, 0.302)], segs=24, mat_idx=I_GOLD, smooth_side=False)
ak.add_lathe(bm_top, [(0.00, 0.302), (0.38, 0.302), (0.38, 0.310), (0.00, 0.310)], segs=24, mat_idx=I_CREAM, smooth_side=False)

ak.add_lathe(bm_top, [
    (2.12, 2.66), (2.52, 2.66), (2.56, 2.74), (2.48, 2.78),
    (2.48, 2.94), (2.60, 2.98), (2.64, 3.06), (2.10, 3.06), (2.12, 2.66),
], segs=40, mat_idx=I_STONE, smooth_side=False)
ak.add_lathe(bm_top, [(2.50, 2.78), (2.50, 2.94)], segs=40, mat_idx=I_TEAL, smooth_side=True)
for mi in range(20):
    a = -math.pi * 0.5 + mi * math.tau / 20.0
    ak.add_sphere(bm_top, (math.cos(a) * 2.51, math.sin(a) * 2.51, 2.86), 0.055, (1, 1, 1), 1, I_GOLD, smooth=True)

ak.add_lathe(bm_top, [
    (2.38, 3.05), (2.54, 3.05), (2.56, 3.12), (2.48, 3.16), (2.36, 3.12),
], segs=40, mat_idx=I_GOLD, smooth_side=True)

for ci in range(N_COLS):
    a = -math.pi * 0.5 + ci * math.tau / N_COLS
    px, py = math.cos(a) * 2.50, math.sin(a) * 2.50
    ak.add_lathe(bm_top, [
        (0.085, 3.06), (0.095, 3.10), (0.055, 3.13), (0.085, 3.20), (0.045, 3.27), (0.0, 3.33),
    ], 12, I_GOLD, center=(px, py, 0.0), smooth_side=True)

n_lat = 11
n_lon = 30
dome_rings = []
def dome_rz(u):
    r = 2.48 * math.cos(u * math.pi * 0.445) * (1.0 + 0.03 * math.sin(u * math.pi * 2.0))
    z = 3.10 + 1.14 * math.sin(u * math.pi * 0.485)
    return r, z

for li in range(n_lat):
    u = li / (n_lat - 1)
    r, z = dome_rz(u)
    ring = [bm_top.verts.new((math.cos(si * math.tau / n_lon) * r, math.sin(si * math.tau / n_lon) * r, z)) for si in range(n_lon)]
    dome_rings.append(ring)

dome_faces = []
for li in range(n_lat - 1):
    ra, rb = dome_rings[li], dome_rings[li + 1]
    for si in range(n_lon):
        dome_faces.append(bm_top.faces.new((ra[si], ra[(si + 1) % n_lon], rb[(si + 1) % n_lon], rb[si])))
r_top_ring = dome_rings[-1]
top_cap_c = bm_top.verts.new((0.0, 0.0, 4.24))
for si in range(n_lon):
    dome_faces.append(bm_top.faces.new((r_top_ring[si], r_top_ring[(si + 1) % n_lon], top_cap_c)))
bmesh.ops.recalc_face_normals(bm_top, faces=dome_faces)
ak.paint_faces(bm_top, dome_faces, I_DOME, smooth=True, uv_scale=0.35)

# Opaque Inward-Facing Coffered Cream Limestone Interior Ceiling Vault (NO sky bleed-through from inside!)
in_rings = []
for li in range(n_lat):
    u = li / (n_lat - 1)
    r, z = dome_rz(u)
    r_in = max(0.08, r - 0.14) if li > 0 else 2.26
    z_in = z - 0.06
    in_rings.append([bm_top.verts.new((math.cos(si * math.tau / n_lon) * r_in, math.sin(si * math.tau / n_lon) * r_in, z_in)) for si in range(n_lon)])
in_faces = []
for li in range(n_lat - 1):
    ra, rb = in_rings[li], in_rings[li + 1]
    for si in range(n_lon):
        # Reverse winding so normals face strictly INWARD & DOWNWARD toward players below!
        in_faces.append(bm_top.faces.new((ra[(si + 1) % n_lon], ra[si], rb[si], rb[(si + 1) % n_lon])))
in_top_ring = in_rings[-1]
in_cap_c = bm_top.verts.new((0.0, 0.0, 4.17))
for si in range(n_lon):
    in_faces.append(bm_top.faces.new((in_top_ring[(si + 1) % n_lon], in_top_ring[si], in_cap_c)))
# Explicit inward normal check (must NEVER run blind recalc_face_normals toward sky if open bottom!)
ak.paint_faces(bm_top, in_faces, I_CREAM, smooth=True, uv_scale=0.45)

# 10 Interior radial golden ceiling ribs + central interior overhead rosette boss!
for ci in range(N_COLS):
    a = -math.pi * 0.5 + ci * math.tau / N_COLS
    ca, sa = math.cos(a), math.sin(a)
    pts_in = [(ca * max(0.08, dome_rz(li / 9.0)[0] - 0.16), sa * max(0.08, dome_rz(li / 9.0)[0] - 0.16), dome_rz(li / 9.0)[1] - 0.07) for li in range(10)]
    for i in range(len(pts_in) - 1):
        ak.add_cyl(bm_top, pts_in[i], pts_in[i + 1], 0.026, 0.024, 6, I_GOLD, smooth=True)
ak.add_sphere(bm_top, (0.0, 0.0, 4.15), 0.24, (1.0, 1.0, 0.28), 1, I_GOLD, smooth=True)

for ci in range(N_COLS):
    a = -math.pi * 0.5 + ci * math.tau / N_COLS
    ca, sa = math.cos(a), math.sin(a)
    pts = [(ca * (dome_rz(li / 9.0)[0] + 0.025), sa * (dome_rz(li / 9.0)[0] + 0.025), dome_rz(li / 9.0)[1]) for li in range(10)]
    for i in range(len(pts) - 1):
        ak.add_cyl(bm_top, pts[i], pts[i + 1], 0.042, 0.036, 8, I_GOLD, smooth=True)
for hu in (0.35, 0.70):
    hr, hz = dome_rz(hu)
    hr += 0.024
    for si in range(n_lon):
        a0, a1 = si * math.tau / n_lon, (si + 1) * math.tau / n_lon
        ak.add_cyl(bm_top, (math.cos(a0) * hr, math.sin(a0) * hr, hz), (math.cos(a1) * hr, math.sin(a1) * hr, hz), 0.030, 0.030, 6, I_GOLD, smooth=True)

ak.add_lathe(bm_top, [
    (0.46, 4.18), (0.48, 4.24), (0.34, 4.27), (0.34, 4.37), (0.40, 4.40),
    (0.24, 4.49), (0.09, 4.54), (0.04, 4.60), (0.0, 4.65),
], 16, I_GOLD, smooth_side=True)

z_shaft0 = 0.495
z_shaft1 = COL_TOP - 0.28
for ci, seed in ((1, 301), (3, 302), (7, 303), (9, 304)):
    col_ang = -math.pi * 0.5 + ci * math.tau / N_COLS
    col_cx = math.cos(col_ang) * R_COL
    col_cy = math.sin(col_ang) * R_COL
    pts = []
    n_seg = 24
    stem_base_r = 0.022
    for k in range(n_seg + 1):
        t = k / n_seg
        z = 0.39 + t * (z_shaft1 + 0.04 - 0.39)
        t_sh = min(1.0, max(0.0, (z - z_shaft0) / (z_shaft1 - z_shaft0)))
        r_shaft = col_shaft_radius(t_sh) if z >= z_shaft0 else 0.165
        stem_r_t = stem_base_r * (1.10 - 0.52 * t)
        r_hug = r_shaft + stem_r_t * 0.95 + 0.008
        a = col_ang + t * math.tau * 1.45
        pts.append((col_cx + math.cos(a) * r_hug, col_cy + math.sin(a) * r_hug, z))
    ak.add_vine_climb(bm_top, pts, stem_base_r, I_TIMBER, I_LEAF, I_BLOOM, seed=seed, cling_center=(col_cx, col_cy))

mesh_top = bpy.data.meshes.new("gazebo")
bm_top.to_mesh(mesh_top)
bm_top.free()
for m in MATS:
    mesh_top.materials.append(m)
obj_top = bpy.data.objects.new("gazebo", mesh_top)
bpy.context.scene.collection.objects.link(obj_top)

bpy.context.view_layer.update()
ak.export_glb([obj_top, obj_plat, obj_cols], out_dir, "gazebo", (5.5, 5.5, 4.65), auto_center=False)
