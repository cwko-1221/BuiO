"""Build the Moonbay Market Stall v2: properly pitched rafters under draped canvas, slatted cedar counter, and produce crates."""
import math
import random
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(20261124)

def srgb_to_linear(c):
    return tuple(v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def make_packed_image(name, w, h, rgba_array):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img

# 1. Procedural wood grain texture (warm coastal cedar + plank grain streaks)
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX
grain = (
    0.5 * np.sin(v * 95.0 + 1.9 * np.sin(u * 14.0 + v * 6.0))
    + 0.3 * np.sin(v * 230.0 + 0.8 * np.cos(u * 26.0))
    + 0.2 * np.sin(u * 19.0 + v * 11.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.92 + 0.08 * grain, 0.78, 1.06)
wood_rgba[..., 0] = np.clip(0.56 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.32 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.16 * tone, 0, 1)
wood_img = make_packed_image("stall-wood", W_TX, H_TX, wood_rgba)

# 2. Procedural woven striped canvas texture (7 stripe bays matching the 7 scallops)
weave = 0.032 * np.sin(xx * 1.45) * np.sin(yy * 1.45) + 0.018 * np.sin(xx * 0.45 + yy * 0.35)
stripe_phase = (u * 7.0) % 2.0
is_teal = stripe_phase < 1.0
seam = np.exp(-((np.minimum(stripe_phase % 1.0, 1.0 - (stripe_phase % 1.0))) * 26.0) ** 2)
hem = np.exp(-((np.maximum(0.0, 0.10 - v) / 0.10) ** 2))
canvas_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
teal_rgb = np.array([0.145, 0.565, 0.495], dtype=np.float32)
cream_rgb = np.array([0.925, 0.845, 0.655], dtype=np.float32)
for c in range(3):
    base = np.where(is_teal, teal_rgb[c], cream_rgb[c])
    base = np.where(v < 0.065, cream_rgb[c] * 0.96, base)
    shaded = base * (1.0 + weave - 0.10 * seam - 0.07 * hem)
    canvas_rgba[..., c] = np.clip(shaded, 0.0, 1.0)
canvas_img = make_packed_image("stall-canvas", W_TX, W_TX, canvas_rgba)

def make_tex_mat(name, image, rough, metal=0.0, use_vcol=True):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-460, 260)
    if use_vcol:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Tint"
        vc.location = (-460, 30)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.location = (-210, 180)
        nt.links.new(tex.outputs["Color"], mix.inputs["A"])
        nt.links.new(vc.outputs["Color"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

def make_vcol_mat(name, rough, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-280, 220)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

MAT_WOOD = make_tex_mat("Cedar timber", wood_img, 0.78, 0.0, use_vcol=True)
MAT_CANVAS = make_tex_mat("Striped awning canvas", canvas_img, 0.88, 0.0, use_vcol=False)
MAT_STONE = make_vcol_mat("Limestone plinth foot", 0.86, 0.0)
MAT_BRASS = make_vcol_mat("Aged brass hardware", 0.38, 0.65)
MAT_PRODUCE = make_vcol_mat("Waxed fruit & botanicals", 0.48, 0.0)
MAT_MATTE = make_vcol_mat("Chalkboard & wicker", 0.90, 0.0)
MATERIALS = [MAT_WOOD, MAT_CANVAS, MAT_STONE, MAT_BRASS, MAT_PRODUCE, MAT_MATTE]

class Builder:
    def __init__(self):
        self.verts, self.faces, self.slots, self.smooth, self.vcols = [], [], [], [], []
        self.face_uvs = {}

    def add_mesh(self, verts, faces, slot, color=(1, 1, 1), smooth=False, uvs=None):
        base = len(self.verts)
        lin = srgb_to_linear(color)
        for p in verts:
            self.verts.append(tuple(p))
            self.vcols.append((*lin, 1.0))
        for idx, f in enumerate(faces):
            fi = len(self.faces)
            self.faces.append(tuple(base + i for i in f))
            self.slots.append(slot)
            self.smooth.append(smooth)
            if uvs is not None:
                self.face_uvs[fi] = uvs[idx]

    def box(self, cx, cy, cz, sx, sy, sz, slot, color=(1, 1, 1), bevel=0.012, rot=(0, 0, 0), smooth=False):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
        ins = min(bevel, sx * 0.2, sy * 0.2, sz * 0.2)
        if ins > 0.0015:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=ins, segments=2, affect="EDGES")
        bm.verts.index_update()
        mat = Euler(rot).to_matrix()
        p = Vector((cx, cy, cz))
        verts = [mat @ v.co + p for v in bm.verts]
        faces = [tuple(v.index for v in f.verts) for f in bm.faces]
        bm.free()
        self.add_mesh(verts, faces, slot, color, smooth)

    def beam_between(self, p0, p1, w, h, slot, color=(1, 1, 1), bevel=0.006):
        a, c = Vector(p0), Vector(p1)
        mid = (a + c) * 0.5
        d = c - a
        length = d.length
        pitch = math.atan2(d.z, math.hypot(d.x, d.y))
        yaw = math.atan2(-d.x, d.y)
        self.box(mid.x, mid.y, mid.z, w, length, h, slot, color, bevel=bevel, rot=(pitch, 0, yaw))

    def lathe(self, cx, cy, z0, profile, sides, slot, color=(1, 1, 1), smooth=True):
        rings = []
        for r, dz in profile:
            row = []
            for i in range(sides):
                a = i * math.tau / sides
                row.append((cx + r * math.cos(a), cy + r * math.sin(a), z0 + dz))
            rings.append(row)
        verts = [p for row in rings for p in row]
        faces = [tuple(reversed(range(sides)))]
        for k in range(len(rings) - 1):
            a0, b0 = k * sides, (k + 1) * sides
            for i in range(sides):
                j = (i + 1) % sides
                faces.append((a0 + i, a0 + j, b0 + j, b0 + i))
        last = (len(rings) - 1) * sides
        faces.append(tuple(last + i for i in range(sides)))
        self.add_mesh(verts, faces, slot, color, smooth)

    def add_fruit(self, cx, cy, cz, rx, ry, rz, kind, color):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in bm.verts:
            x, y, z = v.co.x, v.co.y, v.co.z
            if kind == "pear":
                taper = 1.0 - 0.34 * max(0.0, z)
                v.co = Vector((x * rx * taper, y * ry * taper, z * rz * 1.18))
            elif kind == "apple":
                dimple = 1.0 - 0.16 * max(0.0, abs(z) - 0.72) / 0.28
                v.co = Vector((x * rx * dimple, y * ry * dimple, z * rz * (0.94 if abs(z) > 0.7 else 1.0)))
            else:
                rib = 1.0 + 0.03 * math.cos(math.atan2(y, x) * 6.0)
                v.co = Vector((x * rx * rib, y * ry * rib, z * rz * 0.88))
        bm.verts.index_update()
        rot = Euler((rng.uniform(-0.22, 0.22), rng.uniform(-0.22, 0.22), rng.uniform(0, math.tau))).to_matrix()
        p = Vector((cx, cy, cz))
        verts = [rot @ v.co + p for v in bm.verts]
        faces = [tuple(v.index for v in f.verts) for f in bm.faces]
        bm.free()
        self.add_mesh(verts, faces, 4, color, True)
        top = rot @ Vector((0, 0, rz * 0.88)) + p
        self.box(top.x, top.y, top.z + 0.012, 0.012, 0.012, 0.032, 0, (0.34, 0.20, 0.09), bevel=0.003)
        self.box(top.x + 0.018, top.y - 0.008, top.z + 0.02, 0.036, 0.018, 0.006, 4, (0.24, 0.56, 0.17), bevel=0.002, rot=(0.2, -0.3, rng.uniform(0, 3)))

    def add_leaf_bundle(self, cx, cy, cz, color):
        for i in range(6):
            a = i * math.tau / 6 + rng.uniform(-0.15, 0.15)
            self.box(
                cx + math.cos(a) * 0.035, cy + math.sin(a) * 0.035, cz + 0.025 + (i % 2) * 0.018,
                0.068, 0.038, 0.012, 4, (color[0] * (0.9 + 0.04 * (i % 3)), color[1], color[2]),
                bevel=0.004, rot=(0.35 * math.sin(a), -0.35 * math.cos(a), a), smooth=True,
            )

b = Builder()
POST_X = 1.29
FRONT_Y = -0.64
REAR_Y = 0.60

# 1. Corner posts seated on limestone damp shoes with brass collars & turned finials under/at awning eaves
# Roof slope height helper: at y=+0.83 z=2.36, at y=-0.83 z=1.99
def roof_z(x, y):
    t = (0.83 - y) / 1.66
    base_z = 2.36 - 0.37 * t
    rafter_xs = (-1.32, -0.66, 0.0, 0.66, 1.32)
    nearest_d = min(abs(x - rx) for rx in rafter_xs)
    sag = -0.016 * math.sin(min(1.0, nearest_d / 0.33) * math.pi * 0.5) ** 2
    return base_z + sag

for px in (-POST_X, POST_X):
    # Front post stops cleanly at underside of front tie beam (z=1.94), rear stops at rear header (z=2.24)
    # Plus subtle brass post caps slightly peeking up to Z=2.43 peak height at rear eaves
    for py, beam_z, cap_top in ((FRONT_Y, 1.94, 2.02), (REAR_Y, 2.24, 2.43)):
        b.box(px, py, 0.045, 0.125, 0.125, 0.09, 2, (0.82, 0.72, 0.56), bevel=0.015)
        b.box(px, py, 0.105, 0.104, 0.104, 0.035, 3, (0.58, 0.42, 0.19), bevel=0.006)
        b.box(px, py, (0.12 + beam_z) * 0.5, 0.088, 0.088, beam_z - 0.12, 0, (0.88, 0.78, 0.68), bevel=0.012)
        if py > 0:
            # Rear crest finial sits just behind canvas rear edge at y=0.81 or post top? Keep inside canvas footprint or proud on corners
            b.lathe(px, py, 2.35, [
                (0.042, 0.0), (0.048, 0.018), (0.028, 0.038), (0.038, 0.058), (0.008, 0.08),
            ], 14, 3, (0.68, 0.49, 0.21))
            # Brass collar around finial base emerging from canvas grommet
            b.box(px, py, 2.34, 0.11, 0.11, 0.024, 3, (0.58, 0.42, 0.19), bevel=0.006)

# 2. Lower stall cabinet with slatted cedar planks on ALL 4 sides + lower open storage shelf & wicker crates
for z_rail in (0.24, 0.86):
    b.box(0, FRONT_Y, z_rail, 2.52, 0.07, 0.065, 0, (0.82, 0.72, 0.64), bevel=0.008)
    b.box(0, REAR_Y, z_rail, 2.52, 0.07, 0.065, 0, (0.82, 0.72, 0.64), bevel=0.008)
    for sx in (-POST_X, POST_X):
        b.box(sx, (FRONT_Y + REAR_Y) * 0.5, z_rail, 0.07, 1.18, 0.065, 0, (0.82, 0.72, 0.64), bevel=0.008)

b.box(0, (FRONT_Y + REAR_Y) * 0.5, 0.255, 2.46, 1.12, 0.035, 0, (0.76, 0.66, 0.58), bevel=0.006)
for cx in (-0.65, 0.65):
    b.box(cx, -0.02, 0.37, 0.68, 0.56, 0.20, 5, (0.72, 0.56, 0.34), bevel=0.012)
    b.box(cx, -0.02, 0.47, 0.71, 0.59, 0.028, 0, (0.85, 0.72, 0.56), bevel=0.006)

for i in range(16):
    sx = -1.22 + (i + 0.5) * (2.44 / 16)
    tone = 0.86 + (i % 3) * 0.06
    b.box(sx, FRONT_Y - 0.008, 0.66, 2.44 / 16 - 0.012, 0.032, 0.39, 0, (tone, tone * 0.92, tone * 0.84), bevel=0.005)
    b.box(sx, REAR_Y + 0.008, 0.66, 2.44 / 16 - 0.012, 0.032, 0.39, 0, (tone * 0.95, tone * 0.88, tone * 0.80), bevel=0.005)

for sx in (-POST_X - 0.006, POST_X + 0.006):
    for i in range(8):
        sy = FRONT_Y + 0.05 + (i + 0.5) * (1.14 / 8)
        tone = 0.84 + (i % 3) * 0.06
        b.box(sx, sy, 0.66, 0.032, 1.14 / 8 - 0.012, 0.39, 0, (tone, tone * 0.92, tone * 0.84), bevel=0.005)

# Teal painted decorative fascia + brass corner rivets flush in front of apron
b.box(0, FRONT_Y - 0.024, 0.865, 2.48, 0.028, 0.062, 5, (0.14, 0.55, 0.49), bevel=0.006)
b.box(0, REAR_Y + 0.024, 0.865, 2.48, 0.028, 0.062, 5, (0.14, 0.55, 0.49), bevel=0.006)

# 3. Planked Honey-Oak Countertop (z = 0.89..0.96)
plank_d = 1.48 / 5
for i in range(5):
    py = -0.76 + (i + 0.5) * plank_d
    tone = 1.02 + (i % 2) * 0.07
    b.box(0, py, 0.925, 2.82, plank_d - 0.010, 0.055, 0, (tone, tone * 0.95, tone * 0.88), bevel=0.008)
b.box(0, -0.785, 0.922, 2.86, 0.045, 0.062, 0, (0.94, 0.84, 0.72), bevel=0.008)
for cx in (-0.92, 0.0, 0.92):
    b.box(cx, FRONT_Y - 0.075, 0.855, 0.055, 0.12, 0.085, 0, (0.85, 0.74, 0.62), bevel=0.01, rot=(0.35, 0, 0))

# 4. Upper Awning Framing & Rafters — strictly aligned BELOW canvas underside
b.box(0, FRONT_Y, 1.94, 2.74, 0.065, 0.065, 0, (0.86, 0.76, 0.66), bevel=0.008)
b.box(0, REAR_Y, 2.24, 2.74, 0.065, 0.065, 0, (0.86, 0.76, 0.66), bevel=0.008)
for sx in (-POST_X, POST_X):
    # Side eave beam connecting front header (y=-0.64, z=1.94) to rear header (y=+0.60, z=2.24)
    b.beam_between((sx, FRONT_Y - 0.08, 1.92), (sx, REAR_Y + 0.08, 2.26), 0.058, 0.058, 0, (0.86, 0.76, 0.66))
    # Clean diagonal braces strictly below side header (no roof penetration!)
    b.beam_between((sx, FRONT_Y, 1.66), (sx, FRONT_Y + 0.28, 1.99), 0.044, 0.044, 0, (0.82, 0.71, 0.60))
    b.beam_between((sx, REAR_Y, 1.96), (sx, REAR_Y - 0.28, 2.15), 0.044, 0.044, 0, (0.82, 0.71, 0.60))

# 5 wooden rafters sitting directly underneath the canvas slope (z offset -0.044 below roof_z!)
for rx in (-1.32, -0.66, 0.0, 0.66, 1.32):
    z_f = roof_z(rx, -0.78) - 0.044
    z_r = roof_z(rx, 0.80) - 0.044
    b.beam_between((rx, -0.78, z_f), (rx, 0.80, z_r), 0.044, 0.048, 0, (0.84, 0.74, 0.62))

# 5. Draped & Scalloped Striped Canvas Awning (exact width 2.90, depth 1.70: X in [-1.45,1.45], Y in [-0.85,0.85])
def build_cloth_sheet():
    NX, NY = 42, 16
    profile_n = NY + 4
    verts, faces, uvs = [], [], []
    thickness = 0.018
    grid_top, grid_bot = [], []
    for j in range(profile_n):
        row_t, row_b = [], []
        for i in range(NX):
            u = i / (NX - 1)
            x = -1.45 + 2.90 * u
            if j < NY:
                frac = j / (NY - 1)
                y = 0.85 - 1.68 * frac
                z = roof_z(x, y)
                v_tex = 1.0 - 0.80 * frac
                ny_n, nz_n = 0.22, 0.975
            else:
                vfrac = (j - (NY - 1)) / 4.0
                scallop = 0.042 * abs(math.sin(u * 7.0 * math.pi))
                y = -0.83 - 0.02 * math.sin(vfrac * math.pi * 0.5)
                z = roof_z(x, -0.83) - vfrac * (0.14 + scallop)
                v_tex = 0.20 * (1.0 - vfrac)
                ny_n, nz_n = -0.96, 0.25
            row_t.append((len(verts), u, v_tex))
            verts.append((x, y, z))
            row_b.append((len(verts), u, v_tex))
            verts.append((x, y - ny_n * thickness, z - nz_n * thickness))
        grid_top.append(row_t)
        grid_bot.append(row_b)

    for j in range(profile_n - 1):
        for i in range(NX - 1):
            t00, u0, v0 = grid_top[j][i]; t10, u1, _ = grid_top[j][i + 1]
            t11, _, v1 = grid_top[j + 1][i + 1]; t01, _, _ = grid_top[j + 1][i]
            faces.append((t00, t01, t11, t10))
            uvs.append([(u0, v0), (u0, v1), (u1, v1), (u1, v0)])
            b00, _, _ = grid_bot[j][i]; b10, _, _ = grid_bot[j][i + 1]
            b11, _, _ = grid_bot[j + 1][i + 1]; b01, _, _ = grid_bot[j + 1][i]
            faces.append((b00, b10, b11, b01))
            uvs.append([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])

    for i in range(NX - 1):
        t0, u0, v0 = grid_top[0][i]; t1, u1, _ = grid_top[0][i + 1]
        b0, b1 = grid_bot[0][i][0], grid_bot[0][i + 1][0]
        faces.append((t0, t1, b1, b0)); uvs.append([(u0, v0), (u1, v0), (u1, v0), (u0, v0)])
        t0, u0, _ = grid_top[-1][i]; t1, u1, _ = grid_top[-1][i + 1]
        b0, b1 = grid_bot[-1][i][0], grid_bot[-1][i + 1][0]
        faces.append((t0, b0, b1, t1)); uvs.append([(u0, 0.02), (u0, 0.02), (u1, 0.02), (u1, 0.02)])
    for j in range(profile_n - 1):
        for col, flip in ((0, False), (NX - 1, True)):
            t0, u0, v0 = grid_top[j][col]; t1, _, v1 = grid_top[j + 1][col]
            b0, b1 = grid_bot[j][col][0], grid_bot[j + 1][col][0]
            faces.append((t0, t1, b1, b0) if flip else (t0, b0, b1, t1))
            uvs.append([(u0, v0), (u0, v1), (u0, v1), (u0, v0)])

    b.add_mesh(verts, faces, 1, (1, 1, 1), smooth=True, uvs=uvs)

build_cloth_sheet()

# Brass awning tie-down bolts along front header
for bx in (-1.29, 0.0, 1.29):
    b.box(bx, -0.805, 1.945, 0.042, 0.03, 0.042, 3, (0.72, 0.54, 0.24), bevel=0.008)

# 6. Three angled wooden display crates + sculpted fruit & produce
crate_configs = [
    (-0.82, "citrus", [(0.94, 0.52, 0.14), (0.96, 0.62, 0.18), (0.91, 0.44, 0.12)]),
    (0.0,   "apple",  [(0.86, 0.25, 0.21), (0.94, 0.52, 0.36), (0.89, 0.32, 0.24)]),
    (0.82,  "pear",   [(0.84, 0.72, 0.22), (0.64, 0.72, 0.24), (0.90, 0.78, 0.28)]),
]
TILT = 0.18
for cx, kind, palette in crate_configs:
    cy, cz = -0.10, 0.99
    b.box(cx, cy, cz, 0.72, 0.56, 0.025, 0, (0.98, 0.88, 0.76), bevel=0.005, rot=(TILT, 0, 0))
    b.box(cx, cy - 0.265, cz + 0.048, 0.72, 0.03, 0.095, 0, (0.92, 0.82, 0.70), bevel=0.005, rot=(TILT, 0, 0))
    b.box(cx, cy + 0.265, cz - 0.048, 0.72, 0.03, 0.125, 0, (0.92, 0.82, 0.70), bevel=0.005, rot=(TILT, 0, 0))
    for sx in (-0.345, 0.345):
        b.box(cx + sx, cy, cz + 0.04, 0.03, 0.54, 0.105, 0, (0.88, 0.78, 0.68), bevel=0.005, rot=(TILT, 0, 0))
    b.box(cx, cy, cz + 0.022, 0.65, 0.49, 0.024, 5, (0.82, 0.72, 0.50), bevel=0.006, rot=(TILT, 0, 0))

    spots = [
        (-0.21, -0.14, 0.088), (-0.07, -0.15, 0.086), (0.07, -0.14, 0.088), (0.21, -0.15, 0.086),
        (-0.20,  0.00, 0.112), (-0.06,  0.01, 0.114), (0.08,  0.00, 0.112), (0.21,  0.01, 0.114),
        (-0.14,  0.14, 0.136), (0.01,   0.13, 0.138), (0.15,  0.14, 0.136),
        (-0.08, -0.06, 0.162), (0.09,  -0.05, 0.162),
    ]
    for idx, (ox, oy, oz) in enumerate(spots):
        col = palette[(idx + len(kind)) % len(palette)]
        r = 0.062 + (idx % 3) * 0.006
        if kind == "pear" and idx >= 9:
            b.add_leaf_bundle(cx + ox, cy + oy, cz + oz - 0.02, (0.28, 0.58, 0.19))
        else:
            b.add_fruit(cx + ox, cy + oy, cz + oz, r, r, r * 1.04, kind, col)

# Chalkboard menu sign with chalk lettering accents + counter herb pot
b.box(1.19, -0.44, 1.09, 0.22, 0.028, 0.26, 0, (0.76, 0.58, 0.42), bevel=0.005, rot=(-0.22, 0, -0.35))
b.box(1.19, -0.452, 1.09, 0.175, 0.012, 0.205, 5, (0.14, 0.22, 0.21), bevel=0.002, rot=(-0.22, 0, -0.35))
b.box(1.19, -0.38, 1.03, 0.04, 0.14, 0.18, 0, (0.76, 0.58, 0.42), bevel=0.004, rot=(0.45, 0, -0.35))
b.lathe(-1.14, 0.36, 0.955, [(0.055, 0), (0.075, 0.11), (0.082, 0.12), (0.082, 0.14), (0.065, 0.14)], 16, 2, (0.78, 0.42, 0.25))
b.add_leaf_bundle(-1.14, 0.36, 1.09, (0.26, 0.56, 0.18))

mesh = bpy.data.meshes.new("Market stall timber, canvas awning and produce")
mesh.from_pydata(b.verts, [], b.faces)
mesh.update()
col_attr = mesh.color_attributes.new(name="Tint", type="FLOAT_COLOR", domain="POINT")
for i, c in enumerate(b.vcols):
    col_attr.data[i].color = c
for mat in MATERIALS:
    mesh.materials.append(mat)
for i, poly in enumerate(mesh.polygons):
    poly.material_index = b.slots[i]
    poly.use_smooth = b.smooth[i]

uv_layer = mesh.uv_layers.new(name="UVMap").data
for fi, poly in enumerate(mesh.polygons):
    if fi in b.face_uvs:
        for li, uv_val in zip(poly.loop_indices, b.face_uvs[fi]):
            uv_layer[li].uv = uv_val
    else:
        nx, ny, nz = map(abs, poly.normal)
        for li in poly.loop_indices:
            x, y, z = mesh.vertices[mesh.loops[li].vertex_index].co
            if nz >= max(nx, ny): uu, vv = x, y
            elif nx > ny: uu, vv = y, z
            else: uu, vv = x, z
            uv_layer[li].uv = (uu * 0.65, vv * 0.65)

obj = bpy.data.objects.new("market-stall", mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
mesh.validate(clean_customdata=True)
mesh.calc_loop_triangles()

print("MARKET_STALL_V2", len(mesh.loop_triangles), tuple(round(d, 4) for d in obj.dimensions), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "market-stall.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "market-stall.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
)
