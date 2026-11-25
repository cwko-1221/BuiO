"""Sculpt and export Moonbay pink blossom tree (pink-tree) in Blender."""
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
rng = random.Random(83941)


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


bark = Part("Cherry blossom trunk, spreading roots and boughs")
crown = Part("Sakura blossom clouds and petal clusters")


def mix(a, b, f):
    return tuple(l * (1.0 - f) + r * f for l, r in zip(a, b))


def branch(points, radii, sides=10, flared=False, anchor_min_z=-0.06):
    path = [Vector(p) for p in points]
    rings = []
    turns = [0.89 + 0.21 * rng.random() for _ in range(sides)]
    groove = [0.82 + 0.25 * rng.random() for _ in range(sides)]
    for i, p in enumerate(path):
        d = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        up_ref = Vector((0, 1, 0)) if abs(d.y) < 0.92 else Vector((1, 0, 0))
        X = d.cross(up_ref).normalized()
        Y = d.cross(X)
        ring = []
        for j in range(sides):
            a = math.tau * j / sides
            rr = radii[i] * turns[j] * (1.25 if flared and i == 0 and j % 3 == 0 else 1.0)
            v = p + rr * (X * math.cos(a) + Y * math.sin(a))
            v.z = max(anchor_min_z, v.z)
            tone = groove[j] * (0.93 + 0.12 * rng.random())
            base = (0.20, 0.125, 0.105) if i < 2 else (0.24, 0.150, 0.125)
            ring.append(bark.vertex(v, tuple(tone * c for c in base)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bark.face((lo[j], lo[k], hi[k], hi[j]))
    bark.face(tuple(reversed(rings[0])))
    bark.face(tuple(rings[-1]))


# Low-forking gnarled cherry trunk curving gracefully beneath a wide horizontal blossom canopy
branch(
    [
        (0.0, 0.0, -0.045),
        (0.02, -0.01, 0.22),
        (0.09, -0.05, 0.72),
        (0.05, 0.04, 1.30),
        (-0.06, 0.09, 1.92),
        (-0.12, 0.05, 2.55),
        (-0.04, -0.04, 3.22),
        (0.06, -0.08, 3.88),
        (0.04, -0.02, 4.48),
    ],
    [0.36, 0.31, 0.255, 0.220, 0.185, 0.148, 0.110, 0.072, 0.025],
    14,
    True,
    -0.055,
)

for angle_deg, rad in [(12, 0.56), (78, 0.54), (152, 0.62), (225, 0.52), (302, 0.58)]:
    ang = math.radians(angle_deg)
    rx, ry = math.cos(ang) * rad, math.sin(ang) * rad
    branch(
        [(rx, ry, -0.055), (rx * 0.70, ry * 0.70, 0.04), (rx * 0.36, ry * 0.36, 0.18), (rx * 0.05, ry * 0.05, 0.42)],
        [0.036, 0.110, 0.155, 0.135],
        8,
        False,
        -0.058,
    )

# Overlapping soft horizontalさくら/cherry cloud cushions (14 clouds for broad 5.4x5.0x5.55 parasol spread)
patches = [
    ((1.72, -0.58, 3.45), (0.94, 0.78, 0.50), 0.28, (0.14, -0.08)),
    ((-1.78, -0.52, 3.60), (0.92, 0.80, 0.52), 1.42, (-0.15, -0.06)),
    ((-1.42, 1.44, 3.74), (0.88, 0.78, 0.50), 2.12, (-0.12, 0.12)),
    ((1.48, 1.32, 3.68), (0.90, 0.76, 0.50), 0.76, (0.12, 0.12)),
    ((-0.18, -1.62, 3.55), (0.92, 0.72, 0.48), 1.85, (-0.02, -0.14)),
    ((0.12, 1.66, 3.88), (0.88, 0.74, 0.50), 2.75, (0.02, 0.14)),
    ((1.58, 0.38, 4.18), (0.86, 0.76, 0.52), 0.52, (0.12, 0.03)),
    ((-1.62, 0.42, 4.24), (0.86, 0.76, 0.52), 2.45, (-0.12, 0.04)),
    ((0.92, -0.96, 4.28), (0.84, 0.74, 0.52), 1.15, (0.07, -0.07)),
    ((-0.86, -0.84, 4.38), (0.86, 0.74, 0.52), 0.18, (-0.07, -0.06)),
    ((0.78, 0.88, 4.52), (0.86, 0.78, 0.54), 1.94, (0.06, 0.06)),
    ((-0.78, 0.86, 4.58), (0.86, 0.76, 0.54), 0.92, (-0.06, 0.06)),
    ((0.08, -0.06, 4.86), (1.02, 0.94, 0.62), 0.48, (0.02, 0.0)),
    ((-0.26, 0.22, 5.04), (0.82, 0.78, 0.54), 2.28, (-0.02, 0.03)),
]

# Sweeping horizontal cherry scaffold boughs terminating inside cloud centers
boughs = [
    ([(0.06, -0.04, 1.38), (0.58, -0.24, 1.98), (1.16, -0.44, 2.66), (1.52, -0.54, 3.16), (1.70, -0.58, 3.45)], [0.145, 0.122, 0.088, 0.052, 0.018], patches[8][0]),
    ([(-0.04, 0.03, 1.56), (-0.62, -0.26, 2.15), (-1.22, -0.44, 2.80), (-1.58, -0.50, 3.28), (-1.75, -0.52, 3.60)], [0.142, 0.118, 0.086, 0.050, 0.018], patches[9][0]),
    ([(-0.05, 0.08, 1.82), (-0.54, 0.58, 2.42), (-1.04, 1.06, 3.04), (-1.32, 1.36, 3.52), (-1.42, 1.44, 3.74)], [0.130, 0.106, 0.074, 0.044, 0.016], patches[11][0]),
    ([(0.04, 0.06, 2.02), (0.58, 0.56, 2.58), (1.12, 1.02, 3.12), (1.38, 1.24, 3.48), (1.48, 1.32, 3.68)], [0.124, 0.098, 0.068, 0.040, 0.016], patches[10][0]),
    ([(-0.08, -0.04, 2.24), (-0.14, -0.68, 2.74), (-0.18, -1.24, 3.22), (-0.18, -1.58, 3.55)], [0.102, 0.082, 0.050, 0.016], patches[9][0]),
    ([(-0.08, 0.06, 2.58), (-0.10, 0.70, 3.12), (0.04, 1.28, 3.58), (0.12, 1.62, 3.88)], [0.092, 0.074, 0.046, 0.015], patches[10][0]),
    ([(0.02, -0.02, 2.95), (0.64, 0.08, 3.44), (1.22, 0.28, 3.88), (1.56, 0.38, 4.18)], [0.084, 0.068, 0.042, 0.014], patches[12][0]),
    ([(-0.04, -0.02, 3.10), (-0.68, 0.12, 3.58), (-1.26, 0.30, 3.98), (-1.58, 0.42, 4.24)], [0.080, 0.064, 0.040, 0.014], patches[13][0]),
]
for points, radii, twig_goal in boughs:
    branch(points, radii, 9)
    mid = Vector(points[-3])
    goal = Vector(twig_goal)
    bent = mid.lerp(goal, 0.56) + Vector((rng.uniform(-0.14, 0.14), rng.uniform(-0.14, 0.14), -0.06))
    branch([mid, bent, goal], [0.045, 0.027, 0.012], 7)


# Cherry blossom sakura pink palette calibrated for Three.js ACESFilmic (0xfca0b2 harmony)
SAKURA_LOW = (0.375, 0.118, 0.175)
SAKURA_MID = (0.760, 0.305, 0.415)
SAKURA_HIGH = (0.955, 0.625, 0.705)


def tint(z, shade):
    f = max(0.02, min(0.98, (z - 2.95) / 2.25 * 0.46 + shade * 0.54))
    if f < 0.46:
        return mix(SAKURA_LOW, SAKURA_MID, f / 0.46)
    return mix(SAKURA_MID, SAKURA_HIGH, (f - 0.46) / 0.54)


def clump(origin, extent, phase, lean):
    pos = Vector(origin)
    sections = [
        (-0.58, 0.32),
        (-0.40, 0.80),
        (-0.12, 0.99),
        (0.16, 1.00),
        (0.45, 0.86),
        (0.72, 0.60),
        (0.90, 0.30),
    ]
    rings = []
    n = 22
    for k, (height, radius) in enumerate(sections):
        ring = []
        for j in range(n):
            q = math.tau * j / n
            a = q + k * 0.09 + phase
            r = radius * (
                1.0
                + 0.088 * math.sin(3 * a + phase)
                + 0.068 * math.sin(5 * a - k * 0.58)
                + 0.042 * math.cos(2 * a + phase * 1.5)
                + 0.020 * rng.random()
            )
            xx = math.cos(a) * extent[0] * r
            yy = math.sin(a) * extent[1] * r
            zz = (height + 0.08 * math.sin(3 * a + height * 2.0) * r + 0.045 * (rng.random() - 0.5)) * extent[2]
            p = pos + Vector((xx + lean[0] * height, yy + lean[1] * height, zz))
            shade = 0.22 + 0.58 * (height + 0.58) / 1.48 + rng.uniform(-0.10, 0.10)
            ring.append(crown.vertex(p, tint(p.z, shade)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            crown.face((lo[j], lo[k], hi[k], hi[j]))
    a_v = crown.vertex(pos + Vector((0.0, 0.0, -0.66 * extent[2])), tint(pos.z - 0.45, 0.08))
    b_v = crown.vertex(pos + Vector((lean[0], lean[1], 0.96 * extent[2])), tint(pos.z + 0.65, 0.82))
    for j in range(n):
        k = (j + 1) % n
        crown.face((a_v, rings[0][k], rings[0][j]))
        crown.face((b_v, rings[-1][j], rings[-1][k]))
    return rings


def blossom_sprig(base, forward, size, light):
    # Rounded 5-sided sakura petal tuft rather than narrow spiky blade
    side = Vector((-forward.y, forward.x, rng.uniform(-0.4, 0.4))).normalized()
    cross = side.cross(forward).normalized()
    width = size * rng.uniform(0.38, 0.52)
    peak = base + forward * size * 0.52 + cross * size * 0.14
    profile = [
        base + forward * size * 0.08,
        base + forward * size * 0.42 + side * width * 0.85,
        base + forward * size * 0.82 + side * width * 0.62,
        base + forward * size,
        base + forward * size * 0.80 - side * width * 0.60,
        base + forward * size * 0.40 - side * width * 0.82,
    ]
    indices = [crown.vertex(v, tint(v.z, min(0.98, light + rng.uniform(-0.06, 0.14)))) for v in profile]
    middle = crown.vertex(peak, tint(peak.z, min(0.99, light + 0.18)))
    for j in range(6):
        crown.face((indices[j], indices[(j + 1) % 6], middle), True)


for patch, (pose, size, angle, lean) in enumerate(patches):
    rings = clump(pose, size, angle, lean)
    center = Vector(pose)
    for i in range(14):
        tier = 2 + (i + patch) % 3
        surface = Vector(crown.verts[rings[tier][(i * 7 + patch * 3) % len(rings[tier])]])
        outward = (surface - center).normalized()
        side = Vector((-outward.y, outward.x, 0.0)).normalized()
        root = surface - outward * 0.16
        light = rng.uniform(0.50, 0.94)
        for j, spread in enumerate((-0.58, 0.54, -0.18, 0.22) if i % 2 == 0 else (-0.48, 0.44, 0.04)):
            base = root + outward * (j * 0.016)
            tilt = Vector((0.0, 0.0, rng.uniform(-0.30, 0.48)))
            forward = (outward + side * spread + tilt).normalized()
            blossom_sprig(base, forward, rng.uniform(0.20, 0.34), light + j * 0.03)

parts = [bark, crown]
all_verts = [v for p in parts for v in p.verts]
lo = [min(v[k] for v in all_verts) for k in range(3)]
hi = [max(v[k] for v in all_verts) for k in range(3)]
# Target dims: [5.40, 5.00, 5.55], root tips anchored at -0.052m for slope grounding
dims = (5.40, 5.00, 5.55)
cx = (lo[0] + hi[0]) * 0.5
cy = (lo[1] + hi[1]) * 0.5
min_z_target = -0.052
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
    bs.inputs["Specular IOR Level"].default_value = 0.25
    v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    v.layer_name = "Tint"
    v.location = (-360, 300)
    mat.node_tree.links.new(v.outputs["Color"], bs.inputs["Base Color"])
    return mat


trunk = bark.finish(material("Cherry coastal bark", 0.86))
blossoms = crown.finish(material("Sakura blossom clusters", 0.72))

bpy.context.view_layer.objects.active = trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size = 0.036
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth = True
smooth_mod = trunk.modifiers.new("Rounded cherry crotches and roots", "SMOOTH")
smooth_mod.factor = 0.78
smooth_mod.iterations = 5
bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
dec_mod = trunk.modifiers.new("Runtime bark topology", "DECIMATE")
dec_mod.ratio = min(1.0, 3150.0 / max(1, 2 * len(trunk.data.polygons)))
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

# Subtle horizontal cherry lenticels + furrowed trunk bark
coords = nodes.new("ShaderNodeTexCoord")
axis = nodes.new("ShaderNodeVectorMath")
axis.operation = "MULTIPLY"
axis.inputs[1].default_value = (2.6, 2.6, 0.68)
links.new(coords.outputs["Object"], axis.inputs[0])

grain = nodes.new("ShaderNodeTexNoise")
grain.inputs["Scale"].default_value = 5.4
grain.inputs["Detail"].default_value = 3.2
grain.inputs["Roughness"].default_value = 0.62
links.new(axis.outputs["Vector"], grain.inputs["Vector"])

ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.18, (0.056, 0.036, 0.030)),
        (0.76, (0.188, 0.118, 0.095)),
        (0.46, (0.112, 0.072, 0.058)),
    ]
):
    el = ramp.color_ramp.elements[i] if i < 2 else ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
links.new(grain.outputs["Fac"], ramp.inputs[0])

bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.34
bump.inputs["Distance"].default_value = 0.020
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


albedo = bake("Cherry bark color", ramp.outputs["Color"])
normal = bake("Cherry bark normal")
for n in list(nodes):
    if n not in (albedo, normal, surface, output):
        nodes.remove(n)
links.new(albedo.outputs["Color"], surface.inputs["Base Color"])
normal_map = nodes.new("ShaderNodeNormalMap")
links.new(normal.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs[0], surface.inputs["Normal"])
links.new(surface.outputs[0], output.inputs["Surface"])

canopy_empty = bpy.data.objects.new("canopy", None)
bpy.context.collection.objects.link(canopy_empty)
blossoms.parent = canopy_empty

all_meshes = [trunk, blossoms]
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
    "PINK_TREE_V1",
    (round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4), round(max(zs) - min(zs), 4)),
    "minZ=",
    round(min(zs), 4),
    "center=",
    (round((min(xs) + max(xs)) / 2, 4), round((min(ys) + max(ys)) / 2, 4)),
)

bpy.ops.wm.save_as_mainfile(filepath=str(dest / "pink-tree.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(dest / "pink-tree.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
    export_tangents=True,
    export_vertex_color="MATERIAL",
)
