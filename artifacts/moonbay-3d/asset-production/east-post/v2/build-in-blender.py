"""Eastern lagoon bridge terminal pier (east-post v2): isotropic warm honed limestone, slim 0.46m base seated cleanly inside bridge cornice, wide 0.54m overhanging cap, crisp non-Z-fighting inset sky-blue glaze collar, and high-subdivision plump sphere finial."""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

# Generate isotropic porous warm honey limestone texture (zero vertical wood-grain streaks)
W_TX, H_TX = 512, 512
rng = np.random.default_rng(4022)
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)

# Multi-frequency isotropic mineral noise (periodic across tile edges)
field = np.zeros((H_TX, W_TX), dtype=np.float32)
for freq, amp in [(2, 0.35), (5, 0.28), (11, 0.18), (23, 0.11)]:
    ph1, ph2 = rng.uniform(0, math.tau, 2)
    u = xx * (math.tau * freq / W_TX)
    v = yy * (math.tau * freq / H_TX)
    field += amp * np.sin(u + ph1) * np.cos(v + ph2)
    field += amp * 0.7 * np.cos(u - v + ph1 * 0.5)

pores = rng.normal(0.0, 0.032, (H_TX, W_TX)).astype(np.float32)
# Box-blur pores slightly so they read like soft limestone grain rather than harsh static
pores = 0.5 * pores + 0.25 * (np.roll(pores, 1, 0) + np.roll(pores, 1, 1))
val = np.clip(0.955 + 0.040 * field + pores, 0.85, 1.03)

rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
rgba[..., 0] = np.clip(0.92 * val, 0.0, 1.0)
rgba[..., 1] = np.clip(0.79 * val, 0.0, 1.0)
rgba[..., 2] = np.clip(0.60 * val, 0.0, 1.0)

img = bpy.data.images.new("east-post-limestone", width=W_TX, height=H_TX, alpha=True)
img.pixels.foreach_set(rgba.ravel())
img.filepath_raw = str(out / "east-post-limestone.png")
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
tex.location = (-460, 260)
vc = nt.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Tint"
vc.location = (-460, 30)
mix = nt.nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
mix.blend_type = "MULTIPLY"
mix.inputs["Factor"].default_value = 1.0
mix.location = (-210, 180)
nt.links.new(tex.outputs["Color"], mix.inputs["A"])
nt.links.new(vc.outputs["Color"], mix.inputs["B"])
nt.links.new(mix.outputs["Result"], bs.inputs["Base Color"])

glaze = bpy.data.materials.new("Aegean sky-blue collar")
glaze.use_nodes = True
gb = glaze.node_tree.nodes.get("Principled BSDF")
gb.inputs["Base Color"].default_value = (0.145, 0.425, 0.665, 1.0)
gb.inputs["Roughness"].default_value = 0.30
gb.inputs["Metallic"].default_value = 0.10

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

STONE_WARM = (1.00, 1.00, 1.00, 1.0)
STONE_CAP = (1.03, 1.01, 0.98, 1.0)
STONE_SHADE = (0.91, 0.90, 0.88, 1.0)
GLAZE_WHITE = (1.00, 1.00, 1.00, 1.0)


def paint_faces(faces, mat_idx, col, smooth_mode=False):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            loop[vc_layer] = col
            co = loop.vert.co
            if az >= max(ax, ay):
                u_c, v_c = co.x, co.y
            elif ax >= ay:
                u_c, v_c = co.y, co.z
            else:
                u_c, v_c = co.x, co.z
            loop[uv_layer].uv = ((u_c * 0.85 + 0.5) % 1.0, (v_c * 0.85 + 0.5) % 1.0)


def add_chamfer_box(center, size, mat_idx=0, col=STONE_WARM, bevel=0.012, segs=3, smooth_mode=False):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Matrix.Diagonal((*size, 1.0)),
        verts=verts,
    )
    if bevel > 0.0:
        edges = list({e for v in verts for f in v.link_faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=segs, affect="EDGES", clamp_overlap=True)
    new_faces = [f for f in bm.faces if f not in before]
    bmesh.ops.recalc_face_normals(bm, faces=new_faces)
    paint_faces(new_faces, mat_idx, col, smooth_mode=smooth_mode)


def add_lathe_z(rings_rz, segs=32, mat_idx=0, col=STONE_WARM, smooth_mode=True):
    rings = []
    for r, z in rings_rz:
        if r <= 1e-4:
            rings.append([bm.verts.new(Vector((0.0, 0.0, z)))])
        else:
            rings.append([
                bm.verts.new(Vector((math.cos(k * math.tau / segs) * r, math.sin(k * math.tau / segs) * r, z)))
                for k in range(segs)
            ])
    faces = []
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        if len(a) == 1 and len(b) > 1:
            for k in range(segs):
                faces.append(bm.faces.new((a[0], b[(k + 1) % segs], b[k])))
        elif len(a) > 1 and len(b) == 1:
            for k in range(segs):
                faces.append(bm.faces.new((a[k], a[(k + 1) % segs], b[0])))
        elif len(a) > 1 and len(b) > 1:
            for k in range(segs):
                kn = (k + 1) % segs
                faces.append(bm.faces.new((a[k], a[kn], b[kn], b[k])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    paint_faces(faces, mat_idx, col, smooth_mode=smooth_mode)


# 1. Slim Base Plinth (0.46m -> half 0.23m -> 1.855 + 0.23 = 2.085m strictly INSIDE 2.125m bridge cornice)
# Exact footprint target [0.58, 0.58, 1.10]: cap cornice hits w=d=0.54m (-6.9% within +-12%), height exact 1.10m (minZ=-0.035..maxZ=1.065)
add_chamfer_box((0.0, 0.0, 0.015), (0.460, 0.460, 0.100), mat_idx=0, col=STONE_SHADE, bevel=0.016, segs=3, smooth_mode=False)
add_chamfer_box((0.0, 0.0, 0.092), (0.424, 0.424, 0.064), mat_idx=0, col=STONE_SHADE, bevel=0.014, segs=3, smooth_mode=False)

# 2. Chamfered Architectural Column Shaft (0.38m wide -> crisp waist echoing objects/east-post.png)
add_chamfer_box((0.0, 0.0, 0.435), (0.380, 0.380, 0.640), mat_idx=0, col=STONE_WARM, bevel=0.022, segs=3, smooth_mode=True)

# 3. Proud Overhanging Cornice Cap (0.54m x 0.54m) with clean recessed top lip
add_chamfer_box((0.0, 0.0, 0.742), (0.440, 0.440, 0.044), mat_idx=0, col=STONE_SHADE, bevel=0.012, segs=3, smooth_mode=False)
add_chamfer_box((0.0, 0.0, 0.796), (0.540, 0.540, 0.078), mat_idx=0, col=STONE_CAP, bevel=0.018, segs=3, smooth_mode=False)

# 4. Crisp Stepped Limestone Pedestal Rim & Completely Separate Sky-Blue Glazed Ceramic Collar
# No shared diagonal coplanar bevel faces -> razor-sharp non-Z-fighting border!
add_chamfer_box((0.0, 0.0, 0.842), (0.400, 0.400, 0.022), mat_idx=0, col=STONE_SHADE, bevel=0.006, segs=2, smooth_mode=False)
# Stepped sky-blue glazed octagonal/chamfered collar inset atop the cornice lip (mat_idx=1)
add_chamfer_box((0.0, 0.0, 0.864), (0.340, 0.340, 0.036), mat_idx=1, col=GLAZE_WHITE, bevel=0.010, segs=3, smooth_mode=True)
# Circular glazed ring collar cradling the limestone sphere finial (mat_idx=1)
add_lathe_z(
    [(0.172, 0.862), (0.172, 0.882), (0.156, 0.896), (0.125, 0.902), (0.0, 0.902)],
    segs=32,
    mat_idx=1,
    col=GLAZE_WHITE,
    smooth_mode=True,
)

# 5. Turned Limestone Neck Plinth + Plump High-Subdivision Spherical Finial (maxZ = 1.065, H = 1.1000m)
finial_profile = [
    (0.118, 0.895),
    (0.122, 0.908),
    (0.108, 0.916),
]
# Full plump sphere centered at z = 0.985, rx = 0.146, rz = 0.080 -> bottom 0.905, top 1.065 (smooth 12-ring arc!)
for k in range(13):
    phi = -0.44 * math.pi + (0.94 * math.pi) * (k / 12.0)
    r = max(0.0, 0.146 * math.cos(phi))
    z = 0.984 + 0.081 * math.sin(phi)
    finial_profile.append((r, z))
finial_profile.append((0.0, 1.065))
add_lathe_z(finial_profile, segs=32, mat_idx=0, col=STONE_CAP, smooth_mode=True)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("East bridge limestone terminal post and glazed collar")
bm.to_mesh(mesh)
bm.free()

ob = bpy.data.objects.new("east-post", mesh)
bpy.context.collection.objects.link(ob)
ob.data.materials.append(stone)
ob.data.materials.append(glaze)
mesh.validate(clean_customdata=True)
mesh.calc_loop_triangles()

coords = [v.co for v in mesh.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "EAST_POST_V2",
    len(mesh.loop_triangles),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "east-post.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out / "east-post.glb"),
    export_format="GLB",
    export_animations=False,
    export_normals=True,
)
