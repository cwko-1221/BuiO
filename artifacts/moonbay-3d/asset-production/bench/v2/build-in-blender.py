"""Build Moonbay Plaza Bench v2: robust verdigris enameled cast-iron frames with closed side braces, longitudinal-grain flat-top oak slats, and crisp bevels."""
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

# Horizontal longitudinal wood grain: fibers vary smoothly along V, stretching long along U (plank length X)
grain = (
    0.50 * np.sin(v * 95.0 + 1.8 * np.sin(u * 5.5 + v * 3.0))
    + 0.30 * np.sin(v * 210.0 + 0.7 * np.cos(u * 9.0))
    + 0.20 * np.sin(u * 4.0 + v * 14.0)
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.93 + 0.08 * grain, 0.80, 1.07)
wood_rgba[..., 0] = np.clip(0.84 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.53 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.25 * tone, 0, 1)
wood_img = make_packed_image("bench-wood", W_TX, W_TX, wood_rgba)

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

MAT_WOOD = make_tex_mat("BenchOak", wood_img, rough=0.68)
# Enameled coastal verdigris-teal cast-iron (bright enough under ACESFilmic to stay richly teal, not black!)
MAT_IRON = make_vcol_mat("BenchCastIron", rough=0.45, metal=0.25)
MAT_BRASS = make_vcol_mat("BenchBrass", rough=0.32, metal=0.80)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

WHITE = (1.0, 1.0, 1.0, 1.0)
IRON_TEAL = (0.16, 0.45, 0.39, 1.0)
IRON_HI = (0.21, 0.54, 0.47, 1.0)
BRASS_GOLD = (0.86, 0.68, 0.30, 1.0)

def paint_faces(faces, mat_idx, col, uv_fn=None, smooth_mode=True):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            if uv_fn is not None:
                loop[uv_layer].uv = uv_fn(loop.vert.co)
            else:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x + 0.90) / 1.80, (co.y * 0.8 + co.z * 0.9) % 1.0)

def add_plank(center, size, rot_x, col, uv_v_off):
    """Build crisp chamfered plank: broad faces remain sharp/planar, bevels stay crisp cleanly."""
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Euler((rot_x, 0.0, 0.0), "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0)),
        verts=verts,
    )
    edges = list({e for v in verts for f in v.link_faces for e in f.edges})
    bmesh.ops.bevel(bm, geom=edges, offset=0.006, segments=1, affect="EDGES", clamp_overlap=True)
    faces = [f for f in bm.faces if f not in before]
    # Keep flat top/front/side faces sharp (smooth=False) so slats read planar like real milled timber, zero sausage curves
    paint_faces(
        faces,
        0,
        col,
        uv_fn=lambda co: ((co.x + 0.90) / 1.80, (co.y * 0.95 + co.z * 0.95 + uv_v_off) % 1.0),
        smooth_mode=False,
    )

def add_box(center, size, mat_idx, col=WHITE, bevel=0.006, rot=(0.0, 0.0, 0.0), smooth_mode=False):
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
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode)

def add_rect_sweep(pts, w_rect, h_rect, mat_idx, col):
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
    paint_faces(faces, mat_idx, col, smooth_mode=True)

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
    faces.append(bm.faces.new(rings[-1]))
    paint_faces(faces, mat_idx, col)

def add_ball(center, rad, mat_idx, col):
    before = set(bm.faces)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rad)["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center), verts=verts)
    paint_faces([f for f in bm.faces if f not in before], mat_idx, col)

# 1. Sturdy Enamel-Teal Cast-Iron End Frames (x = +-0.72) + Closed Structural Side Loops + Center Spine (x = 0)
for sx in (-0.72, +0.72):
    # Chunky grounded cast-iron stepped foot pads (z=0.000..0.050, footprint y in [-0.340, +0.340])
    add_box((sx, -0.282, 0.018), (0.084, 0.116, 0.036), 1, IRON_TEAL, bevel=0.006)
    add_box((sx, -0.278, 0.046), (0.068, 0.088, 0.024), 1, IRON_HI, bevel=0.005)
    add_box((sx, +0.282, 0.018), (0.084, 0.116, 0.036), 1, IRON_TEAL, bevel=0.006)
    add_box((sx, +0.278, 0.046), (0.068, 0.088, 0.024), 1, IRON_HI, bevel=0.005)

    # Sturdy S-curved front leg -> horizontal seat bolster -> reclined backrest spine upright
    seat_spine = [
        Vector((sx, -0.275, 0.048)),
        Vector((sx, -0.248, 0.205)),
        Vector((sx, -0.215, 0.365)),
        Vector((sx, -0.040, 0.376)),
        Vector((sx, +0.165, 0.378)),
        Vector((sx, +0.238, 0.548)),
        Vector((sx, +0.296, 0.725)),
        Vector((sx, +0.335, 0.875)),
    ]
    add_rect_sweep(seat_spine, 0.058, 0.054, 1, IRON_TEAL)

    # Sturdy rear leg + horizontal bottom runner bracing foot to front leg cleanly
    rear_leg = [
        Vector((sx, +0.275, 0.048)),
        Vector((sx, +0.235, 0.205)),
        Vector((sx, +0.170, 0.376)),
    ]
    add_rect_sweep(rear_leg, 0.058, 0.054, 1, IRON_TEAL)

    # Closed arched cast-iron side gusset connecting front leg waist -> seat midpoint -> rear leg waist (ZERO floating ends!)
    side_arch = [
        Vector((sx, -0.242, 0.220)),
        Vector((sx, -0.145, 0.305)),
        Vector((sx, 0.000, 0.335)),
        Vector((sx, +0.140, 0.305)),
        Vector((sx, +0.232, 0.220)),
    ]
    add_rect_sweep(side_arch, 0.038, 0.034, 1, IRON_HI)
    # Lower horizontal cast-iron side tie tying front & rear legs stably near ankle height
    add_cyl((sx, -0.255, 0.145), (sx, +0.250, 0.145), 0.017, 0.017, 10, 1, IRON_TEAL)

    # Bold sculpted arched cast-iron armrest joining backrest upright down solidly to front seat bolster
    arm_curve = [
        Vector((sx, +0.262, 0.625)),
        Vector((sx, +0.125, 0.632)),
        Vector((sx, -0.025, 0.618)),
        Vector((sx, -0.155, 0.568)),
        Vector((sx, -0.220, 0.482)),
        Vector((sx, -0.218, 0.392)),
    ]
    add_rect_sweep(arm_curve, 0.052, 0.042, 1, IRON_HI)
    add_ball((sx, +0.262, 0.625), 0.024, 2, BRASS_GOLD)
    add_ball((sx, -0.225, 0.488), 0.020, 2, BRASS_GOLD)

# Heavy center cast-iron lumbar spine support (x = 0) + closed diagonal steel under-seat V-trusses
center_spine = [
    Vector((0.0, -0.210, 0.372)),
    Vector((0.0, +0.165, 0.376)),
    Vector((0.0, +0.245, 0.560)),
    Vector((0.0, +0.325, 0.860)),
]
add_rect_sweep(center_spine, 0.044, 0.042, 1, IRON_TEAL)
for sx in (-1.0, +1.0):
    add_cyl((0.0, 0.00, 0.215), (sx * 0.71, +0.10, 0.365), 0.018, 0.018, 10, 1, IRON_HI)
    add_cyl((0.0, 0.00, 0.215), (sx * 0.71, -0.18, 0.365), 0.018, 0.018, 10, 1, IRON_HI)
add_box((0.0, -0.02, 0.215), (0.062, 0.095, 0.042), 1, IRON_TEAL, bevel=0.005)
add_cyl((-0.72, +0.02, 0.175), (+0.72, +0.02, 0.175), 0.017, 0.017, 10, 1, IRON_TEAL)

# 2. Crisp Flat-Top Honey-Oak Slats with Longitudinal Grain along X (NO top central block, NO sausage curvature!)
seat_specs = [
    (-0.238, 0.408, +0.06, 0.102, 0.00),
    (-0.122, 0.410, +0.01, 0.102, 0.23),
    (-0.006, 0.408, -0.02, 0.102, 0.47),
    (+0.110, 0.410, -0.04, 0.102, 0.71),
]
for i, (sy, sz, pitch, sd, uv_off) in enumerate(seat_specs):
    tint = 0.96 + 0.04 * (i % 2)
    add_plank((0.0, sy, sz), (1.800, sd, 0.036), pitch, (tint, tint * 0.98, tint * 0.94, 1.0), uv_off)
    for rx in (-0.72, 0.0, +0.72):
        add_ball((rx, sy, sz + 0.018), 0.010, 2, BRASS_GOLD)

back_specs = [
    (0.228, 0.556, -0.28, 0.104, 0.12),
    (0.268, 0.692, -0.28, 0.110, 0.41),
    (0.310, 0.834, -0.28, 0.122, 0.68),
]
for i, (by, bz, pitch, sh, uv_off) in enumerate(back_specs):
    tint = 0.95 + 0.05 * ((i + 1) % 2)
    add_plank((0.0, by, bz), (1.800, 0.038, sh), pitch, (tint, tint * 0.98, tint * 0.95, 1.0), uv_off)
    for rx in (-0.72, 0.0, +0.72):
        add_ball((rx, by - 0.018, bz), 0.010, 2, BRASS_GOLD)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Moonbay verdigris cast-iron and oak park bench")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Moonbay verdigris cast-iron and oak park bench", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_WOOD, MAT_IRON, MAT_BRASS):
    obj.data.materials.append(mat)

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
    "BENCH_V2",
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
