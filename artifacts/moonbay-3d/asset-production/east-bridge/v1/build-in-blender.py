"""East lagoon stone arch bridge (east-bridge v1): radial limestone voussoirs, staggered spandrel ashlar masonry, damp tidal piers, and sloped cornice caps matching east-north -> east-crown -> east-south."""
import math
import random
import sys
from pathlib import Path
import bpy
import numpy as np

target = Path(sys.argv[sys.argv.index("--") + 1])
target.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

rng = random.Random(284)
V, F, C, slots, smooth = [], [], [], [], []

# Target dimensions [w=4.25, d=21.5, h=3.05], minZ=0.0000 (world.ts lifts by 1.10 from y=-0.04)
SPAN = 21.50
CREST = 0.4535714
BASE_WORLD = -0.04
LIFT = 1.10


def h(world_y):
    return (world_y - BASE_WORLD) / LIFT


def center_x(u):
    # Subtle -0.12m camber following east-crown lateral bend within [-0.14, +0.14] origin tolerance
    t = u / CREST if u <= CREST else (1.0 - u) / (1.0 - CREST)
    return -0.12 * t


def roof(u):
    # Top cornice profile right beneath walkable deck (north=2.55, crown=3.30, south=2.52)
    world_y = 2.55 + 0.75 * (u / CREST) if u <= CREST else 3.30 - 0.78 * ((u - CREST) / (1.0 - CREST))
    return h(world_y - 0.015)


def soffit(u):
    lo, hi = 0.155, 0.835
    if u < lo or u > hi:
        return h(0.08)
    t = 2.0 * (u - lo) / (hi - lo) - 1.0
    return h(0.35 + 2.04 * math.sqrt(max(0.0, 1.0 - t * t)))


WARM = (0.71, 0.545, 0.365)
CREAM = (0.78, 0.625, 0.420)
SHADE = (0.45, 0.370, 0.260)
WET = (0.41, 0.345, 0.255)


def tint(c, f):
    return tuple(min(1.0, k * f) for k in c)


def v(x, u, z, color):
    V.append((x, SPAN * (0.5 - u), z))
    C.append((*color, 1.0))
    return len(V) - 1


def face(c, slot=0, s=False):
    F.append(c)
    slots.append(slot)
    smooth.append(s)


def strip(us, section, kind, color, soft=True):
    rings = []
    for u in us:
        cx = center_x(u)
        rings.append([v(cx + dx, u, z, tint(color, sh)) for dx, z, sh in section(u)])
    count = len(rings[0])
    for row, lo in enumerate(rings[:-1]):
        hi = rings[row + 1]
        for j in range(count):
            k = (j + 1) % count
            face((lo[j], lo[k], hi[k], hi[j]), kind, soft)
    face(tuple(reversed(rings[0])), kind)
    face(tuple(rings[-1]), kind)


# 1. Inner vaulted arch barrel core
def core(u):
    top = roof(u) - 0.040
    low = soffit(u)
    return [
        (-1.86, low, 0.86), (1.86, low, 0.86), (1.96, low + 0.058, 0.88),
        (1.995, top - 0.155, 0.99), (2.025, top - 0.065, 1.02), (2.025, top, 1.03),
        (-2.025, top, 1.03), (-2.025, top - 0.065, 1.02), (-1.995, top - 0.155, 0.99),
        (-1.96, low + 0.058, 0.88),
    ]


levels = sorted({i / 92.0 for i in range(93)} | {0.155, 0.835, CREST})
strip(levels, core, 0, SHADE)

# 2. Grounded stepped stone abutment foundations anchored at minZ = 0.0000 (below tide)
for start, end in [(0.0, 0.175), (0.815, 1.0)]:
    for i in range(4):
        aa = start + (end - start) * i / 4.0
        bb = start + (end - start) * (i + 1) / 4.0 - 0.0005

        def plinth(u):
            return [
                (-2.125, 0.0, 0.72), (2.125, 0.0, 0.72), (2.125, 0.065, 0.80),
                (2.125, 0.36, 0.86), (2.095, 0.46, 0.90), (2.04, 0.52, 0.92),
                (-2.04, 0.52, 0.92), (-2.095, 0.46, 0.90), (-2.125, 0.36, 0.86),
                (-2.125, 0.065, 0.80),
            ]

        strip([aa, bb], plinth, 1, WET)

# 3. Side arch voussoirs, staggered spandrel ashlar masonry, and double-sloped cornice caps
for side in (-1, 1):
    # Radial arch ring voussoirs
    op_lo, op_hi = 0.157, 0.833
    for i in range(29):
        a = op_lo + (op_hi - op_lo) * i / 29.0 + 0.00038
        b = op_lo + (op_hi - op_lo) * (i + 1) / 29.0 - 0.00038

        def arch_block(u):
            lo_z = soffit(u) + 0.015
            hi_z = min(lo_z + 0.245, roof(u) - 0.145)
            x = side
            return [
                (x * 1.88, lo_z + 0.014, 0.85), (x * 1.995, lo_z + 0.014, 0.88),
                (x * 2.032, lo_z + 0.044, 0.98), (x * 2.032, hi_z - 0.022, 1.05),
                (x * 1.995, hi_z, 1.05), (x * 1.905, hi_z, 0.95),
            ]

        strip([a, (a + b) * 0.5, b], arch_block, 0, tint(CREAM, rng.uniform(0.93, 1.05)))

    # Staggered horizontal ashlar courses filling spandrels & wing abutments
    for row in range(7):
        n = 26
        edges = [0.0] + [(i + (row % 2) * 0.46 + rng.uniform(-0.12, 0.12)) / n for i in range(1, n)] + [1.0]
        for lx, rx in zip(edges, edges[1:]):
            a = lx + 0.00052
            b = rx - 0.00052

            def room(u):
                lo_z = max(soffit(u) + (0.215 if 0.155 <= u <= 0.835 else 0.028), 0.27 + row * 0.295)
                hi_z = min(roof(u) - 0.16, 0.27 + (row + 1) * 0.295 - 0.016)
                return lo_z, hi_z

            pts = [a + (b - a) * i / 8.0 for i in range(9) if room(a + (b - a) * i / 8.0)[1] - room(a + (b - a) * i / 8.0)[0] > 0.035]
            if len(pts) < 2:
                continue

            def spandrel_block(u):
                lo_z, hi_z = room(u)
                return [
                    (side * 1.92, lo_z, 0.86), (side * 2.002, lo_z, 0.89),
                    (side * 2.022, lo_z + 0.020, 0.98), (side * 2.022, hi_z - 0.018, 1.02),
                    (side * 2.000, hi_z, 1.04), (side * 1.92, hi_z, 0.94),
                ]

            strip(pts, spandrel_block, 1 if row == 0 else 0, tint(WARM, rng.uniform(0.89, 1.075)))

    # Dressed overhanging cornice coping slabs supporting east-rail & east-post on outer sides
    for i in range(26):
        a = i / 26.0 + 0.00032
        b = (i + 1) / 26.0 - 0.00032
        seg_u = [a, CREST, b] if a < CREST < b else [a, b]

        def cornice(u):
            z = roof(u)
            return [
                (side * 1.72, z - 0.115, 0.91), (side * 2.005, z - 0.150, 0.88),
                (side * 2.098, z - 0.122, 0.94), (side * 2.125, z - 0.088, 1.02),
                (side * 2.118, z - 0.048, 1.05), (side * 2.090, z - 0.018, 1.06),
                (side * 1.72, z - 0.018, 1.05),
            ]

        strip(seg_u, cornice, 0, tint(CREAM, rng.uniform(0.95, 1.04)))

mesh = bpy.data.meshes.new("East lagoon arch masonry and stepped abutments")
mesh.from_pydata(V, [], F)
mesh.update()
color_attr = mesh.color_attributes.new(name="Stone tone", type="FLOAT_COLOR", domain="POINT")
for i, tone in enumerate(C):
    color_attr.data[i].color = tone

# Generate seamless limestone texture packed inside GLB
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u_tx, v_tx = xx / W_TX, yy / H_TX
strata = (
    0.45 * np.sin(v_tx * 58.0 + 1.3 * np.sin(u_tx * 11.0 + v_tx * 5.0))
    + 0.30 * np.sin(u_tx * 39.0 + v_tx * 21.0)
    + 0.25 * np.cos(xx * 0.29) * np.sin(yy * 0.36)
)
rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
val = np.clip(0.945 + 0.06 * strata, 0.84, 1.05)
rgba[..., 0] = np.clip(0.95 * val, 0.0, 1.0)
rgba[..., 1] = np.clip(0.84 * val, 0.0, 1.0)
rgba[..., 2] = np.clip(0.67 * val, 0.0, 1.0)
img = bpy.data.images.new("east-bridge-stone", width=W_TX, height=H_TX, alpha=True)
img.pixels.foreach_set(rgba.ravel())
img.filepath_raw = str(target / "east-bridge-stone.png")
img.file_format = "PNG"
img.save()
img.pack()

for label, rough, tint_mul in [("Dressed honey limestone", 0.85, (1.0, 1.0, 1.0)), ("Tidal stone plinth", 0.62, (0.86, 0.85, 0.83))]:
    mat = bpy.data.materials.new(label)
    mat.use_nodes = True
    nt = mat.node_tree
    bs = nt.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value = rough
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-460, 260)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Stone tone"
    vc.location = (-460, 30)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-210, 180)
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(vc.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bs.inputs["Base Color"])
    mesh.materials.append(mat)

for poly, slot, usesmooth in zip(mesh.polygons, slots, smooth):
    poly.material_index = slot
    poly.use_smooth = usesmooth

obj = bpy.data.objects.new("east-bridge", mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
mesh.validate(clean_customdata=True)

uv = mesh.uv_layers.new(name="Stone projection").data
for poly in mesh.polygons:
    nx, ny, nz = map(abs, poly.normal)
    for idx in poly.loop_indices:
        x, y, z = mesh.vertices[mesh.loops[idx].vertex_index].co
        if nz >= max(nx, ny):
            a, b = x, y
        elif nx > ny:
            a, b = y, z
        else:
            a, b = x, z
        uv[idx].uv = ((a * 0.68) % 1.0, (b * 0.68) % 1.0)

mesh.calc_loop_triangles()
coords = [vt.co for vt in mesh.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "EAST_BRIDGE_V1",
    len(mesh.loop_triangles),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "sumX=", round(lo[0] + hi[0], 4),
    flush=True,
)
bpy.ops.wm.save_as_mainfile(filepath=str(target / "east-bridge.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(target / "east-bridge.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
    export_vertex_color="ACTIVE",
)
