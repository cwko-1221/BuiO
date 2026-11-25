"""Sculpt and export Moonbay pink blossom tree (pink-tree v3) in Blender."""
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

dest = Path(sys.argv[sys.argv.index("--") + 1])
dest.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(83953)


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
crown = Part("Sakura blossom clouds and overlapping petal clusters")


def mix(a, b, f):
    return tuple(l * (1.0 - f) + r * f for l, r in zip(a, b))


def branch(points, radii, sides=12, flared=False, anchor_min_z=-0.06):
    path = [Vector(p) for p in points]
    rings = []
    turns = [0.92 + 0.16 * rng.random() for _ in range(sides)]
    for i, p in enumerate(path):
        d = (path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]).normalized()
        up_ref = Vector((0, 1, 0)) if abs(d.y) < 0.92 else Vector((1, 0, 0))
        X = d.cross(up_ref).normalized()
        Y = d.cross(X)
        ring = []
        for j in range(sides):
            a = math.tau * j / sides
            rr = radii[i] * turns[j] * (1.28 if flared and i == 0 and j % 3 == 0 else 1.0)
            v = p + rr * (X * math.cos(a) + Y * math.sin(a))
            v.z = max(anchor_min_z, v.z)
            # Keep bark vertex tint warm-neutral (~0.88..1.04) so baked ACES cherry bark reads clearly
            tone = 0.88 + 0.14 * (j % 2) * 0.4 + 0.08 * rng.random()
            ring.append(bark.vertex(v, (tone, tone * 0.98, tone * 0.96)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bark.face((lo[j], lo[k], hi[k], hi[j]))
    bark.face(tuple(reversed(rings[0])))
    bark.face(tuple(rings[-1]))


# Low-forking gnarled cherry trunk curving smoothly into main V-fork crotch at z=2.2m (no central pole ramming ceiling!)
branch(
    [
        (0.0, 0.0, -0.048),
        (0.02, -0.01, 0.22),
        (0.08, -0.04, 0.68),
        (0.04, 0.04, 1.24),
        (-0.04, 0.06, 1.78),
        (-0.02, 0.02, 2.24),
    ],
    [0.37, 0.31, 0.255, 0.220, 0.175, 0.118],
    14,
    True,
    -0.056,
)

for angle_deg, rad in [(14, 0.58), (82, 0.55), (154, 0.63), (226, 0.53), (302, 0.59)]:
    ang = math.radians(angle_deg)
    rx, ry = math.cos(ang) * rad, math.sin(ang) * rad
    branch(
        [(rx, ry, -0.056), (rx * 0.72, ry * 0.72, 0.04), (rx * 0.38, ry * 0.38, 0.18), (rx * 0.06, ry * 0.06, 0.42)],
        [0.038, 0.112, 0.156, 0.138],
        8,
        False,
        -0.058,
    )

# Wide-spreading layered sakura umbrella crown (dims ~ 5.40 x 5.00 x 5.55)
# Tier 1: sweeping wide lower horizontal sakura cloud shelves (z ~ 2.98 - 3.30)
# Tier 2: broad lateral mid-canopy umbrella waist (z ~ 3.66 - 4.02, stays wide!)
# Tier 3: soft wide upper terrace + gentle cloud dome (z ~ 4.34 - 5.02, broad rounded crest instead of conical spire)
patches = [
    # Belly core vault pillows (raised cleanly to z~3.50m so under-canopy reveals open arched bough forks instead of low flat slab!)
    ((0.52, 0.42, 3.48), (1.20, 1.12, 0.62), 0.42, (0.04, 0.04)),
    ((-0.56, 0.34, 3.50), (1.20, 1.12, 0.62), 1.95, (-0.04, 0.04)),
    ((0.02, -0.56, 3.46), (1.20, 1.12, 0.62), 2.75, (0.00, -0.05)),
    ((0.00, 0.02, 3.62), (1.28, 1.22, 0.64), 1.10, (0.00, 0.00)),
    # Tier 1: lower perimeter umbrella pads
    ((1.72, -0.48, 3.16), (1.14, 1.00, 0.62), 0.28, (0.10, -0.04)),
    ((-1.76, -0.42, 3.20), (1.14, 1.00, 0.62), 1.42, (-0.10, -0.04)),
    ((-1.32, 1.34, 3.26), (1.10, 0.98, 0.62), 2.12, (-0.08, 0.08)),
    ((1.38, 1.28, 3.22), (1.12, 0.98, 0.62), 0.76, (0.08, 0.08)),
    ((-0.16, -1.52, 3.18), (1.12, 0.98, 0.60), 1.85, (-0.02, -0.08)),
    ((0.16, 1.52, 3.28), (1.10, 0.98, 0.62), 2.75, (0.02, 0.08)),
    ((-1.04, -1.20, 3.22), (1.08, 0.96, 0.60), 0.95, (-0.06, -0.06)),
    # Tier 2: broad lateral sakura cloud terrace (keeps iconic wide cherry-tree waist)
    ((1.58, 0.34, 3.74), (1.08, 0.96, 0.64), 0.52, (0.08, 0.02)),
    ((-1.60, 0.38, 3.78), (1.08, 0.96, 0.64), 2.45, (-0.08, 0.03)),
    ((0.94, -1.06, 3.80), (1.08, 0.96, 0.62), 1.15, (0.06, -0.05)),
    ((-0.88, -1.00, 3.84), (1.08, 0.96, 0.62), 0.18, (-0.05, -0.05)),
    ((0.86, 1.00, 3.88), (1.08, 0.96, 0.64), 1.94, (0.05, 0.05)),
    ((-0.90, 0.98, 3.92), (1.08, 0.96, 0.64), 0.92, (-0.05, 0.05)),
    ((0.02, 0.04, 3.96), (1.14, 1.04, 0.66), 1.38, (0.00, 0.00)),
    # Tier 3: wide soft-domed upper cloud deck (avoids steep gumdrop cone)
    ((0.70, -0.26, 4.36), (1.08, 0.96, 0.58), 1.56, (0.04, -0.02)),
    ((-0.72, -0.20, 4.42), (1.08, 0.96, 0.58), 2.85, (-0.04, -0.02)),
    ((0.18, 0.64, 4.44), (1.04, 0.94, 0.56), 0.64, (0.02, 0.03)),
    ((-0.20, -0.70, 4.38), (1.04, 0.94, 0.56), 2.10, (-0.02, -0.03)),
    ((0.06, 0.08, 4.72), (1.24, 1.14, 0.58), 0.48, (0.01, 0.01)),
]

# Graceful wide-sweeping Y/V arched cherry limbs splitting from trunk crotch into outer & inner pillow hearts
boughs = [
    ([(0.02, 0.00, 1.52), (0.46, -0.14, 2.08), (0.98, -0.28, 2.72), (1.42, -0.40, 3.16)], [0.135, 0.102, 0.068, 0.036], (0.86, -0.88, 3.84)),
    ([(-0.02, 0.02, 1.64), (-0.48, -0.12, 2.18), (-1.02, -0.26, 2.80), (-1.46, -0.36, 3.22)], [0.132, 0.100, 0.066, 0.036], (-0.84, -0.86, 3.88)),
    ([(-0.03, 0.04, 1.82), (-0.42, 0.44, 2.38), (-0.86, 0.86, 2.94), (-1.18, 1.18, 3.28)], [0.122, 0.092, 0.062, 0.034], (-0.78, 0.88, 3.92)),
    ([(0.02, 0.03, 1.94), (0.44, 0.42, 2.48), (0.90, 0.82, 2.98), (1.24, 1.12, 3.26)], [0.118, 0.088, 0.060, 0.034], (0.76, 0.90, 3.90)),
    ([(-0.02, 0.01, 2.14), (-0.08, -0.44, 2.74), (-0.12, -0.94, 3.18), (-0.14, -1.32, 3.30)], [0.105, 0.076, 0.052, 0.034], (0.48, -0.44, 3.60)),
    ([(-0.02, 0.02, 2.18), (0.02, 0.48, 2.82), (0.08, 0.96, 3.22), (0.14, 1.32, 3.34)], [0.102, 0.074, 0.050, 0.034], (-0.44, 0.36, 3.64)),
]
for points, radii, twig_goal in boughs:
    branch(points, radii, 10)
    p0 = Vector(points[-2])
    goal = Vector(twig_goal)
    c1 = p0.lerp(goal, 0.38) + Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.04))
    c2 = p0.lerp(goal, 0.74) + Vector((rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), 0.03))
    branch([p0, c1, c2, goal], [radii[-2] * 0.72, 0.046, 0.036, 0.028], 8)


# Unified sunlit sakura palette for ACESFilmic (no dark muddy mauve shadows vs bright bumps)
SAKURA_LOW = (0.60, 0.24, 0.35)
SAKURA_MID = (0.89, 0.44, 0.57)
SAKURA_HIGH = (0.99, 0.74, 0.81)


def tint(z, shade):
    f = max(0.02, min(0.98, (z - 2.68) / 2.52 * 0.46 + shade * 0.54))
    if f < 0.46:
        return mix(SAKURA_LOW, SAKURA_MID, f / 0.46)
    return mix(SAKURA_MID, SAKURA_HIGH, (f - 0.46) / 0.54)


def billow_lobe(origin, extent, phase, lean, rings_spec=None, n=24, noise_amp=1.0):
    """Build a closed manifold sculpted blossom cushion with soft organic multi-lobe billowing."""
    pos = Vector(origin)
    if rings_spec is None:
        rings_spec = [
            (-0.74, 0.28),
            (-0.56, 0.66),
            (-0.34, 0.88),
            (-0.10, 0.98),
            (0.14, 1.00),
            (0.38, 0.94),
            (0.60, 0.78),
            (0.78, 0.52),
            (0.92, 0.24),
        ]
    rings = []
    for k, (height, radius) in enumerate(rings_spec):
        ring = []
        for j in range(n):
            q = math.tau * j / n
            a = q + k * 0.09 + phase
            wob = 1.0 + noise_amp * (
                0.14 * math.sin(3 * a + phase)
                + 0.11 * math.cos(5 * a - k * 0.62 + phase * 0.7)
                + 0.07 * math.sin(7 * a + k * 0.84)
                + 0.04 * math.cos(9 * a - phase * 1.3)
            )
            r = radius * wob
            xx = math.cos(a) * extent[0] * r
            yy = math.sin(a) * extent[1] * r
            zz = (
                height
                + noise_amp * (
                    0.09 * math.sin(5 * a + height * 2.4) * r
                    + 0.06 * math.cos(3 * a - phase) * r
                    + 0.04 * math.sin(7 * a + k * 0.5) * r
                )
            ) * extent[2]
            p = pos + Vector((xx + lean[0] * height, yy + lean[1] * height, zz))
            # Soft ambient+top highlight without abrupt patchy contrast
            shade = 0.28 + 0.60 * (height + 0.74) / 1.66 + rng.uniform(-0.025, 0.025)
            ring.append(crown.vertex(p, tint(p.z, shade)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            crown.face((lo[j], lo[k], hi[k], hi[j]))
    a_v = crown.vertex(pos + Vector((0.0, 0.0, -0.78 * extent[2])), tint(pos.z - 0.35, 0.16))
    b_v = crown.vertex(pos + Vector((lean[0], lean[1], 0.96 * extent[2])), tint(pos.z + 0.45, 0.88))
    for j in range(n):
        k = (j + 1) % n
        crown.face((a_v, rings[0][k], rings[0][j]))
        crown.face((b_v, rings[-1][j], rings[-1][k]))
    return rings


sub_specs = [
    (-0.72, 0.34),
    (-0.40, 0.78),
    (-0.04, 1.00),
    (0.36, 0.94),
    (0.72, 0.58),
]

for patch, (pose, size, angle, lean) in enumerate(patches):
    rings = billow_lobe(pose, size, angle, lean, n=16, noise_amp=0.95)
    center = Vector(pose)
    # Soft deeply-nested spherical blossom sub-lobes along outer rim and upper cap (never flat pancakes)
    for tier in (3, 6):
        count_tier = 3 if tier == 6 else 4
        for i in range(count_tier):
            idx = (i * (len(rings[tier]) // count_tier) + patch * 3 + tier * 4) % len(rings[tier])
            surface = Vector(crown.verts[rings[tier][idx]])
            radial = surface - center
            outward = radial.normalized()
            sub_center = surface - outward * (0.34 if tier < 6 else 0.30)
            r_sub = rng.uniform(0.48, 0.60)
            billow_lobe(
                sub_center,
                (r_sub * 1.12, r_sub * 1.06, r_sub * 0.84),
                rng.uniform(0, math.tau),
                (outward.x * 0.04, outward.y * 0.04),
                rings_spec=sub_specs,
                n=12,
                noise_amp=0.44,
            )

parts = [bark, crown]
all_verts = [v for p in parts for v in p.verts]
lo = [min(v[k] for v in all_verts) for k in range(3)]
hi = [max(v[k] for v in all_verts) for k in range(3)]
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


def base_vcol_mat(name, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Specular IOR Level"].default_value = 0.22
    v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    v.layer_name = "Tint"
    mat.node_tree.links.new(v.outputs["Color"], bs.inputs["Base Color"])
    return mat


trunk = bark.finish(base_vcol_mat("Cherry coastal bark", 0.82))
blossoms = crown.finish(base_vcol_mat("Sakura blossom clusters", 0.74))

bm_blossoms = bmesh.new()
bm_blossoms.from_mesh(blossoms.data)
bmesh.ops.recalc_face_normals(bm_blossoms, faces=bm_blossoms.faces)
uv_lay = bm_blossoms.loops.layers.uv.new("UVMap")
for face in bm_blossoms.faces:
    n = face.normal
    anx, any_, anz = abs(n.x), abs(n.y), abs(n.z)
    for loop in face.loops:
        co = loop.vert.co
        if anz >= anx and anz >= any_:
            u, v = co.x * 0.74, co.y * 0.74
        elif anx >= any_:
            u, v = co.y * 0.74, co.z * 0.74
        else:
            u, v = co.x * 0.74, co.z * 0.74
        loop[uv_lay].uv = (u, v)
bm_blossoms.to_mesh(blossoms.data)
bm_blossoms.free()
blossoms.data.update()

bpy.context.view_layer.objects.active = trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size = 0.015
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth = True
smooth_mod = trunk.modifiers.new("Rounded cherry crotches and roots", "SMOOTH")
smooth_mod.factor = 0.40
smooth_mod.iterations = 2
bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
dec_mod = trunk.modifiers.new("Runtime bark topology", "DECIMATE")
dec_mod.ratio = min(1.0, 4400.0 / max(1, 2 * len(trunk.data.polygons)))
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


# Bake Warm Russet Cherry Bark with Distinct Horizontal Lenticels
b_mat = trunk.data.materials[0]
bn, bl = b_mat.node_tree.nodes, b_mat.node_tree.links
b_surf, b_out = bn.get("Principled BSDF"), bn.get("Material Output")
for n in list(bn):
    if n not in (b_surf, b_out):
        bn.remove(n)

b_coords = bn.new("ShaderNodeTexCoord")

# Vertical bark furrows (stretched vertically along trunk)
b_axis = bn.new("ShaderNodeVectorMath")
b_axis.operation = "MULTIPLY"
b_axis.inputs[1].default_value = (2.8, 2.8, 0.55)
bl.new(b_coords.outputs["Object"], b_axis.inputs[0])

b_grain = bn.new("ShaderNodeTexNoise")
b_grain.inputs["Scale"].default_value = 5.6
b_grain.inputs["Detail"].default_value = 3.5
b_grain.inputs["Roughness"].default_value = 0.60
bl.new(b_axis.outputs["Vector"], b_grain.inputs["Vector"])

b_ramp = bn.new("ShaderNodeValToRGB")
b_ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.20, (0.145, 0.075, 0.052)),
        (0.82, (0.365, 0.212, 0.148)),
        (0.52, (0.260, 0.145, 0.100)),
    ]
):
    el = b_ramp.color_ramp.elements[i] if i < 2 else b_ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
bl.new(b_grain.outputs["Fac"], b_ramp.inputs[0])

# Signature horizontal cherry bark lenticel bands (compressed vertically, wide around circumference)
b_laxis = bn.new("ShaderNodeVectorMath")
b_laxis.operation = "MULTIPLY"
b_laxis.inputs[1].default_value = (1.1, 1.1, 16.0)
bl.new(b_coords.outputs["Object"], b_laxis.inputs[0])

b_lent = bn.new("ShaderNodeTexNoise")
b_lent.inputs["Scale"].default_value = 4.2
b_lent.inputs["Detail"].default_value = 2.0
b_lent.inputs["Distortion"].default_value = 0.35
bl.new(b_laxis.outputs["Vector"], b_lent.inputs["Vector"])

b_lramp = bn.new("ShaderNodeValToRGB")
b_lramp.color_ramp.elements[0].position = 0.64
b_lramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
b_lramp.color_ramp.elements[1].position = 0.77
b_lramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
bl.new(b_lent.outputs["Fac"], b_lramp.inputs[0])

b_lcol = bn.new("ShaderNodeMix")
b_lcol.data_type = "RGBA"
b_lcol.blend_type = "MIX"
b_lcol.inputs["B"].default_value = (0.515, 0.328, 0.228, 1.0)
bl.new(b_lramp.outputs["Color"], b_lcol.inputs["Factor"])
bl.new(b_ramp.outputs["Color"], b_lcol.inputs["A"])

# Combine vertical furrows & recessed lenticel seams for crisp normal map
b_hcomb = bn.new("ShaderNodeMath")
b_hcomb.operation = "MULTIPLY_ADD"
b_hcomb.inputs[1].default_value = 0.38
bl.new(b_lramp.outputs["Color"], b_hcomb.inputs[0])
bl.new(b_grain.outputs["Fac"], b_hcomb.inputs[2])

b_bump = bn.new("ShaderNodeBump")
b_bump.inputs["Strength"].default_value = 0.44
b_bump.inputs["Distance"].default_value = 0.024
bl.new(b_hcomb.outputs["Value"], b_bump.inputs["Height"])
bl.new(b_bump.outputs[0], b_surf.inputs["Normal"])

b_albedo = bake_img(trunk, b_mat, "Cherry bark color", True, b_lcol.outputs["Result"])
b_normal = bake_img(trunk, b_mat, "Cherry bark normal", False)
for n in list(bn):
    if n not in (b_albedo, b_normal, b_surf, b_out):
        bn.remove(n)
bl.new(b_albedo.outputs["Color"], b_surf.inputs["Base Color"])
b_surf.inputs["Roughness"].default_value = 0.80
b_nm = bn.new("ShaderNodeNormalMap")
b_nm.inputs["Strength"].default_value = 1.0
bl.new(b_normal.outputs["Color"], b_nm.inputs["Color"])
bl.new(b_nm.outputs[0], b_surf.inputs["Normal"])
bl.new(b_surf.outputs[0], b_out.inputs["Surface"])

# Bake crisp tileable floral petal-stipple albedo + strong normal map on auxiliary quad
quad_mesh = bpy.data.meshes.new("BakeQuad")
bm_q = bmesh.new()
qverts = [bm_q.verts.new((0, 0, 0)), bm_q.verts.new((1, 0, 0)), bm_q.verts.new((1, 1, 0)), bm_q.verts.new((0, 1, 0))]
qf = bm_q.faces.new(qverts)
quv = bm_q.loops.layers.uv.new("UVMap")
for loop, uv_co in zip(qf.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
    loop[quv].uv = uv_co
bm_q.to_mesh(quad_mesh)
bm_q.free()

quad_obj = bpy.data.objects.new("PetalTexBaker", quad_mesh)
scene.collection.objects.link(quad_obj)
q_mat = bpy.data.materials.new("PetalBakerMat")
q_mat.use_nodes = True
quad_obj.data.materials.append(q_mat)
qn, ql = q_mat.node_tree.nodes, q_mat.node_tree.links
q_surf, q_out = qn.get("Principled BSDF"), qn.get("Material Output")

q_uv = qn.new("ShaderNodeTexCoord")
sep_uv = qn.new("ShaderNodeSeparateXYZ")
ql.new(q_uv.outputs["UV"], sep_uv.inputs["Vector"])


def trig_torus(sock, op_type, mult=1.0):
    m_tau = qn.new("ShaderNodeMath")
    m_tau.operation = "MULTIPLY"
    m_tau.inputs[1].default_value = math.tau
    ql.new(sock, m_tau.inputs[0])
    fn = qn.new("ShaderNodeMath")
    fn.operation = op_type
    ql.new(m_tau.outputs["Value"], fn.inputs[0])
    if mult != 1.0:
        mm = qn.new("ShaderNodeMath")
        mm.operation = "MULTIPLY"
        mm.inputs[1].default_value = mult
        ql.new(fn.outputs["Value"], mm.inputs[0])
        return mm.outputs["Value"]
    return fn.outputs["Value"]


tx_node = trig_torus(sep_uv.outputs["X"], "COSINE", 1.25)
ty_node = trig_torus(sep_uv.outputs["X"], "SINE", 1.25)
tz_add = qn.new("ShaderNodeMath")
tz_add.operation = "ADD"
ql.new(trig_torus(sep_uv.outputs["Y"], "COSINE", 1.25), tz_add.inputs[0])
ql.new(trig_torus(sep_uv.outputs["Y"], "SINE", 0.95), tz_add.inputs[1])
torus_vec = qn.new("ShaderNodeCombineXYZ")
ql.new(tx_node, torus_vec.inputs["X"])
ql.new(ty_node, torus_vec.inputs["Y"])
ql.new(tz_add.outputs["Value"], torus_vec.inputs["Z"])

# Primary floral cluster pockets (F1 cells -> crisp blossom tufts + deeper petal pockets)
q_vor_lg = qn.new("ShaderNodeTexVoronoi")
q_vor_lg.feature = "F1"
q_vor_lg.inputs["Scale"].default_value = 2.1
q_vor_lg.inputs["Randomness"].default_value = 0.88
ql.new(torus_vec.outputs["Vector"], q_vor_lg.inputs["Vector"])

# Fine crisp petal stipples inside clusters
q_vor_sm = qn.new("ShaderNodeTexVoronoi")
q_vor_sm.feature = "F1"
q_vor_sm.inputs["Scale"].default_value = 4.6
q_vor_sm.inputs["Randomness"].default_value = 0.84
ql.new(torus_vec.outputs["Vector"], q_vor_sm.inputs["Vector"])

q_noise = qn.new("ShaderNodeTexNoise")
q_noise.inputs["Scale"].default_value = 5.5
q_noise.inputs["Detail"].default_value = 3.2
ql.new(torus_vec.outputs["Vector"], q_noise.inputs["Vector"])

# Invert Distance -> dome height (1.0 at petal center, 0.0 in petal crevice)
inv_lg = qn.new("ShaderNodeMath")
inv_lg.operation = "SUBTRACT"
inv_lg.inputs[0].default_value = 1.0
ql.new(q_vor_lg.outputs["Distance"], inv_lg.inputs[1])

inv_sm = qn.new("ShaderNodeMath")
inv_sm.operation = "SUBTRACT"
inv_sm.inputs[0].default_value = 1.0
ql.new(q_vor_sm.outputs["Distance"], inv_sm.inputs[1])

mix_dome = qn.new("ShaderNodeMix")
mix_dome.data_type = "FLOAT"
mix_dome.inputs["Factor"].default_value = 0.44
ql.new(inv_lg.outputs["Value"], mix_dome.inputs["A"])
ql.new(inv_sm.outputs["Value"], mix_dome.inputs["B"])

mix_all = qn.new("ShaderNodeMix")
mix_all.data_type = "FLOAT"
mix_all.inputs["Factor"].default_value = 0.22
ql.new(mix_dome.outputs["Result"], mix_all.inputs["A"])
ql.new(q_noise.outputs["Fac"], mix_all.inputs["B"])

q_ramp = qn.new("ShaderNodeValToRGB")
q_ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.24, (0.50, 0.28, 0.36)),
        (0.74, (1.00, 0.98, 0.99)),
        (0.50, (0.86, 0.69, 0.76)),
    ]
):
    el = q_ramp.color_ramp.elements[i] if i < 2 else q_ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
ql.new(mix_all.outputs["Result"], q_ramp.inputs[0])

q_bump = qn.new("ShaderNodeBump")
q_bump.inputs["Strength"].default_value = 0.95
q_bump.inputs["Distance"].default_value = 0.065
ql.new(mix_all.outputs["Result"], q_bump.inputs["Height"])
ql.new(q_bump.outputs[0], q_surf.inputs["Normal"])

p_albedo = bake_img(quad_obj, q_mat, "Cherry petal stipple", True, q_ramp.outputs["Color"])
p_normal = bake_img(quad_obj, q_mat, "Cherry petal normal", False)

bpy.data.objects.remove(quad_obj, do_unlink=True)
bpy.data.meshes.remove(quad_mesh)
bpy.data.materials.remove(q_mat)

l_mat = blossoms.data.materials[0]
ln, ll = l_mat.node_tree.nodes, l_mat.node_tree.links
l_surf, l_out = ln.get("Principled BSDF"), ln.get("Material Output")
for n in list(ln):
    if n not in (l_surf, l_out):
        ln.remove(n)

vcol = ln.new("ShaderNodeVertexColor")
vcol.layer_name = "Tint"
tex_la = ln.new("ShaderNodeTexImage")
tex_la.image = p_albedo.image
mul_node = ln.new("ShaderNodeMix")
mul_node.data_type = "RGBA"
mul_node.blend_type = "MULTIPLY"
mul_node.inputs["Factor"].default_value = 1.0
ll.new(vcol.outputs["Color"], mul_node.inputs["A"])
ll.new(tex_la.outputs["Color"], mul_node.inputs["B"])
ll.new(mul_node.outputs["Result"], l_surf.inputs["Base Color"])
l_surf.inputs["Roughness"].default_value = 0.74

tex_ln = ln.new("ShaderNodeTexImage")
tex_ln.image = p_normal.image
l_nm = ln.new("ShaderNodeNormalMap")
l_nm.inputs["Strength"].default_value = 1.15
ll.new(tex_ln.outputs["Color"], l_nm.inputs["Color"])
ll.new(l_nm.outputs[0], l_surf.inputs["Normal"])
ll.new(l_surf.outputs[0], l_out.inputs["Surface"])

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
    "PINK_TREE_V3",
    (round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4), round(max(zs) - min(zs), 4)),
    "minZ=",
    round(min(zs), 4),
    "center=",
    (round((min(xs) + max(xs)) / 2, 4), round((min(ys) + max(ys)) / 2, 4)),
)

# Verify EVERY high branch tip (>2.6m) is enclosed in blossom foliage (no exposed branch stubs)
from mathutils.bvhtree import BVHTree
deps = bpy.context.evaluated_depsgraph_get()
bvh_crown = BVHTree.FromObject(blossoms, deps)
adj_t = {i: [] for i in range(len(trunk.data.vertices))}
for e in trunk.data.edges:
    adj_t[e.vertices[0]].append(e.vertices[1])
    adj_t[e.vertices[1]].append(e.vertices[0])
exposed_tips = []
for i, v in enumerate(trunk.data.vertices):
    if v.co.z > 2.6 and all(v.co.z >= trunk.data.vertices[nb].co.z - 0.002 for nb in adj_t[i]):
        clears = sum(
            1
            for dx, dy, dz in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1),(1,1,1),(-1,1,1),(1,-1,1),(-1,-1,1)]
            if bvh_crown.ray_cast(v.co, Vector((dx, dy, dz)).normalized(), 0.45)[0] is None
        )
        if clears > 0:
            exposed_tips.append((round(v.co.x, 2), round(v.co.y, 2), round(v.co.z, 2), clears))
print("EXPOSED_BRANCH_TIPS:", len(exposed_tips), exposed_tips)

bpy.ops.wm.save_as_mainfile(filepath=str(dest / "pink-tree.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(dest / "pink-tree.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
    export_tangents=True,
    export_vertex_color="MATERIAL",
)
