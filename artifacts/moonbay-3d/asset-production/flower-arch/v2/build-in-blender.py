"""Build Moonbay Coast 3D Garden Flower Arch v2 (flower-arch):
Rich layered botanical sunflower & rose garlands with dense leaf clusters crowning double-rail honey-oak timber trellis
on carved limestone plinths (ASSETS['flower-arch'].size = [3.2, 1.05, 3.05]).
"""
import sys
import math
import random
from pathlib import Path
import bmesh
import bpy
from mathutils import Vector

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "arch-stone", (0.91, 0.84, 0.72), (0.68, 0.60, 0.48), rows=6, cols=8, seed=211)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "arch-oak", (0.56, 0.35, 0.19), (0.34, 0.20, 0.09), planks=5, seed=212)

M_STONE = ak.make_pbr_mat("ArchLimestone", stone_col, stone_rgh, metallic=0.0)
M_OAK = ak.make_pbr_mat("ArchTimber", wood_col, wood_rgh, metallic=0.0)
M_BRASS = ak.make_pbr_mat("ArchBronze", color=(0.92, 0.72, 0.30), metallic=0.46, roughness=0.30)
M_LANTERN = ak.make_pbr_mat("ArchLanternGlow", color=(1.0, 0.90, 0.58), roughness=0.22, emission=(1.0, 0.85, 0.45), emission_strength=1.5)
M_LEAF = ak.make_pbr_mat("ArchVineLeaf", color=(0.20, 0.54, 0.20), roughness=0.50, double_sided=True)
M_LEAF_L = ak.make_pbr_mat("ArchVineLeafFresh", color=(0.34, 0.66, 0.24), roughness=0.46, double_sided=True)
M_SUN = ak.make_pbr_mat("ArchSunflowerGold", color=(1.00, 0.80, 0.12), roughness=0.38, double_sided=True)
M_ROSE = ak.make_pbr_mat("ArchRoseCoral", color=(0.98, 0.52, 0.58), roughness=0.40, double_sided=True)
M_SEED = ak.make_pbr_mat("ArchSeedDisk", color=(0.30, 0.16, 0.06), roughness=0.72)

MATS = [M_STONE, M_OAK, M_BRASS, M_LANTERN, M_LEAF, M_LEAF_L, M_SUN, M_ROSE, M_SEED]
I_STONE, I_OAK, I_BRASS, I_LANTERN, I_LEAF, I_LEAF_L, I_SUN, I_ROSE, I_SEED = range(len(MATS))

bm = bmesh.new()

# 1. Twin Stepped Limestone Plinth Pedestals at X = +/- 1.30m (wide 2.04m clear center passage!)
for side in (-1, 1):
    px = side * 1.30
    ak.add_box(bm, (px, 0.0, 0.14), (0.60, 0.98, 0.28), I_STONE, bevel=0.025)
    ak.add_box(bm, (px, 0.0, 0.34), (0.50, 0.86, 0.14), I_STONE, bevel=0.020)
    ak.add_box(bm, (px, 0.0, 0.44), (0.56, 0.92, 0.08), I_STONE, bevel=0.020)

# 2. Double-Frame Curved Timber Trellis Arch
HALF_SPAN = 1.30
SPRING_Z = 1.56
ARC_STEPS = 14
Y_RAILS = (-0.26, 0.26)


def arch_point(u):
    ang = math.pi * (1.0 - u)
    return (math.cos(ang) * HALF_SPAN, SPRING_Z + math.sin(ang) * HALF_SPAN)


for ry in Y_RAILS:
    for side in (-1, 1):
        ak.add_box(bm, (side * HALF_SPAN, ry, 1.02), (0.14, 0.13, 1.10), I_OAK, bevel=0.015)
        ak.add_box(bm, (side * HALF_SPAN, ry, 0.54), (0.17, 0.16, 0.09), I_BRASS, bevel=0.01)
        ak.add_box(bm, (side * HALF_SPAN, ry, SPRING_Z), (0.17, 0.16, 0.09), I_BRASS, bevel=0.01)
    for i in range(ARC_STEPS):
        x0, z0 = arch_point(i / ARC_STEPS)
        x1, z1 = arch_point((i + 1) / ARC_STEPS)
        ak.add_cyl(bm, (x0, ry, z0), (x1, ry, z1), 0.072, 0.072, 8, I_OAK, smooth=False)

for rz in (0.86, 1.24):
    for side in (-1, 1):
        ak.add_cyl(bm, (side * HALF_SPAN, -0.32, rz), (side * HALF_SPAN, 0.32, rz), 0.032, 0.032, 8, I_OAK, smooth=True)
for i in range(1, 10):
    ax, az = arch_point(i / 10.0)
    ak.add_cyl(bm, (ax, -0.34, az), (ax, 0.34, az), 0.032, 0.032, 8, I_OAK, smooth=True)

ak.add_box(bm, (0.0, 0.0, 2.86), (0.26, 0.64, 0.14), I_OAK, bevel=0.02)
ak.add_box(bm, (0.0, 0.0, 2.95), (0.16, 0.68, 0.06), I_BRASS, bevel=0.01)

for side in (-1, 1):
    lx = side * (HALF_SPAN - 0.18)
    ak.add_cyl(bm, (side * HALF_SPAN, 0.0, SPRING_Z - 0.12), (lx, 0.0, SPRING_Z - 0.12), 0.020, 0.016, 8, I_BRASS, smooth=True)
    ak.add_cyl(bm, (lx, 0.0, SPRING_Z - 0.12), (lx, 0.0, SPRING_Z - 0.22), 0.012, 0.012, 6, I_BRASS, smooth=True)
    ak.add_lathe(bm, [
        (0.065, SPRING_Z - 0.38), (0.080, SPRING_Z - 0.28), (0.095, SPRING_Z - 0.25), (0.0, SPRING_Z - 0.21),
    ], 8, I_BRASS, center=(lx, 0.0, 0.0), smooth_side=False)
    ak.add_sphere(bm, (lx, 0.0, SPRING_Z - 0.32), 0.055, (1.0, 1.0, 1.25), 1, I_LANTERN, smooth=True)


# 3. Fuller Layered Two-Row Sunflower & Rose Garland + Lush Leaf Rosettes
def add_rich_sunflower(center, normal_dir, radius=0.17, petal_mat=I_SUN):
    c = Vector(center)
    n = Vector(normal_dir).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    # Calyx green backing collar behind flower base
    ak.add_sphere(bm, c - n * 0.025, radius * 0.42, (1.0, 1.0, 0.65), 1, I_LEAF, smooth=False)
    # Domed dark brown seed center
    disk_pts = []
    segs = 8
    for i in range(segs):
        a = i * math.tau / segs
        disk_pts.append(bm.verts.new(c + (u * math.cos(a) + v * math.sin(a)) * (radius * 0.40) + n * 0.015))
    f_disk = bm.faces.new(disk_pts)
    apex_v = bm.verts.new(c + n * (radius * 0.30))
    seed_faces = [bm.faces.new((disk_pts[i], disk_pts[(i + 1) % segs], apex_v)) for i in range(segs)]
    bmesh.ops.recalc_face_normals(bm, faces=seed_faces + [f_disk])
    ak.paint_faces(bm, seed_faces + [f_disk], I_SEED, smooth=True, uv_scale=1.0)
    # Double ring of 10 overlapping full petals
    petal_faces = []
    n_petals = 10
    for pi in range(n_petals):
        a = pi * math.tau / n_petals
        rd = u * math.cos(a) + v * math.sin(a)
        sd = -u * math.sin(a) + v * math.cos(a)
        layer_off = (pi % 2) * 0.016
        p0 = bm.verts.new(c + rd * (radius * 0.32) + n * layer_off)
        p1 = bm.verts.new(c + rd * (radius * 0.72) + sd * (radius * 0.22) + n * (0.028 + layer_off))
        p2 = bm.verts.new(c + rd * radius - n * 0.010 + n * layer_off)
        p3 = bm.verts.new(c + rd * (radius * 0.72) - sd * (radius * 0.22) + n * (0.028 + layer_off))
        petal_faces.append(bm.faces.new((p0, p1, p2, p3)))
    bmesh.ops.recalc_face_normals(bm, faces=petal_faces)
    ak.paint_faces(bm, petal_faces, petal_mat, smooth=True, uv_scale=1.0)


def add_leaf(center, fwd, outward, size=0.18, mat_idx=I_LEAF):
    c = Vector(center)
    f = Vector(fwd).normalized()
    o = Vector(outward).normalized()
    s = f.cross(o).normalized()
    v0 = bm.verts.new(c)
    v1 = bm.verts.new(c + f * (size * 0.48) + s * (size * 0.38) + o * (size * 0.08))
    v2 = bm.verts.new(c + f * size)
    v3 = bm.verts.new(c + f * (size * 0.48) - s * (size * 0.38) + o * (size * 0.08))
    face = bm.faces.new((v0, v1, v2, v3))
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    ak.paint_faces(bm, [face], mat_idx, smooth=False, uv_scale=1.0)


rng = random.Random(219)
for side in (-1, 1):
    # Spiral post vine cleanly wrapping piers
    pts_post = [(side * HALF_SPAN + math.cos(k * 1.15 * side) * 0.13, math.sin(k * 1.15 * side) * 0.27, 0.50 + (k / 6.0) * 1.15) for k in range(7)]
    ak.add_vine_climb(bm, pts_post, 0.030, I_OAK, I_LEAF, None, seed=210 + side)
    # Lush braided arch garland climbing over top rail with dense twin-layered leaf tufts
    pts_arc = []
    for k in range(11):
        u = (k / 10.0) * 0.49 if side < 0 else 1.0 - (k / 10.0) * 0.49
        ax, az = arch_point(u)
        vy = math.sin(k * 1.1) * 0.29
        pts_arc.append((ax, vy, az + 0.02))
    for k in range(len(pts_arc) - 1):
        ak.add_cyl(bm, pts_arc[k], pts_arc[k + 1], 0.028, 0.022, 6, I_OAK, smooth=True)
        for sub in (0.15, 0.45, 0.75):
            p = Vector(pts_arc[k]).lerp(Vector(pts_arc[k + 1]), sub)
            for flip in (-1, 1):
                out = Vector((rng.uniform(-0.4, 0.4), flip * 0.85, rng.uniform(0.3, 1.0))).normalized()
                fwd = Vector((rng.uniform(-0.7, 0.7), flip * rng.uniform(0.4, 0.9), rng.uniform(0.2, 0.8))).normalized()
                add_leaf(p, fwd, out, size=rng.uniform(0.18, 0.27), mat_idx=I_LEAF if rng.random() < 0.6 else I_LEAF_L)

# Abundant front + back + crest Hero Sunflower & Coral Rose Garland (kept within Y in [-0.46, +0.46])
for u in (0.04, 0.13, 0.23, 0.34, 0.44, 0.50, 0.56, 0.66, 0.77, 0.87, 0.96):
    ax, az = arch_point(u)
    ang_norm = math.pi * (1.0 - u)
    radial = Vector((math.cos(ang_norm), 0.0, math.sin(ang_norm))).normalized()
    mat_front = I_ROSE if int(round(u * 10)) % 3 == 1 else I_SUN
    mat_back = I_SUN if mat_front == I_ROSE else I_ROSE
    rad = 0.18 if abs(u - 0.5) < 0.08 or (int(round(u * 10)) % 2 == 0) else 0.145
    # Front blossom
    add_rich_sunflower((ax, -0.34, az + 0.03), (radial.x * 0.4, -0.9, 0.35 + radial.z * 0.3), radius=rad, petal_mat=mat_front)
    # Rear blossom (offset slightly in u so every silhouette view is rich and dimensional)
    if int(round(u * 10)) % 2 == 0:
        add_rich_sunflower((ax, 0.34, az + 0.03), (radial.x * 0.4, 0.9, 0.35 + radial.z * 0.3), radius=rad * 0.94, petal_mat=mat_back)
    # Cresting upward blossom along top extrados for hero 3/4 silhouette
    if 0.18 <= u <= 0.82 and int(round(u * 10)) % 2 == 1:
        add_rich_sunflower((ax, 0.0, az + 0.10), radial + Vector((0, 0, 0.5)), radius=0.16, petal_mat=I_SUN)

# Lower pier accents well below lanterns (z = 0.82 & 1.16)
for side in (-1, 1):
    add_rich_sunflower((side * HALF_SPAN, -0.35, 0.86), (side * 0.2, -1.0, 0.2), radius=0.155, petal_mat=I_SUN)
    add_rich_sunflower((side * HALF_SPAN, -0.35, 1.24), (side * 0.2, -1.0, 0.2), radius=0.15, petal_mat=I_ROSE)
    add_rich_sunflower((side * HALF_SPAN, 0.35, 1.05), (side * 0.2, 1.0, 0.2), radius=0.15, petal_mat=I_SUN)

mesh = bpy.data.meshes.new("flower-arch")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("flower-arch", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "flower-arch", (3.2, 1.05, 3.05), auto_center=True)
