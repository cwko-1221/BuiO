"""Sculpt and export Moonbay golden broadleaf tree (gold-tree v2) in Blender."""
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

dest = Path(sys.argv[sys.argv.index("--") + 1])
dest.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(74229)


class Part:
    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.colors = []
        self.flat = []

    def vertex(self, p, c):
        self.verts.append(tuple(p))
        self.colors.append((*c, 1.0))
        return len(self.verts) - 1

    def face(self, index, flat=False):
        self.faces.append(index)
        self.flat.append(flat)

    def finish(self, mat):
        data = bpy.data.meshes.new(self.name)
        data.from_pydata(self.verts, [], self.faces)
        data.update()
        rgba = data.color_attributes.new(name="Tint", type="FLOAT_COLOR", domain="POINT")
        for i, tint in enumerate(self.colors):
            rgba.data[i].color = tint
        for poly, flat in zip(data.polygons, self.flat):
            poly.use_smooth = not flat
        data.materials.append(mat)
        obj = bpy.data.objects.new(self.name, data)
        bpy.context.collection.objects.link(obj)
        return obj


bark = Part("Golden tree trunk, roots and boughs")
crown = Part("Golden canopy clouds and leaf clusters")


def mix(a, b, f):
    return tuple(l * (1.0 - f) + r * f for l, r in zip(a, b))


def branch(points, radii, sides=11, flared=False, anchor_min_z=-0.06):
    path = [Vector(p) for p in points]
    rings = []
    turns = [0.90 + 0.20 * rng.random() for _ in range(sides)]
    groove = [0.84 + 0.24 * rng.random() for _ in range(sides)]
    for i, p in enumerate(path):
        d = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        up_ref = Vector((0, 1, 0)) if abs(d.y) < 0.92 else Vector((1, 0, 0))
        X = d.cross(up_ref).normalized()
        Y = d.cross(X)
        ring = []
        for j in range(sides):
            a = math.tau * j / sides
            rr = radii[i] * turns[j] * (1.26 if flared and i == 0 and j % 3 == 0 else 1.0)
            v = p + rr * (X * math.cos(a) + Y * math.sin(a))
            v.z = max(anchor_min_z, v.z)
            tone = groove[j] * (0.93 + 0.12 * rng.random())
            base = (0.26, 0.155, 0.082) if i < 2 else (0.31, 0.185, 0.098)
            ring.append(bark.vertex(v, tuple(tone * c for c in base)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bark.face((lo[j], lo[k], hi[k], hi[j]))
    bark.face(tuple(reversed(rings[0])))
    bark.face(tuple(rings[-1]))


# Grounded sinuous trunk splitting smoothly into sturdy crown scaffolds (terminating safely inside center canopy)
branch(
    [
        (0.0, 0.0, -0.045),
        (-0.01, 0.01, 0.22),
        (-0.06, 0.07, 0.76),
        (-0.04, 0.04, 1.40),
        (0.04, -0.03, 2.08),
        (0.02, -0.06, 2.78),
        (-0.05, -0.02, 3.45),
        (-0.04, 0.06, 4.18),
        (0.02, 0.08, 4.78),
    ],
    [0.35, 0.31, 0.255, 0.215, 0.180, 0.148, 0.115, 0.075, 0.038],
    14,
    True,
    -0.055,
)

for angle_deg, rad in [(20, 0.56), (82, 0.52), (146, 0.60), (218, 0.55), (290, 0.58), (340, 0.49)]:
    ang = math.radians(angle_deg)
    rx, ry = math.cos(ang) * rad, math.sin(ang) * rad
    branch(
        [(rx, ry, -0.055), (rx * 0.72, ry * 0.70, 0.04), (rx * 0.38, ry * 0.38, 0.18), (rx * 0.06, ry * 0.06, 0.44)],
        [0.036, 0.108, 0.150, 0.135],
        8,
        False,
        -0.058,
    )

# Deeper, rounder billowing golden canopy clouds covering ~45% of tree height (z=3.15..6.05) with tight vertical overlap
patches = [
    # Lower perimeter canopy ring (z ~ 3.55 - 3.85)
    ((1.58, -0.78, 3.58), (0.94, 0.86, 0.74), 0.35, (0.12, -0.08)),
    ((-1.62, -0.66, 3.68), (0.96, 0.88, 0.76), 1.25, (-0.12, -0.06)),
    ((-1.42, 1.38, 3.82), (0.92, 0.88, 0.74), 2.15, (-0.10, 0.10)),
    ((1.48, 1.32, 3.74), (0.94, 0.86, 0.74), 0.72, (0.10, 0.08)),
    ((-0.14, -1.52, 3.64), (0.92, 0.82, 0.72), 1.75, (0.02, -0.12)),
    ((0.10, 1.54, 3.92), (0.90, 0.84, 0.72), 2.55, (-0.02, 0.12)),
    # Mid fuller ring bridging lower & upper crowns cleanly without gaps (z ~ 4.30 - 4.75)
    ((1.44, 0.24, 4.38), (0.92, 0.86, 0.76), 0.92, (0.10, 0.02)),
    ((-1.46, 0.28, 4.46), (0.92, 0.88, 0.78), 2.85, (-0.10, 0.04)),
    ((0.88, -0.88, 4.54), (0.90, 0.84, 0.78), 1.45, (0.05, -0.05)),
    ((-0.86, -0.76, 4.62), (0.92, 0.86, 0.78), 0.42, (-0.05, -0.05)),
    ((0.76, 0.86, 4.74), (0.92, 0.88, 0.80), 2.02, (0.05, 0.05)),
    ((-0.74, 0.82, 4.82), (0.90, 0.86, 0.80), 1.08, (-0.05, 0.05)),
    # Upper lush crown dome & crowning billows (z ~ 5.20 - 5.95)
    ((0.55, -0.25, 5.24), (0.96, 0.90, 0.82), 1.62, (0.04, -0.02)),
    ((-0.58, -0.18, 5.32), (0.94, 0.90, 0.82), 2.95, (-0.04, -0.02)),
    ((0.06, 0.18, 5.56), (1.06, 1.00, 0.88), 0.62, (0.02, 0.02)),
    ((-0.22, -0.10, 5.76), (0.86, 0.82, 0.72), 2.40, (-0.02, 0.02)),
]

# Plump curved primary and secondary scaffold limbs terminating deeply inside the billowing leaf clusters
boughs = [
    ([(0.02, -0.01, 1.68), (0.48, -0.28, 2.26), (1.02, -0.54, 2.86), (1.42, -0.72, 3.36), (1.56, -0.78, 3.68)], [0.138, 0.118, 0.088, 0.056, 0.028], patches[8][0]),
    ([(-0.02, 0.01, 1.86), (-0.52, -0.32, 2.38), (-1.06, -0.54, 2.96), (-1.44, -0.64, 3.44), (-1.60, -0.66, 3.76)], [0.134, 0.114, 0.084, 0.054, 0.026], patches[9][0]),
    ([(-0.02, 0.04, 2.04), (-0.48, 0.52, 2.58), (-0.98, 0.96, 3.16), (-1.28, 1.26, 3.60), (-1.40, 1.38, 3.88)], [0.128, 0.106, 0.076, 0.048, 0.026], patches[11][0]),
    ([(0.03, 0.02, 2.24), (0.52, 0.52, 2.74), (1.04, 0.94, 3.24), (1.34, 1.20, 3.58), (1.46, 1.30, 3.82)], [0.122, 0.100, 0.072, 0.046, 0.025], patches[10][0]),
    ([(-0.04, -0.04, 2.42), (-0.10, -0.62, 2.86), (-0.14, -1.16, 3.32), (-0.14, -1.48, 3.68)], [0.105, 0.085, 0.056, 0.026], patches[9][0]),
    ([(-0.04, 0.06, 2.72), (-0.08, 0.62, 3.22), (0.04, 1.18, 3.66), (0.10, 1.50, 3.96)], [0.098, 0.078, 0.052, 0.026], patches[10][0]),
    ([(0.01, -0.02, 2.95), (0.58, 0.04, 3.52), (1.12, 0.16, 4.02), (1.42, 0.24, 4.40)], [0.092, 0.074, 0.050, 0.025], patches[12][0]),
    ([(-0.04, -0.01, 3.08), (-0.62, 0.08, 3.62), (-1.16, 0.20, 4.12), (-1.44, 0.28, 4.48)], [0.088, 0.070, 0.048, 0.025], patches[13][0]),
]
for points, radii, twig_goal in boughs:
    branch(points, radii, 10)
    mid = Vector(points[-3])
    goal = Vector(twig_goal)
    bent = mid.lerp(goal, 0.52) + Vector((rng.uniform(-0.10, 0.10), rng.uniform(-0.10, 0.10), -0.04))
    branch([mid, bent, goal], [0.052, 0.036, 0.024], 8)


# Vibrant radiant golden saffron-honey PBR palette (calibrated to resist ACESFilmic green/olive muddiness)
GOLD_LOW = (0.335, 0.192, 0.020)    # warm honey amber underbough shadow (never olive-grey)
GOLD_MID = (0.690, 0.462, 0.038)    # luminous saffron-gold body
GOLD_HIGH = (0.945, 0.735, 0.082)   # sunlit ginkgo-gold highlights


def tint(z, shade):
    f = max(0.02, min(0.98, (z - 2.95) / 2.95 * 0.45 + shade * 0.55))
    if f < 0.46:
        return mix(GOLD_LOW, GOLD_MID, f / 0.46)
    return mix(GOLD_MID, GOLD_HIGH, (f - 0.46) / 0.54)


def clump(origin, extent, phase, lean):
    pos = Vector(origin)
    sections = [
        (-0.70, 0.28),
        (-0.52, 0.68),
        (-0.26, 0.94),
        (0.02, 1.00),
        (0.32, 0.92),
        (0.58, 0.74),
        (0.80, 0.46),
        (0.94, 0.20),
    ]
    rings = []
    n = 24
    for k, (height, radius) in enumerate(sections):
        ring = []
        for j in range(n):
            q = math.tau * j / n
            a = q + k * 0.11 + phase
            # Organic cauliflower/broadleaf crown billowing across 3, 5, and 7 harmonics
            r = radius * (
                1.0
                + 0.115 * math.sin(3 * a + phase)
                + 0.088 * math.cos(5 * a - k * 0.68)
                + 0.058 * math.sin(7 * a + k * 0.90)
                + 0.022 * rng.random()
            )
            xx = math.cos(a) * extent[0] * r
            yy = math.sin(a) * extent[1] * r
            zz = (
                height
                + 0.11 * math.sin(5 * a + height * 2.2) * r
                + 0.07 * math.cos(3 * a - phase) * r
                + 0.045 * (rng.random() - 0.5)
            ) * extent[2]
            p = pos + Vector((xx + lean[0] * height, yy + lean[1] * height, zz))
            shade = 0.22 + 0.58 * (height + 0.70) / 1.64 + rng.uniform(-0.10, 0.10)
            ring.append(crown.vertex(p, tint(p.z, shade)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            crown.face((lo[j], lo[k], hi[k], hi[j]))
    a_v = crown.vertex(pos + Vector((0.0, 0.0, -0.76 * extent[2])), tint(pos.z - 0.6, 0.08))
    b_v = crown.vertex(pos + Vector((lean[0], lean[1], 0.98 * extent[2])), tint(pos.z + 0.72, 0.85))
    for j in range(n):
        k = (j + 1) % n
        crown.face((a_v, rings[0][k], rings[0][j]))
        crown.face((b_v, rings[-1][j], rings[-1][k]))
    return rings


def leaf_rosette(base, forward, size, light):
    # Full broadleaf golden sprig tuft (rounded oval diamond)
    side = Vector((-forward.y, forward.x, rng.uniform(-0.35, 0.35))).normalized()
    cross = side.cross(forward).normalized()
    width = size * rng.uniform(0.36, 0.48)
    peak = base + forward * size * 0.50 + cross * size * 0.15
    profile = [
        base + forward * size * 0.05,
        base + forward * size * 0.38 + side * width * 0.88,
        base + forward * size * 0.78 + side * width * 0.65,
        base + forward * size,
        base + forward * size * 0.76 - side * width * 0.62,
        base + forward * size * 0.36 - side * width * 0.86,
    ]
    indices = [crown.vertex(v, tint(v.z, min(0.99, light + rng.uniform(-0.06, 0.12)))) for v in profile]
    middle = crown.vertex(peak, tint(peak.z, min(0.99, light + 0.18)))
    for j in range(6):
        crown.face((indices[j], indices[(j + 1) % 6], middle), True)


for patch, (pose, size, angle, lean) in enumerate(patches):
    rings = clump(pose, size, angle, lean)
    center = Vector(pose)
    # Scatter leaf clusters across ALL vertical tiers: lower skirts (1-2), sides (3-4), upper shoulders & crown dome (5-6)
    for tier in (1, 2, 3, 4, 5, 6):
        count_tier = 4 if tier in (1, 6) else 6
        for i in range(count_tier):
            idx = (i * (len(rings[tier]) // count_tier) + patch * 3 + tier * 5) % len(rings[tier])
            surface = Vector(crown.verts[rings[tier][idx]])
            outward = (surface - center).normalized()
            side = Vector((-outward.y, outward.x, 0.0))
            if side.length < 1e-4:
                side = Vector((1.0, 0.0, 0.0))
            else:
                side.normalize()
            root = surface - outward * 0.15
            light = rng.uniform(0.42, 0.92) + (0.08 if tier >= 5 else 0.0)
            up_bias = 0.45 if tier >= 5 else (-0.18 if tier == 1 else 0.14)
            for j, spread in enumerate((-0.48, 0.44, 0.02)):
                base = root + outward * (j * 0.015)
                tilt = Vector((0.0, 0.0, up_bias + rng.uniform(-0.24, 0.30)))
                forward = (outward + side * spread + tilt).normalized()
                leaf_rosette(base, forward, rng.uniform(0.24, 0.38), min(0.99, light + j * 0.03))

parts = [bark, crown]
all_verts = [v for p in parts for v in p.verts]
lo = [min(v[k] for v in all_verts) for k in range(3)]
hi = [max(v[k] for v in all_verts) for k in range(3)]
dims = (5.30, 5.30, 6.10)
cx = (lo[0] + hi[0]) * 0.5
cy = (lo[1] + hi[1]) * 0.5
min_z_target = -0.055
for p in parts:
    p.verts = [
        (
            (v[0] - cx) * dims[0] / (hi[0] - lo[0]),
            (v[1] - cy) * dims[1] / (hi[1] - lo[1]),
            min_z_target + (v[2] - lo[2]) * dims[2] / (hi[2] - lo[2]),
        )
        for v in p.verts
    ]


def base_vcol_mat(name, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Specular IOR Level"].default_value = 0.25
    v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    v.layer_name = "Tint"
    mat.node_tree.links.new(v.outputs["Color"], bs.inputs["Base Color"])
    return mat


trunk = bark.finish(base_vcol_mat("Golden coastal bark", 0.87))
leaves = crown.finish(base_vcol_mat("Golden broadleaf foliage", 0.72))

# 1. Fuse bark roots/trunk/boughs cleanly + gentle decimate (~3800 tris so upper twigs stay plump)
bpy.context.view_layer.objects.active = trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size = 0.034
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth = True
smooth_mod = trunk.modifiers.new("Rounded crotches and roots", "SMOOTH")
smooth_mod.factor = 0.78
smooth_mod.iterations = 5
bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
dec_mod = trunk.modifiers.new("Runtime bark topology", "DECIMATE")
dec_mod.ratio = min(1.0, 3800.0 / max(1, 2 * len(trunk.data.polygons)))
bpy.ops.object.modifier_apply(modifier=dec_mod.name)
trunk.data.validate(verbose=False, clean_customdata=True)
trunk.data.update()

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.025)
bpy.ops.object.mode_set(mode="OBJECT")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
scene.render.bake.margin = 8


def bake_img(obj, mat, label, is_color, signal_socket=None):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    surface = nodes.get("Principled BSDF")
    output = nodes.get("Material Output")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    img = bpy.data.images.new(label, width=512, height=512, alpha=False)
    img.colorspace_settings.name = "sRGB" if is_color else "Non-Color"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    nodes.active = tex
    if signal_socket is not None:
        em = nodes.new("ShaderNodeEmission")
        links.new(signal_socket, em.inputs["Color"])
        links.new(em.outputs[0], output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT")
        nodes.remove(em)
    else:
        links.new(surface.outputs[0], output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    img.filepath_raw = str(dest / (label + ".png"))
    img.file_format = "PNG"
    img.save()
    img.pack()
    return tex


# Bake Bark Albedo + Normal
b_mat = trunk.data.materials[0]
bn, bl = b_mat.node_tree.nodes, b_mat.node_tree.links
b_surf, b_out = bn.get("Principled BSDF"), bn.get("Material Output")
for n in list(bn):
    if n not in (b_surf, b_out):
        bn.remove(n)

b_coords = bn.new("ShaderNodeTexCoord")
b_axis = bn.new("ShaderNodeVectorMath")
b_axis.operation = "MULTIPLY"
b_axis.inputs[1].default_value = (4.2, 4.2, 0.34)
bl.new(b_coords.outputs["Object"], b_axis.inputs[0])

b_grain = bn.new("ShaderNodeTexNoise")
b_grain.inputs["Scale"].default_value = 4.6
b_grain.inputs["Detail"].default_value = 3.2
b_grain.inputs["Roughness"].default_value = 0.62
bl.new(b_axis.outputs["Vector"], b_grain.inputs["Vector"])

b_ramp = bn.new("ShaderNodeValToRGB")
b_ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.18, (0.080, 0.046, 0.025)),
        (0.75, (0.270, 0.160, 0.085)),
        (0.46, (0.155, 0.092, 0.050)),
    ]
):
    el = b_ramp.color_ramp.elements[i] if i < 2 else b_ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
bl.new(b_grain.outputs["Fac"], b_ramp.inputs[0])

b_bump = bn.new("ShaderNodeBump")
b_bump.inputs["Strength"].default_value = 0.36
b_bump.inputs["Distance"].default_value = 0.022
bl.new(b_grain.outputs["Fac"], b_bump.inputs["Height"])
bl.new(b_bump.outputs[0], b_surf.inputs["Normal"])

b_albedo = bake_img(trunk, b_mat, "Golden bark color", True, b_ramp.outputs["Color"])
b_normal = bake_img(trunk, b_mat, "Golden bark normal", False)
for n in list(bn):
    if n not in (b_albedo, b_normal, b_surf, b_out):
        bn.remove(n)
bl.new(b_albedo.outputs["Color"], b_surf.inputs["Base Color"])
b_nm = bn.new("ShaderNodeNormalMap")
bl.new(b_normal.outputs["Color"], b_nm.inputs["Color"])
bl.new(b_nm.outputs[0], b_surf.inputs["Normal"])
bl.new(b_surf.outputs[0], b_out.inputs["Surface"])

# 2. Smart UV unwrap Foliage & Bake Crisp Leaf-Cluster Stipple & Botanical Normal Map
bpy.ops.object.select_all(action="DESELECT")
leaves.select_set(True)
bpy.context.view_layer.objects.active = leaves
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(68), island_margin=0.014)
bpy.ops.object.mode_set(mode="OBJECT")

l_mat = leaves.data.materials[0]
ln, ll = l_mat.node_tree.nodes, l_mat.node_tree.links
l_surf, l_out = ln.get("Principled BSDF"), ln.get("Material Output")
for n in list(ln):
    if n not in (l_surf, l_out):
        ln.remove(n)

l_coords = ln.new("ShaderNodeTexCoord")
# Multi-scale Voronoi + fine noise simulates individual overlapping leaves across cloud domes
l_vor = ln.new("ShaderNodeTexVoronoi")
l_vor.feature = "SMOOTH_F1"
l_vor.inputs["Scale"].default_value = 5.8
l_vor.inputs["Smoothness"].default_value = 0.38
ll.new(l_coords.outputs["Object"], l_vor.inputs["Vector"])

l_noise = ln.new("ShaderNodeTexNoise")
l_noise.inputs["Scale"].default_value = 11.5
l_noise.inputs["Detail"].default_value = 3.5
ll.new(l_coords.outputs["Object"], l_noise.inputs["Vector"])

l_mix = ln.new("ShaderNodeMath")
l_mix.operation = "MULTIPLY_ADD"
l_mix.inputs[1].default_value = 0.55
ll.new(l_vor.outputs["Distance"], l_mix.inputs[0])
ll.new(l_noise.outputs["Fac"], l_mix.inputs[2])

# Subtle bright golden-cream micro leaf stipple [0.80 .. 1.00] to multiply cleanly with Tint vertex colors
l_ramp = ln.new("ShaderNodeValToRGB")
l_ramp.color_ramp.elements[0].position = 0.25
l_ramp.color_ramp.elements[0].color = (0.78, 0.72, 0.58, 1.0)
l_ramp.color_ramp.elements[1].position = 0.92
l_ramp.color_ramp.elements[1].color = (1.00, 0.99, 0.92, 1.0)
ll.new(l_mix.outputs["Value"], l_ramp.inputs[0])

l_bump = ln.new("ShaderNodeBump")
l_bump.inputs["Strength"].default_value = 0.42
l_bump.inputs["Distance"].default_value = 0.025
ll.new(l_mix.outputs["Value"], l_bump.inputs["Height"])
ll.new(l_bump.outputs[0], l_surf.inputs["Normal"])

l_albedo = bake_img(leaves, l_mat, "Golden leaf stipple", True, l_ramp.outputs["Color"])
l_normal = bake_img(leaves, l_mat, "Golden leaf normal", False)
for n in list(ln):
    if n not in (l_albedo, l_normal, l_surf, l_out):
        ln.remove(n)

vcol = ln.new("ShaderNodeVertexColor")
vcol.layer_name = "Tint"
mul_node = ln.new("ShaderNodeMix")
mul_node.data_type = "RGBA"
mul_node.blend_type = "MULTIPLY"
mul_node.inputs["Factor"].default_value = 1.0
ll.new(vcol.outputs["Color"], mul_node.inputs["A"])
ll.new(l_albedo.outputs["Color"], mul_node.inputs["B"])
ll.new(mul_node.outputs["Result"], l_surf.inputs["Base Color"])

l_nm = ln.new("ShaderNodeNormalMap")
ll.new(l_normal.outputs["Color"], l_nm.inputs["Color"])
ll.new(l_nm.outputs[0], l_surf.inputs["Normal"])
ll.new(l_surf.outputs[0], l_out.inputs["Surface"])

# Wrap foliage inside "canopy" empty so Three.js fades crown cleanly when walking underneath
canopy_empty = bpy.data.objects.new("canopy", None)
bpy.context.collection.objects.link(canopy_empty)
leaves.parent = canopy_empty

all_meshes = [trunk, leaves]
xs, ys, zs = [], [], []
for o in all_meshes:
    o.data.calc_loop_triangles()
    print(o.name, len(o.data.loop_triangles), "triangles")
    for v in o.data.vertices:
        co = o.matrix_world @ v.co
        xs.append(co.x)
        ys.append(co.y)
        zs.append(co.z)
print(
    "GOLD_TREE_V2",
    (round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4), round(max(zs) - min(zs), 4)),
    "minZ=",
    round(min(zs), 4),
    "center=",
    (round((min(xs) + max(xs)) / 2, 4), round((min(ys) + max(ys)) / 2, 4)),
)

bpy.ops.wm.save_as_mainfile(filepath=str(dest / "gold-tree.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(dest / "gold-tree.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
    export_tangents=True,
    export_vertex_color="MATERIAL",
)
