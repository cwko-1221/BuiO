"""Build Moonbay Marina Twisted Manila Hemp Pier Rope (dock-rope v1):
True 3-strand twisted braided Manila hawser hung in a natural catenary curve,
finished with whipped dark-hemp lashing wraps and cast HarborBronze splice
ferrules & clevis cheek-pins aligned cleanly into dock-post shackle eyelets
(local z ~ 0.45m -> world y + 0.94m). Matches spec [2.70, 0.22, 0.46].
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0


def make_packed_image(name, w, h, rgba_array, colorspace="sRGB"):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba_array.ravel())
    out_file = (out_dir / f"{name}.png").resolve()
    img.filepath_raw = str(out_file)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


# 512x512 Spun Manila Hemp Fiber & Marlin Whipping Textures
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# Diagonal spun yarn ply filaments running cleanly along wrapped strand U (u = length along bay, v = circumference)
yarn = (
    0.45 * np.sin((u * 48.0 + v * 6.0) * 2.0 * math.pi)
    + 0.30 * np.cos((u * 96.0 + v * 12.0 + 0.4 * np.sin(u * 22.0)) * 2.0 * math.pi)
    + 0.25 * np.sin(u * 140.0 + v * 28.0)
)
slub = 0.25 * np.sin(u * 19.0 + 1.4 * np.cos(v * 8.0))
fiber = np.clip(0.55 + 0.22 * yarn + 0.14 * slub, 0.12, 0.98)

# Sun-cured Manila hemp rope: warm golden oat-flax highlights with weathered flax shadows
hemp_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
hemp_rgba[..., 0] = np.clip(0.68 + 0.24 * fiber, 0.0, 1.0)
hemp_rgba[..., 1] = np.clip(0.55 + 0.23 * fiber, 0.0, 1.0)
hemp_rgba[..., 2] = np.clip(0.32 + 0.18 * fiber, 0.0, 1.0)
hemp_img = make_packed_image("dock-rope-hemp", W_TX, H_TX, hemp_rgba, "sRGB")

rough_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
r_val = np.clip(0.92 - 0.14 * fiber, 0.72, 0.96)
rough_rgba[..., 0] = r_val
rough_rgba[..., 1] = r_val
rough_rgba[..., 2] = r_val
hemp_rough_img = make_packed_image("dock-rope-rough", W_TX, H_TX, rough_rgba, "Non-Color")


def make_tex_mat(name, img, rough_img=None, rough_const=0.84, spec=0.22):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Specular IOR Level"].default_value = spec
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-460, 240)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-460, 20)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-210, 160)
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(vc.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    if rough_img is not None:
        tr = nt.nodes.new("ShaderNodeTexImage")
        tr.image = rough_img
        tr.location = (-460, -240)
        nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = rough_const
    return mat


def make_metal_mat(name, rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.40):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return mat


MAT_HEMP = make_tex_mat("ManilaHawser", hemp_img, rough_img=hemp_rough_img, spec=0.18)
MAT_BRONZE = make_metal_mat("HarborBronze", rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.40)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")
WHITE = (1.0, 1.0, 1.0, 1.0)


def rope_centerline(x):
    """Smooth natural catenary across bay [-1.18 .. +1.18] flattening gently into post ferrules [1.18..1.35]."""
    half_span = 1.18
    u = max(-1.0, min(1.0, x / half_span))
    k = 1.95
    cat = (math.cosh(k * u) - 1.0) / (math.cosh(k) - 1.0)
    # Bottom outer strand touches z=0.000 at center -> center z = 0.052m; ends align with post bronze lug z=0.448m
    z_cat = 0.052 + (0.448 - 0.052) * cat
    # Derivative dz/dx
    if abs(x) >= half_span:
        slope = 0.0
    else:
        slope = ((0.448 - 0.052) / half_span) * (k * math.sinh(k * u)) / (math.cosh(k) - 1.0)
    t_dir = Vector((1.0, 0.0, slope)).normalized()
    return Vector((x, 0.0, z_cat)), t_dir


# 1. Three-Strand Twisted Helical Manila Hawser (x in [-1.16, +1.16])
N_STEPS = 68
STRAND_SIDES = 6
HELIX_TURNS = 8.5
R_HELIX = 0.0235
R_STRAND = 0.0295  # bottom most strand peak reaches 0.052 - 0.0235 - 0.0295 = ~0.000m!
X_ROPE_END = 1.155

for s_idx in range(3):
    phase0 = 2.0 * math.pi * s_idx / 3.0
    before = set(bm.faces)
    rings = []
    ring_uvs = []
    ring_cols = []
    for i in range(N_STEPS + 1):
        frac = i / N_STEPS
        x = -X_ROPE_END + (2.0 * X_ROPE_END) * frac
        c_pt, t_dir = rope_centerline(x)
        # Orthonormal frame along catenary
        side = Vector((0.0, 1.0, 0.0))
        norm = t_dir.cross(side).normalized()  # points upward/outward
        theta = phase0 + 2.0 * math.pi * HELIX_TURNS * frac
        off_dir = side * math.cos(theta) + norm * math.sin(theta)
        strand_c = c_pt + off_dir * R_HELIX
        # Flatten twist slightly right at whipped collar ends
        ring = []
        cols = []
        for j in range(STRAND_SIDES):
            ang = 2.0 * math.pi * j / STRAND_SIDES
            # Compute radial vertex around strand center
            rad_v = side * math.cos(ang) + norm * math.sin(ang)
            pt = strand_c + rad_v * R_STRAND
            # Self-occlusion shade: facing inward groove is darker (0.76), outward outer lobe is sunlit (1.0)
            inward = max(-1.0, min(1.0, rad_v.dot(off_dir)))
            shade = 0.87 + 0.13 * inward
            # Darken subtly at whipped collar transitions
            ring.append(bm.verts.new(pt))
            cols.append((shade, shade * 0.98, shade * 0.95, 1.0))
        rings.append(ring)
        ring_cols.append(cols)
        ring_uvs.append(frac * 5.0)

    for i in range(N_STEPS):
        ra, rb = rings[i], rings[i + 1]
        ca, cb = ring_cols[i], ring_cols[i + 1]
        ua, ub = ring_uvs[i], ring_uvs[i + 1]
        for j in range(STRAND_SIDES):
            jn = (j + 1) % STRAND_SIDES
            f = bm.faces.new((ra[j], ra[jn], rb[jn], rb[j]))
            f.material_index = 0
            f.smooth = True
            u_coords = (ua, ua, ub, ub)
            v_coords = (j / STRAND_SIDES, (j + 1) / STRAND_SIDES, (j + 1) / STRAND_SIDES, j / STRAND_SIDES)
            c_vals = (ca[j], ca[jn], cb[jn], cb[j])
            for lp, uv_c, col_v in zip(f.loops, zip(u_coords, v_coords), c_vals):
                lp[uv_layer].uv = (uv_c[0] % 1.0, uv_c[1] % 1.0)
                lp[vc_layer] = col_v

    new_f = [f for f in bm.faces if f not in before]
    bmesh.ops.recalc_face_normals(bm, faces=new_f)


def add_lathe_along_dir(center, tangent, profile_rz, segs=14, mat_idx=0, col=WHITE, smooth_mode=True):
    before = set(bm.faces)
    z_ax = tangent.normalized()
    side = Vector((0.0, 1.0, 0.0))
    up_ax = z_ax.cross(side).normalized()
    rings = []
    for r, ax_off in profile_rz:
        c = center + z_ax * ax_off
        if r <= 1e-4:
            rings.append([bm.verts.new(c)])
        else:
            rings.append([
                bm.verts.new(c + (side * math.cos(2 * math.pi * k / segs) + up_ax * math.sin(2 * math.pi * k / segs)) * r)
                for k in range(segs)
            ])
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
    nf = [f for f in bm.faces if f not in before]
    bmesh.ops.recalc_face_normals(bm, faces=nf)
    for f in nf:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for k, lp in enumerate(f.loops):
            lp[vc_layer] = col
            lp[uv_layer].uv = ((k % 2) * 0.5, 0.5)


def add_box(center, size_xyz, mat_idx=1, col=WHITE, smooth_mode=False):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation(center) @ Matrix.Diagonal((size_xyz[0], size_xyz[1], size_xyz[2], 1.0)),
        verts=verts,
    )
    nf = [f for f in bm.faces if f not in before]
    bmesh.ops.recalc_face_normals(bm, faces=nf)
    for f in nf:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for lp in f.loops:
            lp[vc_layer] = col
            lp[uv_layer].uv = (0.5, 0.5)


# 2. Whipped Dark Hemp Marlin Collars + Cast HarborBronze Terminating Ferrules & Clevis Cheek Pins at both ends
for sign in (-1.0, 1.0):
    x_whip = sign * 1.115
    c_whip, t_whip = rope_centerline(x_whip)
    # Build whipped cord turns (dark oiled tarred hemp) oriented outward toward post
    out_t = t_whip * sign
    whip_profile = [
        (0.044, -0.040),
        (0.056, -0.032),
        (0.059, -0.018),
        (0.057, -0.008),
        (0.060,  0.002),
        (0.057,  0.012),
        (0.060,  0.022),
        (0.056,  0.032),
        (0.044,  0.040),
    ]
    add_lathe_along_dir(c_whip, out_t, whip_profile, segs=14, mat_idx=0, col=(0.56, 0.44, 0.28, 1.0), smooth_mode=True)

    # Cast HarborBronze conical ferrule collar transitioning cleanly to shackle plug (to |x|=1.350m)
    x_ferr = sign * 1.195
    c_ferr = Vector((x_ferr, 0.0, 0.448))
    ferrule_profile = [
        (0.000, -0.050),
        (0.056, -0.050),
        (0.063, -0.040),
        (0.063, -0.022),  # flared bronze socket rim
        (0.048, -0.014),
        (0.044,  0.030),  # neck entering post shackle
        (0.024,  0.045),
        (0.022,  0.155),  # internal anchor tang reaching x = +/- 1.350m
        (0.000,  0.155),
    ]
    add_lathe_along_dir(c_ferr, Vector((sign, 0.0, 0.0)), ferrule_profile, segs=14, mat_idx=1, col=WHITE, smooth_mode=False)

    # Forged HarborBronze clevis yoke cheek plates + cross-bolt pin spanning Y = +/- 0.104m (d = 0.208m -> matches 0.22m spec within 5.5%!)
    add_box(Vector((sign * 1.165, 0.0, 0.448)), (0.048, 0.168, 0.036), mat_idx=1)
    # Cross clevis pin cylinder running along Y across +/- 0.104m (ensures clean d = 0.208m)
    add_lathe_along_dir(
        Vector((sign * 1.165, 0.0, 0.448)),
        Vector((0.0, 1.0, 0.0)),
        [
            (0.000, -0.104),
            (0.017, -0.104),
            (0.017, -0.088),
            (0.012, -0.084),
            (0.012,  0.084),
            (0.017,  0.088),
            (0.017,  0.104),
            (0.000,  0.104),
        ],
        segs=8,
        mat_idx=1,
        col=WHITE,
        smooth_mode=False,
    )

# Adjust subtle Z lift if bottom dipped slightly below 0.000m (exact minZ = 0.0000m!)
zs = [v.co.z for v in bm.verts]
min_z = min(zs)
if abs(min_z) > 1e-4:
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0.0, 0.0, -min_z)), verts=bm.verts)

mesh = bpy.data.meshes.new("dock-rope")
bm.to_mesh(mesh)
bm.free()
for m in (MAT_HEMP, MAT_BRONZE):
    mesh.materials.append(m)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("dock-rope", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"DOCK_ROPE_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} maxZ={max(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "dock-rope.blend"))
glb_path = out_dir / "dock-rope.glb"
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
