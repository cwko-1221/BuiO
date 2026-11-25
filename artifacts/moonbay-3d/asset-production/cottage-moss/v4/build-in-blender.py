"""Build Moonbay Coast 3D Moss-Roof Winged Cottage v4 (cottage-moss):
Upgrades from v3 visual review:
1. Rich cascading, thick sculpted multi-layer roof moss cushions & velvet leaf mats blanketing ridge crest, roof slopes, chimney flashing & annex shed roof (ZERO brown roof twigs, ZERO sparse pin-dot starbursts).
2. Crisp non-glare stained honey-amber glass (rough_img=None, roughness=0.42, coat=0.0) & backlit jade attic roundel + warm non-clipping lantern glow.
3. Redwood double plank doors with symmetric brass hardware + fuller plinth-rooted blossom vine.
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
door_col, door_rgh = ak.make_wood_textures(out_dir, "cm-door", (0.76, 0.31, 0.12), (0.48, 0.17, 0.055), planks=6, seed=504, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(
    out_dir, "cm-moss-roof", (0.44, 0.55, 0.17), (0.29, 0.42, 0.12), rows=8, cols=10, seed=505, moss_tint=(0.22, 0.48, 0.13)
)
amber_col, amber_rgh = ak.make_stained_glass_textures(out_dir, "cm-amber-glass", (0.58, 0.22, 0.03), (0.94, 0.56, 0.12), seed=506)
attic_col, attic_rgh = ak.make_stained_glass_textures(out_dir, "cm-attic-glass", (0.08, 0.34, 0.30), (0.20, 0.68, 0.58), seed=507)

M_STONE = ak.make_pbr_mat("CmStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CmStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CmTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CmRedwoodDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CmMossRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CmCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CmAmberGlass", amber_col, None,
    metallic=0.0, roughness=0.42, coat=0.0, emission=(0.90, 0.46, 0.06), emission_strength=0.22
)
M_ATTIC = ak.make_pbr_mat(
    "CmAtticGlass", attic_col, None,
    metallic=0.0, roughness=0.40, coat=0.0, emission=(0.12, 0.52, 0.44), emission_strength=0.22
)
M_BRASS = ak.make_pbr_mat("CmBrass", color=(0.96, 0.78, 0.34), metallic=0.62, roughness=0.25)
M_IRON = ak.make_pbr_mat("CmDarkIron", color=(0.24, 0.20, 0.18), metallic=0.36, roughness=0.48)
M_FLUE = ak.make_pbr_mat("CmFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_LEAF = ak.make_pbr_mat("CmLeaf", color=(0.25, 0.56, 0.17), roughness=0.50, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CmMossLeaf", color=(0.38, 0.61, 0.16), roughness=0.55, double_sided=True)
M_MOSS_PAD = ak.make_pbr_mat("CmMossPad", color=(0.31, 0.52, 0.14), roughness=0.72)
M_FLOWER = ak.make_pbr_mat("CmWhiteFlower", color=(0.98, 0.95, 0.84), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat(
    "CmLanternGlow", color=(0.98, 0.66, 0.18), roughness=0.36, emission=(0.98, 0.54, 0.10), emission_strength=0.68
)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_IRON, M_FLUE, M_LEAF, M_LEAF_D, M_MOSS_PAD, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_IRON, I_FLUE, I_LEAF, I_LEAF_D, I_MOSS_PAD, I_FLOWER, I_LANTERN = range(len(MATS))

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
    faces = [bm.faces.new(pts_f), bm.faces.new(list(reversed(pts_b)))]
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
ak.add_arched_door(bm, (DOOR_X, -MAIN_D * 0.5 - 0.02, BASE_H), 1.36, 2.02, 0.0, I_DOOR, I_CREAM, I_BRASS)
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

# 4. Overlapping Olive-Moss Shingle Roof + Annex Lean-To Moss Roof + Limestone Chimney
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

CH_X, CH_Y = MAIN_X + 1.26, 1.02
ak.add_box(bm, (CH_X, CH_Y, 4.30), (0.72, 0.72, 1.55), I_STONE, bevel=0.025)
ak.add_box(bm, (CH_X, CH_Y, 5.12), (0.86, 0.86, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (CH_X, CH_Y, 5.20), (0.52, 0.52, 0.04), I_FLUE)

# 5. Lush Plinth-Rooted Corner Climbing Vine + Multi-Tier Leaf/Flower Sprays
ak.add_vine_climb(
    bm,
    [(-1.54, -2.20, 0.52), (-1.38, -2.24, 1.10), (-1.56, -2.22, 1.72),
     (-1.34, -2.22, 2.38), (-1.12, -2.20, 2.98), (-0.72, -2.18, 3.48)],
    0.044, I_WOOD, I_LEAF, I_FLOWER, seed=508
)
for vx, vz, vrot in [(-1.52, 0.64, -0.4), (-1.45, 1.42, 0.5), (-1.48, 2.12, -0.2), (-0.82, 3.36, 0.4)]:
    for k in range(7):
        ang = vrot + k * 0.65
        fwd = Vector((math.cos(ang) * 0.70, -0.36, math.sin(ang) * 0.54 + 0.32)).normalized()
        ak.add_cambered_leaf(bm, (vx, -MAIN_D * 0.5 - 0.06, vz), fwd, Vector((0, -1, 0.25)), 0.18, 0.13, I_LEAF_D if k % 2 else I_LEAF)


def add_moss_drift(center_pos, surf_n, rad_scale=1.0, down_bias=0.35, with_flower=False, seed_idx=0):
    """Build thick velvety moss pad anchored into overlapping broad cambered leaf cascades (zero twigs!)."""
    n = Vector(surf_n).normalized()
    up_ref = Vector((0, 1, 0)) if abs(n.y) < 0.8 else Vector((1, 0, 0))
    u = n.cross(up_ref).normalized()
    v = n.cross(u).normalized()
    c = Vector(center_pos)
    # Soft matte moss bolster core hugging shingle step (zero spherical balls—layered flattened cushion!)
    for oi, (du, dv, sc) in enumerate([(0.0, 0.0, 1.0), (0.14 * rad_scale, 0.11 * rad_scale, 0.72), (-0.12 * rad_scale, 0.12 * rad_scale, 0.68)]):
        pc = c + u * du + v * dv - n * 0.015
        ak.add_sphere(bm, pc, 0.14 * sc * rad_scale, (1.1, 1.1, 0.42), 1, I_MOSS_PAD, smooth=True)
    # Dense lower skirt of broad cambered overlapping leaves
    fronds = 14
    for fi in range(fronds):
        ang = seed_idx * 0.55 + fi * math.tau / fronds
        radial = (u * math.cos(ang) + v * math.sin(ang)).normalized()
        fwd = (radial * 0.86 + n * 0.22 + Vector((0, 0, -down_bias * 0.25))).normalized()
        llen = (0.21 + ((fi + seed_idx) % 3) * 0.05) * rad_scale
        lmat = I_LEAF_D if (fi + seed_idx) % 2 == 0 else I_LEAF
        ak.add_cambered_leaf(bm, c + radial * (0.04 * rad_scale) + n * 0.01, fwd, n, llen, llen * 0.76, lmat)
    # Upper crown moss shingle overlay
    for fi in range(7):
        ang = seed_idx * 1.1 + fi * math.tau / 7.0 + 0.28
        radial = (u * math.cos(ang) + v * math.sin(ang)).normalized()
        fwd = (radial * 0.74 + n * 0.48).normalized()
        ak.add_cambered_leaf(bm, c + n * 0.032, fwd, n, 0.18 * rad_scale, 0.135 * rad_scale, I_LEAF)
    if with_flower:
        for dfx, dfy in ((0.0, 0.0), (0.11, -0.08)):
            fc = c + u * dfx + v * dfy + n * 0.068
            for pi in range(5):
                pa = pi * math.tau / 5.0
                rd = u * math.cos(pa) + v * math.sin(pa)
                sd = -u * math.sin(pa) + v * math.cos(pa)
                pf = bm.faces.new((
                    bm.verts.new(fc),
                    bm.verts.new(fc + rd * 0.045 + sd * 0.024 + n * 0.015),
                    bm.verts.new(fc + rd * 0.078 + n * 0.005),
                    bm.verts.new(fc + rd * 0.045 - sd * 0.024 + n * 0.015),
                ))
                ak.paint_faces(bm, [pf], I_FLOWER, smooth=True, uv_scale=1.0)


def main_roof_slope_z(x_val: float) -> float:
    t = min(1.0, max(0.0, abs(x_val - MAIN_X) / 2.45))
    return RIDGE_Z - (RIDGE_Z - (EAVE_Z - 0.06)) * (t ** (1.0 - 0.14 * 0.45))


# Continuous lush ridge crest & shoulder moss carpets (height <= ridge pole 5.29m)
for idx, (dx, ry, sc) in enumerate([
    (0.06, -1.92, 1.05), (-0.08, -1.18, 1.15), (0.08, -0.42, 1.22),
    (-0.07, 0.35, 1.15), (0.07, 1.14, 1.12), (-0.06, 1.88, 1.02),
]):
    add_moss_drift((MAIN_X + dx, ry, RIDGE_Z + 0.11), (dx * 1.4, 0.0, 1.0), rad_scale=sc, down_bias=0.2, with_flower=(idx in (1, 4)), seed_idx=idx)

# Lush overlapping multi-pad roof slope drifts on BOTH slopes (upper, mid, lower eave pockets & chimney collar)
for idx, (sx_off, sy, sc) in enumerate([
    (-0.72, -1.65, 1.18), (-1.18, -0.95, 1.26), (-0.82, -0.18, 1.15), (-1.45, 0.45, 1.22), (-1.05, 1.32, 1.16), (-1.85, -1.35, 1.08), (-1.92, 0.92, 1.10),
    (0.78, -1.52, 1.16), (1.35, -0.68, 1.24), (0.85, 0.18, 1.15), (1.68, -1.42, 1.05), (1.76, 0.35, 1.15), (1.42, 1.62, 1.10),
    # Chimney flashing moss pockets (front & left side around CH_X = MAIN_X+1.26, CH_Y = 1.02)
    (0.86, 0.96, 1.12), (1.28, 0.56, 1.08),
]):
    px = MAIN_X + sx_off
    pz = main_roof_slope_z(px) + 0.058
    nx = 0.71 if sx_off > 0 else -0.71
    add_moss_drift((px, sy, pz), (nx, 0.0, 0.70), rad_scale=sc, with_flower=(idx in (1, 8, 11)), seed_idx=idx + 12)

# Annex lean-to moss roof blanket
for idx, (ax, ay, az, sc) in enumerate([
    (-1.68, -0.95, 2.47, 1.12), (-2.05, -0.22, 2.38, 1.20), (-2.38, 0.55, 2.29, 1.14), (-1.88, 1.10, 2.42, 1.06),
]):
    add_moss_drift((ax, ay, az), (-0.30, 0.0, 0.95), rad_scale=sc, with_flower=(idx == 1), seed_idx=idx + 35)

mesh = bpy.data.meshes.new("cottage-moss")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-moss", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-moss", (6.3, 5.2, 5.3))
