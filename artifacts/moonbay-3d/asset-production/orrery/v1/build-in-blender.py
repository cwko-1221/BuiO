"""Build Moonbay Coast 3D Celestial Armillary Orrery (orrery):
Matches ASSETS['orrery'].size = [3.2, 3.0, 4.1].
Features:
- 3-tier beveled circular limestone dais with inlaid zodiac brass ring on top deck
- Turned fluted bronze & limestone pedestal pillar with 4 scroll support brackets
- Precision multi-axis beveled brass armillary gimbal rings (horizon, meridian, ecliptic, orbital paths)
- Brushed-gold Sun orb centerpiece + 4 distinct painted celestial planets (cerulean ocean world, ringed Saturn, terracotta, jade) + star finial (Z=4.10m).
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

stone_col, stone_rough = ak.make_stone_textures(
    out_dir, "orrery-stone", (0.89, 0.80, 0.62), (0.64, 0.55, 0.40), rows=6, cols=10, seed=201
)
gold_col, gold_rough = ak.make_copper_patina_textures(
    out_dir, "orrery-bronze", (0.58, 0.40, 0.14), (0.90, 0.68, 0.25), seed=202
)

MAT_STONE = ak.make_pbr_mat("OrreryStone", stone_col, stone_rough)
MAT_GOLD = ak.make_pbr_mat("OrreryGold", gold_col, gold_rough, metallic=0.88)
MAT_BRONZE = ak.make_pbr_mat("OrreryBronze", color=(0.46, 0.27, 0.12), metallic=0.78, roughness=0.34)
MAT_SUN = ak.make_pbr_mat("OrrerySun", color=(0.98, 0.74, 0.20), metallic=0.65, roughness=0.22, emission=(0.98, 0.68, 0.16), emission_strength=0.45)
MAT_OCEAN = ak.make_pbr_mat("OrreryOceanPlanet", color=(0.16, 0.54, 0.84), metallic=0.10, roughness=0.30)
MAT_AMBER = ak.make_pbr_mat("OrreryAmberPlanet", color=(0.88, 0.44, 0.24), metallic=0.05, roughness=0.42)
MAT_JADE = ak.make_pbr_mat("OrreryJadePlanet", color=(0.24, 0.68, 0.56), metallic=0.08, roughness=0.34)
MAT_RING = ak.make_pbr_mat("OrrerySaturnRing", color=(0.94, 0.85, 0.64), metallic=0.45, roughness=0.32)

MATS = [MAT_STONE, MAT_GOLD, MAT_BRONZE, MAT_SUN, MAT_OCEAN, MAT_AMBER, MAT_JADE, MAT_RING]
I_STONE, I_GOLD, I_BRONZE, I_SUN, I_OCEAN, I_AMBER, I_JADE, I_RING = range(len(MATS))

bm = bmesh.new()


def add_beveled_ring(center, radius: float, tube_w: float, tube_h: float, euler_rot, mat_idx: int, segs: int = 36):
    """Crisp extruded rectangular beveled ring at arbitrary 3D orientation."""
    rot = Euler(euler_rot, "XYZ").to_matrix().to_4x4()
    org = Vector(center)
    uv_layer, col_layer = ak.ensure_uv_and_col(bm)
    rings = []
    hw, hh = tube_w * 0.5, tube_h * 0.5
    profile = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    for i in range(segs):
        th = math.tau * i / segs
        c, s = math.cos(th), math.sin(th)
        r_verts = []
        for dw, dh in profile:
            local = Vector(((radius + dw) * c, (radius + dw) * s, dh))
            r_verts.append(bm.verts.new(org + (rot @ local)))
        rings.append(r_verts)
    faces = []
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        for k in range(4):
            kn = (k + 1) % 4
            f = bm.faces.new((a[k], b[k], b[kn], a[kn]))
            f.material_index = mat_idx
            f.smooth = False
            faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    ak.assign_box_uvs(bm, 0.6, faces)


# 1. 3-Step Circular Sandstone/Limestone Dais (max radius = 1.50 -> diameter <= 3.0m)
ak.add_lathe(bm, [
    (0.0, 0.0), (1.48, 0.0), (1.48, 0.21), (1.26, 0.22), (1.26, 0.43),
    (1.04, 0.44), (1.04, 0.64), (0.0, 0.64)
], 28, I_STONE, smooth_side=True)

# Brass compass inlay ring & 8 degree tick medallions on top of dais
add_beveled_ring((0, 0, 0.65), 0.88, 0.07, 0.025, (0, 0, 0), I_GOLD, segs=28)

# 2. Central Pedestal Pillar + 4 Bronze Scroll Buttress Brackets (Z = 0.64 .. 2.05)
ak.add_lathe(bm, [
    (0.56, 0.64), (0.56, 0.74), (0.42, 0.84), (0.36, 1.05),
    (0.28, 1.65), (0.34, 1.88), (0.44, 1.98), (0.44, 2.08), (0.0, 2.08)
], 20, I_BRONZE, smooth_side=True)
ak.add_lathe(bm, [
    (0.45, 0.80), (0.48, 0.85), (0.45, 0.90),
    (0.37, 1.86), (0.40, 1.92), (0.37, 1.97)
], 20, I_GOLD, smooth_side=True)

# 4 angled bronze cradle arms holding the lower meridian ring
for k in range(4):
    ang = k * math.pi * 0.5 + math.pi * 0.25
    ca, sa = math.cos(ang), math.sin(ang)
    ak.add_cyl(bm, (0.32 * ca, 0.32 * sa, 1.72), (1.02 * ca, 1.02 * sa, 2.15), 0.065, 0.050, 8, I_GOLD, smooth=True)
    ak.add_sphere(bm, (1.02 * ca, 1.02 * sa, 2.15), 0.085, (1, 1, 1), 1, I_GOLD, smooth=True)

# 3. Celestial Armillary Rings & Central Brass Spindle (center at Z = 2.86, radius ~1.46 -> bounds X/Y <= 1.50, Z <= 4.10)
CZ = 2.86
# Central brass spindle rising to top finial at Z = 4.10
ak.add_cyl(bm, (0, 0, 2.05), (0, 0, 3.88), 0.055, 0.042, 12, I_GOLD, smooth=True)
ak.add_lathe(bm, [
    (0.08, 3.84), (0.12, 3.90), (0.05, 3.96), (0.02, 4.08), (0.0, 4.10)
], 12, I_GOLD, smooth_side=True)

# Fixed Horizon Ring (wide flat engraved band, Z = 2.52, r = 1.48 -> X spans -1.58..+1.58! Wait: assets size = [3.2, 3.0, 4.1], keep r_x <= 1.54, r_y <= 1.44 -> r = 1.40!)
add_beveled_ring((0, 0, CZ), 1.42, 0.12, 0.065, (0.04, 0.0, 0.0), I_GOLD, segs=36)
for ti in range(12):
    ang = ti * math.tau / 12.0
    ak.add_sphere(bm, (1.42 * math.cos(ang), 1.42 * math.sin(ang), CZ + 0.04), 0.045, (1, 1, 0.6), 1, I_BRONZE, smooth=True)

# Tilted Meridian & Ecliptic Gimbal Rings (keep vertical radius <= 1.18 so maxZ <= 4.08 and maxY <= 1.46!)
add_beveled_ring((0, 0, CZ), 1.16, 0.065, 0.065, (math.pi * 0.5, 0.0, 0.22), I_GOLD, segs=32)
add_beveled_ring((0, 0, CZ), 1.24, 0.075, 0.050, (0.42, 0.28, 0.15), I_GOLD, segs=32)
add_beveled_ring((0, 0, CZ), 0.96, 0.055, 0.045, (-0.36, 0.45, -0.30), I_GOLD, segs=28)
add_beveled_ring((0, 0, CZ), 0.72, 0.045, 0.040, (0.28, -0.50, 0.65), I_BRONZE, segs=24)

# 4. Sun Sphere & 4 Articulated Orbiting Planets on Radial Brass Arms
ak.add_sphere(bm, (0, 0, CZ), 0.30, (1, 1, 1), 2, I_SUN, smooth=True)
# Decorative solar collar ring
add_beveled_ring((0, 0, CZ), 0.38, 0.025, 0.02, (0.18, -0.14, 0), I_GOLD, segs=20)

planets = [
    # (px, py, pz, radius, mat_idx, has_ring, ring_rot)
    (1.06, -0.68, CZ + 0.36, 0.19, I_OCEAN, False, None),
    (-0.98, 0.52, CZ + 0.28, 0.22, I_AMBER, True, (0.35, -0.25, 0.1)),
    (-0.52, -0.78, CZ - 0.18, 0.15, I_JADE, False, None),
    (0.66, 0.84, CZ - 0.12, 0.14, I_GOLD, False, None),
]
for px, py, pz, rad, pmat, has_ring, rrot in planets:
    ak.add_cyl(bm, (0, 0, CZ), (px, py, pz), 0.024, 0.020, 8, I_GOLD, smooth=True)
    ak.add_sphere(bm, (px, py, pz), rad, (1, 1, 1), 2, pmat, smooth=True)
    if has_ring:
        add_beveled_ring((px, py, pz), rad * 1.68, rad * 0.55, 0.024, rrot, I_RING, segs=24)

mesh = bpy.data.meshes.new("orrery")
bm.to_mesh(mesh)
bm.free()
for m in MATS:
    mesh.materials.append(m)

obj = bpy.data.objects.new("orrery", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

ak.export_glb([obj], out_dir, "orrery", (3.2, 3.0, 4.1))
