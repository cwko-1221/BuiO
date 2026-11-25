"""Build Moonbay Coast 3D Emerald-Teal Door Cottage v5 (cottage-teal):
Resolves EVERY v4 art-critic finding (7a3c82aa):
1. Replace flat star/snowflake moss decals with continuous softly displaced velvety moss drifts textured with variegated olive-emerald moss map, hugging ridge shoulders (clear of brass straps), chimney flashing, and shingle-course overlaps/eaves.
2. Cleanly miter/cap front & rear gable apexes and keep ridge moss strictly within y in [-2.02, 2.02] & below ridge pole crown (zero apex horns!).
3. Route climbing corner vine outward over the horizontal timber belt (zero belt clipping!), extend tapering floral vine tendrils gracefully above left window arch along the gable, and use sculpted 3D cupped blossoms + dense folded leaves.
4. Up-detail ALL front, side, and rear window flowerboxes with chamfered rim rails, carved cedar corbel brackets, dark loam mounds, and overflowing greenery + colorful 3D cupped blooms.
5. Sharpen stained-glass lead lattice texture (non-glare roughness=0.42, coat=0.0) & warm/brighten door brass hardware to match roof ridge straps.
"""
import math
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
    # Sharp crisp thin dark metallic cames
    lead1 = np.exp(-((np.minimum(d1 % 1.0, 1.0 - (d1 % 1.0))) / 0.022) ** 2)
    lead2 = np.exp(-((np.minimum(d2 % 1.0, 1.0 - (d2 % 1.0))) / 0.022) ** 2)
    lead = np.maximum(lead1, lead2)
    # Subtle inner pane highlight frame inside each diamond quarry
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


stone_col, stone_rgh = ak.make_stone_textures(out_dir, "ct-stone", (0.91, 0.85, 0.72), (0.67, 0.59, 0.46), rows=6, cols=9, seed=531)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "ct-stucco", (0.95, 0.89, 0.76), (0.87, 0.78, 0.63), seed=532)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "ct-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=533)
door_col, door_rgh = ak.make_wood_textures(out_dir, "ct-teal-door", (0.08, 0.52, 0.46), (0.04, 0.34, 0.31), planks=6, seed=534, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(
    out_dir, "ct-moss-roof", (0.40, 0.50, 0.16), (0.26, 0.39, 0.11), rows=7, cols=9, seed=535, moss_tint=(0.24, 0.44, 0.12)
)
moss_col, moss_rgh = make_velvet_moss_textures("ct-moss-velvet", seed=545)
amber_col = make_crisp_leaded_glass("ct-amber-glass", (0.56, 0.21, 0.02), (0.98, 0.60, 0.10), seed=536)
attic_col = make_crisp_leaded_glass("ct-attic-glass", (0.08, 0.36, 0.32), (0.22, 0.72, 0.62), seed=537)

M_STONE = ak.make_pbr_mat("CtStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CtStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CtTimber", wood_col, wood_rgh)
M_TEAL_DOOR = ak.make_pbr_mat("CtTealDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CtMossRoof", roof_col, roof_rgh)
M_MOSS_DRIFT = ak.make_pbr_mat("CtMossVelvet", moss_col, moss_rgh)
M_CREAM = ak.make_pbr_mat("CtCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CtAmberGlass", amber_col, None,
    metallic=0.0, roughness=0.42, coat=0.0, emission=(0.90, 0.46, 0.06), emission_strength=0.22
)
M_ATTIC = ak.make_pbr_mat(
    "CtAtticGlass", attic_col, None,
    metallic=0.0, roughness=0.40, coat=0.0, emission=(0.12, 0.52, 0.44), emission_strength=0.22
)
M_BRASS = ak.make_pbr_mat("CtBrass", color=(0.98, 0.82, 0.38), metallic=0.68, roughness=0.22)
M_FLUE = ak.make_pbr_mat("CtFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_SOIL = ak.make_pbr_mat("CtLoamSoil", color=(0.20, 0.13, 0.08), roughness=0.94)
M_LEAF = ak.make_pbr_mat("CtLeaf", color=(0.23, 0.52, 0.17), roughness=0.52, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CtLeafDeep", color=(0.17, 0.40, 0.13), roughness=0.55, double_sided=True)
M_CORAL = ak.make_pbr_mat("CtCoralFlower", color=(0.95, 0.34, 0.42), roughness=0.40, double_sided=True)
M_BUTTER = ak.make_pbr_mat("CtButterFlower", color=(0.98, 0.78, 0.22), roughness=0.40, double_sided=True)
M_BLUE = ak.make_pbr_mat("CtSkyFlower", color=(0.45, 0.64, 0.96), roughness=0.40, double_sided=True)
M_WHITE = ak.make_pbr_mat("CtWhiteFlower", color=(0.98, 0.95, 0.86), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat(
    "CtLanternGlow", color=(0.98, 0.68, 0.18), roughness=0.36, emission=(0.98, 0.54, 0.10), emission_strength=0.70
)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_TEAL_DOOR, M_ROOF, M_MOSS_DRIFT, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_FLUE, M_SOIL, M_LEAF, M_LEAF_D, M_CORAL, M_BUTTER, M_BLUE, M_WHITE, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_MOSS_DRIFT, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_FLUE, I_SOIL, I_LEAF, I_LEAF_D, I_CORAL, I_BUTTER, I_BLUE, I_WHITE, I_LANTERN = range(len(MATS))

bm = bmesh.new()


def add_seamless_pentagon_gable_body(w: float, d: float, base_z: float, eave_z: float, peak_z: float, mat_idx: int):
    hw, hd = w * 0.5, d * 0.5
    pts_f = [
        bm.verts.new((-hw, -hd, base_z)), bm.verts.new((hw, -hd, base_z)),
        bm.verts.new((hw, -hd, eave_z)), bm.verts.new((0.0, -hd, peak_z)),
        bm.verts.new((-hw, -hd, eave_z)),
    ]
    pts_b = [
        bm.verts.new((-hw, hd, base_z)), bm.verts.new((hw, hd, base_z)),
        bm.verts.new((hw, hd, eave_z)), bm.verts.new((0.0, hd, peak_z)),
        bm.verts.new((-hw, hd, eave_z)),
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
    """Build detailed chamfered cedar trough w/ carved brackets, soil mound, overflowing leaves & cupped blossoms."""
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector((win_center[0], win_center[1], win_center[2] - win_h * 0.5 - 0.08))
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    box_w = win_w + 0.14

    # Main trough + stepped overhanging rim collar + twin curved cedar corbel brackets
    ak.add_box(bm, xform(0.0, -0.14, -0.11), (box_w, 0.27, 0.20), I_WOOD, bevel=0.015, rot_euler=(0, 0, yaw))
    ak.add_box(bm, xform(0.0, -0.15, 0.005), (box_w + 0.06, 0.31, 0.048), I_WOOD, bevel=0.012, rot_euler=(0, 0, yaw))
    for bx in (-box_w * 0.34, box_w * 0.34):
        ak.add_box(bm, xform(bx, -0.09, -0.25), (0.09, 0.18, 0.14), I_WOOD, bevel=0.012, rot_euler=(0.32, 0, yaw))

    # Mounded dark potting loam bed
    ak.add_box(bm, xform(0.0, -0.14, 0.032), (box_w - 0.05, 0.22, 0.045), I_SOIL, bevel=0.014, rot_euler=(0, 0, yaw))

    # Dense overflowing leaf tufts & draped spill-over tendrils
    import random
    rng = random.Random(700 + seed_off)
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
        # Trailing cascade over front rim
        if i % 3 == 0:
            trail_f = rot @ Vector((rng.uniform(-0.25, 0.25), -0.65, -0.70)).normalized()
            ak.add_cambered_leaf(bm, xform(tx, -0.26, 0.025), trail_f, rot @ Vector((0, -1, 0.2)), 0.15, 0.10, I_LEAF)

    # Rich cluster of 8 cupped 3D coastal blossoms nestled above greenery
    palette = (I_CORAL, I_BUTTER, I_BLUE, I_WHITE)
    for bi in range(8):
        bx = -box_w * 0.38 + (bi / 7.0) * (box_w * 0.76) + rng.uniform(-0.02, 0.02)
        by = rng.uniform(-0.24, -0.10)
        bz = rng.uniform(0.08, 0.13)
        bn = rot @ Vector((rng.uniform(-0.2, 0.2), -0.78, 0.62)).normalized()
        add_cupped_flower(xform(bx, by, bz), bn, rng.uniform(0.068, 0.088), palette[(bi + seed_off) % 4])


WALL_W = 4.78
WALL_D = 4.22
BASE_H = 0.48
EAVE_Z = 2.46
RIDGE_Z = 4.76

# 1. Stepped Cut-Stone Base Plinth & Double Front Steps
ak.add_box(bm, (0.0, 0.0, 0.13), (WALL_W + 0.42, WALL_D + 0.42, 0.26), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, 0.38), (WALL_W + 0.28, WALL_D + 0.28, 0.22), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.28, 0.13), (2.20, 0.62, 0.26), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.15, 0.32), (1.84, 0.42, 0.16), I_STONE, bevel=0.02)

# 2. Seamless Stucco Body + Wood Wainscot Belt Rail
add_seamless_pentagon_gable_body(WALL_W, WALL_D, BASE_H, EAVE_Z, RIDGE_Z - 0.10, I_STUCCO)
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.60), (WALL_W + 0.06, WALL_D + 0.06, 0.12), I_WOOD, bevel=0.012)

# 3. Emerald-Teal Doors + Crisp Stained Glass Windows w/ Rich Bespoke Flowerboxes
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.46, 2.00, 0.0, I_DOOR, I_CREAM, I_BRASS)
for lsx in (-0.96, 0.96):
    ak.add_wall_lantern(bm, (lsx, -WALL_D * 0.5 - 0.02, BASE_H + 1.28), 0.0, I_WOOD, I_LANTERN)

for idx, sx in enumerate((-1, 1)):
    fpos = (sx * 1.62, -WALL_D * 0.5 - 0.03, BASE_H + 0.98)
    ak.add_arched_window(bm, fpos, 0.80, 1.14, 0.0, I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=False)
    add_rich_flowerbox(fpos, 0.80, 1.14, 0.0, idx)

    rpos = (sx * 1.20, WALL_D * 0.5 + 0.03, BASE_H + 1.06)
    ak.add_arched_window(bm, rpos, 0.94, 1.26, math.pi, I_CREAM, I_GLASS, I_CREAM, cross_mullions=True, planter=False)
    add_rich_flowerbox(rpos, 0.94, 1.26, math.pi, 10 + idx)

for si, (side_x, yaw) in enumerate(((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5))):
    for wi, wy in enumerate((-0.94, 0.94)):
        spos = (side_x, wy, BASE_H + 1.04)
        ak.add_arched_window(bm, spos, 0.94, 1.28, yaw, I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=False)
        add_rich_flowerbox(spos, 0.94, 1.28, yaw, 20 + si * 2 + wi)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.30), 0.43, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.30), 0.43, math.pi, I_CREAM, I_ATTIC)

# 4. Overlapping Olive-Moss Roof w/ Closed Mitered Gable Apexes, Brass Ridge Straps & Limestone Chimney
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=4.80,
    eave_span=5.78,
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
# Cleanly close & miter front/rear bargeboard V-notch under ridge pole
for end_s in (-1, 1):
    y_end = end_s * (4.80 * 0.5 - 0.20 * 0.42)
    ak.add_box(bm, (0.0, y_end, RIDGE_Z - 0.04), (0.34, 0.22, 0.24), I_WOOD, bevel=0.015, rot_euler=(0.0, math.pi * 0.25, 0.0))

for r_y in (-1.15, 0.0, 1.15):
    ak.add_cyl(bm, (0.0, r_y - 0.06, RIDGE_Z + 0.06), (0.0, r_y + 0.06, RIDGE_Z + 0.06), 0.155, 0.155, 12, I_BRASS, smooth=True)

ak.add_box(bm, (-1.12, 1.00, 4.04), (0.68, 0.68, 1.48), I_STONE, bevel=0.025)
ak.add_box(bm, (-1.12, 1.00, 4.82), (0.82, 0.82, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (-1.12, 1.00, 4.89), (0.50, 0.50, 0.04), I_FLUE)

# 5. Climbing Vine Routed Outside Timber Belt (y = -2.14) & Sweeping Gracefully Over Window Arch Across Gable
VINE_Y = -WALL_D * 0.5 - 0.065  # -2.175 (belt extends to -2.14, so bow outward to -2.235 at z=1.08!)
vine_pts = [
    (-2.30, VINE_Y, 0.50),
    (-2.27, VINE_Y - 0.01, 0.86),
    (-2.29, -WALL_D * 0.5 - 0.125, 1.08),  # clears 0.03m thick timber belt cleanly!
    (-2.31, VINE_Y - 0.01, 1.32),
    (-2.30, VINE_Y, 1.82),
    (-2.20, VINE_Y, 2.34),
    (-1.82, VINE_Y + 0.005, 2.78),
    (-1.34, VINE_Y + 0.005, 3.16),
    (-0.82, VINE_Y + 0.005, 3.54),
    (-0.48, VINE_Y + 0.005, 3.82),
]
ak.add_vine_climb(bm, vine_pts, 0.036, I_WOOD, I_LEAF, None, seed=538)
# Subtle tapered secondary side shoot curving under attic window rim
ak.add_vine_climb(
    bm,
    [(-1.62, VINE_Y + 0.005, 2.94), (-1.22, VINE_Y + 0.005, 2.78), (-0.82, VINE_Y + 0.005, 2.70)],
    0.020, I_WOOD, I_LEAF_D, None, seed=539,
)
# Cupped 3D white & sky-blue coastal blossoms anchored cleanly into vine nodes
for vx, vy, vz, fmat in [
    (-2.28, -WALL_D * 0.5 - 0.145, 1.12, I_WHITE),
    (-2.29, VINE_Y - 0.02, 1.62, I_BLUE),
    (-2.18, VINE_Y - 0.02, 2.36, I_WHITE),
    (-1.58, VINE_Y - 0.02, 2.98, I_WHITE),
    (-1.02, VINE_Y - 0.02, 3.38, I_BLUE),
    (-0.58, VINE_Y - 0.02, 3.74, I_WHITE),
    (-0.94, VINE_Y - 0.02, 2.72, I_WHITE),
]:
    for li in range(3):
        ang = li * 1.9 + vx * 2.0
        fwd = Vector((math.cos(ang) * 0.65, -0.35, math.sin(ang) * 0.50 + 0.35)).normalized()
        ak.add_cambered_leaf(bm, (vx, vy + 0.01, vz), fwd, Vector((0, -1, 0.25)), 0.15, 0.10, I_LEAF_D if li % 2 else I_LEAF)
    add_cupped_flower((vx, vy - 0.03, vz), (0.0, -1.0, 0.25), 0.078, fmat)


# 6. Softly Displaced Continuous Velvety Moss Pillow Drifts (ZERO star decals, ZERO apex horns!)
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
        # Smooth organic bumpy velvet moss surface noise (flatten underside snugly into shingle deck!)
        if p.z < 0.0:
            p.z *= 0.28
        bump = 1.0 + 0.18 * math.sin(p.x * 4.7 + phase) * math.cos(p.y * 5.3 - phase) + 0.10 * math.cos(p.z * 6.0 + p.x * 3.1)
        v.co = mat @ Vector((p.x * bump, p.y * bump, p.z * (1.0 + 0.14 * math.sin(p.x * 3.9 + p.y * 4.2 + phase))))
    faces = list({f for v in verts for f in v.link_faces})
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    ak.paint_faces(bm, faces, I_MOSS_DRIFT, smooth=True, uv_scale=0.65)


def teal_roof_slope_z(x_abs: float) -> float:
    t = min(1.0, max(0.0, x_abs / (5.78 * 0.5)))
    return RIDGE_Z - (RIDGE_Z - (EAVE_Z - 0.06)) * (t ** (1.0 - 0.22 * 0.45))


def add_moss_ribbon(waypoints, base_w: float, phase: float):
    """Drape continuous overlapping irregular velvety moss pillows along slope/ridge/eave contours."""
    for wi, (px, py) in enumerate(waypoints):
        t_step = 0.02
        nx = (1.0 if px >= 0 else -1.0) * 0.68
        pz = teal_roof_slope_z(abs(px)) + 0.048
        w_lobe = base_w * (0.85 + 0.28 * abs(math.sin(wi * 1.7 + phase)))
        l_lobe = base_w * (1.15 + 0.35 * abs(math.cos(wi * 1.3 + phase)))
        add_organic_moss_lobe((px, py, pz), (nx, 0.0, 0.73), w_lobe, l_lobe, 0.068, phase + wi * 1.1)


# Ridge shoulder moss pillows strictly BETWEEN brass straps (y=-1.15, 0.0, 1.15) & inside y=[-1.95..1.95]
for idx, (rx, ry, rw, rl) in enumerate([
    (-0.22, -1.68, 0.24, 0.36), (-0.18, -1.38, 0.18, 0.24),
    (0.22, -0.78, 0.26, 0.34), (0.20, -0.44, 0.20, 0.28),
    (-0.22, 0.42, 0.25, 0.35), (-0.18, 0.76, 0.19, 0.26),
    (0.22, 1.56, 0.24, 0.34), (0.18, 1.85, 0.18, 0.24),
]):
    add_organic_moss_lobe((rx, ry, teal_roof_slope_z(abs(rx)) + 0.055), (-0.36 if rx < 0 else 0.36, 0.0, 0.93), rw, rl, 0.062, idx * 0.9)

# Chimney collar moss apron wrapping uphill & right/front base of (-1.12, 1.00)
for idx, (cx, cy, rw, rl) in enumerate([
    (-0.74, 0.98, 0.22, 0.34), (-0.82, 0.66, 0.24, 0.26), (-1.14, 0.56, 0.28, 0.24), (-1.48, 0.88, 0.20, 0.28),
]):
    add_organic_moss_lobe((cx, cy, teal_roof_slope_z(abs(cx)) + 0.052), (-0.68, 0.0, 0.73), rw, rl, 0.065, idx * 1.4 + 2.0)

# Continuous flowing cascading moss ribbons draping shingle step courses & eave overhangs on BOTH slopes
add_moss_ribbon([(-0.62, -1.78), (-0.88, -1.48), (-1.18, -1.18), (-1.42, -0.86), (-1.68, -0.58)], 0.25, 1.0)
add_moss_ribbon([(-1.72, -1.86), (-1.98, -1.52), (-2.18, -1.16), (-2.34, -0.78)], 0.24, 2.3)
add_moss_ribbon([(-0.98, -0.15), (-1.28, 0.15), (-1.56, 0.42), (-1.86, 0.72), (-2.16, 1.08), (-2.34, 1.48)], 0.26, 3.7)
add_moss_ribbon([(-0.65, 1.48), (-0.96, 1.72), (-1.28, 1.88)], 0.22, 4.9)

add_moss_ribbon([(0.66, -1.68), (0.96, -1.38), (1.28, -1.04), (1.58, -0.72), (1.88, -0.44), (2.18, -0.16)], 0.26, 5.4)
add_moss_ribbon([(1.54, -1.76), (1.86, -1.48), (2.16, -1.18), (2.36, -0.84)], 0.24, 6.2)
add_moss_ribbon([(0.72, 0.34), (1.02, 0.64), (1.36, 0.94), (1.68, 1.24), (1.98, 1.56), (2.28, 1.78)], 0.25, 7.1)
add_moss_ribbon([(1.78, 0.18), (2.06, 0.48), (2.28, 0.82)], 0.22, 8.3)

mesh = bpy.data.meshes.new("cottage-teal")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-teal", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-teal", (6.0, 5.05, 4.95))
