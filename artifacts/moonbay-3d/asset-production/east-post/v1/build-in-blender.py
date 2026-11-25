"""Eastern lagoon bridge terminal pier (east-post v1): dressed honed limestone pier with Mediterranean sky-blue glazed collar and turned sphere finial."""
import math
import sys
from pathlib import Path
import bpy
import numpy as np

out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

# Generate warm honed bridge limestone texture harmonized identically with east-rail v1 & east-bridge v2
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
img = bpy.data.images.new("east-post-limestone", width=W_TX, height=H_TX, alpha=True)
img.pixels.foreach_set(rgba.ravel())
img.filepath_raw = str(out / "east-post-limestone.png")
img.file_format = "PNG"
img.save()
img.pack()

V, F, M = [], [], []


def shape(rings, nt=16):
    rows = []
    for z, r, sq, slot in rings:
        row = []
        for i in range(nt):
            angle = i * math.tau / nt
            ca, sa = math.cos(angle), math.sin(angle)
            e = 0.27 if sq else 1.0
            p = (r * math.copysign(abs(ca) ** e, ca), r * math.copysign(abs(sa) ** e, sa), z)
            row.append(len(V))
            V.append(p)
        rows.append(row)
    for k, lo in enumerate(rows[:-1]):
        hi = rows[k + 1]
        for i in range(nt):
            j = (i + 1) % nt
            F.append((lo[i], lo[j], hi[j], hi[i]))
            M.append(rings[k][3])
    F.extend((tuple(reversed(rows[0])), tuple(rows[-1])))
    M.extend((rings[0][3], rings[-1][3]))


# Exact target footprint [w=0.58, d=0.58, h=1.10], minZ = -0.035 (max plinth r=0.290 -> W=0.5800, H=1.1000)
shape([
    (-0.035, 0.268, True, 0), (-0.008, 0.290, True, 0), (0.042, 0.290, True, 0),
    (0.082, 0.264, True, 0), (0.140, 0.250, True, 0), (0.168, 0.224, True, 0),
    (0.214, 0.210, True, 0), (0.728, 0.210, True, 0), (0.764, 0.232, True, 0),
    (0.794, 0.250, True, 0), (0.822, 0.258, True, 0), (0.860, 0.258, True, 0),
    (0.882, 0.226, True, 0), (0.896, 0.178, True, 1),
    (0.926, 0.164, False, 0), (0.962, 0.168, False, 0), (0.996, 0.138, False, 0),
    (1.030, 0.104, False, 0), (1.056, 0.058, False, 0), (1.065, 0.014, False, 0),
], 16)

mesh = bpy.data.meshes.new("East bridge limestone terminal post and glazed collar")
mesh.from_pydata(V, [], F)
mesh.update()

stone = bpy.data.materials.new("Warm East bridge limestone")
stone.use_nodes = True
n = stone.node_tree.nodes
l = stone.node_tree.links
tex = n.new("ShaderNodeTexImage")
tex.image = img
tex.location = (-330, 230)
shader = n.get("Principled BSDF")
shader.inputs["Roughness"].default_value = 0.84
l.new(tex.outputs["Color"], shader.inputs["Base Color"])

accent = bpy.data.materials.new("Aegean sky-blue collar")
accent.use_nodes = True
m = accent.node_tree.nodes.get("Principled BSDF")
m.inputs["Base Color"].default_value = (0.145, 0.425, 0.665, 1.0)
m.inputs["Roughness"].default_value = 0.34
m.inputs["Metallic"].default_value = 0.10

mesh.materials.append(stone)
mesh.materials.append(accent)
for i, poly in enumerate(mesh.polygons):
    poly.material_index = M[i]
    poly.use_smooth = poly.center.z > 0.875 if poly.center.length else i >= 14 * 16

ob = bpy.data.objects.new("east-post", mesh)
bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
modifier = ob.modifiers.new("Honed edge highlights", "BEVEL")
modifier.width = 0.008
modifier.segments = 2
modifier.limit_method = "ANGLE"
modifier.angle_limit = 0.43
bpy.ops.object.modifier_apply(modifier=modifier.name)

mesh = ob.data
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
        uv[idx].uv = ((a * 0.74) % 1.0, (b * 0.74) % 1.0)
mesh.validate(clean_customdata=True)
mesh.calc_loop_triangles()

coords = [v.co for v in mesh.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "EAST_POST_V1",
    len(mesh.loop_triangles),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    flush=True,
)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "east-post.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out / "east-post.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
)
