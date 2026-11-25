"""Build Moonbay Coast 3D Emerald-Teal Door Cottage v2 (cottage-teal):
Upgrades from v1 self-review:
1. Warm HONEY-AMBER cathedral stained glass (no washed-out white glass!) + leaded emerald attic roundel.
2. Seamless front & rear pentagon gable walls + ashlar limestone chimney with recessed dark flue.
3. Abundant sculpted olive/emerald roof moss foliage clusters along ridge & slopes + rich corner vine + tight bounds <= [6.0, 5.05, 4.95].
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh

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
    out_dir, "ct-moss-roof", (0.46, 0.56, 0.18), (0.32, 0.44, 0.13), rows=7, cols=9, seed=535, moss_tint=(0.24, 0.48, 0.14)
)
amber_col, amber_rgh = ak.make_stained_glass_textures(out_dir, "ct-amber-glass", (0.58, 0.22, 0.03), (0.94, 0.56, 0.12), seed=536)
attic_col, attic_rgh = ak.make_stained_glass_textures(out_dir, "ct-attic-glass", (0.04, 0.18, 0.17), (0.12, 0.44, 0.38), seed=537)

M_STONE = ak.make_pbr_mat("CtStone", stone_col, stone_rgh)
M_STUCCO = ak.make_pbr_mat("CtStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CtTimber", wood_col, wood_rgh)
M_TEAL_DOOR = ak.make_pbr_mat("CtTealDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CtMossRoof", roof_col, roof_rgh)
M_CREAM = ak.make_pbr_mat("CtCream", color=(0.94, 0.89, 0.77), roughness=0.64)
M_GLASS = ak.make_pbr_mat(
    "CtAmberGlass", amber_col, amber_rgh,
    metallic=0.10, roughness=0.07, coat=0.88, emission=(0.82, 0.36, 0.04), emission_strength=0.16
)
M_ATTIC = ak.make_pbr_mat("CtAtticGlass", attic_col, attic_rgh, metallic=0.18, roughness=0.06, coat=0.90)
M_BRASS = ak.make_pbr_mat("CtBrass", color=(0.96, 0.78, 0.34), metallic=0.45, roughness=0.28)
M_FLUE = ak.make_pbr_mat("CtFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_LEAF = ak.make_pbr_mat("CtLeaf", color=(0.24, 0.54, 0.18), roughness=0.48, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CtMossLeaf", color=(0.34, 0.58, 0.16), roughness=0.52, double_sided=True)
M_FLOWER = ak.make_pbr_mat("CtWhiteFlower", color=(0.98, 0.95, 0.84), roughness=0.40, double_sided=True)
M_LANTERN = ak.make_pbr_mat("CtLanternGlow", color=(1.0, 0.86, 0.42), roughness=0.22, emission=(1.0, 0.80, 0.36), emission_strength=1.4)

MATS = [M_STONE, M_STUCCO, M_WOOD, M_TEAL_DOOR, M_ROOF, M_CREAM, M_GLASS, M_ATTIC, M_BRASS, M_FLUE, M_LEAF, M_LEAF_D, M_FLOWER, M_LANTERN]
I_STONE, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_CREAM, I_GLASS, I_ATTIC, I_BRASS, I_FLUE, I_LEAF, I_LEAF_D, I_FLOWER, I_LANTERN = range(len(MATS))

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

# 3. Emerald-Teal Arched Double Doors + Honey-Amber Windows
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.46, 2.00, 0.0, I_DOOR, I_CREAM, I_BRASS)
for lsx in (-0.96, 0.96):
    ak.add_wall_lantern(bm, (lsx, -WALL_D * 0.5 - 0.02, BASE_H + 1.28), 0.0, I_WOOD, I_LANTERN)

for sx in (-1, 1):
    ak.add_arched_window(
        bm, (sx * 1.72, -WALL_D * 0.5 - 0.03, BASE_H + 0.98), 0.84, 1.16, 0.0,
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

# 4. Overlapping Olive-Moss Roof w/ Brass Ridge Straps + Ashlar Limestone Chimney + Dense Moss Clusters
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

ak.add_vine_climb(
    bm,
    [(-1.68, -WALL_D * 0.5 - 0.05, 0.50),
     (-1.54, -WALL_D * 0.5 - 0.06, 1.22),
     (-1.70, -WALL_D * 0.5 - 0.06, 1.98),
     (-1.32, -WALL_D * 0.5 - 0.05, 2.74),
     (-0.72, -WALL_D * 0.5 - 0.05, 3.55)],
    0.036, I_WOOD, I_LEAF, I_FLOWER, seed=538
)
for pts, l_mat, sd in [
    ([(0.05, -2.05, 4.78), (-0.06, -0.75, 4.80), (0.08, 0.65, 4.80), (-0.05, 1.95, 4.78)], I_LEAF_D, 539),
    ([(0.88, -1.35, 3.88), (1.30, -0.45, 3.50), (1.02, 0.55, 3.76), (1.38, 1.40, 3.42)], I_LEAF, 540),
    ([(-0.92, -1.65, 3.82), (-1.45, -0.65, 3.35), (-1.20, 0.35, 3.60)], I_LEAF_D, 541),
]:
    ak.add_vine_climb(bm, pts, 0.022, I_ROOF, l_mat, I_FLOWER if sd == 540 else None, seed=sd)

mesh = bpy.data.meshes.new("cottage-teal")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-teal", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-teal", (6.0, 5.05, 4.95))
