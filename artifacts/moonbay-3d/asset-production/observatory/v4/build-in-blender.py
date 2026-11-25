"""Build Moonbay Coast 3D Observatory v4 (observatory):
Resolves all 3 observatory v3 art-critic points cleanly:
1. Genuine VERTICAL beveled emerald plank doors (fixed double-transpose bug + beveled plank ribs + brass escutcheons, straps & kickplate!)
2. Rich leaded emerald cathedral stained-glass windows w/ per-pane jewel tonal variation + high clearcoat gloss (roughness ~0.06, coat=0.85)
3. Recessed dark glossy objective lens inside telescope brass muzzle ring + enriched deep emerald planter foliage.
"""
import math
import random
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()

stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "obs-stone", (0.90, 0.83, 0.69), (0.65, 0.57, 0.44), rows=8, cols=10, seed=101
)
stucco_col, stucco_rough = ak.make_stucco_textures(
    out_dir, "obs-stucco", (0.95, 0.88, 0.74), (0.88, 0.77, 0.59), seed=102
)
dome_col, dome_rough = ak.make_copper_patina_textures(
    out_dir, "obs-dome", (0.05, 0.36, 0.32), (0.14, 0.56, 0.49), seed=103
)
wood_col, wood_rough = ak.make_wood_textures(
    out_dir, "obs-door", (0.09, 0.38, 0.27), (0.04, 0.19, 0.14), planks=5, seed=104, vertical=True
)
timber_col, timber_rough = ak.make_wood_textures(
    out_dir, "obs-timber", (0.58, 0.39, 0.22), (0.36, 0.23, 0.12), planks=4, seed=105
)
glass_col, glass_rough = ak.make_stained_glass_textures(
    out_dir, "obs-stained-glass", (0.03, 0.17, 0.16), (0.10, 0.42, 0.36), seed=109
)

MAT_STONE = ak.make_pbr_mat("ObsStone", stone_col, stone_rough)
MAT_STUCCO = ak.make_pbr_mat("ObsStucco", stucco_col, stucco_rough)
MAT_DOME = ak.make_pbr_mat("ObsCopperDome", dome_col, dome_rough, metallic=0.30)
MAT_GOLD = ak.make_pbr_mat("ObsBrassGold", color=(0.95, 0.77, 0.34), metallic=0.58, roughness=0.25)
MAT_DOOR = ak.make_pbr_mat("ObsDoor", wood_col, wood_rough)
MAT_TIMBER = ak.make_pbr_mat("ObsTimber", timber_col, timber_rough)
MAT_GLASS = ak.make_pbr_mat("ObsCathedralGlass", glass_col, glass_rough, metallic=0.18, roughness=0.06, coat=0.90)
MAT_LENS = ak.make_pbr_mat("ObsTelescopeLens", color=(0.02, 0.08, 0.16), metallic=0.35, roughness=0.04, coat=1.0)
MAT_LANTERN = ak.make_pbr_mat("ObsLanternGlow", color=(1.0, 0.86, 0.46), roughness=0.20, emission=(1.0, 0.80, 0.38), emission_strength=1.5)
MAT_TEAL_TRIM = ak.make_pbr_mat("ObsTealTrim", color=(0.18, 0.56, 0.52), roughness=0.45)
MAT_SOIL = ak.make_pbr_mat("ObsSoil", color=(0.24, 0.16, 0.10), roughness=0.95)
MAT_FOLIAGE = ak.make_pbr_mat("ObsFoliage", color=(0.16, 0.44, 0.16), roughness=0.48, double_sided=True)
MAT_FOLIAGE_L = ak.make_pbr_mat("ObsFoliageFresh", color=(0.26, 0.58, 0.20), roughness=0.45, double_sided=True)
MAT_BLOOM = ak.make_pbr_mat("ObsBlossomGold", color=(0.98, 0.78, 0.22), roughness=0.40, double_sided=True)
MAT_BLOOM_W = ak.make_pbr_mat("ObsBlossomCream", color=(0.98, 0.94, 0.84), roughness=0.40, double_sided=True)

MATS = [
    MAT_STONE, MAT_STUCCO, MAT_DOME, MAT_GOLD, MAT_DOOR, MAT_TIMBER,
    MAT_GLASS, MAT_LENS, MAT_LANTERN, MAT_TEAL_TRIM, MAT_SOIL,
    MAT_FOLIAGE, MAT_FOLIAGE_L, MAT_BLOOM, MAT_BLOOM_W,
]
(I_STONE, I_STUCCO, I_DOME, I_GOLD, I_DOOR, I_TIMBER,
 I_GLASS, I_LENS, I_LANTERN, I_TEAL, I_SOIL,
 I_LEAF, I_LEAF_L, I_BLOOM, I_BLOOM_W) = range(len(MATS))

bm = bmesh.new()


def add_planter_garden(px: float, py: float, base_z: float, seed: int):
    rng = random.Random(seed)
    for li in range(72):
        ox = rng.uniform(-0.46, 0.46)
        oy = rng.uniform(-0.26, 0.26)
        h_bell = max(0.0, 1.0 - (ox / 0.50) ** 2 - (oy / 0.30) ** 2)
        oz = base_z + 0.02 + rng.uniform(0.0, 0.14 + 0.16 * h_bell)
        ang = math.atan2(oy, ox) + rng.uniform(-0.8, 0.8)
        pitch = rng.uniform(0.15, 0.85)
        fwd = Vector((math.cos(ang) * math.cos(pitch), math.sin(ang) * math.cos(pitch), math.sin(pitch))).normalized()
        out = Vector((math.cos(ang), math.sin(ang), 0.75)).normalized()
        ak.add_cambered_leaf(bm, (px + ox, py + oy, oz), fwd, out, rng.uniform(0.17, 0.25), rng.uniform(0.11, 0.15), I_LEAF if rng.random() < 0.6 else I_LEAF_L)
    for bi, (bx, by, bz, pmat) in enumerate([
        (-0.30, -0.10, base_z + 0.24, I_BLOOM),
        (-0.12, -0.16, base_z + 0.28, I_BLOOM_W),
        (0.06, -0.08, base_z + 0.32, I_BLOOM),
        (0.24, -0.12, base_z + 0.26, I_BLOOM_W),
        (-0.22, 0.08, base_z + 0.26, I_BLOOM_W),
        (0.00, 0.12, base_z + 0.30, I_BLOOM),
        (0.26, 0.08, base_z + 0.24, I_BLOOM),
    ]):
        c = Vector((px + bx, py + by, bz))
        rad = 0.095
        ak.add_sphere(bm, c, 0.026, (1, 1, 0.7), 1, I_GOLD, smooth=True)
        for pi in range(6):
            pa = pi * math.tau / 6.0 + bi * 0.3
            u = Vector((math.cos(pa), math.sin(pa), 0.18)).normalized()
            v = Vector((-math.sin(pa), math.cos(pa), 0.0))
            f = bm.faces.new((
                bm.verts.new(c),
                bm.verts.new(c + u * (rad * 0.55) + v * (rad * 0.28)),
                bm.verts.new(c + u * rad + Vector((0, 0, -0.015))),
                bm.verts.new(c + u * (rad * 0.55) - v * (rad * 0.28)),
            ))
            ak.paint_faces(bm, [f], pmat, smooth=True, uv_scale=1.0)


CX = 1.40
R_ROT = 3.35

ak.add_lathe(bm, [
    (0.0, 0.0), (3.78, 0.0), (3.78, 0.16), (3.64, 0.17), (3.64, 0.34), (3.48, 0.35), (3.48, 0.48), (0.0, 0.48)
], 28, I_STONE, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_box(bm, (-2.15, 0.0, 0.22), (5.70, 5.40, 0.44), I_STONE, bevel=0.04)
ak.add_box(bm, (-2.15, 0.0, 0.46), (5.50, 5.20, 0.10), I_STONE, bevel=0.025)

for s_i, (step_d, step_w, step_z, step_h) in enumerate([
    (1.15, 3.10, 0.08, 0.16),
    (0.84, 2.75, 0.24, 0.16),
    (0.55, 2.40, 0.40, 0.16),
]):
    ak.add_box(bm, (CX, -3.55 - (2 - s_i) * 0.22, step_z), (step_w, step_d, step_h), I_STONE, bevel=0.02)

for idx_p, px in enumerate((-2.55, 4.10)):
    py = -3.45 if px < 0 else -2.95
    ak.add_box(bm, (px, py, 0.34), (1.15, 0.78, 0.68), I_STONE, bevel=0.03)
    ak.add_box(bm, (px, py, 0.69), (1.24, 0.86, 0.10), I_STONE, bevel=0.02)
    ak.add_box(bm, (px, py, 0.72), (1.02, 0.66, 0.06), I_SOIL)
    add_planter_garden(px, py, 0.76, seed=180 + idx_p * 19)

ak.add_lathe(bm, [
    (R_ROT + 0.12, 0.48), (R_ROT + 0.12, 0.68), (R_ROT, 0.72), (R_ROT, 4.55),
    (R_ROT + 0.16, 4.65), (R_ROT + 0.24, 4.85), (R_ROT + 0.24, 5.04), (R_ROT + 0.05, 5.06)
], 24, I_STUCCO, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_lathe(bm, [(R_ROT + 0.18, 0.48), (R_ROT + 0.20, 0.56), (R_ROT + 0.14, 0.68)], 24, I_STONE, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_lathe(bm, [(R_ROT + 0.24, 4.74), (R_ROT + 0.28, 4.82), (R_ROT + 0.24, 4.90)], 24, I_GOLD, center=(CX, 0.0, 0.0), smooth_side=True)

for bi in range(8):
    ang = bi * math.tau / 8.0 + math.pi / 8.0
    px = CX + (R_ROT - 0.02) * math.cos(ang)
    py = (R_ROT - 0.02) * math.sin(ang)
    ak.add_box(bm, (px, py, 2.65), (0.34, 0.34, 3.85), I_STONE, bevel=0.025, rot_euler=(0, 0, ang))
    ak.add_box(bm, (px, py, 0.72), (0.44, 0.44, 0.24), I_STONE, bevel=0.02, rot_euler=(0, 0, ang))
    ak.add_box(bm, (px, py, 4.56), (0.46, 0.46, 0.26), I_STONE, bevel=0.02, rot_euler=(0, 0, ang))

ak.add_arched_door(bm, (CX, -R_ROT - 0.04, 0.48), 1.65, 2.75, 0.0, I_DOOR, I_STONE, I_GOLD)
for side in (-1, 1):
    ak.add_wall_lantern(bm, (CX + side * 1.18, -R_ROT + 0.04, 2.45), side * 0.25, I_GOLD, I_LANTERN)

for bay_ang in (0.0, math.pi * 0.25, math.pi * 0.5, math.pi * 0.75, -math.pi * 0.25, -math.pi * 0.75):
    wx = CX + (R_ROT + 0.02) * math.cos(bay_ang)
    wy = (R_ROT + 0.02) * math.sin(bay_ang)
    ak.add_arched_window(bm, (wx, wy, 2.55), 1.38, 2.25, bay_ang + math.pi * 0.5, I_STONE, I_GLASS, I_STONE, cross_mullions=True)

PORCH_COLS = [(-4.45, -2.20), (-4.45, 0.0), (-4.45, 2.20), (-2.35, -2.20), (-2.35, 2.20)]
for colx, coly in PORCH_COLS:
    ak.add_lathe(bm, [
        (0.32, 0.48), (0.32, 0.62), (0.24, 0.72), (0.21, 0.76), (0.18, 3.35),
        (0.24, 3.45), (0.31, 3.55), (0.31, 3.68)
    ], 16, I_STONE, center=(colx, coly, 0.0), smooth_side=True)
    ak.add_box(bm, (colx, coly, 0.54), (0.64, 0.64, 0.14), I_STONE, bevel=0.02)
    ak.add_box(bm, (colx, coly, 3.62), (0.66, 0.66, 0.16), I_STONE, bevel=0.02)

ak.add_box(bm, (-2.25, -2.20, 3.84), (3.88, 0.50, 0.34), I_STONE, bevel=0.025)
ak.add_box(bm, (-2.25, 2.20, 3.84), (3.88, 0.50, 0.34), I_STONE, bevel=0.025)
ak.add_box(bm, (-4.45, 0.0, 3.84), (0.52, 4.94, 0.34), I_STONE, bevel=0.025)
ak.add_box(bm, (-2.42, 0.0, 4.02), (3.88, 4.42, 0.14), I_TIMBER, bevel=0.015)
for jx in (-4.10, -3.40, -2.70, -2.00, -1.30):
    ak.add_box(bm, (jx, 0.0, 4.14), (0.14, 5.10, 0.14), I_TIMBER, bevel=0.015)

for bx, by, bw, bd in [(-2.45, -2.28, 3.84, 0.24), (-2.45, 2.28, 3.84, 0.24), (-4.52, 0.0, 0.24, 4.80)]:
    ak.add_box(bm, (bx, by, 4.30), (bw, bd, 0.42), I_STONE, bevel=0.02)
    ak.add_box(bm, (bx, by, 4.32), (max(0.14, bw - 0.18), max(0.14, bd - 0.18), 0.22), I_TEAL)
    ak.add_box(bm, (bx, by, 4.54), (bw + 0.06, bd + 0.06, 0.11), I_STONE, bevel=0.02)

for ppx, ppy in [(-4.52, -2.28), (-4.52, 2.28), (-2.35, -2.28), (-2.35, 2.28)]:
    ak.add_box(bm, (ppx, ppy, 4.44), (0.42, 0.42, 0.64), I_STONE, bevel=0.02)
    ak.add_sphere(bm, (ppx, ppy, 4.84), 0.12, (1.0, 1.0, 1.15), 1, I_GOLD, smooth=True)

ak.add_wall_lantern(bm, (-4.18, -2.18, 2.95), 0.0, I_GOLD, I_LANTERN)

for col_cx, col_cy, vseed in ((-4.45, -2.20, 107), (-2.35, -2.20, 113)):
    pts = []
    n_seg = 24
    for k in range(n_seg + 1):
        t = k / n_seg
        z = 0.60 + t * 2.86
        r_shaft = 0.21 * (1.0 - t) + 0.18 * t
        stem_r_t = 0.026 * (1.10 - 0.52 * t)
        r_hug = r_shaft + stem_r_t * 0.42
        a = -1.8 + t * math.tau * 1.4
        pts.append((col_cx + math.cos(a) * r_hug, col_cy + math.sin(a) * r_hug, z))
    ak.add_vine_climb(
        bm, pts, 0.026, I_TIMBER, I_LEAF_L if vseed == 113 else I_LEAF,
        I_BLOOM_W if vseed == 113 else I_BLOOM, seed=vseed, cling_center=(col_cx, col_cy)
    )

ak.add_ribbed_dome(bm, (CX, 0.0, 5.05), radius=3.40, height=2.60, dome_mat=I_DOME, rib_mat=I_GOLD, meridian_segs=24, rings=10, n_ribs=12)

ak.add_box(bm, (CX - 0.55, -1.95, 6.95), (0.92, 1.45, 0.55), I_GOLD, bevel=0.03, rot_euler=(0.55, 0.0, 0.35))
p_t0 = Vector((CX - 0.45, -1.75, 6.85))
p_t1 = Vector((CX - 0.85, -3.15, 7.62))
p_t2 = Vector((CX - 0.92, -3.32, 7.72))
ak.add_cyl(bm, p_t0, p_t1, 0.18, 0.24, 14, I_GOLD, smooth=True)
ak.add_cyl(bm, p_t1, p_t2, 0.27, 0.27, 14, I_GOLD, smooth=True)
# Recessed dark glossy optical glass objective lens seated slightly behind front telescope brass bezel!
lens_dir = (p_t2 - p_t1).normalized()
ak.add_cyl(bm, p_t2 - lens_dir * 0.035, p_t2 - lens_dir * 0.004, 0.215, 0.215, 16, I_LENS, smooth=True)

ak.add_lathe(bm, [
    (0.45, 7.56), (0.48, 7.66), (0.28, 7.76), (0.14, 7.86), (0.09, 8.20), (0.15, 8.28), (0.0, 8.40)
], 16, I_GOLD, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_sphere(bm, (CX, 0.0, 7.98), 0.16, (1.0, 1.0, 1.0), 2, I_GOLD, smooth=True)

mesh = bpy.data.meshes.new("observatory")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("observatory", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "observatory", (10.0, 8.4, 8.4))
