import sys
import math
from pathlib import Path
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(r"C:/Users/kochu/Documents/BuiO")
SHARED = ROOT / "artifacts/moonbay-3d/asset-production/_shared"
sys.path.insert(0, str(SHARED))
import arch_kit as ak

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out_dir = Path(argv[0]) if argv else Path(__file__).resolve().parent

ak.reset_scene()

# 1. Procedural PBR Textures
stone_col, stone_rgh = ak.make_stone_textures(out_dir, "gazebo-stone", (0.90, 0.84, 0.72), (0.68, 0.60, 0.48), rows=6, cols=10, seed=201)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "gazebo-stucco", (0.95, 0.89, 0.79), (0.88, 0.78, 0.62), seed=202)
dome_col, dome_rgh = ak.make_copper_patina_textures(out_dir, "gazebo-copper", (0.06, 0.36, 0.32), (0.14, 0.56, 0.49), seed=203)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "gazebo-vine-wood", (0.44, 0.28, 0.16), (0.30, 0.18, 0.09), planks=4, seed=204)

# 2. Crisp PBR Materials (gold calibrated for both Cycles studio & Three.js hemisphere daylight)
M_STONE = ak.make_pbr_mat("GazeboLimestone", stone_col, stone_rgh, metallic=0.0)
M_CREAM = ak.make_pbr_mat("GazeboCreamTrim", stucco_col, stucco_rgh, metallic=0.0)
M_TEAL = ak.make_pbr_mat("GazeboFriezeTeal", color=(0.18, 0.56, 0.54), metallic=0.04, roughness=0.48)
M_DOME = ak.make_pbr_mat("GazeboCopperDome", dome_col, dome_rgh, metallic=0.28)
M_GOLD = ak.make_pbr_mat("GazeboGoldBrass", color=(0.94, 0.76, 0.34), metallic=0.48, roughness=0.32)
M_TIMBER = ak.make_pbr_mat("GazeboVineStem", wood_col, wood_rgh, metallic=0.0)
M_LEAF = ak.make_pbr_mat("GazeboVineLeaf", color=(0.24, 0.54, 0.22), metallic=0.0, roughness=0.52, double_sided=True)
M_BLOOM = ak.make_pbr_mat("GazeboBlossomPink", color=(0.96, 0.64, 0.68), metallic=0.0, roughness=0.45, double_sided=True)

MATS = [M_STONE, M_CREAM, M_TEAL, M_DOME, M_GOLD, M_TIMBER, M_LEAF, M_BLOOM]
I_STONE, I_CREAM, I_TEAL, I_DOME, I_GOLD, I_TIMBER, I_LEAF, I_BLOOM = range(8)


def add_fluted_column(bm, base_z, top_z, xy, r_base, r_top, n_flutes=12):
    """Build classical fluted Tuscan stone column with plinth, torus base, fluted shaft & molded capital."""
    cx, cy = xy
    # Square plinth base (z .. +0.12) and molded necking/abacus at top
    ak.add_box(bm, (cx, cy, base_z + 0.06), (0.36, 0.36, 0.12), I_STONE, bevel=0.015)
    ak.add_lathe(bm, [
        (0.165, base_z + 0.12), (0.175, base_z + 0.155), (0.145, base_z + 0.195), (r_base, base_z + 0.225),
    ], 16, I_CREAM, center=(cx, cy, 0.0), smooth_side=True)

    # Fluted shaft with subtle entasis + vertical flute valleys
    z0 = base_z + 0.225
    z1 = top_z - 0.28
    segs = n_flutes * 2  # alternating ridge & shallow valley around perimeter
    rings_z = 6
    rings = []
    for ri in range(rings_z + 1):
        t = ri / rings_z
        z = z0 + (z1 - z0) * t
        # Gentle classical entasis
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
            sn = (si + 1) % segs
            f = bm.faces.new((ra[si], ra[sn], rb[sn], rb[si]))
            shaft_faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=shaft_faces)
    ak.paint_faces(bm, shaft_faces, I_CREAM, smooth=True, uv_scale=0.55)

    # Astragal collar, torus echinus & square stone abacus reaching top_z
    ak.add_lathe(bm, [
        (r_top, z1), (r_top + 0.025, z1 + 0.04), (r_top + 0.015, z1 + 0.07),
        (r_top + 0.068, z1 + 0.145), (r_top + 0.078, z1 + 0.18),
    ], 16, I_CREAM, center=(cx, cy, 0.0), smooth_side=True)
    ak.add_box(bm, (cx, cy, top_z - 0.05), (0.38, 0.38, 0.10), I_STONE, bevel=0.015)


# ==============================================================================
# PART 1: 'gazebo-platform' (MUST preserve exact clean concentric flat tread Y rings!)
# ==============================================================================
bm_plat = bmesh.new()
# Exact 5 monotonic Y heights in Three.js (= Z in Blender): 0.00, 0.09, 0.18, 0.27, 0.36
# 48 segments -> 4 wide stepped concentric Tuscan limestone treads (radius 2.75 down to 2.30)
ak.add_lathe(bm_plat, [
    (0.000, 0.000), (2.750, 0.000), (2.750, 0.090),
    (2.605, 0.090), (2.605, 0.180),
    (2.455, 0.180), (2.455, 0.270),
    (2.300, 0.270), (2.300, 0.360),
    (0.000, 0.360),
], segs=48, mat_idx=I_STONE, center=(0.0, 0.0, 0.0), smooth_side=False)

mesh_plat = bpy.data.meshes.new("gazebo-platform")
bm_plat.to_mesh(mesh_plat)
bm_plat.free()
for m in MATS:
    mesh_plat.materials.append(m)
obj_plat = bpy.data.objects.new("gazebo-platform", mesh_plat)
bpy.context.scene.collection.objects.link(obj_plat)

# ==============================================================================
# PART 2: 'gazebo-columns' (8 fluted columns rotated 22.5° so N/S/E/W entries are wide open)
# ==============================================================================
bm_cols = bmesh.new()
R_COL = 2.04
for ci in range(8):
    ang = (ci + 0.5) * math.tau / 8.0
    add_fluted_column(bm_cols, 0.360, 2.820, (math.cos(ang) * R_COL, math.sin(ang) * R_COL), r_base=0.132, r_top=0.112)

mesh_cols = bpy.data.meshes.new("gazebo-columns")
bm_cols.to_mesh(mesh_cols)
bm_cols.free()
for m in MATS:
    mesh_cols.materials.append(m)
obj_cols = bpy.data.objects.new("gazebo-columns", mesh_cols)
bpy.context.scene.collection.objects.link(obj_cols)

# ==============================================================================
# PART 3: 'gazebo' (Compass Mosaic Inlay + Entablature Frieze + Bell Copper Dome + Cupola + Vines)
# ==============================================================================
bm_top = bmesh.new()

# Thin ornamental brass compass ring inlay flush above dais center (radius 1.48m, Z = 0.362..0.372)
ak.add_lathe(bm_top, [
    (1.48, 0.362), (1.48, 0.370), (1.36, 0.370), (1.36, 0.362),
], segs=32, mat_idx=I_GOLD, smooth_side=False)
ak.add_lathe(bm_top, [
    (0.55, 0.362), (0.55, 0.372), (0.00, 0.372),
], segs=24, mat_idx=I_TEAL, smooth_side=False)

# Molded Circular Entablature / Architrave / Frieze / Dentil Cornice (Z = 2.82 .. 3.24)
# Outer stone ring shell
ak.add_lathe(bm_top, [
    (1.86, 2.82), (2.22, 2.82), (2.26, 2.90), (2.18, 2.94),
    (2.18, 3.12), (2.34, 3.16), (2.38, 3.24), (1.84, 3.24), (1.86, 2.82),
], segs=32, mat_idx=I_STONE, smooth_side=False)
# Teal verdigris recessed frieze band & 16 brass medallion rosettes
ak.add_lathe(bm_top, [
    (2.20, 2.94), (2.20, 3.12),
], segs=32, mat_idx=I_TEAL, smooth_side=True)
for mi in range(16):
    a = mi * math.tau / 16.0
    ak.add_sphere(bm_top, (math.cos(a) * 2.21, math.sin(a) * 2.21, 3.03), 0.055, (1.0, 1.0, 1.0), 1, I_GOLD, smooth=True)

# 8 turned brass ball finials at column axes perched around the cornice perimeter
for ci in range(8):
    a = (ci + 0.5) * math.tau / 8.0
    px, py = math.cos(a) * 2.22, math.sin(a) * 2.22
    ak.add_lathe(bm_top, [
        (0.085, 3.24), (0.095, 3.28), (0.055, 3.31), (0.085, 3.38), (0.045, 3.45), (0.0, 3.51),
    ], 12, I_GOLD, center=(px, py, 0.0), smooth_side=True)

# Flared Bell-Curve Emerald-Copper Dome (Z = 3.24 .. 4.20)
n_lat = 10
n_lon = 24
dome_rings = []
for li in range(n_lat):
    u = li / (n_lat - 1)
    # S-curve bell profile: wide flared lip -> convex bulge -> gentle ogee crown
    r = 2.24 * math.cos(u * math.pi * 0.44) * (1.0 + 0.05 * math.sin(u * math.pi * 2.0))
    z = 3.24 + 0.96 * math.sin(u * math.pi * 0.48)
    ring = []
    for si in range(n_lon):
        a = si * math.tau / n_lon
        ring.append(bm_top.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
    dome_rings.append(ring)

dome_faces = []
for li in range(n_lat - 1):
    ra, rb = dome_rings[li], dome_rings[li + 1]
    for si in range(n_lon):
        sn = (si + 1) % n_lon
        dome_faces.append(bm_top.faces.new((ra[si], ra[sn], rb[sn], rb[si])))
# Close dome throat collar
r_top_ring = dome_rings[-1]
top_cap_c = bm_top.verts.new((0.0, 0.0, 4.20))
for si in range(n_lon):
    dome_faces.append(bm_top.faces.new((r_top_ring[si], r_top_ring[(si + 1) % n_lon], top_cap_c)))
bmesh.ops.recalc_face_normals(bm_top, faces=dome_faces)
ak.paint_faces(bm_top, dome_faces, I_DOME, smooth=True, uv_scale=0.35)

# 8 Golden Meridian Ribs hugging the bell-curve profile (rotated 22.5° aligned above the 8 columns!)
for ci in range(8):
    a = (ci + 0.5) * math.tau / 8.0
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for li in range(9):
        u = li / 8.0
        r = 2.26 * math.cos(u * math.pi * 0.44) * (1.0 + 0.05 * math.sin(u * math.pi * 2.0)) + 0.025
        z = 3.24 + 0.96 * math.sin(u * math.pi * 0.48)
        pts.append((ca * r, sa * r, z))
    for i in range(len(pts) - 1):
        ak.add_cyl(bm_top, pts[i], pts[i + 1], 0.042, 0.036, 8, I_GOLD, smooth=True)

# Top Crown Lantern & Finial Spire reaching Z = 4.65m
ak.add_lathe(bm_top, [
    (0.46, 4.16), (0.48, 4.22), (0.34, 4.24), (0.34, 4.34), (0.40, 4.37),
    (0.26, 4.46), (0.09, 4.52), (0.04, 4.58), (0.0, 4.65),
], 16, I_GOLD, smooth_side=True)
# Delicate climbing rose vines hugging 2 diagonal back/side columns + upper frieze
for ci, seed in ((1, 301), (6, 302)):
    ang = (ci + 0.5) * math.tau / 8.0
    r_v = R_COL + 0.145
    pts = []
    for k in range(5):
        a = ang + (k - 2) * 0.11
        z = 0.72 + k * 0.52
        pts.append((math.cos(a) * r_v, math.sin(a) * r_v, z))
    ak.add_vine_climb(bm_top, pts, 0.028, I_TIMBER, I_LEAF, I_BLOOM, seed=seed)

mesh_top = bpy.data.meshes.new("gazebo")
bm_top.to_mesh(mesh_top)
bm_top.free()
for m in MATS:
    mesh_top.materials.append(m)
obj_top = bpy.data.objects.new("gazebo", mesh_top)
bpy.context.scene.collection.objects.link(obj_top)

bpy.context.view_layer.update()
ak.export_glb([obj_top, obj_plat, obj_cols], out_dir, "gazebo", (5.5, 5.5, 4.65), auto_center=False)
