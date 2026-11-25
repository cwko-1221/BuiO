"""Build Moonbay Coast 3D Salmon-Stucco Market Shop v3 (market-salmon):
Fixed footprint strictly <= [8.80, 7.20, 6.20] + plaza-level camera inspection + door brass grille finials.
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "ms-stone", (0.91, 0.84, 0.71), (0.66, 0.58, 0.45), rows=6, cols=10, seed=411)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "ms-salmon", (0.96, 0.71, 0.56), (0.89, 0.60, 0.45), seed=412)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "ms-wood", (0.62, 0.39, 0.21), (0.39, 0.23, 0.11), planks=5, seed=413)
door_col, door_rgh = ak.make_wood_textures(out_dir, "ms-door", (0.64, 0.40, 0.20), (0.38, 0.21, 0.10), planks=6, seed=416, vertical=True)
teal_col, teal_rgh = ak.make_wood_textures(out_dir, "ms-teal-shutter", (0.14, 0.50, 0.48), (0.07, 0.30, 0.30), planks=5, seed=414)
roof_col, roof_rgh = ak.make_shingle_textures(out_dir, "ms-roof", (0.84, 0.38, 0.21), (0.66, 0.25, 0.13), rows=8, cols=12, seed=415)
awn_col, awn_rgh = ak.make_striped_awning_textures(out_dir, "ms-awning", (0.36, 0.56, 0.38), (0.96, 0.92, 0.80), stripes=9.0)

M_STONE = ak.make_pbr_mat("MsStone", stone_col, stone_rgh)
M_SALMON = ak.make_pbr_mat("MsSalmonStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("MsHoneyTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("MsDoorOak", door_col, door_rgh)
M_TEAL_WOOD = ak.make_pbr_mat("MsTealShutter", teal_col, teal_rgh)
M_TEAL_TRIM = ak.make_pbr_mat("MsTealTrim", color=(0.14, 0.50, 0.48), roughness=0.45)
M_ROOF = ak.make_pbr_mat("MsTerracotta", roof_col, roof_rgh)
M_AWNING = ak.make_pbr_mat("MsAwning", awn_col, awn_rgh, double_sided=True)
M_CREAM = ak.make_pbr_mat("MsCreamStone", color=(0.94, 0.89, 0.77), roughness=0.64)
ms_glass_col, ms_glass_rgh = ak.make_stained_glass_textures(out_dir, "ms-glass", (0.03, 0.16, 0.19), (0.09, 0.36, 0.38), seed=419)
M_GLASS = ak.make_pbr_mat("MsGlass", ms_glass_col, ms_glass_rgh, metallic=0.18, roughness=0.06, coat=0.90)
M_BRASS = ak.make_pbr_mat("MsBrass", color=(0.94, 0.75, 0.30), metallic=0.65, roughness=0.24)
M_FLUE = ak.make_pbr_mat("MsFlue", color=(0.12, 0.10, 0.09), roughness=0.92)
M_LEAF = ak.make_pbr_mat("MsLeaf", color=(0.22, 0.54, 0.20), roughness=0.50, double_sided=True)
M_FLOWER = ak.make_pbr_mat("MsSalmonBloom", color=(0.98, 0.56, 0.52), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("MsLanternGlow", color=(1.0, 0.86, 0.46), roughness=0.20, emission=(1.0, 0.78, 0.36), emission_strength=1.5)

MATS = [M_STONE, M_SALMON, M_WOOD, M_DOOR, M_TEAL_WOOD, M_TEAL_TRIM, M_ROOF, M_AWNING, M_CREAM, M_GLASS, M_BRASS, M_FLUE, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_SALMON, I_WOOD, I_DOOR, I_TEAL_SH, I_TEAL, I_ROOF, I_AWN, I_CREAM, I_GLASS, I_BRASS, I_FLUE, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()


def add_shuttered_arched_window(center, width, height, yaw, planter=False):
    ak.add_arched_window(
        bm, center, width, height, yaw, I_CREAM, I_GLASS, I_CREAM,
        cross_mullions=True, planter=planter, flower_mat=I_FLOWER, leaf_mat=I_LEAF
    )
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    sh_w = width * 0.42
    sh_h = height * 0.74
    for s in (-1, 1):
        ang_open = s * 0.26
        sx = s * (width * 0.5 + sh_w * 0.58)
        ak.add_box(bm, xform(sx, -0.09, -height * 0.08), (sh_w, 0.055, sh_h), I_TEAL_SH, bevel=0.008, rot_euler=(0.0, 0.0, yaw + ang_open))
        for li in range(4):
            lz = -height * 0.08 + (li - 1.5) * (sh_h * 0.21)
            ak.add_box(bm, xform(sx, -0.11, lz), (sh_w * 0.78, 0.025, 0.032), I_TEAL, rot_euler=(0.24, 0.0, yaw + ang_open))


WALL_W = 7.35
WALL_D = 5.80
BASE_H = 0.48
EAVE_Z = 3.32
RIDGE_Z = 6.02


def ms_slope_z(ax_abs: float):
    t = min(1.0, max(0.0, ax_abs / 4.28))
    return RIDGE_Z - (RIDGE_Z - (EAVE_Z - 0.05)) * (t ** (1.0 - 0.14 * 0.45))


ak.add_box(bm, (0.0, 0.0, BASE_H * 0.5), (WALL_W + 0.34, WALL_D + 0.34, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.02), (WALL_W + 0.44, WALL_D + 0.44, 0.08), I_STONE, bevel=0.02)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.28, 0.14), (2.40, 0.64, 0.28), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.16, 0.34), (2.05, 0.44, 0.18), I_STONE, bevel=0.02)

ak.add_box(bm, (0.0, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (WALL_W, WALL_D, EAVE_Z - BASE_H), I_SALMON, bevel=0.02)
for cx in (-WALL_W * 0.5 + 0.06, WALL_W * 0.5 - 0.06):
    for cy in (-WALL_D * 0.5 + 0.06, WALL_D * 0.5 - 0.06):
        ak.add_box(bm, (cx, cy, BASE_H + (EAVE_Z - BASE_H) * 0.5), (0.30, 0.30, EAVE_Z - BASE_H + 0.04), I_WOOD, bevel=0.015)

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
    ak.paint_faces(bm, gfaces, I_SALMON, smooth=False, uv_scale=0.35)

for ry in (-2.2, -0.8, 0.8, 2.2):
    for sx in (-1, 1):
        ak.add_box(bm, (sx * (WALL_W * 0.5 + 0.16), ry, EAVE_Z - 0.14), (0.36, 0.15, 0.22), I_WOOD, bevel=0.015)
for gy in (-WALL_D * 0.5 - 0.16, WALL_D * 0.5 + 0.16):
    for bx in (-1.65, 0.0, 1.65):
        z_roof = ms_slope_z(abs(bx)) - 0.18
        ak.add_box(bm, (bx, gy, z_roof), (0.16, 0.36, 0.32), I_WOOD, bevel=0.015)

ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.60, 2.20, 0.0, I_DOOR, I_CREAM, I_BRASS)
for sx in (-1, 1):
    add_shuttered_arched_window((sx * 2.22, -WALL_D * 0.5 - 0.03, BASE_H + 1.24), 1.04, 1.38, 0.0, planter=True)
    ak.add_wall_lantern(bm, (sx * 1.06, -WALL_D * 0.5 - 0.02, BASE_H + 1.72), 0.0, I_BRASS, I_LANTERN)

ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.06, BASE_H + 2.66), (6.40, 0.22, 0.18), I_CREAM, bevel=0.02)
ak.add_scalloped_awning(bm, (0.0, -WALL_D * 0.5 - 0.06, BASE_H + 2.62), 6.05, 0.82, 0.34, 0.0, I_AWN, I_WOOD, scallops=9)
for bx in (-3.02, 3.02):
    ak.add_sphere(bm, (bx, -WALL_D * 0.5 - 0.88, BASE_H + 2.28), 0.08, (1, 1, 1), 1, I_BRASS, smooth=True)
for strap_x in (-2.0, 0.0, 2.0):
    ak.add_box(bm, (strap_x, -WALL_D * 0.5 - 0.10, BASE_H + 2.74), (0.14, 0.10, 0.20), I_BRASS, bevel=0.01)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 4.34), 0.48, 0.0, I_CREAM, I_GLASS)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 4.34), 0.48, math.pi, I_CREAM, I_GLASS)

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-1.30, 1.30):
        add_shuttered_arched_window((side_x, wy, BASE_H + 1.30), 1.08, 1.38, yaw, planter=False)
for rx in (-1.90, 1.90):
    add_shuttered_arched_window((rx, WALL_D * 0.5 + 0.03, BASE_H + 1.30), 1.08, 1.38, math.pi, planter=False)

ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=6.55,
    eave_span=8.42,
    eave_z=EAVE_Z - 0.05,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=6,
    tile_cols=11,
    bell_flare=0.14,
    bargeboard_t=0.22,
)
ak.add_box(bm, (1.80, 1.10, 5.10), (0.86, 0.86, 1.55), I_STONE, bevel=0.03)
ak.add_box(bm, (1.80, 1.10, 5.95), (1.02, 1.02, 0.16), I_STONE, bevel=0.025)
ak.add_box(bm, (1.80, 1.10, 6.04), (0.58, 0.58, 0.06), I_FLUE)

mesh = bpy.data.meshes.new("market-salmon")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("market-salmon", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "market-salmon", (8.8, 7.2, 6.2))
