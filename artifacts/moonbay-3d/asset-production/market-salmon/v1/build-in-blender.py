"""Build Moonbay Coast 3D Salmon-Stucco Market Shop (market-salmon):
Matches ASSETS['market-salmon'].size = [8.8, 7.2, 6.2] & tripo-references/v1/market-salmon.png:
- Warm peach-salmon textured stucco building on cut-stone ashlar plinth + double front doorway steps
- Timber corner pilasters supporting carved timber eave brackets under overlapping terracotta barrel-tile gable roof
- Arched plank double shop door in limestone arch surround + brass knob & front lanterns
- Sage-and-cream striped scalloped storefront awning suspended from stone ledger beam with brass tie brackets
- Flanking arched teal windows with open louvered wood shutters & flower-boxes, circular attic bullseye window & chimney.
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
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "ms-wood", (0.62, 0.39, 0.21), (0.39, 0.23, 0.11), planks=6, seed=413)
teal_col, teal_rgh = ak.make_wood_textures(out_dir, "ms-teal-shutter", (0.16, 0.52, 0.50), (0.09, 0.34, 0.34), planks=5, seed=414)
roof_col, roof_rgh = ak.make_shingle_textures(out_dir, "ms-roof", (0.84, 0.38, 0.21), (0.66, 0.25, 0.13), rows=8, cols=12, seed=415)
awn_col, awn_rgh = ak.make_striped_awning_textures(out_dir, "ms-awning", (0.36, 0.56, 0.38), (0.96, 0.92, 0.80), stripes=9.0)

M_STONE = ak.make_pbr_mat("MsStone", stone_col, stone_rgh)
M_SALMON = ak.make_pbr_mat("MsSalmonStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("MsHoneyTimber", wood_col, wood_rgh)
M_TEAL_WOOD = ak.make_pbr_mat("MsTealShutter", teal_col, teal_rgh)
M_TEAL_TRIM = ak.make_pbr_mat("MsTealTrim", color=(0.16, 0.54, 0.52), roughness=0.46)
M_ROOF = ak.make_pbr_mat("MsTerracotta", roof_col, roof_rgh)
M_AWNING = ak.make_pbr_mat("MsAwning", awn_col, awn_rgh, double_sided=True)
M_CREAM = ak.make_pbr_mat("MsCreamStone", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat("MsGlass", color=(0.06, 0.30, 0.34), metallic=0.10, roughness=0.14, emission=(0.14, 0.42, 0.42), emission_strength=0.25)
M_BRASS = ak.make_pbr_mat("MsBrass", color=(0.92, 0.74, 0.32), metallic=0.46, roughness=0.30)
M_LEAF = ak.make_pbr_mat("MsLeaf", color=(0.24, 0.56, 0.22), roughness=0.52, double_sided=True)
M_FLOWER = ak.make_pbr_mat("MsSalmonBloom", color=(0.98, 0.58, 0.54), roughness=0.42, double_sided=True)
M_LANTERN = ak.make_pbr_mat("MsLanternGlow", color=(1.0, 0.86, 0.46), roughness=0.22, emission=(1.0, 0.78, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_SALMON, M_WOOD, M_TEAL_WOOD, M_TEAL_TRIM, M_ROOF, M_AWNING, M_CREAM, M_GLASS, M_BRASS, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_SALMON, I_WOOD, I_TEAL_SH, I_TEAL, I_ROOF, I_AWN, I_CREAM, I_GLASS, I_BRASS, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

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


WALL_W = 7.45
WALL_D = 5.95
BASE_H = 0.48
EAVE_Z = 3.35
RIDGE_Z = 6.08

# 1. Cut-Stone Ashlar Plinth & Stepped Shopfront Threshold
ak.add_box(bm, (0.0, 0.0, BASE_H * 0.5), (WALL_W + 0.34, WALL_D + 0.34, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.02), (WALL_W + 0.44, WALL_D + 0.44, 0.08), I_STONE, bevel=0.02)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.30, 0.14), (2.45, 0.68, 0.28), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.18, 0.34), (2.10, 0.46, 0.18), I_STONE, bevel=0.02)

# 2. Salmon Stucco Masonry Walls + Timber Corner Pilasters + Front/Rear Gables + Eave Brackets
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

# Exposed carved timber eave brackets under front/back gables + side eaves
for ry in (-2.2, -0.8, 0.8, 2.2):
    for sx in (-1, 1):
        ak.add_box(bm, (sx * (WALL_W * 0.5 + 0.16), ry, EAVE_Z - 0.14), (0.36, 0.15, 0.22), I_WOOD, bevel=0.015)
for gy in (-WALL_D * 0.5 - 0.06, WALL_D * 0.5 + 0.06):
    for bx in (-1.65, 0.0, 1.65):
        bz = EAVE_Z + 1.45 - abs(bx) * 0.42
        ak.add_box(bm, (bx, gy, bz), (0.16, 0.24, 0.34), I_WOOD, bevel=0.015)

# 3. Front (-Y) Storefront: Plank Arch Door, Stone Lintel Awning Beam, Striped Awning & Shuttered Flowerbox Windows
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.62, 2.22, 0.0, I_WOOD, I_CREAM, I_BRASS)
for sx in (-1, 1):
    add_shuttered_arched_window((sx * 2.25, -WALL_D * 0.5 - 0.03, BASE_H + 1.24), 1.05, 1.40, 0.0, planter=True)
    ak.add_wall_lantern(bm, (sx * 1.05, -WALL_D * 0.5 - 0.02, BASE_H + 1.72), 0.0, I_BRASS, I_LANTERN)

ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.06, BASE_H + 2.66), (6.50, 0.22, 0.18), I_CREAM, bevel=0.02)
ak.add_scalloped_awning(bm, (0.0, -WALL_D * 0.5 - 0.06, BASE_H + 2.62), 6.15, 0.84, 0.34, 0.0, I_AWN, I_WOOD, scallops=9)
# Brass tie straps + end finials on shop awning roller bar
for bx in (-3.08, 3.08):
    ak.add_sphere(bm, (bx, -WALL_D * 0.5 - 0.90, BASE_H + 2.28), 0.08, (1, 1, 1), 1, I_BRASS, smooth=True)
for strap_x in (-2.0, 0.0, 2.0):
    ak.add_box(bm, (strap_x, -WALL_D * 0.5 - 0.10, BASE_H + 2.74), (0.14, 0.10, 0.20), I_BRASS, bevel=0.01)

# Attic Gable Circular Bullseye Windows & Side/Rear Shuttered Windows
ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 4.38), 0.50, 0.0, I_CREAM, I_GLASS)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 4.38), 0.50, math.pi, I_CREAM, I_GLASS)

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-1.35, 1.35):
        add_shuttered_arched_window((side_x, wy, BASE_H + 1.32), 1.10, 1.40, yaw, planter=False)
for rx in (-1.95, 1.95):
    add_shuttered_arched_window((rx, WALL_D * 0.5 + 0.03, BASE_H + 1.32), 1.10, 1.40, math.pi, planter=False)

# 4. Real Clay Terracotta Barrel-Tile Gable Roof + Stone/Stucco Chimney
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=6.92,
    eave_span=8.68,
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
ak.add_box(bm, (1.85, 1.15, 5.15), (0.86, 0.86, 1.55), I_CREAM, bevel=0.03)
ak.add_box(bm, (1.85, 1.15, 6.00), (1.02, 1.02, 0.16), I_CREAM, bevel=0.025)
ak.add_box(bm, (1.85, 1.15, 6.14), (0.64, 0.64, 0.12), I_ROOF, bevel=0.015)

mesh = bpy.data.meshes.new("market-salmon")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("market-salmon", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "market-salmon", (8.8, 7.2, 6.2))
