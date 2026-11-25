"""Sculpt and export Moonbay golden broadleaf tree (gold-tree) in Blender."""
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
rng = random.Random(74219)


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
crown = Part("Golden canopy clouds and leaf sprigs")


def mix(a, b, f):
    return tuple(l * (1.0 - f) + r * f for l, r in zip(a, b))


def branch(points, radii, sides=10, flared=False, anchor_min_z=-0.06):
    path = [Vector(p) for p in points]
    rings = []
    turns = [0.89 + 0.22 * rng.random() for _ in range(sides)]
    groove = [0.82 + 0.26 * rng.random() for _ in range(sides)]
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
            base = (0.25, 0.145, 0.075) if i < 2 else (0.30, 0.175, 0.092)
            ring.append(bark.vertex(v, tuple(tone * c for c in base)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bark.face((lo[j], lo[k], hi[k], hi[j]))
    bark.face(tuple(reversed(rings[0])))
    bark.face(tuple(rings[-1]))


# Sinuous upright S-curved vase trunk with warm flared root buttresses dipping cleanly below Z=0 for slopes
branch(
    [
        (0.0, 0.0, -0.045),
        (-0.01, 0.01, 0.24),
        (-0.07, 0.08, 0.78),
        (-0.04, 0.04, 1.48),
        (0.05, -0.04, 2.25),
        (0.03, -0.09, 2.95),
        (-0.09, -0.05, 3.65),
        (-0.14, 0.08, 4.35),
        (-0.06, 0.14, 4.98),
        (0.02, 0.18, 5.42),
    ],
    [0.34, 0.30, 0.245, 0.205, 0.172, 0.140, 0.105, 0.074, 0.044, 0.014],
    14,
    True,
    -0.055,
)

for angle_deg, rad in [(20, 0.56), (82, 0.52), (146, 0.60), (218, 0.55), (290, 0.58), (340, 0.49)]:
    ang = math.radians(angle_deg)
    rx, ry = math.cos(ang) * rad, math.sin(ang) * rad
    branch(
        [(rx, ry, -0.055), (rx * 0.72, ry * 0.70, 0.04), (rx * 0.38, ry * 0.38, 0.18), (rx * 0.06, ry * 0.06, 0.45)],
        [0.034, 0.105, 0.148, 0.132],
        8,
        False,
        -0.058,
    )

# Tiered lofty golden cloud crown (14 asymmetric overlapping leaf masses centered over flared boughs)
patches = [
    ((1.66, -0.82, 4.46), (0.84, 0.72, 0.52), 0.35, (0.14, -0.10)),
    ((-1.72, -0.68, 4.55), (0.86, 0.74, 0.54), 1.15, (-0.14, -0.08)),
    ((-1.48, 1.48, 4.70), (0.82, 0.76, 0.52), 2.15, (-0.12, 0.12)),
    ((1.58, 1.38, 4.78), (0.84, 0.75, 0.54), 0.72, (0.12, 0.10)),
    ((-0.14, -1.58, 4.50), (0.84, 0.68, 0.50), 1.75, (0.02, -0.16)),
    ((0.08, 1.62, 4.92), (0.82, 0.72, 0.52), 2.55, (-0.02, 0.15)),
    ((1.48, 0.22, 5.06), (0.78, 0.72, 0.50), 0.92, (0.12, 0.02)),
    ((-1.52, 0.28, 5.14), (0.78, 0.72, 0.52), 2.85, (-0.12, 0.04)),
    ((0.88, -0.92, 5.26), (0.76, 0.70, 0.54), 1.45, (0.06, -0.06)),
    ((-0.88, -0.78, 5.34), (0.78, 0.72, 0.54), 0.42, (-0.06, -0.06)),
    ((0.76, 0.88, 5.48), (0.80, 0.74, 0.56), 2.02, (0.05, 0.06)),
    ((-0.74, 0.84, 5.56), (0.78, 0.72, 0.56), 1.08, (-0.05, 0.06)),
    ((0.06, -0.12, 5.76), (0.94, 0.88, 0.64), 0.62, (0.02, 0.02)),
    ((-0.24, 0.28, 5.92), (0.76, 0.72, 0.56), 2.40, (-0.02, 0.04)),
]

# Lofted spreading vase scaffold limbs terminating directly inside the golden foliage masses
boughs = [
    ([(0.02, -0.01, 1.85), (0.45, -0.30, 2.55), (0.98, -0.58, 3.22), (1.44, -0.80, 3.92), (1.64, -0.82, 4.46)], [0.132, 0.118, 0.088, 0.054, 0.018], patches[8][0]),
    ([(-0.02, 0.01, 2.05), (-0.52, -0.35, 2.68), (-1.06, -0.62, 3.38), (-1.48, -0.74, 4.04), (-1.70, -0.68, 4.55)], [0.128, 0.112, 0.082, 0.048, 0.017], patches[9][0]),
    ([(-0.01, 0.04, 2.25), (-0.48, 0.56, 2.86), (-0.98, 1.04, 3.54), (-1.34, 1.38, 4.20), (-1.48, 1.48, 4.70)], [0.124, 0.104, 0.072, 0.044, 0.016], patches[11][0]),
    ([(0.04, 0.02, 2.48), (0.52, 0.58, 3.12), (1.08, 1.05, 3.74), (1.42, 1.32, 4.34), (1.58, 1.38, 4.78)], [0.118, 0.098, 0.068, 0.042, 0.015], patches[10][0]),
    ([(-0.06, -0.05, 2.72), (-0.12, -0.68, 3.28), (-0.16, -1.24, 3.92), (-0.14, -1.56, 4.50)], [0.096, 0.082, 0.052, 0.016], patches[9][0]),
    ([(-0.08, 0.08, 3.15), (-0.14, 0.64, 3.76), (-0.06, 1.24, 4.38), (0.08, 1.60, 4.92)], [0.088, 0.074, 0.048, 0.015], patches[10][0]),
    ([(0.02, -0.04, 3.45), (0.58, -0.06, 4.02), (1.14, 0.10, 4.58), (1.48, 0.22, 5.06)], [0.082, 0.068, 0.044, 0.014], patches[12][0]),
    ([(-0.09, -0.02, 3.60), (-0.64, 0.08, 4.18), (-1.20, 0.20, 4.70), (-1.50, 0.28, 5.14)], [0.078, 0.064, 0.040, 0.014], patches[13][0]),
]
for points, radii, twig_goal in boughs:
    branch(points, radii, 9)
    mid = Vector(points[-3])
    goal = Vector(twig_goal)
    bent = mid.lerp(goal, 0.55) + Vector((rng.uniform(-0.14, 0.14), rng.uniform(-0.14, 0.14), -0.08))
    branch([mid, bent, goal], [0.046, 0.028, 0.012], 7)


# Golden sunlit broadleaf palette calibrated for Three.js ACESFilmic (luminous honey-gold tops, rich olive-amber underboughs)
FOLIAGE_LOW = (0.155, 0.138, 0.020)
FOLIAGE_MID = (0.455, 0.380, 0.042)
FOLIAGE_HIGH = (0.755, 0.618, 0.082)


def tint(z, shade):
    f = max(0.02, min(0.98, (z - 3.35) / 2.65 * 0.50 + shade * 0.50))
    if f < 0.48:
        return mix(FOLIAGE_LOW, FOLIAGE_MID, f / 0.48)
    return mix(FOLIAGE_MID, FOLIAGE_HIGH, (f - 0.48) / 0.52)


def clump(origin, extent, phase, lean):
    pos = Vector(origin)
    sections = [
        (-0.60, 0.30),
        (-0.42, 0.78),
        (-0.14, 0.98),
        (0.16, 1.00),
        (0.46, 0.87),
        (0.72, 0.62),
        (0.90, 0.32),
    ]
    rings = []
    n = 22
    for k, (height, radius) in enumerate(sections):
        ring = []
        for j in range(n):
            q = math.tau * j / n
            a = q + k * 0.095 + phase
            r = radius * (
                1.0
                + 0.095 * math.sin(3 * a + phase)
                + 0.072 * math.sin(5 * a - k * 0.62)
                + 0.045 * math.cos(2 * a + phase * 1.6)
                + 0.020 * rng.random()
            )
            xx = math.cos(a) * extent[0] * r
            yy = math.sin(a) * extent[1] * r
            zz = (height + 0.09 * math.sin(3 * a + height * 2.0) * r + 0.05 * (rng.random() - 0.5)) * extent[2]
            p = pos + Vector((xx + lean[0] * height, yy + lean[1] * height, zz))
            shade = 0.20 + 0.58 * (height + 0.60) / 1.50 + rng.uniform(-0.10, 0.10)
            ring.append(crown.vertex(p, tint(p.z, shade)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            crown.face((lo[j], lo[k], hi[k], hi[j]))
    a_v = crown.vertex(pos + Vector((0.0, 0.0, -0.68 * extent[2])), tint(pos.z - 0.55, 0.08))
    b_v = crown.vertex(pos + Vector((lean[0], lean[1], 0.96 * extent[2])), tint(pos.z + 0.72, 0.78))
    for j in range(n):
        k = (j + 1) % n
        crown.face((a_v, rings[0][k], rings[0][j]))
        crown.face((b_v, rings[-1][j], rings[-1][k]))
    return rings


def leaf_sprig(base, forward, size, light):
    side = Vector((-forward.y, forward.x, rng.uniform(-0.45, 0.45))).normalized()
    cross = side.cross(forward).normalized()
    width = size * rng.uniform(0.26, 0.38)
    peak = base + forward * size * 0.48 + cross * size * 0.14
    profile = [
        base,
        base + forward * size * 0.34 + side * width,
        base + forward * size * 0.72 + side * width * 0.68,
        base + forward * size,
        base + forward * size * 0.70 - side * width * 0.64,
        base + forward * size * 0.34 - side * width,
    ]
    indices = [crown.vertex(v, tint(v.z, light + rng.uniform(-0.08, 0.12))) for v in profile]
    middle = crown.vertex(peak, tint(peak.z, min(0.98, light + 0.14)))
    for j in range(6):
        crown.face((indices[j], indices[(j + 1) % 6], middle), True)


for patch, (pose, size, angle, lean) in enumerate(patches):
    rings = clump(pose, size, angle, lean)
    center = Vector(pose)
    for i in range(13):
        tier = 3 + (i + patch) % 2
        surface = Vector(crown.verts[rings[tier][(i * 7 + patch * 3) % len(rings[tier])]])
        outward = (surface - center).normalized()
        side = Vector((-outward.y, outward.x, 0.0)).normalized()
        root = surface - outward * 0.15
        light = rng.uniform(0.45, 0.92)
        for j, spread in enumerate((-0.62, 0.56, -0.22, 0.28) if i % 2 == 0 else (-0.54, 0.42, 0.06)):
            base = root + outward * (j * 0.018)
            tilt = Vector((0.0, 0.0, rng.uniform(-0.34, 0.46)))
            forward = (outward + side * spread + tilt).normalized()
            leaf_sprig(base, forward, rng.uniform(0.22, 0.38), light + j * 0.03)

parts = [bark, crown]
all_verts = [v for p in parts for v in p.verts]
lo = [min(v[k] for v in all_verts) for k in range(3)]
hi = [max(v[k] for v in all_verts) for k in range(3)]
# Target dims: [5.30, 5.30, 6.10], minZ anchored ~ -0.055 so root tips never float on gentle slopes
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


def material(name, rough, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    bs.inputs["Specular IOR Level"].default_value = 0.28
    v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    v.layer_name = "Tint"
    v.location = (-360, 300)
    mat.node_tree.links.new(v.outputs["Color"], bs.inputs["Base Color"])
    return mat


trunk = bark.finish(material("Golden coastal bark", 0.87))
leaves = crown.finish(material("Golden broadleaf foliage", 0.74))

# Fuse roots/trunk/boughs via voxel remesh -> smooth -> decimate -> smart UV -> Cycles bark bake
bpy.context.view_layer.objects.active = trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size = 0.036
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth = True
smooth_mod = trunk.modifiers.new("Rounded crotches and root flares", "SMOOTH")
smooth_mod.factor = 0.78
smooth_mod.iterations = 5
bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
dec_mod = trunk.modifiers.new("Runtime bark topology", "DECIMATE")
dec_mod.ratio = min(1.0, 3200.0 / max(1, 2 * len(trunk.data.polygons)))
bpy.ops.object.modifier_apply(modifier=dec_mod.name)
trunk.data.validate(verbose=False, clean_customdata=True)
trunk.data.update()

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(74), island_margin=0.025)
bpy.ops.object.mode_set(mode="OBJECT")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
scene.render.bake.margin = 8
mat = trunk.data.materials[0]
nodes, links = mat.node_tree.nodes, mat.node_tree.links
surface = nodes.get("Principled BSDF")
output = nodes.get("Material Output")
for n in list(nodes):
    if n not in (surface, output):
        nodes.remove(n)

coords = nodes.new("ShaderNodeTexCoord")
axis = nodes.new("ShaderNodeVectorMath")
axis.operation = "MULTIPLY"
axis.inputs[1].default_value = (4.2, 4.2, 0.32)
links.new(coords.outputs["Object"], axis.inputs[0])

grain = nodes.new("ShaderNodeTexNoise")
grain.inputs["Scale"].default_value = 4.6
grain.inputs["Detail"].default_value = 3.2
grain.inputs["Roughness"].default_value = 0.62
links.new(axis.outputs["Vector"], grain.inputs["Vector"])

ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.18, (0.075, 0.044, 0.024)),
        (0.75, (0.255, 0.150, 0.080)),
        (0.46, (0.148, 0.088, 0.048)),
    ]
):
    el = ramp.color_ramp.elements[i] if i < 2 else ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
links.new(grain.outputs["Fac"], ramp.inputs[0])

bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.36
bump.inputs["Distance"].default_value = 0.022
links.new(grain.outputs["Fac"], bump.inputs["Height"])
links.new(bump.outputs[0], surface.inputs["Normal"])


def bake(label, signal=None):
    img = bpy.data.images.new(label, width=512, height=512, alpha=False)
    img.colorspace_settings.name = "sRGB" if signal is not None else "Non-Color"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    nodes.active = tex
    if signal is not None:
        emission = nodes.new("ShaderNodeEmission")
        links.new(signal, emission.inputs["Color"])
        links.new(emission.outputs[0], output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT")
        nodes.remove(emission)
    else:
        links.new(surface.outputs[0], output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    img.filepath_raw = str(dest / (label + ".png"))
    img.file_format = "PNG"
    img.save()
    img.pack()
    return tex


albedo = bake("Golden bark color", ramp.outputs["Color"])
normal = bake("Golden bark normal")
for n in list(nodes):
    if n not in (albedo, normal, surface, output):
        nodes.remove(n)
links.new(albedo.outputs["Color"], surface.inputs["Base Color"])
normal_map = nodes.new("ShaderNodeNormalMap")
links.new(normal.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs[0], surface.inputs["Normal"])
links.new(surface.outputs[0], output.inputs["Surface"])

# Wrap foliage in "canopy" empty so Three.js automatically fades foliage when pets walk underneath
canopy_empty = bpy.data.objects.new("canopy", None)
bpy.context.collection.objects.link(canopy_empty)
leaves.parent = canopy_empty

all_meshes = [trunk, leaves]
zs = []
xs = []
ys = []
for o in all_meshes:
    o.data.calc_loop_triangles()
    print(o.name, len(o.data.loop_triangles), "triangles")
    for v in o.data.vertices:
        co = o.matrix_world @ v.co
        xs.append(co.x)
        ys.append(co.y)
        zs.append(co.z)
print(
    "GOLD_TREE_V1",
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
