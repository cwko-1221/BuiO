"""Build Moonbay Coast 3D Emerald-Teal Door Cottage (cottage-teal):
Matches ASSETS['cottage-teal'].size = [6.0, 5.05, 4.95] & tripo-references/v1/cottage-teal.png:
- Stepped limestone foundation + front porch stairs + warm parchment-cream stucco walls w/ honey-oak dado belt trim
- Rich emerald-teal arched double timber doors with twin brass ring handles & twin glowing lanterns
- Overlapping olive-moss shingle roof with moss-dappled ridge pole & brushed-brass circular ridge straps + limestone chimney
- Warm golden glowing arched windows w/ floral window-boxes & climbing white-flower vine wrapping up left archway & roof rake.
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "ct-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=531)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "ct-stucco", (0.95, 0.89, 0.76), (0.87, 0.78, 0.63), seed=532)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "ct-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=533)
door_col, door_rgh = ak.make_wood_textures(out_dir, "ct-teal-door", (0.08, 0.52, 0.46), (0.04, 0.34, 0.31), planks=6, seed=534, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(
    out_dir, "ct-moss-roof", (0.46, 0.56, 0.18), (0.32, 0.44, 0.13), rows=7, cols=9, seed=535, moss_tint=(0.28, 0.48, 0.15)
)

M_STONE = ak.make_pbr_mat("CtStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CtStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CtTimber", wood_col, wood_rgh)
M_TEAL_DOOR = ak.make_pbr_mat("CtTealDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CtMossRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CtCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat("CtWarmGlass", color=(0.96, 0.74, 0.26), metallic=0.05, roughness=0.14, emission=(0.98, 0.72, 0.24), emission_strength=0.45)
M_ATTIC = ak.make_pbr_mat("CtAtticGlass", color=(0.04, 0.20, 0.18), metallic=0.22, roughness=0.10)
M_BRASS = ak.make_pbr_mat("CtBrass", color=(0.92, 0.74, 0.32), metallic=0.46, roughness=0.28)
M_LEAF = ak.make_pbr_mat("CtLeaf", color=(0.24, 0.56, 0.20), roughness=0.50, double_sided=True)
M_FLOWER = ak.make_pbr_mat("CtWhiteFlower", color=(0.98, 0.95, 0.84), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CtLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_TEAL_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()

WALL_W = 4.92
WALL_D = 4.35
BASE_H = 0.48
EAVE_Z = 2.48
RIDGE_Z = 4.78

# 1. Stepped Cut-Stone Base Plinth & Double Front Steps
ak.add_box(bm, (0.0, 0.0, 0.13), (WALL_W + 0.44, WALL_D + 0.44, 0.26), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, 0.38), (WALL_W + 0.30, WALL_D + 0.30, 0.22), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.30, 0.13), (2.25, 0.66, 0.26), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.16, 0.32), (1.88, 0.44, 0.16), I_STONE, bevel=0.02)

# 2. Stucco Body + Wood Wainscot Belt Rail + Front/Rear Gables
ak.add_box(bm, (0.0, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (WALL_W, WALL_D, EAVE_Z - BASE_H), I_STUCCO, bevel=0.02)
# Continuous warm honey-oak dado rail trim hugging exterior walls at window-sill height
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.60), (WALL_W + 0.06, WALL_D + 0.06, 0.12), I_WOOD, bevel=0.012)

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

# 3. Signature Emerald-Teal Arched Double Doors + Brass Ring Pulls + Twin Wall Lanterns + Warm Glow Windows
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.48, 2.02, 0.0, I_DOOR, I_CREAM, I_BRASS)
for lsx in (-0.98, 0.98):
    ak.add_wall_lantern(bm, (lsx, -WALL_D * 0.5 - 0.02, BASE_H + 1.30), 0.0, I_WOOD, I_LANTERN)

for sx in (-1, 1):
    ak.add_arched_window(
        bm, (sx * 1.78, -WALL_D * 0.5 - 0.03, BASE_H + 1.00), 0.86, 1.18, 0.0,
        I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
    )
    ak.add_arched_window(
        bm, (sx * 1.25, WALL_D * 0.5 + 0.03, BASE_H + 1.08), 0.96, 1.28, math.pi,
        I_CREAM, I_GLASS, I_CREAM, cross_mullions=True
    )

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-0.98, 0.98):
        ak.add_arched_window(
            bm, (side_x, wy, BASE_H + 1.05), 0.96, 1.30, yaw,
            I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
        )

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.32), 0.44, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.32), 0.44, math.pi, I_CREAM, I_ATTIC)

# 4. Overlapping Olive-Moss Shingle Roof w/ Brushed Brass Ridge Strap Bands + Chimney + Climbing Blossom Vine
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=4.95,
    eave_span=5.95,
    eave_z=EAVE_Z - 0.06,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=5,
    tile_cols=9,
    bell_flare=0.22,
    bargeboard_t=0.20,
)
# Decorative circular brass ridge straps wrapping ridge cap
for r_y in (-1.20, 0.0, 1.20):
    ak.add_cyl(bm, (0.0, r_y - 0.06, RIDGE_Z + 0.06), (0.0, r_y + 0.06, RIDGE_Z + 0.06), 0.155, 0.155, 12, I_BRASS, smooth=True)

# Cream limestone chimney on left rear slope reaching Z = 4.94m
ak.add_box(bm, (-1.15, 1.05, 4.08), (0.68, 0.68, 1.48), I_CREAM, bevel=0.025)
ak.add_box(bm, (-1.15, 1.05, 4.86), (0.82, 0.82, 0.14), I_CREAM, bevel=0.02)
ak.add_box(bm, (-1.15, 1.05, 4.93), (0.50, 0.50, 0.04), I_WOOD, bevel=0.01)

# Climbing blossom vine up left corner post, curving over archway rake + nestled moss-leaf tufts on roof
ak.add_vine_climb(
    bm,
    [(-1.72, -WALL_D * 0.5 - 0.05, 0.50),
     (-1.58, -WALL_D * 0.5 - 0.06, 1.22),
     (-1.74, -WALL_D * 0.5 - 0.06, 1.98),
     (-1.35, -WALL_D * 0.5 - 0.05, 2.74),
     (-0.75, -WALL_D * 0.5 - 0.05, 3.55)],
    0.032, I_WOOD, I_LEAF, I_FLOWER, seed=538
)
ak.add_vine_climb(
    bm,
    [(0.92, -1.35, 3.92), (1.35, -0.45, 3.52), (1.05, 0.55, 3.80), (1.42, 1.40, 3.45)],
    0.018, I_ROOF, I_LEAF, I_FLOWER, seed=539
)

mesh = bpy.data.meshes.new("cottage-teal")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-teal", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-teal", (6.0, 5.05, 4.95))
