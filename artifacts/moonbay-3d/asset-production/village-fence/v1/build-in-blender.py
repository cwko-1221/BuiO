"""Build Moonbay Pine Village Double-Rail Timber Fence (village-fence v1):
Cream-oak turned posts with acorn finials at exact 2.30m span (+/-1.15m) for
seamless L-corner joins, chamfered top cream handrail, walnut middle rail, and
honey-cedar lower rail with mortised central cleat and longitudinal wood grain.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

W, D, H = 2.55, 0.28, 0.86
SPAN = 2.30
HALF_SPAN = SPAN * 0.5  # +/- 1.15m exact post center-to-center span


def make_packed_image(name, w, h, rgba_array, colorspace="sRGB"):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# Longitudinal wood fibers running along U with organic ring cathedral waves & fine pores.
warp = 0.08 * np.sin(u * 2.0 * math.pi * 2.0 + 0.7 * np.cos(v * 2.0 * math.pi * 3.0))
rings = np.sin((v * 18.0 + warp * 10.0) * math.pi)
pores = 0.40 * np.sin(v * 94.0 + u * 8.0) + 0.25 * np.cos(u * 38.0 + v * 52.0)
grain = 0.55 * rings + 0.30 * pores + 0.15 * np.sin(u * 14.0 + v * 23.0)

wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.955 + 0.068 * grain, 0.84, 1.05)
wood_rgba[..., 0] = np.clip(tone, 0.0, 1.0)
wood_rgba[..., 1] = np.clip(tone * 0.992, 0.0, 1.0)
wood_rgba[..., 2] = np.clip(tone * 0.978, 0.0, 1.0)
albedo_img = make_packed_image("village-fence-wood", W_TX, H_TX, wood_rgba, "sRGB")

rough_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
r_val = np.clip(0.76 - 0.08 * grain, 0.62, 0.90)
rough_rgba[..., 0] = r_val
rough_rgba[..., 1] = r_val
rough_rgba[..., 2] = r_val
rough_img = make_packed_image("village-fence-rough", W_TX, H_TX, rough_rgba, "Non-Color")

mat = bpy.data.materials.new("VillageFenceTimber")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
bsdf.inputs["Specular IOR Level"].default_value = 0.32

tex_a = nt.nodes.new("ShaderNodeTexImage")
tex_a.image = albedo_img
tex_a.location = (-480, 260)

vc = nt.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Tint"
vc.location = (-480, 20)

mix = nt.nodes.new("ShaderNodeMix")
mix.data_type = "RGBA"
mix.blend_type = "MULTIPLY"
mix.inputs["Factor"].default_value = 1.0
mix.location = (-220, 160)

tex_r = nt.nodes.new("ShaderNodeTexImage")
tex_r.image = rough_img
tex_r.location = (-480, -240)

nt.links.new(tex_a.outputs["Color"], mix.inputs["A"])
nt.links.new(vc.outputs["Color"], mix.inputs["B"])
nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
nt.links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

# Sourced from Moonbay Coast timber palette (ASSETS color 0xbe9662 + cottage cream oak + walnut rail):
COL_CREAM_OAK = (0.96, 0.83, 0.62, 1.0)    # Posts & top handrail
COL_CREAM_CAP = (0.98, 0.87, 0.67, 1.0)    # Finial balls & top molding
COL_WALNUT = (0.39, 0.19, 0.11, 1.0)       # Deep rich chestnut middle rail & mortise pegs
COL_HONEY_CEDAR = (0.76, 0.54, 0.32, 1.0)  # Lower horizontal beam & plinth bands
COL_SHOE_DARK = (0.88, 0.72, 0.50, 1.0)    # Plinth base collar & cleat


def paint_faces(faces, col, grain_axis="X", smooth_mode=False):
    for f in faces:
        f.material_index = 0
        f.smooth = smooth_mode
        for loop in f.loops:
            loop[vc_layer] = col
            co = loop.vert.co
            if grain_axis == "X":
                u_val = (co.x * 0.55 + 0.5) % 1.0
                v_val = ((co.y * 2.2 + co.z * 2.4) + 0.5) % 1.0
            elif grain_axis == "Z":
                u_val = (co.z * 1.15 + 0.1) % 1.0
                v_val = ((co.x * 3.2 + co.y * 3.2) + 0.5) % 1.0
            else:
                u_val = (co.x * 1.8 + 0.5) % 1.0
                v_val = (co.y * 1.8 + 0.5) % 1.0
            loop[uv_layer].uv = (u_val, v_val)


def add_box(center, size, col, bevel=0.012, segs=2, grain_axis="X", smooth_mode=False):
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
    paint_faces([f for f in bm.faces if f not in before], col, grain_axis=grain_axis, smooth_mode=smooth_mode)


def add_lathe(cx, cy, profile_rz, segs=18, col=COL_CREAM_CAP):
    before = set(bm.faces)
    rings = []
    for r, z in profile_rz:
        if r <= 1e-4:
            v = bm.verts.new((cx, cy, z))
            rings.append([v])
        else:
            ring = [
                bm.verts.new((cx + r * math.cos(2 * math.pi * k / segs), cy + r * math.sin(2 * math.pi * k / segs), z))
                for k in range(segs)
            ]
            rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) > 1:
            for k in range(segs):
                bm.faces.new((a[0], b[(k + 1) % segs], b[k]))
        elif len(a) > 1 and len(b) == 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        elif len(a) > 1 and len(b) > 1:
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
    paint_faces([f for f in bm.faces if f not in before], col, grain_axis="Z", smooth_mode=True)


# 1. Twin turned & mortised corner posts at +/- 1.15m (total span = 2.30m)
# Total outer X extent: 1.15 + 0.125 = 1.275 -> W = 2.550m exact
# Total Y extent (base plinth depth): 0.280m exact
for side in (-1.0, 1.0):
    px = side * HALF_SPAN
    # Grounded chamfered plinth collar base (z = -0.060 .. 0.135m -> anchored into gentle slopes, top clean at +0.135m)
    add_box((px, 0.0, 0.0375), (0.250, 0.280, 0.195), COL_SHOE_DARK, bevel=0.014, segs=2, grain_axis="Z")
    # Sloped drip-cap transition bevel collar (z = 0.132 .. 0.165m)
    add_box((px, 0.0, 0.148), (0.215, 0.235, 0.032), COL_HONEY_CEDAR, bevel=0.008, segs=2, grain_axis="Z")
    # Vertical post core (z = 0.160 .. 0.678m)
    add_box((px, 0.0, 0.419), (0.176, 0.180, 0.518), COL_CREAM_OAK, bevel=0.015, segs=2, grain_axis="Z", smooth_mode=True)
    # Recessed neck reveal collar below capital (z = 0.672 .. 0.695m)
    add_box((px, 0.0, 0.684), (0.205, 0.205, 0.026), COL_HONEY_CEDAR, bevel=0.006, segs=1, grain_axis="Z")
    # Tiered post capital cornice (z = 0.692 .. 0.742m)
    add_box((px, 0.0, 0.717), (0.244, 0.244, 0.050), COL_CREAM_CAP, bevel=0.011, segs=2, grain_axis="Z")
    # Turned acorn/ball finial seated flush on top capital (z = 0.740 .. 0.860m exact)
    finial_profile = [
        (0.088, 0.740),
        (0.066, 0.752),
        (0.082, 0.774),
        (0.095, 0.800),
        (0.086, 0.828),
        (0.056, 0.848),
        (0.020, 0.858),
        (0.000, 0.860),
    ]
    add_lathe(px, 0.0, finial_profile, segs=18, col=COL_CREAM_CAP)
    # Subtle mortise dowel pegs on post front/back faces showing joinery (strictly inside post width, ZERO clipping outside)
    for peg_z, peg_col in ((0.625, COL_HONEY_CEDAR), (0.410, COL_WALNUT), (0.195, COL_HONEY_CEDAR)):
        add_box((px, 0.0, peg_z), (0.044, 0.202, 0.036), peg_col, bevel=0.006, segs=1, grain_axis="Y")

# 2. Horizontal timber rails spanning cleanly INSIDE the posts (x = -1.07 .. +1.07 -> no through-post poking!)
# Open grass gap at z = 0.00 .. 0.135m between corner plinth shoes keeps fence light and airy.
RAIL_LEN = 2.16

# Top shaped handrail (z = 0.578 .. 0.676m) with crowned upper bevel
add_box((0.0, 0.0, 0.626), (RAIL_LEN, 0.170, 0.096), COL_CREAM_OAK, bevel=0.018, segs=2, grain_axis="X", smooth_mode=True)
add_box((0.0, 0.0, 0.578), (RAIL_LEN, 0.132, 0.020), COL_HONEY_CEDAR, bevel=0.005, segs=1, grain_axis="X")

# Middle chestnut cross-rail (z = 0.362 .. 0.458m)
add_box((0.0, 0.0, 0.410), (RAIL_LEN, 0.118, 0.096), COL_WALNUT, bevel=0.014, segs=2, grain_axis="X", smooth_mode=True)

# Lower honey-cedar rail (z = 0.145 .. 0.245m)
add_box((0.0, 0.0, 0.195), (RAIL_LEN, 0.140, 0.100), COL_HONEY_CEDAR, bevel=0.014, segs=2, grain_axis="X", smooth_mode=True)

# 3. Clean central intermediate vertical brace + subtle side pickets/baluster cleats so 2.3m bay feels well-braced
for bx in (-0.54, 0.54):
    add_box((bx, 0.0, 0.386), (0.072, 0.078, 0.340), COL_SHOE_DARK, bevel=0.008, segs=1, grain_axis="Z")

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

mesh = bpy.data.meshes.new("village-fence")
bm.to_mesh(mesh)
bm.free()
mesh.materials.append(mat)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("village-fence", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"VILLAGE_FENCE_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "village-fence.blend"))
glb_path = out_dir / "village-fence.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_materials="EXPORT",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
)
print(f"EXPORTED {glb_path}")
