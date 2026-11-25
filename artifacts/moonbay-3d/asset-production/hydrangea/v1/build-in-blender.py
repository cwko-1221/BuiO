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


def _make_vcol_mat(name, roughness=0.58, spec=0.14):
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


def _add_tapered_tube(bm, col_layer, pts, radii, colors, segs=5, uv_layer=None, u_tile=1.0, v_tile=1.5):
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

    tip_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * (radii[-1] * 1.2))
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


def _add_serrated_hydrangea_leaf(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float, tilt: float, col_base, col_mid, col_tip):
    """Sculpts a broad ovate saw-toothed Bigleaf Hydrangea leaf with deep central vein furrow."""
    d = dir_v.normalized()
    side = d.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()
    c_t, s_t = math.cos(tilt), math.sin(tilt)
    s_vec = (side * c_t + up * s_t).normalized()
    u_vec = s_vec.cross(d).normalized()

    # Broad serrated profile: 3 marginal tooth lobes along each side + pointed drip tip
    t_rows = [
        (0.06, 0.08, 0.004, col_base),
        (0.32, 0.44, 0.018, col_mid),
        (0.45, 0.38, 0.014, col_mid),   # serrated notch 1
        (0.60, 0.50, 0.016, col_mid),   # widest tooth belly
        (0.72, 0.40, 0.012, col_tip),   # serrated notch 2
        (0.84, 0.30, 0.008, col_tip),   # tooth 3
    ]
    rings = []
    for t, w_f, lift, col in t_rows:
        center = origin + d * (t * length) + u_vec * (lift * 0.35)
        vl = bm.verts.new(center - s_vec * (w_f * width) + u_vec * (lift + 0.010))
        vc = bm.verts.new(center)
        vr = bm.verts.new(center + s_vec * (w_f * width) + u_vec * (lift + 0.010))
        rings.append((vl, vc, vr, col))

    v_pet = bm.verts.new(origin)
    vl0, vc0, vr0, c0 = rings[0]
    for tri in ((v_pet, vl0, vc0), (v_pet, vc0, vr0)):
        f = bm.faces.new(tri)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = c0

    for i in range(len(rings) - 1):
        vl_a, vc_a, vr_a, ca = rings[i]
        vl_b, vc_b, vr_b, cb = rings[i + 1]
        for verts, cols in (
            ((vl_a, vl_b, vc_b, vc_a), (ca, cb, cb, ca)),
            ((vc_a, vc_b, vr_b, vr_a), (ca, cb, cb, ca)),
        ):
            f = bm.faces.new(verts)
            f.smooth = True
            for lp, cc in zip(f.loops, cols):
                lp[col_layer] = cc

    vl_l, vc_l, vr_l, cl = rings[-1]
    v_tip = bm.verts.new(origin + d * length - u_vec * 0.006)
    for tri in ((vl_l, v_tip, vc_l), (vc_l, v_tip, vr_l)):
        f = bm.faces.new(tri)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = cl


def _add_hydrangea_floret(bm, col_layer, center: Vector, normal: Vector, radius: float, yaw_off: float, col_petal, col_edge):
    """Sculpts a plump 4-bract cupped azure-cornflower sterile floret with warm golden bead eye."""
    n = normal.normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(n.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    t1 = ref.cross(n).normalized()
    t2 = n.cross(t1).normalized()

    vc = bm.verts.new(center + n * (radius * 0.14))
    c_eye = _srgb_rgba(0.98, 0.86, 0.34)
    c_throat = (
        col_petal[0] * 0.72,
        col_petal[1] * 0.76,
        min(1.0, col_petal[2] * 0.88),
        1.0,
    )

    for k in range(4):
        ang = yaw_off + k * (math.pi * 0.5)
        dr = t1 * math.cos(ang) + t2 * math.sin(ang)
        ds = -t1 * math.sin(ang) + t2 * math.cos(ang)

        vi_l = bm.verts.new(center + dr * (radius * 0.17) - ds * (radius * 0.18) + n * (radius * 0.06))
        vi_r = bm.verts.new(center + dr * (radius * 0.17) + ds * (radius * 0.18) + n * (radius * 0.06))
        vm_l = bm.verts.new(center + dr * (radius * 0.62) - ds * (radius * 0.56) + n * (radius * 0.17))
        vm_r = bm.verts.new(center + dr * (radius * 0.62) + ds * (radius * 0.56) + n * (radius * 0.17))
        v_tip = bm.verts.new(center + dr * (radius * 0.96) + n * (radius * 0.18))

        f0 = bm.faces.new((vc, vi_l, vi_r))
        f0.smooth = True
        for lp in f0.loops:
            lp[col_layer] = c_eye

        f1 = bm.faces.new((vi_l, vm_l, vm_r, vi_r))
        f1.smooth = True
        for lp, cc in zip(f1.loops, (c_throat, col_petal, col_petal, c_throat)):
            lp[col_layer] = cc

        f2 = bm.faces.new((vm_l, v_tip, vm_r))
        f2.smooth = True
        for lp, cc in zip(f2.loops, (col_edge, col_edge, col_edge)):
            lp[col_layer] = cc


def _build_master_hydrangea_sprig_scene(scene):
    """
    Bakes 2 purpose-built Bigleaf Hydrangea (`繡球花`) atlas halves (`1024x1024` RGBA + Tangent Normal):
      Left slot  (`x=-0.50`): Plush circular mophead corymb globe of 4-bract azure-cornflower florets
                              with recessed deep-indigo floret shadow backing & serrated leaf rim!
      Right slot (`x=+0.50`): Broad serrated dark-to-moss green Bigleaf Hydrangea foliage branch!
    """
    rng = random.Random(3001)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    stem_col = _srgb_rgba(0.28, 0.46, 0.18)
    leaf_b = _srgb_rgba(0.15, 0.36, 0.11)
    leaf_m = _srgb_rgba(0.24, 0.52, 0.16)
    leaf_t = _srgb_rgba(0.36, 0.66, 0.22)

    # ---- LEFT SLOT: Dedicated Circular Mophead Corymb Cluster (cx=-0.50, cy=0.04) ----
    cx_m, cy_m = -0.50, 0.04
    # 6 broad dark-green collar leaves peeking around the rim of the mophead sphere
    for li in range(6):
        ang = li * (math.pi / 3.0) + 0.25
        ld = Vector((math.cos(ang), math.sin(ang), 0.05)).normalized()
        orig = Vector((cx_m + ld.x * 0.12, cy_m + ld.y * 0.12, -0.02))
        _add_serrated_hydrangea_leaf(
            bm, col_layer, orig, ld, 0.34, 0.23,
            tilt=0.12 if (li % 2 == 0) else -0.12,
            col_base=_srgb_rgba(0.12, 0.29, 0.09),
            col_mid=_srgb_rgba(0.20, 0.44, 0.14),
            col_tip=_srgb_rgba(0.30, 0.56, 0.18),
        )

    # Interior recessed sky-cobalt floret tier so overlapping gaps show crisp shadow depth without black-out
    n_deep = 12
    for fi in range(n_deep):
        ga = fi * 2.39996 + 0.7
        rr = math.sqrt((fi + 0.4) / n_deep) * 0.28
        fx = cx_m + math.cos(ga) * rr
        fy = cy_m + math.sin(ga) * rr
        fz = 0.03 + (1.0 - (rr / 0.32) ** 2) * 0.07
        fnorm = Vector((math.cos(ga) * rr * 0.8, math.sin(ga) * rr * 0.8, 0.92)).normalized()
        _add_hydrangea_floret(
            bm, col_layer, Vector((fx, fy, fz)), fnorm,
            rng.uniform(0.095, 0.118), rng.uniform(0, 6.28),
            _srgb_rgba(0.24, 0.43, 0.88), _srgb_rgba(0.34, 0.54, 0.95),
        )

    # Outer plump cornflower-sky mophead dome florets (`#7da5ef` cheerful Moonbay azure)
    n_fl = 24
    for fi in range(n_fl):
        ga = fi * 2.39996
        rr = math.sqrt((fi + 0.35) / n_fl) * 0.35
        fx = max(-0.88, min(-0.12, cx_m + math.cos(ga) * rr))
        fy = max(-0.82, min(0.86, cy_m + math.sin(ga) * rr * 1.02))
        fz = 0.10 + (1.0 - (rr / 0.37) ** 2) * 0.15 + rng.uniform(-0.012, 0.018)
        fnorm = Vector((math.cos(ga) * rr * 1.05, math.sin(ga) * rr * 1.05, 0.86)).normalized()
        shift = rng.uniform(-0.06, 0.06)
        c_pet = _srgb_rgba(0.33 + shift * 0.40, 0.54 + shift * 0.40, min(1.0, 0.97 + shift * 0.2))
        c_edg = _srgb_rgba(0.49 + shift * 0.38, 0.70 + shift * 0.38, 1.00)
        _add_hydrangea_floret(
            bm, col_layer, Vector((fx, fy, fz)), fnorm,
            rng.uniform(0.102, 0.128), rng.uniform(0, 6.28), c_pet, c_edg,
        )

    # ---- RIGHT SLOT: Dedicated Broad Serrated Hydrangea Foliage Branch (cx=+0.50) ----
    cx_l = 0.50
    slot_min, slot_max = 0.045, 0.955
    pts_m = [
        Vector((cx_l, -0.86, -0.02)),
        Vector((cx_l - 0.02, -0.30, 0.00)),
        Vector((cx_l + 0.01, 0.25, 0.02)),
        Vector((cx_l, 0.68, 0.03)),
    ]
    _add_tapered_tube(bm, col_layer, pts_m, [0.018, 0.015, 0.011, 0.007], [stem_col] * 4, segs=6)

    foliage_specs = [
        (-0.76, math.radians(-64), 0.38, 0.25),
        (-0.74, math.radians(64),  0.38, 0.25),
        (-0.46, math.radians(-56), 0.43, 0.28),
        (-0.44, math.radians(56),  0.43, 0.28),
        (-0.14, math.radians(-50), 0.42, 0.27),
        (-0.12, math.radians(50),  0.42, 0.27),
        (0.18,  math.radians(-46), 0.39, 0.25),
        (0.20,  math.radians(46),  0.39, 0.25),
        (0.46,  math.radians(-32), 0.34, 0.22),
        (0.48,  math.radians(32),  0.34, 0.22),
    ]
    for y_l, ang, llen, lwid in foliage_specs:
        ld = Vector((math.sin(ang), math.cos(ang), 0.06)).normalized()
        orig = Vector((cx_l, y_l, 0.0))
        if orig.x + ld.x * llen < slot_min or orig.x + ld.x * llen > slot_max:
            llen *= 0.86
        _add_serrated_hydrangea_leaf(
            bm, col_layer, orig, ld, llen, lwid,
            tilt=0.14 if ang > 0 else -0.14,
            col_base=leaf_b, col_mid=leaf_m, col_tip=leaf_t,
        )
    # Terminal emerald rosette tip leaf
    _add_serrated_hydrangea_leaf(
        bm, col_layer, Vector((cx_l, 0.56, 0.02)), Vector((0.0, 1.0, 0.12)).normalized(),
        0.31, 0.21, tilt=0.04, col_base=leaf_b, col_mid=leaf_m, col_tip=leaf_t,
    )

    me = bpy.data.meshes.new("HydrangeaSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("HydrangeaSprigAlbedo", roughness=0.58, spec=0.12)
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


def _build_hydrangea_base_and_cards(mat_bark, mat_card):
    """Builds gnarled woody canes + broad leafy skirt + 8 sculpted 3D mophead globes (~500 tris)."""
    rng = random.Random(3011)

    bm_b = bmesh.new()
    uv_b = bm_b.loops.layers.uv.new("UVMap")
    col_b = bm_b.loops.layers.color.new("Col")
    bark_cols = [_srgb_rgba(0.72, 0.76, 0.64), _srgb_rgba(0.82, 0.86, 0.72), _srgb_rgba(0.88, 0.93, 0.76)]

    bm_c = bmesh.new()
    uv_c = bm_c.loops.layers.uv.new("UVMap")
    col_c = bm_c.loops.layers.color.new("Tint")
    uv_mop = (0.025, 0.06, 0.475, 0.94)
    uv_leaf = (0.515, 0.04, 0.985, 0.96)

    # 1) Broad lush hydrangea leaf cushion skirt anchored to spread ground clump (10 outward + 4 collar sprays)
    for i in range(10):
        yaw = (i / 10.0) * math.tau + rng.uniform(-0.10, 0.10)
        pitch = math.radians(rng.uniform(16.0, 28.0))
        r_root = rng.uniform(0.08, 0.14)
        p_root = Vector((math.cos(yaw) * r_root * 1.15, math.sin(yaw) * r_root * 0.92, -0.04))
        p_mid = Vector((math.cos(yaw) * 0.21, math.sin(yaw) * 0.17, 0.03))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p_tip = p_mid + d * rng.uniform(0.18, 0.23)
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.015, 0.012, 0.006], bark_cols, segs=4, uv_layer=uv_b, u_tile=1.0, v_tile=1.8)

        fwd, side, up = basis_from_forward(d)
        roll = math.radians(18.0 if (i % 2 == 0) else -18.0)
        cr, sr = math.cos(roll), math.sin(roll)
        r_side = (side * cr + up * sr).normalized()
        r_up = r_side.cross(fwd).normalized()
        t_b = _srgb_rgba(0.84, 0.90, 0.80)
        t_t = _srgb_rgba(0.98, 1.00, 0.94)
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=p_mid - fwd * 0.05,
            forward=fwd, side=r_side, up=r_up,
            length=rng.uniform(0.42, 0.48), width=rng.uniform(0.36, 0.42),
            arch=0.055, v_fold=0.032, uv_rect=uv_leaf,
            tint_base=t_b, tint_tip=t_t, cols=2, rows=2,
        )

    # 4 mid-tier leaf collars nestled between outer flower globes
    for j in range(4):
        yaw = (j / 4.0) * math.tau + 0.55
        pitch = math.radians(rng.uniform(40.0, 48.0))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        fwd, side, up = basis_from_forward(d)
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=Vector((math.cos(yaw) * 0.08, math.sin(yaw) * 0.07, 0.09)),
            forward=fwd, side=side, up=up,
            length=0.38, width=0.34,
            arch=0.06, v_fold=0.03, uv_rect=uv_leaf,
            tint_base=_srgb_rgba(0.76, 0.85, 0.72), tint_tip=_srgb_rgba(0.94, 0.99, 0.90), cols=2, rows=2,
        )

    # 2) 8 Distinct 3D Sculpted Mophead Flower Globes (5 outer mound + 2 mid-crown + 1 center summit)
    globe_specs = [
        # (hub_x, hub_y, hub_z, radius, yaw_bias)
        ( 0.27,  0.04, 0.31, 0.165, 0.12),
        ( 0.09,  0.25, 0.34, 0.160, 1.25),
        (-0.22,  0.19, 0.30, 0.165, 2.42),
        (-0.26, -0.14, 0.34, 0.160, 3.60),
        ( 0.07, -0.25, 0.31, 0.165, 5.00),
        ( 0.14,  0.11, 0.44, 0.170, 0.65),
        (-0.14, -0.10, 0.43, 0.170, 3.80),
        ( 0.01,  0.01, 0.49, 0.185, 2.15),  # central summit globe eliminates overhead hollow ring
    ]

    for hx, hy, hz, gr, gyaw in globe_specs:
        hub = Vector((hx, hy, hz))
        p_root = Vector((hx * 0.32, hy * 0.32, -0.04))
        p_mid = Vector((hx * 0.62, hy * 0.62, hz * 0.38))
        p_tip = hub - Vector((0.0, 0.0, 0.04))
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.015, 0.012, 0.007], bark_cols, segs=4, uv_layer=uv_b, u_tile=1.0, v_tile=2.0)

        out_dir = Vector((hx * 1.15, hy * 1.15, 0.68)).normalized()

        # Top convex mophead dome cap lifted cleanly above equator wrap
        cf, cs, cu = _make_globe_basis(out_dir, gyaw)
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=hub + cu * (gr * 0.04) - cf * (gr * 1.05) - cu * (gr * 0.22),
            forward=cf, side=cs, up=cu,
            length=gr * 2.10, width=gr * 2.05,
            arch=gr * 0.60, v_fold=gr * 0.26, uv_rect=uv_mop,
            tint_base=_srgb_rgba(0.96, 0.98, 1.0), tint_tip=_srgb_rgba(1.0, 1.0, 1.0), cols=2, rows=2,
        )

        # Two crossed inclined wrap cards nestled slightly below cap so sphere reads round without self-shadow seams
        for ci, off_a in enumerate((0.40, 1.97)):
            ang = gyaw + off_a
            side_n = Vector((math.cos(ang) * 0.88, math.sin(ang) * 0.88, 0.47)).normalized()
            wf, ws, wu = _make_globe_basis(side_n, ang + (0.65 if ci == 0 else -0.65))
            add_cambered_card(
                bm_c, uv_c, col_c,
                origin=hub - Vector((0.0, 0.0, gr * 0.22)) - wf * (gr * 0.88) - wu * (gr * 0.26),
                forward=wf, side=ws, up=wu,
                length=gr * 1.76, width=gr * 1.74,
                arch=gr * 0.38, v_fold=gr * 0.18, uv_rect=uv_mop,
                tint_base=_srgb_rgba(0.92, 0.95, 1.0), tint_tip=_srgb_rgba(1.0, 1.0, 1.0), cols=2, rows=2,
            )

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
        ao_strength=0.20,
        alpha_boost=0.88,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=256,
        ridge_srgb=(0.56, 0.54, 0.36),
        fissure_srgb=(0.36, 0.38, 0.22),
        plate_freq_x=6.0,
        plate_freq_y=2.5,
        normal_amp=0.9,
        seed=3004,
    )
    mat_bark = make_textured_bark_material(
        "HydrangeaStems",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.80,
        normal_strength=0.45,
    )
    mat_card = make_leaf_card_material(
        "HydrangeaSprigs",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.58,
        normal_strength=0.42,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.12
    nt = mat_card.node_tree
    tex_alb = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image.colorspace_settings.name != "Non-Color"), None)
    if tex_alb and "Emission Color" in bsdf.inputs:
        nt.links.new(tex_alb.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.068

    obj_bark, obj_fol = _build_hydrangea_base_and_cards(mat_bark, mat_card)
    _normalize_bounds([obj_bark, obj_fol])
    apply_radial_canopy_normals(
        obj_fol.data,
        center=Vector((0.0, 0.0, 0.14)),
        sky_bias=1.15,
        blend_geom=0.08,
    )

    bpy.context.view_layer.update()
    pts = [v.co for o in (obj_bark, obj_fol) for v in o.data.vertices]
    tris = sum(max(1, len(p.vertices) - 2) for o in (obj_bark, obj_fol) for p in o.data.polygons)
    print(f"HYDRANGEA_V1_BOUNDS w={max(p.x for p in pts)-min(p.x for p in pts):.4f} d={max(p.y for p in pts)-min(p.y for p in pts):.4f} h={max(p.z for p in pts)-min(p.z for p in pts):.4f} minZ={min(p.z for p in pts):.4f} tris={tris}")

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
