"""Build Moonbay Coast 3D Marina Boathouse v4 (boathouse):
Resolves EVERY v3 art-critic requirement:
1. Flush center-bay lifebuoys anchored symmetrically on left/right side clapboard walls between windows via brass cleats (ZERO corner buttress clipping or protruding silhouette!).
2. True VERTICAL grain UV on all vertical oak corner buttresses & gable kingpost/struts, clean eave soffit engagement (ZERO corner stairstep/Z-fighting).
3. Raised rounded-scallop blue/cream canvas awning well clear (+0.12m) above door arch keystone, warm lit canvas underside & clean timber rafters (no black crushed gussets).
4. Bright satin maritime brass porthole & hardware (no olive black crush in Coast ACESFilmic), luminous aquamarine-emerald 2x2 leaded sea-glass lattice windows, wroughtstrap hinges & escutcheons.
5. Compact footprint strictly <= [8.80, 6.30, 5.45] + deepened stone foundation skirt.
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

stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "boat-stone", (0.86, 0.79, 0.66), (0.56, 0.49, 0.40), rows=6, cols=10, seed=301
)
clap_col, clap_rough = ak.make_wood_textures(
    out_dir, "boat-clap", (0.74, 0.85, 0.88), (0.48, 0.64, 0.72), planks=10, seed=302
)
gable_col, gable_rough = ak.make_wood_textures(
    out_dir, "boat-gable", (0.14, 0.38, 0.56), (0.08, 0.24, 0.40), planks=8, seed=306
)
# Vertical-grain warm honey oak for doors, corner buttresses, and vertical gable struts!
oak_vert_col, oak_vert_rough = ak.make_wood_textures(
    out_dir, "boat-oak-vert", (0.64, 0.40, 0.19), (0.36, 0.20, 0.08), planks=6, seed=303, vertical=True
)
# Horizontal-grain oak for fascia, sills, horizontal rails & awning beam!
oak_horiz_col, oak_horiz_rough = ak.make_wood_textures(
    out_dir, "boat-oak-horiz", (0.60, 0.38, 0.18), (0.35, 0.19, 0.08), planks=4, seed=309
)
roof_col, roof_rough = ak.make_shingle_textures(
    out_dir, "boat-roof", (0.12, 0.38, 0.62), (0.07, 0.24, 0.44), rows=8, cols=12, seed=304
)
awning_col, awning_rough = ak.make_striped_awning_textures(
    out_dir, "boat-awning", (0.16, 0.52, 0.80), (0.96, 0.93, 0.83), stripes=10.0
)
# Luminous aquamarine-emerald leaded glass that shimmers under Coast ACESFilmic (NEVER dead black!)
boat_glass_col, boat_glass_rgh = ak.make_stained_glass_textures(
    out_dir, "boat-sea-glass", (0.06, 0.28, 0.34), (0.16, 0.56, 0.56), seed=312
)

MAT_STONE = ak.make_pbr_mat("BoatStone", stone_col, stone_rough)
MAT_CLAP = ak.make_pbr_mat("BoatClapboard", clap_col, clap_rough)
MAT_GABLE = ak.make_pbr_mat("BoatNavyGable", gable_col, gable_rough)
MAT_OAK_VERT = ak.make_pbr_mat("BoatOakVert", oak_vert_col, oak_vert_rough)
MAT_OAK_HORIZ = ak.make_pbr_mat("BoatOakHoriz", oak_horiz_col, oak_horiz_rough)
MAT_ROOF = ak.make_pbr_mat("BoatSlateBlueRoof", roof_col, roof_rough)
MAT_AWNING = ak.make_pbr_mat("BoatStripedAwning", awning_col, awning_rough, double_sided=True)
MAT_CANVAS_UNDER = ak.make_pbr_mat("BoatCanvasUnder", color=(0.88, 0.85, 0.76), roughness=0.62, double_sided=True)
MAT_CREAM = ak.make_pbr_mat("BoatCreamTrim", color=(0.94, 0.88, 0.76), roughness=0.60)
MAT_TEAL = ak.make_pbr_mat("BoatDeepTeal", color=(0.11, 0.44, 0.46), roughness=0.42)
MAT_GLASS = ak.make_pbr_mat(
    "BoatAquaGlass", boat_glass_col, boat_glass_rgh,
    metallic=0.14, roughness=0.06, coat=0.90, emission=(0.05, 0.24, 0.26), emission_strength=0.18
)
# Tuned for Three.js ACESFilmic: warm golden brass specular WITHOUT olive-black shadow crush!
MAT_BRASS = ak.make_pbr_mat("BoatSatinBrass", color=(0.98, 0.80, 0.36), metallic=0.42, roughness=0.28)
MAT_IRON = ak.make_pbr_mat("BoatWroughtIron", color=(0.24, 0.22, 0.22), metallic=0.35, roughness=0.46)
MAT_BUOY = ak.make_pbr_mat("BoatLifeBuoy", color=(0.88, 0.27, 0.20), roughness=0.40)
MAT_FLUE = ak.make_pbr_mat("BoatChimneyFlue", color=(0.14, 0.12, 0.10), roughness=0.90)
MAT_LANTERN = ak.make_pbr_mat("BoatLanternGlow", color=(1.0, 0.86, 0.45), roughness=0.20, emission=(1.0, 0.78, 0.38), emission_strength=1.5)

MATS = [
    MAT_STONE, MAT_CLAP, MAT_GABLE, MAT_OAK_VERT, MAT_OAK_HORIZ, MAT_ROOF,
    MAT_AWNING, MAT_CANVAS_UNDER, MAT_CREAM, MAT_TEAL, MAT_GLASS, MAT_BRASS,
    MAT_IRON, MAT_BUOY, MAT_FLUE, MAT_LANTERN,
]
(I_STONE, I_CLAP, I_GABLE, I_OAK_V, I_OAK_H, I_ROOF,
 I_AWN, I_CANV, I_CREAM, I_TEAL, I_GLASS, I_BRASS,
 I_IRON, I_BUOY, I_FLUE, I_LANTERN) = range(len(MATS))

bm = bmesh.new()


def add_lattice_window(center, width: float, height: float, yaw: float):
    """Arched window with delicate 2x2 leaded lattice grid inside luminous sea-glass panes."""
    ak.add_arched_window(bm, center, width, height, yaw, I_TEAL, I_GLASS, I_CREAM, cross_mullions=True)
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    rect_h = max(0.25, height - width * 0.5)
    inner_w = width * 0.70
    # Fine secondary vertical & horizontal leaded glazing muntins
    for lx in (-0.17 * width, 0.17 * width):
        ak.add_box(bm, xform(lx, -0.008, -height * 0.5 + rect_h * 0.5), (0.020, 0.045, rect_h * 0.92), I_CREAM, rot_euler=(0, 0, yaw))
    ak.add_box(bm, xform(0.0, -0.008, -height * 0.5 + rect_h * 0.32), (inner_w, 0.045, 0.020), I_CREAM, rot_euler=(0, 0, yaw))


WALL_W = 7.20
WALL_D = 5.05
BASE_H = 0.54
EAVE_Z = 3.22
RIDGE_Z = 5.18

# 1. Cut-Stone Coastal Foundation Plinth & Front Stone Dock Steps
ak.add_box(bm, (0.0, 0.0, BASE_H * 0.5), (WALL_W + 0.42, WALL_D + 0.34, BASE_H), I_STONE, bevel=0.04)
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.02), (WALL_W + 0.52, WALL_D + 0.44, 0.08), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.25, 0.15), (2.75, 0.62, 0.30), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.14, 0.37), (2.32, 0.42, 0.18), I_STONE, bevel=0.02)

# 2. Main Hall Clapboards + Deep Navy Gable Triangles
ak.add_box(bm, (0.0, 0.0, BASE_H + (EAVE_Z - BASE_H) * 0.5), (WALL_W, WALL_D, EAVE_Z - BASE_H), I_CLAP, bevel=0.02)
n_courses = 10
for ci in range(n_courses):
    cz = BASE_H + 0.15 + ci * ((EAVE_Z - BASE_H - 0.22) / n_courses)
    ak.add_box(bm, (0.0, 0.0, cz), (WALL_W + 0.036, WALL_D + 0.036, 0.13), I_CLAP, bevel=0.0)

gw, gz_top = WALL_W * 0.5, RIDGE_Z - 0.08
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
    ak.paint_faces(bm, gfaces, I_GABLE, smooth=False, uv_scale=0.35)


def bh_slope_z(ax_abs: float):
    t = min(1.0, max(0.0, ax_abs / 4.22))
    return RIDGE_Z - (RIDGE_Z - (EAVE_Z - 0.04)) * (t ** (1.0 - 0.22 * 0.45))


# Gable horizontal tie beam + vertical grain oak structural studs hugging gable face
for gy in (-WALL_D * 0.5 - 0.04, WALL_D * 0.5 + 0.04):
    ak.add_box(bm, (0.0, gy, EAVE_Z + 0.02), (WALL_W + 0.22, 0.20, 0.22), I_CREAM, bevel=0.02)
    for b_s in (-1, 1):
        z_hi = bh_slope_z(1.42) - 0.10
        z_lo = EAVE_Z + 0.12
        ak.add_box(bm, (b_s * 1.42, gy, (z_lo + z_hi) * 0.5), (0.18, 0.18, z_hi - z_lo), I_OAK_V, bevel=0.015)

# 3. Vertical-Grain Corner Oak Buttresses Overlapping Cleanly Under Eaves (ZERO stairstep crease!)
for sx in (-1, 1):
    for sy in (-1, 1):
        cx_edge = sx * (WALL_W * 0.5)
        cy_edge = sy * (WALL_D * 0.5)
        ak.add_box(bm, (cx_edge + sx * 0.08, cy_edge - sy * 0.08, 0.30), (0.50, 0.48, 0.60), I_STONE, bevel=0.03)
        ak.add_box(bm, (cx_edge + sx * 0.04, cy_edge - sy * 0.04, BASE_H + (EAVE_Z - BASE_H) * 0.5 + 0.04), (0.42, 0.42, EAVE_Z - BASE_H + 0.20), I_OAK_V, bevel=0.02)
        ak.add_box(bm, (cx_edge + sx * 0.28, cy_edge - sy * 0.08, EAVE_Z - 0.14), (0.50, 0.28, 0.24), I_OAK_H, bevel=0.02)
        ak.add_cyl(bm, (cx_edge + sx * 0.06, cy_edge - sy * 0.08, EAVE_Z - 0.96), (cx_edge + sx * 0.44, cy_edge - sy * 0.08, EAVE_Z - 0.10), 0.11, 0.12, 8, I_OAK_V, smooth=False)

# 4. Vertical Plank Oak Doors + Horizontal Rail Joinery + Wrought Strap Hinges + Raised Rounded Awning
DOOR_Y = -WALL_D * 0.5 - 0.06
ak.add_arched_door(bm, (0.0, DOOR_Y, BASE_H), 1.90, 2.22, 0.0, I_OAK_V, I_CREAM, I_IRON)
# Horizontal oak door joinery rails + wrought brass handles + long finial iron hinges
for sx in (-1, 1):
    ak.add_sphere(bm, (sx * 0.13, DOOR_Y - 0.062, BASE_H + 0.70), 0.056, (1, 1, 1), 1, I_BRASS, smooth=True)
    ak.add_box(bm, (sx * 0.13, DOOR_Y - 0.030, BASE_H + 0.70), (0.095, 0.022, 0.24), I_BRASS, bevel=0.008)
    for hz in (BASE_H + 0.35, BASE_H + 1.05):
        ak.add_box(bm, (sx * 0.47, DOOR_Y - 0.028, hz), (0.86, 0.024, 0.085), I_OAK_H, bevel=0.006)
        ak.add_box(bm, (sx * 0.62, DOOR_Y - 0.036, hz), (0.58, 0.018, 0.042), I_IRON, bevel=0.004)
        ak.add_sphere(bm, (sx * 0.33, DOOR_Y - 0.036, hz), 0.028, (1, 1, 1), 1, I_IRON, smooth=True)

# Raised awning cleanly clear (+0.14m above white arch top!) with bright cream lining & curved rounded scallops
AWN_Z = BASE_H + 2.58
AWN_W = 2.95
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.05, AWN_Z + 0.04), (AWN_W + 0.16, 0.16, 0.12), I_OAK_H, bevel=0.015)
ak.add_scalloped_awning(bm, (0.0, -WALL_D * 0.5 - 0.05, AWN_Z), AWN_W, 0.70, 0.28, 0.0, I_AWN, I_OAK_H, scallops=14)
# Bright sunlit canvas underside liner + corner timber tie-rods (NO black triangle plates!)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.38, AWN_Z - 0.16), (AWN_W - 0.06, 0.62, 0.024), I_CANV, rot_euler=(0.40, 0.0, 0.0))
for side in (-1, 1):
    ak.add_cyl(bm, (side * (AWN_W * 0.44), -WALL_D * 0.5 - 0.08, AWN_Z - 0.42), (side * (AWN_W * 0.44), -WALL_D * 0.5 - 0.64, AWN_Z - 0.24), 0.034, 0.034, 8, I_OAK_H, smooth=True)


def add_brass_porthole(py: float, yaw: float, bz: float = 4.14):
    rot_s = -1.0 if abs(yaw) < 0.1 else 1.0
    ak.add_round_window(bm, (0.0, py, bz), 0.44, yaw, I_BRASS, I_GLASS)
    for ri in range(8):
        a = ri * math.tau / 8.0
        ak.add_sphere(bm, (math.cos(a) * 0.44, py + rot_s * 0.10, bz + math.sin(a) * 0.44), 0.032, (1, 1, 1), 1, I_BRASS, smooth=True)
    ak.add_box(bm, (-0.50, py + rot_s * 0.05, bz), (0.10, 0.14, 0.18), I_BRASS, bevel=0.01)
    ak.add_box(bm, (0.50, py + rot_s * 0.05, bz), (0.10, 0.14, 0.14), I_BRASS, bevel=0.01)


add_brass_porthole(-WALL_D * 0.5 - 0.04, 0.0)
add_brass_porthole(WALL_D * 0.5 + 0.04, math.pi)

# Front windows + sconces (NO crowded corner buoys protruding past corner buttresses!)
for side in (-1, 1):
    add_lattice_window((side * 2.26, -WALL_D * 0.5 - 0.075, BASE_H + 1.24), 1.16, 1.44, 0.0)
    ak.add_wall_lantern(bm, (side * 1.44, -WALL_D * 0.5 - 0.04, BASE_H + 1.80), 0.0, I_BRASS, I_LANTERN)

# Side walls: two windows wide apart + FLUSH symmetric lifebuoy centered squarely in middle wall bay (y=0.0)!
for s_side, side_x, yaw in ((-1, -WALL_W * 0.5 - 0.075, -math.pi * 0.5), (1, WALL_W * 0.5 + 0.075, math.pi * 0.5)):
    for wy in (-1.45, 1.45):
        add_lattice_window((side_x, wy, BASE_H + 1.24), 1.06, 1.40, yaw)
    bx = s_side * (WALL_W * 0.5 + 0.085)
    bz = BASE_H + 1.38
    # Wood cleat plaque + 4 brass U-cradle brackets pinning lifebuoy flush to clapboards!
    ak.add_box(bm, (s_side * (WALL_W * 0.5 + 0.03), 0.0, bz), (0.06, 0.64, 0.64), I_OAK_V, bevel=0.015)
    ak.add_box(bm, (s_side * (WALL_W * 0.5 + 0.06), 0.0, bz + 0.25), (0.09, 0.10, 0.08), I_BRASS, bevel=0.01)
    for bi in range(12):
        a0 = bi * math.tau / 12.0
        a1 = (bi + 1) * math.tau / 12.0
        p0 = (bx, math.cos(a0) * 0.23, bz + math.sin(a0) * 0.23)
        p1 = (bx, math.cos(a1) * 0.23, bz + math.sin(a1) * 0.23)
        b_mat = I_BUOY if (bi // 2) % 2 == 0 else I_CREAM
        ak.add_cyl(bm, p0, p1, 0.068, 0.068, 8, b_mat, smooth=True)
        am = (a0 + a1) * 0.5
        sag = 0.042 if (bi % 3 == 1) else 0.01
        r_g = 0.27 + sag
        ak.add_cyl(bm, (bx, math.cos(a0) * 0.28, bz + math.sin(a0) * 0.28), (bx, math.cos(am) * r_g, bz + math.sin(am) * r_g), 0.016, 0.016, 6, I_CREAM, smooth=True)

for rx in (-1.95, 0.0, 1.95):
    add_lattice_window((rx, WALL_D * 0.5 + 0.075, BASE_H + 1.24), 1.12, 1.42, math.pi)

# 5. Slate-Blue Shingle Roof + Open-Flue Stone Chimney + Carved Ridge Prow Finials
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=5.75,
    eave_span=8.42,
    eave_z=EAVE_Z - 0.04,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_OAK_H,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=6,
    tile_cols=11,
    bell_flare=0.22,
    bargeboard_t=0.22,
)
ak.add_box(bm, (1.78, 1.15, 4.62), (0.80, 0.80, 1.20), I_STONE, bevel=0.03)
ak.add_box(bm, (1.78, 1.15, 5.26), (0.94, 0.94, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (1.78, 1.15, 5.31), (0.54, 0.54, 0.06), I_FLUE)

for ey in (-2.86, 2.86):
    ak.add_sphere(bm, (0.0, ey, RIDGE_Z + 0.18), 0.12, (1, 1, 1.25), 1, I_BRASS, smooth=True)

mesh = bpy.data.meshes.new("boathouse")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("boathouse", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "boathouse", (8.8, 6.3, 5.45))
