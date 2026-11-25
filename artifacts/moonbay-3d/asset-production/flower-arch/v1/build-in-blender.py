import sys
import math
import random
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "arch-stone", (0.90, 0.84, 0.72), (0.68, 0.60, 0.48), rows=6, cols=8, seed=211)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "arch-oak", (0.58, 0.37, 0.20), (0.36, 0.21, 0.10), planks=5, seed=212)

M_STONE = ak.make_pbr_mat("ArchLimestone", stone_col, stone_rgh, metallic=0.0)
M_OAK = ak.make_pbr_mat("ArchTimber", wood_col, wood_rgh, metallic=0.0)
M_BRASS = ak.make_pbr_mat("ArchBronze", color=(0.92, 0.72, 0.30), metallic=0.48, roughness=0.32)
M_LANTERN = ak.make_pbr_mat("ArchLanternGlow", color=(1.0, 0.90, 0.58), roughness=0.22, emission=(1.0, 0.85, 0.45), emission_strength=1.5)
M_LEAF = ak.make_pbr_mat("ArchVineLeaf", color=(0.24, 0.55, 0.22), roughness=0.52, double_sided=True)
M_LEAF_LIGHT = ak.make_pbr_mat("ArchVineLeafFresh", color=(0.35, 0.65, 0.26), roughness=0.48, double_sided=True)
M_PETAL_SUN = ak.make_pbr_mat("ArchPetalGold", color=(0.98, 0.78, 0.18), roughness=0.40, double_sided=True)
M_PETAL_ROSE = ak.make_pbr_mat("ArchPetalRose", color=(0.95, 0.58, 0.64), roughness=0.42, double_sided=True)
M_CENTER = ak.make_pbr_mat("ArchSeedDisk", color=(0.32, 0.18, 0.08), roughness=0.76)

MATS = [M_STONE, M_OAK, M_BRASS, M_LANTERN, M_LEAF, M_LEAF_LIGHT, M_PETAL_SUN, M_PETAL_ROSE, M_CENTER]
I_STONE, I_OAK, I_BRASS, I_LANTERN, I_LEAF, I_LEAF_L, I_SUN, I_ROSE, I_SEED = range(9)

bm = bmesh.new()

# 1. Twin Stepped Limestone Plinth Pedestals at X = +/- 1.30m (wide 2.04m clear center passage!)
for side in (-1, 1):
    px = side * 1.30
    ak.add_box(bm, (px, 0.0, 0.14), (0.60, 0.98, 0.28), I_STONE, bevel=0.025)
    ak.add_box(bm, (px, 0.0, 0.34), (0.50, 0.86, 0.14), I_STONE, bevel=0.020)
    ak.add_box(bm, (px, 0.0, 0.44), (0.56, 0.92, 0.08), I_STONE, bevel=0.020)

# 2. Double-Frame Curved Timber Trellis Arch (Front & Rear rails y = +/- 0.26m + Ladder Rungs)
HALF_SPAN = 1.30
SPRING_Z = 1.56
ARC_STEPS = 14
Y_RAILS = (-0.26, 0.26)

def arch_point(u):
    """Parameter u in [0, 1] left-bottom -> crown -> right-bottom."""
    ang = math.pi * (1.0 - u)
    return (math.cos(ang) * HALF_SPAN, SPRING_Z + math.sin(ang) * HALF_SPAN)

for ry in Y_RAILS:
    for side in (-1, 1):
        # Twin vertical posts per pier
        ak.add_box(bm, (side * HALF_SPAN, ry, 1.02), (0.14, 0.13, 1.10), I_OAK, bevel=0.015)
        ak.add_box(bm, (side * HALF_SPAN, ry, 0.54), (0.17, 0.16, 0.09), I_BRASS, bevel=0.01)
        ak.add_box(bm, (side * HALF_SPAN, ry, SPRING_Z), (0.17, 0.16, 0.09), I_BRASS, bevel=0.01)
    for i in range(ARC_STEPS):
        x0, z0 = arch_point(i / ARC_STEPS)
        x1, z1 = arch_point((i + 1) / ARC_STEPS)
        ak.add_cyl(bm, (x0, ry, z0), (x1, ry, z1), 0.072, 0.072, 8, I_OAK, smooth=False)

# Cross trellis rungs connecting front/back rails vertically & over arch
for rz in (0.86, 1.24):
    for side in (-1, 1):
        ak.add_cyl(bm, (side * HALF_SPAN, -0.32, rz), (side * HALF_SPAN, 0.32, rz), 0.032, 0.032, 8, I_OAK, smooth=True)
for i in range(1, 10):
    u = i / 10.0
    ax, az = arch_point(u)
    ak.add_cyl(bm, (ax, -0.34, az), (ax, 0.34, az), 0.032, 0.032, 8, I_OAK, smooth=True)

# Carved Brass-Crested Timber Keystone & Finial Peak at Z = 3.05m
ak.add_box(bm, (0.0, 0.0, 2.86), (0.26, 0.64, 0.14), I_OAK, bevel=0.02)
ak.add_box(bm, (0.0, 0.0, 2.95), (0.16, 0.68, 0.06), I_BRASS, bevel=0.01)

# Hanging Inner-Pier Garden Lanterns facing inward under the arch springline
for side in (-1, 1):
    lx = side * (HALF_SPAN - 0.16)
    ak.add_cyl(bm, (side * HALF_SPAN, 0.0, SPRING_Z - 0.10), (lx, 0.0, SPRING_Z - 0.10), 0.020, 0.016, 8, I_BRASS, smooth=True)
    ak.add_cyl(bm, (lx, 0.0, SPRING_Z - 0.10), (lx, 0.0, SPRING_Z - 0.20), 0.012, 0.012, 6, I_BRASS, smooth=True)
    ak.add_lathe(bm, [
        (0.065, SPRING_Z - 0.36), (0.080, SPRING_Z - 0.26), (0.095, SPRING_Z - 0.23), (0.0, SPRING_Z - 0.19),
    ], 8, I_BRASS, center=(lx, 0.0, 0.0), smooth_side=False)
    ak.add_sphere(bm, (lx, 0.0, SPRING_Z - 0.30), 0.055, (1.0, 1.0, 1.25), 1, I_LANTERN, smooth=True)

# 3. Articulated Botanical Vine Tendrils, Individual Leaves & Multi-Petal Sunflowers/Roses
def add_sunflower_bloom(center, normal_dir, radius=0.14, petal_mat=I_SUN, n_petals=9):
    c = Vector(center)
    n = Vector(normal_dir).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    # Domed dark seed disk
    disk_pts = []
    segs = 8
    for i in range(segs):
        a = i * math.tau / segs
        disk_pts.append(bm.verts.new(c + (u * math.cos(a) + v * math.sin(a)) * (radius * 0.42) + n * 0.01))
    f_disk = bm.faces.new(disk_pts)
    apex_v = bm.verts.new(c + n * (radius * 0.28))
    seed_faces = []
    for i in range(segs):
        seed_faces.append(bm.faces.new((disk_pts[i], disk_pts[(i + 1) % segs], apex_v)))
    bmesh.ops.recalc_face_normals(bm, faces=seed_faces + [f_disk])
    ak.paint_faces(bm, seed_faces + [f_disk], I_SEED, smooth=True, uv_scale=1.0)
    # Individual cupped petals around disk
    petal_faces = []
    for pi in range(n_petals):
        a = pi * math.tau / n_petals
        rad_dir = u * math.cos(a) + v * math.sin(a)
        side_dir = -u * math.sin(a) + v * math.cos(a)
        p0 = bm.verts.new(c + rad_dir * (radius * 0.35))
        p1 = bm.verts.new(c + rad_dir * (radius * 0.72) + side_dir * (radius * 0.18) + n * 0.025)
        p2 = bm.verts.new(c + rad_dir * radius - n * 0.015)
        p3 = bm.verts.new(c + rad_dir * (radius * 0.72) - side_dir * (radius * 0.18) + n * 0.025)
        petal_faces.append(bm.faces.new((p0, p1, p2, p3)))
    bmesh.ops.recalc_face_normals(bm, faces=petal_faces)
    ak.paint_faces(bm, petal_faces, petal_mat, smooth=True, uv_scale=1.0)

def add_leaf(center, fwd, outward, size=0.14, mat_idx=I_LEAF):
    c = Vector(center)
    f = Vector(fwd).normalized()
    o = Vector(outward).normalized()
    s = f.cross(o).normalized()
    v0 = bm.verts.new(c)
    v1 = bm.verts.new(c + f * (size * 0.48) + s * (size * 0.36) + o * (size * 0.08))
    v2 = bm.verts.new(c + f * size)
    v3 = bm.verts.new(c + f * (size * 0.48) - s * (size * 0.36) + o * (size * 0.08))
    face = bm.faces.new((v0, v1, v2, v3))
    ak.paint_faces(bm, [face], mat_idx, smooth=False, uv_scale=1.0)

rng = random.Random(215)
# Spiral vines climbing left & right piers and meeting gently over arch shoulders
for side in (-1, 1):
    # Post climb
    pts_post = []
    for k in range(7):
        t = k / 6.0
        a = k * 1.15 * side
        pts_post.append((side * HALF_SPAN + math.cos(a) * 0.12, math.sin(a) * 0.25, 0.48 + t * 1.32))
    for k in range(len(pts_post) - 1):
        ak.add_cyl(bm, pts_post[k], pts_post[k + 1], 0.028, 0.024, 6, I_OAK, smooth=True)
        for sub in (0.25, 0.65, 0.90):
            p = Vector(pts_post[k]).lerp(Vector(pts_post[k + 1]), sub)
            out = Vector((side * rng.uniform(0.3, 1.0), rng.uniform(-0.9, 0.9), rng.uniform(0.2, 0.7))).normalized()
            fwd = Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.8, 0.8), rng.uniform(0.3, 1.0))).normalized()
            add_leaf(p, fwd, out, size=rng.uniform(0.15, 0.24), mat_idx=I_LEAF if rng.random() < 0.65 else I_LEAF_L)
    # Arch Garland following u = 0..0.46 (left) and 1.0..0.54 (right)
    pts_arc = []
    for k in range(9):
        u = (k / 8.0) * 0.47 if side < 0 else 1.0 - (k / 8.0) * 0.47
        ax, az = arch_point(u)
        vy = math.sin(k * 1.2) * 0.26
        pts_arc.append((ax + rng.uniform(-0.04, 0.04), vy, az + rng.uniform(-0.04, 0.04)))
    for k in range(len(pts_arc) - 1):
        ak.add_cyl(bm, pts_arc[k], pts_arc[k + 1], 0.025, 0.020, 6, I_OAK, smooth=True)
        for sub in (0.2, 0.55, 0.85):
            p = Vector(pts_arc[k]).lerp(Vector(pts_arc[k + 1]), sub)
            out = Vector((rng.uniform(-0.7, 0.7), rng.uniform(-1.0, 1.0), rng.uniform(0.2, 0.9))).normalized()
            fwd = Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.7, 0.7), rng.uniform(-0.3, 0.8))).normalized()
            add_leaf(p, fwd, out, size=rng.uniform(0.15, 0.23), mat_idx=I_LEAF if rng.random() < 0.65 else I_LEAF_L)

# Placed Hero Blooms facing both Front (-Y) and Rear (+Y) cleanly matched to SPRING_Z = 1.56 arch!
bloom_specs = [
    (-1.32, -0.40, 0.88, (0.0, -1.0, 0.25), 0.14, I_SUN),
    (-1.36, -0.39, 1.38, (-0.2, -1.0, 0.2), 0.16, I_SUN),
    (-1.12, -0.40, 2.12, (0.2, -1.0, 0.2), 0.15, I_ROSE),
    (-0.62, -0.40, 2.58, (0.15, -1.0, 0.25), 0.14, I_SUN),
    (0.0,  -0.42, 2.82, (0.0, -1.0, 0.20), 0.16, I_SUN),
    (0.62, -0.40, 2.58, (-0.15, -1.0, 0.25), 0.14, I_ROSE),
    (1.12, -0.40, 2.12, (-0.2, -1.0, 0.2), 0.15, I_SUN),
    (1.36, -0.39, 1.38, (0.2, -1.0, 0.2), 0.16, I_SUN),
    (1.32, -0.40, 0.88, (0.0, -1.0, 0.25), 0.14, I_ROSE),
    (-1.32,  0.40, 1.08, (0.0, 1.0, 0.25), 0.15, I_SUN),
    (-0.98,  0.40, 2.24, (0.2, 1.0, 0.25), 0.14, I_SUN),
    (0.0,   0.42, 2.82, (0.0, 1.0, 0.20), 0.15, I_ROSE),
    (0.98,  0.40, 2.24, (-0.2, 1.0, 0.25), 0.14, I_SUN),
    (1.32,  0.40, 1.08, (0.0, 1.0, 0.25), 0.15, I_SUN),
]
for bx, by, bz, nvec, rad, mat_id in bloom_specs:
    add_sunflower_bloom((bx, by, bz), nvec, radius=rad, petal_mat=mat_id, n_petals=9)

mesh = bpy.data.meshes.new("flower-arch")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("flower-arch", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "flower-arch", (3.2, 1.05, 3.05), auto_center=True)
