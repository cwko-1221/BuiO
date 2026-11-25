"""Build Moonbay Coast 3D Moss-Roof Winged Cottage (cottage-moss):
Matches ASSETS['cottage-moss'].size = [6.3, 5.2, 5.3] & tripo-references/v1/cottage-moss.png:
- Main sandstone/cream stucco cottage + left (-X) side bay annex wing with sloped moss-shingle lean-to roof
- Cut-stone ashlar plinth + center front steps + arched honey-oak plank door with iron strap hinges & brass knob
- Warm glowing golden amber arched windows (front, annex, right side & rear) with floral window-boxes + attic bullseye
- Overlapping olive-moss shingle roof with ridge tiles, limestone chimney & botanical vine + moss leaf clusters.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "cm-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=501)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "cm-stucco", (0.95, 0.89, 0.77), (0.88, 0.79, 0.63), seed=502)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "cm-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=503)
door_col, door_rgh = ak.make_wood_textures(out_dir, "cm-door", (0.68, 0.36, 0.16), (0.44, 0.21, 0.09), planks=6, seed=504, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(
    out_dir, "cm-moss-roof", (0.48, 0.56, 0.20), (0.34, 0.44, 0.14), rows=8, cols=10, seed=505, moss_tint=(0.28, 0.50, 0.16)
)

M_STONE = ak.make_pbr_mat("CmStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CmStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CmTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CmOakDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CmMossRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CmCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat("CmWarmGlass", color=(0.96, 0.74, 0.26), metallic=0.05, roughness=0.14, emission=(0.98, 0.72, 0.24), emission_strength=0.45)
M_ATTIC = ak.make_pbr_mat("CmAtticGlass", color=(0.04, 0.20, 0.18), metallic=0.22, roughness=0.10)
M_BRASS = ak.make_pbr_mat("CmBrass", color=(0.92, 0.74, 0.32), metallic=0.45, roughness=0.30)
M_IRON = ak.make_pbr_mat("CmDarkIron", color=(0.26, 0.20, 0.16), metallic=0.35, roughness=0.52)
M_LEAF = ak.make_pbr_mat("CmLeaf", color=(0.24, 0.56, 0.20), roughness=0.50, double_sided=True)
M_FLOWER = ak.make_pbr_mat("CmWhiteFlower", color=(0.98, 0.95, 0.84), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CmLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_IRON, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_IRON, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()

# Footprint W=6.30, D=5.20, H=5.30
# Main Cottage Body shifted +0.62 in X (width 4.45 -> X in [-1.60 .. +2.85]), Left Wing Annex (-2.95 .. -1.45)
MAIN_X = 0.62
MAIN_W = 4.35
MAIN_D = 4.40
BASE_H = 0.50
EAVE_Z = 2.65
RIDGE_Z = 5.16

AUX_X = -2.18
AUX_W = 1.55
AUX_D = 3.10
AUX_Y = 0.20

# 1. Cut-Stone Ashlar Plinths (Main Cottage + Left Annex) & Double Entrance Steps
ak.add_box(bm, (MAIN_X, 0.0, BASE_H * 0.5), (MAIN_W + 0.32, MAIN_D + 0.32, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (MAIN_X, 0.0, BASE_H + 0.02), (MAIN_W + 0.40, MAIN_D + 0.40, 0.07), I_STONE, bevel=0.02)
ak.add_box(bm, (AUX_X, AUX_Y, BASE_H * 0.5), (AUX_W + 0.28, AUX_D + 0.28, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (AUX_X, AUX_Y, BASE_H + 0.02), (AUX_W + 0.36, AUX_D + 0.36, 0.07), I_STONE, bevel=0.02)
# Steps centered cleanly at doorway X = MAIN_X - 0.32
DOOR_X = MAIN_X - 0.30
ak.add_box(bm, (DOOR_X, -MAIN_D * 0.5 - 0.28, 0.13), (1.95, 0.64, 0.26), I_STONE, bevel=0.025)
ak.add_box(bm, (DOOR_X, -MAIN_D * 0.5 - 0.16, 0.32), (1.65, 0.42, 0.16), I_STONE, bevel=0.02)

# 2. Stucco Walls + Corner Stone Pilasters + Main Gable Triangles + Left Annex Lean-to Body
ak.add_box(bm, (MAIN_X, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (MAIN_W, MAIN_D, EAVE_Z - BASE_H), I_STUCCO, bevel=0.02)
ak.add_box(bm, (AUX_X, AUX_Y, BASE_H + 0.80), (AUX_W, AUX_D, 1.60), I_STUCCO, bevel=0.02)
# Stone pilaster corners on front left junction & right corner
for px, py in ((MAIN_X - MAIN_W * 0.5 + 0.06, -MAIN_D * 0.5 + 0.06), (MAIN_X + MAIN_W * 0.5 - 0.06, -MAIN_D * 0.5 + 0.06)):
    ak.add_box(bm, (px, py, BASE_H + 0.95), (0.30, 0.30, 1.90), I_STONE, bevel=0.015)

gw = MAIN_W * 0.5
gz_top = RIDGE_Z - 0.10
for end_y, norm_s in ((-MAIN_D * 0.5, -1), (MAIN_D * 0.5, 1)):
    vl = bm.verts.new(Vector((MAIN_X - gw, end_y, EAVE_Z - 0.04)))
    vr = bm.verts.new(Vector((MAIN_X + gw, end_y, EAVE_Z - 0.04)))
    vt = bm.verts.new(Vector((MAIN_X, end_y, gz_top)))
    vl2 = bm.verts.new(Vector((MAIN_X - gw, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    vr2 = bm.verts.new(Vector((MAIN_X + gw, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    vt2 = bm.verts.new(Vector((MAIN_X, end_y - norm_s * 0.18, gz_top)))
    gfaces = [
        bm.faces.new((vl, vr, vt) if norm_s < 0 else (vr, vl, vt)),
        bm.faces.new((vr2, vl2, vt2) if norm_s < 0 else (vl2, vr2, vt2)),
        bm.faces.new((vl, vt, vt2, vl2) if norm_s < 0 else (vt, vr, vr2, vt2)),
        bm.faces.new((vt, vr, vr2, vt2) if norm_s < 0 else (vl, vt, vt2, vl2)),
    ]
    bmesh.ops.recalc_face_normals(bm, faces=gfaces)
    ak.paint_faces(bm, gfaces, I_STUCCO, smooth=False, uv_scale=0.35)

# Timber eave knee brackets & side rafter ends
for ry in (-1.5, 0.0, 1.5):
    ak.add_box(bm, (MAIN_X + MAIN_W * 0.5 + 0.14, ry, EAVE_Z - 0.14), (0.34, 0.14, 0.22), I_WOOD, bevel=0.015)
for gy in (-MAIN_D * 0.5 - 0.05, MAIN_D * 0.5 + 0.05):
    for bx in (MAIN_X - 1.15, MAIN_X, MAIN_X + 1.15):
        bz = RIDGE_Z - 0.45 - abs(bx - MAIN_X) * 0.55
        ak.add_box(bm, (bx, gy, bz), (0.14, 0.22, 0.30), I_WOOD, bevel=0.012)

# 3. Doors, Warm Glow Arched Windows & Bullseye Attic Window
ak.add_arched_door(bm, (DOOR_X, -MAIN_D * 0.5 - 0.02, BASE_H), 1.38, 2.05, 0.0, I_DOOR, I_CREAM, I_IRON)
ak.add_sphere(bm, (DOOR_X + 0.42, -MAIN_D * 0.5 - 0.08, BASE_H + 0.92), 0.055, (1, 1, 1), 1, I_BRASS, smooth=True)
for lsx in (-0.82, 0.82):
    ak.add_wall_lantern(bm, (DOOR_X + lsx, -MAIN_D * 0.5 - 0.02, BASE_H + 1.48), 0.0, I_IRON, I_LANTERN)

# Front right arched window w/ flowerbox & left annex arched window w/ flowerbox
ak.add_arched_window(
    bm, (MAIN_X + 1.28, -MAIN_D * 0.5 - 0.03, BASE_H + 1.05), 0.92, 1.30, 0.0,
    I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
)
ak.add_arched_window(
    bm, (AUX_X - 0.02, AUX_Y - AUX_D * 0.5 - 0.03, BASE_H + 0.88), 0.86, 1.12, 0.0,
    I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
)
# Left annex west window + main right side 2 windows + rear 2 windows
ak.add_arched_window(bm, (AUX_X - AUX_W * 0.5 - 0.03, AUX_Y, BASE_H + 0.88), 0.88, 1.12, -math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)
for wy in (-1.05, 1.05):
    ak.add_arched_window(bm, (MAIN_X + MAIN_W * 0.5 + 0.03, wy, BASE_H + 1.12), 1.02, 1.38, math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)
for rx in (MAIN_X - 1.05, MAIN_X + 1.05):
    ak.add_arched_window(bm, (rx, MAIN_D * 0.5 + 0.03, BASE_H + 1.12), 1.02, 1.38, math.pi, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)

# Round bullseye attic windows
ak.add_round_window(bm, (MAIN_X, -MAIN_D * 0.5 - 0.04, 3.65), 0.42, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (MAIN_X, MAIN_D * 0.5 + 0.04, 3.65), 0.42, math.pi, I_CREAM, I_ATTIC)

# 4. Overlapping Olive-Moss Shingle Gable Roof + Left Annex Lean-To Shed Roof + Stone Chimney + Climbing Vine
ak.add_tiled_gable_roof(
    bm,
    center_xy=(MAIN_X, 0.0),
    ridge_span=4.92,
    eave_span=5.06,
    eave_z=EAVE_Z - 0.06,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=5,
    tile_cols=9,
    bell_flare=0.14,
    bargeboard_t=0.20,
)
# Left wing sloped lean-to moss-shingle roof (X in [-3.12 .. -1.30], sloping outward toward -X)
ak.add_box(bm, (-2.24, AUX_Y, 2.26), (1.88, AUX_D + 0.38, 0.14), I_WOOD, bevel=0.015, rot_euler=(0.0, -0.26, 0.0))
for ir in range(3):
    tx = -1.62 - ir * 0.46
    tz = 2.46 - ir * 0.12
    for ic in range(5):
        ty = AUX_Y - 1.25 + ic * 0.62
        ak.add_box(bm, (tx, ty, tz), (0.48, 0.56, 0.055), I_ROOF, rot_euler=(0.0, -0.31, 0.0))

# Sculpted Cream Limestone Chimney cleanly rising on East slope to Z = 5.30
CH_X, CH_Y = MAIN_X + 1.32, 1.05
ak.add_box(bm, (CH_X, CH_Y, 4.35), (0.72, 0.72, 1.55), I_CREAM, bevel=0.025)
ak.add_box(bm, (CH_X, CH_Y, 5.18), (0.86, 0.86, 0.14), I_CREAM, bevel=0.02)
ak.add_box(bm, (CH_X, CH_Y, 5.27), (0.54, 0.54, 0.06), I_WOOD, bevel=0.01)

# White-blossom climbing vine up left front stone pilaster + nestled roof moss tufts along ridge
ak.add_vine_climb(
    bm,
    [(-1.55, -2.26, 0.54), (-1.42, -2.28, 1.25), (-1.58, -2.24, 1.98), (-1.38, -2.25, 2.75), (-0.85, -2.22, 3.40)],
    0.032, I_WOOD, I_LEAF, I_FLOWER, seed=508
)
# Clustered crisp emerald leaf tufts along moss-shingle roof slopes (articulated leaves, zero globs!)
ak.add_vine_climb(
    bm,
    [(MAIN_X + 0.12, -1.85, 5.20), (MAIN_X + 0.18, -0.60, 5.22), (MAIN_X + 0.12, 0.70, 5.22), (MAIN_X + 0.18, 1.85, 5.20)],
    0.020, I_ROOF, I_LEAF, None, seed=509
)
ak.add_vine_climb(
    bm,
    [(MAIN_X + 1.55, -1.45, 3.62), (MAIN_X + 1.85, -0.55, 3.35), (MAIN_X + 1.55, 0.45, 3.60)],
    0.018, I_ROOF, I_LEAF, I_FLOWER, seed=510
)

mesh = bpy.data.meshes.new("cottage-moss")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-moss", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-moss", (6.3, 5.2, 5.3))
