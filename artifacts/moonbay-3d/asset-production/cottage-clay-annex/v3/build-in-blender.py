"""Build Moonbay Coast 3D Floral-Portico Annex Cottage v3 (cottage-clay-annex):
Resolves EVERY v2 art-critic finding (dfbf6352):
1. Dense continuous multi-layered botanical portico floral swag cascading down upper pilasters + richly saturated coastal blossoms (rose-coral, deep marigold, rich lavender).
2. Textured warm limestone masonry on portico arch, pilasters & all-4-corner alternating quoins + sandy limestone plinth + peach-cream stucco.
3. Rich metallic=0.62 brass door hardware with rosette backplates & warm amber finialed lanterns + non-glare stained amber glass (roughness=0.42, coat=0.0) & lifted sage-aqua oculus (roughness=0.40, coat=0.0).
4. Fuller plinth-rooted corner vine with lush flower sprays & brimming front window box.
5. Dramatic bell_flare=0.38 bell-eave terracotta roof sweep + crisp ashlar chimney.
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

stone_col, stone_rgh = ak.make_stone_textures(out_dir, "cca-stone", (0.88, 0.80, 0.64), (0.68, 0.58, 0.43), rows=6, cols=9, seed=521)
trim_col, trim_rgh = ak.make_stone_textures(out_dir, "cca-trim-stone", (0.93, 0.86, 0.72), (0.76, 0.67, 0.52), rows=5, cols=7, seed=520)
stucco_col, stucco_rgh = ak.make_stucco_textures(out_dir, "cca-stucco", (0.96, 0.87, 0.73), (0.89, 0.74, 0.57), seed=522)
wood_col, wood_rgh = ak.make_wood_textures(out_dir, "cca-wood", (0.58, 0.35, 0.17), (0.34, 0.19, 0.08), planks=5, seed=523)
door_col, door_rgh = ak.make_wood_textures(out_dir, "cca-door", (0.70, 0.36, 0.16), (0.45, 0.21, 0.08), planks=6, seed=524, vertical=True)
roof_col, roof_rgh = ak.make_shingle_textures(out_dir, "cca-clay-roof", (0.88, 0.46, 0.18), (0.68, 0.31, 0.11), rows=8, cols=10, seed=525)
amber_col, amber_rgh = ak.make_stained_glass_textures(out_dir, "cca-amber-glass", (0.58, 0.22, 0.03), (0.94, 0.56, 0.12), seed=526)
attic_col, attic_rgh = ak.make_stained_glass_textures(out_dir, "cca-attic-glass", (0.10, 0.38, 0.34), (0.24, 0.72, 0.62), seed=527)

M_STONE = ak.make_pbr_mat("CcaStone", stone_col, stone_rgh)
M_TRIM = ak.make_pbr_mat("CcaTrimStone", trim_col, trim_rgh)
M_STUCCO = ak.make_pbr_mat("CcaStucco", stucco_col, stucco_rgh)
M_WOOD = ak.make_pbr_mat("CcaTimber", wood_col, wood_rgh)
M_DOOR = ak.make_pbr_mat("CcaOakDoor", door_col, door_rgh)
M_ROOF = ak.make_pbr_mat("CcaClayRoof", roof_col, roof_rgh)
M_GLASS = ak.make_pbr_mat(
    "CcaAmberGlass", amber_col, None,
    metallic=0.0, roughness=0.42, coat=0.0, emission=(0.90, 0.46, 0.06), emission_strength=0.22
)
M_ATTIC = ak.make_pbr_mat(
    "CcaAtticGlass", attic_col, None,
    metallic=0.0, roughness=0.40, coat=0.0, emission=(0.14, 0.54, 0.46), emission_strength=0.22
)
M_BRASS = ak.make_pbr_mat("CcaBrass", color=(0.96, 0.78, 0.34), metallic=0.62, roughness=0.25)
M_FLUE = ak.make_pbr_mat("CcaFlue", color=(0.14, 0.11, 0.10), roughness=0.92)
M_LEAF = ak.make_pbr_mat("CcaLeaf", color=(0.24, 0.55, 0.18), roughness=0.48, double_sided=True)
M_LEAF_D = ak.make_pbr_mat("CcaLeafDeep", color=(0.18, 0.43, 0.15), roughness=0.50, double_sided=True)
M_ROSE = ak.make_pbr_mat("CcaRoseCoral", color=(0.92, 0.24, 0.34), roughness=0.42, double_sided=True)
M_MARIGOLD = ak.make_pbr_mat("CcaMarigold", color=(0.96, 0.68, 0.12), roughness=0.42, double_sided=True)
M_LAVENDER = ak.make_pbr_mat("CcaLavender", color=(0.62, 0.34, 0.86), roughness=0.42, double_sided=True)
M_LANTERN = ak.make_pbr_mat(
    "CcaLanternGlow", color=(0.98, 0.62, 0.16), roughness=0.38, emission=(0.95, 0.52, 0.08), emission_strength=0.60
)

MATS = [M_STONE, M_TRIM, M_STUCCO, M_WOOD, M_DOOR, M_ROOF, M_GLASS, M_ATTIC, M_BRASS, M_FLUE, M_LEAF, M_LEAF_D, M_ROSE, M_MARIGOLD, M_LAVENDER, M_LANTERN]
I_STONE, I_TRIM, I_STUCCO, I_WOOD, I_DOOR, I_ROOF, I_GLASS, I_ATTIC, I_BRASS, I_FLUE, I_LEAF, I_LEAF_D, I_ROSE, I_MARIGOLD, I_LAVENDER, I_LANTERN = range(len(MATS))

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
    ak.add_sphere(bm, c + n * 0.014, rad * 0.28, (1, 1, 0.7), 1, I_BRASS, smooth=True)
    for pi in range(5):
        pa = pi * math.tau / 5.0
        rd = u * math.cos(pa) + v * math.sin(pa)
        sd = -u * math.sin(pa) + v * math.cos(pa)
        f = bm.faces.new((
            bm.verts.new(c),
            bm.verts.new(c + rd * (rad * 0.60) + sd * (rad * 0.30) + n * 0.018),
            bm.verts.new(c + rd * rad + n * 0.010),
            bm.verts.new(c + rd * (rad * 0.60) - sd * (rad * 0.30) + n * 0.018),
        ))
        ak.paint_faces(bm, [f], pmat, smooth=True, uv_scale=1.0)


WALL_W = 4.92
WALL_D = 4.30
BASE_H = 0.44
EAVE_Z = 2.40
RIDGE_Z = 4.70

# 1. Stepped Sandy Cut-Stone Plinth + Door Threshold Stairs
ak.add_box(bm, (0.0, 0.0, BASE_H * 0.5), (WALL_W + 0.34, WALL_D + 0.34, BASE_H), I_STONE, bevel=0.03)
ak.add_box(bm, (0.0, 0.0, BASE_H + 0.02), (WALL_W + 0.42, WALL_D + 0.42, 0.07), I_STONE, bevel=0.02)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.28, 0.13), (2.15, 0.62, 0.26), I_STONE, bevel=0.025)
ak.add_box(bm, (0.0, -WALL_D * 0.5 - 0.15, 0.31), (1.84, 0.40, 0.16), I_STONE, bevel=0.02)

# 2. Seamless Peach-Cream Stucco Walls + Textured Limestone Quoin Blocks on ALL 4 Corners
add_seamless_pentagon_gable_body(WALL_W, WALL_D, BASE_H, EAVE_Z, RIDGE_Z - 0.10, I_STUCCO)
for sx in (-1, 1):
    for sy in (-1, 1):
        for qi in range(4):
            qz = BASE_H + 0.20 + qi * 0.39
            qw = 0.36 if qi % 2 == 0 else 0.28
            qd = 0.28 if qi % 2 == 0 else 0.34
            ak.add_box(
                bm,
                (sx * (WALL_W * 0.5 - 0.03), sy * (WALL_D * 0.5 - 0.03), qz),
                (qw, qd, 0.20),
                I_TRIM,
                bevel=0.015,
            )

# 3. Oak Door + Brass Rosette Backplates + Finialed Carriage Lanterns
ak.add_arched_door(bm, (0.0, -WALL_D * 0.5 - 0.02, BASE_H), 1.36, 1.96, 0.0, I_DOOR, I_TRIM, I_BRASS)
for hsx in (-0.14, 0.14):
    ak.add_cyl(
        bm,
        (hsx, -WALL_D * 0.5 - 0.04, BASE_H + 0.90),
        (hsx, -WALL_D * 0.5 - 0.06, BASE_H + 0.90),
        0.052, 0.045, 12, I_BRASS, smooth=True,
    )
for lsx in (-0.88, 0.88):
    lz = BASE_H + 1.15
    ak.add_wall_lantern(bm, (lsx, -WALL_D * 0.5 - 0.02, lz), 0.0, I_BRASS, I_LANTERN)
    # Brass lantern finial sphere crowning cap
    ak.add_sphere(bm, (lsx, -WALL_D * 0.5 - 0.24, lz + 0.065), 0.030, (1, 1, 1.25), 1, I_BRASS, smooth=True)

# 4. Textured Carved Limestone Portico Arch + Dense Layered Botanical & Saturated Floral Swag
PORT_Y = -WALL_D * 0.5 - 0.16
for sx in (-1, 1):
    ak.add_box(bm, (sx * 1.20, PORT_Y, BASE_H + 0.10), (0.36, 0.36, 0.20), I_TRIM, bevel=0.015)
    ak.add_box(bm, (sx * 1.20, PORT_Y, BASE_H + 0.72), (0.26, 0.28, 1.08), I_TRIM, bevel=0.015)
    ak.add_box(bm, (sx * 1.20, PORT_Y, BASE_H + 1.32), (0.36, 0.36, 0.14), I_TRIM, bevel=0.015)
ak.add_curved_arch_extrude(bm, 1.20, BASE_H + 1.36, 1.04, 0.34, 0.28, 18, I_TRIM, offset=(0.0, PORT_Y, 0.0))
# Subtle carved keystone crown
ak.add_box(bm, (0.0, PORT_Y - 0.02, BASE_H + 1.36 + 1.05), (0.28, 0.38, 0.32), I_TRIM, bevel=0.018)

# Continuous layered vine cord hugging portico arch AND cascading down upper pilasters
garland_pts = []
for gi in range(17):
    u = gi / 16.0
    ang = math.pi + 0.24 - u * (math.pi + 0.48)
    gx = math.cos(ang) * (1.28 if 0.0 <= ang <= math.pi else 1.24)
    gz = BASE_H + 1.36 + (math.sin(ang) * 1.12 if 0.0 <= ang <= math.pi else math.sin(ang) * 1.45)
    garland_pts.append((gx, PORT_Y - 0.06, gz))
ak.add_vine_climb(bm, garland_pts, 0.032, I_WOOD, I_LEAF, None, seed=528)

# Rich double-layer leaf swag & 19 vibrant cupped coastal blossoms anchored directly into garland spine
for gi in range(19):
    u = (gi + 0.3) / 18.6
    ang = math.pi + 0.20 - u * (math.pi + 0.40)
    gx = math.cos(ang) * (1.30 if 0.0 <= ang <= math.pi else 1.25)
    gz = BASE_H + 1.36 + (math.sin(ang) * 1.14 if 0.0 <= ang <= math.pi else math.sin(ang) * 1.40)
    out_n = Vector((math.cos(ang) * 0.45, -1.0, max(-0.2, math.sin(ang) * 0.45))).normalized()
    tangent = Vector((math.sin(ang), 0.0, -math.cos(ang))).normalized()
    # Two lush foliage sprays bracketing every flower so zero floating petals occur
    for ls in (-1, 1):
        fwd = (tangent * (ls * 0.72) + out_n * 0.45 + Vector((0, 0, -0.15))).normalized()
        ak.add_cambered_leaf(
            bm, (gx, PORT_Y - 0.08, gz), fwd, out_n,
            0.16, 0.105, I_LEAF_D if (gi + ls) % 2 else I_LEAF,
        )
    pmat = (I_ROSE, I_MARIGOLD, I_LAVENDER)[gi % 3]
    rad = 0.115 if gi % 2 == 0 else 0.095
    add_cupped_flower((gx, PORT_Y - 0.13, gz), (math.cos(ang) * 0.28, -1.0, math.sin(ang) * 0.32), rad, pmat)

# 5. Stained Glass Windows, Brimming Flowerbox & Lifted Sage-Aqua Oculus
ak.add_arched_window(
    bm, (-1.82, -WALL_D * 0.5 - 0.03, BASE_H + 0.94), 0.86, 1.18, 0.0,
    I_TRIM, I_GLASS, I_WOOD, cross_mullions=True, planter=True, flower_mat=I_ROSE, leaf_mat=I_LEAF
)
# Extra marquee blossoms & trailing foliage spilling from front planter box
for fx, fmat in [(-1.98, I_MARIGOLD), (-1.82, I_LAVENDER), (-1.66, I_ROSE)]:
    add_cupped_flower((fx, -WALL_D * 0.5 - 0.36, BASE_H + 0.48), (0.0, -0.85, 0.52), 0.082, fmat)
    ak.add_cambered_leaf(
        bm, (fx, -WALL_D * 0.5 - 0.32, BASE_H + 0.45),
        Vector((0.0, -0.70, -0.70)).normalized(), Vector((0, -1, 0.3)), 0.14, 0.09, I_LEAF_D,
    )

for wy in (-0.92, 0.92):
    ak.add_arched_window(bm, (WALL_W * 0.5 + 0.03, wy, BASE_H + 0.96), 0.94, 1.24, math.pi * 0.5, I_TRIM, I_GLASS, I_TRIM, cross_mullions=True)
    ak.add_arched_window(bm, (-WALL_W * 0.5 - 0.03, wy, BASE_H + 0.96), 0.94, 1.24, -math.pi * 0.5, I_TRIM, I_GLASS, I_TRIM, cross_mullions=True)
for rx in (-1.22, 1.22):
    ak.add_arched_window(bm, (rx, WALL_D * 0.5 + 0.03, BASE_H + 0.96), 0.94, 1.24, math.pi, I_TRIM, I_GLASS, I_TRIM, cross_mullions=True)

ak.add_round_window(bm, (0.0, -WALL_D * 0.5 - 0.04, 3.38), 0.43, 0.0, I_TRIM, I_ATTIC)
ak.add_round_window(bm, (0.0, WALL_D * 0.5 + 0.04, 3.38), 0.43, math.pi, I_TRIM, I_ATTIC)

# 6. Fuller Plinth-Rooted Corner Climbing Vine with Multi-Color Flower Sprays
ak.add_vine_climb(
    bm,
    [(-2.30, -WALL_D * 0.5 - 0.05, 0.46),
     (-2.38, -WALL_D * 0.5 - 0.07, 0.95),
     (-2.26, -WALL_D * 0.5 - 0.07, 1.48),
     (-2.36, -WALL_D * 0.5 - 0.07, 1.98),
     (-2.14, -WALL_D * 0.5 - 0.06, 2.46),
     (-1.82, -WALL_D * 0.5 - 0.06, 2.86)],
    0.038, I_WOOD, I_LEAF, I_ROSE, seed=529
)
for vx, vz, fmat in [(-2.34, 0.72, I_MARIGOLD), (-2.30, 1.26, I_ROSE), (-2.32, 1.82, I_LAVENDER), (-2.05, 2.52, I_ROSE)]:
    for k in range(4):
        ang = -0.6 + k * 0.78
        fwd = Vector((math.cos(ang) * 0.68, -0.35, math.sin(ang) * 0.52 + 0.34)).normalized()
        ak.add_cambered_leaf(bm, (vx, -WALL_D * 0.5 - 0.07, vz), fwd, Vector((0, -1, 0.25)), 0.15, 0.10, I_LEAF_D if k % 2 else I_LEAF)
    add_cupped_flower((vx + 0.04, -WALL_D * 0.5 - 0.13, vz + 0.04), (0.0, -1.0, 0.25), 0.085, fmat)

# 7. Bell-Eave (bell_flare=0.38) Terracotta Gable Roof + Ashlar Limestone Chimney
ak.add_tiled_gable_roof(
    bm,
    center_xy=(0.0, 0.0),
    ridge_span=4.82,
    eave_span=5.92,
    eave_z=EAVE_Z - 0.06,
    ridge_z=RIDGE_Z,
    roof_mat=I_ROOF,
    trim_mat=I_WOOD,
    ridge_mat=I_ROOF,
    ridge_along="Y",
    tile_rows=5,
    tile_cols=9,
    bell_flare=0.38,
    bargeboard_t=0.20,
)
ak.add_box(bm, (-1.12, 1.00, 3.98), (0.68, 0.68, 1.38), I_STONE, bevel=0.025)
ak.add_box(bm, (-1.12, 1.00, 4.70), (0.82, 0.82, 0.14), I_STONE, bevel=0.02)
ak.add_box(bm, (-1.12, 1.00, 4.78), (0.50, 0.50, 0.04), I_FLUE)

mesh = bpy.data.meshes.new("cottage-clay-annex")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("cottage-clay-annex", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "cottage-clay-annex", (6.15, 5.15, 4.85))
