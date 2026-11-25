"""Build Moonbay Coast 3D Coral-Turret Market Shopfront (market-coral):
Matches ASSETS['market-coral'].size = [10.5, 7.6, 6.7] & tripo-references/v1/market-coral.png:
- Left cylindrical lookout turret with cut-stone plinth, exposed stone quoins, stone corbel ring, conical terracotta tile roof & finial
- Main gabled terracotta-coral stucco storefront with sage-and-cream striped scalloped shop awning on bronze brackets
- Emerald-teal double arched shop door with brass ring pulls + flanking arched flowerbox windows + attic bullseye window
- Shuttered arched side/rear windows, bronze rainwater downspouts, carved timber rafter tails, terracotta roof tiles & stone chimney.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "mc-stone", (0.90, 0.82, 0.68), (0.64, 0.56, 0.43), rows=6, cols=10, seed=401)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "mc-coral", (0.94, 0.54, 0.36), (0.86, 0.44, 0.28), seed=402)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "mc-wood", (0.50, 0.31, 0.18), (0.31, 0.18, 0.10), planks=5, seed=403)
door_col, door_rgh = ak.make_wood_textures(out_dir, "mc-door-teal", (0.14, 0.50, 0.46), (0.08, 0.32, 0.30), planks=6, seed=404)
roof_col, roof_rgh = ak.make_shingle_textures(out_dir, "mc-roof", (0.82, 0.34, 0.18), (0.64, 0.22, 0.12), rows=8, cols=12, seed=405)
awn_col, awn_rgh = ak.make_striped_awning_textures(out_dir, "mc-awning", (0.38, 0.56, 0.36), (0.95, 0.91, 0.80), stripes=9.0)

M_STONE = ak.make_pbr_mat("McStone", stone_col, stone_rgh)
M_CORAL = ak.make_pbr_mat("McCoralStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("McTimber", wood_col, wood_rgh)
M_TEAL_WOOD = ak.make_pbr_mat("McTealDoor", door_col, door_rgh)
M_TEAL_TRIM = ak.make_pbr_mat("McTealTrim", color=(0.16, 0.54, 0.50), roughness=0.46)
M_ROOF = ak.make_pbr_mat("McTerracotta", roof_col, roof_rgh)
M_AWNING = ak.make_pbr_mat("McAwning", awn_col, awn_rgh, double_sided=True)
M_CREAM = ak.make_pbr_mat("McCreamStone", color=(0.93, 0.87, 0.74), roughness=0.65)
M_GLASS = ak.make_pbr_mat("McGlass", color=(0.06, 0.30, 0.32), metallic=0.10, roughness=0.14, emission=(0.14, 0.42, 0.40), emission_strength=0.25)
M_BRASS = ak.make_pbr_mat("McBrass", color=(0.92, 0.74, 0.32), metallic=0.46, roughness=0.30)
M_BRONZE = ak.make_pbr_mat("McBronzePipe", color=(0.44, 0.28, 0.18), metallic=0.36, roughness=0.45)
M_LEAF = ak.make_pbr_mat("McLeaf", color=(0.24, 0.56, 0.22), roughness=0.52, double_sided=True)
M_FLOWER = ak.make_pbr_mat("McCoralBloom", color=(0.98, 0.54, 0.44), roughness=0.42, double_sided=True)
M_LANTERN = ak.make_pbr_mat("McLanternGlow", color=(1.0, 0.86, 0.46), roughness=0.22, emission=(1.0, 0.78, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_CORAL, M_WOOD, M_TEAL_WOOD, M_TEAL_TRIM, M_ROOF, M_AWNING, M_CREAM, M_GLASS, M_BRASS, M_BRONZE, M_LEAF, M_FLOWER, M_LANTERN]
I_STONE, I_CORAL, I_WOOD, I_TEAL_DOOR, I_TEAL, I_ROOF, I_AWN, I_CREAM, I_GLASS, I_BRASS, I_BRONZE, I_LEAF, I_FLOWER, I_LANTERN = range(len(MATS))

bm = bmesh.new()


def add_shuttered_window(center, width, height, yaw):
    ak.add_arched_window(bm, center, width, height, yaw, I_CREAM, I_GLASS, I_TEAL, cross_mullions=True)
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    sh_w = width * 0.44
    sh_h = height * 0.72
    for s in (-1, 1):
        # Slightly swung-open angled louvered wooden teal shutter panels flanking window
        ang_open = s * 0.32
        sx = s * (width * 0.5 + sh_w * 0.54)
        ak.add_box(bm, xform(sx, -0.09, -height * 0.10), (sh_w, 0.055, sh_h), I_TEAL_DOOR, bevel=0.008, rot_euler=(0.0, 0.0, yaw + ang_open))
        # Louver slats across shutter face
        for li in range(4):
            lz = -height * 0.10 + (li - 1.5) * (sh_h * 0.21)
            ak.add_box(bm, xform(sx, -0.11, lz), (sh_w * 0.78, 0.025, 0.035), I_TEAL, rot_euler=(0.25, 0.0, yaw + ang_open))


# Co-ordinated layout inside [10.5 x 7.6 x 6.7] centered near X=0, Y=0:
# Main gable wing centered at MAIN_X = +1.45 (width 6.90 -> X in [-2.00 .. +4.90], depth 6.30 -> Y in [-3.15 .. +3.15])
# Left cylindrical turret at TUR_X = -3.25, TUR_Y = -0.35 (radius 1.72 -> minX = -4.97, maxX = +5.20 w/ eaves -> total W ~ 10.35m)
MAIN_X = 1.45
MAIN_W = 6.70
MAIN_D = 6.20
BASE_H = 0.52
EAVE_Z = 3.72
RIDGE_Z = 6.55

TUR_X = -3.25
TUR_Y = -0.35
TUR_R = 1.62

# 1. Left Cylindrical Lookout Turret (Plinth, Stucco Drum, Exposed Corner Stones, Corbels, Conical Tile Roof + Urn Finial)
ak.add_lathe(bm, [
    (0.0, 0.0), (TUR_R + 0.14, 0.0), (TUR_R + 0.14, BASE_H), (TUR_R + 0.02, BASE_H + 0.05), (0.0, BASE_H + 0.05),
], 24, I_STONE, center=(TUR_X, TUR_Y, 0.0), smooth_side=True)

ak.add_lathe(bm, [
    (TUR_R, BASE_H), (TUR_R, 4.15), (TUR_R + 0.12, 4.22), (TUR_R + 0.12, 4.46), (0.0, 4.46),
], 24, I_CORAL, center=(TUR_X, TUR_Y, 0.0), smooth_side=True)

# Turret belt course + cream corbel cornice brackets under circular eaves
ak.add_lathe(bm, [
    (TUR_R + 0.05, 3.68), (TUR_R + 0.09, 3.76), (TUR_R + 0.05, 3.84),
], 24, I_CREAM, center=(TUR_X, TUR_Y, 0.0), smooth_side=True)
ak.add_lathe(bm, [
    (TUR_R + 0.04, 4.28), (TUR_R + 0.18, 4.38), (TUR_R + 0.18, 4.50), (0.0, 4.50),
], 24, I_CREAM, center=(TUR_X, TUR_Y, 0.0), smooth_side=True)
for ci in range(10):
    a = ci * math.tau / 10.0
    ak.add_box(bm, (TUR_X + math.cos(a) * (TUR_R + 0.08), TUR_Y + math.sin(a) * (TUR_R + 0.08), 4.12), (0.16, 0.16, 0.30), I_CREAM, bevel=0.015, rot_euler=(0, 0, a))

# Sculpted conical clay-tile turret roof + ribbed ridges + urn finial (Z = 4.50 .. 6.28)
n_lat_t = 6
n_lon_t = 20
for ir in range(n_lat_t - 1):
    u0, u1 = ir / (n_lat_t - 1), (ir + 1) / (n_lat_t - 1)
    r0 = (TUR_R + 0.34) * (1.0 - u0 * 0.90)
    r1 = (TUR_R + 0.34) * (1.0 - u1 * 0.90)
    z0 = 4.46 + 1.44 * (u0 ** 0.85)
    z1 = 4.46 + 1.44 * (u1 ** 0.85)
    for iseg in range(n_lon_t):
        a = (iseg + 0.5) * math.tau / n_lon_t
        px, py = TUR_X + math.cos(a) * (r0 + r1) * 0.5, TUR_Y + math.sin(a) * (r0 + r1) * 0.5
        tile_w = math.tau * r0 / n_lon_t * 0.96
        seg_l = math.hypot(r0 - r1, z1 - z0) + 0.08
        tilt = math.atan2(z1 - z0, r0 - r1)
        ak.add_box(bm, (px, py, (z0 + z1) * 0.5), (seg_l, tile_w, 0.08), I_ROOF, rot_euler=(0.0, -tilt, a))
ak.add_lathe(bm, [
    (TUR_R + 0.32, 4.46), (0.28, 5.88), (0.28, 5.96), (0.16, 6.02), (0.22, 6.14), (0.12, 6.22), (0.0, 6.28),
], 16, I_ROOF if False else I_CREAM, center=(TUR_X, TUR_Y, 0.0), smooth_side=True)
# Inner solid conical terracotta roof shell under staggered tiles
ak.add_lathe(bm, [
    (TUR_R + 0.28, 4.46), (0.20, 5.88), (0.0, 5.90),
], 20, I_ROOF, center=(TUR_X, TUR_Y, 0.0), smooth_side=True)

# Turret arched window with floral window-box facing front-left (-Y, slightly -X)
ak.add_arched_window(
    bm,
    (TUR_X - 0.35, TUR_Y - TUR_R + 0.04, 2.25),
    1.12, 1.58, -0.22,
    I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
)

# 2. Main Coral Stucco Shopfront Wing + Cut-Stone Plinth + Door Steps + Rainwater Downspouts
ak.add_box(bm, (MAIN_X, 0.0, BASE_H * 0.5), (MAIN_W + 0.32, MAIN_D + 0.32, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (MAIN_X, 0.0, BASE_H + 0.02), (MAIN_W + 0.42, MAIN_D + 0.42, 0.08), I_STONE, bevel=0.02)
# Entrance steps centered below front shop door (MAIN_X)
ak.add_box(bm, (MAIN_X, -MAIN_D * 0.5 - 0.30, 0.14), (2.40, 0.68, 0.28), I_STONE, bevel=0.025)
ak.add_box(bm, (MAIN_X, -MAIN_D * 0.5 - 0.18, 0.34), (2.05, 0.44, 0.18), I_STONE, bevel=0.02)

ak.add_box(bm, (MAIN_X, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (MAIN_W, MAIN_D, EAVE_Z - BASE_H), I_CORAL, bevel=0.02)
# Exposed stone corner quoins on right front/back corners
for cy_s in (-1, 1):
    for qz_i in range(4):
        qz = BASE_H + 0.24 + qz_i * 0.30
        qw = 0.56 if qz_i % 2 == 0 else 0.38
        ak.add_box(bm, (MAIN_X + MAIN_W * 0.5 - qw * 0.35, cy_s * (MAIN_D * 0.5 - 0.06), qz), (qw, 0.26, 0.20), I_CREAM, bevel=0.015)

# Front & Rear Coral Gables + Timber Rafter Tails along Eaves
gw_m = MAIN_W * 0.5
gz_top = RIDGE_Z - 0.12
for end_y, norm_s in ((-MAIN_D * 0.5, -1), (MAIN_D * 0.5, 1)):
    vl = bm.verts.new(Vector((MAIN_X - gw_m, end_y, EAVE_Z - 0.04)))
    vr = bm.verts.new(Vector((MAIN_X + gw_m, end_y, EAVE_Z - 0.04)))
    vt = bm.verts.new(Vector((MAIN_X, end_y, gz_top)))
    vl2 = bm.verts.new(Vector((MAIN_X - gw_m, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    vr2 = bm.verts.new(Vector((MAIN_X + gw_m, end_y - norm_s * 0.18, EAVE_Z - 0.04)))
    vt2 = bm.verts.new(Vector((MAIN_X, end_y - norm_s * 0.18, gz_top)))
    gfaces = [
        bm.faces.new((vl, vr, vt) if norm_s < 0 else (vr, vl, vt)),
        bm.faces.new((vr2, vl2, vt2) if norm_s < 0 else (vl2, vr2, vt2)),
        bm.faces.new((vl, vt, vt2, vl2) if norm_s < 0 else (vt, vr, vr2, vt2)),
        bm.faces.new((vt, vr, vr2, vt2) if norm_s < 0 else (vl, vt, vt2, vl2)),
    ]
    bmesh.ops.recalc_face_normals(bm, faces=gfaces)
    ak.paint_faces(bm, gfaces, I_CORAL, smooth=False, uv_scale=0.35)

# Rafter tails along right & left eaves
for ry in (-2.4, -1.2, 0.0, 1.2, 2.4):
    ak.add_box(bm, (MAIN_X + MAIN_W * 0.5 + 0.18, ry, EAVE_Z - 0.14), (0.38, 0.16, 0.22), I_WOOD, bevel=0.015)

# Vertical Bronze Rainwater Downspouts with bracket collars
for dx, dy in ((MAIN_X + MAIN_W * 0.5 + 0.06, -MAIN_D * 0.5 + 0.18), (TUR_X - TUR_R - 0.04, TUR_Y - 0.25)):
    ak.add_cyl(bm, (dx, dy, 0.35), (dx, dy, EAVE_Z + 0.05), 0.065, 0.065, 8, I_BRONZE, smooth=True)
    for bz in (1.1, 2.2, 3.2):
        ak.add_cyl(bm, (dx, dy, bz - 0.04), (dx, dy, bz + 0.04), 0.088, 0.088, 8, I_BRONZE, smooth=True)

# 3. Front Storefront: Emerald-Teal Door, Flanking Flowerbox Windows, Striped Awning & Attic Bullseye
ak.add_arched_door(bm, (MAIN_X, -MAIN_D * 0.5 - 0.02, BASE_H), 1.68, 2.35, 0.0, I_TEAL_DOOR, I_CREAM, I_BRASS)
for sx in (-1, 1):
    ak.add_arched_window(
        bm,
        (MAIN_X + sx * 1.85, -MAIN_D * 0.5 - 0.03, BASE_H + 1.32),
        1.16, 1.56, 0.0,
        I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
    )
    ak.add_wall_lantern(bm, (MAIN_X + sx * 1.06, -MAIN_D * 0.5 - 0.02, BASE_H + 1.95), 0.0, I_BRASS, I_LANTERN)

# Wide Sage-and-Cream Striped Awning over shopfront under stone ledger beam
ak.add_box(bm, (MAIN_X, -MAIN_D * 0.5 - 0.06, BASE_H + 2.86), (5.75, 0.22, 0.18), I_CREAM, bevel=0.02)
ak.add_scalloped_awning(bm, (MAIN_X, -MAIN_D * 0.5 - 0.06, BASE_H + 2.82), 5.35, 0.88, 0.38, 0.0, I_AWN, I_BRONZE, scallops=9)
for bx in (MAIN_X - 2.68, MAIN_X + 2.68):
    ak.add_sphere(bm, (bx, -MAIN_D * 0.5 - 0.92, BASE_H + 2.44), 0.08, (1, 1, 1), 1, I_BRONZE, smooth=True)

# Front & Rear Gable Attic Circular Bullseye Windows
ak.add_round_window(bm, (MAIN_X, -MAIN_D * 0.5 - 0.04, 4.72), 0.52, 0.0, I_CREAM, I_GLASS)
ak.add_round_window(bm, (MAIN_X, MAIN_D * 0.5 + 0.04, 4.72), 0.52, math.pi, I_CREAM, I_GLASS)

# Side (+X) Shuttered Windows & Rear (+Y) Arched Windows
for wy in (-1.35, 1.35):
    add_shuttered_window((MAIN_X + MAIN_W * 0.5 + 0.03, wy, BASE_H + 1.48), 1.18, 1.48, math.pi * 0.5)
for rx in (MAIN_X - 1.75, MAIN_X + 1.75):
    add_shuttered_window((rx, MAIN_D * 0.5 + 0.03, BASE_H + 1.48), 1.18, 1.48, math.pi)

# 4. Main Overlapping Clay Terracotta Barrel-Tile Gable Roof + Chimney (apex Z <= 6.70m)
ak.add_tiled_gable_roof(
    bm,
    center_xy=(MAIN_X, 0.0),
    ridge_span=6.92,
    eave_span=7.62,
    eave_z=EAVE_Z - 0.06,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_CREAM,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=6,
    tile_cols=11,
    bell_flare=0.14,
    bargeboard_t=0.20,
)
# Stucco chimney with cream stone cap & clay pot reaching Z = 6.70m
CH_X, CH_Y = MAIN_X + 1.65, 1.45
ak.add_box(bm, (CH_X, CH_Y, 5.55), (0.86, 0.86, 1.65), I_CREAM, bevel=0.03)
ak.add_box(bm, (CH_X, CH_Y, 6.42), (1.02, 1.02, 0.16), I_CREAM, bevel=0.025)
ak.add_box(bm, (CH_X, CH_Y, 6.60), (0.64, 0.64, 0.20), I_ROOF, bevel=0.02)

mesh = bpy.data.meshes.new("market-coral")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("market-coral", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "market-coral", (10.5, 7.6, 6.7))
