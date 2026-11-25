"""Build Moonbay Marina Vented Harbor Parasol (parasol v3):
Weighted beveled coastal limestone pedestal with forged HarborBronze socket &
locking thumbscrew, turned teak center mast with bronze mid-coupler, runner
slider collar & 10 curved multi-segment hardwood ribs + stretchers cleanly offset
below canvas ceiling (-0.025m), 10-gore nautical teal-and-cream duck canvas with
catenary sag and 6.5mm WebGL-safe double-shell thickness (zero z-fighting),
scalloped hanging valance skirt, vented upper pagoda cap, and bronze acorn finial.
Matches ASSETS['parasol'].size = [2.60, 2.60, 2.72].
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


W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

warp_w = 0.50 + 0.30 * np.sin(u * 260.0 * math.pi) + 0.20 * np.cos(v * 260.0 * math.pi)
slub_c = 0.18 * np.sin(u * 38.0 + v * 22.0) + 0.14 * np.cos(u * 64.0 - v * 48.0)
weave = np.clip(0.88 + 0.08 * warp_w + 0.05 * slub_c, 0.72, 1.02)

canvas_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
canvas_rgba[..., 0] = weave
canvas_rgba[..., 1] = weave
canvas_rgba[..., 2] = weave
canvas_img = make_packed_image("parasol-canvas", W_TX, H_TX, canvas_rgba, "sRGB")

c_rough = np.ones((H_TX, W_TX, 4), dtype=np.float32)
cr = np.clip(0.86 - 0.10 * warp_w, 0.68, 0.92)
c_rough[..., 0] = cr
c_rough[..., 1] = cr
c_rough[..., 2] = cr
canvas_rough_img = make_packed_image("parasol-canvas-rough", W_TX, H_TX, c_rough, "Non-Color")

teak_grain = 0.50 + 0.30 * np.sin(u * 22.0 * math.pi + np.sin(v * 7.0 * math.pi) * 0.8) + 0.20 * np.cos(u * 75.0 + v * 12.0)
tg = np.clip(teak_grain, 0.15, 0.95)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
wood_rgba[..., 0] = np.clip(0.46 + 0.22 * tg, 0.0, 1.0)
wood_rgba[..., 1] = np.clip(0.26 + 0.15 * tg, 0.0, 1.0)
wood_rgba[..., 2] = np.clip(0.13 + 0.08 * tg, 0.0, 1.0)
wood_img = make_packed_image("parasol-wood", W_TX, H_TX, wood_rgba, "sRGB")

limestone = (
    0.45 * np.sin(u * 32.0 + v * 18.0)
    + 0.35 * np.cos(u * 68.0 - v * 54.0)
    + 0.20 * np.sin(u * 140.0 + v * 110.0)
)
speck = np.sin(u * 240.0) * np.cos(v * 230.0)
st_t = np.clip(0.86 + 0.08 * limestone + 0.04 * speck, 0.68, 1.02)
stone_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
stone_rgba[..., 0] = np.clip(0.82 * st_t, 0.0, 1.0)
stone_rgba[..., 1] = np.clip(0.75 * st_t, 0.0, 1.0)
stone_rgba[..., 2] = np.clip(0.62 * st_t, 0.0, 1.0)
stone_img = make_packed_image("parasol-stone", W_TX, H_TX, stone_rgba, "sRGB")


def make_tex_mat(name, img, rough_img=None, rough_const=0.72, spec=0.30):
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


def make_metal_mat(name, rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.38):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return mat


MAT_CANVAS = make_tex_mat("ParasolCanvas", canvas_img, rough_img=canvas_rough_img, spec=0.18)
MAT_WOOD = make_tex_mat("ParasolTeak", wood_img, rough_const=0.58, spec=0.34)
MAT_STONE = make_tex_mat("ParasolLimestone", stone_img, rough_const=0.82, spec=0.22)
MAT_BRONZE = make_metal_mat("HarborBronze", rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.38)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")
WHITE = (1.0, 1.0, 1.0, 1.0)


def assign_faces(faces, mat_idx, col=WHITE, smooth_mode=True, uv_scale=1.5):
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for lp in f.loops:
            lp[vc_layer] = col
            co = lp.vert.co
            ang = (math.atan2(co.y, co.x) / (2.0 * math.pi)) + 0.5
            lp[uv_layer].uv = (ang % 1.0, (co.z * uv_scale + 0.1) % 1.0)


def add_lathe(profile_rz, segs=16, mat_idx=0, col=WHITE, smooth_mode=True, phase=0.0):
    before = set(bm.faces)
    rings = []
    for r, z in profile_rz:
        if r <= 1e-4:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([
                bm.verts.new((r * math.cos(phase + 2 * math.pi * k / segs), r * math.sin(phase + 2 * math.pi * k / segs), z))
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
    assign_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode)


def add_strut(p0, p1, r0=0.011, r1=0.010, segs=6, mat_idx=1, col=WHITE):
    before = set(bm.faces)
    d = p1 - p0
    if d.length < 1e-4:
        return
    z_ax = d.normalized()
    ref = Vector((1, 0, 0)) if abs(z_ax.z) > 0.9 else Vector((0, 0, 1))
    x_ax = z_ax.cross(ref).normalized()
    y_ax = z_ax.cross(x_ax).normalized()
    ring0 = [bm.verts.new(p0 + (x_ax * math.cos(2 * math.pi * k / segs) + y_ax * math.sin(2 * math.pi * k / segs)) * r0) for k in range(segs)]
    ring1 = [bm.verts.new(p1 + (x_ax * math.cos(2 * math.pi * k / segs) + y_ax * math.sin(2 * math.pi * k / segs)) * r1) for k in range(segs)]
    for k in range(segs):
        bm.faces.new((ring0[k], ring0[(k + 1) % segs], ring1[(k + 1) % segs], ring1[k]))
    assign_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=False)


def orient_quad(vs, vcs, target_dir):
    gn = (vs[1].co - vs[0].co).cross(vs[-1].co - vs[0].co)
    if gn.dot(target_dir) < 0.0:
        return tuple(reversed(vs)), list(reversed(vcs))
    return vs, vcs


# 1. Weighted Chamfered Limestone Pedestal Base (-0.004 .. 0.140m)
base_stone_profile = [
    (0.000, -0.004),
    (0.400, -0.004),
    (0.400,  0.036),
    (0.365,  0.072),
    (0.240,  0.092),
    (0.145,  0.118),
    (0.085,  0.125),
    (0.000,  0.125),
]
add_lathe(base_stone_profile, segs=8, mat_idx=2, col=(1.0, 0.99, 0.96, 1.0), smooth_mode=False, phase=math.pi / 8.0)

socket_profile = [
    (0.118, 0.115),
    (0.118, 0.132),
    (0.076, 0.144),
    (0.068, 0.245),
    (0.056, 0.255),
]
add_lathe(socket_profile, segs=16, mat_idx=3, col=WHITE, smooth_mode=False)
add_strut(Vector((0.064, 0.0, 0.205)), Vector((0.112, 0.0, 0.205)), r0=0.011, r1=0.010, segs=6, mat_idx=3)
add_strut(Vector((0.112, -0.022, 0.205)), Vector((0.112, 0.022, 0.205)), r0=0.009, r1=0.009, segs=6, mat_idx=3)

# 2. Turned Teak Hardwood Mast Pole + Bronze Collars
mast_profile = [
    (0.044, 0.130),
    (0.044, 1.180),
    (0.042, 1.620),
    (0.040, 2.520),
    (0.034, 2.660),
]
add_lathe(mast_profile, segs=12, mat_idx=1, col=(1.0, 0.98, 0.96, 1.0), smooth_mode=True)

add_lathe([(0.044, 1.18), (0.052, 1.19), (0.052, 1.24), (0.044, 1.25)], segs=12, mat_idx=3, smooth_mode=False)
add_lathe([(0.042, 1.65), (0.068, 1.665), (0.068, 1.725), (0.042, 1.74)], segs=12, mat_idx=3, smooth_mode=False)
add_lathe([(0.040, 2.47), (0.072, 2.485), (0.072, 2.535), (0.040, 2.55)], segs=12, mat_idx=3, smooth_mode=False)

# 3. Canopy Curves & Multi-Segment Under-Ribs (strictly -0.025m below canvas ceiling)
N_RIBS = 10
R_CANOPY = 1.300
Z_APEX_MAIN = 2.505
Z_EAVE_RIB = 1.940
RADIAL_FRACS = (0.045, 0.25, 0.46, 0.66, 0.84, 1.00)


def rib_height_main(r_frac):
    return Z_APEX_MAIN - (Z_APEX_MAIN - Z_EAVE_RIB) * (0.58 * r_frac + 0.42 * (r_frac ** 1.85))


for r_i in range(N_RIBS):
    az = 2.0 * math.pi * r_i / N_RIBS
    dir_r = Vector((math.cos(az), math.sin(az), 0.0))
    pts = [dir_r * (R_CANOPY * rf) + Vector((0.0, 0.0, rib_height_main(rf) - 0.025)) for rf in RADIAL_FRACS[:-1]]
    pts.append(dir_r * (R_CANOPY * 0.992) + Vector((0.0, 0.0, Z_EAVE_RIB - 0.023)))
    for pa, pb in zip(pts, pts[1:]):
        add_strut(pa, pb, r0=0.0115, r1=0.0105, segs=6, mat_idx=1)

    p_run = dir_r * 0.062 + Vector((0.0, 0.0, 1.695))
    add_strut(p_run, pts[2], r0=0.0115, r1=0.0105, segs=6, mat_idx=1)

    p_tip_base = dir_r * (R_CANOPY * 0.992) + Vector((0.0, 0.0, Z_EAVE_RIB - 0.023))
    p_tip_out = dir_r * (R_CANOPY * 1.012) + Vector((0.0, 0.0, Z_EAVE_RIB - 0.032))
    add_strut(p_tip_base, p_tip_out, r0=0.013, r1=0.008, segs=8, mat_idx=3)

# 4. 10-Gore Nautical Striped Duck-Canvas Canopy + Scalloped Valance + Vented Pagoda Cap
# Shell offset 6.8mm (0.0068m) prevents WebGL perspective depth quantization patches at marina distances
TEAL_OUT = (0.14, 0.48, 0.72, 1.0)
CREAM_OUT = (0.94, 0.87, 0.68, 1.0)
TEAL_IN = (0.18, 0.44, 0.62, 1.0)
CREAM_IN = (0.86, 0.78, 0.60, 1.0)

SUB_U = 4


def add_double_canvas_panel(grid_pts, col_out, col_in, desired_out_sign=+1.0, thickness=0.0068):
    n_r = len(grid_pts)
    n_u = len(grid_pts[0])
    v_top = []
    v_bot = []
    for ir in range(n_r):
        row_t = []
        row_b = []
        for iu in range(n_u):
            pt = grid_pts[ir][iu]
            r_xy = Vector((pt.x, pt.y, 0.0))
            out_n = (r_xy.normalized() * 0.45 + Vector((0.0, 0.0, 0.89))).normalized()
            if desired_out_sign < 0:
                out_n = r_xy.normalized()
            row_t.append((bm.verts.new(pt), out_n))
            row_b.append((bm.verts.new(pt - out_n * thickness), -out_n))
        v_top.append(row_t)
        v_bot.append(row_b)

    for ir in range(n_r - 1):
        for iu in range(n_u - 1):
            for shell_verts, col_val in ((v_top, col_out), (v_bot, col_in)):
                p00, n00 = shell_verts[ir][iu]
                p10, _ = shell_verts[ir + 1][iu]
                p11, _ = shell_verts[ir + 1][iu + 1]
                p01, _ = shell_verts[ir][iu + 1]
                uv00 = (iu / (n_u - 1), ir / (n_r - 1))
                uv10 = (iu / (n_u - 1), (ir + 1) / (n_r - 1))
                uv11 = ((iu + 1) / (n_u - 1), (ir + 1) / (n_r - 1))
                uv01 = ((iu + 1) / (n_u - 1), ir / (n_r - 1))
                # Emit explicit matched parallel triangles sharing exact (p00, p11) diagonal so curved shells never cross!
                for tri_v, tri_uv in (
                    ((p00, p10, p11), (uv00, uv10, uv11)),
                    ((p00, p11, p01), (uv00, uv11, uv01)),
                ):
                    gn = (tri_v[1].co - tri_v[0].co).cross(tri_v[2].co - tri_v[0].co)
                    if gn.dot(n00) < 0.0:
                        tri_v = (tri_v[0], tri_v[2], tri_v[1])
                        tri_uv = (tri_uv[0], tri_uv[2], tri_uv[1])
                    f = bm.faces.new(tri_v)
                    f.material_index = 0
                    f.smooth = True
                    for lp, uvp in zip(f.loops, tri_uv):
                        lp[vc_layer] = col_val
                        lp[uv_layer].uv = uvp


for r_i in range(N_RIBS):
    az0 = 2.0 * math.pi * r_i / N_RIBS
    az1 = 2.0 * math.pi * (r_i + 1) / N_RIBS
    is_teal = (r_i % 2 == 0)
    c_out = TEAL_OUT if is_teal else CREAM_OUT
    c_in = TEAL_IN if is_teal else CREAM_IN

    grid = []
    for rf in RADIAL_FRACS:
        row = []
        r_cur = R_CANOPY * rf
        z_rib = rib_height_main(rf)
        max_sag = 0.024 * math.sin(math.pi * max(0.0, min(1.0, rf)))
        for iu in range(SUB_U + 1):
            u_f = iu / SUB_U
            az = az0 + (az1 - az0) * u_f
            sag = max_sag * math.sin(math.pi * u_f)
            row.append(Vector((r_cur * math.cos(az), r_cur * math.sin(az), z_rib - sag)))
        grid.append(row)
    add_double_canvas_panel(grid, c_out, c_in, desired_out_sign=+1.0, thickness=0.0068)

    val_grid = []
    for vf in (0.0, 0.55, 1.0):
        row = []
        for iu in range(SUB_U + 1):
            u_f = iu / SUB_U
            az = az0 + (az1 - az0) * u_f
            drop_tot = 0.068 + 0.056 * math.sin(math.pi * u_f)
            r_flare = R_CANOPY * (0.996 + 0.008 * vf)
            z_top_edge = Z_EAVE_RIB - 0.002 * math.sin(math.pi * u_f)
            row.append(Vector((r_flare * math.cos(az), r_flare * math.sin(az), z_top_edge - drop_tot * vf)))
        val_grid.append(row)
    add_double_canvas_panel(val_grid, c_out, c_in, desired_out_sign=-1.0, thickness=0.0055)

    vent_grid = []
    for rf in (0.14, 0.56, 1.00):
        row = []
        r_v = 0.48 * rf
        z_v = 2.615 - (2.615 - 2.365) * (0.55 * rf + 0.45 * (rf ** 1.7))
        sag_v = 0.011 * math.sin(math.pi * rf)
        for iu in range(SUB_U + 1):
            u_f = iu / SUB_U
            az = az0 + (az1 - az0) * u_f
            row.append(Vector((r_v * math.cos(az), r_v * math.sin(az), z_v - sag_v * math.sin(math.pi * u_f))))
        vent_grid.append(row)
    add_double_canvas_panel(vent_grid, c_out, c_in, desired_out_sign=+1.0, thickness=0.0058)

# 5. Turned Hardwood & HarborBronze Apex Finial Cap (z = 2.59 .. 2.720m)
add_lathe(
    [
        (0.065, 2.595),
        (0.072, 2.615),
        (0.055, 2.635),
        (0.032, 2.648),
    ],
    segs=12,
    mat_idx=1,
    smooth_mode=True,
)
add_lathe(
    [
        (0.036, 2.646),
        (0.048, 2.675),
        (0.036, 2.702),
        (0.014, 2.720),
        (0.000, 2.720),
    ],
    segs=12,
    mat_idx=3,
    smooth_mode=True,
)

mesh = bpy.data.meshes.new("parasol")
bm.to_mesh(mesh)
bm.free()
for m in (MAT_CANVAS, MAT_WOOD, MAT_STONE, MAT_BRONZE):
    mesh.materials.append(m)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("parasol", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"PARASOL_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} maxZ={max(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "parasol.blend"))
glb_path = out_dir / "parasol.glb"
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
