"""Build Moonbay Market Canopy v2: slender raked masts on octagonal sandstone plinths, high catenary bright-teal linen sun-sail with corner shackles and perimeter bolt-ropes."""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1])
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

W, D, H = 4.5, 3.1, 3.1
# world.ts applies stretch=[3.21, 1.48, 1.55] -> 2.071x wider in X than Z.
# Pre-compensate mast/plinth/collar X radii by 1.55 / 3.21 = 0.483 so plaza poles are circular (~1:1).
RX_COMP = 1.55 / 3.21

def make_packed_image(name, w, h, rgba_array, is_non_color=False):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    if is_non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba_array.ravel())
    img.filepath_raw = str(out_dir / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img

W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# 1. Matte weathered harbor timber texture (distinct plank striations, zero glossy sheen)
grain = (
    0.46 * np.sin(u * 135.0 + 1.8 * np.sin(v * 9.0))
    + 0.30 * np.sin(u * 305.0 + 0.9 * np.cos(v * 23.0))
    + 0.24 * np.sin(v * 22.0 + u * 11.0 + 0.6 * np.sin(u * 70.0))
)
wood_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
tone = np.clip(0.90 + 0.11 * grain, 0.74, 1.06)
wood_rgba[..., 0] = np.clip(0.56 * tone, 0, 1)
wood_rgba[..., 1] = np.clip(0.35 * tone, 0, 1)
wood_rgba[..., 2] = np.clip(0.19 * tone, 0, 1)
wood_img = make_packed_image("canopy-wood", W_TX, H_TX, wood_rgba)

# 2. Sunlit Moonbay aqua-mint sailcloth (#43bda9 family) with twill weave, stitched border, and gore seams
# Diagonal twill weave texture + subtle radial gore seams along u
twill = np.sin((xx + yy) * 1.15) * 0.5 + np.sin((xx - yy) * 0.38) * 0.25
weave = 0.040 * twill
panel_stripe = 0.5 + 0.5 * np.cos(u * math.pi * 12.0)
gore_seam = np.exp(-((np.abs(np.sin(u * math.pi * 6.0))) * 18.0) ** 2)

# Bright airy coastal palette matching #43bda9 (approx 0.263, 0.741, 0.663)
aqua_main = np.array([0.255, 0.745, 0.665], dtype=np.float32)
aqua_light = np.array([0.365, 0.825, 0.745], dtype=np.float32)
cream_border = np.array([0.960, 0.900, 0.755], dtype=np.float32)
seam_teal = np.array([0.190, 0.580, 0.520], dtype=np.float32)

sail_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
stitch_line = np.exp(-((v - 0.145) / 0.013) ** 2)
inner_stripe = np.exp(-((v - 0.215) / 0.017) ** 2)
for c in range(3):
    interior = aqua_main[c] * (1.0 - 0.45 * panel_stripe) + aqua_light[c] * (0.45 * panel_stripe)
    interior = interior * (1.0 - 0.14 * gore_seam) + seam_teal[c] * (0.14 * gore_seam)
    base = np.where(v < 0.135, cream_border[c], interior)
    base = base * (1.0 - 0.28 * stitch_line) + seam_teal[c] * (0.28 * stitch_line)
    base = base * (1.0 - 0.88 * inner_stripe) + cream_border[c] * (0.88 * inner_stripe)
    sail_rgba[..., c] = np.clip(base * (1.0 + weave), 0.0, 1.0)
sail_img = make_packed_image("canopy-sail", W_TX, H_TX, sail_rgba)

# 3. Normal map for linen twill weave + stitched hem/gore relief
height_field = 0.045 * twill - 0.06 * stitch_line - 0.05 * gore_seam
dh_du = np.gradient(height_field, axis=1) * 5.0
dh_dv = np.gradient(height_field, axis=0) * 5.0
nz = np.ones_like(dh_du)
inv_len = 1.0 / np.sqrt(dh_du ** 2 + dh_dv ** 2 + nz ** 2)
norm_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
norm_rgba[..., 0] = np.clip((-dh_du * inv_len) * 0.5 + 0.5, 0.0, 1.0)
norm_rgba[..., 1] = np.clip((-dh_dv * inv_len) * 0.5 + 0.5, 0.0, 1.0)
norm_rgba[..., 2] = np.clip((nz * inv_len) * 0.5 + 0.5, 0.0, 1.0)
sail_norm_img = make_packed_image("canopy-sail-normal", W_TX, H_TX, norm_rgba, is_non_color=True)

# 4. Twined braided hemp rope texture for mast wraps & edge bolt-rope
rope_strand = np.sin((xx * 0.45 + yy * 1.15)) * 0.5 + 0.5 * np.sin(xx * 1.4 - yy * 0.4)
rope_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
rt = np.clip(0.88 + 0.14 * rope_strand, 0.68, 1.05)
rope_rgba[..., 0] = np.clip(0.76 * rt, 0, 1)
rope_rgba[..., 1] = np.clip(0.64 * rt, 0, 1)
rope_rgba[..., 2] = np.clip(0.44 * rt, 0, 1)
rope_img = make_packed_image("canopy-rope", W_TX, H_TX, rope_rgba)

def make_tex_mat(name, image, rough, metal=0.0, norm_img=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-480, 260)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-480, 30)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-220, 180)
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(vc.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    if norm_img is not None:
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = norm_img
        ntex.location = (-480, -210)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.55
        nmap.location = (-220, -180)
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
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

MAT_SAIL = make_tex_mat("CanopySail", sail_img, rough=0.78, norm_img=sail_norm_img)
MAT_WOOD = make_tex_mat("CanopyWood", wood_img, rough=0.76)
MAT_STONE = make_vcol_mat("CanopyStone", rough=0.86)
MAT_BRONZE = make_vcol_mat("CanopyBronze", rough=0.44, metal=0.68)
MAT_ROPE = make_tex_mat("CanopyRope", rope_img, rough=0.90)

# Warm Moonbay sandstone & weathered bronze tones (no stark black or glaring white)
STONE_STEP = (0.89, 0.78, 0.64, 1.0)
STONE_CORE = (0.83, 0.71, 0.57, 1.0)
BRONZE_DARK = (0.48, 0.36, 0.22, 1.0)
BRASS_WARM = (0.84, 0.66, 0.29, 1.0)
WHITE_V = (1.0, 1.0, 1.0, 1.0)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")

def paint_faces(faces, mat_idx, color=WHITE_V, uv_fn=None):
    for f in faces:
        f.material_index = mat_idx
        f.smooth = True
        for loop in f.loops:
            loop[vc_layer] = color
            if uv_fn is not None:
                loop[uv_layer].uv = uv_fn(loop.vert.co)
            else:
                co = loop.vert.co
                loop[uv_layer].uv = ((co.x + 2.25) * 0.45 % 1.0, (co.y * 0.4 + co.z * 0.5) % 1.0)

def add_profile_loft(rings, mat_idx, color, cap_bottom=True, cap_top=True, uv_fn=None, ring_colors=None):
    v_rings = [[bm.verts.new(Vector(p)) for p in ring] for ring in rings]
    n_seg = len(v_rings[0])
    all_faces = []
    for r in range(len(v_rings) - 1):
        a, b = v_rings[r], v_rings[r + 1]
        step_faces = []
        for i in range(n_seg):
            j = (i + 1) % n_seg
            step_faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
        col = ring_colors[r] if ring_colors else color
        paint_faces(step_faces, mat_idx, col, uv_fn=uv_fn)
        all_faces.extend(step_faces)
    if cap_bottom and n_seg >= 3:
        fb = bm.faces.new(list(reversed(v_rings[0])))
        paint_faces([fb], mat_idx, ring_colors[0] if ring_colors else color, uv_fn=uv_fn)
    if cap_top and n_seg >= 3:
        ft = bm.faces.new(v_rings[-1])
        paint_faces([ft], mat_idx, ring_colors[-1] if ring_colors else color, uv_fn=uv_fn)
    return v_rings

def axis_basis(tangent):
    t = tangent.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((0.0, 1.0, 0.0))
    u_vec = t.cross(ref).normalized()
    v_vec = t.cross(u_vec).normalized()
    return u_vec, v_vec

def add_tube(pts, rad, mat_idx, color, segs=8, rx_comp=RX_COMP, cap_ends=True, twist=False):
    rings = []
    for i, p in enumerate(pts):
        tan = pts[1] - pts[0] if i == 0 else (pts[-1] - pts[-2] if i == len(pts) - 1 else pts[i + 1] - pts[i - 1])
        u_v, v_v = axis_basis(tan)
        ring = []
        for k in range(segs):
            ang = 2.0 * math.pi * k / segs
            off = u_v * (math.cos(ang) * rad) + v_v * (math.sin(ang) * rad)
            off.x *= rx_comp
            ring.append(p + off)
        rings.append(ring)
    add_profile_loft(rings, mat_idx, color, cap_bottom=cap_ends, cap_top=cap_ends)

def add_helix_rope_wrap(center, shaft_r, turns=5.5, pitch=0.022, strand_r=0.011, mat_idx=4):
    """Add real 3D spiral twisted rope wrap cleanly around mast shaft."""
    pts = []
    steps = int(turns * 14)
    start_z = center.z - 0.5 * turns * pitch
    for s in range(steps + 1):
        t = s / steps
        ang = t * turns * 2.0 * math.pi
        z_cur = start_z + t * turns * pitch
        r = shaft_r + strand_r * 0.68
        pts.append(Vector((center.x + math.cos(ang) * r * RX_COMP, center.y + math.sin(ang) * r, z_cur)))
    add_tube(pts, strand_r, mat_idx, WHITE_V, segs=6, rx_comp=RX_COMP, cap_ends=True)

def add_ring_torus(center, normal, major_r, minor_r, mat_idx, color, maj_segs=14, min_segs=6):
    u_v, v_v = axis_basis(normal)
    rings = []
    for i in range(maj_segs):
        ang = 2.0 * math.pi * i / maj_segs
        radial = u_v * math.cos(ang) + v_v * math.sin(ang)
        rc = Vector((radial.x * major_r * RX_COMP, radial.y * major_r, radial.z * major_r))
        c_pt = center + rc
        r_dir = rc.normalized() if rc.length > 1e-5 else Vector((1, 0, 0))
        ring = []
        for j in range(min_segs):
            b = 2.0 * math.pi * j / min_segs
            off = r_dir * (math.cos(b) * minor_r) + normal.normalized() * (math.sin(b) * minor_r)
            off.x *= RX_COMP
            ring.append(c_pt + off)
        rings.append(ring)
    v_rings = [[bm.verts.new(p) for p in r] for r in rings]
    faces = []
    for i in range(maj_segs):
        a = v_rings[i]
        b = v_rings[(i + 1) % maj_segs]
        for j in range(min_segs):
            jn = (j + 1) % min_segs
            faces.append(bm.faces.new((a[j], b[j], b[jn], a[jn])))
    paint_faces(faces, mat_idx, color)

def add_cleat_horn(center, direction_xy, mat_idx=1):
    """Small wooden rigging horn cleat bolted to the side of the mast."""
    d_n = Vector((direction_xy.x, direction_xy.y, 0.0)).normalized()
    stem = [
        center + Vector((d_n.x * 0.01 * RX_COMP, d_n.y * 0.01, 0.0)),
        center + Vector((d_n.x * 0.045 * RX_COMP, d_n.y * 0.045, 0.0)),
    ]
    add_tube(stem, 0.012, mat_idx, (0.90, 0.86, 0.80, 1.0), segs=6)
    horn_tip = center + Vector((d_n.x * 0.048 * RX_COMP, d_n.y * 0.048, 0.0))
    horns = [
        horn_tip + Vector((0.0, 0.0, -0.055)),
        horn_tip,
        horn_tip + Vector((0.0, 0.0, +0.055)),
    ]
    add_tube(horns, 0.010, mat_idx, (0.95, 0.90, 0.84, 1.0), segs=6)

def oval_ring(center, radius, segs=8, z=None, rot_offset=0.0):
    cz = center.z if z is None else z
    ring = []
    for k in range(segs):
        ang = rot_offset + 2.0 * math.pi * k / segs
        ring.append((center.x + math.cos(ang) * radius * RX_COMP, center.y + math.sin(ang) * radius, cz))
    return ring

# Mast centers aligned strictly with world.ts 0.48m round colliders:
# [-0.482*4.5, -0.4565*3.1], [+0.482*4.5, -0.4355*3.1], [0, +0.4565*3.1]
# Plinth RY = 0.110 -> world Z = 0.453m (<0.48m), Plinth RX = 0.110*0.483 = 0.0531 -> world X = 0.453m (<0.48m).
PLINTH_R = 0.110
SHAFT_R0 = 0.057  # World pole diameter = 0.235m tapering to 0.185m
MASTS = [
    {"base": Vector((-2.169, -1.415, 0.0)), "rake": Vector((-0.020, -0.032, 0.0)), "top_h": 2.94, "sail_h": 2.75},
    {"base": Vector((+2.169, -1.350, 0.0)), "rake": Vector((+0.020, -0.032, 0.0)), "top_h": 2.86, "sail_h": 2.67},
    {"base": Vector((0.000,  +1.415, 0.0)), "rake": Vector((0.000,  +0.032, 0.0)), "top_h": 2.99, "sail_h": 2.81},
]

sail_corners = []
center_xy = Vector((0.0, -0.22, 0.0))

for idx, m in enumerate(MASTS):
    base = m["base"]
    rake = m["rake"]
    top_h = m["top_h"]
    sail_h = m["sail_h"]

    # Two-tier grounded octagonal cream sandstone plinth (widest at z=0 -> stepped inward cleanly)
    plinth_rings = [
        oval_ring(base, PLINTH_R, 8, 0.000, math.pi / 8),
        oval_ring(base, PLINTH_R, 8, 0.075, math.pi / 8),
        oval_ring(base, PLINTH_R * 0.87, 8, 0.105, math.pi / 8),
        oval_ring(base, PLINTH_R * 0.87, 8, 0.195, math.pi / 8),
        oval_ring(base, PLINTH_R * 0.72, 8, 0.225, math.pi / 8),
    ]
    add_profile_loft(
        plinth_rings, 2, STONE_STEP,
        ring_colors=[STONE_CORE, STONE_STEP, STONE_CORE, STONE_STEP]
    )

    # Weathered dark-bronze anchor shoe collar & tapered upper sleeve (warm metallic, no pure black)
    shoe_rings = [
        oval_ring(base, SHAFT_R0 * 1.24, 12, 0.225),
        oval_ring(base, SHAFT_R0 * 1.20, 12, 0.305),
        oval_ring(base + rake * 0.04, SHAFT_R0 * 1.06, 12, 0.340),
    ]
    add_profile_loft(shoe_rings, 3, BRONZE_DARK)

    # Slender 12-sided chamfered cedar timber spar
    spar_rings = []
    n_z = 9
    for s in range(n_z):
        t = s / (n_z - 1)
        z_cur = 0.32 + t * (top_h - 0.32)
        rad = SHAFT_R0 * (1.0 - 0.22 * t)
        c_xy = base + rake * t
        spar_rings.append(oval_ring(c_xy, rad, 12, z_cur))
    add_profile_loft(spar_rings, 1, WHITE_V)

    # Upper masthead bronze/brass shackle collar (~89% height -> short elegant top neck)
    t_sail = (sail_h - 0.32) / (top_h - 0.32)
    c_sail = base + rake * t_sail
    c_sail.z = sail_h
    r_sail = SHAFT_R0 * (1.0 - 0.22 * t_sail)
    collar_rings = [
        oval_ring(c_sail, r_sail * 1.15, 12, sail_h - 0.040),
        oval_ring(c_sail, r_sail * 1.18, 12, sail_h + 0.040),
    ]
    add_profile_loft(collar_rings, 3, BRASS_WARM)

    # Clean turned spherical-dome brass masthead finial (16 segs, smooth lathe profile)
    c_top = base + rake
    c_top.z = top_h
    r_top = SHAFT_R0 * 0.78
    fin_h = 3.1000 - top_h if idx == 2 else 0.098
    finial_rings = [
        oval_ring(c_top, r_top * 1.18, 16, top_h - 0.015),
        oval_ring(c_top, r_top * 1.25, 16, top_h + fin_h * 0.16),
        oval_ring(c_top, r_top * 0.76, 16, top_h + fin_h * 0.36),
        oval_ring(c_top, r_top * 1.10, 16, top_h + fin_h * 0.62),
        oval_ring(c_top, r_top * 0.96, 16, top_h + fin_h * 0.82),
        oval_ring(c_top, r_top * 0.45, 16, top_h + fin_h * 0.96),
        oval_ring(c_top, r_top * 0.14, 16, top_h + fin_h),
    ]
    add_profile_loft(finial_rings, 3, BRASS_WARM)

    # Real spiral braided hemp rope wrap + wooden horn cleat
    t_wrap = (1.16 - 0.32) / (top_h - 0.32)
    c_wrap = base + rake * t_wrap
    c_wrap.z = 1.16
    r_wrap = SHAFT_R0 * (1.0 - 0.22 * t_wrap)
    add_helix_rope_wrap(c_wrap, r_wrap, turns=5.5, pitch=0.022, strand_r=0.011, mat_idx=4)
    inward_2d = (center_xy - Vector((base.x, base.y, 0.0))).normalized()
    add_cleat_horn(c_wrap + Vector((inward_2d.x * r_wrap * RX_COMP, inward_2d.y * r_wrap, 0.095)), inward_2d, mat_idx=1)

    # Rigging shackle & corner tension cable joining masthead ring cleanly to sail corner
    inward = (center_xy - Vector((c_sail.x, c_sail.y, 0.0))).normalized()
    eye_pt = c_sail + Vector((inward.x * r_sail * RX_COMP * 1.05, inward.y * r_sail * 1.05, 0.0))
    sail_pt = eye_pt + Vector((inward.x * 0.135, inward.y * 0.145, -0.055))
    sail_corners.append(sail_pt)

    add_tube([eye_pt, sail_pt], 0.012, 4, WHITE_V, segs=6)
    add_ring_torus((eye_pt + sail_pt) * 0.5, sail_pt - eye_pt, 0.024, 0.008, 3, BRASS_WARM)
    # Corner brass D-ring grommet anchored into the sail corner
    add_ring_torus(sail_pt, Vector((0.0, 0.0, 1.0)), 0.026, 0.009, 3, BRASS_WARM)

# High sunlit catenary canopy sail (lowest vertex >= 2.40m -> world Y >= 4.72m -> 1.83m clear above 2.89m stalls!)
N = 28
pA, pB, pC = sail_corners

def sail_point(i, j):
    b = i / N
    c = j / N
    a = 1.0 - b - c
    # Crisp concave catenary scallop pull along perimeter
    edge_pull = 0.090 * (a * b + b * c + c * a) * 4.0
    p = a * pA + b * pB + c * pC
    mid = (pA + pB + pC) / 3.0
    p = p.lerp(mid, edge_pull * 0.52)
    # Tight engineered tension sag -> stays >= 2.40m everywhere
    edge_sag = 0.115 * math.sqrt(max(0.0, (a * b + b * c + c * a) * 3.0))
    belly = 0.135 * (27.0 * a * b * c)
    ridge = 0.014 * math.sin(max(a, b, c) * math.pi * 6.0) * (1.0 - max(a, b, c))
    p.z = max(2.40, p.z - edge_sag - belly + ridge)
    return p, a, b, c

top_verts, bot_verts, uv_coords = {}, {}, {}
thick = 0.022
for i in range(N + 1):
    for j in range(N + 1 - i):
        pos, a, b, c = sail_point(i, j)
        v_uv = min(1.0, min(a, b, c) * 3.1)
        u_uv = (pos.x + 2.25) / 4.5
        uv_coords[(i, j)] = (u_uv, v_uv)
        top_verts[(i, j)] = bm.verts.new(pos)
        bot_verts[(i, j)] = bm.verts.new(pos - Vector((0.0, 0.0, thick)))

# Keep upper top-face crisp white vertex color; give bottom-face gentle sunlit bounce tint so undersides never turn muddy grey
TOP_V = (1.0, 1.0, 1.0, 1.0)
BOT_V = (1.0, 1.0, 0.98, 1.0)

for i in range(N):
    for j in range(N - i):
        for tri in ([(i, j), (i + 1, j), (i, j + 1)], [(i + 1, j), (i + 1, j + 1), (i, j + 1)] if i + j < N - 1 else []):
            if not tri:
                continue
            f_top = bm.faces.new([top_verts[k] for k in tri])
            f_bot = bm.faces.new([bot_verts[k] for k in reversed(tri)])
            for f, keys, vcol in [(f_top, tri, TOP_V), (f_bot, reversed(tri), BOT_V)]:
                f.material_index = 0
                f.smooth = True
                for loop, k in zip(f.loops, keys):
                    loop[vc_layer] = vcol
                    loop[uv_layer].uv = uv_coords[k]

edges_idx = [
    [(0, j) for j in range(N + 1)],
    [(i, 0) for i in range(N + 1)],
    [(i, N - i) for i in range(N + 1)],
]
for e_idx, e_chain in enumerate(edges_idx):
    for m in range(len(e_chain) - 1):
        k0, k1 = e_chain[m], e_chain[m + 1]
        verts_rim = [top_verts[k0], top_verts[k1], bot_verts[k1], bot_verts[k0]] if e_idx == 1 else [top_verts[k1], top_verts[k0], bot_verts[k0], bot_verts[k1]]
        try:
            f_rim = bm.faces.new(verts_rim)
            f_rim.material_index = 0
            f_rim.smooth = True
            for loop in f_rim.loops:
                loop[vc_layer] = (0.98, 0.96, 0.90, 1.0)
                loop[uv_layer].uv = (0.5, 0.02)
        except ValueError:
            pass
    # Perimeter bolt-rope sewn directly along all 3 scalloped catenary sail hems
    rope_pts = [top_verts[k].co - Vector((0.0, 0.0, thick * 0.45)) for k in e_chain]
    add_tube(rope_pts, 0.015, 4, WHITE_V, segs=6, rx_comp=RX_COMP * 1.15)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("Market canopy sail and timber masts")
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("Market canopy sail and timber masts", mesh)
bpy.context.scene.collection.objects.link(obj)
for mat in (MAT_SAIL, MAT_WOOD, MAT_STONE, MAT_BRONZE, MAT_ROPE):
    obj.data.materials.append(mat)

coords = [v.co for v in obj.data.vertices]
lo = [min(c[i] for c in coords) for i in range(3)]
hi = [max(c[i] for c in coords) for i in range(3)]
print(
    "MARKET_CANOPY_V2",
    len(obj.data.polygons),
    tuple(round(hi[i] - lo[i], 4) for i in range(3)),
    "minZ=", round(lo[2], 4),
    "center=", (round((lo[0] + hi[0]) * 0.5, 4), round((lo[1] + hi[1]) * 0.5, 4)),
    flush=True,
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "market-canopy.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / "market-canopy.glb"),
    export_format="GLB",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
    export_materials="EXPORT",
)
