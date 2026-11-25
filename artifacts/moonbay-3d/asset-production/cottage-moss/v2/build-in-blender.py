"""Build Moonbay Coast 3D Moss-Roof Winged Cottage v2 (cottage-moss):
Upgrades from v1 self-review:
1. Rich warm HONEY-AMBER cathedral stained glass (ZERO washed-out white paper cutouts under Coast ACESFilmic!) + leaded emerald attic roundel.
2. Ashlar limestone textured chimney with dark recessed flue throat (no chalk-white block!) & seamless pentagon gable walls (no horizontal bevel seam!).
3. Richer layered olive/emerald botanical moss clusters hugging ridge, slopes & annex shed roof + warmer redwood arched double plank doors.
4. Tight bounds <= [6.30, 5.20, 5.30] + clean fence-clearing inspect camera.
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "cm-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=501)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "cm-stucco", (0.95, 0.89, 0.77), (0.88, 0.79, 0.63), seed=502)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "cm-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=503)
door_col, door_rgh = ak.make_wood_textures(out_dir, "cm-door", (0.72, 0.28, 0.11), (0.46, 0.16, 0.05), planks=6, seed=504, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(
    out_dir, "cm-moss-roof", (0.46, 0.56, 0.18), (0.32, 0.44, 0.13), rows=8, cols=10, seed=505, moss_tint=(0.24, 0.48, 0.14)
)
amber_col, amber_rgh = ak.make_stained_glass_textures(out_dir, "cm-amber-glass", (0.58, 0.22, 0.03), (0.94, 0.56, 0.12), seed=506)
attic_col, attic_rgh = ak.make_stained_glass_textures(out_dir, "cm-attic-glass", (0.04, 0.18, 0.17), (0.12, 0.44, 0.38), seed=507)

M_STONE = ak.make_pbr_mat("CmStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CmStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CmTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CmRedwoodDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CmMossRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CmCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CmAmberGlass", amber_col, amber_rgh,
    metallic=0.10, roughness=0.07, coat=0.88, emission=(0.82, 0.36, 0.04), emission_strength=0.16
)
M_ATTIC = ak.make_pbr_mat("CmAtticGlass", attic_col, attic_rgh, metallic=0.18, roughness=0.06, coat=0.90)
M_BRASS = ak.make_pbr_mat("CmBrass", color=(0.96, 0.78, 0.34), metallic=0.45, roughness=0.28)
M_IRON = ak.make_pbr_mat("CmDarkIron", color=(0.24, 0.20, 0.18), metallic=0.36, roughness=0.48)
M_FLUE = ak.make_pbr_mat("CmFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_LEAF = ak.make_pbr_mat("CmLeaf", color=(0.24, 0.54, 0.18), roughness=0.48, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CmMossLeaf", color=(0.34, 0.58, 0.16), roughness=0.52, double_sided=True)
M_FLOWER = ak.make_pbr_mat("CmWhiteFlower", color=(0.98, 0.95, 0.84), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CmLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_IRON, M_FLUE, M_LEAF, M_LEAF_D, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_IRON, I_FLUE, I_LEAF, I_LEAF_D, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()


def add_seamless_pentagon_gable_body(cx: float, w: float, d: float, base_z: float, eave_z: float, peak_z: float, mat_idx: int):
    hw, hd = w * 0.5, d * 0.5
    pts_f = [
        bm.verts.new((cx - hw, -hd, base_z)), bm.verts.new((cx + hw, -hd, base_z)),
        bm.verts.new((cx + hw, -hd, eave_z)), bm.verts.new((cx, -hd, peak_z)),
        bm.verts.new((cx - hw, -hd, eave_z)),
    ]
    pts_b = [
        bm.verts.new((cx - hw, hd, base_z)), bm.verts.new((cx + hw, hd, base_z)),
        bm.verts.new((cx + hw, hd, eave_z)), bm.verts.new((cx, hd, peak_z)),
        bm.verts.new((cx - hw, hd, eave_z)),
    ]
    faces = [
        bm.faces.new(pts_f),
        bm.faces.new(list(reversed(pts_b))),
    ]
    for i in range(5):
        j = (i + 1) % 5
        faces.append(bm.faces.new((pts_f[j], pts_f[i], pts_b[i], pts_b[j])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    ak.paint_faces(bm, faces, mat_idx, smooth=False, uv_scale=0.35)


MAIN_X = 0.58
MAIN_W = 4.25
MAIN_D = 4.30
BASE_H = 0.50
EAVE_Z = 2.62
RIDGE_Z = 5.10

AUX_X = -2.14
AUX_W = 1.50
AUX_D = 3.00
AUX_Y = 0.18

# 1. Cut-Stone Ashlar Plinths & Entrance Steps
ak.add_box(bm, (MAIN_X, 0.0, BASE_H * 0.5), (MAIN_W + 0.32, MAIN_D + 0.32, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (MAIN_X, 0.0, BASE_H + 0.02), (MAIN_W + 0.40, MAIN_D + 0.40, 0.07), I_STONE, bevel=0.02)
ak.add_box(bm, (AUX_X, AUX_Y, BASE_H * 0.5), (AUX_W + 0.28, AUX_D + 0.28, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (AUX_X, AUX_Y, BASE_H + 0.02), (AUX_W + 0.36, AUX_D + 0.36, 0.07), I_STONE, bevel=0.02)

DOOR_X = MAIN_X - 0.28
ak.add_box(bm, (DOOR_X, -MAIN_D * 0.5 - 0.28, 0.13), (1.92, 0.62, 0.26), I_STONE, bevel=0.025)
ak.add_box(bm, (DOOR_X, -MAIN_D * 0.5 - 0.15, 0.32), (1.62, 0.40, 0.16), I_STONE, bevel=0.02)

# 2. Seamless Stucco Walls + Corner Stone Pilasters + Left Wing Annex
add_seamless_pentagon_gable_body(MAIN_X, MAIN_W, MAIN_D, BASE_H, EAVE_Z, RIDGE_Z - 0.10, I_STUCCO)
ak.add_box(bm, (AUX_X, AUX_Y, BASE_H + 0.78), (AUX_W, AUX_D, 1.56), I_STUCCO, bevel=0.02)
for px, py in ((MAIN_X - MAIN_W * 0.5 + 0.06, -MAIN_D * 0.5 + 0.06), (MAIN_X + MAIN_W * 0.5 - 0.06, -MAIN_D * 0.5 + 0.06),
               (MAIN_X + MAIN_W * 0.5 - 0.06, MAIN_D * 0.5 - 0.06), (MAIN_X - MAIN_W * 0.5 + 0.06, MAIN_D * 0.5 - 0.06)):
    ak.add_box(bm, (px, py, BASE_H + 0.95), (0.30, 0.30, 1.90), I_STONE, bevel=0.015)

for ry in (-1.5, 0.0, 1.5):
    ak.add_box(bm, (MAIN_X + MAIN_W * 0.5 + 0.14, ry, EAVE_Z - 0.14), (0.34, 0.14, 0.22), I_WOOD, bevel=0.015)
for gy in (-MAIN_D * 0.5 - 0.05, MAIN_D * 0.5 + 0.05):
    for bx in (MAIN_X - 1.10, MAIN_X, MAIN_X + 1.10):
        bz = RIDGE_Z - 0.45 - abs(bx - MAIN_X) * 0.55
        ak.add_box(bm, (bx, gy, bz), (0.14, 0.22, 0.30), I_WOOD, bevel=0.012)

# 3. Doors, Warm Honey-Amber Glow Arched Windows & Bullseye Attic Window
ak.add_arched_door(bm, (DOOR_X, -MAIN_D * 0.5 - 0.02, BASE_H), 1.36, 2.02, 0.0, I_DOOR, I_CREAM, I_IRON)
ak.add_sphere(bm, (DOOR_X + 0.40, -MAIN_D * 0.5 - 0.08, BASE_H + 0.92), 0.055, (1, 1, 1), 1, I_BRASS, smooth=True)
for lsx in (-0.80, 0.80):
    ak.add_wall_lantern(bm, (DOOR_X + lsx, -MAIN_D * 0.5 - 0.02, BASE_H + 1.46), 0.0, I_IRON, I_LANTERN)

ak.add_arched_window(
    bm, (MAIN_X + 1.24, -MAIN_D * 0.5 - 0.03, BASE_H + 1.04), 0.90, 1.26, 0.0,
    I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
)
ak.add_arched_window(
    bm, (AUX_X - 0.02, AUX_Y - AUX_D * 0.5 - 0.03, BASE_H + 0.86), 0.84, 1.10, 0.0,
    I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
)
ak.add_arched_window(bm, (AUX_X - AUX_W * 0.5 - 0.03, AUX_Y, BASE_H + 0.86), 0.86, 1.10, -math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)
for wy in (-1.02, 1.02):
    ak.add_arched_window(bm, (MAIN_X + MAIN_W * 0.5 + 0.03, wy, BASE_H + 1.10), 1.00, 1.34, math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)
for rx in (MAIN_X - 1.02, MAIN_X + 1.02):
    ak.add_arched_window(bm, (rx, MAIN_D * 0.5 + 0.03, BASE_H + 1.10), 1.00, 1.34, math.pi, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)

ak.add_round_window(bm, (MAIN_X, -MAIN_D * 0.5 - 0.04, 3.60), 0.42, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (MAIN_X, MAIN_D * 0.5 + 0.04, 3.60), 0.42, math.pi, I_CREAM, I_ATTIC)

# 4. Overlapping Olive-Moss Shingle Roof + Annex Lean-To Moss Roof + Limestone Chimney + Rich Roof Moss & Vines
ak.add_tiled_gable_roof(
    bm,
    center_xy=(MAIN_X, 0.0),
    ridge_span=4.80,
    eave_span=4.90,
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
ak.add_box(bm, (-2.20, AUX_Y, 2.22), (1.84, AUX_D + 0.34, 0.14), I_WOOD, bevel=0.015, rot_euler=(0.0, -0.26, 0.0))
for ir in range(3):
    tx = -1.60 - ir * 0.45
    tz = 2.42 - ir * 0.12
    for ic in range(5):
        ty = AUX_Y - 1.20 + ic * 0.60
        ak.add_box(bm, (tx, ty, tz), (0.46, 0.54, 0.055), I_ROOF, rot_euler=(0.0, -0.31, 0.0))

# Textured Ashlar Limestone Chimney with recessed dark stone flue
CH_X, CH_Y = MAIN_X + 1.26, 1.02
ak.add_box(bm, (CH_X, CH_Y, 4.30), (0.72, 0.72, 1.55), I_STONE, bevel=0.025)
ak.add_box(bm, (CH_X, CH_Y, 5.12), (0.86, 0.86, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (CH_X, CH_Y, 5.20), (0.52, 0.52, 0.04), I_FLUE)

# Lush corner blossom vine + abundant crisp sculpted roof moss cushions across ridge, eaves & annex roof!
ak.add_vine_climb(
    bm,
    [(-1.54, -2.20, 0.54), (-1.38, -2.24, 1.25), (-1.56, -2.20, 1.98), (-1.34, -2.21, 2.74), (-0.82, -2.18, 3.38)],
    0.036, I_WOOD, I_LEAF, I_FLOWER, seed=508
)
moss_paths = [
    ([(MAIN_X + 0.06, -2.15, 5.12), (MAIN_X + 0.12, -0.85, 5.16), (MAIN_X + 0.06, 0.45, 5.16), (MAIN_X + 0.12, 1.95, 5.12)], I_LEAF_D, 509),
    ([(MAIN_X - 0.95, -1.90, 4.25), (MAIN_X - 1.25, -0.75, 3.92), (MAIN_X - 1.05, 0.55, 4.15), (MAIN_X - 1.35, 1.65, 3.85)], I_LEAF, 510),
    ([(MAIN_X + 1.45, -1.75, 3.66), (MAIN_X + 1.78, -0.65, 3.32), (MAIN_X + 1.50, 0.45, 3.60), (MAIN_X + 1.72, 1.55, 3.35)], I_LEAF_D, 511),
    ([(-1.75, -0.95, 2.50), (-2.15, -0.15, 2.38), (-2.45, 0.75, 2.30)], I_LEAF, 512),
]
for pts, l_mat, sd in moss_paths:
    ak.add_vine_climb(bm, pts, 0.024, I_ROOF, l_mat, I_FLOWER if sd == 510 else None, seed=sd)

mesh = bpy.data.meshes.new("cottage-moss")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-moss", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-moss", (6.3, 5.2, 5.3))
