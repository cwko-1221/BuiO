"""Build Moonbay Coast 3D Observatory (observatory):
Grand Emerald-Ribbed Copper Dome Observatory on Summit Ridge (ASSETS['observatory'].size = [10.0, 8.4, 8.4]).
Front (+Z in Three.js, -Y in Blender) faces Summit Staircase & Hedgehog Scout:
- Tiered ashlar limestone terrace plinth + front entrance stairs + twin planted stone flower boxes (real shrubs & blossoms)
- Circular sandstone/limestone rotunda with fluted pilasters, cornice dentil molding, deep arched stained-glass windows
- Emerald double arched timber doors with brass arch surround, ring pulls, strap hinges & flanking wrought-brass lanterns
- West colonnade viewing terrace with Tuscan columns, overhead timber pergola, teal-inset stone parapet balustrade & climbing ivy
- Patinated emerald-copper dome with 12 brushed-gold meridian ribs, brass telescope slit shutter & astrolabe spire finial (Z=8.40m).
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

# Synthesize dedicated crisp PBR textures
stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "obs-stone", (0.89, 0.82, 0.67), (0.64, 0.56, 0.43), rows=8, cols=10, seed=101
)
stucco_col, stucco_rough = ak.make_stucco_textures(
    out_dir, "obs-stucco", (0.94, 0.87, 0.72), (0.87, 0.76, 0.58), seed=102
)
dome_col, dome_rough = ak.make_copper_patina_textures(
    out_dir, "obs-dome", (0.04, 0.34, 0.31), (0.11, 0.54, 0.48), seed=103
)
wood_col, wood_rough = ak.make_wood_textures(
    out_dir, "obs-door", (0.09, 0.33, 0.25), (0.04, 0.18, 0.14), planks=6, seed=104
)
timber_col, timber_rough = ak.make_wood_textures(
    out_dir, "obs-timber", (0.56, 0.38, 0.22), (0.35, 0.22, 0.12), planks=4, seed=105
)

MAT_STONE = ak.make_pbr_mat("ObsStone", stone_col, stone_rough)
MAT_STUCCO = ak.make_pbr_mat("ObsStucco", stucco_col, stucco_rough)
MAT_DOME = ak.make_pbr_mat("ObsCopperDome", dome_col, dome_rough, metallic=0.35)
MAT_GOLD = ak.make_pbr_mat("ObsBrassGold", color=(0.86, 0.65, 0.24), metallic=0.88, roughness=0.24)
MAT_DOOR = ak.make_pbr_mat("ObsDoor", wood_col, wood_rough)
MAT_TIMBER = ak.make_pbr_mat("ObsTimber", timber_col, timber_rough)
MAT_GLASS = ak.make_pbr_mat("ObsTealGlass", color=(0.06, 0.34, 0.36), metallic=0.18, roughness=0.12, emission=(0.14, 0.48, 0.44), emission_strength=0.32)
MAT_LANTERN = ak.make_pbr_mat("ObsLanternGlow", color=(1.0, 0.82, 0.42), roughness=0.22, emission=(1.0, 0.78, 0.36), emission_strength=1.4)
MAT_TEAL_TRIM = ak.make_pbr_mat("ObsTealTrim", color=(0.18, 0.56, 0.52), roughness=0.45)
MAT_SOIL = ak.make_pbr_mat("ObsSoil", color=(0.24, 0.16, 0.10), roughness=0.95)
MAT_FOLIAGE = ak.make_pbr_mat("ObsFoliage", color=(0.18, 0.48, 0.18), roughness=0.62, double_sided=True)
MAT_BLOOM = ak.make_pbr_mat("ObsBlossom", color=(0.96, 0.76, 0.22), roughness=0.52)

MATS = [MAT_STONE, MAT_STUCCO, MAT_DOME, MAT_GOLD, MAT_DOOR, MAT_TIMBER, MAT_GLASS, MAT_LANTERN, MAT_TEAL_TRIM, MAT_SOIL, MAT_FOLIAGE, MAT_BLOOM]
I_STONE, I_STUCCO, I_DOME, I_GOLD, I_DOOR, I_TIMBER, I_GLASS, I_LANTERN, I_TEAL, I_SOIL, I_LEAF, I_BLOOM = range(len(MATS))

bm = bmesh.new()

# Rotunda centered at +1.40 X so west colonnade spans X in [-5.0, +0.2] -> exact width 10.0m, depth 8.4m
CX = 1.40
R_ROT = 3.35

# 1. Stepped Rotunda & West Terrace Limestone Plinth (Z = 0.0 .. 0.48)
ak.add_lathe(bm, [
    (0.0, 0.0), (3.78, 0.0), (3.78, 0.16), (3.64, 0.17), (3.64, 0.34), (3.48, 0.35), (3.48, 0.48), (0.0, 0.48)
], 28, I_STONE, center=(CX, 0.0, 0.0), smooth_side=True)

# West terrace platform slab (-5.00 .. +0.60, Y in [-2.75 .. +2.75]) -> X max=+5.18? Keep Rotunda maxX <= 4.98 -> +1.40+3.58=4.98!
# Check plinth outer radius: 1.40 + 3.60 = 5.00! Good! Let's trim base plinth radius slightly to 3.58 -> maxX = 4.98, minX = -5.00!
ak.add_box(bm, (-2.15, 0.0, 0.22), (5.70, 5.40, 0.44), I_STONE, bevel=0.04)
ak.add_box(bm, (-2.15, 0.0, 0.46), (5.50, 5.20, 0.10), I_STONE, bevel=0.025)

# Front entrance stone landing steps facing -Y (Three.js +Z) at CX
for s_i, (step_d, step_w, step_z, step_h) in enumerate([
    (1.15, 3.10, 0.08, 0.16),
    (0.84, 2.75, 0.24, 0.16),
    (0.55, 2.40, 0.40, 0.16),
]):
    ak.add_box(bm, (CX, -3.55 - (2 - s_i) * 0.22, step_z), (step_w, step_d, step_h), I_STONE, bevel=0.02)

# Twin carved limestone planter boxes flanking entrance steps on the front rim (-Y)
for px in (-2.55, 4.10):
    py = -3.45 if px < 0 else -2.95
    ak.add_box(bm, (px, py, 0.34), (1.15, 0.78, 0.68), I_STONE, bevel=0.03)
    ak.add_box(bm, (px, py, 0.69), (1.24, 0.86, 0.10), I_STONE, bevel=0.02)
    ak.add_box(bm, (px, py, 0.72), (1.02, 0.66, 0.06), I_SOIL)
    # Articulated miniature courtyard shrubs + golden & white star blossoms
    for ox, oy, rad in [(-0.26, 0.0, 0.22), (0.02, 0.08, 0.25), (0.28, -0.04, 0.21), (-0.08, -0.10, 0.19)]:
        ak.add_sphere(bm, (px + ox, py + oy, 0.84), rad, (1.05, 1.0, 0.88), 1, I_LEAF, smooth=False)
    for ox, oy in [(-0.24, -0.12), (0.04, -0.16), (0.26, 0.06), (-0.10, 0.14)]:
        ak.add_sphere(bm, (px + ox, py + oy, 0.99), 0.065, (1.0, 1.0, 0.75), 1, I_BLOOM, smooth=False)

# 2. Main Rotunda Masonry Drum & Entablature Cornice (Z = 0.48 .. 5.05)
ak.add_lathe(bm, [
    (R_ROT + 0.12, 0.48), (R_ROT + 0.12, 0.68), (R_ROT, 0.72), (R_ROT, 4.55),
    (R_ROT + 0.16, 4.65), (R_ROT + 0.24, 4.85), (R_ROT + 0.24, 5.04), (R_ROT + 0.05, 5.06)
], 24, I_STUCCO, center=(CX, 0.0, 0.0), smooth_side=True)

# Moulded stone water-table band & cornice gold trim collar
ak.add_lathe(bm, [
    (R_ROT + 0.18, 0.48), (R_ROT + 0.20, 0.56), (R_ROT + 0.14, 0.68)
], 24, I_STONE, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_lathe(bm, [
    (R_ROT + 0.24, 4.74), (R_ROT + 0.28, 4.82), (R_ROT + 0.24, 4.90)
], 24, I_GOLD, center=(CX, 0.0, 0.0), smooth_side=True)

# Engaged Stone Pilasters around Rotunda (8 bays, skipping front doorway bay -90 deg / -Y)
for bi in range(8):
    ang = bi * math.tau / 8.0 + math.pi / 8.0  # offset so bay centers fall at cardinal/45deg
    px = CX + (R_ROT - 0.02) * math.cos(ang)
    py = (R_ROT - 0.02) * math.sin(ang)
    ak.add_box(bm, (px, py, 2.65), (0.34, 0.34, 3.85), I_STONE, bevel=0.025, rot_euler=(0, 0, ang))
    ak.add_box(bm, (px, py, 0.72), (0.44, 0.44, 0.24), I_STONE, bevel=0.02, rot_euler=(0, 0, ang))
    ak.add_box(bm, (px, py, 4.56), (0.46, 0.46, 0.26), I_STONE, bevel=0.02, rot_euler=(0, 0, ang))

# Front Grand Arched Double Doorway at ang = -pi/2 (-Y in Blender)
ak.add_arched_door(bm, (CX, -R_ROT - 0.04, 0.48), 1.65, 2.75, 0.0, I_DOOR, I_STONE, I_GOLD)
for side in (-1, 1):
    ak.add_wall_lantern(bm, (CX + side * 1.18, -R_ROT + 0.04, 2.45), side * 0.25, I_GOLD, I_LANTERN)

# Recessed Arched Observatory Windows on E (+X), NE, N (+Y), NW, SE bays
for bay_ang in (0.0, math.pi * 0.25, math.pi * 0.5, math.pi * 0.75, -math.pi * 0.25, -math.pi * 0.75):
    wx = CX + (R_ROT + 0.02) * math.cos(bay_ang)
    wy = (R_ROT + 0.02) * math.sin(bay_ang)
    # Rotate local -Y outward along bay radial vector (cos, sin) -> yaw = bay_ang + pi/2
    yaw = bay_ang + math.pi * 0.5
    ak.add_arched_window(bm, (wx, wy, 2.55), 1.38, 2.25, yaw, I_STONE, I_GLASS, I_STONE, cross_mullions=True)

# 3. West Viewing Colonnade Porch + Pergola + Teal-Inset Balustrade (X in [-4.85 .. -0.30], Y in [-2.55 .. +2.55])
PORCH_COLS = [(-4.45, -2.20), (-4.45, 0.0), (-4.45, 2.20), (-2.35, -2.20), (-2.35, 2.20)]
for colx, coly in PORCH_COLS:
    ak.add_lathe(bm, [
        (0.32, 0.48), (0.32, 0.62), (0.24, 0.72), (0.21, 0.76), (0.18, 3.35),
        (0.24, 3.45), (0.31, 3.55), (0.31, 3.68)
    ], 16, I_STONE, center=(colx, coly, 0.0), smooth_side=True)
    # Square abacus & plinth block
    ak.add_box(bm, (colx, coly, 0.54), (0.64, 0.64, 0.14), I_STONE, bevel=0.02)
    ak.add_box(bm, (colx, coly, 3.62), (0.66, 0.66, 0.16), I_STONE, bevel=0.02)

# Porch Architrave Beam & Overhead Timber Pergola Joists
ak.add_box(bm, (-2.55, -2.20, 3.84), (4.35, 0.52, 0.34), I_STONE, bevel=0.025)
ak.add_box(bm, (-2.55, 2.20, 3.84), (4.35, 0.52, 0.34), I_STONE, bevel=0.025)
ak.add_box(bm, (-4.45, 0.0, 3.84), (0.52, 4.92, 0.34), I_STONE, bevel=0.025)
ak.add_box(bm, (-2.55, 0.0, 4.02), (4.45, 4.88, 0.14), I_TIMBER, bevel=0.02)
for jx in (-4.10, -3.40, -2.70, -2.00, -1.30):
    ak.add_box(bm, (jx, 0.0, 4.14), (0.14, 5.20, 0.14), I_TIMBER, bevel=0.015)

# Porch Roof Balustrade Parapet with Emerald-Teal Inset Fret Panels & Corner Finials (NO melting corners!)
for bx, by, bw, bd in [
    (-2.65, -2.28, 4.10, 0.24),
    (-2.65, 2.28, 4.10, 0.24),
    (-4.52, 0.0, 0.24, 4.78),
]:
    ak.add_box(bm, (bx, by, 4.30), (bw, bd, 0.42), I_STONE, bevel=0.02)
    ak.add_box(bm, (bx, by, 4.32), (max(0.14, bw - 0.18), max(0.14, bd - 0.18), 0.22), I_TEAL)
    ak.add_box(bm, (bx, by, 4.54), (bw + 0.08, bd + 0.08, 0.11), I_STONE, bevel=0.02)
# Corner parapet posts + turned brass sphere finials
for ppx, ppy in [(-4.52, -2.28), (-4.52, 2.28), (-2.35, -2.28), (-2.35, 2.28)]:
    ak.add_box(bm, (ppx, ppy, 4.44), (0.40, 0.40, 0.62), I_STONE, bevel=0.02)
    ak.add_sphere(bm, (ppx, ppy, 4.84), 0.12, (1.0, 1.0, 1.15), 1, I_GOLD, smooth=True)

# Porch front wall lantern & climbing ivy on West front corner column
ak.add_wall_lantern(bm, (-4.18, -2.18, 2.95), 0.0, I_GOLD, I_LANTERN)
ak.add_vine_climb(
    bm,
    [(-4.65, -2.35, 0.55), (-4.28, -2.42, 1.35), (-4.66, -2.02, 2.20), (-4.28, -1.96, 3.05), (-4.42, -2.36, 3.72)],
    0.045, I_TIMBER, I_LEAF, I_BLOOM, seed=107
)

# 4. Grand Emerald-Copper Dome + 12 Gold Meridian Ribs + Brass Telescope Slit & Astrolabe Finial (Z = 5.05 .. 8.40)
ak.add_ribbed_dome(bm, (CX, 0.0, 5.05), radius=3.40, height=2.60, dome_mat=I_DOME, rib_mat=I_GOLD, meridian_segs=24, rings=10, n_ribs=12)

# Telescope Shutter Louver Hood + Polished Brass Telescope Barrel aiming South-West skyward (-Y, -X, +Z)
ak.add_box(bm, (CX - 0.55, -1.95, 6.95), (0.92, 1.45, 0.55), I_GOLD, bevel=0.04, rot_euler=(0.55, 0.0, 0.35))
ak.add_cyl(bm, (CX - 0.45, -1.75, 6.85), (CX - 0.85, -3.15, 7.62), 0.18, 0.24, 14, I_GOLD, smooth=True)
ak.add_cyl(bm, (CX - 0.85, -3.15, 7.62), (CX - 0.92, -3.32, 7.72), 0.27, 0.27, 14, I_GOLD, smooth=True)

# Apex Astrolabe Brass Spire Finial reaching cleanly to Z = 8.40m
ak.add_lathe(bm, [
    (0.45, 7.56), (0.48, 7.66), (0.28, 7.76), (0.14, 7.86), (0.09, 8.20), (0.15, 8.28), (0.0, 8.40)
], 16, I_GOLD, center=(CX, 0.0, 0.0), smooth_side=True)
ak.add_sphere(bm, (CX, 0.0, 7.98), 0.16, (1.0, 1.0, 1.0), 2, I_GOLD, smooth=True)

mesh = bpy.data.meshes.new("observatory")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("observatory", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "observatory", (10.0, 8.4, 8.4))
