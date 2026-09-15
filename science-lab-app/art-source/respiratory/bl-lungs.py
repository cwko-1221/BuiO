# Lungs for the respiratory-system station.
#
# Blender is Z-up looking down -Y; the web scene is Y-up facing +Z. The glTF
# exporter maps Blender (x, y, z) to glTF (x, z, -y), so modelling with Z up and
# -Y forward lands in the web scene's axes untouched.
#
# The shape is made by carving a rounded solid, not by rewriting coordinates:
#   * an ovoid, smoothly tapered towards the apex, is the starting hull
#   * intersecting it with a solid of the chest cavity gives the flattened
#     costal surface and guarantees it cannot cross a rib
#   * subtracting a solid of the diaphragm gives the concave base it rests on
#   * bisecting along the fissure planes separates the lobes
# Clamping coordinates instead of carving is what produced wedges with crumpled
# bases on the first attempt.
import bpy
import bmesh
import math
from mathutils import Vector

CAGE_TOP = 3.42
CAGE_BOTTOM = 1.62
DIAPHRAGM_BASE = 1.72
DOME_RISE = {1: 0.54, -1: 0.46}

OBLIQUE_N = Vector((0.0, -0.573, 0.819)).normalized()
OBLIQUE_C = 1.994
HORIZONTAL_N = Vector((0.0, 0.0, 1.0))
HORIZONTAL_C = 2.62


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


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def new_mesh(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_cavity(name, margin=0.965, segments=64, rings=40):
    """A closed solid of the inside of the chest, from the cage shape function."""
    verts = []
    for ring in range(rings + 1):
        z = CAGE_BOTTOM + (CAGE_TOP + 0.1 - CAGE_BOTTOM) * ring / rings
        rx, ry = cage_inner(z)
        rx *= margin
        ry *= margin
        for step in range(segments):
            angle = 2.0 * math.pi * step / segments
            verts.append((math.cos(angle) * rx, math.sin(angle) * ry, z))
    faces = []
    for ring in range(rings):
        for step in range(segments):
            a = ring * segments + step
            b = ring * segments + (step + 1) % segments
            c = (ring + 1) * segments + (step + 1) % segments
            d = (ring + 1) * segments + step
            faces.append((a, b, c, d))
    base = len(verts)
    verts.append((0.0, 0.0, CAGE_BOTTOM))
    verts.append((0.0, 0.0, CAGE_TOP + 0.1))
    for step in range(segments):
        faces.append((base, (step + 1) % segments, step))
        top = rings * segments
        faces.append((base + 1, top + step, top + (step + 1) % segments))
    return new_mesh(name, verts, faces)


def make_diaphragm_solid(name, resolution=52):
    """A closed solid whose top surface is the diaphragm, for subtracting."""
    rx, ry = cage_inner(DIAPHRAGM_BASE + 0.2)
    reach_x = rx * 2.1
    reach_y = ry * 2.1
    floor = DIAPHRAGM_BASE - 1.2
    verts = []
    for row in range(resolution + 1):
        for col in range(resolution + 1):
            x = -reach_x + 2.0 * reach_x * col / resolution
            y = -reach_y + 2.0 * reach_y * row / resolution
            verts.append((x, y, diaphragm_top(x, y)))
    top_count = len(verts)
    for row in range(resolution + 1):
        for col in range(resolution + 1):
            x = -reach_x + 2.0 * reach_x * col / resolution
            y = -reach_y + 2.0 * reach_y * row / resolution
            verts.append((x, y, floor))
    faces = []
    stride = resolution + 1

    def quad(offset, flip):
        for row in range(resolution):
            for col in range(resolution):
                a = offset + row * stride + col
                b = offset + row * stride + col + 1
                c = offset + (row + 1) * stride + col + 1
                d = offset + (row + 1) * stride + col
                faces.append((d, c, b, a) if flip else (a, b, c, d))

    quad(0, False)
    quad(top_count, True)
    for col in range(resolution):
        faces.append((col, col + 1, top_count + col + 1, top_count + col))
        last = resolution * stride
        faces.append((last + col + 1, last + col, top_count + last + col, top_count + last + col + 1))
    for row in range(resolution):
        faces.append((row * stride, (row + 1) * stride, top_count + (row + 1) * stride, top_count + row * stride))
        edge = resolution
        faces.append(((row + 1) * stride + edge, row * stride + edge,
                      top_count + row * stride + edge, top_count + (row + 1) * stride + edge))
    return new_mesh(name, verts, faces)


def boolean(obj, cutter, operation):
    modifier = obj.modifiers.new(operation, 'BOOLEAN')
    modifier.object = cutter
    modifier.operation = operation
    modifier.solver = 'EXACT'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def bisect(obj, normal, offset, keep_positive):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.bisect_plane(
        mesh,
        geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
        plane_co=normal * offset,
        plane_no=normal,
        clear_outer=not keep_positive,
        clear_inner=keep_positive,
    )
    holes = [e for e in mesh.edges if len(e.link_faces) == 1]
    if holes:
        bmesh.ops.holes_fill(mesh, edges=holes)
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()


def MEDIASTINAL_HALF_AT(z):
    """Half-width of the mediastinum at a given height.

    Narrow at the thoracic inlet, widest across the heart, narrowing again at
    the diaphragm — the shape of the space the lungs are moulded around.
    """
    HEART_TOP = 2.80
    HEART_BOTTOM = 2.05
    if z >= HEART_TOP:
        t = min((z - HEART_TOP) / 0.62, 1.0)
        return 0.30 - 0.20 * t
    if z <= HEART_BOTTOM:
        t = min((HEART_BOTTOM - z) / 0.35, 1.0)
        return 0.30 - 0.16 * t
    return 0.30


def make_hull(name, side, notch):
    """An ovoid, tapered smoothly to a rounded apex and flattened medially."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=44, radius=1.0)
    obj = bpy.context.active_object
    obj.name = name
    centre_z = 2.60
    half_z = 0.84
    for vert in obj.data.vertices:
        sx, sy, sz = vert.co
        up = (sz + 1.0) / 2.0
        # Narrower towards the apex, but still round in section.
        taper = 0.58 + 0.42 * math.sin(math.pi * min(up * 0.78 + 0.22, 1.0))
        x = sx * 0.54 * taper
        y = sy * 0.50 * taper
        z = centre_z + sz * half_z
        # Flatten the mediastinal face smoothly rather than folding it over.
        toward_midline = -side * x
        if toward_midline > 0.0:
            x += side * toward_midline * 0.45
        # Then stand the whole lung off the midline by the width of the
        # mediastinum at this height, and let nothing cross back over it. The
        # old code used a fixed 0.30 offset with no clamp, so both lungs still
        # reached x = 0 and met, leaving no room for the heart the cardiac
        # notch was carved for.
        reach = MEDIASTINAL_HALF_AT(z)
        x += side * reach
        if side * x < reach:
            x = side * reach
        if notch > 0.0:
            near = max(0.0, -y / 0.44) * max(0.0, 1.0 - abs(up - 0.4) / 0.3)
            x += side * near * notch * 0.5
        vert.co = Vector((x, y, z))
    return obj


clear_scene()
cavity = make_cavity('cavityCutter')
dome = make_diaphragm_solid('domeCutter')

specs = [
    ('lung_R_superior', 1, 0.0, [(OBLIQUE_N, OBLIQUE_C + 0.014, True), (HORIZONTAL_N, HORIZONTAL_C + 0.014, True)]),
    ('lung_R_middle', 1, 0.0, [(OBLIQUE_N, OBLIQUE_C + 0.014, True), (HORIZONTAL_N, HORIZONTAL_C - 0.014, False)]),
    ('lung_R_inferior', 1, 0.0, [(OBLIQUE_N, OBLIQUE_C - 0.014, False)]),
    ('lung_L_superior', -1, 0.34, [(OBLIQUE_N, OBLIQUE_C + 0.014, True)]),
    ('lung_L_inferior', -1, 0.34, [(OBLIQUE_N, OBLIQUE_C - 0.014, False)]),
]

lobes = []
for name, side, notch, clips in specs:
    obj = make_hull(name, side, notch)
    boolean(obj, cavity, 'INTERSECT')
    boolean(obj, dome, 'DIFFERENCE')
    for normal, offset, keep in clips:
        bisect(obj, normal, offset, keep)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    lobes.append(obj)

bpy.data.objects.remove(cavity, do_unlink=True)
bpy.data.objects.remove(dome, do_unlink=True)

for obj in lobes:
    bounds = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    print('%-18s tris=%5d  x[%.2f %.2f] y[%.2f %.2f] z[%.2f %.2f]' % (
        obj.name, len(obj.data.polygons),
        min(b.x for b in bounds), max(b.x for b in bounds),
        min(b.y for b in bounds), max(b.y for b in bounds),
        min(b.z for b in bounds), max(b.z for b in bounds)))
print('total faces', sum(len(o.data.polygons) for o in lobes))
