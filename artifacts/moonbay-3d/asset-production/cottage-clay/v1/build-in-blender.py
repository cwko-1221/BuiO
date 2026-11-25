"""Build Moonbay Coast 3D Terracotta-Gable Porch Cottage (cottage-clay):
Matches ASSETS['cottage-clay'].size = [6.9, 5.5, 5.7] & tripo-references/v1/cottage-clay.png:
- Tall warm cream-sand stucco cottage on stepped ashlar stone foundation + stone door landing + exposed wall quoins
- Corner honey-oak structural timber beams + carved gable eave knee brackets
- Signature pitched mini clay-tile front entrance canopy roof over arched honey-oak plank door & brass knob
- Warm golden glowing arched windows w/ floral window-boxes (front, right, left, rear) + round teal attic window
- Rich layered terracotta orange-clay gable tile roof, tall stone chimney (5.70m) & white-flower corner vine.
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

M_STONE = ak.make_pbr_mat("CcStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CcStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CcTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CcOakDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CcClayRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CcCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat("CcWarmGlass", color=(0.96, 0.74, 0.26), metallic=0.05, roughness=0.14, emission=(0.98, 0.72, 0.24), emission_strength=0.45)
M_ATTIC = ak.make_pbr_mat("CcAtticGlass", color=(0.04, 0.20, 0.18), metallic=0.22, roughness=0.10)
M_BRASS = ak.make_pbr_mat("CcBrass", color=(0.92, 0.74, 0.32), metallic=0.45, roughness=0.30)
M_LEAF = ak.make_pbr_mat("CcLeaf", color=(0.24, 0.56, 0.20), roughness=0.50, double_sided=True)
M_FLOWER = ak.make_pbr_mat("CcWhiteFlower", color=(0.98, 0.94, 0.82), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CcLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()

WALL_W = 5.60
WALL_D = 4.80
BASE_H = 0.52
EAVE_Z = 2.95
RIDGE_Z = 5.56

# 1. Cut-Stone Double Foundation Plinth & Center Front Entrance Steps
ak.add_box(bm, (0.0, 0.0, 0.14), (WALL_W + 0.48, WALL_D + 0.48, 0.28), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, 0.40), (WALL_W + 0.32, WALL_D + 0.32, 0.24), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.30, 0.14), (2.25, 0.68, 0.28), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.16, 0.35), (1.88, 0.44, 0.18), I_STONE, bevel=0.02)

# 2. Stucco Body + Exposed Masonry Corner Quoins + Timber Corner Posts + Front/Rear Gables
ak.add_box(bm, (0.0, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (WALL_W, WALL_D, EAVE_Z - BASE_H), I_STUCCO, bevel=0.02)
for cx in (-WALL_W * 0.5 + 0.06, WALL_W * 0.5 - 0.06):
    for cy in (-WALL_D * 0.5 + 0.06, WALL_D * 0.5 - 0.06):
        ak.add_box(bm, (cx, cy, BASE_H + (EAVE_Z - BASE_H) * 0.5), (0.28, 0.28, EAVE_Z - BASE_H + 0.04), I_WOOD, bevel=0.015)

# Decorative exposed stone quoin bricks on front lower left wall
for qx, qz in ((-1.15, 2.85), (-0.75, 2.95), (-1.95, 0.90), (-2.25, 0.68)):
    ak.add_box(bm, (qx, -WALL_D * 0.5 - 0.01, qz), (0.40, 0.08, 0.18), I_STONE, bevel=0.012)

gw = WALL_W * 0.5
gz_top = RIDGE_Z - 0.10
for end_y, norm_s in ((-WALL_D * 0.5, -1), (WALL_D * 0.5, 1)):
    vl = bm.verts.new(Vector((-gw, end_y, EAVE_Z - 0.04)))
    vr = bm.verts.new(Vector((gw, end_y, EAVE_Z - 0.04)))
    vt = bm.verts.new(Vector((0.0, end_y, gz_top)))
    vl2 = bm.verts.new(Vector((-gw, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    vr2 = bm.verts.new(Vector((gw, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    vt2 = bm.verts.new(Vector((0.0, end_y - norm_s * 0.18, gz_top)))
    gfaces = [
        bm.faces.new((vl, vr, vt) if norm_s < 0 else (vr, vl, vt)),
        bm.faces.new((vr2, vl2, vt2) if norm_s < 0 else (vl2, vr2, vt2)),
        bm.faces.new((vl, vt, vt2, vl2) if norm_s < 0 else (vt, vr, vr2, vt2)),
        bm.faces.new((vt, vr, vr2, vt2) if norm_s < 0 else (vl, vt, vt2, vl2)),
    ]
    bmesh.ops.recalc_face_normals(bm, faces=gfaces)
    ak.paint_faces(bm, gfaces, I_STUCCO, smooth=False, uv_scale=0.35)

# Timber eave & gable corbels
for gy in (-WALL_D * 0.5 - 0.06, WALL_D * 0.5 + 0.06):
    for bx in (-1.70, 0.0, 1.70):
        bz = RIDGE_Z - 0.55 - abs(bx) * 0.72
        ak.add_box(bm, (bx, gy, bz), (0.16, 0.24, 0.34), I_WOOD, bevel=0.015)

# 3. Arched Door + Signature Mini Terracotta Pitched Porch Canopy Roof + Flanking Glow Flowerbox Windows
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.48, 2.15, 0.0, I_DOOR, I_CREAM, I_BRASS)
ak.add_wall_lantern(bm, (-0.98, -WALL_D * 0.5 - 0.02, BASE_H + 1.52), 0.0, I_WOOD, I_LANTERN)

# Pitched clay-tile mini canopy porch hood over doorway on carved oak knee brackets!
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, -WALL_D * 0.5 - 0.34),
    ridge_span=0.82,
    eave_span=2.08,
    eave_z=BASE_H + 2.08,
    ridge_z=BASE_H + 2.66,
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
    ak.add_box(bm, (b_s * 0.85, -WALL_D * 0.5 - 0.22, BASE_H + 1.92), (0.14, 0.44, 0.32), I_WOOD, bevel=0.012, rot_euler=(-0.45, 0, 0))

for sx in (-1, 1):
    ak.add_arched_window(
        bm, (sx * 1.78, -WALL_D * 0.5 - 0.03, BASE_H + 1.08), 1.02, 1.38, 0.0,
        I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
    )
    ak.add_arched_window(
        bm, (sx * 1.38, WALL_D * 0.5 + 0.03, BASE_H + 1.15), 1.08, 1.42, math.pi,
        I_CREAM, I_GLASS, I_CREAM, cross_mullions=True
    )

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-1.15, 1.15):
        ak.add_arched_window(bm, (side_x, wy, BASE_H + 1.18), 1.08, 1.44, yaw, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.92), 0.48, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.92), 0.48, math.pi, I_CREAM, I_ATTIC)

# 4. Main Overlapping Terracotta Gable Roof + Tall Limestone Chimney (Z <= 5.70) + Climbing Corner Blossom Vine
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=5.28,
    eave_span=6.82,
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
ak.add_box(bm, (1.68, 1.15, 4.78), (0.76, 0.76, 1.60), I_CREAM, bevel=0.025)
ak.add_box(bm, (1.68, 1.15, 5.62), (0.92, 0.92, 0.14), I_CREAM, bevel=0.02)
ak.add_box(bm, (1.68, 1.15, 5.70), (0.58, 0.58, 0.04), I_WOOD, bevel=0.01)

ak.add_vine_climb(
    bm,
    [(WALL_W * 0.5 - 0.22, -WALL_D * 0.5 - 0.04, 0.54),
     (WALL_W * 0.5 - 0.06, -WALL_D * 0.5 - 0.08, 1.32),
     (WALL_W * 0.5 - 0.22, -WALL_D * 0.5 - 0.06, 2.08),
     (WALL_W * 0.5 - 0.35, -WALL_D * 0.5 - 0.05, 2.86),
     (WALL_W * 0.5 - 0.95, -WALL_D * 0.5 - 0.05, 3.35)],
    0.032, I_WOOD, I_LEAF, I_FLOWER, seed=518
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
