"""Sculpt and export Moonbay coastal blue-spruce pine tree (pine v1) in Blender."""
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
rng = random.Random(61429)


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


bark = Part("Coastal cedar trunk and buttressed roots")
needles = Part("Blue-spruce layered bough skirts and leader spire")


def mix(a, b, f):
    return tuple(l * (1.0 - f) + r * f for l, r in zip(a, b))


def branch(points, radii, sides=10, flared=False, anchor_min_z=-0.06):
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
            rr = radii[i] * turns[j] * (1.30 if flared and i == 0 and j % 2 == 0 else 1.0)
            v = p + rr * (X * math.cos(a) + Y * math.sin(a))
            v.z = max(anchor_min_z, v.z)
            tone = 0.90 + 0.12 * rng.random()
            ring.append(bark.vertex(v, (tone, tone * 0.98, tone * 0.96)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            bark.face((lo[j], lo[k], hi[k], hi[j]))
    bark.face(tuple(reversed(rings[0])))
    bark.face(tuple(rings[-1]))


# Straight-ish wind-charactered cedar spire trunk tapering deep into apex foliage
branch(
    [
        (0.0, 0.0, -0.052),
        (0.01, -0.01, 0.24),
        (0.03, -0.02, 0.95),
        (0.02, 0.01, 1.85),
        (-0.02, 0.02, 2.85),
        (-0.01, 0.01, 3.85),
        (0.01, -0.01, 4.75),
        (0.00, 0.00, 5.20),
    ],
    [0.295, 0.245, 0.205, 0.170, 0.135, 0.095, 0.056, 0.038],
    14,
    True,
    -0.056,
)

for angle_deg, rad in [(22, 0.44), (108, 0.46), (198, 0.42), (288, 0.45)]:
    ang = math.radians(angle_deg)
    rx, ry = math.cos(ang) * rad, math.sin(ang) * rad
    branch(
        [(rx, ry, -0.056), (rx * 0.68, ry * 0.68, 0.05), (rx * 0.34, ry * 0.34, 0.19), (rx * 0.05, ry * 0.05, 0.40)],
        [0.040, 0.098, 0.135, 0.118],
        8,
        False,
        -0.058,
    )

# Calibrated ACESFilmic blue-spruce palette
PINE_DEEP = (0.048, 0.185, 0.155)
PINE_MID = (0.098, 0.350, 0.245)
PINE_HIGH = (0.215, 0.525, 0.345)


def spruce_tint(z, sun_bias):
    f = max(0.02, min(0.98, (z - 1.05) / 4.65 * 0.44 + sun_bias * 0.56))
    if f < 0.48:
        return mix(PINE_DEEP, PINE_MID, f / 0.48)
    return mix(PINE_MID, PINE_HIGH, (f - 0.48) / 0.52)


def add_core_bell(z_bot, z_top, r_bot, r_top, wob_phase):
    """Closed manifold central spruce skirt bell preventing hollow gaps between radial boughs."""
    steps_z = 6
    segs_c = 18
    rings = []
    for k in range(steps_z):
        t = k / (steps_z - 1)
        z = z_bot + (z_top - z_bot) * t
        rad = r_bot * (1.0 - t) + r_top * t
        rad *= 1.0 + 0.06 * math.sin(t * math.pi)
        row = []
        for j in range(segs_c):
            a = math.tau * j / segs_c + wob_phase
            rr = rad * (0.94 + 0.08 * math.sin(5 * a + t * 2.5))
            pt = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
            shade = 0.16 + 0.52 * t
            row.append(needles.vertex(pt, spruce_tint(z, shade)))
        rings.append(row)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(segs_c):
            kn = (j + 1) % segs_c
            needles.face((lo[j], lo[kn], hi[kn], hi[j]))
    bot_c = needles.vertex(Vector((0.0, 0.0, z_bot + 0.08)), spruce_tint(z_bot, 0.06))
    top_c = needles.vertex(Vector((0.0, 0.0, z_top + 0.04)), spruce_tint(z_top, 0.85))
    for j in range(segs_c):
        kn = (j + 1) % segs_c
        needles.face((bot_c, rings[0][kn], rings[0][j]))
        needles.face((top_c, rings[-1][j], rings[-1][kn]))


def add_spruce_bough_fan(anchor, yaw, length, width, thick, droop, sun_lift):
    """Build a closed manifold, arched & scalloped conifer needle spray radiating from trunk."""
    dir_xy = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    side_xy = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
    # 5 longitudinal slices from deep trunk collar out to soft tapered frond tip
    slices = [
        (0.00, 0.36, 0.58, 0.14),
        (0.28, 0.82, 0.96, 0.08),
        (0.56, 1.00, 0.84, -0.02),
        (0.82, 0.72, 0.54, -0.18),
        (0.98, 0.28, 0.26, -0.32),
    ]
    cross_segs = 10
    rings = []
    for t, w_mul, h_mul, z_curve in slices:
        cx_pt = anchor + dir_xy * (length * t) + Vector((0.0, 0.0, z_curve * droop))
        row = []
        for j in range(cross_segs):
            ang = math.tau * j / cross_segs
            # Flatten bottom slightly and ridge upper spine like natural evergreen boughs
            sx = math.cos(ang) * width * w_mul
            sz_raw = math.sin(ang)
            sz = (sz_raw * (0.95 if sz_raw >= 0 else 0.58)) * thick * h_mul
            # Add gentle needle scallop ripples along lateral frond edges
            edge_scallop = 1.0 + 0.10 * math.sin(4.0 * t * math.pi + j * 1.1)
            pt = cx_pt + side_xy * (sx * edge_scallop) + Vector((0.0, 0.0, sz))
            is_top = 0.5 + 0.5 * sz_raw
            tip_bright = 0.25 * t
            shade = min(0.98, max(0.06, 0.18 + is_top * 0.54 + tip_bright + sun_lift))
            row.append(needles.vertex(pt, spruce_tint(pt.z, shade)))
        rings.append(row)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(cross_segs):
            jn = (j + 1) % cross_segs
            needles.face((lo[j], lo[jn], hi[jn], hi[j]))
    base_cap = needles.vertex(anchor - dir_xy * 0.08, spruce_tint(anchor.z, 0.05))
    tip_cap = needles.vertex(
        anchor + dir_xy * (length * 1.04) + Vector((0.0, 0.0, -0.36 * droop)),
        spruce_tint(anchor.z - 0.36 * droop, min(0.99, 0.78 + sun_lift)),
    )
    for j in range(cross_segs):
        jn = (j + 1) % cross_segs
        needles.face((base_cap, rings[0][jn], rings[0][j]))
        needles.face((tip_cap, rings[-1][j], rings[-1][jn]))


# 5 gracefully stepped evergreen tiers spanning z=1.18m..5.72m
tiers = [
    # (z_anchor, fan_count, r_core_bot, r_core_top, core_h, bough_len, bough_w, bough_thick, droop, phase, sun_lift)
    (1.48, 11, 1.02, 0.56, 1.10, 1.54, 0.54, 0.34, 0.72, 0.10, 0.00),
    (2.30, 10, 0.86, 0.46, 1.05, 1.28, 0.48, 0.32, 0.64, 0.44, 0.04),
    (3.12, 9,  0.68, 0.36, 0.96, 1.02, 0.42, 0.28, 0.54, 0.78, 0.08),
    (3.92, 8,  0.48, 0.24, 0.84, 0.74, 0.34, 0.24, 0.42, 1.15, 0.12),
    (4.64, 7,  0.30, 0.14, 0.68, 0.46, 0.25, 0.19, 0.30, 1.52, 0.16),
]

for t_idx, (z_anc, count, rc_b, rc_t, core_h, blen, bw, bth, droop, phase, slift) in enumerate(tiers):
    add_core_bell(z_anc - 0.32, z_anc + core_h - 0.22, rc_b, rc_t, phase)
    for k in range(count):
        yaw = phase + math.tau * k / count + rng.uniform(-0.08, 0.08)
        z_jit = z_anc + rng.uniform(-0.06, 0.06)
        l_jit = blen * rng.uniform(0.92, 1.07)
        d_jit = droop * rng.uniform(0.88, 1.12)
        add_spruce_bough_fan(Vector((0.0, 0.0, z_jit)), yaw, l_jit, bw, bth, d_jit, slift + 0.04 * (k % 2))

# Graceful slender pine leader spire crowning apex cleanly to z=5.75m
add_core_bell(4.92, 5.72, 0.26, 0.025, 0.3)

parts = [bark, needles]
all_verts = [v for p in parts for v in p.verts]
lo = [min(v[k] for v in all_verts) for k in range(3)]
hi = [max(v[k] for v in all_verts) for k in range(3)]
dims = (3.15, 3.15, 5.75)
cx = (lo[0] + hi[0]) * 0.5
cy = (lo[1] + hi[1]) * 0.5
min_z_target = -0.050
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


trunk = bark.finish(base_vcol_mat("Cedar coastal bark", 0.84))
foliage = needles.finish(base_vcol_mat("Blue-spruce pine needles", 0.78))

bm_foliage = bmesh.new()
bm_foliage.from_mesh(foliage.data)
bmesh.ops.recalc_face_normals(bm_foliage, faces=bm_foliage.faces)
uv_lay = bm_foliage.loops.layers.uv.new("UVMap")
for face in bm_foliage.faces:
    n = face.normal
    anx, any_, anz = abs(n.x), abs(n.y), abs(n.z)
    for loop in face.loops:
        co = loop.vert.co
        if anz >= anx and anz >= any_:
            u, v = co.x * 0.82, co.y * 0.82
        elif anx >= any_:
            u, v = co.y * 0.82, co.z * 0.82
        else:
            u, v = co.x * 0.82, co.z * 0.82
        loop[uv_lay].uv = (u, v)
bm_foliage.to_mesh(foliage.data)
bm_foliage.free()
foliage.data.update()

bpy.context.view_layer.objects.active = trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size = 0.016
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth = True
smooth_mod = trunk.modifiers.new("Rounded cedar root buttresses", "SMOOTH")
smooth_mod.factor = 0.45
smooth_mod.iterations = 2
bpy.ops.object.modifier_apply(modifier=smooth_mod.name)
dec_mod = trunk.modifiers.new("Runtime bark topology", "DECIMATE")
dec_mod.ratio = min(1.0, 2200.0 / max(1, 2 * len(trunk.data.polygons)))
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
    img.filepath_raw = str(dest.resolve() / (label + ".png"))
    img.file_format = "PNG"
    img.save()
    img.pack()
    return tex


# Bake Warm Coastal Cedar Bark
b_mat = trunk.data.materials[0]
bn, bl = b_mat.node_tree.nodes, b_mat.node_tree.links
b_surf, b_out = bn.get("Principled BSDF"), bn.get("Material Output")
for n in list(bn):
    if n not in (b_surf, b_out):
        bn.remove(n)

b_coords = bn.new("ShaderNodeTexCoord")
b_axis = bn.new("ShaderNodeVectorMath")
b_axis.operation = "MULTIPLY"
b_axis.inputs[1].default_value = (3.8, 3.8, 0.42)
bl.new(b_coords.outputs["Object"], b_axis.inputs[0])

b_grain = bn.new("ShaderNodeTexNoise")
b_grain.inputs["Scale"].default_value = 6.8
b_grain.inputs["Detail"].default_value = 4.0
b_grain.inputs["Roughness"].default_value = 0.65
bl.new(b_axis.outputs["Vector"], b_grain.inputs["Vector"])

b_ramp = bn.new("ShaderNodeValToRGB")
b_ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.22, (0.135, 0.068, 0.044)),
        (0.84, (0.395, 0.228, 0.140)),
        (0.54, (0.285, 0.155, 0.095)),
    ]
):
    el = b_ramp.color_ramp.elements[i] if i < 2 else b_ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
bl.new(b_grain.outputs["Fac"], b_ramp.inputs[0])

b_bump = bn.new("ShaderNodeBump")
b_bump.inputs["Strength"].default_value = 0.48
b_bump.inputs["Distance"].default_value = 0.024
bl.new(b_grain.outputs["Fac"], b_bump.inputs["Height"])
bl.new(b_bump.outputs[0], b_surf.inputs["Normal"])

b_albedo = bake_img(trunk, b_mat, "Cedar bark color", True, b_ramp.outputs["Color"])
b_normal = bake_img(trunk, b_mat, "Cedar bark normal", False)
for n in list(bn):
    if n not in (b_albedo, b_normal, b_surf, b_out):
        bn.remove(n)
bl.new(b_albedo.outputs["Color"], b_surf.inputs["Base Color"])
b_surf.inputs["Roughness"].default_value = 0.84
b_nm = bn.new("ShaderNodeNormalMap")
b_nm.inputs["Strength"].default_value = 1.0
bl.new(b_normal.outputs["Color"], b_nm.inputs["Color"])
bl.new(b_nm.outputs[0], b_surf.inputs["Normal"])
bl.new(b_surf.outputs[0], b_out.inputs["Surface"])

# Bake seamless tileable spruce needle spray albedo + normal on auxiliary quad
quad_mesh = bpy.data.meshes.new("BakeQuad")
bm_q = bmesh.new()
qverts = [bm_q.verts.new((0, 0, 0)), bm_q.verts.new((1, 0, 0)), bm_q.verts.new((1, 1, 0)), bm_q.verts.new((0, 1, 0))]
qf = bm_q.faces.new(qverts)
quv = bm_q.loops.layers.uv.new("UVMap")
for loop, uv_co in zip(qf.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
    loop[quv].uv = uv_co
bm_q.to_mesh(quad_mesh)
bm_q.free()

quad_obj = bpy.data.objects.new("NeedleTexBaker", quad_mesh)
scene.collection.objects.link(quad_obj)
q_mat = bpy.data.materials.new("NeedleBakerMat")
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

# Fine needle sprig Voronoi cells + sharp high-frequency spruce grain
q_vor = qn.new("ShaderNodeTexVoronoi")
q_vor.feature = "F1"
q_vor.inputs["Scale"].default_value = 3.2
q_vor.inputs["Randomness"].default_value = 0.88
ql.new(torus_vec.outputs["Vector"], q_vor.inputs["Vector"])

q_noise = qn.new("ShaderNodeTexNoise")
q_noise.inputs["Scale"].default_value = 9.5
q_noise.inputs["Detail"].default_value = 4.0
q_noise.inputs["Roughness"].default_value = 0.65
ql.new(torus_vec.outputs["Vector"], q_noise.inputs["Vector"])

inv_vor = qn.new("ShaderNodeMath")
inv_vor.operation = "SUBTRACT"
inv_vor.inputs[0].default_value = 1.0
ql.new(q_vor.outputs["Distance"], inv_vor.inputs[1])

mix_all = qn.new("ShaderNodeMix")
mix_all.data_type = "FLOAT"
mix_all.inputs["Factor"].default_value = 0.38
ql.new(inv_vor.outputs["Value"], mix_all.inputs["A"])
ql.new(q_noise.outputs["Fac"], mix_all.inputs["B"])

q_ramp = qn.new("ShaderNodeValToRGB")
q_ramp.color_ramp.interpolation = "EASE"
for i, (pos, c) in enumerate(
    [
        (0.24, (0.50, 0.56, 0.54)),
        (0.78, (1.00, 1.00, 0.98)),
        (0.52, (0.82, 0.86, 0.84)),
    ]
):
    el = q_ramp.color_ramp.elements[i] if i < 2 else q_ramp.color_ramp.elements.new(pos)
    el.position = pos
    el.color = (*c, 1.0)
ql.new(mix_all.outputs["Result"], q_ramp.inputs[0])

q_bump = qn.new("ShaderNodeBump")
q_bump.inputs["Strength"].default_value = 0.85
q_bump.inputs["Distance"].default_value = 0.048
ql.new(mix_all.outputs["Result"], q_bump.inputs["Height"])
ql.new(q_bump.outputs[0], q_surf.inputs["Normal"])

n_albedo = bake_img(quad_obj, q_mat, "Spruce needle stipple", True, q_ramp.outputs["Color"])
n_normal = bake_img(quad_obj, q_mat, "Spruce needle normal", False)

bpy.data.objects.remove(quad_obj, do_unlink=True)
bpy.data.meshes.remove(quad_mesh)
bpy.data.materials.remove(q_mat)

f_mat = foliage.data.materials[0]
fn_nodes, fn_links = f_mat.node_tree.nodes, f_mat.node_tree.links
f_surf, f_out = fn_nodes.get("Principled BSDF"), fn_nodes.get("Material Output")
for n in list(fn_nodes):
    if n not in (f_surf, f_out):
        fn_nodes.remove(n)

vcol = fn_nodes.new("ShaderNodeVertexColor")
vcol.layer_name = "Tint"
tex_fa = fn_nodes.new("ShaderNodeTexImage")
tex_fa.image = n_albedo.image
mul_node = fn_nodes.new("ShaderNodeMix")
mul_node.data_type = "RGBA"
mul_node.blend_type = "MULTIPLY"
mul_node.inputs["Factor"].default_value = 1.0
fn_links.new(vcol.outputs["Color"], mul_node.inputs["A"])
fn_links.new(tex_fa.outputs["Color"], mul_node.inputs["B"])
fn_links.new(mul_node.outputs["Result"], f_surf.inputs["Base Color"])
f_surf.inputs["Roughness"].default_value = 0.78

tex_fn = fn_nodes.new("ShaderNodeTexImage")
tex_fn.image = n_normal.image
f_nm = fn_nodes.new("ShaderNodeNormalMap")
f_nm.inputs["Strength"].default_value = 1.05
fn_links.new(tex_fn.outputs["Color"], f_nm.inputs["Color"])
fn_links.new(f_nm.outputs[0], f_surf.inputs["Normal"])
fn_links.new(f_surf.outputs[0], f_out.inputs["Surface"])

canopy_empty = bpy.data.objects.new("canopy", None)
bpy.context.collection.objects.link(canopy_empty)
foliage.parent = canopy_empty

all_meshes = [trunk, foliage]
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
    "PINE_V1",
    (round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4), round(max(zs) - min(zs), 4)),
    "minZ=",
    round(min(zs), 4),
    "center=",
    (round((min(xs) + max(xs)) / 2, 4), round((min(ys) + max(ys)) / 2, 4)),
)

bpy.ops.wm.save_as_mainfile(filepath=str(dest / "pine.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(dest / "pine.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
    export_tangents=True,
    export_vertex_color="MATERIAL",
)
