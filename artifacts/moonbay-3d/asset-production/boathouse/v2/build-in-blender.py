"""Build Moonbay Coast 3D Marina Boathouse v2 (boathouse):
Fixes arched door Z-fighting via arch_kit v2, adds rich coastal slate-navy gable upper cladding, carved oak gable brackets,
deep coastal teal window mullions over cozy cathedral sea glass, fuller striped doorway awning, and roof stone chimney.
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

stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "boat-stone", (0.86, 0.79, 0.66), (0.58, 0.51, 0.42), rows=6, cols=10, seed=301
)
clap_col, clap_rough = ak.make_wood_textures(
    out_dir, "boat-clap", (0.74, 0.85, 0.88), (0.48, 0.64, 0.72), planks=10, seed=302
)
gable_col, gable_rough = ak.make_wood_textures(
    out_dir, "boat-gable", (0.14, 0.38, 0.56), (0.08, 0.24, 0.40), planks=8, seed=306
)
oak_col, oak_rough = ak.make_wood_textures(
    out_dir, "boat-oak", (0.64, 0.42, 0.22), (0.38, 0.23, 0.11), planks=6, seed=303
)
roof_col, roof_rough = ak.make_shingle_textures(
    out_dir, "boat-roof", (0.10, 0.34, 0.56), (0.06, 0.22, 0.40), rows=8, cols=12, seed=304
)
awning_col, awning_rough = ak.make_striped_awning_textures(
    out_dir, "boat-awning", (0.14, 0.48, 0.76), (0.96, 0.92, 0.80), stripes=9.0
)

MAT_STONE = ak.make_pbr_mat("BoatStone", stone_col, stone_rough)
MAT_CLAP = ak.make_pbr_mat("BoatClapboard", clap_col, clap_rough)
MAT_GABLE = ak.make_pbr_mat("BoatNavyGable", gable_col, gable_rough)
MAT_OAK = ak.make_pbr_mat("BoatHoneyOak", oak_col, oak_rough)
MAT_ROOF = ak.make_pbr_mat("BoatSlateBlueRoof", roof_col, roof_rough)
MAT_AWNING = ak.make_pbr_mat("BoatStripedAwning", awning_col, awning_rough, double_sided=True)
MAT_CREAM = ak.make_pbr_mat("BoatCreamTrim", color=(0.94, 0.88, 0.76), roughness=0.62)
MAT_TEAL = ak.make_pbr_mat("BoatDeepTeal", color=(0.10, 0.42, 0.44), roughness=0.48)
MAT_GLASS = ak.make_pbr_mat("BoatGlass", color=(0.06, 0.30, 0.36), metallic=0.12, roughness=0.14, emission=(0.12, 0.40, 0.44), emission_strength=0.22)
MAT_BRASS = ak.make_pbr_mat("BoatBrass", color=(0.94, 0.76, 0.34), metallic=0.48, roughness=0.28)
MAT_BUOY = ak.make_pbr_mat("BoatLifeBuoy", color=(0.86, 0.26, 0.20), roughness=0.45)
MAT_LANTERN = ak.make_pbr_mat("BoatLanternGlow", color=(1.0, 0.84, 0.45), roughness=0.22, emission=(1.0, 0.78, 0.38), emission_strength=1.35)

MATS = [MAT_STONE, MAT_CLAP, MAT_GABLE, MAT_OAK, MAT_ROOF, MAT_AWNING, MAT_CREAM, MAT_TEAL, MAT_GLASS, MAT_BRASS, MAT_BUOY, MAT_LANTERN]
I_STONE, I_CLAP, I_GABLE, I_OAK, I_ROOF, I_AWN, I_CREAM, I_TEAL, I_GLASS, I_BRASS, I_BUOY, I_LANTERN = range(len(MATS))

bm = bmesh.new()

WALL_W = 7.45
WALL_D = 5.20
BASE_H = 0.46
EAVE_Z = 3.25
RIDGE_Z = 5.26

# 1. Cut-Stone Coastal Foundation Plinth & Front Stone Dock Step
ak.add_box(bm, (0.0, 0.0, 0.23), (WALL_W + 0.45, WALL_D + 0.35, BASE_H), I_STONE, bevel=0.04)
ak.add_box(bm, (0.0, 0.0, 0.47), (WALL_W + 0.56, WALL_D + 0.46, 0.08), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.26, 0.14), (2.85, 0.64, 0.28), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.14, 0.34), (2.40, 0.44, 0.18), I_STONE, bevel=0.02)

# 2. Main Hall Body + Layered Beveled Horizontal Clapboard Planks + Deep Slate-Navy Gable Triangles
ak.add_box(bm, (0.0, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (WALL_W, WALL_D, EAVE_Z - BASE_H), I_CLAP, bevel=0.02)
n_courses = 10
for ci in range(n_courses):
    cz = BASE_H + 0.16 + ci * ((EAVE_Z - BASE_H - 0.24) / n_courses)
    ak.add_box(bm, (0.0, 0.0, cz), (WALL_W + 0.08, WALL_D + 0.08, 0.16), I_CLAP, bevel=0.0, rot_euler=(0.02, 0.0, 0.0))

gw, gz_top = WALL_W * 0.5, RIDGE_Z - 0.08
for end_y, norm_s in ((-WALL_D * 0.5, -1), (WALL_D * 0.5, 1)):
    v_l = bm.verts.new(Vector((-gw, end_y, EAVE_Z - 0.04)))
    v_r = bm.verts.new(Vector((gw, end_y, EAVE_Z - 0.04)))
    v_t = bm.verts.new(Vector((0.0, end_y, gz_top)))
    v_l2 = bm.verts.new(Vector((-gw, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    v_r2 = bm.verts.new(Vector((gw, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    v_t2 = bm.verts.new(Vector((0.0, end_y - norm_s * 0.18, gz_top)))
    gfaces = [
        bm.faces.new((v_l, v_r, v_t) if norm_s < 0 else (v_r, v_l, v_t)),
        bm.faces.new((v_r2, v_l2, v_t2) if norm_s < 0 else (v_l2, v_r2, v_t2)),
        bm.faces.new((v_l, v_t, v_t2, v_l2) if norm_s < 0 else (v_t, v_r, v_r2, v_t2)),
        bm.faces.new((v_t, v_r, v_r2, v_t2) if norm_s < 0 else (v_l, v_t, v_t2, v_l2)),
    ]
    bmesh.ops.recalc_face_normals(bm, faces=gfaces)
    ak.paint_faces(bm, gfaces, I_GABLE, smooth=False, uv_scale=0.35)

# Cream timber tie beam + carved gable eave knee brackets
for gy in (-WALL_D * 0.5 - 0.04, WALL_D * 0.5 + 0.04):
    ak.add_box(bm, (0.0, gy, EAVE_Z + 0.02), (WALL_W + 0.24, 0.20, 0.22), I_CREAM, bevel=0.02)
    for b_s in (-1, 1):
        ak.add_box(bm, (b_s * 1.45, gy, EAVE_Z + 0.48), (0.20, 0.24, 0.72), I_CREAM, bevel=0.015, rot_euler=(0.0, -b_s * 0.28, 0.0))

# 3. Iconic Curved Honey-Oak Hull-Rib Corner Buttresses
for sx in (-1, 1):
    for sy in (-1, 1):
        cx0 = sx * (WALL_W * 0.5 + 0.24)
        cy0 = sy * (WALL_D * 0.5 + 0.02)
        ak.add_box(bm, (cx0, cy0, 0.26), (0.50, 0.46, 0.52), I_STONE, bevel=0.03)
        steps = 6
        for i in range(steps):
            t0, t1 = i / steps, (i + 1) / steps
            z0 = BASE_H + t0 * (EAVE_Z - BASE_H + 0.08)
            z1 = BASE_H + t1 * (EAVE_Z - BASE_H + 0.08)
            bow0 = math.sin(t0 * math.pi) * 0.24 + t0 * 0.10
            bow1 = math.sin(t1 * math.pi) * 0.24 + t1 * 0.10
            ak.add_cyl(bm, (cx0 + sx * bow0, cy0, z0), (cx0 + sx * bow1, cy0, z1), 0.18, 0.17, 8, I_OAK, smooth=False)

# 4. Front (-Y) Arched Double Boat Doors + Fuller Striped Scalloped Awning + Porthole + Life-Ring Buoys
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.95, 2.25, 0.0, I_OAK, I_CREAM, I_BRASS)
ak.add_scalloped_awning(bm, (0.0, -WALL_D * 0.5 - 0.05, BASE_H + 2.48), 3.05, 0.70, 0.28, 0.0, I_AWN, I_OAK, scallops=8)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 4.18), 0.44, 0.0, I_CREAM, I_GLASS)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 4.18), 0.44, math.pi, I_CREAM, I_GLASS)

for side in (-1, 1):
    ak.add_arched_window(bm, (side * 2.42, -WALL_D * 0.5 - 0.03, BASE_H + 1.25), 1.25, 1.48, 0.0, I_TEAL, I_GLASS, I_CREAM, cross_mullions=True)
    ak.add_wall_lantern(bm, (side * 1.42, -WALL_D * 0.5 - 0.02, BASE_H + 1.82), 0.0, I_BRASS, I_LANTERN)
    bx, by, bz = side * 3.32, -WALL_D * 0.5 - 0.10, BASE_H + 1.68
    for bi in range(12):
        a0 = bi * math.tau / 12.0
        a1 = (bi + 1) * math.tau / 12.0
        p0 = (bx + math.cos(a0) * 0.26, by, bz + math.sin(a0) * 0.26)
        p1 = (bx + math.cos(a1) * 0.26, by, bz + math.sin(a1) * 0.26)
        b_mat = I_BUOY if (bi // 2) % 2 == 0 else I_CREAM
        ak.add_cyl(bm, p0, p1, 0.075, 0.075, 8, b_mat, smooth=True)

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-1.35, 1.35):
        ak.add_arched_window(bm, (side_x, wy, BASE_H + 1.25), 1.22, 1.48, yaw, I_TEAL, I_GLASS, I_CREAM, cross_mullions=True)
for rx in (-2.05, 0.0, 2.05):
    ak.add_arched_window(bm, (rx, WALL_D * 0.5 + 0.03, BASE_H + 1.25), 1.22, 1.48, math.pi, I_TEAL, I_GLASS, I_CREAM, cross_mullions=True)

# 5. Sweeping Bell-Eave Slate-Blue Shingle Roof + Sculpted Stone Chimney on East Rear Slope
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=5.96,
    eave_span=8.78,
    eave_z=EAVE_Z - 0.04,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_OAK,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=6,
    tile_cols=11,
    bell_flare=0.22,
    bargeboard_t=0.22,
)
# Coastal stone chimney on right-rear roof slope reaching <= 5.42m
ak.add_box(bm, (1.85, 1.25, 4.68), (0.82, 0.82, 1.25), I_STONE, bevel=0.03)
ak.add_box(bm, (1.85, 1.25, 5.34), (0.96, 0.96, 0.14), I_STONE, bevel=0.02)

for ey in (-2.98, 2.98):
    ak.add_cyl(bm, (0.0, ey, RIDGE_Z), (0.0, ey, 5.45), 0.09, 0.03, 8, I_CREAM, smooth=True)
    ak.add_sphere(bm, (0.0, ey, 5.38), 0.11, (1, 1, 1.15), 1, I_BRASS, smooth=True)

mesh = bpy.data.meshes.new("boathouse")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("boathouse", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "boathouse", (8.8, 6.3, 5.45))
