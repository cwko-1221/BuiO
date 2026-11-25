"""Build Moonbay Coast 3D Emerald-Teal Door Cottage v4 (cottage-teal):
Upgrades from v3 visual review:
1. Move front-left climbing vine strictly OUTSIDE left front window trim (x = -2.36 -> arching cleanly over top of left window along gable eave) so ZERO vine/stem crosses the window glass or planter.
2. Replace tiny spaced leaf pin-dots with lush cascading velvet roof moss drifts along ridge shoulders (clear of brass ridge straps), chimney base, eaves & slopes.
3. Non-glare honey-amber stained glass (rough_img=None, roughness=0.42, coat=0.0) & lifted jade attic roundel + warm non-clipping lanterns.
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
    out_dir, "ct-moss-roof", (0.44, 0.55, 0.17), (0.29, 0.42, 0.12), rows=7, cols=9, seed=535, moss_tint=(0.22, 0.48, 0.13)
)
amber_col, amber_rgh = ak.make_stained_glass_textures(out_dir, "ct-amber-glass", (0.58, 0.22, 0.03), (0.94, 0.56, 0.12), seed=536)
attic_col, attic_rgh = ak.make_stained_glass_textures(out_dir, "ct-attic-glass", (0.08, 0.34, 0.30), (0.20, 0.68, 0.58), seed=537)

M_STONE = ak.make_pbr_mat("CtStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CtStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CtTimber", wood_col, wood_rgh)
M_TEAL_DOOR = ak.make_pbr_mat("CtTealDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CtMossRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CtCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CtAmberGlass", amber_col, None,
    metallic=0.0, roughness=0.42, coat=0.0, emission=(0.90, 0.46, 0.06), emission_strength=0.22
)
M_ATTIC = ak.make_pbr_mat(
    "CtAtticGlass", attic_col, None,
    metallic=0.0, roughness=0.40, coat=0.0, emission=(0.12, 0.52, 0.44), emission_strength=0.22
)
M_BRASS = ak.make_pbr_mat("CtBrass", color=(0.96, 0.78, 0.34), metallic=0.62, roughness=0.25)
M_FLUE = ak.make_pbr_mat("CtFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_LEAF = ak.make_pbr_mat("CtLeaf", color=(0.25, 0.56, 0.17), roughness=0.50, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CtMossLeaf", color=(0.38, 0.61, 0.16), roughness=0.55, double_sided=True)
M_MOSS_PAD = ak.make_pbr_mat("CtMossPad", color=(0.31, 0.52, 0.14), roughness=0.72)
M_FLOWER = ak.make_pbr_mat("CtWhiteFlower", color=(0.98, 0.95, 0.84), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat(
    "CtLanternGlow", color=(0.98, 0.66, 0.18), roughness=0.36, emission=(0.98, 0.54, 0.10), emission_strength=0.68
)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_TEAL_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_FLUE, M_LEAF, M_LEAF_D, M_MOSS_PAD, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_FLUE, I_LEAF, I_LEAF_D, I_MOSS_PAD, I_FLOWER, I_LANTERN = range(len(MATS))

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

# 3. Emerald-Teal Arched Double Doors + Honey-Amber Windows (shifted slightly inward to give left corner crisp vine margin)
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.46, 2.00, 0.0, I_DOOR, I_CREAM, I_BRASS)
for lsx in (-0.96, 0.96):
    ak.add_wall_lantern(bm, (lsx, -WALL_D * 0.5 - 0.02, BASE_H + 1.28), 0.0, I_WOOD, I_LANTERN)

for sx in (-1, 1):
    ak.add_arched_window(
        bm, (sx * 1.62, -WALL_D * 0.5 - 0.03, BASE_H + 0.98), 0.80, 1.14, 0.0,
        I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
    )
    ak.add_arched_window(
        bm, (sx * 1.20, WALL_D * 0.5 + 0.03, BASE_H + 1.06), 0.94, 1.26, math.pi,
        I_CREAM, I_GLASS, I_CREAM, cross_mullions=True
    )

for side_x, yaw in ((-WALL_W * 0.5 - 0.03, -math.pi * 0.5), (WALL_W * 0.5 + 0.03, math.pi * 0.5)):
    for wy in (-0.94, 0.94):
        ak.add_arched_window(
            bm, (side_x, wy, BASE_H + 1.04), 0.94, 1.28, yaw,
            I_CREAM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_FLOWER, leaf_mat=I_LEAF
        )

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.30), 0.43, 0.0, I_CREAM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.30), 0.43, math.pi, I_CREAM, I_ATTIC)

# 4. Overlapping Olive-Moss Roof w/ Brass Ridge Straps + Ashlar Limestone Chimney
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
for r_y in (-1.15, 0.0, 1.15):
    ak.add_cyl(bm, (0.0, r_y - 0.06, RIDGE_Z + 0.06), (0.0, r_y + 0.06, RIDGE_Z + 0.06), 0.155, 0.155, 12, I_BRASS, smooth=True)

ak.add_box(bm, (-1.12, 1.00, 4.04), (0.68, 0.68, 1.48), I_STONE, bevel=0.025)
ak.add_box(bm, (-1.12, 1.00, 4.82), (0.82, 0.82, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (-1.12, 1.00, 4.89), (0.50, 0.50, 0.04), I_FLUE)

# 5. Corner Climbing Vine Strictly Outside Left Window (window trim right/left edge at -2.12..-1.12 -> climb x = -2.30 -> curve up above arch!)
VINE_Y = -WALL_D * 0.5 - 0.06
ak.add_vine_climb(
    bm,
    [(-2.30, VINE_Y, 0.50),
     (-2.26, VINE_Y, 1.08),
     (-2.32, VINE_Y, 1.72),
     (-2.22, VINE_Y, 2.34),
     (-1.82, VINE_Y + 0.01, 2.86),
     (-1.30, VINE_Y + 0.01, 3.34),
     (-0.78, VINE_Y + 0.01, 3.74)],
    0.040, I_WOOD, I_LEAF, I_FLOWER, seed=538
)
for vx, vz, vrot in [(-2.28, 0.72, -0.4), (-2.28, 1.48, 0.4), (-2.22, 2.26, -0.3), (-1.42, 3.22, 0.45)]:
    for k in range(6):
        ang = vrot + k * 0.72
        fwd = Vector((math.cos(ang) * 0.70, -0.36, math.sin(ang) * 0.52 + 0.34)).normalized()
        ak.add_cambered_leaf(bm, (vx, VINE_Y - 0.01, vz), fwd, Vector((0, -1, 0.25)), 0.17, 0.12, I_LEAF_D if k % 2 else I_LEAF)


def add_moss_drift(center_pos, surf_n, rad_scale=1.0, down_bias=0.35, with_flower=False, seed_idx=0):
    n = Vector(surf_n).normalized()
    up_ref = Vector((0, 1, 0)) if abs(n.y) < 0.8 else Vector((1, 0, 0))
    u = n.cross(up_ref).normalized()
    v = n.cross(u).normalized()
    c = Vector(center_pos)
    for oi, (du, dv, sc) in enumerate([(0.0, 0.0, 1.0), (0.14 * rad_scale, 0.11 * rad_scale, 0.72), (-0.12 * rad_scale, 0.12 * rad_scale, 0.68)]):
        pc = c + u * du + v * dv - n * 0.015
        ak.add_sphere(bm, pc, 0.14 * sc * rad_scale, (1.1, 1.1, 0.42), 1, I_MOSS_PAD, smooth=True)
    fronds = 14
    for fi in range(fronds):
        ang = seed_idx * 0.55 + fi * math.tau / fronds
        radial = (u * math.cos(ang) + v * math.sin(ang)).normalized()
        fwd = (radial * 0.86 + n * 0.22 + Vector((0, 0, -down_bias * 0.25))).normalized()
        llen = (0.21 + ((fi + seed_idx) % 3) * 0.05) * rad_scale
        lmat = I_LEAF_D if (fi + seed_idx) % 2 == 0 else I_LEAF
        ak.add_cambered_leaf(bm, c + radial * (0.04 * rad_scale) + n * 0.01, fwd, n, llen, llen * 0.76, lmat)
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


def teal_roof_slope_z(x_abs: float) -> float:
    t = min(1.0, max(0.0, x_abs / (5.78 * 0.5)))
    return RIDGE_Z - (RIDGE_Z - (EAVE_Z - 0.06)) * (t ** (1.0 - 0.22 * 0.45))


# Sculpted olive/emerald moss carpets along ridge shoulders (between brass straps) & shingle slopes
for idx, (rx, ry, sc) in enumerate([
    (-0.22, -1.72, 1.05), (0.24, -0.58, 1.15), (-0.22, 0.58, 1.12), (0.24, 1.72, 1.02),
]):
    add_moss_drift((rx, ry, teal_roof_slope_z(abs(rx)) + 0.065), (-0.36 if rx < 0 else 0.36, 0.0, 0.93), rad_scale=sc, down_bias=0.25, with_flower=(idx == 2), seed_idx=idx)

for idx, (sx, sy, sc) in enumerate([
    (-0.88, -1.58, 1.18), (-1.45, -0.68, 1.24), (-0.98, 0.28, 1.15), (-1.78, 1.18, 1.18), (-2.12, -0.95, 1.06), (-2.05, 0.42, 1.08),
    (0.84, -1.48, 1.16), (1.38, -0.52, 1.24), (0.95, 0.42, 1.16), (1.68, 1.38, 1.15), (2.05, -0.82, 1.08), (1.92, 0.72, 1.08),
    # Chimney collar moss pockets around (-1.12, 1.00)
    (-0.74, 0.96, 1.10), (-1.14, 0.54, 1.08),
]):
    pz = teal_roof_slope_z(abs(sx)) + 0.058
    nx = 0.68 if sx > 0 else -0.68
    add_moss_drift((sx, sy, pz), (nx, 0.0, 0.73), rad_scale=sc, with_flower=(idx in (1, 7, 10)), seed_idx=idx + 12)

mesh = bpy.data.meshes.new("cottage-teal")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-teal", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-teal", (6.0, 5.05, 4.95))
