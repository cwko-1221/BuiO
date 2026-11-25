"""Build Moonbay Coast 3D Terracotta-Gable Porch Cottage v2 (cottage-clay):
Upgrades from v1 self-review:
1. Warm HONEY-AMBER cathedral stained glass (no washed-out white glass!) + leaded emerald attic roundel.
2. Seamless pentagon gable walls (zero mid-wall bevel crease) + ashlar limestone chimney with recessed dark flue.
3. Fuller botanical climbing corner vine + crisp bounds <= [6.90, 5.50, 5.70].
"""
import math
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "cc-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=511)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "cc-stucco", (0.95, 0.89, 0.76), (0.87, 0.77, 0.61), seed=512)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "cc-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=513)
door_col, door_rgh = ak.make_wood_textures(out_dir, "cc-door", (0.66, 0.34, 0.15), (0.43, 0.20, 0.08), planks=6, seed=514, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(out_dir, "cc-clay-roof", (0.88, 0.46, 0.18), (0.68, 0.31, 0.11), rows=8, cols=10, seed=515)
amber_col, amber_rgh = ak.make_stained_glass_textures(out_dir, "cc-amber-glass", (0.58, 0.22, 0.03), (0.94, 0.56, 0.12), seed=516)
attic_col, attic_rgh = ak.make_stained_glass_textures(out_dir, "cc-attic-glass", (0.04, 0.18, 0.17), (0.12, 0.44, 0.38), seed=517)

M_STONE = ak.make_pbr_mat("CcStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CcStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CcTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CcOakDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CcClayRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CcCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CcAmberGlass", amber_col, amber_rgh,
    metallic=0.10, roughness=0.07, coat=0.88, emission=(0.82, 0.36, 0.04), emission_strength=0.16
)
M_ATTIC = ak.make_pbr_mat("CcAtticGlass", attic_col, attic_rgh, metallic=0.18, roughness=0.06, coat=0.90)
M_BRASS = ak.make_pbr_mat("CcBrass", color=(0.96, 0.78, 0.34), metallic=0.45, roughness=0.28)
M_FLUE = ak.make_pbr_mat("CcFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_LEAF = ak.make_pbr_mat("CcLeaf", color=(0.24, 0.54, 0.18), roughness=0.48, double_sided=True)
M_FLOWER = ak.make_pbr_mat("CcWhiteFlower", color=(0.98, 0.94, 0.82), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CcLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_FLUE, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_FLUE, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()


def add_seamless_pentagon_gable_body(w: float, d: float, base_z: float, eave_z: float, peak_z: float, mat_idx: int):
    hw, hd = w * 0.5, d * 0.5
    pts_f = [
        bm.verts.new((-hw, -hd, base_z)), bm.verts.new((hw, -hd, base_z)),
        bm.verts.new((hw, -hd, eave_z)), bm.verts.new((0.0, -hd, peak_z)),
        bm.verts.new((-hw, -hd, eave_z)),
    ]
    pts_b = [
        bm.verts.new((-hw, hd, base_z)), bm.verts.new((hw, hd, base_z)),
        bm.verts.new((hw, hd, eave_z)), bm.verts.new((0.0, hd, peak_z)),
        bm.verts.new((-hw, hd, eave_z)),
    ]
    faces = [bm.faces.new(pts_f), bm.faces.new(list(reversed(pts_b)))]
    for i in range(5):
        j = (i + 1) % 5
        faces.append(bm.faces.new((pts_f[j], pts_f[i], pts_b[i], pts_b[j])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    ak.paint_faces(bm, faces, mat_idx, smooth=False, uv_scale=0.35)


WALL_W = 5.45
WALL_D = 4.65
BASE_H = 0.52
EAVE_Z = 2.92
RIDGE_Z = 5.52

# 1. Cut-Stone Double Foundation Plinth & Front Entrance Steps
ak.add_box(bm, (0.0, 0.0, 0.14), (WALL_W + 0.44, WALL_D + 0.44, 0.28), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, 0.40), (WALL_W + 0.30, WALL_D + 0.30, 0.24), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.28, 0.14), (2.20, 0.64, 0.28), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.15, 0.35), (1.84, 0.42, 0.18), I_STONE, bevel=0.02)

# 2. Seamless Stucco Body + Timber Corner Posts + Decorative Masonry Quoins
add_seamless_pentagon_gable_body(WALL_W, WALL_D, BASE_H, EAVE_Z, RIDGE_Z - 0.10, I_STUCCO)
for cx in (-WALL_W * 0.5 + 0.06, WALL_W * 0.5 - 0.06):
    for cy in (-WALL_D * 0.5 + 0.06, WALL_D * 0.5 - 0.06):
        ak.add_box(bm, (cx, cy, BASE_H + (EAVE_Z - BASE_H) * 0.5), (0.28, 0.28, EAVE_Z - BASE_H + 0.04), I_WOOD, bevel=0.015)

for qx, qz in ((-1.10, 2.82), (-0.72, 2.92), (-1.90, 0.90), (-2.20, 0.68)):
    ak.add_box(bm, (qx, -WALL_D * 0.5 - 0.01, qz), (0.38, 0.08, 0.18), I_STONE, bevel=0.012)

for gy in (-WALL_D * 0.5 - 0.06, WALL_D * 0.5 + 0.06):
    for bx in (-1.65, 0.0, 1.65):
        bz = RIDGE_Z - 0.55 - abs(bx) * 0.72
        ak.add_box(bm, (bx, gy, bz), (0.16, 0.24, 0.34), I_WOOD, bevel=0.015)

# 3. Arched Door + Signature Mini Terracotta Pitched Porch Canopy + Honey-Amber Windows
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.46, 2.12, 0.0, I_DOOR, I_CREAM, I_BRASS)
ak.add_wall_lantern(bm, (-0.96, -WALL_D * 0.5 - 0.02, BASE_H + 1.50), 0.0, I_WOOD, I_LANTERN)

ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, -WALL_D * 0.5 - 0.32),
    ridge_span=0.80,
    eave_span=2.04,
    eave_z=BASE_H + 2.06,
    ridge_z=BASE_H + 2.64,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=2,
    tile_cols=2,
    bell_flare=0.08,
    bargeboard_t=0.14,
)
for b_s in (-1, 1):
    ak.add_box(bm, (b_s * 0.84, -WALL_D * 0.5 - 0.20, BASE_H + 1.90), (0.14, 0.44, 0.32), I_WOOD, bevel=0.012, rot_euler=(-0.45, 0, 0))

for sx in (-1, 1):
    ak.add_arched_window(
        bm, (sx * 1.72, -WALL_D * 0.5 - 0.03, BASE_H + 1.06), 1.00, 1.36, 0.0,
        I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
    )
    ak.add_arched_window(
        bm, (sx * 1.32, WALL_D * 0.5 + 0.03, BASE_H + 1.14), 1.06, 1.40, math.pi,
        I_CREAM, I_GLASS, I_CREAM, cross_mullions=True
    )

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-1.10, 1.10):
        ak.add_arched_window(bm, (side_x, wy, BASE_H + 1.16), 1.06, 1.42, yaw, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.88), 0.46, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.88), 0.46, math.pi, I_CREAM, I_ATTIC)

# 4. Main Terracotta Gable Roof + Ashlar Limestone Chimney + Rich Corner Vine
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=5.12,
    eave_span=6.60,
    eave_z=EAVE_Z - 0.06,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=6,
    tile_cols=9,
    bell_flare=0.12,
    bargeboard_t=0.22,
)
ak.add_box(bm, (1.62, 1.10, 4.74), (0.76, 0.76, 1.60), I_STONE, bevel=0.025)
ak.add_box(bm, (1.62, 1.10, 5.58), (0.92, 0.92, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (1.62, 1.10, 5.66), (0.56, 0.56, 0.04), I_FLUE)

ak.add_vine_climb(
    bm,
    [(WALL_W * 0.5 - 0.22, -WALL_D * 0.5 - 0.04, 0.54),
     (WALL_W * 0.5 - 0.06, -WALL_D * 0.5 - 0.08, 1.32),
     (WALL_W * 0.5 - 0.22, -WALL_D * 0.5 - 0.06, 2.08),
     (WALL_W * 0.5 - 0.35, -WALL_D * 0.5 - 0.05, 2.86),
     (WALL_W * 0.5 - 0.95, -WALL_D * 0.5 - 0.05, 3.35)],
    0.036, I_WOOD, I_LEAF, I_FLOWER, seed=518
)

mesh = bpy.data.meshes.new("cottage-clay")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-clay", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-clay", (6.9, 5.5, 5.7))
