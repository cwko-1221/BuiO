"""Build Moonbay Harbor Clinker-Planked Coastal Sloop (sailboat v1):
Sculpted lapstrake wooden sloop with raked cutwater bow (Blender -Y / Three.js +Z),
wineglass transom stern (+Y), oak keel & rudder with cockpit tiller, copper-ochre
underbody, harbor teal waterline boot stripe, sunlit cream topsides, oiled teak
rub-rail & foredeck, cabin trunk with brass portholes, hollow recessed slatted
cockpit with bench thwarts & bronze winches, tapered spruce mast & boom with
spreaders/stays, cambered billowing double-sided canvas mainsail & teal jib, and
red masthead pennant. Matches ASSETS['sailboat'].size = [2.55, 4.60, 4.30].
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

# 1. Warm Marine Teak & Clinker Planking Wood Texture (grain along U, subtle lapstrake seams along V)
plank_step = np.abs(np.sin(v * 14.0 * math.pi)) < 0.045
grain = 0.50 + 0.30 * np.sin(u * 18.0 * math.pi + np.sin(v * 8.0 * math.pi) * 0.9) + 0.20 * np.cos(u * 90.0 + v * 20.0)
wg = np.clip(grain - 0.14 * plank_step, 0.12, 0.96)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
wood_rgba[..., 0] = np.clip(0.56 + 0.28 * wg, 0.0, 1.0)
wood_rgba[..., 1] = np.clip(0.36 + 0.22 * wg, 0.0, 1.0)
wood_rgba[..., 2] = np.clip(0.18 + 0.14 * wg, 0.0, 1.0)
wood_img = make_packed_image("sailboat-wood", W_TX, H_TX, wood_rgba, "sRGB")

w_rough = np.ones((H_TX, W_TX, 4), dtype=np.float32)
wr = np.clip(0.68 - 0.16 * wg + 0.12 * plank_step, 0.42, 0.85)
w_rough[..., 0] = wr
w_rough[..., 1] = wr
w_rough[..., 2] = wr
wood_rough_img = make_packed_image("sailboat-wood-rough", W_TX, H_TX, w_rough, "Non-Color")

# 2. Stitched Duck-Canvas Sailcloth Texture (subtly stitched horizontal sail panel batten seams)
panel_seam = np.exp(-((np.abs(np.sin(v * 7.0 * math.pi))) * 28.0))
weave_s = 0.50 + 0.30 * np.sin(u * 240.0 * math.pi) + 0.20 * np.cos(v * 240.0 * math.pi)
sail_t = np.clip(0.92 + 0.06 * weave_s - 0.10 * panel_seam, 0.70, 1.02)
sail_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
sail_rgba[..., 0] = sail_t
sail_rgba[..., 1] = sail_t
sail_rgba[..., 2] = sail_t
sail_img = make_packed_image("sailboat-sail", W_TX, H_TX, sail_rgba, "sRGB")


def make_tex_mat(name, img, rough_img=None, rough_const=0.58, spec=0.35):
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


def make_vcol_mat(name, rough=0.48, spec=0.45):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = spec
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-240, 180)
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
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


MAT_WOOD = make_tex_mat("BoatTimber", wood_img, rough_img=wood_rough_img, spec=0.38)
MAT_HULL_PAINT = make_vcol_mat("BoatHullPaint", rough=0.42, spec=0.48)
MAT_SAIL = make_tex_mat("BoatSailcloth", sail_img, rough_const=0.80, spec=0.18)
MAT_BRONZE = make_metal_mat("HarborBronze", rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.38)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")
WHITE = (1.0, 1.0, 1.0, 1.0)

# Palette harmonizing with Moonbay Marina & legacy boat colors while upgrading craft
COL_COPPER_KEEL = (0.76, 0.36, 0.18, 1.0)     # warm copper-ochre submerged hull
COL_TEAL_STRIPE = (0.20, 0.56, 0.72, 1.0)     # harbor azure-teal waterline boot stripe
COL_CREAM_HULL = (0.95, 0.89, 0.76, 1.0)      # sunlit ivory painted topsides
COL_CREAM_CABIN = (0.94, 0.88, 0.74, 1.0)
COL_TEAK_BRIGHT = (1.00, 0.96, 0.90, 1.0)     # multiplied with warm wood texture
COL_TEAK_DARK = (0.76, 0.68, 0.60, 1.0)       # darker oiled rub-rail & cockpit frame
COL_SAIL_CREAM = (0.97, 0.92, 0.79, 1.0)      # main sail duck canvas
COL_SAIL_JIB = (0.20, 0.58, 0.78, 1.0)        # crisp harbor teal jib sail
COL_PENNANT_RED = (0.86, 0.26, 0.22, 1.0)


def assign_faces(faces, mat_idx, col=WHITE, smooth_mode=True, uv_axis="XY"):
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for lp in f.loops:
            lp[vc_layer] = col
            co = lp.vert.co
            if uv_axis == "YZ":
                lp[uv_layer].uv = ((co.y * 0.4 + 0.5) % 1.0, (co.z * 0.8 + 0.2) % 1.0)
            else:
                lp[uv_layer].uv = ((co.y * 0.4 + 0.5) % 1.0, (co.x * 0.6 + 0.5) % 1.0)


# --- 1.Parametric Clinker-Planked Coastal Hull Geometry ---
# Bow is at y = -2.26m (pointed cutwater), Midship maximum beam at y = -0.05m (half-width = 1.275m -> total w = 2.550m),
# Stern transom at y = +2.18m (tapered wineglass transom half-width = 0.68m).
Y_STATIONS = [
    -2.26, -2.06, -1.78, -1.42, -1.00, -0.55, -0.10, 0.35, 0.80, 1.25, 1.65, 1.98, 2.18
]


def hull_half_beam(y):
    # Normalize t from 0 (bow -2.26) to 1 (stern +2.18)
    t = (y - (-2.26)) / (2.18 - (-2.26))
    t = max(0.0, min(1.0, t))
    if t <= 0.001:
        return 0.015
    # Crisp entry at bow, full buoyant belly around t=0.48 (beam = 1.275m), graceful taper to wineglass stern
    if t < 0.48:
        s = t / 0.48
        w = 1.275 * (math.sin(s * math.pi * 0.5) ** 0.72)
    else:
        s = (t - 0.48) / 0.52
        w = 1.275 * (1.0 - 0.46 * (s ** 1.45))
    return max(0.016, w)


def hull_keel_z(y):
    t = max(0.0, min(1.0, (y + 2.26) / 4.44))
    # Deepest keel belly minZ = 0.08m amidships, lifting sharply to forefoot at bow (0.34m) and stern run (0.30m)
    belly = math.sin(t * math.pi)
    if t < 0.14:
        return 0.34 - (0.34 - 0.10) * (t / 0.14)
    if t > 0.86:
        return 0.10 + (0.30 - 0.10) * ((t - 0.86) / 0.14)
    return 0.08 + 0.02 * (1.0 - belly)


def hull_sheer_z(y):
    t = max(0.0, min(1.0, (y + 2.26) / 4.44))
    # Sweeping traditional sheer line: bow high (1.05m), gentle midship waist (0.84m), lifted stern (0.94m)
    return 0.84 + 0.21 * ((1.0 - t) ** 2.2) + 0.10 * (t ** 2.6)


# Hull vertical station normalized curves around section (from bottom keel (0) -> strake flares -> gunwale sheer (1))
HULL_SECS = [
    (0.00, 0.00, COL_COPPER_KEEL, 1),  # Keel rabbet center (mat 1 paint)
    (0.18, 0.12, COL_COPPER_KEEL, 1),  # Underwater lower garboard plank
    (0.32, 0.42, COL_COPPER_KEEL, 1),  # Turn of bilge (at z ~ 0.28..0.32)
    (0.46, 0.72, COL_TEAL_STRIPE, 1),  # Teal waterline boot stripe bottom
    (0.58, 0.83, COL_TEAL_STRIPE, 1),  # Teal boot stripe top
    (0.62, 0.86, COL_CREAM_HULL, 1),   # Crisp clinker lap edge -> ivory topside strake 1
    (0.76, 0.94, COL_CREAM_HULL, 1),   # Ivory topside strake 2
    (0.90, 0.99, COL_CREAM_HULL, 1),   # Topsides upper flare
    (0.95, 1.00, COL_TEAK_DARK, 0),    # Heavy varnished timber sheer strake & rub-rail edge
    (1.00, 1.00, COL_TEAK_DARK, 0),    # Inward gunwale deck cap
]

# Build starboard (+X) & port (-X) clinker hull stations
# For each station y and each cross-section band, store port & starboard vertex rings
port_grid = []
stbd_grid = []
for yi, y_val in enumerate(Y_STATIONS):
    hb = hull_half_beam(y_val)
    kz = hull_keel_z(y_val)
    sz = hull_sheer_z(y_val)
    p_col = []
    s_col = []
    for k, (h_frac, x_frac, _, _) in enumerate(HULL_SECS):
        z_pt = kz + (sz - kz) * h_frac
        # Add subtle clinker lap flare on upper hull sections & slight rub-rail bump on h_frac==0.95
        x_pt = hb * x_frac
        if k == 8:  # protruding hardwood rub-rail
            x_pt += 0.018 if hb > 0.05 else 0.004
        elif k == 9:  # inward deck edge lip
            x_pt = max(0.012, hb * 0.94)
        p_col.append(bm.verts.new((-x_pt, y_val, z_pt)))
        s_col.append(bm.verts.new((+x_pt, y_val, z_pt)))
    port_grid.append(p_col)
    stbd_grid.append(s_col)

# Stitch port & starboard hull skin with smooth/faceted clinker strake definition
for yi in range(len(Y_STATIONS) - 1):
    for k in range(len(HULL_SECS) - 1):
        _, _, c_band, mat_i = HULL_SECS[k + 1]
        is_smooth = (k not in (4, 5, 7, 8))  # crisp step crease at waterline/clinker/rub-rail seams!
        # Starboard quad
        v00, v10, v11, v01 = stbd_grid[yi][k], stbd_grid[yi + 1][k], stbd_grid[yi + 1][k + 1], stbd_grid[yi][k + 1]
        f_s = bm.faces.new((v00, v10, v11, v01))
        assign_faces([f_s], mat_i, c_band, smooth_mode=is_smooth, uv_axis="YZ")
        # Port quad (mirrored winding)
        p00, p10, p11, p01 = port_grid[yi][k], port_grid[yi + 1][k], port_grid[yi + 1][k + 1], port_grid[yi][k + 1]
        f_p = bm.faces.new((p01, p11, p10, p00))
        assign_faces([f_p], mat_i, c_band, smooth_mode=is_smooth, uv_axis="YZ")

# Close Bow Cutwater Seam & Stern Wineglass Transom Plate
before_t = set(bm.faces)
for k in range(len(HULL_SECS) - 1):
    _, _, c_band, mat_i = HULL_SECS[k + 1]
    # Bow vertical stem nose close
    f_b = bm.faces.new((port_grid[0][k], stbd_grid[0][k], stbd_grid[0][k + 1], port_grid[0][k + 1]))
    assign_faces([f_b], mat_i, c_band, smooth_mode=False, uv_axis="YZ")
    # Stern transom horizontal planked close (k >= 1..9)
    f_st = bm.faces.new((stbd_grid[-1][k], port_grid[-1][k], port_grid[-1][k + 1], stbd_grid[-1][k + 1]))
    assign_faces([f_st], 0 if k >= 5 else mat_i, COL_TEAK_DARK if k >= 5 else c_band, smooth_mode=False, uv_axis="YZ")

# Bottom Structural Keel Fin & Steered Stern Rudder reaching exact minZ = 0.000m!
def add_extruded_poly(pts_yz, half_thick, mat_idx, col, smooth_mode=False):
    before = set(bm.faces)
    v_l = [bm.verts.new((-half_thick, py, pz)) for py, pz in pts_yz]
    v_r = [bm.verts.new((+half_thick, py, pz)) for py, pz in pts_yz]
    bm.faces.new(list(reversed(v_l)))
    bm.faces.new(v_r)
    n = len(pts_yz)
    for k in range(n):
        kn = (k + 1) % n
        bm.faces.new((v_l[k], v_l[kn], v_r[kn], v_r[k]))
    assign_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode, uv_axis="YZ")


# Fin ballast keel (z = 0.000 .. 0.14m, centered y = -0.80 .. +1.25m)
add_extruded_poly([(-0.95, 0.22), (-0.45, 0.000), (1.05, 0.000), (1.35, 0.16), (1.20, 0.26), (-0.85, 0.26)], 0.042, 1, COL_COPPER_KEEL)
# Transom-hung hardwood & copper rudder blade (y = 2.08 .. 2.29m, z = 0.05 .. 0.94m)
add_extruded_poly([(1.92, 0.22), (2.28, 0.14), (2.29, 0.56), (2.18, 0.95), (2.06, 0.95), (1.92, 0.45)], 0.026, 0, COL_TEAK_DARK)

# --- 2. Cambered Cedar Foredeck, Raised Coachroof Cabin & Recessed Hollow Cockpit ---
# Close deck over Bow -> Cockpit bulkhead (yi = 0..6, up to y = -0.10m)
for yi in range(6):
    # Subtle cambered crown along center (x=0 -> z + 0.05m)
    y0, y1 = Y_STATIONS[yi], Y_STATIONS[yi + 1]
    c0_pt = bm.verts.new((0.0, y0, hull_sheer_z(y0) + 0.055))
    c1_pt = bm.verts.new((0.0, y1, hull_sheer_z(y1) + 0.055))
    for side_g, flip in ((stbd_grid, False), (port_grid, True)):
        p_out0, p_out1 = side_g[yi][-1], side_g[yi + 1][-1]
        vs = (c0_pt, c1_pt, p_out1, p_out0) if not flip else (p_out0, p_out1, c1_pt, c0_pt)
        f = bm.faces.new(vs)
        assign_faces([f], 0, COL_TEAK_BRIGHT, smooth_mode=True, uv_axis="XY")

# Aft transom side-decks & recessed hollow cockpit floor (yi = 6..12, y = -0.10 .. +2.18m)
COCKPIT_HALF_W = 0.64
COCKPIT_FLOOR_Z = 0.52
# Aft stern deck cover behind cockpit (yi = 10..12, y = 1.65 .. 2.18m)
for yi in (10, 11):
    y0, y1 = Y_STATIONS[yi], Y_STATIONS[yi + 1]
    c0_pt = bm.verts.new((0.0, y0, hull_sheer_z(y0) + 0.035))
    c1_pt = bm.verts.new((0.0, y1, hull_sheer_z(y1) + 0.035))
    for side_g, flip in ((stbd_grid, False), (port_grid, True)):
        vs = (c0_pt, c1_pt, side_g[yi + 1][-1], side_g[yi][-1]) if not flip else (side_g[yi][-1], side_g[yi + 1][-1], c1_pt, c0_pt)
        assign_faces([bm.faces.new(vs)], 0, COL_TEAK_BRIGHT, smooth_mode=True, uv_axis="XY")

# Side walkaround gunwale coaming decks along cockpit (yi = 6..10, y = -0.10 .. 1.65m)
coam_stbd = []
coam_port = []
floor_stbd = []
floor_port = []
for yi in range(6, 11):
    y_val = Y_STATIONS[yi]
    sz = hull_sheer_z(y_val)
    in_w = min(COCKPIT_HALF_W, hull_half_beam(y_val) * 0.65)
    coam_stbd.append(bm.verts.new((+in_w, y_val, sz + 0.015)))
    coam_port.append(bm.verts.new((-in_w, y_val, sz + 0.015)))
    floor_stbd.append(bm.verts.new((+in_w * 0.88, y_val, COCKPIT_FLOOR_Z)))
    floor_port.append(bm.verts.new((-in_w * 0.88, y_val, COCKPIT_FLOOR_Z)))

for k in range(4):
    yi = 6 + k
    # Top side-deck walk strips
    assign_faces([bm.faces.new((coam_stbd[k], coam_stbd[k + 1], stbd_grid[yi + 1][-1], stbd_grid[yi][-1]))], 0, COL_TEAK_BRIGHT, smooth_mode=True, uv_axis="XY")
    assign_faces([bm.faces.new((port_grid[yi][-1], port_grid[yi + 1][-1], coam_port[k + 1], coam_port[k]))], 0, COL_TEAK_BRIGHT, smooth_mode=True, uv_axis="XY")
    # Recessed cockpit inner walls + teak slatted cockpit sole (floor)
    assign_faces([bm.faces.new((floor_stbd[k], floor_stbd[k + 1], coam_stbd[k + 1], coam_stbd[k]))], 1, COL_CREAM_CABIN, smooth_mode=False, uv_axis="YZ")
    assign_faces([bm.faces.new((coam_port[k], coam_port[k + 1], floor_port[k + 1], floor_port[k]))], 1, COL_CREAM_CABIN, smooth_mode=False, uv_axis="YZ")
    assign_faces([bm.faces.new((floor_port[k], floor_port[k + 1], floor_stbd[k + 1], floor_stbd[k]))], 0, COL_TEAK_DARK, smooth_mode=False, uv_axis="XY")

# Close front & aft cockpit well bulkheads cleanly
assign_faces([bm.faces.new((floor_port[0], floor_stbd[0], coam_stbd[0], coam_port[0]))], 1, COL_CREAM_CABIN, smooth_mode=False)
assign_faces([bm.faces.new((coam_port[-1], coam_stbd[-1], floor_stbd[-1], floor_port[-1]))], 1, COL_CREAM_CABIN, smooth_mode=False)


def add_box(center, size_xyz, mat_idx, col, rot_x=0.0, smooth_mode=False):
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    mat = Matrix.Translation(center) @ Matrix.Rotation(rot_x, 4, "X") @ Matrix.Diagonal((size_xyz[0], size_xyz[1], size_xyz[2], 1.0))
    bmesh.ops.transform(bm, matrix=mat, verts=verts)
    assign_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode, uv_axis="XY")


def add_cylinder(p0, p1, r0, r1, segs=12, mat_idx=0, col=WHITE, smooth_mode=True):
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
    bm.faces.new(list(reversed(ring0)))
    bm.faces.new(ring1)
    assign_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode, uv_axis="YZ")


# Port/starboard cockpit teak bench thwarts + wooden helm tiller + bow mooring cleat + cabin coachroof!
add_box((+0.44, 0.78, 0.72), (0.30, 1.48, 0.055), 0, COL_TEAK_BRIGHT)
add_box((-0.44, 0.78, 0.72), (0.30, 1.48, 0.055), 0, COL_TEAK_BRIGHT)
add_box((0.0, 1.48, 0.72), (1.10, 0.28, 0.055), 0, COL_TEAK_BRIGHT)
# Ash rudder tiller arching gracefully into cockpit
add_cylinder(Vector((0.0, 2.12, 0.96)), Vector((0.0, 1.38, 1.04)), 0.024, 0.017, segs=8, mat_idx=0, col=COL_TEAK_BRIGHT)

# Raised Cabin Coachroof Trunk (-1.22 .. -0.14m, z = 0.88 .. 1.16m) + curved teak trim + brass portholes
add_box((0.0, -0.68, 1.00), (1.16, 1.04, 0.24), 1, COL_CREAM_CABIN)
add_box((0.0, -0.68, 1.135), (1.22, 1.08, 0.055), 0, COL_TEAK_DARK)  # cabin roof cap
add_box((0.0, -0.22, 1.175), (0.52, 0.36, 0.045), 0, COL_TEAK_BRIGHT)  # sliding hatch
for px in (-0.59, +0.59):
    for py in (-0.95, -0.45):
        add_cylinder(Vector((px, py, 1.01)), Vector((px + (0.018 if px > 0 else -0.018), py, 1.01)), 0.055, 0.052, segs=12, mat_idx=3, col=WHITE, smooth_mode=False)

# HarborBronze winches on cockpit coaming + stemhead bow cleat & chainplates
for wx in (-0.68, +0.68):
    add_cylinder(Vector((wx, 0.55, 0.89)), Vector((wx, 0.55, 0.98)), 0.052, 0.042, segs=10, mat_idx=3, col=WHITE, smooth_mode=False)
add_cylinder(Vector((0.0, -2.06, 1.04)), Vector((0.0, -2.30, 1.11)), 0.036, 0.022, segs=8, mat_idx=0, col=COL_TEAK_DARK)  # short varnished bowsprit

# --- 3. Tapered Spruce Mast, Boom, Spreaders & HarborBronze Standing Rigging ---
MAST_Y = -0.35
Z_STEP = 1.10
Z_MAST_TOP = 4.24
add_cylinder(Vector((0.0, MAST_Y, 0.86)), Vector((0.0, MAST_Y, Z_MAST_TOP)), 0.056, 0.024, segs=12, mat_idx=0, col=COL_TEAK_BRIGHT)
# Bronze mast collars (gooseneck @ 1.48, spreader band @ 2.88, masthead @ 4.22)
add_cylinder(Vector((0.0, MAST_Y, 1.44)), Vector((0.0, MAST_Y, 1.54)), 0.062, 0.060, segs=12, mat_idx=3, col=WHITE, smooth_mode=False)
add_cylinder(Vector((0.0, MAST_Y, 2.86)), Vector((0.0, MAST_Y, 2.93)), 0.046, 0.045, segs=12, mat_idx=3, col=WHITE, smooth_mode=False)
add_cylinder(Vector((0.0, MAST_Y, 4.18)), Vector((0.0, MAST_Y, 4.26)), 0.032, 0.028, segs=12, mat_idx=3, col=WHITE, smooth_mode=False)

# Horizontal spruce boom swung subtly ~14 deg to port/starboard windward billow (ending neatly at y ~ +1.86m)
BOOM_ANG = 0.22  # slight natural breeze offset!
BOOM_LEN = 2.22
boom_dir = Vector((math.sin(BOOM_ANG), math.cos(BOOM_ANG), 0.035)).normalized()
p_goose = Vector((0.0, MAST_Y, 1.49))
p_boom_end = p_goose + boom_dir * BOOM_LEN
add_cylinder(p_goose, p_boom_end, 0.038, 0.026, segs=10, mat_idx=0, col=COL_TEAK_BRIGHT)

# Spreaders & HarborBronze standing rigging (forestay, port/stbd shrouds, backstay)
add_cylinder(Vector((-0.46, MAST_Y, 2.90)), Vector((+0.46, MAST_Y, 2.90)), 0.016, 0.016, segs=8, mat_idx=0, col=COL_TEAK_BRIGHT)
p_head = Vector((0.0, MAST_Y, 4.16))
p_forestay_base = Vector((0.0, -2.28, 1.11))
add_cylinder(p_head, p_forestay_base, 0.011, 0.011, segs=6, mat_idx=3, col=WHITE, smooth_mode=False)
add_cylinder(Vector((0.0, MAST_Y, 4.22)), Vector((0.0, 2.16, 0.96)), 0.010, 0.010, segs=6, mat_idx=3, col=WHITE, smooth_mode=False)
for sx in (-1.0, 1.0):
    p_sp = Vector((sx * 0.45, MAST_Y, 2.90))
    p_deck_cp = Vector((sx * 1.14, -0.22, 0.88))
    add_cylinder(p_head, p_sp, 0.010, 0.010, segs=6, mat_idx=3, col=WHITE, smooth_mode=False)
    add_cylinder(p_sp, p_deck_cp, 0.010, 0.010, segs=6, mat_idx=3, col=WHITE, smooth_mode=False)

# --- 4. Cambered Billowing Double-Sided Canvas Mainsail, Teal Jib & Masthead Burgee ---
# Using matched parallel-diagonal triangles (6mm thickness) -> guaranteed ZERO diagonal crossing or shading patch!
def add_billowed_sail(grid_pts, col_front, col_back, thickness=0.008):
    n_u = len(grid_pts)
    n_v = len(grid_pts[0])
    v_a = []
    v_b = []
    # Compute consistent wind-belly normal facing +X (starboard leeward fill)
    wind_dir = Vector((0.92, -0.35, 0.12)).normalized()
    for iu in range(n_u):
        ra = []
        rb = []
        for iv in range(n_v):
            pt = grid_pts[iu][iv]
            ra.append(bm.verts.new(pt))
            rb.append(bm.verts.new(pt - wind_dir * thickness))
        v_a.append(ra)
        v_b.append(rb)

    for iu in range(n_u - 1):
        for iv in range(n_v - 1):
            for shell, col_s, out_sign in ((v_a, col_front, +1.0), (v_b, col_back, -1.0)):
                p00 = shell[iu][iv]
                p10 = shell[iu + 1][iv]
                p11 = shell[iu + 1][iv + 1]
                p01 = shell[iu][iv + 1]
                # Skip degenerate top apex collapsed triangle cleanly
                uv00 = (iv / max(1, n_v - 1), iu / max(1, n_u - 1))
                uv10 = (iv / max(1, n_v - 1), (iu + 1) / max(1, n_u - 1))
                uv11 = ((iv + 1) / max(1, n_v - 1), (iu + 1) / max(1, n_u - 1))
                uv01 = ((iv + 1) / max(1, n_v - 1), iu / max(1, n_u - 1))
                for tri_v, tri_uv in (
                    ((p00, p10, p11), (uv00, uv10, uv11)),
                    ((p00, p11, p01), (uv00, uv11, uv01)),
                ):
                    # Avoid zero-area apex pinch
                    e1 = tri_v[1].co - tri_v[0].co
                    e2 = tri_v[2].co - tri_v[0].co
                    gn = e1.cross(e2)
                    if gn.length < 1e-6:
                        continue
                    if gn.dot(wind_dir * out_sign) < 0.0:
                        tri_v = (tri_v[0], tri_v[2], tri_v[1])
                        tri_uv = (tri_uv[0], tri_uv[2], tri_uv[1])
                    f = bm.faces.new(tri_v)
                    f.material_index = 2
                    f.smooth = True
                    for lp, uvp in zip(f.loops, tri_uv):
                        lp[vc_layer] = col_s
                        lp[uv_layer].uv = uvp


# Mainsail: spans vertically u in [0..1] (foot boom z=1.53 -> masthead peak z=4.16)
# and chordwise v in [0..1] (luff at mast -> curved roach leech toward boom end)
N_SU, N_SV = 8, 5
main_grid = []
p_tack = p_goose + Vector((0.0, 0.04, 0.03))
p_clew = p_boom_end + Vector((0.0, -0.05, 0.03))
p_mhead = Vector((0.0, MAST_Y + 0.04, 4.14))
for iu in range(N_SU + 1):
    uf = iu / N_SU  # height fraction
    luff_pt = p_tack.lerp(p_mhead, uf)
    # Roach bellies slightly convexly behind straight head-to-clew line
    leech_base = p_clew.lerp(p_mhead + Vector((0.0, 0.14, 0.0)), uf ** 0.92)
    roach = Vector((0.0, 0.16 * math.sin(math.pi * uf), 0.0))
    leech_pt = leech_base + roach
    row = []
    for iv in range(N_SV + 1):
        vf = iv / N_SV
        pt = luff_pt.lerp(leech_pt, vf)
        # Graceful airfoil wind belly camber (max ~0.22m at mid-draft, tapering neatly to spars)
        belly = 0.22 * math.sin(math.pi * (vf ** 0.72)) * math.sin(math.pi * max(0.08, min(0.95, uf)))
        pt += Vector((belly, -belly * 0.15, 0.0))
        row.append(pt)
    main_grid.append(row)
add_billowed_sail(main_grid, COL_SAIL_CREAM, (0.90, 0.85, 0.72, 1.0), thickness=0.008)

# Headsail Jib (coastal azure teal sailcloth between forestay and forward mast)
jib_grid = []
p_j_tack = Vector((0.0, -2.18, 1.14))
p_j_clew = Vector((0.18, -0.58, 1.38))
p_j_head = Vector((0.0, MAST_Y - 0.03, 4.02))
for iu in range(N_SU + 1):
    uf = iu / N_SU
    luff_pt = p_j_tack.lerp(p_j_head, uf)
    leech_pt = p_j_clew.lerp(p_j_head + Vector((0.0, -0.04, 0.0)), uf ** 0.94)
    row = []
    for iv in range(N_SV + 1):
        vf = iv / N_SV
        pt = luff_pt.lerp(leech_pt, vf)
        belly = 0.16 * math.sin(math.pi * (vf ** 0.75)) * math.sin(math.pi * max(0.08, min(0.94, uf)))
        pt += Vector((belly, -belly * 0.18, 0.0))
        row.append(pt)
    jib_grid.append(row)
add_billowed_sail(jib_grid, COL_SAIL_JIB, (0.16, 0.48, 0.66, 1.0), thickness=0.008)

# Fluttering Red-Coral Swallowtail Burgee / Pennant at masthead (z = 4.20 .. 4.30m -> exact h=4.30m!)
add_cylinder(Vector((0.0, MAST_Y, 4.22)), Vector((0.0, MAST_Y, 4.300)), 0.010, 0.006, segs=6, mat_idx=3, col=WHITE)
burgee_grid = []
for iu, z_f in ((0, 4.21), (1, 4.29)):
    row = []
    for iv in range(4):
        vf = iv / 3.0
        wave_x = 0.035 * math.sin(vf * 3.8)
        tap_z = (1.0 - 0.78 * vf) * 0.04
        z_cur = 4.25 + (tap_z if iu == 1 else -tap_z)
        row.append(Vector((wave_x, MAST_Y + 0.02 + 0.34 * vf, z_cur)))
    burgee_grid.append(row)
add_billowed_sail(burgee_grid, COL_PENNANT_RED, COL_PENNANT_RED, thickness=0.005)

mesh = bpy.data.meshes.new("sailboat")
bm.to_mesh(mesh)
bm.free()
for m in (MAT_WOOD, MAT_HULL_PAINT, MAT_SAIL, MAT_BRONZE):
    mesh.materials.append(m)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("sailboat", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"SAILBOAT_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} maxZ={max(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "sailboat.blend"))
glb_path = out_dir / "sailboat.glb"
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
