# Adds the skeleton, airway and diaphragm to the lungs already in the scene.
# Run after bl-lungs.py. Same axis convention: Z up, -Y forward.
import bpy
import math
from mathutils import Vector

CAGE_TOP = 3.42
CAGE_BOTTOM = 1.62
DIAPHRAGM_BASE = 1.72
DOME_RISE = {-1: 0.54, 1: 0.46}
RIB_COUNT = 12
CARINA_Z = 2.96


def cage_inner(z):
    t = min(max((z - CAGE_BOTTOM) / (CAGE_TOP - CAGE_BOTTOM), 0.0), 1.0)
    width = 0.82 - 0.42 * (t ** 1.6) + 0.05 * math.sin(math.pi * t)
    return width, width * 0.72


def diaphragm_top(x, y):
    rx, ry = cage_inner(DIAPHRAGM_BASE + 0.25)
    side = 1 if x >= 0 else -1
    centre = side * rx * 0.44
    across = math.hypot((x - centre) / (rx * 0.62), y / (ry * 0.84))
    return DIAPHRAGM_BASE + DOME_RISE[side] * math.sqrt(max(1.0 - across * across, 0.0))


def drop_old():
    for obj in list(bpy.data.objects):
        if not obj.name.startswith('lung_'):
            bpy.data.objects.remove(obj, do_unlink=True)


def flat_profile(name, half_width, half_depth):
    """An ellipse used as a bevel profile, so a rib comes out as a band."""
    existing = bpy.data.objects.get(name)
    if existing:
        return existing
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.resolution_u = 1
    spline = curve.splines.new('POLY')
    count = 8
    spline.points.add(count - 1)
    for index in range(count):
        angle = 2.0 * math.pi * index / count
        spline.points[index].co = (math.cos(angle) * half_width, math.sin(angle) * half_depth, 0.0, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def curve_tube(name, points, radius, resolution=12, smooth=True, profile=None, around=2):
    """A bevelled curve converted to mesh: the clean way to build a rib or a duct."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = max(2, resolution // 3)
    if profile is not None:
        curve.bevel_mode = 'OBJECT'
        curve.bevel_object = profile
    else:
        curve.bevel_depth = radius
        # Radial segments cost faces on every step of the sweep, so small ducts
        # and rings get far fewer than a lung-sized form needs.
        curve.bevel_resolution = around
    curve.use_fill_caps = True
    spline = curve.splines.new('NURBS')
    spline.points.add(len(points) - 1)
    for index, point in enumerate(points):
        spline.points[index].co = (point[0], point[1], point[2], 1.0)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points))
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    if smooth:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
    return obj


def open_elliptical_shell(name, levels, segments=64, opening_degrees=92.0):
    """A thin posterior/lateral body shell with a true anterior cutaway.

    ``levels`` is a list of ``(z, half_width, half_depth)`` rings.  A fourth
    value may set the anterior opening for an individual ring.  Front is -Y in
    Blender, so the missing sector is centred on -pi/2.  Letting the opening
    narrow through the trapezius and neck removes the old detachable collar
    silhouette while the wider chest window keeps the organs unobstructed.
    """
    verts = []
    for level in levels:
        z, rx, ry = level[:3]
        gap = math.radians(level[3] if len(level) > 3 else opening_degrees)
        start = -math.pi / 2.0 + gap / 2.0
        end = 3.0 * math.pi / 2.0 - gap / 2.0
        for step in range(segments + 1):
            angle = start + (end - start) * step / segments
            verts.append((math.cos(angle) * rx, math.sin(angle) * ry, z))
    faces = []
    stride = segments + 1
    for ring in range(len(levels) - 1):
        for step in range(segments):
            a = ring * stride + step
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    solidify = obj.modifiers.new('Skin thickness', 'SOLIDIFY')
    solidify.thickness = 0.018
    solidify.offset = 1
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.shade_smooth()
    return obj


def ellipsoid(name, location, scale, segments=48, rings=32, rotation=(0.0, 0.0, 0.0)):
    """Create an applied, smooth ellipsoid for joined anatomical landmarks."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    return obj


def joined_voxel_union(name, members, voxel=0.044):
    """Fuse overlapping facial volumes so nose, face and cranium have no seam."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = members[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.data.remesh_voxel_size = voxel
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    smooth = obj.modifiers.new('Anatomical smoothing', 'SMOOTH')
    smooth.factor = 0.34
    smooth.iterations = 3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    bpy.ops.object.shade_smooth()
    return obj


RIB_STANDOFF = 0.05


def rib_path(level, side, sweep=0.74, steps=9):
    """From the vertebra, round the outside of the cavity, forward and down.

    The radius at every step is the cavity's own radius plus a standoff, so the
    rib is always outside the pleural space and can never cross a lung.
    """
    top = CAGE_TOP - level * (CAGE_TOP - CAGE_BOTTOM - 0.3)
    drop = 0.34 + level * 0.36
    points = []
    for step in range(steps):
        t = step / (steps - 1)
        z = top - drop * (t ** 1.9)
        rx, ry = cage_inner(z)
        angle = math.pi * sweep * t
        points.append((
            side * (rx + RIB_STANDOFF) * math.sin(angle),
            (ry + RIB_STANDOFF) * math.cos(angle),
            z,
        ))
    return points


drop_old()
built = []
# Where each rib's cartilage ends, so the false ribs below can join onto it.
anterior_tip = {}
rib_profile = flat_profile('ribProfile', 0.038, 0.016)
costal_profile = flat_profile('costalProfile', 0.032, 0.015)

# ---------------------------------------------------------- clinical body shell
# This is deliberately an anatomical cutaway rather than a cartoon mannequin.
# The anterior chest is open; the posterior/lateral skin and the head remain as
# translucent orientation surfaces in the web scene.
body_levels = [
    # Pelvis, abdomen, thorax, shoulder slope and neck are one continuous
    # surface.  The fourth number is the front opening at that height.
    (0.10, 0.75, 0.58, 94), (0.28, 0.84, 0.65, 94),
    (0.50, 0.83, 0.67, 94), (0.70, 0.78, 0.64, 94),
    (0.88, 0.77, 0.65, 94),
    (1.06, 0.83, 0.70, 94), (1.32, 0.88, 0.73, 94),
    (1.60, 0.89, 0.72, 94), (1.84, 0.87, 0.70, 94),
    (2.10, 0.90, 0.76, 94), (2.42, 0.95, 0.83, 94),
    (2.74, 1.00, 0.88, 92), (3.00, 1.06, 0.89, 90),
    (3.22, 1.12, 0.84, 86), (3.40, 1.05, 0.75, 80),
    (3.56, 0.88, 0.63, 74), (3.70, 0.66, 0.48, 68),
    (3.82, 0.45, 0.34, 62), (3.94, 0.32, 0.26, 58),
    (4.10, 0.285, 0.23, 56), (4.26, 0.285, 0.225, 56),
    (4.38, 0.315, 0.245, 58),
]
built.append(open_elliptical_shell('body_trunk', body_levels, segments=72))

# Overlapping volumes are voxel-fused into one continuous facial surface.  The
# nose projects forward (-Y) with a sloping dorsum, alar tip and real nostril
# entrance positions used by the upper-airway tubes below.
head_parts = [
    # Neck transition is fused into the head so the jaw grows naturally out of
    # the neck instead of balancing on a visible tube.
    ellipsoid('neck_base', (0.0, 0.025, 4.24), (0.305, 0.245, 0.25), 40, 28),
    ellipsoid('neck_upper', (0.0, -0.005, 4.40), (0.285, 0.235, 0.23), 40, 28),
    ellipsoid('head_cranium', (0.0, 0.065, 4.92), (0.365, 0.34, 0.49)),
    ellipsoid('head_occiput', (0.0, 0.145, 4.89), (0.34, 0.30, 0.40), 44, 30),
    ellipsoid('head_face', (0.0, -0.12, 4.72), (0.29, 0.235, 0.335), 44, 30),
    ellipsoid('brow_R', (-0.135, -0.292, 4.86), (0.14, 0.065, 0.072), 32, 20),
    ellipsoid('brow_L', (0.135, -0.292, 4.86), (0.14, 0.065, 0.072), 32, 20),
    ellipsoid('cheek_R', (-0.16, -0.235, 4.71), (0.145, 0.12, 0.145), 36, 24),
    ellipsoid('cheek_L', (0.16, -0.235, 4.71), (0.145, 0.12, 0.145), 36, 24),
    ellipsoid('jaw_R', (-0.115, -0.145, 4.53), (0.155, 0.14, 0.19), 36, 24,
              rotation=(0.0, math.radians(-7), math.radians(-5))),
    ellipsoid('jaw_L', (0.115, -0.145, 4.53), (0.155, 0.14, 0.19), 36, 24,
              rotation=(0.0, math.radians(7), math.radians(5))),
    ellipsoid('head_chin', (0.0, -0.185, 4.40), (0.17, 0.15, 0.125), 40, 24),
    ellipsoid('nose_dorsum', (0.0, -0.335, 4.80), (0.055, 0.082, 0.155), 36, 24,
              rotation=(math.radians(-8), 0.0, 0.0)),
    ellipsoid('nose_tip', (0.0, -0.405, 4.68), (0.088, 0.086, 0.068), 36, 24),
    ellipsoid('ear_R', (-0.365, 0.015, 4.78), (0.055, 0.034, 0.12), 32, 22),
    ellipsoid('ear_L', (0.365, 0.015, 4.78), (0.055, 0.034, 0.12), 32, 22),
]
built.append(joined_voxel_union('body_head', head_parts, voxel=0.036))

# Very small eyelid and mouth landmarks keep the translucent head recognisable
# in the student view without giving the teaching model a cartoon expression.
for side in (-1, 1):
    built.append(curve_tube('face_detail_eye_%s' % ('R' if side < 0 else 'L'), [
        (side * 0.225, -0.326, 4.825),
        (side * 0.145, -0.344, 4.842),
        (side * 0.065, -0.326, 4.825),
    ], 0.008, resolution=12, around=3))
built.append(curve_tube('face_detail_mouth', [
    (-0.095, -0.328, 4.535),
    (0.0, -0.344, 4.520),
    (0.095, -0.328, 4.535),
], 0.007, resolution=12, around=3))

# Clavicles are respiratory landmarks: lung apices extend slightly above their
# medial thirds.  Their double curve is modelled here instead of drawn in JS.
for side in (-1, 1):
    built.append(curve_tube('clavicle_%s' % ('R' if side < 0 else 'L'), [
        (side * 0.09, -0.47, 3.36),
        (side * 0.30, -0.49, 3.40),
        (side * 0.55, -0.38, 3.38),
        (side * 0.78, -0.19, 3.30),
        (side * 0.90, -0.05, 3.25),
    ], 0.038, resolution=18, around=3))

# ---------------------------------------------------------------- rib cage
sternum_top = CAGE_TOP - 0.24
for index in range(RIB_COUNT):
    level = index / (RIB_COUNT - 1)
    floating = index >= 10
    sweep = 0.30 if index == 11 else (0.42 if index == 10 else 0.74)
    for side in (-1, 1):
        path = rib_path(level, side, sweep=sweep)
        built.append(curve_tube('rib_%d_%s' % (index + 1, 'R' if side < 0 else 'L'),
                                path, 0.026, resolution=10, profile=rib_profile))
        if floating:
            continue  # ribs 11 and 12 carry no cartilage
        tip = path[-1]
        if index < 7:
            # A true rib: its own cartilage runs up and in to the sternum.
            target = (side * 0.09, -cage_inner(tip[2])[1] * 0.94, sternum_top - index * 0.17)
        else:
            # A false rib: its cartilage joins the one above, and the chain of
            # those joins is the costal margin.
            above = anterior_tip.get(index - 1, {}).get(side)
            target = above if above else (side * 0.3, -cage_inner(tip[2])[1] * 0.98, tip[2] + 0.22)
        anterior_tip.setdefault(index, {})[side] = (
            (tip[0] + target[0]) / 2, (tip[1] + target[1]) / 2, (tip[2] + target[2]) / 2)
        mid = ((tip[0] + target[0]) / 2, (tip[1] + target[1]) / 2 - 0.05, (tip[2] + target[2]) / 2 - 0.04)
        built.append(curve_tube('costal_%d_%s' % (index + 1, 'R' if side < 0 else 'L'),
                                [tip, mid, target], 0.022, resolution=8, profile=costal_profile))

# The breastbone, as one continuous bone. Manubrium, body and xiphoid are
# regions of a single sweep, not separate blocks: the sternal angle is the slight
# backward kink where the first two meet, and the bone widens down the body
# before tapering into the xiphoid.
def sternum_front(z):
    return -cage_inner(z)[1] * 0.95


sternum_profile = flat_profile('sternumProfile', 0.075, 0.042)
sternum_points = []
for step in range(11):
    t = step / 10.0
    z = sternum_top + 0.16 - t * 1.30
    # A shallow forward bow, kinked back a little at the manubriosternal joint.
    bow = 0.030 * math.sin(math.pi * t) - (0.016 if 0.20 < t < 0.30 else 0.0)
    sternum_points.append((0.0, sternum_front(z) - bow, z))
sternum = curve_tube('sternum', sternum_points, 0.0, resolution=10, profile=sternum_profile)
# Wide at the manubrium, widest across the body, tapering to the xiphoid tip.
for vert in sternum.data.vertices:
    t = (sternum_top + 0.16 - vert.co.z) / 1.30
    if t < 0.16:
        width = 1.30
    elif t < 0.80:
        width = 1.0 + 0.10 * (t - 0.16)
    else:
        width = max(1.06 - 3.4 * (t - 0.80), 0.34)
    vert.co.x *= width
built.append(sternum)
bpy.data.objects.remove(sternum_profile, do_unlink=True)

# The vertebral column, one body per rib pair.
for index in range(RIB_COUNT + 2):
    z = CAGE_TOP - index * ((CAGE_TOP - CAGE_BOTTOM) / (RIB_COUNT + 1))
    along = (CAGE_TOP - z) / (CAGE_TOP - CAGE_BOTTOM)
    behind = 0.46 + 0.22 * math.sin(math.pi * min(max(along, 0.0), 1.0) ** 0.85)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.095, depth=0.115)
    obj = bpy.context.active_object
    obj.name = 'vertebra_%d' % (index + 1)
    obj.location = (0.0, behind, z)
    bpy.ops.object.transform_apply(location=True)
    bpy.ops.object.shade_smooth()
    built.append(obj)
    bpy.ops.mesh.primitive_cube_add(size=2.0)
    spine = bpy.context.active_object
    spine.name = 'spinous_%d' % (index + 1)
    spine.scale = (0.026, 0.07, 0.034)
    spine.location = (0.0, behind + 0.12, z - 0.04)
    bpy.ops.object.transform_apply(location=True, scale=True)
    built.append(spine)

# ------------------------------------------------------------------ upper airway
# The original model began abruptly at the larynx and the web runtime patched
# the missing face with a pink tube.  These connected nasal passages,
# nasopharynx, oro-/laryngopharynx and laryngeal cartilages make the full route
# an actual Blender-authored anatomical structure.
for side in (-1, 1):
    built.append(curve_tube('nasal_airway_%s' % ('R' if side < 0 else 'L'), [
        (side * 0.055, -0.515, 4.745),
        (side * 0.070, -0.365, 4.825),
        (side * 0.060, -0.145, 4.900),
        (side * 0.040, 0.065, 4.835),
    ], 0.045, resolution=16, around=3))
    # Inferior turbinate — a smaller mucosal roll that makes the nasal cavity
    # read as a real passage rather than a pair of drinking straws.
    built.append(curve_tube('nasal_turbinate_%s' % ('R' if side < 0 else 'L'), [
        (side * 0.060, -0.330, 4.785),
        (side * 0.075, -0.205, 4.810),
        (side * 0.055, -0.075, 4.800),
    ], 0.014, resolution=10, around=2))

built.append(curve_tube('pharynx', [
    (0, 0.080, 4.84), (0, 0.135, 4.60), (0, 0.125, 4.36),
    (0, 0.090, 4.16), (0, 0.045, 4.00),
], 0.083, resolution=18, around=3))
built.append(curve_tube('larynx', [
    (0, 0.045, 4.01), (0, 0.015, 3.91), (0, -0.005, 3.81), (0, 0, 3.73)], 0.070,
    resolution=14, around=3))

# Epiglottis and the thyroid/cricoid framework are visible landmarks around the
# airway lumen.  The posterior gap remains open, like real hyaline cartilage.
epiglottis = ellipsoid('epiglottis', (0.0, 0.010, 4.085), (0.070, 0.026, 0.175), 36, 24)
built.append(epiglottis)
for name, z, rx_ring, ry_ring, arc_degrees in [
    ('thyroid', 3.925, 0.095, 0.079, 255.0),
    ('cricoid', 3.785, 0.078, 0.068, 315.0),
]:
    arc = []
    arc_angle = math.radians(arc_degrees)
    for step in range(20):
        t = step / 19.0
        angle = math.pi - arc_angle / 2.0 + arc_angle * t
        arc.append((math.sin(angle) * rx_ring, math.cos(angle) * ry_ring, z))
    built.append(curve_tube('laryngeal_cartilage_%s' % name, arc, 0.013,
                            resolution=12, around=2))

# ------------------------------------------------------------------ lower airway
built.append(curve_tube('trachea', [
    (0, 0, 3.72), (0, 0, 3.4), (0, 0, 3.14), (0, 0, CARINA_Z)], 0.058))
RING_ARC = math.radians(290.0)
for index in range(18):
    z = 3.66 - index * 0.039
    # Swept as an arc rather than a closed torus, so the gap at the back is
    # real geometry rather than a trick of the shading.
    arc = []
    for step in range(10):
        t = step / 9.0
        angle = math.pi - RING_ARC / 2 + RING_ARC * t
        arc.append((math.sin(angle) * 0.066, math.cos(angle) * 0.061, z))
    built.append(curve_tube('tracheal_ring_%d' % (index + 1), arc, 0.010, resolution=6, around=2))

# Main/lobar/segmental bronchi. Patient right is -X.  This follows the named
# conducting topology rather than fanning every lobe from a single hub:
#
#   right main -> RUL + bronchus intermedius -> RML + RLL
#   left main  -> LUL + LLL
#
# Segment names follow the usual B1-B10 convention; on the left B1+2 and B7+8
# are represented as the common combined bronchi frequently taught in anatomy.
def add_bronchus(name, points, radius):
    # The diaphragmatic surface is strongly domed; a global "minimum lung Z"
    # is not a safe basal-branch limit. Lift every route point to a local floor
    # above the dome so the entire tube, not only its centreline, stays in lung.
    safe = [(x, y, max(z, diaphragm_top(x, y) + 0.060)) for x, y, z in points]
    built.append(curve_tube(name, safe, radius, resolution=9, around=2))


carina = (0.0, 0.0, CARINA_Z)

# Patient right: shorter, wider, more vertical.
r_main_end = (-0.34, -0.018, 2.73)
add_bronchus('bronchus_main_R', [carina, (-0.12, -0.008, 2.84), r_main_end], 0.042)
rul_root = (-0.37, -0.020, 2.80)
add_bronchus('bronchus_RUL', [r_main_end, rul_root], 0.017)
for name, endpoint in [
    ('bronchus_R_B1_apical', (-0.45, 0.015, 3.01)),
    ('bronchus_R_B2_posterior', (-0.48, 0.110, 2.87)),
    ('bronchus_R_B3_anterior', (-0.48, -0.120, 2.76)),
]:
    add_bronchus(name, [rul_root, endpoint], 0.0062)

intermediate_end = (-0.34, 0.005, 2.37)
add_bronchus('bronchus_intermedius_R', [r_main_end, (-0.31, -0.005, 2.54), intermediate_end], 0.031)
rml_root = (-0.40, -0.040, 2.45)
add_bronchus('bronchus_RML', [(-0.32, -0.005, 2.52), rml_root], 0.014)
add_bronchus('bronchus_R_B4_lateral', [rml_root, (-0.54, -0.085, 2.47)], 0.0062)
add_bronchus('bronchus_R_B5_medial', [rml_root, (-0.51, 0.010, 2.39)], 0.0062)

rll_root = (-0.42, 0.035, 2.25)
add_bronchus('bronchus_RLL', [intermediate_end, rll_root], 0.016)
for name, endpoint in [
    ('bronchus_R_B6_superior', (-0.51, 0.105, 2.46)),
    ('bronchus_R_B7_medial_basal', (-0.50, -0.010, 2.18)),
    ('bronchus_R_B8_anterior_basal', (-0.57, -0.095, 2.18)),
    ('bronchus_R_B9_lateral_basal', (-0.60, 0.020, 2.18)),
    ('bronchus_R_B10_posterior_basal', (-0.53, 0.135, 2.19)),
]:
    add_bronchus(name, [rll_root, endpoint], 0.0060)

# Patient left: longer, narrower and more oblique under the aortic arch.
l_main_end = (0.34, -0.018, 2.58)
add_bronchus('bronchus_main_L', [carina, (0.17, -0.008, 2.80), l_main_end], 0.035)
lul_root = (0.39, -0.025, 2.63)
add_bronchus('bronchus_LUL', [l_main_end, lul_root], 0.016)
for name, endpoint in [
    ('bronchus_L_B1_2_apicoposterior', (0.50, 0.070, 2.88)),
    ('bronchus_L_B3_anterior', (0.53, -0.110, 2.70)),
    ('bronchus_L_B4_lingular_superior', (0.54, -0.095, 2.49)),
    ('bronchus_L_B5_lingular_inferior', (0.53, -0.055, 2.37)),
]:
    add_bronchus(name, [lul_root, endpoint], 0.0062)

lll_root = (0.43, 0.045, 2.31)
add_bronchus('bronchus_LLL', [l_main_end, (0.39, 0.020, 2.43), lll_root], 0.016)
for name, endpoint in [
    ('bronchus_L_B6_superior', (0.52, 0.115, 2.47)),
    ('bronchus_L_B7_8_anteromedial_basal', (0.55, -0.080, 2.18)),
    ('bronchus_L_B9_lateral_basal', (0.59, 0.015, 2.17)),
    ('bronchus_L_B10_posterior_basal', (0.53, 0.135, 2.19)),
]:
    add_bronchus(name, [lll_root, endpoint], 0.0060)

# Pulmonary vessels at each hilum.  Blue carries deoxygenated blood away from
# the heart; paired red veins return oxygenated blood.  These are not part of
# the breathing animation, but they make the hilum anatomically legible and
# prevent the bronchi from looking like an isolated plumbing diagram.
for side in (-1, 1):
    right = side < 0
    hilum_x = side * (0.22 if right else 0.34)
    artery_end = (side * 0.51, 0.015, 2.48 if right else 2.56)
    built.append(curve_tube('pulmonary_artery_%s' % ('R' if right else 'L'),
                            [(side * 0.10, 0.035, 2.70),
                             (hilum_x, 0.020, 2.62), artery_end],
                            0.029, resolution=10, around=3))
    for branch, dz in enumerate((-0.12, -0.36), 1):
        vein_end = (side * (0.49 + branch * 0.025), -0.045, 2.50 + dz)
        built.append(curve_tube('pulmonary_vein_%s_%d' % ('R' if right else 'L', branch),
                                [(side * 0.08, -0.065, 2.36 + dz * 0.15),
                                 (hilum_x, -0.055, 2.42 + dz * 0.35), vein_end],
                                0.024, resolution=9, around=3))

# No heart or central great-vessel mass is included in this respiratory lesson.
# The paired pulmonary artery/vein branches above stop at the hila, preserving
# the respiratory landmarks without introducing a separate cardiac model.

# --------------------------------------------------------------- diaphragm
angular_steps = 40
radial_steps = 16
rx, ry = cage_inner(DIAPHRAGM_BASE + 0.1)
verts = [(0.0, 0.0, diaphragm_top(0.0, 0.0))]
faces = []
for ring in range(1, radial_steps + 1):
    reach = ring / radial_steps
    for step in range(angular_steps):
        angle = 2.0 * math.pi * step / angular_steps
        x = math.cos(angle) * rx * 0.99 * reach
        y = math.sin(angle) * ry * 0.99 * reach
        # 1.5 mm equivalent pleural clearance avoids z-fighting while keeping
        # the superior surface under the Blender-carved lung base.
        verts.append((x, y, diaphragm_top(x, y) - 0.007))
for step in range(angular_steps):
    faces.append((0, 1 + step, 1 + (step + 1) % angular_steps))
for ring in range(1, radial_steps):
    inner = 1 + (ring - 1) * angular_steps
    outer = inner + angular_steps
    for step in range(angular_steps):
        nxt = (step + 1) % angular_steps
        faces.append((inner + step, outer + step, outer + nxt, inner + nxt))
mesh = bpy.data.meshes.new('diaphragm')
mesh.from_pydata(verts, [], faces)
mesh.validate()
mesh.update()
diaphragm = bpy.data.objects.new('diaphragm', mesh)
bpy.context.scene.collection.objects.link(diaphragm)
bpy.context.view_layer.objects.active = diaphragm
solidify = diaphragm.modifiers.new('Solidify', 'SOLIDIFY')
solidify.thickness = 0.035
# The mathematical surface is the superior surface the lung was carved
# against; all muscle thickness must grow inferiorly, never into the lung.
solidify.offset = -1
bpy.ops.object.modifier_apply(modifier='Solidify')

# Three real apertures: caval (T8), oesophageal (T10) and aortic (T12).
# They are intentionally separate and placed in the correct anterior-to-
# posterior order rather than painted as decorative spots on a solid sheet.
for name, x, y, radius in [
    ('caval', -0.18, -0.005, 0.060),
    ('oesophageal', -0.055, 0.155, 0.052),
    ('aortic', 0.000, 0.315, 0.058),
]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=0.42,
                                        location=(x, y, diaphragm_top(x, y) - 0.08))
    cutter = bpy.context.active_object
    cutter.name = 'CUT_' + name + '_hiatus'
    boolean = diaphragm.modifiers.new('Hiatus_' + name, 'BOOLEAN')
    boolean.operation = 'DIFFERENCE'
    boolean.solver = 'EXACT'
    boolean.object = cutter
    bpy.context.view_layer.objects.active = diaphragm
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

bpy.ops.object.shade_smooth()
built.append(diaphragm)

# Right and left crura arise from the upper lumbar spine and sweep anteriorly
# around the aortic and oesophageal openings into the central tendon.
built.append(curve_tube('diaphragm_crus_R', [
    (-0.105, 0.365, 1.47), (-0.105, 0.315, 1.66),
    (-0.085, 0.235, 1.83), (-0.045, 0.145, 1.98),
], 0.030, resolution=12, around=3))
built.append(curve_tube('diaphragm_crus_L', [
    (0.105, 0.365, 1.52), (0.100, 0.315, 1.68),
    (0.075, 0.235, 1.82), (0.030, 0.160, 1.94),
], 0.027, resolution=12, around=3))

# A thin central tendon sits in the shallow saddle between the two muscular
# domes.  It is intentionally subtle: the tendon is visible in an atlas view
# without being mistaken for a third dome.
bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=18, radius=1.0,
                                     location=(0.0, -0.015, DIAPHRAGM_BASE + 0.238))
tendon = bpy.context.active_object
tendon.name = 'central_tendon'
tendon.scale = (0.30, 0.25, 0.025)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.shade_smooth()
built.append(tendon)

for helper in (rib_profile, costal_profile):
    bpy.data.objects.remove(helper, do_unlink=True)

print('built %d parts, %d faces' % (len(built), sum(len(o.data.polygons) for o in built)))
print('total scene faces', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
