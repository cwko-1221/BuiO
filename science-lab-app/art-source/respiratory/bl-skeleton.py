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
    count = 10
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
    curve.resolution_u = max(3, resolution // 2)
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

# ------------------------------------------------------------------ airway
built.append(curve_tube('larynx', [
    (0, 0, 3.96), (0, -0.015, 3.88), (0, -0.01, 3.8), (0, 0, 3.73)], 0.075))
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

# Main bronchi: the right is wider, shorter and more upright than the left.
# The segmental branches are deliberately kept short of the pleural surface.
# They are the conducting tree, not decorative rods painted across the lung.
for side in (-1, 1):
    right = side < 0
    # right: ~25 degrees off vertical and short. left: ~45 degrees and longer.
    hilum = (side * (0.22 if right else 0.34), -0.02,
             CARINA_Z - (0.32 if right else 0.42))
    built.append(curve_tube('bronchus_main_%s' % ('R' if right else 'L'),
                            [(0, 0, CARINA_Z),
                             (side * (0.11 if right else 0.18), -0.01, CARINA_Z - (0.24 if right else 0.17)),
                             hilum],
                            0.042 if right else 0.035))
    # Two further generations inside the lung.
    for branch in range(3 if right else 2):
        lateral = 0.44 + branch * 0.045 + (0.07 if (not right and branch == 1) else 0.0)
        end = (side * lateral, -0.035 + branch * 0.08,
               hilum[2] - 0.14 - branch * 0.27)
        if not right and branch == 1:
            # The left lower-lobe bronchus turns posterolaterally below the
            # oblique fissure immediately after the hilum; it must not run
            # along the fissural plane.
            middle = (side * 0.50, 0.035, 2.30)
        else:
            middle = ((hilum[0] + end[0]) / 2,
                      (hilum[1] + end[1]) / 2,
                      (hilum[2] + end[2]) / 2 + 0.04)
        built.append(curve_tube('bronchus_%s_%d' % ('R' if right else 'L', branch + 1),
                                [hilum, middle, end],
                                0.014 - branch * 0.0025))

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

# --------------------------------------------------------------- diaphragm
angular_steps = 72
radial_steps = 30
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
bpy.ops.object.shade_smooth()
built.append(diaphragm)

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
