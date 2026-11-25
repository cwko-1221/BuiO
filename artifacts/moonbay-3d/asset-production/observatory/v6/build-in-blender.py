"""Build Moonbay Coast 3D Observatory v5 (observatory):
Resolves EVERY v4 art-critic requirement:
1. True Arched Colonnade Porch: semicircular masonry arch vaults & spandrels spanning every bay + turned-baluster Mediterranean balustrade parapet (no blocky castle crenelations).
2. Stepped Polished Brass Telescope + Curved Aperture Shroud: radial contour-hugging shutter slot + multi-stage brass barrels, collar rings, finderscope, yoke cradle & recessed glossy objective lens.
3. Vine Root & Clearance Fix: climbing vines start strictly inside soil beds beneath both front porch planters and spiral cleanly OUTSIDE maximum shaft radius (zero stem clipping!).
4. Door grille finials + tight footprint within 10.0 x 8.4 x 8.4m target bounds.
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

stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "obs-stone", (0.90, 0.83, 0.69), (0.65, 0.57, 0.44), rows=8, cols=10, seed=101
)
stucco_col, stucco_rough = ak.make_stucco_textures(
    out_dir, "obs-stucco", (0.95, 0.88, 0.74), (0.88, 0.77, 0.59), seed=102
)
dome_col, dome_rough = ak.make_copper_patina_textures(
    out_dir, "obs-dome", (0.05, 0.36, 0.32), (0.14, 0.56, 0.49), seed=103
)
wood_col, wood_rough = ak.make_wood_textures(
    out_dir, "obs-door", (0.09, 0.38, 0.27), (0.04, 0.19, 0.14), planks=5, seed=104, vertical=True
)
timber_col, timber_rough = ak.make_wood_textures(
    out_dir, "obs-timber", (0.58, 0.39, 0.22), (0.36, 0.23, 0.12), planks=4, seed=105
)
glass_col, glass_rough = ak.make_stained_glass_textures(
    out_dir, "obs-stained-glass", (0.03, 0.17, 0.16), (0.10, 0.42, 0.36), seed=109
)

MAT_STONE = ak.make_pbr_mat("ObsStone", stone_col, stone_rough)
MAT_STUCCO = ak.make_pbr_mat("ObsStucco", stucco_col, stucco_rough)
MAT_DOME = ak.make_pbr_mat("ObsCopperDome", dome_col, dome_rough, metallic=0.30)
MAT_GOLD = ak.make_pbr_mat("ObsBrassGold", color=(0.95, 0.77, 0.34), metallic=0.62, roughness=0.23)
MAT_DOOR = ak.make_pbr_mat("ObsDoor", wood_col, wood_rough)
MAT_TIMBER = ak.make_pbr_mat("ObsTimber", timber_col, timber_rough)
MAT_GLASS = ak.make_pbr_mat("ObsCathedralGlass", glass_col, glass_rough, metallic=0.18, roughness=0.06, coat=0.90)
MAT_LENS = ak.make_pbr_mat("ObsTelescopeLens", color=(0.02, 0.11, 0.22), metallic=0.35, roughness=0.03, coat=1.0)
MAT_LANTERN = ak.make_pbr_mat("ObsLanternGlow", color=(1.0, 0.86, 0.46), roughness=0.20, emission=(1.0, 0.80, 0.38), emission_strength=1.5)
MAT_TEAL_TRIM = ak.make_pbr_mat("ObsTealTrim", color=(0.16, 0.54, 0.50), roughness=0.42)
MAT_SOIL = ak.make_pbr_mat("ObsSoil", color=(0.24, 0.16, 0.10), roughness=0.95)
MAT_FOLIAGE = ak.make_pbr_mat("ObsFoliage", color=(0.16, 0.44, 0.16), roughness=0.48, double_sided=True)
MAT_FOLIAGE_L = ak.make_pbr_mat("ObsFoliageFresh", color=(0.26, 0.58, 0.20), roughness=0.45, double_sided=True)
MAT_BLOOM = ak.make_pbr_mat("ObsBlossomGold", color=(0.98, 0.78, 0.22), roughness=0.40, double_sided=True)
MAT_BLOOM_W = ak.make_pbr_mat("ObsBlossomCream", color=(0.98, 0.94, 0.84), roughness=0.40, double_sided=True)

MATS = [
    MAT_STONE, MAT_STUCCO, MAT_DOME, MAT_GOLD, MAT_DOOR, MAT_TIMBER,
    MAT_GLASS, MAT_LENS, MAT_LANTERN, MAT_TEAL_TRIM, MAT_SOIL,
    MAT_FOLIAGE, MAT_FOLIAGE_L, MAT_BLOOM, MAT_BLOOM_W,
]
(I_STONE, I_STUCCO, I_DOME, I_GOLD, I_DOOR, I_TIMBER,
 I_GLASS, I_LENS, I_LANTERN, I_TEAL, I_SOIL,
 I_LEAF, I_LEAF_L, I_BLOOM, I_BLOOM_W) = range(len(MATS))

bm = bmesh.new()


def add_planter_garden(px: float, py: float, base_z: float, seed: int):
    rng = random.Random(seed)
    for _ in range(72):
        ox = rng.uniform(-0.42, 0.42)
        oy = rng.uniform(-0.24, 0.24)
        h_bell = max(0.0, 1.0 - (ox / 0.46) ** 2 - (oy / 0.28) ** 2)
        oz = base_z + 0.02 + rng.uniform(0.0, 0.13 + 0.15 * h_bell)
        ang = math.atan2(oy, ox) + rng.uniform(-0.8, 0.8)
        pitch = rng.uniform(0.15, 0.85)
        fwd = Vector((math.cos(ang) * math.cos(pitch), math.sin(ang) * math.cos(pitch), math.sin(pitch))).normalized()
        out = Vector((math.cos(ang), math.sin(ang), 0.75)).normalized()
        ak.add_cambered_leaf(bm, (px + ox, py + oy, oz), fwd, out, rng.uniform(0.17, 0.25), rng.uniform(0.11, 0.15), I_LEAF if rng.random() < 0.6 else I_LEAF_L)
    for bi, (bx, by, bz, pmat) in enumerate([
        (-0.26, -0.09, base_z + 0.24, I_BLOOM),
        (-0.10, -0.14, base_z + 0.28, I_BLOOM_W),
        (0.06, -0.08, base_z + 0.30, I_BLOOM),
        (0.22, -0.11, base_z + 0.25, I_BLOOM_W),
        (-0.18, 0.08, base_z + 0.25, I_BLOOM_W),
        (0.02, 0.10, base_z + 0.28, I_BLOOM),
        (0.22, 0.07, base_z + 0.24, I_BLOOM),
    ]):
        c = Vector((px + bx, py + by, bz))
        rad = 0.090
        ak.add_sphere(bm, c, 0.024, (1, 1, 0.7), 1, I_GOLD, smooth=True)
        for pi in range(6):
            pa = pi * math.tau / 6.0 + bi * 0.3
            u = Vector((math.cos(pa), math.sin(pa), 0.18)).normalized()
            v = Vector((-math.sin(pa), math.cos(pa), 0.0))
            f = bm.faces.new((
                bm.verts.new(c),
                bm.verts.new(c + u * (rad * 0.55) + v * (rad * 0.28)),
                bm.verts.new(c + u * rad + Vector((0, 0, -0.015))),
                bm.verts.new(c + u * (rad * 0.55) - v * (rad * 0.28)),
            ))
            ak.paint_faces(bm, [f], pmat, smooth=True, uv_scale=1.0)


def add_bay_arch(center_xy, span: float, spring_z: float, top_z: float, thick: float, yaw: float):
    """Carved Mediterranean arcade arch ring + spandrel haunches between adjacent columns."""
    r_arc = span * 0.5 - 0.16
    cx, cy = center_xy
    ak.add_curved_arch_extrude(bm, r_arc, spring_z, r_arc, thick, 0.22, 18, I_STONE, rot_z=yaw, offset=Vector((cx, cy, 0.0)))
    # Carved masonry keystone at crown + stepped spandrel haunch corners reaching beam soffit
    ak.add_box(bm, (cx, cy, spring_z + r_arc + 0.08), (0.24, thick + 0.04, 0.26), I_STONE, bevel=0.015, rot_euler=(0, 0, yaw))
    ca, sa = math.cos(yaw), math.sin(yaw)
    sp_top = spring_z + r_arc + 0.12
    for s in (-1, 1):
        haunch_x = cx + ca * (s * (r_arc * 0.84))
        haunch_y = cy + sa * (s * (r_arc * 0.84))
        ak.add_box(bm, (haunch_x, haunch_y, (spring_z + sp_top) * 0.5 + 0.04), (r_arc * 0.42, thick * 0.90, (sp_top - spring_z) * 0.72), I_STUCCO, bevel=0.01, rot_euler=(0, 0, yaw))
    # Horizontal entablature soffit & cornice ties above the crown
    ak.add_box(bm, (cx, cy, top_z), (span + 0.24, thick + 0.08, 0.24), I_STONE, bevel=0.02, rot_euler=(0, 0, yaw))


def add_turned_baluster_run(p0, p1, base_z: float, rail_z: float, mat_stone: int):
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    dist = math.hypot(dx, dy)
    yaw = math.atan2(dy, dx)
    mx, my = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    ak.add_box(bm, (mx, my, base_z + 0.05), (dist, 0.22, 0.10), mat_stone, bevel=0.015, rot_euler=(0, 0, yaw))
    ak.add_box(bm, (mx, my, rail_z), (dist + 0.06, 0.26, 0.10), mat_stone, bevel=0.02, rot_euler=(0, 0, yaw))
    n_bal = max(2, int(round(dist / 0.36)))
    for bi in range(1, n_bal):
        t = bi / n_bal
        bx, by = x0 + dx * t, y0 + dy * t
        ak.add_lathe(bm, [
            (0.08, base_z + 0.10), (0.08, base_z + 0.14), (0.045, base_z + 0.19),
            (0.072, base_z + 0.28), (0.042, base_z + 0.38), (0.075, rail_z - 0.05),
        ], 10, mat_stone, center=(bx, by, 0.0), smooth_side=True)


CX = 1.30
R_ROT = 3.24

# Circular rotunda stepped base + west colonnade loggia plinth (total width strictly <= 9.80m!)
ak.add_lathe(bm, [
    (0.0, 0.0), (3.66, 0.0), (3.66, 0.16), (3.52, 0.17), (3.52, 0.34), (3.36, 0.35), (3.36, 0.48), (0.0, 0.48)
], 28, I_STONE, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_box(bm, (-2.12, 0.0, 0.22), (5.36, 5.20, 0.44), I_STONE, bevel=0.04)
ak.add_box(bm, (-2.12, 0.0, 0.46), (5.16, 5.00, 0.10), I_STONE, bevel=0.025)

for s_i, (step_d, step_w, step_z, step_h) in enumerate([
    (1.12, 3.00, 0.08, 0.16),
    (0.82, 2.68, 0.24, 0.16),
    (0.54, 2.34, 0.40, 0.16),
]):
    ak.add_box(bm, (CX, -3.42 - (2 - s_i) * 0.22, step_z), (step_w, step_d, step_h), I_STONE, bevel=0.02)

# Three planters positioned cleanly directly below climbing vines + doorway flank!
PLANTERS = [
    (-4.26, -2.74, 180),
    (-2.24, -2.74, 199),
    (4.02, -2.85, 217),
]
for px, py, pseed in PLANTERS:
    ak.add_box(bm, (px, py, 0.34), (1.06, 0.72, 0.68), I_STONE, bevel=0.03)
    ak.add_box(bm, (px, py, 0.69), (1.14, 0.80, 0.10), I_STONE, bevel=0.02)
    ak.add_box(bm, (px, py, 0.72), (0.94, 0.60, 0.06), I_SOIL)
    add_planter_garden(px, py, 0.76, seed=pseed)

# Main rotunda masonry drum & cornice band
ak.add_lathe(bm, [
    (R_ROT + 0.12, 0.48), (R_ROT + 0.12, 0.68), (R_ROT, 0.72), (R_ROT, 4.55),
    (R_ROT + 0.16, 4.65), (R_ROT + 0.24, 4.85), (R_ROT + 0.24, 5.04), (R_ROT + 0.05, 5.06)
], 24, I_STUCCO, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_lathe(bm, [(R_ROT + 0.18, 0.48), (R_ROT + 0.20, 0.56), (R_ROT + 0.14, 0.68)], 24, I_STONE, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_lathe(bm, [(R_ROT + 0.24, 4.74), (R_ROT + 0.28, 4.82), (R_ROT + 0.24, 4.90)], 24, I_GOLD, center=(CX, 0.0, 0.0), smooth_side=True)

for bi in range(8):
    ang = bi * math.tau / 8.0 + math.pi / 8.0
    px = CX + (R_ROT - 0.02) * math.cos(ang)
    py = (R_ROT - 0.02) * math.sin(ang)
    ak.add_box(bm, (px, py, 2.65), (0.34, 0.34, 3.85), I_STONE, bevel=0.025, rot_euler=(0, 0, ang))
    ak.add_box(bm, (px, py, 0.72), (0.44, 0.44, 0.24), I_STONE, bevel=0.02, rot_euler=(0, 0, ang))
    ak.add_box(bm, (px, py, 4.56), (0.46, 0.46, 0.26), I_STONE, bevel=0.02, rot_euler=(0, 0, ang))

ak.add_arched_door(bm, (CX, -R_ROT - 0.04, 0.48), 1.62, 2.70, 0.0, I_DOOR, I_STONE, I_GOLD)
for side in (-1, 1):
    ak.add_wall_lantern(bm, (CX + side * 1.15, -R_ROT + 0.04, 2.42), side * 0.25, I_GOLD, I_LANTERN)

for bay_ang in (0.0, math.pi * 0.25, math.pi * 0.5, math.pi * 0.75, -math.pi * 0.25, -math.pi * 0.75):
    wx = CX + (R_ROT + 0.02) * math.cos(bay_ang)
    wy = (R_ROT + 0.02) * math.sin(bay_ang)
    ak.add_arched_window(bm, (wx, wy, 2.52), 1.34, 2.20, bay_ang + math.pi * 0.5, I_STONE, I_GLASS, I_STONE, cross_mullions=True)

# 1. TRUE ARCHED COLONNADE PORCH + MEDITERRANEAN TURNED BALUSTRADE
PORCH_COLS = [(-4.26, -2.14), (-4.26, 0.0), (-4.26, 2.14), (-2.24, -2.14), (-2.24, 2.14)]
for colx, coly in PORCH_COLS:
    ak.add_lathe(bm, [
        (0.31, 0.48), (0.31, 0.62), (0.24, 0.72), (0.20, 0.76), (0.175, 2.86),
        (0.23, 2.96), (0.30, 3.04), (0.30, 3.16)
    ], 16, I_STONE, center=(colx, coly, 0.0), smooth_side=True)
    ak.add_box(bm, (colx, coly, 0.54), (0.62, 0.62, 0.14), I_STONE, bevel=0.02)
    ak.add_box(bm, (colx, coly, 3.10), (0.64, 0.64, 0.14), I_STONE, bevel=0.02)

# Carved semicircular arch vaults between EVERY colonnade column bay!
add_bay_arch((-4.26, -1.07), 2.14, 3.14, 4.02, 0.46, math.pi * 0.5)
add_bay_arch((-4.26, 1.07), 2.14, 3.14, 4.02, 0.46, math.pi * 0.5)
add_bay_arch((-3.25, -2.14), 2.02, 3.14, 4.02, 0.46, 0.0)
add_bay_arch((-3.25, 2.14), 2.02, 3.14, 4.02, 0.46, 0.0)
# Engage inner lintels neatly into rotunda drum
ak.add_box(bm, (-1.15, -2.14, 4.02), (2.20, 0.46, 0.24), I_STONE, bevel=0.02)
ak.add_box(bm, (-1.15, 2.14, 4.02), (2.20, 0.46, 0.24), I_STONE, bevel=0.02)
# Subtle teal inlay architrave molding on arcade entablature
ak.add_box(bm, (-4.38, 0.0, 3.92), (0.18, 4.66, 0.09), I_TEAL)
ak.add_box(bm, (-2.25, -2.26, 3.92), (4.10, 0.18, 0.09), I_TEAL)
ak.add_box(bm, (-2.25, 2.26, 3.92), (4.10, 0.18, 0.09), I_TEAL)

# Timber loggia deck & joists inside terrace
ak.add_box(bm, (-2.38, 0.0, 4.14), (3.72, 4.24, 0.12), I_TIMBER, bevel=0.015)
for jx in (-3.96, -3.28, -2.60, -1.92, -1.24):
    ak.add_box(bm, (jx, 0.0, 4.22), (0.13, 4.70, 0.12), I_TIMBER, bevel=0.015)

# Perforated turned-baluster parapet along 3 outer edges (no castle battlements!)
add_turned_baluster_run((-4.36, -2.20), (-4.36, 2.20), 4.14, 4.58, I_STONE)
add_turned_baluster_run((-4.36, -2.20), (-1.45, -2.20), 4.14, 4.58, I_STONE)
add_turned_baluster_run((-4.36, 2.20), (-1.45, 2.20), 4.14, 4.58, I_STONE)
for ppx, ppy in [(-4.36, -2.20), (-4.36, 0.0), (-4.36, 2.20), (-2.24, -2.20), (-2.24, 2.20)]:
    ak.add_box(bm, (ppx, ppy, 4.38), (0.38, 0.38, 0.56), I_STONE, bevel=0.02)
    ak.add_sphere(bm, (ppx, ppy, 4.74), 0.11, (1.0, 1.0, 1.15), 1, I_GOLD, smooth=True)

ak.add_wall_lantern(bm, (-4.00, -2.14, 2.65), 0.0, I_GOLD, I_LANTERN)

# 2. FIXED VINES: Start inside front planters beneath columns, spiral strictly OUTSIDE shaft radius + stem radius!
for col_cx, col_cy, start_y, vseed in (
    (-4.26, -2.14, -2.62, 107),
    (-2.24, -2.14, -2.62, 113),
):
    pts = [(col_cx, start_y, 0.72), (col_cx, start_y + 0.24, 0.78)]
    n_seg = 24
    for k in range(n_seg + 1):
        t = k / n_seg
        z = 0.80 + t * 2.15
        # Strictly outside max shaft radius (0.20..0.175) + full stem clearance!
        r_shaft = 0.205 * (1.0 - t) + 0.180 * t
        stem_r_t = 0.024 * (1.10 - 0.50 * t)
        r_hug = r_shaft + stem_r_t * 1.35 + 0.014
        a = -math.pi * 0.5 + t * math.tau * 1.25
        pts.append((col_cx + math.cos(a) * r_hug, col_cy + math.sin(a) * r_hug, z))
    ak.add_vine_climb(
        bm, pts, 0.024, I_TIMBER, I_LEAF_L if vseed == 113 else I_LEAF,
        I_BLOOM_W if vseed == 113 else I_BLOOM, seed=vseed, cling_center=(col_cx, col_cy)
    )

# 3. DOME & CURVED SHUTTER APERTURE + MULTI-STAGE POLISHED BRASS TELESCOPE + OBJECTIVE LENS
DOME_Z = 5.05
DOME_R = 3.30
DOME_H = 2.55
ak.add_ribbed_dome(bm, (CX, 0.0, DOME_Z), radius=DOME_R, height=DOME_H, dome_mat=I_DOME, rib_mat=I_GOLD, meridian_segs=24, rings=10, n_ribs=12)

# Contoured curved shutter cheek arcs & aperture aligned at exact same tel_yaw = -1.8326 rad (-105 deg, midpoint between ribs!)
tel_yaw = -1.8326
sh_dir = Vector((math.cos(tel_yaw), math.sin(tel_yaw), 0.0))
sh_perp = Vector((-math.sin(tel_yaw), math.cos(tel_yaw), 0.0))
sh_cen = Vector((CX, 0.0, DOME_Z))
for side in (-1, 1):
    pts_cheek = []
    for k in range(8):
        phi = 0.34 + k * 0.082
        rp = (DOME_R + 0.055) * math.cos(phi)
        zp = DOME_H * math.sin(phi)
        pts_cheek.append(sh_cen + sh_dir * rp + sh_perp * (side * 0.36) + Vector((0, 0, zp)))
    for k in range(len(pts_cheek) - 1):
        ak.add_cyl(bm, pts_cheek[k], pts_cheek[k + 1], 0.068, 0.068, 8, I_GOLD, smooth=True)
for k in range(7):
    phi0 = 0.36 + k * 0.080
    phi1 = 0.36 + (k + 1) * 0.080
    p0 = sh_cen + sh_dir * ((DOME_R - 0.04) * math.cos(phi0)) + Vector((0, 0, DOME_H * math.sin(phi0)))
    p1 = sh_cen + sh_dir * ((DOME_R - 0.04) * math.cos(phi1)) + Vector((0, 0, DOME_H * math.sin(phi1)))
    ak.add_cyl(bm, p0, p1, 0.26, 0.26, 8, I_LENS, smooth=False)

# Multi-stage stepped polished brass telescope emerging DEAD CENTER out of dome aperture (exact sh_dir azimuth!)
t_base = sh_cen + sh_dir * 1.85 + Vector((0.0, 0.0, 1.68))
t_axis = (sh_dir * 0.88 + Vector((0.0, 0.0, 0.48))).normalized()
t_up = Vector((-sh_dir.x * 0.48, -sh_dir.y * 0.48, 0.88)).normalized()
t_side = t_axis.cross(t_up).normalized()

# Trunnion yoke cradle arms anchoring into slot
for s in (-1, 1):
    ak.add_cyl(bm, t_base + t_side * (s * 0.28) - t_up * 0.32, t_base + t_side * (s * 0.26), 0.048, 0.058, 8, I_GOLD, smooth=True)
ak.add_cyl(bm, t_base - t_side * 0.30, t_base + t_side * 0.30, 0.065, 0.065, 10, I_GOLD, smooth=True)

# 3 stepped brass barrels + brass clamping collars + flared dew shield!
p_s0 = t_base - t_axis * 0.15
p_s1 = t_base + t_axis * 0.55
p_s2 = t_base + t_axis * 1.05
p_s3 = t_base + t_axis * 1.48
p_s4 = t_base + t_axis * 1.72
ak.add_cyl(bm, p_s0, p_s1, 0.23, 0.25, 16, I_GOLD, smooth=True)
ak.add_cyl(bm, p_s1 - t_axis * 0.03, p_s1 + t_axis * 0.04, 0.285, 0.285, 16, I_GOLD, smooth=True)
ak.add_cyl(bm, p_s1, p_s2, 0.20, 0.215, 16, I_GOLD, smooth=True)
ak.add_cyl(bm, p_s2 - t_axis * 0.03, p_s2 + t_axis * 0.04, 0.245, 0.245, 16, I_GOLD, smooth=True)
ak.add_cyl(bm, p_s2, p_s3, 0.255, 0.275, 16, I_GOLD, smooth=True)
ak.add_cyl(bm, p_s3, p_s4, 0.295, 0.295, 16, I_GOLD, smooth=True)
# Recessed dark glossy optical lens seated inside muzzle shroud
ak.add_cyl(bm, p_s4 - t_axis * 0.06, p_s4 - t_axis * 0.015, 0.235, 0.245, 16, I_LENS, smooth=True)
ak.add_sphere(bm, p_s4 - t_axis * 0.025, 0.215, (0.22, 0.22, 0.06), 1, I_LENS, smooth=True)

# Parallel brass finderscope on twin brackets
f_off = t_up * 0.30 + t_side * 0.11
ak.add_cyl(bm, p_s1 + t_axis * 0.12 + f_off, p_s2 + t_axis * 0.35 + f_off, 0.048, 0.056, 10, I_GOLD, smooth=True)
ak.add_cyl(bm, p_s2 + t_axis * 0.35 + f_off, p_s2 + t_axis * 0.42 + f_off, 0.064, 0.064, 10, I_GOLD, smooth=True)
for fp in (p_s1 + t_axis * 0.16, p_s2 + t_axis * 0.18):
    ak.add_cyl(bm, fp, fp + f_off, 0.022, 0.022, 6, I_GOLD, smooth=True)

# Dome crown cupola finial
ak.add_lathe(bm, [
    (0.45, 7.52), (0.48, 7.62), (0.28, 7.72), (0.14, 7.82), (0.09, 8.16), (0.14, 8.24), (0.0, 8.36)
], 16, I_GOLD, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_sphere(bm, (CX, 0.0, 7.94), 0.155, (1.0, 1.0, 1.0), 2, I_GOLD, smooth=True)

mesh = bpy.data.meshes.new("observatory")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("observatory", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "observatory", (10.0, 8.4, 8.4))
