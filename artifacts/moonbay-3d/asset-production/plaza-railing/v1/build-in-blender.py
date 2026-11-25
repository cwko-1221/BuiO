"""Build Moonbay Plaza Stone Railing v1: classical turned limestone balusters, molded coping rail, plinth curb, and ball-finial end piers."""
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

# Exact target dims [3.00, 0.45, 0.86]
W, D, H = 3.00, 0.45, 0.86

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

# Warm Moonbay limestone / travertine texture harmonizing with #f5d8a4 and fountain v2
strata = (
    0.45 * np.sin(v * 68.0 + 1.4 * np.sin(u * 12.0 + v * 5.0))
    + 0.30 * np.sin(u * 45.0 + v * 19.0)
    + 0.25 * np.cos(xx * 0.35) * np.sin(yy * 0.42)
)
stone_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.95 + 0.065 * strata, 0.84, 1.05)
stone_rgba[..., 0] = np.clip(0.96 * tone, 0, 1)
stone_rgba[..., 1] = np.clip(0.845 * tone, 0, 1)
stone_rgba[..., 2] = np.clip(0.655 * tone, 0, 1)
stone_img = make_packed_image("railing-stone", W_TX, H_TX, stone_rgba)

def make_tex_mat(name, image, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
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

MAT_STONE = make_tex_mat("RailingLimestone", stone_img, rough=0.84)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

STONE_CREAM = (1.0, 1.0, 1.0, 1.0)
STONE_CAP = (1.03, 1.01, 0.98, 1.0)
STONE_PLINTH = (0.91, 0.89, 0.85, 1.0)
STONE_PANEL = (0.94, 0.92, 0.89, 1.0)

def paint_faces(faces, col, smooth_mode=False):
    for f in faces:
        f.material_index = 0
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + 1.5) * 0.42 % 1.0, (co.y + co.z) * 0.72 % 1.0)

def add_box(center, size, col=STONE_CREAM, bevel=0.008, smooth_mode=False):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Matrix.Diagonal((*size, 1.0)),
        verts=verts,
    )
    if bevel > 0.0:
        edges = list({e for v in verts for f in v.link_faces for e in f.edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    paint_faces([f for f in bm.faces if f not in before], col, smooth_mode=smooth_mode)

def add_lathe(cx, cy, profile_rz, segs=14, col=STONE_CREAM):
    """Build revolved stone baluster or sphere finial cleanly along Z."""
    rings = []
    for r, z in profile_rz:
        if r <= 1e-4:
            rings.append([bm.verts.new(Vector((cx, cy, z)))])
        else:
            rings.append([
                bm.verts.new(Vector((cx + math.cos(2 * math.pi * k / segs) * r, cy + math.sin(2 * math.pi * k / segs) * r, z)))
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
    paint_faces(faces, col, smooth_mode=True)

# 1. Grounded Left & Right Architectural End Piers (exact X span [-1.500..+1.500], Y [-0.225..+0.225])
# Outer pier base plinth sits at x = +-1.310 with width 0.380 -> exact minX=-1.500, maxX=+1.500; depth = 0.450.
for sx in (-1.310, +1.310):
    # Two-tier grounded stone plinth base
    add_box((sx, 0.0, 0.055), (0.380, 0.450, 0.110), STONE_PLINTH, bevel=0.010)
    add_box((sx, 0.0, 0.132), (0.340, 0.404, 0.044), STONE_PANEL, bevel=0.008)
    # Main chamfered pier column body
    add_box((sx, 0.0, 0.390), (0.300, 0.360, 0.480), STONE_CREAM, bevel=0.010)
    # Recessed decorative framed stone relief panels on front/back/outer pier faces
    for sy_f in (-0.184, +0.184):
        add_box((sx, sy_f, 0.390), (0.180, 0.014, 0.340), STONE_PANEL, bevel=0.004)
    # Stepped overhanging cornice molding cap
    add_box((sx, 0.0, 0.650), (0.350, 0.410, 0.042), STONE_PANEL, bevel=0.008)
    add_box((sx, 0.0, 0.695), (0.376, 0.436, 0.048), STONE_CAP, bevel=0.010)
    # Classical turned limestone sphere finial atop collar pedestal hitting exact maxZ = 0.8600
    finial_prof = [
        (0.115, 0.718),
        (0.115, 0.735),
        (0.068, 0.748),
        (0.072, 0.762),
        (0.095, 0.785),
        (0.104, 0.808),
        (0.094, 0.832),
        (0.065, 0.850),
        (0.000, 0.860),
    ]
    add_lathe(sx, 0.0, finial_prof, segs=16, col=STONE_CAP)

# 2. Continuous Lower Masonry Curb Sill & Molded Upper Coping Rail (spanning cleanly between both piers)
# Lower plinth curb seated flush at z=0.000..0.155
add_box((0.0, 0.0, 0.065), (2.340, 0.330, 0.130), STONE_PLINTH, bevel=0.010)
add_box((0.0, 0.0, 0.145), (2.320, 0.290, 0.042), STONE_PANEL, bevel=0.008)

# Upper molded coping handrail divided into 3 carved stone lintel blocks with crisp bevel reveal joints
for bi, bx in enumerate((-0.770, 0.000, +0.770)):
    col_b = STONE_CREAM if bi == 1 else STONE_CAP
    add_box((bx, 0.0, 0.578), (0.768, 0.280, 0.042), STONE_PANEL, bevel=0.007)
    add_box((bx, 0.0, 0.630), (0.772, 0.340, 0.068), col_b, bevel=0.012)

# 3. Five Classical Turned Limestone Vase-Profile Balusters cleanly seated between sill (z=0.16) & top rail (z=0.56)
baluster_prof = [
    (0.078, 0.162),
    (0.078, 0.186),
    (0.052, 0.205),
    (0.072, 0.250),
    (0.084, 0.305),
    (0.068, 0.365),
    (0.046, 0.430),
    (0.042, 0.485),
    (0.056, 0.515),
    (0.048, 0.534),
    (0.074, 0.548),
    (0.074, 0.566),
]
for kx in (-0.880, -0.440, 0.000, +0.440, +0.880):
    # Square chamfered baluster base & top abacus plinth blocks
    add_box((kx, 0.0, 0.174), (0.162, 0.162, 0.028), STONE_PANEL, bevel=0.005)
    add_box((kx, 0.0, 0.556), (0.156, 0.156, 0.026), STONE_PANEL, bevel=0.005)
    add_lathe(kx, 0.0, baluster_prof, segs=16, col=STONE_CREAM)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Moonbay carved limestone plaza balustrade")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Moonbay carved limestone plaza balustrade", mesh)
bpy.context.scene.collection.objects.link(obj)
obj.data.materials.append(MAT_STONE)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "PLAZA_RAILING_V1",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "plaza-railing.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "plaza-railing.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
