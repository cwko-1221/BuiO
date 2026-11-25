import os
import sys
import math
import random
import bpy
import bmesh
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SHARED_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "_shared"))
if SHARED_DIR not in sys.path:
    sys.path.insert(0, SHARED_DIR)

from foliage_bakery import (
    bake_sprig_atlas,
    make_leaf_card_material,
    add_cambered_card,
    basis_from_forward,
    apply_radial_canopy_normals,
    generate_bark_textures,
    make_textured_bark_material,
)

ASSET_NAME = "hydrangea"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 1.10
TARGET_D = 0.90
TARGET_H = 0.63
MIN_Z_TARGET = -0.04


def _srgb_rgba(r, g, b, a=1.0):
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.60, spec=0.10):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    vcol = nt.nodes.new("ShaderNodeVertexColor")
    vcol.layer_name = "Col"
    nt.links.new(vcol.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _add_tapered_tube(bm, col_layer, pts, radii, colors, segs=4, uv_layer=None, u_tile=1.0, v_tile=1.5):
    rings = []
    n = len(pts)
    prev_up = Vector((0.0, 0.0, 1.0))
    cum_len = 0.0
    for i, (p, r) in enumerate(zip(pts, radii)):
        if i > 0:
            cum_len += (p - pts[i - 1]).length
        if i == 0:
            tang = (pts[1] - pts[0]).normalized()
        elif i == n - 1:
            tang = (pts[-1] - pts[-2]).normalized()
        else:
            tang = (pts[i + 1] - pts[i - 1]).normalized()
        side = tang.cross(prev_up)
        if side.length < 1e-4:
            side = tang.cross(Vector((1.0, 0.0, 0.0)))
        side.normalize()
        up = side.cross(tang).normalized()
        prev_up = up

        ring = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            offset = (side * math.cos(ang) + up * math.sin(ang)) * r
            ring.append((bm.verts.new(p + offset), s / segs))
        rings.append((ring, colors[i], cum_len))

    for i in range(len(rings) - 1):
        r0, c0, l0 = rings[i]
        r1, c1, l1 = rings[i + 1]
        for s in range(segs):
            s2 = (s + 1) % segs
            v0, u0 = r0[s]
            v1, u1 = r0[s2]
            v2, u2 = r1[s2]
            v3, u3 = r1[s]
            u1_adj = u1 if s2 != 0 else 1.0
            f = bm.faces.new((v0, v1, v2, v3))
            f.smooth = True
            f.loops[0][col_layer] = c0
            f.loops[1][col_layer] = c0
            f.loops[2][col_layer] = c1
            f.loops[3][col_layer] = c1
            if uv_layer is not None:
                f.loops[0][uv_layer].uv = (u0 * u_tile, l0 * v_tile)
                f.loops[1][uv_layer].uv = (u1_adj * u_tile, l0 * v_tile)
                f.loops[2][uv_layer].uv = (u1_adj * u_tile, l1 * v_tile)
                f.loops[3][uv_layer].uv = (u0 * u_tile, l1 * v_tile)

    tip_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * (radii[-1] * 1.15))
    r_end, c_end, l_end = rings[-1]
    for s in range(segs):
        s2 = (s + 1) % segs
        v0, u0 = r_end[s]
        v1, u1 = r_end[s2]
        u1_adj = u1 if s2 != 0 else 1.0
        f = bm.faces.new((v0, v1, tip_v))
        f.smooth = True
        for loop in f.loops:
            loop[col_layer] = c_end
        if uv_layer is not None:
            f.loops[0][uv_layer].uv = (u0 * u_tile, l_end * v_tile)
            f.loops[1][uv_layer].uv = (u1_adj * u_tile, l_end * v_tile)
            f.loops[2][uv_layer].uv = (0.5 * (u0 + u1_adj) * u_tile, (l_end + 0.03) * v_tile)


def _add_broad_hydrangea_leaf(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float, tilt: float, col_base, col_mid, col_tip):
    """
    Sculpts a wide cordate-ovate Bigleaf Hydrangea blade (`width ~ 0.78*length`) with
    deeply furrowed midrib vein, undulating lateral vein flutes, and crisp serrated teeth.
    """
    d = dir_v.normalized()
    side = d.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()
    c_t, s_t = math.cos(tilt), math.sin(tilt)
    s_vec = (side * c_t + up * s_t).normalized()
    u_vec = s_vec.cross(d).normalized()

    c_vein = (
        col_base[0] * 0.85 + 0.04,
        min(1.0, col_mid[1] * 0.96 + 0.06),
        col_base[2] * 0.85,
        1.0,
    )
    # 5 jagged Bigleaf teeth pairs across broad ovate blade with smooth curved cup (zero accordion ribs)
    t_rows = [
        (0.08, 0.18, col_base),
        (0.22, 0.45, col_base),  # tooth 1 outer swell
        (0.30, 0.40, col_mid),   # serration notch 1
        (0.42, 0.52, col_mid),   # widest mid belly (tooth 2)
        (0.51, 0.44, col_mid),   # serration notch 2
        (0.63, 0.47, col_mid),   # tooth 3
        (0.71, 0.36, col_tip),   # serration notch 3
        (0.81, 0.33, col_tip),   # tooth 4
        (0.89, 0.19, col_tip),   # taper to drip apex
    ]
    rings = []
    for t, w_f, col in t_rows:
        arch_z = math.sin(t * math.pi) * 0.016
        w_inner = 0.06 + math.sin(t * math.pi) * 0.20
        w_outer = w_f * width
        center = origin + d * (t * length) + u_vec * arch_z
        # Smooth continuous transverse bowl (`x^2`) prevents horizontal serration accordion stripes
        vl = bm.verts.new(center - s_vec * w_outer + u_vec * (0.018 * (w_outer / max(0.05, width * 0.5)) ** 1.4))
        vml = bm.verts.new(center - s_vec * (w_inner * width) + u_vec * (0.004 * math.sin(t * math.pi)))
        vc = bm.verts.new(center - u_vec * 0.004)
        vmr = bm.verts.new(center + s_vec * (w_inner * width) + u_vec * (0.004 * math.sin(t * math.pi)))
        vr = bm.verts.new(center + s_vec * w_outer + u_vec * (0.018 * (w_outer / max(0.05, width * 0.5)) ** 1.4))
        rings.append((vl, vml, vc, vmr, vr, col))

    v_pet = bm.verts.new(origin)
    vl0, vml0, vc0, vmr0, vr0, c0 = rings[0]
    for tri in ((v_pet, vl0, vml0), (v_pet, vml0, vc0), (v_pet, vc0, vmr0), (v_pet, vmr0, vr0)):
        f = bm.faces.new(tri)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = c0

    for i in range(len(rings) - 1):
        a = rings[i]
        b = rings[i + 1]
        ca, cb = a[5], b[5]
        for k in range(4):
            f = bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
            f.smooth = True
            c_m = c_vein if (k == 1 or k == 2) else ca
            for lp, cc in zip(f.loops, (c_m, cb, cb, c_m)):
                lp[col_layer] = cc

    vl_l, vml_l, vc_l, vmr_l, vr_l, cl = rings[-1]
    v_tip = bm.verts.new(origin + d * length - u_vec * 0.006)
    for tri in ((vl_l, v_tip, vml_l), (vml_l, v_tip, vc_l), (vc_l, v_tip, vmr_l), (vmr_l, v_tip, vr_l)):
        f = bm.faces.new(tri)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = cl


def _add_hydrangea_floret(bm, col_layer, center: Vector, normal: Vector, radius: float, yaw_off: float, col_throat, col_petal, col_edge):
    """Sculpts a plump rounded 4-bract hydrangea sterile floret with tiny delicate ivory-celadon bead eye."""
    n = normal.normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(n.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    t1 = ref.cross(n).normalized()
    t2 = n.cross(t1).normalized()

    vc = bm.verts.new(center + n * (radius * 0.13))
    c_eye = _srgb_rgba(0.88, 0.94, 0.80)  # delicate botanical ivory-celadon eye bead (zero polka dot)

    for k in range(4):
        ang = yaw_off + k * (math.pi * 0.5)
        dr = t1 * math.cos(ang) + t2 * math.sin(ang)
        ds = -t1 * math.sin(ang) + t2 * math.cos(ang)

        # Tiny eye ring -> wide rounded petal belly -> curved sepal shoulder
        ve_l = bm.verts.new(center + dr * (radius * 0.085) - ds * (radius * 0.075) + n * (radius * 0.09))
        ve_r = bm.verts.new(center + dr * (radius * 0.085) + ds * (radius * 0.075) + n * (radius * 0.09))

        vi_l = bm.verts.new(center + dr * (radius * 0.25) - ds * (radius * 0.28) + n * (radius * 0.06))
        vi_r = bm.verts.new(center + dr * (radius * 0.25) + ds * (radius * 0.28) + n * (radius * 0.06))

        vm_l = bm.verts.new(center + dr * (radius * 0.68) - ds * (radius * 0.56) + n * (radius * 0.16))
        vm_c = bm.verts.new(center + dr * (radius * 0.72) + n * (radius * 0.14))
        vm_r = bm.verts.new(center + dr * (radius * 0.68) + ds * (radius * 0.56) + n * (radius * 0.16))

        vo_l = bm.verts.new(center + dr * (radius * 0.92) - ds * (radius * 0.30) + n * (radius * 0.18))
        vo_c = bm.verts.new(center + dr * (radius * 0.98) + n * (radius * 0.17))
        vo_r = bm.verts.new(center + dr * (radius * 0.92) + ds * (radius * 0.30) + n * (radius * 0.18))

        f0 = bm.faces.new((vc, ve_l, ve_r))
        f0.smooth = True
        for lp in f0.loops:
            lp[col_layer] = c_eye

        for tri_or_q, cols in (
            ((ve_l, vi_l, vi_r, ve_r), (col_throat, col_petal, col_petal, col_throat)),
            ((vi_l, vm_l, vm_c, vi_r), (col_petal, col_petal, col_petal, col_petal)),
            ((vi_r, vm_c, vm_r), (col_petal, col_petal, col_petal)),
            ((vm_l, vo_l, vo_c, vm_c), (col_petal, col_edge, col_edge, col_petal)),
            ((vm_c, vo_c, vo_r, vm_r), (col_petal, col_edge, col_edge, col_petal)),
        ):
            f = bm.faces.new(tri_or_q)
            f.smooth = True
            for lp, cc in zip(f.loops, cols):
                lp[col_layer] = cc


def _build_master_hydrangea_sprig_scene(scene):
    """
    Bakes 2 purpose-built Bigleaf Hydrangea (`繡球花`) atlas halves (`1024x1024` RGBA + Tangent Normal):
      Left slot  (`x=-0.50`): Lush rounded `#7da5ef` periwinkle-cornflower mophead floret dome
                              backed by subtle dark-green broad leaf cusps around rim.
      Right slot (`x=+0.50`): Broad serrated Bigleaf Hydrangea leaf whorl (5 plump heart-ovate blades).
    """
    rng = random.Random(3002)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    stem_col = _srgb_rgba(0.27, 0.46, 0.17)
    leaf_b = _srgb_rgba(0.14, 0.35, 0.10)
    leaf_m = _srgb_rgba(0.24, 0.51, 0.15)
    leaf_t = _srgb_rgba(0.35, 0.65, 0.21)

    # ---- LEFT SLOT: Pure Dense Rounded Mophead Floret Dome (cx=-0.50, cy=0.04; zero stray green ears on flower shells) ----
    cx_m, cy_m = -0.50, 0.04

    # Shaded lower floret backdrop providing crisp inter-floret shadow contrast
    n_deep = 12
    for fi in range(n_deep):
        ga = fi * 2.39996 + 0.5
        rr = math.sqrt((fi + 0.35) / n_deep) * 0.30
        fx = cx_m + math.cos(ga) * rr
        fy = cy_m + math.sin(ga) * rr
        fz = 0.04 + (1.0 - (rr / 0.35) ** 2) * 0.07
        fnorm = Vector((math.cos(ga) * rr * 0.85, math.sin(ga) * rr * 0.85, 0.90)).normalized()
        _add_hydrangea_floret(
            bm, col_layer, Vector((fx, fy, fz)), fnorm,
            rng.uniform(0.108, 0.130), rng.uniform(0, 6.28),
            _srgb_rgba(0.18, 0.34, 0.78),
            _srgb_rgba(0.24, 0.44, 0.88),
            _srgb_rgba(0.32, 0.53, 0.95),
        )

    # Plump outer cornflower-periwinkle `#7da5ef` dome florets (slightly larger for crisp petal readability)
    n_fl = 20
    for fi in range(n_fl):
        ga = fi * 2.39996
        rr = math.sqrt((fi + 0.25) / n_fl) * 0.35
        fx = max(-0.87, min(-0.13, cx_m + math.cos(ga) * rr))
        fy = max(-0.82, min(0.86, cy_m + math.sin(ga) * rr))
        fz = 0.12 + (1.0 - (rr / 0.38) ** 2) * 0.16 + rng.uniform(-0.010, 0.015)
        fnorm = Vector((math.cos(ga) * rr * 1.0, math.sin(ga) * rr * 1.0, 0.88)).normalized()
        shift = rng.uniform(-0.05, 0.05)
        c_th = _srgb_rgba(0.23 + shift * 0.35, 0.41 + shift * 0.35, min(1.0, 0.88 + shift * 0.2))
        c_pt = _srgb_rgba(0.35 + shift * 0.40, 0.56 + shift * 0.40, min(1.0, 0.97 + shift * 0.15))
        c_ed = _srgb_rgba(0.50 + shift * 0.35, 0.70 + shift * 0.35, 1.00)
        _add_hydrangea_floret(
            bm, col_layer, Vector((fx, fy, fz)), fnorm,
            rng.uniform(0.118, 0.146), rng.uniform(0, 6.28), c_th, c_pt, c_ed,
        )

    # ---- RIGHT SLOT: Broad Cordate-Ovate Bigleaf Hydrangea Whorl (cx=+0.50) ----
    cx_l = 0.50
    _add_tapered_tube(
        bm, col_layer,
        [Vector((cx_l, -0.86, -0.02)), Vector((cx_l - 0.01, -0.35, 0.00)), Vector((cx_l, 0.10, 0.02))],
        [0.022, 0.016, 0.010], [stem_col] * 3, segs=6,
    )
    # 5 huge broad overlapping ovate leaves radiating from sturdy shoot hub (NO fern/rose pinnae)
    whorl_leaves = [
        (Vector((cx_l - 0.01, -0.60, 0.00)), math.radians(-68), 0.46, 0.36, -0.14),
        (Vector((cx_l + 0.01, -0.56, 0.00)), math.radians(66),  0.46, 0.36,  0.14),
        (Vector((cx_l - 0.01, -0.18, 0.02)), math.radians(-38), 0.52, 0.40, -0.10),
        (Vector((cx_l + 0.01, -0.14, 0.02)), math.radians(36),  0.52, 0.40,  0.10),
        (Vector((cx_l,         0.08, 0.04)), math.radians(2),   0.64, 0.47,  0.04),
    ]
    for orig, ang, llen, lwid, tilt in whorl_leaves:
        ld = Vector((math.sin(ang), math.cos(ang), 0.08)).normalized()
        # Keep broad tips cleanly inside [+0.05, +0.95] slot boundary
        max_x = abs(ld.x) * llen
        if orig.x + ld.x * llen < 0.045:
            llen = min(llen, (orig.x - 0.05) / max(0.05, -ld.x))
        elif orig.x + ld.x * llen > 0.955:
            llen = min(llen, (0.95 - orig.x) / max(0.05, ld.x))
        _add_broad_hydrangea_leaf(
            bm, col_layer, orig, ld, llen, lwid,
            tilt=tilt, col_base=leaf_b, col_mid=leaf_m, col_tip=leaf_t,
        )

    me = bpy.data.meshes.new("HydrangeaSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("HydrangeaSprigAlbedo", roughness=0.60, spec=0.10)
    me.materials.append(mat)
    obj = bpy.data.objects.new("HydrangeaSprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _make_globe_basis(up_vec: Vector, yaw_ref: float):
    """Returns (fwd, side, up) matching basis_from_forward handedness (`side.cross(fwd) == +up`)."""
    up = up_vec.normalized()
    ref = Vector((math.cos(yaw_ref), math.sin(yaw_ref), 0.0))
    if abs(ref.dot(up)) > 0.92:
        ref = Vector((1.0, 0.0, 0.0)) if abs(up.x) < 0.9 else Vector((0.0, 1.0, 0.0))
    fwd = (ref - up * ref.dot(up)).normalized()
    side = fwd.cross(up).normalized()
    return fwd, side, up


def _add_mophead_dome_shell(bm, uv_layer, col_layer, hub: Vector, radius: float, yaw_bias: float, uv_mop):
    """
    Constructs a billowing 6-panel convex dome cluster around `hub` (`1` upper crown +
    `5` shingled shoulder panels tiled evenly every 72 deg at ~48 deg tilt): ZERO X-blades or flat rims.
    """
    def add_curved_panel(panel_n: Vector, p_yaw: float, offset_r: float, size_f: float, arch_f: float, tint_b, tint_t):
        pn = panel_n.normalized()
        pf, ps, pu = _make_globe_basis(pn, p_yaw)
        w = radius * size_f
        l = radius * size_f
        a_h = radius * arch_f
        add_cambered_card(
            bm, uv_layer, col_layer,
            origin=hub + pn * (radius * offset_r - a_h * 0.55) - pf * (l * 0.5),
            forward=pf, side=ps, up=pu,
            length=l, width=w,
            arch=a_h, v_fold=a_h * 0.20, uv_rect=uv_mop,
            tint_base=tint_b, tint_tip=tint_t, cols=3, rows=3,
        )

    out_dir = Vector((hub.x * 0.90, hub.y * 0.90, 0.78)).normalized()
    # Panel 0: Top crown spherical dome cap
    add_curved_panel(
        out_dir, yaw_bias, offset_r=0.54, size_f=1.22, arch_f=0.40,
        tint_b=_srgb_rgba(0.95, 0.97, 1.0), tint_t=_srgb_rgba(1.0, 1.0, 1.0),
    )

    # Panels 1..5: 5 gently curved upper shoulder panels hugging into soft pillowy rounded domes (zero drooping flaps)
    crown_f, crown_s, crown_u = _make_globe_basis(out_dir, yaw_bias)
    tilt = math.radians(39.0)
    ct, st = math.cos(tilt), math.sin(tilt)
    for k in range(5):
        az = yaw_bias + k * (math.tau / 5.0)
        tang = crown_f * math.cos(az) + crown_s * math.sin(az)
        pn = (crown_u * ct + tang * st).normalized()
        add_curved_panel(
            pn, az + 0.35, offset_r=0.50, size_f=1.12, arch_f=0.34,
            tint_b=_srgb_rgba(0.91, 0.95, 1.0), tint_t=_srgb_rgba(0.99, 1.0, 1.0),
        )


def _build_hydrangea_base_and_cards(mat_bark, mat_card):
    """Builds woody basal canes + broad Bigleaf cushion + mid/upper leaf collars + 8 spherical domes (~1,400 tris)."""
    rng = random.Random(3012)

    bm_b = bmesh.new()
    uv_b = bm_b.loops.layers.uv.new("UVMap")
    col_b = bm_b.loops.layers.color.new("Col")
    bark_cols = [_srgb_rgba(0.76, 0.80, 0.66), _srgb_rgba(0.84, 0.88, 0.74), _srgb_rgba(0.90, 0.94, 0.78)]

    bm_c = bmesh.new()
    uv_c = bm_c.loops.layers.uv.new("UVMap")
    col_c = bm_c.loops.layers.color.new("Tint")
    uv_mop = (0.045, 0.08, 0.455, 0.90)
    uv_leaf = (0.515, 0.03, 0.985, 0.97)

    # 1) Ground-hugging Broad Bigleaf Cushion Skirt (`10` spreading sprays anchored cleanly at -0.04m)
    for i in range(10):
        yaw = (i / 10.0) * math.tau + rng.uniform(-0.08, 0.08)
        pitch = math.radians(rng.uniform(11.0, 22.0))
        r_root = rng.uniform(0.08, 0.14)
        p_root = Vector((math.cos(yaw) * r_root * 1.15, math.sin(yaw) * r_root * 0.92, -0.04))
        p_mid = Vector((math.cos(yaw) * 0.21, math.sin(yaw) * 0.17, 0.03))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p_tip = p_mid + d * rng.uniform(0.18, 0.22)
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.015, 0.012, 0.006], bark_cols, segs=4, uv_layer=uv_b, u_tile=1.0, v_tile=1.8)

        fwd, side, up = basis_from_forward(d)
        roll = math.radians(16.0 if (i % 2 == 0) else -16.0)
        cr, sr = math.cos(roll), math.sin(roll)
        r_side = (side * cr + up * sr).normalized()
        r_up = r_side.cross(fwd).normalized()
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=p_mid - fwd * 0.07,
            forward=fwd, side=r_side, up=r_up,
            length=rng.uniform(0.42, 0.48), width=rng.uniform(0.40, 0.46),
            arch=0.055, v_fold=0.030, uv_rect=uv_leaf,
            tint_base=_srgb_rgba(0.86, 0.92, 0.82), tint_tip=_srgb_rgba(0.98, 1.00, 0.94), cols=2, rows=2,
        )

    # 2) 8 Mid-Cane + 4 Upper-Shoulder Leaf Collars cradling closely beneath the flower globes
    for j in range(8):
        yaw = (j / 8.0) * math.tau + 0.35
        pitch = math.radians(rng.uniform(40.0, 50.0))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        fwd, side, up = basis_from_forward(d)
        roll = math.radians(-18.0 if (j % 2 == 0) else 18.0)
        cr, sr = math.cos(roll), math.sin(roll)
        r_side = (side * cr + up * sr).normalized()
        r_up = r_side.cross(fwd).normalized()
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=Vector((math.cos(yaw) * 0.05, math.sin(yaw) * 0.04, 0.07)),
            forward=fwd, side=r_side, up=r_up,
            length=0.40, width=0.39,
            arch=0.060, v_fold=0.028, uv_rect=uv_leaf,
            tint_base=_srgb_rgba(0.80, 0.88, 0.76), tint_tip=_srgb_rgba(0.96, 1.00, 0.92), cols=2, rows=2,
        )

    for k in range(4):
        yaw = (k / 4.0) * math.tau + 0.78
        pitch = math.radians(rng.uniform(55.0, 64.0))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        fwd, side, up = basis_from_forward(d)
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=Vector((math.cos(yaw) * 0.04, math.sin(yaw) * 0.03, 0.14)),
            forward=fwd, side=side, up=up,
            length=0.33, width=0.33,
            arch=0.055, v_fold=0.024, uv_rect=uv_leaf,
            tint_base=_srgb_rgba(0.76, 0.84, 0.72), tint_tip=_srgb_rgba(0.92, 0.98, 0.88), cols=2, rows=2,
        )

    # 3) 8 Billowing Rounded Hydrangea Domes nested snugly into leaf collar (`hz = 0.25..0.41`)
    globe_specs = [
        ( 0.26,  0.04, 0.25, 0.186, 0.12),
        ( 0.09,  0.24, 0.28, 0.184, 1.25),
        (-0.22,  0.18, 0.25, 0.186, 2.42),
        (-0.25, -0.13, 0.28, 0.184, 3.60),
        ( 0.07, -0.24, 0.26, 0.186, 5.00),
        ( 0.13,  0.10, 0.37, 0.194, 0.65),
        (-0.13, -0.09, 0.36, 0.194, 3.80),
        ( 0.01,  0.01, 0.42, 0.208, 2.15),
    ]

    for hx, hy, hz, gr, gyaw in globe_specs:
        hub = Vector((hx, hy, hz))
        p_root = Vector((hx * 0.30, hy * 0.30, -0.04))
        p_mid = Vector((hx * 0.62, hy * 0.62, hz * 0.40))
        p_tip = hub - Vector((0.0, 0.0, 0.03))
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.015, 0.012, 0.007], bark_cols, segs=4, uv_layer=uv_b, u_tile=1.0, v_tile=2.0)
        _add_mophead_dome_shell(bm_c, uv_c, col_c, hub, gr, gyaw, uv_mop)

    me_b = bpy.data.meshes.new("HydrangeaStems")
    bm_b.to_mesh(me_b)
    bm_b.free()
    me_b.materials.append(mat_bark)
    obj_b = bpy.data.objects.new("HydrangeaStems", me_b)
    bpy.context.scene.collection.objects.link(obj_b)

    me_c = bpy.data.meshes.new("HydrangeaFoliage")
    bm_c.to_mesh(me_c)
    bm_c.free()
    me_c.materials.append(mat_card)
    obj_c = bpy.data.objects.new("HydrangeaFoliage", me_c)
    bpy.context.scene.collection.objects.link(obj_c)
    return obj_b, obj_c


def _normalize_bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs if o.type == "MESH" for v in o.data.vertices]
    min_x, max_x = min(p.x for p in pts), max(p.x for p in pts)
    min_y, max_y = min(p.y for p in pts), max(p.y for p in pts)
    min_z, max_z = min(p.z for p in pts), max(p.z for p in pts)
    sx = TARGET_W / (max_x - min_x)
    sy = TARGET_D / (max_y - min_y)
    sz = TARGET_H / (max_z - min_z)
    cx, cy = 0.5 * (min_x + max_x), 0.5 * (min_y + max_y)
    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            v.co.x = (v.co.x - cx) * sx
            v.co.y = (v.co.y - cy) * sy
            v.co.z = (v.co.z - min_z) * sz + MIN_Z_TARGET
        o.data.update()


def main():
    albedo_path, normal_path = bake_sprig_atlas(
        _build_master_hydrangea_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=24,
        ao_distance=0.10,
        ao_strength=0.22,
        alpha_boost=0.88,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=256,
        ridge_srgb=(0.56, 0.55, 0.36),
        fissure_srgb=(0.36, 0.39, 0.22),
        plate_freq_x=6.0,
        plate_freq_y=2.5,
        normal_amp=0.9,
        seed=3005,
    )
    mat_bark = make_textured_bark_material(
        "HydrangeaStems",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.78,
        normal_strength=0.42,
    )
    mat_card = make_leaf_card_material(
        "HydrangeaSprigs",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.35,
        roughness=0.60,
        normal_strength=0.36,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.10
    nt = mat_card.node_tree
    tex_alb = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image.colorspace_settings.name != "Non-Color"), None)
    if tex_alb and "Emission Color" in bsdf.inputs:
        nt.links.new(tex_alb.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.072

    obj_bark, obj_fol = _build_hydrangea_base_and_cards(mat_bark, mat_card)
    _normalize_bounds([obj_bark, obj_fol])
    apply_radial_canopy_normals(
        obj_fol.data,
        center=Vector((0.0, 0.0, 0.06)),
        sky_bias=1.38,
        blend_geom=0.05,
    )

    bpy.context.view_layer.update()
    pts = [v.co for o in (obj_bark, obj_fol) for v in o.data.vertices]
    tris = sum(max(1, len(p.vertices) - 2) for o in (obj_bark, obj_fol) for p in o.data.polygons)
    print(f"HYDRANGEA_V2_BOUNDS w={max(p.x for p in pts)-min(p.x for p in pts):.4f} d={max(p.y for p in pts)-min(p.y for p in pts):.4f} h={max(p.z for p in pts)-min(p.z for p in pts):.4f} minZ={min(p.z for p in pts):.4f} tris={tris}")

    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        export_materials="EXPORT",
        export_normals=True,
        export_tangents=True,
        export_attributes=True,
        export_yup=True,
    )
    print(f"EXPORTED: {OUT_GLB}")


if __name__ == "__main__":
    main()
