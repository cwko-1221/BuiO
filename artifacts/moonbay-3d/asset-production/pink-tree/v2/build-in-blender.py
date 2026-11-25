"""Sculpt and export Moonbay pink blossom tree (pink-tree v2) in Blender."""
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
rng = random.Random(83952)


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


# Low-forking gnarled cherry trunk curving smoothly into umbrella canopy heart
branch(
    [
        (0.0, 0.0, -0.045),
        (0.02, -0.01, 0.20),
        (0.08, -0.04, 0.68),
        (0.04, 0.04, 1.22),
        (-0.06, 0.08, 1.82),
        (-0.10, 0.04, 2.45),
        (-0.03, -0.04, 3.12),
        (0.05, -0.06, 3.78),
        (0.02, -0.01, 4.35),
    ],
    [0.36, 0.31, 0.255, 0.220, 0.185, 0.150, 0.115, 0.075, 0.040],
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

# Full 4-tier spreading umbrella sakura canopy (~47% tree height, z=2.70..5.45) with rich vertical billowing depth
patches = [
    # Lower perimeter blossom clusters (z ~ 3.05 - 3.38)
    ((1.66, -0.58, 3.08), (0.98, 0.86, 0.72), 0.28, (0.14, -0.06)),
    ((-1.72, -0.50, 3.18), (0.96, 0.88, 0.74), 1.42, (-0.14, -0.06)),
    ((-1.38, 1.38, 3.30), (0.94, 0.86, 0.72), 2.12, (-0.12, 0.10)),
    ((1.44, 1.28, 3.24), (0.96, 0.86, 0.72), 0.76, (0.12, 0.10)),
    ((-0.16, -1.56, 3.14), (0.96, 0.82, 0.70), 1.85, (-0.02, -0.12)),
    ((0.10, 1.58, 3.36), (0.94, 0.84, 0.72), 2.75, (0.02, 0.12)),
    # Mid full-bodied sakura cloud ring (z ~ 3.85 - 4.30)
    ((1.50, 0.36, 3.88), (0.94, 0.86, 0.74), 0.52, (0.10, 0.03)),
    ((-1.54, 0.40, 3.94), (0.94, 0.86, 0.74), 2.45, (-0.10, 0.04)),
    ((0.88, -0.92, 4.02), (0.92, 0.84, 0.74), 1.15, (0.06, -0.06)),
    ((-0.84, -0.82, 4.10), (0.94, 0.84, 0.74), 0.18, (-0.06, -0.05)),
    ((0.76, 0.86, 4.22), (0.94, 0.86, 0.76), 1.94, (0.05, 0.05)),
    ((-0.76, 0.84, 4.28), (0.94, 0.86, 0.76), 0.92, (-0.05, 0.05)),
    # Upper wide umbrella sakura crown & soft peak billows (z ~ 4.65 - 5.35)
    ((0.52, -0.22, 4.72), (0.98, 0.90, 0.78), 1.56, (0.04, -0.02)),
    ((-0.56, -0.16, 4.78), (0.96, 0.90, 0.78), 2.85, (-0.04, -0.02)),
    ((0.06, 0.14, 4.98), (1.08, 0.98, 0.82), 0.48, (0.02, 0.02)),
    ((-0.24, -0.08, 5.18), (0.86, 0.82, 0.68), 2.28, (-0.02, 0.02)),
]

# Plump curved sweeping cherry boughs terminating cleanly inside clouds (tips >= 0.025m)
boughs = [
    ([(0.05, -0.03, 1.28), (0.58, -0.24, 1.80), (1.16, -0.44, 2.38), (1.52, -0.54, 2.82), (1.66, -0.58, 3.16)], [0.148, 0.125, 0.092, 0.058, 0.028], patches[8][0]),
    ([(-0.04, 0.03, 1.44), (-0.62, -0.24, 1.96), (-1.22, -0.42, 2.52), (-1.56, -0.48, 2.94), (-1.70, -0.50, 3.24)], [0.144, 0.120, 0.088, 0.056, 0.028], patches[9][0]),
    ([(-0.05, 0.07, 1.68), (-0.54, 0.56, 2.20), (-1.04, 1.00, 2.74), (-1.30, 1.28, 3.12), (-1.38, 1.38, 3.36)], [0.132, 0.108, 0.078, 0.050, 0.026], patches[11][0]),
    ([(0.04, 0.05, 1.86), (0.58, 0.54, 2.34), (1.10, 0.96, 2.82), (1.36, 1.18, 3.10), (1.44, 1.28, 3.32)], [0.126, 0.102, 0.074, 0.048, 0.026], patches[10][0]),
    ([(-0.06, -0.04, 2.06), (-0.12, -0.64, 2.48), (-0.16, -1.20, 2.92), (-0.16, -1.52, 3.22)], [0.108, 0.086, 0.058, 0.026], patches[9][0]),
    ([(-0.06, 0.05, 2.36), (-0.08, 0.66, 2.80), (0.04, 1.22, 3.18), (0.10, 1.54, 3.44)], [0.100, 0.080, 0.054, 0.026], patches[10][0]),
    ([(0.02, -0.02, 2.68), (0.62, 0.12, 3.18), (1.18, 0.28, 3.58), (1.48, 0.36, 3.92)], [0.092, 0.074, 0.050, 0.025], patches[12][0]),
    ([(-0.03, -0.01, 2.82), (-0.64, 0.14, 3.30), (-1.22, 0.30, 3.68), (-1.52, 0.40, 3.98)], [0.088, 0.070, 0.048, 0.025], patches[13][0]),
]
for points, radii, twig_goal in boughs:
    branch(points, radii, 10)
    mid = Vector(points[-3])
    goal = Vector(twig_goal)
    bent = mid.lerp(goal, 0.54) + Vector((rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), -0.03))
    branch([mid, bent, goal], [0.062, 0.044, 0.028], 8)


# Soft luminous pastel sakura palette calibrated for Three.js ACESFilmic
SAKURA_LOW = (0.435, 0.145, 0.212)
SAKURA_MID = (0.830, 0.370, 0.492)
SAKURA_HIGH = (0.975, 0.680, 0.752)


def tint(z, shade):
    f = max(0.02, min(0.98, (z - 2.65) / 2.75 * 0.44 + shade * 0.56))
    if f < 0.46:
        return mix(SAKURA_LOW, SAKURA_MID, f / 0.46)
    return mix(SAKURA_MID, SAKURA_HIGH, (f - 0.46) / 0.54)


def clump(origin, extent, phase, lean):
    pos = Vector(origin)
    sections = [
        (-0.68, 0.30),
        (-0.50, 0.70),
        (-0.24, 0.95),
        (0.04, 1.00),
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
            r = radius * (
                1.0
                + 0.12 * math.sin(3 * a + phase)
                + 0.09 * math.cos(5 * a - k * 0.66)
                + 0.055 * math.sin(7 * a + k * 0.88)
                + 0.022 * rng.random()
            )
            xx = math.cos(a) * extent[0] * r
            yy = math.sin(a) * extent[1] * r
            zz = (
                height
                + 0.10 * math.sin(5 * a + height * 2.2) * r
                + 0.065 * math.cos(3 * a - phase) * r
                + 0.042 * (rng.random() - 0.5)
            ) * extent[2]
            p = pos + Vector((xx + lean[0] * height, yy + lean[1] * height, zz))
            shade = 0.24 + 0.58 * (height + 0.68) / 1.62 + rng.uniform(-0.08, 0.08)
            ring.append(crown.vertex(p, tint(p.z, shade)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            crown.face((lo[j], lo[k], hi[k], hi[j]))
    a_v = crown.vertex(pos + Vector((0.0, 0.0, -0.74 * extent[2])), tint(pos.z - 0.5, 0.10))
    b_v = crown.vertex(pos + Vector((lean[0], lean[1], 0.98 * extent[2])), tint(pos.z + 0.70, 0.88))
    for j in range(n):
        k = (j + 1) % n
        crown.face((a_v, rings[0][k], rings[0][j]))
        crown.face((b_v, rings[-1][j], rings[-1][k]))
    return rings


def blossom_puff(center_pos, outward, rx, ry, rz, light):
    u = Vector((-outward.y, outward.x, 0.0))
    if u.length < 1e-4:
        u = Vector((1.0, 0.0, 0.0))
    else:
        u.normalize()
    v_ax = outward.cross(u).normalized()
    segs = 6
    rings_lo = []
    for z_frac, r_frac in [(-0.45, 0.65), (0.25, 1.0)]:
        row = []
        for s in range(segs):
            ang = math.tau * s / segs
            wob = 1.0 + 0.15 * math.sin(3 * ang)
            pt = center_pos + u * (math.cos(ang) * rx * r_frac * wob) + v_ax * (math.sin(ang) * ry * r_frac * wob) + outward * (z_frac * rz)
            row.append(crown.vertex(pt, tint(pt.z, min(0.99, light + z_frac * 0.14))))
        rings_lo.append(row)
    bot_c = crown.vertex(center_pos - outward * (rz * 0.55), tint(center_pos.z, max(0.05, light - 0.12)))
    top_c = crown.vertex(center_pos + outward * (rz * 0.90), tint(center_pos.z, min(0.99, light + 0.22)))
    for s in range(segs):
        sn = (s + 1) % segs
        crown.face((bot_c, rings_lo[0][sn], rings_lo[0][s]))
        crown.face((rings_lo[0][s], rings_lo[0][sn], rings_lo[1][sn], rings_lo[1][s]))
        crown.face((top_c, rings_lo[1][s], rings_lo[1][sn]))


for patch, (pose, size, angle, lean) in enumerate(patches):
    rings = clump(pose, size, angle, lean)
    center = Vector(pose)
    for tier in (1, 2, 3, 4, 5, 6):
        count_tier = 3 if tier in (1, 6) else 5
        for i in range(count_tier):
            idx = (i * (len(rings[tier]) // count_tier) + patch * 3 + tier * 5) % len(rings[tier])
            surface = Vector(crown.verts[rings[tier][idx]])
            outward = (surface - center).normalized()
            light = rng.uniform(0.42, 0.92) + (0.08 if tier >= 5 else 0.0)
            tuft_center = surface - outward * 0.03
            r_base = rng.uniform(0.14, 0.23)
            blossom_puff(tuft_center, outward, r_base * 1.15, r_base * 0.95, r_base * 0.78, light)
            if (i + tier) % 2 == 0:
                tangent = Vector((-outward.y, outward.x, 0.35)).normalized()
                blossom_puff(tuft_center + tangent * (r_base * 0.72), (outward + tangent * 0.35).normalized(), r_base * 0.85, r_base * 0.80, r_base * 0.70, min(0.99, light + 0.06))

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
    bs.inputs["Specular IOR Level"].default_value = 0.24
    v = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    v.layer_name = "Tint"
    mat.node_tree.links.new(v.outputs["Color"], bs.inputs["Base Color"])
    return mat


trunk = bark.finish(base_vcol_mat("Cherry coastal bark", 0.86))
blossoms = crown.finish(base_vcol_mat("Sakura blossom clusters", 0.70))

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
            u, v = co.x * 0.44, co.y * 0.44
        elif anx >= any_:
            u, v = co.y * 0.44, co.z * 0.44
        else:
            u, v = co.x * 0.44, co.z * 0.44
        loop[uv_lay].uv = (u, v)
bm_blossoms.to_mesh(blossoms.data)
bm_blossoms.free()
blossoms.data.update()

bpy.context.view_layer.objects.active = trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size = 0.034
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth = True
smooth_mod = trunk.modifiers.new("Rounded cherry crotches and roots", "SMOOTH")
smooth_mod.factor = 0.78
smooth_mod.iterations = 5
bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
dec_mod = trunk.modifiers.new("Runtime bark topology", "DECIMATE")
dec_mod.ratio = min(1.0, 4200.0 / max(1, 2 * len(trunk.data.polygons)))
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


# Bake Bark
b_mat = trunk.data.materials[0]
bn, bl = b_mat.node_tree.nodes, b_mat.node_tree.links
b_surf, b_out = bn.get("Principled BSDF"), bn.get("Material Output")
for n in list(bn):
    if n not in (b_surf, b_out):
        bn.remove(n)

b_coords = bn.new("ShaderNodeTexCoord")
b_axis = bn.new("ShaderNodeVectorMath")
b_axis.operation = "MULTIPLY"
b_axis.inputs[1].default_value = (2.6, 2.6, 0.68)
bl.new(b_coords.outputs["Object"], b_axis.inputs[0])

b_grain = bn.new("ShaderNodeTexNoise")
b_grain.inputs["Scale"].default_value = 5.4
b_grain.inputs["Detail"].default_value = 3.2
b_grain.inputs["Roughness"].default_value = 0.62
bl.new(b_axis.outputs["Vector"], b_grain.inputs["Vector"])

b_ramp = bn.new("ShaderNodeValToRGB")
b_ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.18, (0.058, 0.038, 0.032)),
        (0.76, (0.195, 0.122, 0.098)),
        (0.46, (0.118, 0.075, 0.060)),
    ]
):
    el = b_ramp.color_ramp.elements[i] if i < 2 else b_ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
bl.new(b_grain.outputs["Fac"], b_ramp.inputs[0])

b_bump = bn.new("ShaderNodeBump")
b_bump.inputs["Strength"].default_value = 0.34
b_bump.inputs["Distance"].default_value = 0.020
bl.new(b_grain.outputs["Fac"], b_bump.inputs["Height"])
bl.new(b_bump.outputs[0], b_surf.inputs["Normal"])

b_albedo = bake_img(trunk, b_mat, "Cherry bark color", True, b_ramp.outputs["Color"])
b_normal = bake_img(trunk, b_mat, "Cherry bark normal", False)
for n in list(bn):
    if n not in (b_albedo, b_normal, b_surf, b_out):
        bn.remove(n)
bl.new(b_albedo.outputs["Color"], b_surf.inputs["Base Color"])
b_nm = bn.new("ShaderNodeNormalMap")
bl.new(b_normal.outputs["Color"], b_nm.inputs["Color"])
bl.new(b_nm.outputs[0], b_surf.inputs["Normal"])
bl.new(b_surf.outputs[0], b_out.inputs["Surface"])

# Bake seamless tileable sakura petal stipple albedo + normal on auxiliary quad
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

tx_node = trig_torus(sep_uv.outputs["X"], "COSINE", 1.2)
ty_node = trig_torus(sep_uv.outputs["X"], "SINE", 1.2)
tz_add = qn.new("ShaderNodeMath")
tz_add.operation = "ADD"
ql.new(trig_torus(sep_uv.outputs["Y"], "COSINE", 1.2), tz_add.inputs[0])
ql.new(trig_torus(sep_uv.outputs["Y"], "SINE", 0.9), tz_add.inputs[1])
torus_vec = qn.new("ShaderNodeCombineXYZ")
ql.new(tx_node, torus_vec.inputs["X"])
ql.new(ty_node, torus_vec.inputs["Y"])
ql.new(tz_add.outputs["Value"], torus_vec.inputs["Z"])

q_vor = qn.new("ShaderNodeTexVoronoi")
q_vor.feature = "SMOOTH_F1"
q_vor.inputs["Scale"].default_value = 4.2
q_vor.inputs["Smoothness"].default_value = 0.44
ql.new(torus_vec.outputs["Vector"], q_vor.inputs["Vector"])

q_noise = qn.new("ShaderNodeTexNoise")
q_noise.inputs["Scale"].default_value = 7.0
q_noise.inputs["Detail"].default_value = 3.0
ql.new(torus_vec.outputs["Vector"], q_noise.inputs["Vector"])

q_mix = qn.new("ShaderNodeMath")
q_mix.operation = "MULTIPLY_ADD"
q_mix.inputs[1].default_value = 0.62
ql.new(q_vor.outputs["Distance"], q_mix.inputs[0])
ql.new(q_noise.outputs["Fac"], q_mix.inputs[2])

q_ramp = qn.new("ShaderNodeValToRGB")
q_ramp.color_ramp.elements[0].position = 0.28
q_ramp.color_ramp.elements[0].color = (0.85, 0.78, 0.80, 1.0)
q_ramp.color_ramp.elements[1].position = 0.94
q_ramp.color_ramp.elements[1].color = (1.00, 0.98, 0.99, 1.0)
ql.new(q_mix.outputs["Value"], q_ramp.inputs[0])

q_bump = qn.new("ShaderNodeBump")
q_bump.inputs["Strength"].default_value = 0.36
q_bump.inputs["Distance"].default_value = 0.022
ql.new(q_mix.outputs["Value"], q_bump.inputs["Height"])
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

tex_ln = ln.new("ShaderNodeTexImage")
tex_ln.image = p_normal.image
l_nm = ln.new("ShaderNodeNormalMap")
l_nm.inputs["Strength"].default_value = 0.65
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
    "PINK_TREE_V2",
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
