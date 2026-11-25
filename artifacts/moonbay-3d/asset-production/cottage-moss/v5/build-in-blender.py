"""Build Moonbay Coast 3D Moss-Roof Winged Cottage v5 (cottage-moss):
Upgrades matching v5 coastal village standards (resolving all v4 star-blob/glazing/flowerbox/apex critiques):
1. Replace flat star/snowflake moss decals with continuous softly displaced velvety moss drifts textured with variegated olive-emerald moss map across ridge shoulders, chimney apron, main slopes & annex lean-to roof.
2. Cleanly miter/close front & rear gable bargeboard apexes under ridge pole (zero green horns protruding at peak).
3. Route front-left climbing vine outside stone corner pilaster face (y = -2.28 -> -2.19) with cupped 3D coastal blossoms & folded botanical leaves.
4. Up-detail ALL front, annex, side & rear window flowerboxes with chamfered rim rails, carved cedar corbel brackets, dark loam beds & overflowing multi-colored 3D blossoms.
5. Crisp 7x7 diamond leaded amber stained glass (non-glare roughness=0.42, coat=0.0) & bright jade attic roundels + gleaming metallic=0.68 brass door hardware & lanterns.
"""
import math
import random
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ASSET_DIR = Path(__file__).resolve().parent
SHARED_DIR = ASSET_DIR.parent.parent / "_shared"
sys.path.insert(0, str(SHARED_DIR))
import arch_kit as ak

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else ASSET_DIR
out_dir.mkdir(parents=True, exist_ok=True)
ak.reset_scene()


def make_velvet_moss_textures(prefix: str, seed: int, size: int = 512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    n1 = ak._smooth_grid(size, size, seed, 4)
    n2 = ak._smooth_grid(size, size, seed + 19, 1)
    tuft = np.clip(0.5 + 0.36 * n1 + 0.20 * n2, 0.0, 1.0)
    deep_rgb = (0.16, 0.35, 0.10)
    mid_rgb = (0.28, 0.50, 0.14)
    tip_rgb = (0.42, 0.62, 0.19)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        lo = deep_rgb[c] * (1.0 - tuft) + mid_rgb[c] * tuft
        hi = mid_rgb[c] * (1.0 - tuft) + tip_rgb[c] * tuft
        rgba[..., c] = np.clip(np.where(tuft < 0.55, lo, hi) * (0.94 + 0.10 * n2), 0.0, 1.0)
    col_img = ak.make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")
    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.88 - 0.12 * tuft, 0.72, 0.96)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = ak.make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_crisp_leaded_glass(prefix: str, deep_rgb, jewel_rgb, seed: int, size: int = 512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    d1 = u * 7.0 + v * 7.0
    d2 = u * 7.0 - v * 7.0
    i1, i2 = np.floor(d1).astype(np.int32), np.floor(d2).astype(np.int32)
    lead1 = np.exp(-((np.minimum(d1 % 1.0, 1.0 - (d1 % 1.0))) / 0.022) ** 2)
    lead2 = np.exp(-((np.minimum(d2 % 1.0, 1.0 - (d2 % 1.0))) / 0.022) ** 2)
    lead = np.maximum(lead1, lead2)
    q1 = np.minimum(d1 % 1.0, 1.0 - (d1 % 1.0))
    q2 = np.minimum(d2 % 1.0, 1.0 - (d2 % 1.0))
    bevel_shimmer = np.exp(-(((np.minimum(q1, q2) - 0.08) / 0.04) ** 2)) * 0.14
    rng = np.random.default_rng(seed)
    pane_var = rng.uniform(0.0, 1.0, (24, 24)).astype(np.float32)[np.abs(i1) % 24, np.abs(i2) % 24]
    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        pane_c = deep_rgb[c] * (1.0 - 0.72 * pane_var) + jewel_rgb[c] * (0.72 * pane_var) + bevel_shimmer
        rgba[..., c] = np.clip(pane_c * (1.0 - 0.88 * lead) + 0.05 * lead, 0.0, 1.0)
    return ak.make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")


stone_col, stone_rgh = ak.make_stone_textures(out_dir, "cm-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=501)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "cm-stucco", (0.95, 0.89, 0.77), (0.88, 0.79, 0.63), seed=502)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "cm-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=503)
door_col, door_rgh = ak.make_wood_textures(out_dir, "cm-door", (0.76, 0.31, 0.12), (0.48, 0.17, 0.055), planks=6, seed=504, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(
    out_dir, "cm-moss-roof", (0.40, 0.50, 0.16), (0.26, 0.39, 0.11), rows=8, cols=10, seed=505, moss_tint=(0.24, 0.44, 0.12)
)
moss_col, moss_rgh = make_velvet_moss_textures("cm-moss-velvet", seed=515)
amber_col = make_crisp_leaded_glass("cm-amber-glass", (0.56, 0.21, 0.02), (0.98, 0.60, 0.10), seed=506)
attic_col = make_crisp_leaded_glass("cm-attic-glass", (0.08, 0.36, 0.32), (0.22, 0.72, 0.62), seed=507)

M_STONE = ak.make_pbr_mat("CmStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CmStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CmTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CmRedwoodDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CmMossRoof", roof_col, roof_rgh)
M_MOSS_DRIFT = ak.make_pbr_mat("CmMossVelvet", moss_col, moss_rgh)
M_CREAM = ak.make_pbr_mat("CmCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CmAmberGlass", amber_col, None,
    metallic=0.0, roughness=0.42, coat=0.0, emission=(0.90, 0.46, 0.06), emission_strength=0.22
)
M_ATTIC = ak.make_pbr_mat(
    "CmAtticGlass", attic_col, None,
    metallic=0.0, roughness=0.40, coat=0.0, emission=(0.12, 0.52, 0.44), emission_strength=0.22
)
M_BRASS = ak.make_pbr_mat("CmBrass", color=(0.98, 0.82, 0.38), metallic=0.68, roughness=0.22)
M_IRON = ak.make_pbr_mat("CmDarkIron", color=(0.24, 0.20, 0.18), metallic=0.36, roughness=0.48)
M_FLUE = ak.make_pbr_mat("CmFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_SOIL = ak.make_pbr_mat("CmLoamSoil", color=(0.20, 0.13, 0.08), roughness=0.94)
M_LEAF = ak.make_pbr_mat("CmLeaf", color=(0.23, 0.52, 0.17), roughness=0.52, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CmLeafDeep", color=(0.17, 0.40, 0.13), roughness=0.55, double_sided=True)
M_CORAL = ak.make_pbr_mat("CmCoralFlower", color=(0.95, 0.34, 0.42), roughness=0.40, double_sided=True)
M_BUTTER = ak.make_pbr_mat("CmButterFlower", color=(0.98, 0.78, 0.22), roughness=0.40, double_sided=True)
M_BLUE = ak.make_pbr_mat("CmSkyFlower", color=(0.45, 0.64, 0.96), roughness=0.40, double_sided=True)
M_WHITE = ak.make_pbr_mat("CmWhiteFlower", color=(0.98, 0.95, 0.86), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat(
    "CmLanternGlow", color=(0.98, 0.68, 0.18), roughness=0.36, emission=(0.98, 0.54, 0.10), emission_strength=0.70
)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_MOSS_DRIFT, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_IRON, M_FLUE, M_SOIL, M_LEAF, M_LEAF_D, M_CORAL, M_BUTTER, M_BLUE, M_WHITE, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_MOSS_DRIFT, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_IRON, I_FLUE, I_SOIL, I_LEAF, I_LEAF_D, I_CORAL, I_BUTTER, I_BLUE, I_WHITE, I_LANTERN = range(len(MATS))

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


def add_cupped_flower(center, normal_dir, rad, pmat):
    c = Vector(center)
    n = Vector(normal_dir).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    ak.add_sphere(bm, c + n * 0.012, rad * 0.28, (1, 1, 0.7), 1, I_BRASS, smooth=True)
    for pi in range(5):
        pa = pi * math.tau / 5.0
        rd = u * math.cos(pa) + v * math.sin(pa)
        sd = -u * math.sin(pa) + v * math.cos(pa)
        f = bm.faces.new((
            bm.verts.new(c),
            bm.verts.new(c + rd * (rad * 0.60) + sd * (rad * 0.30) + n * 0.016),
            bm.verts.new(c + rd * rad + n * 0.008),
            bm.verts.new(c + rd * (rad * 0.60) - sd * (rad * 0.30) + n * 0.016),
        ))
        ak.paint_faces(bm, [f], pmat, smooth=True, uv_scale=1.0)


def add_rich_flowerbox(win_center, win_w: float, win_h: float, yaw: float, seed_off: int):
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector((win_center[0], win_center[1], win_center[2] - win_h * 0.5 - 0.08))
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    box_w = win_w + 0.14

    ak.add_box(bm, xform(0.0, -0.14, -0.11), (box_w, 0.27, 0.20), I_WOOD, bevel=0.015, rot_euler=(0, 0, yaw))
    ak.add_box(bm, xform(0.0, -0.15, 0.005), (box_w + 0.06, 0.31, 0.048), I_WOOD, bevel=0.012, rot_euler=(0, 0, yaw))
    for bx in (-box_w * 0.34, box_w * 0.34):
        ak.add_box(bm, xform(bx, -0.09, -0.25), (0.09, 0.18, 0.14), I_WOOD, bevel=0.012, rot_euler=(0.32, 0, yaw))

    ak.add_box(bm, xform(0.0, -0.14, 0.032), (box_w - 0.05, 0.22, 0.045), I_SOIL, bevel=0.014, rot_euler=(0, 0, yaw))

    rng = random.Random(600 + seed_off)
    n_tufts = max(14, int(box_w * 16))
    for i in range(n_tufts):
        tx = -box_w * 0.42 + (i / max(1, n_tufts - 1)) * (box_w * 0.84)
        ty = rng.uniform(-0.22, -0.08)
        tz = rng.uniform(0.045, 0.075)
        fwd_local = Vector((rng.uniform(-0.45, 0.45), rng.uniform(-0.90, -0.25), rng.uniform(0.15, 0.72))).normalized()
        n_local = Vector((0.0, -0.45, 0.89)).normalized()
        llen = rng.uniform(0.12, 0.19)
        lmat = I_LEAF_D if i % 2 else I_LEAF
        ak.add_cambered_leaf(bm, xform(tx, ty, tz), rot @ fwd_local, rot @ n_local, llen, llen * 0.70, lmat)
        if i % 3 == 0:
            trail_f = rot @ Vector((rng.uniform(-0.25, 0.25), -0.65, -0.70)).normalized()
            ak.add_cambered_leaf(bm, xform(tx, -0.26, 0.025), trail_f, rot @ Vector((0, -1, 0.2)), 0.15, 0.10, I_LEAF)

    palette = (I_CORAL, I_BUTTER, I_BLUE, I_WHITE)
    for bi in range(8):
        bx = -box_w * 0.38 + (bi / 7.0) * (box_w * 0.76) + rng.uniform(-0.02, 0.02)
        by = rng.uniform(-0.24, -0.10)
        bz = rng.uniform(0.08, 0.13)
        bn = rot @ Vector((rng.uniform(-0.2, 0.2), -0.78, 0.62)).normalized()
        add_cupped_flower(xform(bx, by, bz), bn, rng.uniform(0.068, 0.088), palette[(bi + seed_off) % 4])


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

# 3. Doors, Crisp Stained Glass Windows w/ Rich Bespoke Flowerboxes & Attic Roundel
ak.add_arched_door(bm, (DOOR_X, -MAIN_D * 0.5 - 0.02, BASE_H), 1.36, 2.02, 0.0, I_DOOR, I_CREAM, I_BRASS)
for lsx in (-0.80, 0.80):
    ak.add_wall_lantern(bm, (DOOR_X + lsx, -MAIN_D * 0.5 - 0.02, BASE_H + 1.46), 0.0, I_IRON, I_LANTERN)

front_main_win = (MAIN_X + 1.24, -MAIN_D * 0.5 - 0.03, BASE_H + 1.04)
ak.add_arched_window(bm, front_main_win, 0.90, 1.26, 0.0, I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=False)
add_rich_flowerbox(front_main_win, 0.90, 1.26, 0.0, 0)

annex_front_win = (AUX_X - 0.02, AUX_Y - AUX_D * 0.5 - 0.03, BASE_H + 0.86)
ak.add_arched_window(bm, annex_front_win, 0.84, 1.10, 0.0, I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=False)
add_rich_flowerbox(annex_front_win, 0.84, 1.10, 0.0, 1)

annex_side_win = (AUX_X - AUX_W * 0.5 - 0.03, AUX_Y, BASE_H + 0.86)
ak.add_arched_window(bm, annex_side_win, 0.86, 1.10, -math.pi * 0.5, I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=False)
add_rich_flowerbox(annex_side_win, 0.86, 1.10, -math.pi * 0.5, 2)

for si, wy in enumerate((-1.02, 1.02)):
    spos = (MAIN_X + MAIN_W * 0.5 + 0.03, wy, BASE_H + 1.10)
    ak.add_arched_window(bm, spos, 1.00, 1.34, math.pi * 0.5, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True, planter=False)
    add_rich_flowerbox(spos, 1.00, 1.34, math.pi * 0.5, 10 + si)

for ri, rx in enumerate((MAIN_X - 1.02, MAIN_X + 1.02)):
    rpos = (rx, MAIN_D * 0.5 + 0.03, BASE_H + 1.10)
    ak.add_arched_window(bm, rpos, 1.00, 1.34, math.pi, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True, planter=False)
    add_rich_flowerbox(rpos, 1.00, 1.34, math.pi, 20 + ri)

ak.add_round_window(bm, (MAIN_X, -MAIN_D * 0.5 - 0.04, 3.60), 0.42, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (MAIN_X, MAIN_D * 0.5 + 0.04, 3.60), 0.42, math.pi, I_CREAM, I_ATTIC)

# 4. Overlapping Olive-Moss Shingle Roof w/ Closed Gable Apexes + Annex Lean-To + Chimney
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
for end_s in (-1, 1):
    y_end = end_s * (4.80 * 0.5 - 0.20 * 0.42)
    ak.add_box(bm, (MAIN_X, y_end, RIDGE_Z - 0.04), (0.34, 0.22, 0.24), I_WOOD, bevel=0.015, rot_euler=(0.0, math.pi * 0.25, 0.0))

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

# 5. Plinth-Rooted Climbing Vine Strictly Clear Outside Corner Pilaster (pilaster front = -2.24 -> vine at -2.28!)
VINE_Y = -MAIN_D * 0.5 - 0.13  # -2.28 -> clears -2.24 pilaster front cleanly!
ak.add_vine_climb(
    bm,
    [(-1.52, VINE_Y, 0.52),
     (-1.42, VINE_Y, 1.08),
     (-1.54, VINE_Y, 1.70),
     (-1.44, VINE_Y + 0.02, 2.38),
     (-1.12, -MAIN_D * 0.5 - 0.06, 2.98),
     (-0.68, -MAIN_D * 0.5 - 0.06, 3.48),
     (-0.26, -MAIN_D * 0.5 - 0.06, 3.86)],
    0.036, I_WOOD, I_LEAF, None, seed=508
)
for vx, vy, vz, fmat in [
    (-1.50, VINE_Y - 0.02, 0.72, I_WHITE),
    (-1.46, VINE_Y - 0.02, 1.38, I_BLUE),
    (-1.48, VINE_Y - 0.01, 2.12, I_WHITE),
    (-1.08, -MAIN_D * 0.5 - 0.08, 3.04, I_WHITE),
    (-0.56, -MAIN_D * 0.5 - 0.08, 3.58, I_CORAL),
]:
    for li in range(4):
        ang = li * 1.65 + vx * 2.0
        fwd = Vector((math.cos(ang) * 0.68, -0.36, math.sin(ang) * 0.52 + 0.34)).normalized()
        ak.add_cambered_leaf(bm, (vx, vy + 0.01, vz), fwd, Vector((0, -1, 0.25)), 0.16, 0.11, I_LEAF_D if li % 2 else I_LEAF)
    add_cupped_flower((vx, vy - 0.03, vz), (0.0, -1.0, 0.25), 0.082, fmat)


# 6. Softly Displaced Continuous Velvety Moss Pillow Drifts Across Main & Annex Roofs
def add_organic_moss_lobe(center_pos, surf_n, rx: float, ry: float, rz: float, phase: float):
    n = Vector(surf_n).normalized()
    y_axis = Vector((0.0, 1.0, 0.0))
    if abs(n.dot(y_axis)) > 0.9:
        y_axis = Vector((1.0, 0.0, 0.0))
    u_axis = y_axis.cross(n).normalized()
    v_axis = n.cross(u_axis).normalized()
    basis = Matrix((u_axis, v_axis, n)).transposed().to_4x4()
    mat = Matrix.Translation(Vector(center_pos)) @ basis @ Matrix.Diagonal((rx, ry, rz, 1.0))
    ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    verts = ret["verts"]
    for v in verts:
        p = v.co
        if p.z < 0.0:
            p.z *= 0.28
        bump = 1.0 + 0.18 * math.sin(p.x * 4.7 + phase) * math.cos(p.y * 5.3 - phase) + 0.10 * math.cos(p.z * 6.0 + p.x * 3.1)
        v.co = mat @ Vector((p.x * bump, p.y * bump, p.z * (1.0 + 0.14 * math.sin(p.x * 3.9 + p.y * 4.2 + phase))))
    faces = list({f for v in verts for f in v.link_faces})
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    ak.paint_faces(bm, faces, I_MOSS_DRIFT, smooth=True, uv_scale=0.65)


def main_roof_slope_z(x_val: float) -> float:
    t = min(1.0, max(0.0, abs(x_val - MAIN_X) / 2.45))
    return RIDGE_Z - (RIDGE_Z - (EAVE_Z - 0.06)) * (t ** (1.0 - 0.14 * 0.45))


def add_moss_ribbon(waypoints, base_w: float, phase: float):
    for wi, (px, py) in enumerate(waypoints):
        nx = (1.0 if px >= MAIN_X else -1.0) * 0.71
        pz = main_roof_slope_z(px) + 0.048
        w_lobe = base_w * (0.85 + 0.28 * abs(math.sin(wi * 1.7 + phase)))
        l_lobe = base_w * (1.15 + 0.35 * abs(math.cos(wi * 1.3 + phase)))
        add_organic_moss_lobe((px, py, pz), (nx, 0.0, 0.70), w_lobe, l_lobe, 0.068, phase + wi * 1.1)


# Ridge shoulder moss pillows strictly within y=[-1.95..1.95] & <= ridge pole top (5.29m)
for idx, (dx, ry, rw, rl) in enumerate([
    (0.18, -1.72, 0.22, 0.34), (-0.18, -1.25, 0.24, 0.36),
    (0.18, -0.68, 0.25, 0.34), (-0.18, -0.10, 0.24, 0.35),
    (0.18, 0.52, 0.23, 0.34), (-0.18, 1.12, 0.25, 0.34),
    (0.16, 1.72, 0.21, 0.32),
]):
    px = MAIN_X + dx
    add_organic_moss_lobe((px, ry, main_roof_slope_z(px) + 0.055), (0.36 if dx > 0 else -0.36, 0.0, 0.93), rw, rl, 0.062, idx * 0.95)

# Chimney collar moss apron around (MAIN_X+1.26, 1.02)
for idx, (dx, cy, rw, rl) in enumerate([
    (0.84, 1.00, 0.22, 0.34), (0.94, 0.68, 0.22, 0.26), (1.26, 0.58, 0.28, 0.24), (1.64, 0.96, 0.20, 0.28),
]):
    px = MAIN_X + dx
    add_organic_moss_lobe((px, cy, main_roof_slope_z(px) + 0.052), (0.71, 0.0, 0.70), rw, rl, 0.065, idx * 1.4 + 2.0)

# Continuous flowing moss ribbons across BOTH main roof slopes
add_moss_ribbon([(MAIN_X - 0.55, -1.78), (MAIN_X - 0.85, -1.48), (MAIN_X - 1.15, -1.18), (MAIN_X - 1.45, -0.84), (MAIN_X - 1.72, -0.52)], 0.24, 1.2)
add_moss_ribbon([(MAIN_X - 0.88, -0.08), (MAIN_X - 1.22, 0.22), (MAIN_X - 1.54, 0.54), (MAIN_X - 1.82, 0.88), (MAIN_X - 2.05, 1.24)], 0.25, 2.7)
add_moss_ribbon([(MAIN_X - 1.52, -1.75), (MAIN_X - 1.80, -1.44), (MAIN_X - 2.02, -1.12)], 0.22, 3.8)
add_moss_ribbon([(MAIN_X - 0.62, 1.38), (MAIN_X - 0.95, 1.66), (MAIN_X - 1.28, 1.86)], 0.22, 4.6)

add_moss_ribbon([(MAIN_X + 0.58, -1.68), (MAIN_X + 0.92, -1.36), (MAIN_X + 1.24, -1.04), (MAIN_X + 1.56, -0.70), (MAIN_X + 1.86, -0.38)], 0.25, 5.1)
add_moss_ribbon([(MAIN_X + 1.44, -1.74), (MAIN_X + 1.74, -1.42), (MAIN_X + 1.98, -1.06)], 0.22, 6.4)
add_moss_ribbon([(MAIN_X + 0.72, 0.28), (MAIN_X + 1.05, 0.56), (MAIN_X + 1.42, 0.24), (MAIN_X + 1.74, 0.52), (MAIN_X + 1.98, 0.92)], 0.24, 7.2)
add_moss_ribbon([(MAIN_X + 0.78, 1.52), (MAIN_X + 1.12, 1.78), (MAIN_X + 1.50, 1.92)], 0.21, 8.1)

# Continuous velvet moss blanket hugging the left annex lean-to roof (slope z = 2.42 - (-1.60 - x) * 0.27)
for idx, (ax, ay, rw, rl) in enumerate([
    (-1.66, -0.96, 0.24, 0.34), (-1.90, -0.58, 0.26, 0.36), (-2.14, -0.18, 0.24, 0.35),
    (-2.36, 0.26, 0.24, 0.34), (-2.12, 0.72, 0.22, 0.32), (-1.82, 1.08, 0.20, 0.30),
]):
    az = 2.42 - (-1.60 - ax) * 0.27 + 0.042
    add_organic_moss_lobe((ax, ay, az), (-0.30, 0.0, 0.95), rw, rl, 0.058, idx * 1.15 + 9.0)

mesh = bpy.data.meshes.new("cottage-moss")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-moss", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-moss", (6.3, 5.2, 5.3))
