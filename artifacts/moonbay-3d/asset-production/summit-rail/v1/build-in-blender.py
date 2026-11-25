"""Build Moonbay Observatory Ivory Stone Balustrade (summit-rail v1): grounded piers with cross-tenon moldings, ball finials, top/bottom beams, and 5 tapered stone spindles."""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

# Exact target bounds [w=2.70, d=0.40, h=0.85], minZ=0.0000
W, D, H = 2.70, 0.40, 0.85


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

# Warm ivory limestone matching 0xd9bb8e / 0xf4d6b2 railStone and summit-steps v3
grain = (
    0.45 * np.sin(v * 64.0 + 1.2 * np.sin(u * 10.0 + v * 4.5))
    + 0.30 * np.sin(u * 42.0 + v * 17.0)
    + 0.25 * np.cos(xx * 0.31) * np.sin(yy * 0.38)
)
stone_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.955 + 0.055 * grain, 0.86, 1.04)
stone_rgba[..., 0] = np.clip(0.955 * tone, 0.0, 1.0)
stone_rgba[..., 1] = np.clip(0.845 * tone, 0.0, 1.0)
stone_rgba[..., 2] = np.clip(0.665 * tone, 0.0, 1.0)
stone_img = make_packed_image("summit-rail-stone", W_TX, H_TX, stone_rgba)

mat = bpy.data.materials.new("ObservatoryIvoryStone")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.83
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = stone_img
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

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

STONE_IVORY = (1.00, 0.99, 0.97, 1.0)
STONE_CAP = (1.03, 1.01, 0.98, 1.0)
STONE_BEAM = (0.97, 0.95, 0.91, 1.0)
STONE_BASE = (0.91, 0.89, 0.85, 1.0)


def paint_faces(faces, col, smooth_mode=False):
    for f in faces:
        f.material_index = 0
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            co = loop.vert.co
            loop[uv_layer].uv = ((co.x + 1.35) * 0.45 % 1.0, (co.y + co.z) * 0.75 % 1.0)


def add_box(center, size, col=STONE_IVORY, bevel=0.012, segs=2, smooth_mode=False):
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
    paint_faces([f for f in bm.faces if f not in before], col, smooth_mode=smooth_mode)


def add_lathe(cx, cy, profile_rz, segs=16, col=STONE_IVORY):
    rings = []
    for r, z in profile_rz:
        if r <= 1e-4:
            rings.append([bm.verts.new(Vector((cx, cy, z)))])
        else:
            rings.append([
                bm.verts.new(
                    Vector((
                        cx + math.cos(2.0 * math.pi * k / segs) * r,
                        cy + math.sin(2.0 * math.pi * k / segs) * r,
                        z,
                    ))
                )
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


# 1. Left & Right Grounded End Piers (pier center at x = +-1.170)
# Main pier shaft: 0.28m wide (x = +-1.03..+-1.31), 0.34m deep (y = +-0.17)
# Subtle base shoe at minZ=0.0000; outer tenon caps reach x=+-1.350 (W=2.7000) & y=+-0.200 (D=0.4000)
for sx in (-1.170, +1.170):
    # Grounded chamfered pier shaft resting solidly at z = 0.000..0.720
    add_box((sx, 0.0, 0.045), (0.310, 0.360, 0.090), STONE_BASE, bevel=0.010, segs=2)
    add_box((sx, 0.0, 0.385), (0.280, 0.330, 0.650), STONE_IVORY, bevel=0.014, segs=2)
    add_box((sx, 0.0, 0.708), (0.304, 0.354, 0.044), STONE_CAP, bevel=0.010, segs=2)

    # Signature Observatory cross-tenon moldings echoing objects/summit-rail.png
    # Projecting slightly on front/back (d=0.4000) and outer pier end (to exact +-1.350 -> W=2.7000)
    sign_x = 1.0 if sx > 0 else -1.0
    for tz in (0.205, 0.595):
        # Wraparound stone tenon collar hitting exact +-1.350 outer X and +-0.200 Y
        add_box((sx + sign_x * 0.020, 0.0, tz), (0.320, 0.400, 0.072), STONE_BEAM, bevel=0.014, segs=2)

    # Smooth turned spherical finial seated atop neck collar reaching exact maxZ = 0.8500
    finial_prof = [
        (0.088, 0.724),
        (0.088, 0.740),
        (0.062, 0.752),
        (0.095, 0.782),
        (0.104, 0.806),
        (0.092, 0.830),
        (0.060, 0.844),
        (0.000, 0.850),
    ]
    add_lathe(sx, 0.0, finial_prof, segs=18, col=STONE_CAP)

# 2. Horizontal Lower Stone Sill Beam & Upper Coping Handrail Beam spanning cleanly between piers
# Leaving open 15cm architectural shadow clearance beneath the lower beam (z=0.16..0.25)
add_box((0.0, 0.0, 0.205), (2.100, 0.250, 0.092), STONE_BEAM, bevel=0.012, segs=2)
# Top coping beam with subtle recessed mortar backing core at center joint (zero light leak)
add_box((0.0, 0.0, 0.595), (0.040, 0.236, 0.072), STONE_BASE, bevel=0.004, segs=1)
for bx in (-0.525, +0.525):
    add_box((bx, 0.0, 0.595), (1.046, 0.270, 0.098), STONE_CAP, bevel=0.013, segs=2)

# 3. Five Gently Tapered Turned Stone Spindles seated cleanly from lower beam (z=0.245) to upper coping (z=0.552)
spindle_prof = [
    (0.072, 0.242),
    (0.072, 0.262),
    (0.062, 0.278),
    (0.056, 0.355),
    (0.050, 0.445),
    (0.044, 0.520),
    (0.052, 0.538),
    (0.064, 0.548),
    (0.064, 0.560),
]
for kx in (-0.760, -0.380, 0.000, +0.380, +0.760):
    add_lathe(kx, 0.0, spindle_prof, segs=16, col=STONE_IVORY)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Moonbay observatory ivory stone balustrade")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Moonbay observatory ivory stone balustrade", mesh)
bpy.context.scene.collection.objects.link(obj)
obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "SUMMIT_RAIL_V1",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "summit-rail.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "summit-rail.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
