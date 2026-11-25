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

import numpy as np
from foliage_bakery import (
    bake_sprig_atlas,
    make_leaf_card_material,
    add_cambered_card,
    basis_from_forward,
    apply_radial_canopy_normals,
    make_textured_bark_material,
)

ASSET_NAME = "pink-tree"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 5.40
TARGET_D = 5.00
TARGET_H = 5.55
MIN_Z_TARGET = -0.05


def _srgb_rgba(r, g, b, a=1.0):
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.60, spec=0.14):
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


def _add_tapered_tube(bm, col_layer, pts, radii, colors, segs=6, uv_layer=None, u_tile=1.0, v_tile=1.5):
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

    tip_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * (radii[-1] * 1.3))
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
            f.loops[2][uv_layer].uv = (0.5 * (u0 + u1_adj) * u_tile, (l_end + 0.05) * v_tile)


def _add_sakura_blossom(bm, col_layer, center: Vector, normal: Vector, radius: float, yaw_off: float, col_center, col_mid, col_tip):
    """
    Sculpts a 5-petal cupped sakura cherry blossom with signature delicate outer petal notch
    and warm golden-rose center stamen cup.
    """
    n = normal.normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(n.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    t1 = ref.cross(n).normalized()
    t2 = n.cross(t1).normalized()

    # Tiny raised golden-rose stamen dome at flower throat
    vc = bm.verts.new(center + n * (radius * 0.14))
    for k in range(5):
        ang = yaw_off + k * (2.0 * math.pi / 5.0)
        d_rad = t1 * math.cos(ang) + t2 * math.sin(ang)
        d_side = (-t1 * math.sin(ang) + t2 * math.cos(ang))

        # Throat base -> mid cupped petal -> twin notched outer petal lobes!
        v_in_l = bm.verts.new(center + d_rad * (radius * 0.20) - d_side * (radius * 0.11) + n * (radius * 0.04))
        v_in_r = bm.verts.new(center + d_rad * (radius * 0.20) + d_side * (radius * 0.11) + n * (radius * 0.04))
        v_m_l = bm.verts.new(center + d_rad * (radius * 0.68) - d_side * (radius * 0.37) + n * (radius * 0.22))
        v_m_c = bm.verts.new(center + d_rad * (radius * 0.65) + n * (radius * 0.18))
        v_m_r = bm.verts.new(center + d_rad * (radius * 0.68) + d_side * (radius * 0.37) + n * (radius * 0.22))

        v_tip_l = bm.verts.new(center + d_rad * (radius * 1.00) - d_side * (radius * 0.22) + n * (radius * 0.32))
        v_notch = bm.verts.new(center + d_rad * (radius * 0.85) + n * (radius * 0.27))
        v_tip_r = bm.verts.new(center + d_rad * (radius * 1.00) + d_side * (radius * 0.22) + n * (radius * 0.32))

        # Stamen core triangle + cupped notched petal quads
        f0 = bm.faces.new((vc, v_in_l, v_in_r))
        f0.smooth = True
        for lp in f0.loops:
            lp[col_layer] = _srgb_rgba(0.99, 0.78, 0.34)

        for verts, cols in (
            ((v_in_l, v_m_l, v_m_c, vc), (col_center, col_mid, col_mid, col_center)),
            ((vc, v_m_c, v_m_r, v_in_r), (col_center, col_mid, col_mid, col_center)),
            ((v_m_l, v_tip_l, v_notch, v_m_c), (col_mid, col_tip, col_tip, col_mid)),
            ((v_m_c, v_notch, v_tip_r, v_m_r), (col_mid, col_tip, col_tip, col_mid)),
        ):
            fp = bm.faces.new(verts)
            fp.smooth = True
            for lp, cc in zip(fp.loops, cols):
                lp[col_layer] = cc


def _add_young_leaf_bud(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float):
    """Adds tiny tender fresh sage-bronze cherry leaf emerging near blossom base."""
    d = dir_v.normalized()
    side = d.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()
    v0 = bm.verts.new(origin)
    v1 = bm.verts.new(origin + d * (length * 0.52) - side * (width * 0.5) + up * 0.01)
    v2 = bm.verts.new(origin + d * length + up * 0.005)
    v3 = bm.verts.new(origin + d * (length * 0.52) + side * (width * 0.5) + up * 0.01)
    f = bm.faces.new((v0, v1, v2, v3))
    f.smooth = True
    c_b = _srgb_rgba(0.48, 0.65, 0.32)
    c_t = _srgb_rgba(0.62, 0.76, 0.38)
    for lp, cc in zip(f.loops, (c_b, c_b, c_t, c_b)):
        lp[col_layer] = cc


def _build_master_sakura_sprig_scene(scene):
    """
    Bakes 2 exquisite 3D Sakura Blossom & Lenticel Twig Sprays (`1024x1024` RGBA + Tangent Normal):
      Dozens of cupped 5-petal notched cherry blossoms + rosebuds + tender spring leaf shoots along dark cherry twigs!
    """
    rng = random.Random(2501)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    bark_dark = _srgb_rgba(0.36, 0.21, 0.19)
    bark_mid = _srgb_rgba(0.49, 0.29, 0.25)

    def add_sakura_sprig(cx: float, wide_mode: bool):
        slot_min = cx - 0.45
        slot_max = cx + 0.45
        y_top_limit = 0.87

        pts_m = [
            Vector((cx, -0.84, 0.0)),
            Vector((cx - 0.02, -0.40, 0.02)),
            Vector((cx + 0.02, 0.06, 0.04)),
            Vector((cx - 0.01, 0.46, 0.06)),
        ]
        _add_tapered_tube(bm, col_layer, pts_m, [0.021, 0.015, 0.011, 0.007], [bark_dark, bark_dark, bark_mid, bark_mid], segs=7)

        sub_twigs = [
            (Vector((cx - 0.01, -0.44, 0.02)), Vector((cx - 0.16, -0.20, 0.04)), Vector((cx - 0.27, 0.04, 0.06)), 0.012),
            (Vector((cx - 0.01, -0.34, 0.02)), Vector((cx + 0.16, -0.12, 0.04)), Vector((cx + 0.27, 0.12, 0.06)), 0.012),
            (Vector((cx + 0.01, -0.02, 0.04)), Vector((cx - 0.16, 0.22, 0.06)), Vector((cx - 0.25, 0.46, 0.07)), 0.010),
            (Vector((cx + 0.01, 0.06, 0.04)), Vector((cx + 0.16, 0.28, 0.06)), Vector((cx + 0.25, 0.50, 0.07)), 0.010),
        ]
        all_shoots = [(pts_m, 1.0)] + [([p0, p1, p2], 0.94) for p0, p1, p2, _ in sub_twigs]
        for p0, p1, p2, r0 in sub_twigs:
            _add_tapered_tube(bm, col_layer, [p0, p1, p2], [r0, r0 * 0.65, 0.005], [bark_dark, bark_mid, bark_mid], segs=6)

        for s_pts, sc in all_shoots:
            n_nodes = 5 if len(s_pts) == 4 else 4
            for i in range(n_nodes):
                t = 0.26 + 0.74 * (i / max(1, n_nodes - 1))
                idx_f = t * (len(s_pts) - 1)
                i0 = min(int(idx_f), len(s_pts) - 2)
                frac = idx_f - i0
                p = s_pts[i0].lerp(s_pts[i0 + 1], frac)
                tang = (s_pts[i0 + 1] - s_pts[i0]).normalized()
                tang_xy = Vector((tang.x, tang.y, 0.0)).normalized()
                perp = Vector((-tang_xy.y, tang_xy.x, 0.0))

                # Each node blooms with airy, crisp corymb clusters so light & transparent rays flow cleanly!
                for sgn in (-1.0, 1.0, 0.0):
                    if sgn == 0.0 and i < n_nodes - 1 and (i % 2 == 0):
                        continue
                    if sgn != 0.0 and i == 1 and rng.random() < 0.30:
                        continue
                    off_ang = rng.uniform(-0.22, 0.22) if sgn == 0.0 else math.radians(sgn * rng.uniform(38.0, 66.0))
                    reach = rng.uniform(0.068, 0.125) * sc
                    b_pos = p + (tang_xy * math.cos(off_ang) + perp * math.sin(off_ang)) * reach + Vector((0, 0, rng.uniform(0.015, 0.055)))

                    rad = rng.uniform(0.064, 0.086) * sc * (0.94 if not wide_mode else 1.0)
                    # Clamp inside atlas slot margins
                    if b_pos.x - rad < slot_min or b_pos.x + rad > slot_max or b_pos.y + rad > y_top_limit:
                        b_pos.x = max(slot_min + rad * 1.04, min(slot_max - rad * 1.04, b_pos.x))
                        b_pos.y = min(y_top_limit - rad * 1.04, b_pos.y)

                    pv0 = bm.verts.new(p)
                    pv1 = bm.verts.new(p + perp * 0.008)
                    pv2 = bm.verts.new(b_pos + perp * 0.005)
                    pv3 = bm.verts.new(b_pos)
                    pf = bm.faces.new((pv0, pv1, pv2, pv3))
                    for lp in pf.loops:
                        lp[col_layer] = _srgb_rgba(0.49, 0.30, 0.28)

                    tilt_n = Vector((rng.uniform(-0.32, 0.32), rng.uniform(-0.32, 0.32), 0.90)).normalized()
                    warm_shift = rng.uniform(-0.03, 0.03)
                    # Joyful luminous spring cherry-blossom pink (balanced saturation so bounces stay pastel sakura, never crimson or white-gray)
                    c_in = _srgb_rgba(0.99, 0.54 + warm_shift * 0.4, 0.70 + warm_shift * 0.4)
                    c_mid = _srgb_rgba(1.00, 0.70 + warm_shift * 0.5, 0.82 + warm_shift * 0.4)
                    c_tip = _srgb_rgba(1.00, 0.83 + warm_shift * 0.4, 0.91 + warm_shift * 0.3)
                    _add_sakura_blossom(bm, col_layer, b_pos, tilt_n, rad, rng.uniform(0, 6.28), c_in, c_mid, c_tip)

                    # Occasional tender spring young leaf bud at node collar (~25% chance)
                    if rng.random() < 0.28 and i <= 2:
                        ld = (tang_xy * 0.7 + perp * (sgn * 0.7) + Vector((0, 0, 0.15))).normalized()
                        _add_young_leaf_bud(bm, col_layer, p + Vector((0, 0, 0.008)), ld, rng.uniform(0.08, 0.12), 0.042)

    add_sakura_sprig(-0.50, wide_mode=True)
    add_sakura_sprig(+0.50, wide_mode=False)

    me = bpy.data.meshes.new("SakuraSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("SakuraBlossomAlbedo", roughness=0.58, spec=0.14)
    me.materials.append(mat)
    obj = bpy.data.objects.new("SakuraSprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _trunk_curve(t: float) -> Vector:
    z = -0.05 + t * 2.10
    x = math.sin(t * math.pi * 1.15) * 0.13 - 0.04 * t
    y = math.cos(t * math.pi * 0.9) * 0.05 - 0.05 * (1.0 - t)
    return Vector((x, y, z))


def _trunk_radius(t: float) -> float:
    flare = 0.14 * math.exp(-t * 9.5)
    core = 0.255 * ((1.0 - 0.42 * t) ** 0.78)
    return core + flare


def _build_cherry_skeleton(mat_bark):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Col")

    n_rings = 16
    n_segs = 14
    rings = []
    for ri in range(n_rings):
        t = ri / (n_rings - 1)
        c = _trunk_curve(t)
        base_r = _trunk_radius(t)
        root_amp = 0.34 * math.exp(-t * 8.2)
        ring = []
        for si in range(n_segs):
            ang = (2.0 * math.pi * si) / n_segs
            lobe = math.sin(ang * 5.0 + 0.3) * root_amp
            r = base_r * (1.0 + lobe)
            p = Vector((c.x + math.cos(ang) * r, c.y + math.sin(ang) * r, c.z))
            ring.append((bm.verts.new(p), ang, si / n_segs))
        rings.append((ring, t))

    for ri in range(n_rings - 1):
        r0, t0 = rings[ri]
        r1, t1 = rings[ri + 1]
        for si in range(n_segs):
            s2 = (si + 1) % n_segs
            v0, a0, u0 = r0[si]
            v1, a1, u1 = r0[s2]
            v2, _, u2 = r1[s2]
            v3, _, u3 = r1[si]
            u1_adj = u1 if s2 != 0 else 1.0
            f = bm.faces.new((v0, v1, v2, v3))
            f.smooth = True
            uvs = [(u0 * 2.0, t0 * 3.0), (u1_adj * 2.0, t0 * 3.0), (u1_adj * 2.0, t1 * 3.0), (u0 * 2.0, t1 * 3.0)]
            for loop, tt, aa, uv_c in zip(f.loops, (t0, t0, t1, t1), (a0, a1, a1, a0), uvs):
                loop[uv_layer].uv = uv_c
                moss = math.exp(-tt * 7.5)
                fur = 0.94 + 0.05 * math.sin(aa * 5.0 + 0.3) * math.exp(-tt * 3.0)
                loop[col_layer] = _srgb_rgba((0.94 - 0.14 * moss) * fur, (0.91 - 0.10 * moss) * fur, (0.90 - 0.16 * moss) * fur)

    cap_b = bm.faces.new([v for v, _, _ in rings[0][0]][::-1])
    for lp in cap_b.loops:
        lp[col_layer] = _srgb_rgba(0.80, 0.78, 0.74)
        lp[uv_layer].uv = (0.5, 0.0)
    bmesh.ops.triangulate(bm, faces=[cap_b])

    cap_t = bm.faces.new([v for v, _, _ in rings[-1][0]])
    for lp in cap_t.loops:
        lp[col_layer] = _srgb_rgba(0.94, 0.92, 0.90)
        lp[uv_layer].uv = (0.5, 1.0)
    bmesh.ops.triangulate(bm, faces=[cap_t])

    # Graceful Wide Sakura Umbrella Scaffold (`[5.40, 5.00, 5.55]` wide-spreading canopy!)
    crown_base = _trunk_curve(0.95)
    rng = random.Random(2511)
    bark_cols = [_srgb_rgba(0.92, 0.90, 0.90), _srgb_rgba(0.96, 0.94, 0.94), _srgb_rgba(1.0, 0.98, 0.98), _srgb_rgba(1.0, 0.99, 0.99)]
    twig_anchors = []

    limb_specs = [
        (0.05, 22.0, 1.88, 0.152, 1.02, 0.86),  # wide X-axis east umbrella
        (1.22, 28.0, 1.62, 0.145, 0.95, 0.88),
        (2.38, 24.0, 1.78, 0.148, 0.99, 0.86),
        (3.45, 20.0, 1.84, 0.150, 1.01, 0.85),  # wide west sakura bough
        (4.85, 30.0, 1.60, 0.142, 0.94, 0.90),
        (0.90, 68.0, 1.56, 0.130, 0.95, 0.98),  # domed central crown bridge
        (3.95, 65.0, 1.48, 0.125, 0.92, 0.96),
    ]

    for li, (yaw, pitch_d, length, r0, spread_sc, t_val) in enumerate(limb_specs):
        pitch = math.radians(pitch_d + rng.uniform(-3.0, 3.0))
        d_lim = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p0 = crown_base - Vector((0, 0, 0.14 if pitch_d < 50 else 0.02)) + Vector((math.cos(yaw)*0.06, math.sin(yaw)*0.06, 0))
        p1 = p0 + d_lim * (length * 0.42) + Vector((0, 0, 0.10))
        p2 = p0 + d_lim * (length * 0.82) + Vector((0, 0, 0.04))
        p3 = p0 + d_lim * length + Vector((0, 0, 0.10))
        _add_tapered_tube(bm, col_layer, [p0, p1, p2, p3], [r0, r0 * 0.72, r0 * 0.48, 0.028], bark_cols, segs=7, uv_layer=uv_layer, u_tile=1.4, v_tile=1.8)

        fwd_l, side_l, up_l = basis_from_forward(p3 - p1)
        fork_defs = [
            (-0.56, 12.0, 1.08 * spread_sc, 0.046, 0.78, 0.44),
            (+0.54, 15.0, 1.05 * spread_sc, 0.045, 0.80, 0.48),
            (0.05,  34.0, 0.95 * spread_sc, 0.042, 0.92, 0.72),
            (-0.18, 52.0, 0.88 * spread_sc, 0.036, 0.94, 0.20),
        ]
        for fj, (f_yaw, f_pitch_d, f_len, f_r, sub_t, start_frac) in enumerate(fork_defs):
            fp_pitch = math.radians(f_pitch_d + rng.uniform(-4.0, 4.0))
            fd = (fwd_l * math.cos(f_yaw) + side_l * math.sin(f_yaw) + up_l * math.sin(fp_pitch)).normalized()
            f_start = p1.lerp(p3, start_frac)
            f_mid = f_start + fd * (f_len * 0.52) + Vector((0, 0, 0.08))
            f_tip = f_start + fd * f_len + Vector((0, 0, 0.12))
            _add_tapered_tube(bm, col_layer, [f_start, f_mid, f_tip], [f_r, f_r * 0.62, 0.014], bark_cols[1:], segs=6, uv_layer=uv_layer, u_tile=1.0, v_tile=1.8)

            for sgn in (-1.0, 1.0):
                tf, ts, tu = basis_from_forward(f_tip - f_start)
                t_ang = sgn * rng.uniform(0.44, 0.70)
                td = (tf * math.cos(t_ang) + ts * math.sin(t_ang) + Vector((0, 0, rng.uniform(0.06, 0.26)))).normalized()
                t_ori = f_start.lerp(f_mid, 0.42 if sgn < 0 else 0.74)
                t_end = t_ori + td * (0.64 * spread_sc)
                _add_tapered_tube(bm, col_layer, [t_ori, (t_ori + t_end) * 0.5 + Vector((0, 0, 0.04)), t_end], [0.021, 0.013, 0.007], bark_cols[1:], segs=5, uv_layer=uv_layer, u_tile=1.0, v_tile=1.6)
                twig_anchors.append({
                    "origin": t_ori.lerp(t_end, 0.15),
                    "forward": (t_end - t_ori).normalized(),
                    "length": 1.15 * spread_sc,
                    "width": 1.08 * spread_sc,
                    "tier_t": sub_t * t_val,
                    "dense": fj >= 2 or pitch_d > 50,
                })

            twig_anchors.append({
                "origin": f_mid.lerp(f_tip, 0.12),
                "forward": (f_tip - f_start).normalized(),
                "length": 1.24 * spread_sc,
                "width": 1.16 * spread_sc,
                "tier_t": min(1.0, sub_t + 0.08),
                "dense": True,
            })

    me = bpy.data.meshes.new("SakuraBark")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_bark)
    obj = bpy.data.objects.new("SakuraBark", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj, twig_anchors


def _build_canopy_cards(twig_anchors, mat_card):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Tint")
    rng = random.Random(2521)

    uv_wide = (0.015, 0.03, 0.485, 0.97)
    uv_round = (0.515, 0.03, 0.985, 0.97)

    for a in twig_anchors:
        origin = a["origin"]
        fwd, side, up = basis_from_forward(a["forward"])
        length = a["length"]
        width = a["width"]
        t = a["tier_t"]

        blush = rng.uniform(-0.015, 0.015)
        shade_lo = 0.90 + 0.06 * t
        # Airy sunlit cherry-blossom Tint (prevents dark berry absorption inside shadow bounces)
        t_base = _srgb_rgba(0.99, shade_lo + blush, shade_lo + 0.03)
        t_tip = _srgb_rgba(1.0, min(1.0, 0.98 + blush), 0.99)

        add_cambered_card(
            bm, uv_layer, col_layer,
            origin=origin,
            forward=fwd,
            side=side,
            up=up,
            length=length,
            width=width,
            arch=0.14,
            v_fold=0.07,
            uv_rect=uv_wide,
            tint_base=t_base,
            tint_tip=t_tip,
            cols=3, rows=3,
        )

        for roll_deg in (-48.0, 48.0):
            roll = math.radians(roll_deg + rng.uniform(-7.0, 7.0))
            c_r, s_r = math.cos(roll), math.sin(roll)
            r_side = (side * c_r + up * s_r).normalized()
            r_up = r_side.cross(fwd).normalized()
            if r_up.z < 0:
                r_side = -r_side
                r_up = -r_up
            pitch_fwd = (fwd + r_up * 0.14).normalized()
            pf, ps, pu = basis_from_forward(pitch_fwd, up_hint=r_up)
            add_cambered_card(
                bm, uv_layer, col_layer,
                origin=origin + fwd * (length * 0.06),
                forward=pf,
                side=ps,
                up=pu,
                length=length * 0.94,
                width=width * 0.88,
                arch=0.11,
                v_fold=0.05,
                uv_rect=uv_round if roll_deg > 0 else uv_wide,
                tint_base=t_base,
                tint_tip=t_tip,
                cols=3, rows=2,
            )

        if a["dense"]:
            cap_fwd = (fwd * 0.55 + Vector((0, 0, 0.83))).normalized()
            cf, cs, cu = basis_from_forward(cap_fwd)
            add_cambered_card(
                bm, uv_layer, col_layer,
                origin=origin + Vector((0, 0, 0.08)),
                forward=cf,
                side=cs,
                up=cu,
                length=length * 0.86,
                width=width * 0.92,
                arch=0.13,
                v_fold=0.06,
                uv_rect=uv_round,
                tint_base=_srgb_rgba(0.99, 0.92, 0.95),
                tint_tip=_srgb_rgba(1.0, 0.98, 0.99),
                cols=2, rows=2,
            )

    me = bpy.data.meshes.new("canopy-foliage")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_card)

    canopy_empty = bpy.data.objects.new("canopy", None)
    bpy.context.scene.collection.objects.link(canopy_empty)
    obj = bpy.data.objects.new("canopy-foliage", me)
    obj.parent = canopy_empty
    bpy.context.scene.collection.objects.link(obj)
    return canopy_empty, obj


def _normalize_bounds(objs):
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        if o.type != "MESH":
            continue
        mw = o.matrix_world
        for v in o.data.vertices:
            pts.append(mw @ v.co)
    min_x = min(p.x for p in pts)
    max_x = max(p.x for p in pts)
    min_y = min(p.y for p in pts)
    max_y = max(p.y for p in pts)
    min_z = min(p.z for p in pts)
    max_z = max(p.z for p in pts)

    cur_w = max_x - min_x
    cur_d = max_y - min_y
    cur_h = max_z - min_z
    cx = 0.5 * (min_x + max_x)
    cy = 0.5 * (min_y + max_y)

    sx = TARGET_W / cur_w
    sy = TARGET_D / cur_d
    sz = TARGET_H / cur_h

    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            v.co.x = (v.co.x - cx) * sx
            v.co.y = (v.co.y - cy) * sy
            v.co.z = (v.co.z - min_z) * sz + MIN_Z_TARGET
        o.data.update()


def _generate_cherry_bark_textures(out_dir: str, size: int = 512, seed: int = 2504):
    """Satin warm cherry bark (Prunus) with short horizontal lenticel streaks — zero diagonal spiraling."""
    os.makedirs(out_dir, exist_ok=True)
    alb_path = os.path.join(out_dir, "bark_albedo.png")
    nrm_path = os.path.join(out_dir, "bark_normal.png")

    u = np.linspace(0.0, 2.0 * math.pi, size, endpoint=False, dtype=np.float32)[None, :]
    v = np.linspace(0.0, 2.0 * math.pi, size, endpoint=False, dtype=np.float32)[:, None]

    # Soft vertical wood satin sheen + subtle broad vertical clefts
    grain = 0.50 + 0.14 * np.sin(u * 4.0 + 0.4 * np.sin(v * 2.0)) + 0.08 * np.sin(u * 11.0 + 0.6 * np.sin(v * 3.0))
    # Authentic short horizontal Prunus lenticel streaks (parallel to circumference U, staggered in U & V!)
    rng = np.random.default_rng(seed)
    lenticel = np.zeros((size, size), dtype=np.float32)
    h_field = grain.copy()
    for _ in range(95):
        cy = int(rng.integers(0, size))
        cx = int(rng.integers(0, size))
        hl = int(rng.integers(14, 42))
        hh = int(rng.integers(2, 5))
        yy = (np.arange(cy - hh, cy + hh + 1) % size)[:, None]
        xx = (np.arange(cx - hl, cx + hl + 1) % size)[None, :]
        dy = (np.arange(-hh, hh + 1)[:, None]) / max(1.0, float(hh))
        dx = (np.arange(-hl, hl + 1)[None, :]) / max(1.0, float(hl))
        w = np.clip(1.0 - (dx * dx * 0.9 + dy * dy * 1.1), 0.0, 1.0) ** 1.6
        lenticel[yy, xx] = np.maximum(lenticel[yy, xx], w * rng.uniform(0.55, 0.95))

    h_detail = np.clip(h_field - lenticel * 0.10, 0.0, 1.0)

    c_low = np.array((0.45, 0.27, 0.23), dtype=np.float32)[None, None, :]
    c_hi = np.array((0.65, 0.44, 0.36), dtype=np.float32)[None, None, :]
    c_len = np.array((0.76, 0.56, 0.45), dtype=np.float32)[None, None, :]
    rgb = c_low * (1.0 - h_detail[:, :, None]) + c_hi * h_detail[:, :, None]
    rgb = rgb * (1.0 - lenticel[:, :, None] * 0.65) + c_len * (lenticel[:, :, None] * 0.65)

    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0.0, 1.0)
    img_a = bpy.data.images.new("_CherryBarkAlbedo", size, size, alpha=False)
    img_a.pixels.foreach_set(rgba.ravel())
    img_a.filepath_raw = alb_path
    img_a.file_format = "PNG"
    img_a.save()

    h_bump = grain * 0.35 + lenticel * 0.55
    dh_dx = (np.roll(h_bump, -1, axis=1) - np.roll(h_bump, 1, axis=1)) * 0.9
    dh_dy = (np.roll(h_bump, -1, axis=0) - np.roll(h_bump, 1, axis=0)) * 0.9
    nx, ny, nz = -dh_dx, -dh_dy, np.ones_like(dh_dx)
    inv = 1.0 / np.maximum(np.sqrt(nx * nx + ny * ny + nz * nz), 1e-5)
    n_rgba = np.ones((size, size, 4), dtype=np.float32)
    n_rgba[:, :, 0] = nx * inv * 0.5 + 0.5
    n_rgba[:, :, 1] = ny * inv * 0.5 + 0.5
    n_rgba[:, :, 2] = nz * inv * 0.5 + 0.5
    img_n = bpy.data.images.new("_CherryBarkNormal", size, size, alpha=False)
    img_n.colorspace_settings.name = "Non-Color"
    img_n.pixels.foreach_set(n_rgba.ravel())
    img_n.filepath_raw = nrm_path
    img_n.file_format = "PNG"
    img_n.save()
    bpy.data.images.remove(img_a)
    bpy.data.images.remove(img_n)
    return alb_path, nrm_path


def main():
    albedo_path, normal_path = bake_sprig_atlas(
        _build_master_sakura_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=16,
        ao_distance=0.10,
        ao_strength=0.14,
        alpha_boost=0.84,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = _generate_cherry_bark_textures(out_dir=SCRIPT_DIR, size=512, seed=2504)
    mat_bark = make_textured_bark_material(
        "SakuraBark",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.76,
        normal_strength=0.45,
    )
    mat_card = make_leaf_card_material(
        "SakuraBlossoms",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.58,
        normal_strength=0.56,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.14

    obj_bark, twig_anchors = _build_cherry_skeleton(mat_bark)
    canopy_empty, obj_canopy = _build_canopy_cards(twig_anchors, mat_card)

    _normalize_bounds([obj_bark, obj_canopy])
    apply_radial_canopy_normals(
        obj_canopy.data,
        center=Vector((0.0, 0.0, 2.35)),
        sky_bias=0.78,
        blend_geom=0.12,
    )

    bpy.context.view_layer.update()
    pts = []
    tris = 0
    for o in (obj_bark, obj_canopy):
        for v in o.data.vertices:
            pts.append(v.co)
        tris += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)

    w = max(p.x for p in pts) - min(p.x for p in pts)
    d = max(p.y for p in pts) - min(p.y for p in pts)
    h = max(p.z for p in pts) - min(p.z for p in pts)
    mz = min(p.z for p in pts)
    print(f"PINK_V4_BOUNDS w={w:.4f} d={d:.4f} h={h:.4f} minZ={mz:.4f} tris={tris}")

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
