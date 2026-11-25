"""Eastern lagoon bridge balustrade (east-rail v1): honed honey limestone foot sill and rounded handrail with 6 Mediterranean sky-blue glazed ceramic balusters."""
import math
import sys
from pathlib import Path
import bpy
import numpy as np

out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

parts = []

# Generate warm honed bridge limestone texture matched to east-bridge v2
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u_tx, v_tx = xx / W_TX, yy / H_TX
strata = (
    0.45 * np.sin(v_tx * 54.0 + 1.1 * np.sin(u_tx * 10.0 + v_tx * 4.5))
    + 0.30 * np.sin(u_tx * 37.0 + v_tx * 19.0)
    + 0.25 * np.cos(xx * 0.29) * np.sin(yy * 0.36)
)
rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
val = np.clip(0.955 + 0.045 * strata, 0.86, 1.02)
rgba[..., 0] = np.clip(0.92 * val, 0.0, 1.0)
rgba[..., 1] = np.clip(0.79 * val, 0.0, 1.0)
rgba[..., 2] = np.clip(0.60 * val, 0.0, 1.0)
img = bpy.data.images.new("east-rail-limestone", width=W_TX, height=H_TX, alpha=True)
img.pixels.foreach_set(rgba.ravel())
img.filepath_raw = str(out / "east-rail-limestone.png")
img.file_format = "PNG"
img.save()
img.pack()

stone = bpy.data.materials.new("Warm East bridge limestone")
stone.use_nodes = True
nt = stone.node_tree
bs = nt.nodes.get("Principled BSDF")
bs.inputs["Roughness"].default_value = 0.84
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.location = (-410, 320)
nt.links.new(tex.outputs["Color"], bs.inputs["Base Color"])

glaze = bpy.data.materials.new("Aegean sky-blue ceramic glaze")
glaze.use_nodes = True
p = glaze.node_tree.nodes.get("Principled BSDF")
p.inputs["Base Color"].default_value = (0.145, 0.425, 0.665, 1.0)
p.inputs["Roughness"].default_value = 0.34
p.inputs["Metallic"].default_value = 0.10

HALF_W = 1.325  # exact W = 2.6500


def slab(name, rings):
    vertices = [(x, y, z) for x in (-HALF_W, HALF_W) for y, z in rings]
    n_pts = len(rings)
    faces = [tuple(reversed(range(n_pts))), tuple(range(n_pts, 2 * n_pts))]
    for i in range(n_pts):
        a = i
        b = (i + 1) % n_pts
        faces.append((a, b, b + n_pts, a + n_pts))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(stone)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    parts.append(ob)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    mod = ob.modifiers.new("Worn long stone edge", "BEVEL")
    mod.width = 0.0068
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.select_set(False)


# Extruded limestone foot sill (minZ = -0.033, D = 0.370) & rounded stone handrail (maxZ = 0.715)
slab(
    "Continuous limestone foot",
    [
        (-0.172, -0.033), (0.172, -0.033), (0.185, -0.009), (0.180, 0.035),
        (0.154, 0.065), (0.131, 0.088), (-0.131, 0.088), (-0.154, 0.065),
        (-0.180, 0.035), (-0.185, -0.009),
    ],
)
slab(
    "Rounded stone hand rail",
    [
        (-0.126, 0.614), (0.126, 0.614), (0.143, 0.634), (0.146, 0.670),
        (0.131, 0.698), (0.094, 0.715), (-0.094, 0.715), (-0.131, 0.698),
        (-0.146, 0.670), (-0.143, 0.634),
    ],
)

# 6 Classical Turned Vase Balusters with Sky-Blue Ceramic Glazed Bodies & Honed Limestone Collars
for i in range(6):
    x = (2.65) * ((i + 0.5) / 6.0 - 0.5)
    dims = [
        (0.126, 0.125, 0.066), (0.137, 0.128, 0.085), (0.124, 0.118, 0.122),
        (0.092, 0.088, 0.154), (0.074, 0.071, 0.185), (0.064, 0.062, 0.224),
        (0.073, 0.070, 0.262), (0.099, 0.095, 0.315), (0.105, 0.102, 0.358),
        (0.089, 0.085, 0.418), (0.070, 0.068, 0.470), (0.082, 0.077, 0.522),
        (0.109, 0.103, 0.562), (0.130, 0.122, 0.592), (0.132, 0.122, 0.628),
    ]
    num = 16
    vertices = []
    for rx, ry, h_z in dims:
        for j in range(num):
            ang = j * math.tau / num
            vertices.append((x + rx * math.cos(ang), ry * math.sin(ang), h_z))
    faces = [tuple(reversed(range(num)))]
    slots = [0]
    for k in range(len(dims) - 1):
        for j in range(num):
            a = k * num + j
            b = k * num + (j + 1) % num
            faces.append((a, b, b + num, a + num))
            slots.append(1 if 3 <= k <= 11 else 0)
    faces.append(tuple(range(len(vertices) - num, len(vertices))))
    slots.append(0)
    mesh = bpy.data.meshes.new("Turned ceramic baluster")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(stone)
    mesh.materials.append(glaze)
    for poly, idx in zip(mesh.polygons, slots):
        poly.material_index = idx
        poly.use_smooth = True
    ob = bpy.data.objects.new("Turned ceramic baluster", mesh)
    bpy.context.collection.objects.link(ob)
    parts.append(ob)

for p_obj in parts:
    p_obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
ob = bpy.context.object
ob.name = "east-rail"
me = ob.data
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

uv = me.uv_layers.new(name="Stone projection").data
for poly in me.polygons:
    nx, ny, nz = map(abs, poly.normal)
    for idx in poly.loop_indices:
        x, y, z = me.vertices[me.loops[idx].vertex_index].co
        if nz >= max(nx, ny):
            a, b = x, y
        elif nx > ny:
            a, b = y, z
        else:
            a, b = x, z
        uv[idx].uv = ((a * 0.74) % 1.0, (b * 0.74) % 1.0)
me.validate(clean_customdata=True)
me.calc_loop_triangles()

coords = [v.co for v in me.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "EAST_RAIL_V1",
    len(me.loop_triangles),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    flush=True,
)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "east-rail.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out / "east-rail.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
)
