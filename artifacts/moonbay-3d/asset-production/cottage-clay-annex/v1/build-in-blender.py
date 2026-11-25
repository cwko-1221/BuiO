"""Build Moonbay Coast 3D Flower-Garland Portico Cottage (cottage-clay-annex):
Matches ASSETS['cottage-clay-annex'].size = [6.15, 5.15, 4.85] & tripo-references/v1/cottage-clay-annex.png:
- Cozy low-eave cream-peach stucco cottage on stepped stone plinth w/ corner masonry quoins & stone steps
- Iconic protruding semicircular carved-limestone entrance portico arch cradling the oak plank door & twin warm wall lanterns
- Lush multi-petal pink, lilac & buttercream floral garland + dense emerald vine foliage crowning the portico arch
- Bell-eave terracotta clay roof, warm glowing arched windows w/ floral window-box, side climbing vine & stone chimney.
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "ca-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=521)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "ca-stucco", (0.95, 0.86, 0.74), (0.88, 0.76, 0.61), seed=522)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "ca-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=523)
door_col, door_rgh = ak.make_wood_textures(out_dir, "ca-door", (0.64, 0.33, 0.14), (0.40, 0.19, 0.08), planks=6, seed=524, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(out_dir, "ca-clay-roof", (0.86, 0.44, 0.18), (0.66, 0.28, 0.10), rows=7, cols=9, seed=525)

M_STONE = ak.make_pbr_mat("CaStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CaStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CaTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CaOakDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CaClayRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CaCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat("CaWarmGlass", color=(0.96, 0.74, 0.26), metallic=0.05, roughness=0.14, emission=(0.98, 0.72, 0.24), emission_strength=0.45)
M_ATTIC = ak.make_pbr_mat("CaAtticGlass", color=(0.04, 0.20, 0.18), metallic=0.22, roughness=0.10)
M_BRASS = ak.make_pbr_mat("CaBrass", color=(0.92, 0.74, 0.32), metallic=0.45, roughness=0.30)
M_LEAF = ak.make_pbr_mat("CaLeaf", color=(0.24, 0.56, 0.20), roughness=0.50, double_sided=True)
M_PINK = ak.make_pbr_mat("CaBloomPink", color=(0.98, 0.56, 0.68), roughness=0.40, double_sided=True)
M_LILAC = ak.make_pbr_mat("CaBloomLilac", color=(0.74, 0.56, 0.94), roughness=0.40, double_sided=True)
M_BUTTER = ak.make_pbr_mat("CaBloomButter", color=(0.99, 0.91, 0.46), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CaLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_LEAF, M_PINK, M_LILAC, M_BUTTER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_LEAF, I_PINK, I_LILAC, I_BUTTER, I_LANTERN = range(len(MATS))

bm = bmesh.new()


def add_rosette_flower(center, normal_dir, rad, pmat):
    c = Vector(center)
    n = Vector(normal_dir).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    ak.add_sphere(bm, c + n * 0.015, rad * 0.26, (1, 1, 0.7), 1, I_BRASS, smooth=True)
    for pi in range(6):
        pa = pi * math.tau / 6.0
        rd = u * math.cos(pa) + v * math.sin(pa)
        sd = -u * math.sin(pa) + v * math.cos(pa)
        f = bm.faces.new((
            bm.verts.new(c),
            bm.verts.new(c + rd * (rad * 0.62) + sd * (rad * 0.28) + n * 0.015),
            bm.verts.new(c + rd * rad),
            bm.verts.new(c + rd * (rad * 0.62) - sd * (rad * 0.28) + n * 0.015),
        ))
        ak.paint_faces(bm, [f], pmat, smooth=True, uv_scale=1.0)


WALL_W = 5.05
WALL_D = 4.45
BASE_H = 0.44
EAVE_Z = 2.42
RIDGE_Z = 4.74

# 1. Stepped Cut-Stone Plinth + Door Threshold Stairs
ak.add_box(bm, (0.0, 0.0, BASE_H * 0.5), (WALL_W + 0.34, WALL_D + 0.34, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.02), (WALL_W + 0.44, WALL_D + 0.44, 0.07), I_STONE, bevel=0.02)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.30, 0.13), (2.20, 0.66, 0.26), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.16, 0.31), (1.88, 0.42, 0.16), I_STONE, bevel=0.02)

# 2. Peach-Cream Stucco Walls + Corner Stone Quoin Blocks + Front/Rear Bell-Eave Gables
ak.add_box(bm, (0.0, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (WALL_W, WALL_D, EAVE_Z - BASE_H), I_STUCCO, bevel=0.02)
# Protruding stacked masonry corner quoins on right & left corners
for sx in (-1, 1):
    for qi in range(4):
        qz = BASE_H + 0.20 + qi * 0.38
        ak.add_box(bm, (sx * (WALL_W * 0.5 - 0.04), -WALL_D * 0.5 + 0.06, qz), (0.34, 0.26, 0.18), I_CREAM, bevel=0.015)

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

# 3. Signature Protruding Carved-Limestone Portico Arch framing Doorway + Lush Floral Arch Garland!
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.38, 1.98, 0.0, I_DOOR, I_CREAM, I_BRASS)
for lsx in (-0.90, 0.90):
    ak.add_wall_lantern(bm, (lsx, -WALL_D * 0.5 - 0.02, BASE_H + 1.15), 0.0, I_WOOD, I_LANTERN)

# Outer Portico Frame Columns (X = +/- 1.24, projecting forward y = -WALL_D*0.5 - 0.18) + Semicircular Hood Arch (top at Z=2.92!)
PORT_Y = -WALL_D * 0.5 - 0.16
for sx in (-1, 1):
    ak.add_box(bm, (sx * 1.22, PORT_Y, BASE_H + 0.10), (0.34, 0.34, 0.20), I_CREAM, bevel=0.015)
    ak.add_box(bm, (sx * 1.22, PORT_Y, BASE_H + 0.72), (0.24, 0.26, 1.08), I_CREAM, bevel=0.015)
    ak.add_box(bm, (sx * 1.22, PORT_Y, BASE_H + 1.32), (0.34, 0.34, 0.14), I_CREAM, bevel=0.015)
ak.add_curved_arch_extrude(bm, 1.22, BASE_H + 1.36, 1.05, 0.32, 0.26, 16, I_CREAM, offset=(0.0, PORT_Y, 0.0))

# Lush Coastal Flower & Leaf Garland Draping along the Portico Extrados Arch!
rng = random.Random(527)
garland_pts = []
for gi in range(13):
    u = gi / 12.0
    ang = math.pi * (1.0 - u)
    gx = math.cos(ang) * 1.32
    gz = BASE_H + 1.36 + math.sin(ang) * 1.15
    garland_pts.append((gx, PORT_Y - 0.04, gz))
ak.add_vine_climb(bm, garland_pts, 0.025, I_WOOD, I_LEAF, None, seed=528)
for gi in range(11):
    u = (gi + 0.5) / 11.0
    ang = math.pi * (1.0 - u)
    gx = math.cos(ang) * 1.36
    gz = BASE_H + 1.36 + math.sin(ang) * 1.18
    pmat = (I_PINK, I_BUTTER, I_LILAC)[gi % 3]
    add_rosette_flower((gx, PORT_Y - 0.14, gz), (math.cos(ang) * 0.2, -1.0, math.sin(ang) * 0.3), 0.115, pmat)

# Flanking Front Arched Window + Side/Rear Arched Windows + Climbing Left Corner Vine
ak.add_arched_window(
    bm, (-1.85, -WALL_D * 0.5 - 0.03, BASE_H + 0.96), 0.88, 1.22, 0.0,
    I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_PINK, leaf_mat=I_LEAF
)
for wy in (-0.95, 0.95):
    ak.add_arched_window(bm, (WALL_W * 0.5 + 0.03, wy, BASE_H + 0.98), 0.96, 1.26, math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)
    ak.add_arched_window(bm, (-WALL_W * 0.5 - 0.03, wy, BASE_H + 0.98), 0.96, 1.26, -math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)
for rx in (-1.25, 1.25):
    ak.add_arched_window(bm, (rx, WALL_D * 0.5 + 0.03, BASE_H + 0.98), 0.96, 1.26, math.pi, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.42), 0.42, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.42), 0.42, math.pi, I_CREAM, I_ATTIC)

ak.add_vine_climb(
    bm,
    [(-2.35, -WALL_D * 0.5 - 0.04, 0.48), (-2.42, -WALL_D * 0.5 - 0.06, 1.15), (-2.30, -WALL_D * 0.5 - 0.06, 1.85), (-2.05, -WALL_D * 0.5 - 0.05, 2.48)],
    0.030, I_WOOD, I_LEAF, I_PINK, seed=529
)

# 4. Flared Bell-Eave Terracotta Gable Roof + Tall Limestone Chimney (<= 4.85m)
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=4.95,
    eave_span=6.08,
    eave_z=EAVE_Z - 0.06,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=5,
    tile_cols=9,
    bell_flare=0.28,
    bargeboard_t=0.20,
)
ak.add_box(bm, (-1.15, 1.05, 4.02), (0.68, 0.68, 1.38), I_CREAM, bevel=0.025)
ak.add_box(bm, (-1.15, 1.05, 4.74), (0.82, 0.82, 0.14), I_CREAM, bevel=0.02)
ak.add_box(bm, (-1.15, 1.05, 4.82), (0.50, 0.50, 0.04), I_WOOD, bevel=0.01)

mesh = bpy.data.meshes.new("cottage-clay-annex")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-clay-annex", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-clay-annex", (6.15, 5.15, 4.85))
