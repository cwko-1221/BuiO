"""Build Moonbay Plaza Bench v1: swept patinated-teal cast-iron scroll frames, center lumbar truss, honey-oak contoured slats, and brass rivets."""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

# Exact target dims [1.80, 0.68, 0.90]
W, D, H = 1.80, 0.68, 0.90

def make_packed_image(name, w, h, rgba_array):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img

W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# Warm honey-teak coastal wood texture matching #d48a43
grain = (
    0.50 * np.sin(u * 95.0 + 2.0 * np.sin(v * 11.0 + u * 4.0))
    + 0.30 * np.sin(u * 230.0 + 0.8 * np.cos(v * 24.0))
    + 0.20 * np.sin(v * 18.0 + u * 10.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.92 + 0.09 * grain, 0.78, 1.07)
wood_rgba[..., 0] = np.clip(0.82 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.51 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.24 * tone, 0, 1)
wood_img = make_packed_image("bench-wood", W_TX, H_TX, wood_rgba)

def make_tex_mat(name, image, rough, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
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
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    return mat

def make_vcol_mat(name, rough, metal=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-240, 180)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

MAT_WOOD = make_tex_mat("BenchOak", wood_img, rough=0.66)
MAT_IRON = make_vcol_mat("BenchCastIron", rough=0.44, metal=0.62)
MAT_BRASS = make_vcol_mat("BenchBrass", rough=0.32, metal=0.80)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
IRON_TEAL = (0.14, 0.30, 0.27, 1.0)
IRON_HI = (0.18, 0.36, 0.32, 1.0)
BRASS_GOLD = (0.86, 0.68, 0.30, 1.0)

def paint_faces(faces, mat_idx, col, uv_fn=None):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = True
        for loop in f.loops:
            loop[vc_layer] = col
            if uv_fn is not None:
                loop[uv_layer].uv = uv_fn(loop.vert.co)
            else:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x + 1.0) * 0.48 % 1.0, (co.y + co.z) * 0.85 % 1.0)

def add_box(center, size, mat_idx, col=WHITE, bevel=0.008, rot=(0.0, 0.0, 0.0)):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0)),
        verts=verts,
    )
    if bevel > 0.0:
        edges = list({e for v in verts for f in v.link_faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)

def add_rect_sweep(pts, w_rect, h_rect, mat_idx, col, bevel=0.004):
    """Sweep rectangular wrought-iron bar profile along planar 3D points cleanly without twisting."""
    rings = []
    for i, p in enumerate(pts):
        tan = pts[1] - pts[0] if i == 0 else (pts[-1] - pts[-2] if i == len(pts) - 1 else pts[i + 1] - pts[i - 1])
        t = tan.normalized()
        x_ax = Vector((1.0, 0.0, 0.0))
        n_ax = x_ax.cross(t).normalized()
        hw, hh = w_rect * 0.5, h_rect * 0.5
        rings.append([
            bm.verts.new(p - x_ax * hw - n_ax * hh),
            bm.verts.new(p + x_ax * hw - n_ax * hh),
            bm.verts.new(p + x_ax * hw + n_ax * hh),
            bm.verts.new(p - x_ax * hw + n_ax * hh),
        ])
    faces = []
    for r in range(len(rings) - 1):
        a, b = rings[r], rings[r + 1]
        for k in range(4):
            kn = (k + 1) % 4
            faces.append(bm.faces.new((a[k], a[kn], b[kn], b[k])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[-1]))
    paint_faces(faces, mat_idx, col)

def add_cyl(p0, p1, r0, r1, segs, mat_idx, col):
    p0v, p1v = Vector(p0), Vector(p1)
    z_ax = (p1v - p0v).normalized()
    ref = Vector((0, 0, 1)) if abs(z_ax.z) < 0.9 else Vector((0, 1, 0))
    x_ax = z_ax.cross(ref).normalized()
    y_ax = z_ax.cross(x_ax).normalized()
    rings = [
        [bm.verts.new(pos + x_ax * (math.cos(2 * math.pi * i / segs) * r) + y_ax * (math.sin(2 * math.pi * i / segs) * r)) for i in range(segs)]
        for pos, r in [(p0v, r0), (p1v, r1)]
    ]
    faces = [bm.faces.new((rings[0][i], rings[0][(i + 1) % segs], rings[1][(i + 1) % segs], rings[1][i])) for i in range(segs)]
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[1]))
    paint_faces(faces, mat_idx, col)

def add_ball(center, rad, mat_idx, col):
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center), verts=verts)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)

# 1. Cast-iron patinated end frames (x = +-0.72) + center iron spine (x = 0)
# Front foot pad reaches y = -0.340, rear foot pad reaches y = +0.340 -> exact D = 0.680, minZ = 0.000
for sx in (-0.72, +0.72):
    # Stepped cast-iron scroll base foot pads flush at z=0.000..0.028
    add_box((sx, -0.295, 0.014), (0.064, 0.090, 0.028), 1, IRON_TEAL, bevel=0.005)
    add_box((sx, +0.295, 0.014), (0.064, 0.090, 0.028), 1, IRON_TEAL, bevel=0.005)

    # S-curved front leg rising smoothly from front foot pad into seat bolster + horizontal seat bar + angled back spine
    seat_spine = [
        Vector((sx, -0.295, 0.024)),
        Vector((sx, -0.255, 0.195)),
        Vector((sx, -0.220, 0.365)),
        Vector((sx, -0.050, 0.375)),
        Vector((sx, +0.165, 0.378)),
        Vector((sx, +0.235, 0.545)),
        Vector((sx, +0.295, 0.720)),
        Vector((sx, +0.332, 0.875)),
    ]
    add_rect_sweep(seat_spine, 0.046, 0.044, 1, IRON_TEAL)

    # Swept rear leg bracing back bolster cleanly down to rear scroll pad at y = +0.295
    rear_leg = [
        Vector((sx, +0.295, 0.024)),
        Vector((sx, +0.245, 0.195)),
        Vector((sx, +0.175, 0.375)),
    ]
    add_rect_sweep(rear_leg, 0.046, 0.044, 1, IRON_TEAL)

    # Curved cast-iron armrest arch looping from backrest to front corner of seat + rolled brass rosette boss
    arm_curve = [
        Vector((sx, +0.258, 0.618)),
        Vector((sx, +0.120, 0.625)),
        Vector((sx, -0.030, 0.612)),
        Vector((sx, -0.160, 0.565)),
        Vector((sx, -0.232, 0.485)),
        Vector((sx, -0.235, 0.415)),
    ]
    add_rect_sweep(arm_curve, 0.042, 0.036, 1, IRON_HI)
    add_ball((sx, +0.258, 0.618), 0.022, 2, BRASS_GOLD)
    add_ball((sx, -0.242, 0.500), 0.018, 2, BRASS_GOLD)

    # Ornate curved decorative iron scroll ring nestled neatly under the side seat bolster
    scroll_pts = []
    for k in range(13):
        ang = -math.pi * 0.1 + k * (math.pi * 1.35 / 12.0)
        scroll_pts.append(Vector((sx, 0.0 + math.cos(ang) * 0.13, 0.25 + math.sin(ang) * 0.105)))
    add_rect_sweep(scroll_pts, 0.024, 0.022, 1, IRON_HI)

# Center cast-iron under-seat spine strut (x = 0) + diagonal wrought-iron under-frame tie rods
center_spine = [
    Vector((0.0, -0.215, 0.372)),
    Vector((0.0, +0.165, 0.376)),
    Vector((0.0, +0.245, 0.560)),
    Vector((0.0, +0.320, 0.855)),
]
add_rect_sweep(center_spine, 0.036, 0.036, 1, IRON_TEAL)
for sx in (-1.0, +1.0):
    add_cyl((0.0, +0.05, 0.220), (sx * 0.71, +0.08, 0.365), 0.014, 0.014, 8, 1, IRON_HI)
    add_cyl((0.0, -0.05, 0.220), (sx * 0.71, -0.18, 0.365), 0.014, 0.014, 8, 1, IRON_HI)
add_box((0.0, 0.0, 0.220), (0.048, 0.22, 0.032), 1, IRON_TEAL, bevel=0.004)
add_cyl((-0.72, 0.0, 0.175), (+0.72, 0.0, 0.175), 0.014, 0.014, 8, 1, IRON_TEAL)

# 2. Warm Honey-Oak Bench Slats spanning exact W = 1.800m (x in [-0.900, +0.900])
# 4 ergonomic contoured seat slats + subtle waterfall rounded front lip slat
seat_specs = [
    (-0.235, 0.402, +0.12, 0.098),
    (-0.122, 0.406, +0.02, 0.098),
    (-0.008, 0.402, -0.02, 0.098),
    (+0.106, 0.404, -0.04, 0.098),
]
for i, (sy, sz, pitch, sd) in enumerate(seat_specs):
    tint = 0.96 + 0.04 * (i % 2)
    add_box((0.0, sy, sz), (1.800, sd, 0.036), 0, (tint, tint * 0.98, tint * 0.94, 1.0), bevel=0.009, rot=(pitch, 0.0, 0.0))
    for rx in (-0.72, 0.0, +0.72):
        add_ball((rx, sy, sz + 0.018), 0.009, 2, BRASS_GOLD)

# 3 contoured backrest slats reclined ~17 deg, crowned at exact maxZ = 0.9000
back_specs = [
    (0.228, 0.548, 0.28, 0.094),
    (0.264, 0.675, 0.28, 0.100),
    (0.304, 0.808, 0.28, 0.112),
]
for i, (by, bz, pitch, sh) in enumerate(back_specs):
    tint = 0.95 + 0.05 * ((i + 1) % 2)
    add_box((0.0, by, bz), (1.800, 0.036, sh), 0, (tint, tint * 0.98, tint * 0.95, 1.0), bevel=0.009, rot=(-pitch, 0.0, 0.0))
    for rx in (-0.72, 0.0, +0.72):
        add_ball((rx, by - 0.017, bz), 0.009, 2, BRASS_GOLD)

# Gently arched wooden top crest accent along backrest center (maxZ reaches exact 0.9000)
add_box((0.0, 0.312, 0.878), (0.64, 0.042, 0.044), 0, (1.03, 0.99, 0.94, 1.0), bevel=0.009, rot=(-0.28, 0.0, 0.0))

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Moonbay cast-iron and honey-oak park bench")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Moonbay cast-iron and honey-oak park bench", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_WOOD, MAT_IRON, MAT_BRASS):
    obj.data.materials.append(mat)

# Clamp exact Z height strictly [0.000, 0.900] cleanly if bevel/tilt lifted slightly
coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
scale_y = D / (hi[1] - lo[1])
scale_z = H / (hi[2] - lo[2])
mid_y = (lo[1] + hi[1]) * 0.5
for v in obj.data.vertices:
    v.co.y = (v.co.y - mid_y) * scale_y
    v.co.z = (v.co.z - lo[2]) * scale_z

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "BENCH_V1",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "bench.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "bench.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
