# Adds the skeleton, airway and diaphragm to the lungs already in the scene.
# Run after bl-lungs.py. Same axis convention: Z up, -Y forward.
import bpy
import math
from mathutils import Vector

CAGE_TOP = 3.42
CAGE_BOTTOM = 1.62
DIAPHRAGM_BASE = 1.72
DOME_RISE = {1: 0.54, -1: 0.46}
RIB_COUNT = 9
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


def curve_tube(name, points, radius, resolution=12, smooth=True, profile=None):
    """A bevelled curve converted to mesh: the clean way to build a rib or a duct."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = max(3, resolution // 2)
    if profile is not None:
        curve.bevel_mode = 'OBJECT'
        curve.bevel_object = profile
    else:
        curve.bevel_depth = radius
        curve.bevel_resolution = 2
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
    drop = 0.09 + level * 0.2
    points = []
    for step in range(steps):
        t = step / (steps - 1)
        z = top - drop * t
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
rib_profile = flat_profile('ribProfile', 0.038, 0.016)
costal_profile = flat_profile('costalProfile', 0.032, 0.015)

# ---------------------------------------------------------------- rib cage
sternum_top = CAGE_TOP - 0.24
for index in range(RIB_COUNT):
    level = index / (RIB_COUNT - 1)
    for side in (-1, 1):
        path = rib_path(level, side)
        built.append(curve_tube('rib_%d_%s' % (index + 1, 'R' if side > 0 else 'L'),
                                path, 0.026, profile=rib_profile))
        if index >= RIB_COUNT - 2:
            continue  # the last pair floats free
        tip = path[-1]
        if index < 6:
            target = (side * 0.09, -cage_inner(tip[2]).__getitem__(1) * 0.94, sternum_top - index * 0.2)
        else:
            target = (side * 0.3, -cage_inner(tip[2])[1] * 0.98, tip[2] + 0.22)
        mid = ((tip[0] + target[0]) / 2, (tip[1] + target[1]) / 2 - 0.05, (tip[2] + target[2]) / 2 - 0.04)
        built.append(curve_tube('costal_%d_%s' % (index + 1, 'R' if side > 0 else 'L'),
                                [tip, mid, target], 0.022, profile=costal_profile))

# The breastbone: manubrium, body and xiphoid process.
for name, half, z_at, depth in (('sternum_manubrium', (0.16, 0.045, 0.15), sternum_top + 0.02, 0),
                                ('sternum_body', (0.12, 0.042, 0.44), sternum_top - 0.52, 0),
                                ('sternum_xiphoid', (0.065, 0.034, 0.1), sternum_top - 1.04, 0)):
    bpy.ops.mesh.primitive_cube_add(size=2.0)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = half
    obj.location = (0.0, -cage_inner(z_at)[1] * 0.95, z_at)
    bpy.ops.object.transform_apply(location=True, scale=True)
    bevel = obj.modifiers.new('Bevel', 'BEVEL')
    bevel.width = 0.02
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier='Bevel')
    bpy.ops.object.shade_smooth()
    built.append(obj)

# The vertebral column, one body per rib pair.
for index in range(RIB_COUNT + 2):
    z = CAGE_TOP - index * ((CAGE_TOP - CAGE_BOTTOM) / (RIB_COUNT + 1))
    behind = cage_inner(z)[1] + 0.16
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
    (0, 0, 3.96), (0, -0.015, 3.88), (0, -0.01, 3.8), (0, 0, 3.73)], 0.132))
built.append(curve_tube('trachea', [
    (0, 0, 3.72), (0, 0, 3.4), (0, 0, 3.14), (0, 0, CARINA_Z)], 0.112))
for index in range(9):
    z = 3.64 - index * 0.085
    bpy.ops.mesh.primitive_torus_add(major_radius=0.125, minor_radius=0.019,
                                     major_segments=18, minor_segments=6)
    ring = bpy.context.active_object
    ring.name = 'tracheal_ring_%d' % (index + 1)
    ring.location = (0, 0, z)
    ring.scale = (1, 0.92, 1)
    bpy.ops.object.transform_apply(location=True, scale=True)
    bpy.ops.object.shade_smooth()
    built.append(ring)

# Main bronchi: the right is wider, shorter and more upright than the left.
for side in (-1, 1):
    right = side > 0
    hilum = (side * 0.3, -0.02, CARINA_Z - (0.2 if right else 0.26))
    built.append(curve_tube('bronchus_main_%s' % ('R' if right else 'L'),
                            [(0, 0, CARINA_Z), (side * 0.16, -0.01, CARINA_Z - 0.1), hilum],
                            0.085 if right else 0.072))
    # Two further generations inside the lung.
    for branch in range(3):
        spread = 0.34 + branch * 0.16
        end = (side * (0.52 + branch * 0.06), -0.06 + branch * 0.12, hilum[2] - 0.16 - branch * 0.3)
        built.append(curve_tube('bronchus_%s_%d' % ('R' if right else 'L', branch + 1),
                                [hilum, ((hilum[0] + end[0]) / 2, (hilum[1] + end[1]) / 2, (hilum[2] + end[2]) / 2 + 0.04), end],
                                0.05 - branch * 0.008))

# --------------------------------------------------------------- diaphragm
resolution = 28
rx, ry = cage_inner(DIAPHRAGM_BASE + 0.1)
verts = []
faces = []
for row in range(resolution + 1):
    for col in range(resolution + 1):
        u = col / resolution
        v = row / resolution
        angle = 2.0 * math.pi * u
        reach = v
        x = math.cos(angle) * rx * 0.99 * reach
        y = math.sin(angle) * ry * 0.99 * reach
        verts.append((x, y, diaphragm_top(x, y)))
stride = resolution + 1
for row in range(resolution):
    for col in range(resolution):
        a = row * stride + col
        faces.append((a, a + 1, a + stride + 1, a + stride))
mesh = bpy.data.meshes.new('diaphragm')
mesh.from_pydata(verts, [], faces)
mesh.validate()
mesh.update()
diaphragm = bpy.data.objects.new('diaphragm', mesh)
bpy.context.scene.collection.objects.link(diaphragm)
bpy.context.view_layer.objects.active = diaphragm
solidify = diaphragm.modifiers.new('Solidify', 'SOLIDIFY')
solidify.thickness = 0.05
solidify.offset = -1
bpy.ops.object.modifier_apply(modifier='Solidify')
bpy.ops.object.shade_smooth()
built.append(diaphragm)

for helper in (rib_profile, costal_profile):
    bpy.data.objects.remove(helper, do_unlink=True)

print('built %d parts, %d faces' % (len(built), sum(len(o.data.polygons) for o in built)))
print('total scene faces', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
