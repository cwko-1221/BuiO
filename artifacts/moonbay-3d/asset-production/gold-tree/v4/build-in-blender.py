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

ASSET_NAME = "gold-tree"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 5.30
TARGET_D = 5.30
TARGET_H = 6.10
MIN_Z_TARGET = -0.05


def _srgb_rgba(r, g, b, a=1.0):
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.64, spec=0.14):
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


def _add_ginkgo_golden_leaf(bm, col_layer, petiole_base: Vector, dir_v: Vector, length: float, width: float, tilt_up: Vector, col_base, col_mid, col_tip):
    """
    Sculpts an iconic fan-lobed / scalloped golden Ginkgo-Elm leaf with slender petiole stem
    bridging cleanly from the brown twig and central delicate bilobed notch at the sunlit outer rim.
    """
    d = dir_v.normalized()
    side = d.cross(tilt_up)
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()

    pet_len = length * 0.20
    blade_start = petiole_base + d * (pet_len * 0.85)
    blade_len = length * 0.80

    # Slender physical golden-brown petiole stem
    pv0 = bm.verts.new(petiole_base - side * (width * 0.032))
    pv1 = bm.verts.new(petiole_base + side * (width * 0.032))
    pv2 = bm.verts.new(blade_start + side * (width * 0.024))
    pv3 = bm.verts.new(blade_start - side * (width * 0.024))
    pf = bm.faces.new((pv0, pv1, pv2, pv3))
    pf.smooth = True
    p_col = _srgb_rgba(0.62, 0.45, 0.21)
    for lp in pf.loops:
        lp[col_layer] = p_col

    # Broad fan profile tapering out gracefully to two fluted rounded outer lobes + notched sinus center!
    # (t_mid, half_w_fac, arch_z, edge_lift)
    rows = []
    stations = [
        (0.00, 0.08, 0.000, 0.001),
        (0.24, 0.42, 0.008, 0.005),
        (0.52, 0.78, 0.014, 0.008),
        (0.76, 1.00, 0.012, 0.010),
        (0.92, 0.86, 0.004, 0.006),
    ]
    for t, wf, az, el in stations:
        c = blade_start + d * (blade_len * t) + up * az
        hw = width * 0.5 * wf
        vl = bm.verts.new(c - side * hw + up * el)
        vc = bm.verts.new(c)
        vr = bm.verts.new(c + side * hw + up * el)
        rows.append((vl, vc, vr, t))

    # Apex notch: center dips back to t=0.86 while left & right lobes peak forward at t=1.02!
    c_sinus = bm.verts.new(blade_start + d * (blade_len * 0.88) + up * 0.002)
    l_peak = bm.verts.new(blade_start + d * (blade_len * 1.03) - side * (width * 0.26) + up * 0.004)
    r_peak = bm.verts.new(blade_start + d * (blade_len * 1.03) + side * (width * 0.26) + up * 0.004)

    for i in range(len(rows) - 1):
        l0, m0, r0, t0 = rows[i]
        l1, m1, r1, t1 = rows[i + 1]
        c0 = col_base if t0 < 0.35 else col_mid
        ce0 = col_mid if t0 < 0.6 else col_tip
        c1 = col_mid if t1 < 0.7 else col_tip
        ce1 = col_tip

        fl = bm.faces.new((l0, l1, m1, m0))
        fl.smooth = True
        for lp, cc in zip(fl.loops, (ce0, ce1, c1, c0)):
            lp[col_layer] = cc

        fr = bm.faces.new((m0, m1, r1, r0))
        fr.smooth = True
        for lp, cc in zip(fr.loops, (c0, c1, ce1, ce0)):
            lp[col_layer] = cc

    le, me, re, _ = rows[-1]
    for f_verts in ((le, l_peak, c_sinus, me), (me, c_sinus, r_peak, re)):
        f = bm.faces.new(f_verts)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = col_tip


def _build_master_gold_sprig_scene(scene):
    """
    Bakes 2 intricate luminous golden-amber Ginkgo-Beech branchlets (`1024x1024` RGBA + Tangent Normal):
      Rich saffron-gold tips -> luminous marigold mid-blade -> warm honey-ochre base -> chestnut twigs.
    """
    rng = random.Random(2401)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    bark_dark = _srgb_rgba(0.46, 0.31, 0.19)
    bark_mid = _srgb_rgba(0.59, 0.41, 0.25)

    def add_gold_sprig(cx: float, wide_mode: bool):
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

                # Clusters of 2-3 golden fan leaves fanning from short spur buds!
                angles = [-1.0, 1.0]
                if i == n_nodes - 1:
                    angles.append(0.0)
                for sgn in angles:
                    ang = rng.uniform(-0.18, 0.18) if sgn == 0.0 else math.radians(sgn * rng.uniform(32.0, 62.0))
                    pitch_z = rng.uniform(0.04, 0.22)
                    d_leaf = (tang_xy * math.cos(ang) + perp * math.sin(ang) + Vector((0, 0, pitch_z))).normalized()
                    roll = rng.uniform(-0.42, 0.42)
                    tilt_up = Vector((math.sin(roll) * d_leaf.y, -math.sin(roll) * d_leaf.x, math.cos(roll))).normalized()

                    l_len = rng.uniform(0.22, 0.30) * sc * (0.94 if not wide_mode else 1.0)
                    tip_x = p.x + d_leaf.x * l_len
                    if tip_x < slot_min or tip_x > slot_max:
                        max_dx = abs((slot_min if tip_x < slot_min else slot_max) - p.x)
                        if abs(d_leaf.x) > 1e-4:
                            l_len = min(l_len, (max_dx / abs(d_leaf.x)) * 0.94)
                    tip_y = p.y + d_leaf.y * l_len
                    if tip_y > y_top_limit and d_leaf.y > 1e-4:
                        l_len = min(l_len, (y_top_limit - p.y) / d_leaf.y * 0.94)
                    if l_len < 0.13:
                        continue
                    l_wid = l_len * rng.uniform(0.64, 0.78)

                    # Bright luminous Moonbay Golden-Marigold-Saffron palette (`#b9a82d` spirit without muddy olive)
                    sh = 0.96 + 0.12 * t + rng.uniform(-0.03, 0.04)
                    z_off = 0.014 * sgn + rng.uniform(-0.01, 0.025)
                    if sgn == 0.0 or t > 0.68:
                        c_b = _srgb_rgba(0.84 * sh, 0.66 * sh, 0.21 * sh)
                        c_m = _srgb_rgba(0.93 * sh, 0.79 * sh, 0.26 * sh)
                        c_t = _srgb_rgba(0.98 * sh, 0.89 * sh, 0.36 * sh)
                    else:
                        c_b = _srgb_rgba(0.77 * sh, 0.59 * sh, 0.18 * sh)
                        c_m = _srgb_rgba(0.88 * sh, 0.72 * sh, 0.22 * sh)
                        c_t = _srgb_rgba(0.95 * sh, 0.84 * sh, 0.30 * sh)

                    _add_ginkgo_golden_leaf(
                        bm, col_layer, p + Vector((0, 0, z_off)),
                        d_leaf, l_len, l_wid, tilt_up, c_b, c_m, c_t,
                    )

    add_gold_sprig(-0.50, wide_mode=True)
    add_gold_sprig(+0.50, wide_mode=False)

    me = bpy.data.meshes.new("GoldLeafSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("GoldLeafAlbedo", roughness=0.64, spec=0.14)
    me.materials.append(mat)
    obj = bpy.data.objects.new("GoldLeafSprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _trunk_curve(t: float) -> Vector:
    z = -0.05 + t * 2.40
    x = math.sin(t * math.pi * 1.1) * 0.10 - 0.03 * t
    y = math.cos(t * math.pi * 0.9) * 0.05 - 0.04 * (1.0 - t)
    return Vector((x, y, z))


def _trunk_radius(t: float) -> float:
    flare = 0.135 * math.exp(-t * 9.5)
    core = 0.245 * ((1.0 - 0.42 * t) ** 0.78)
    return core + flare


def _build_gold_skeleton(mat_bark):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Col")

    # 1. Tall graceful vase-form fluted trunk (`z = -0.05..2.35m`)
    n_rings = 16
    n_segs = 14
    rings = []
    for ri in range(n_rings):
        t = ri / (n_rings - 1)
        c = _trunk_curve(t)
        base_r = _trunk_radius(t)
        root_amp = 0.34 * math.exp(-t * 8.2)
        twist = t * 0.28
        ring = []
        for si in range(n_segs):
            ang = (2.0 * math.pi * si) / n_segs
            lobe = math.sin(ang * 5.0 + twist + 0.2) * root_amp
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
            uvs = [(u0 * 2.4, t0 * 2.5), (u1_adj * 2.4, t0 * 2.5), (u1_adj * 2.4, t1 * 2.5), (u0 * 2.4, t1 * 2.5)]
            for loop, tt, aa, uv_c in zip(f.loops, (t0, t0, t1, t1), (a0, a1, a1, a0), uvs):
                loop[uv_layer].uv = uv_c
                moss = math.exp(-tt * 7.5)
                fur = 0.90 + 0.12 * math.sin(aa * 5.0 + tt * 5.0)
                loop[col_layer] = _srgb_rgba((0.95 - 0.14 * moss) * fur, (0.94 - 0.08 * moss) * fur, (0.91 - 0.18 * moss) * fur)

    cap_b = bm.faces.new([v for v, _, _ in rings[0][0]][::-1])
    for lp in cap_b.loops:
        lp[col_layer] = _srgb_rgba(0.80, 0.78, 0.72)
        lp[uv_layer].uv = (0.5, 0.0)
    bmesh.ops.triangulate(bm, faces=[cap_b])

    cap_t = bm.faces.new([v for v, _, _ in rings[-1][0]])
    for lp in cap_t.loops:
        lp[col_layer] = _srgb_rgba(0.95, 0.94, 0.92)
        lp[uv_layer].uv = (0.5, 1.0)
    bmesh.ops.triangulate(bm, faces=[cap_t])

    # 2. Majestic Ascending Golden Crown Limbs & Twigs (`[5.30, 5.30, 6.10]` sweeping vase-dome silhouette)
    crown_base = _trunk_curve(0.95)
    rng = random.Random(2411)
    bark_cols = [_srgb_rgba(0.92, 0.90, 0.88), _srgb_rgba(0.96, 0.94, 0.92), _srgb_rgba(1.0, 0.98, 0.96), _srgb_rgba(1.0, 0.99, 0.97)]
    twig_anchors = []

    limb_specs = [
        (0.10, 32.0, 1.85, 0.148, 1.00, 0.86),
        (1.15, 36.0, 1.82, 0.146, 0.98, 0.88),
        (2.20, 34.0, 1.84, 0.148, 0.99, 0.86),
        (3.25, 30.0, 1.82, 0.145, 0.98, 0.85),
        (4.30, 35.0, 1.80, 0.142, 0.96, 0.89),
        (5.35, 38.0, 1.78, 0.140, 0.96, 0.90),
        (0.65, 76.0, 1.92, 0.132, 0.95, 0.99),  # soaring golden apex limb reaching ~6.05m
        (3.80, 72.0, 1.80, 0.126, 0.92, 0.97),  # secondary interior crown dome support
    ]

    for li, (yaw, pitch_d, length, r0, spread_sc, t_val) in enumerate(limb_specs):
        pitch = math.radians(pitch_d + rng.uniform(-3.0, 3.0))
        d_lim = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p0 = crown_base - Vector((0, 0, 0.14 if pitch_d < 55 else 0.02)) + Vector((math.cos(yaw)*0.06, math.sin(yaw)*0.06, 0))
        p1 = p0 + d_lim * (length * 0.42) + Vector((0, 0, 0.12))
        p2 = p0 + d_lim * (length * 0.82) + Vector((0, 0, 0.05))
        p3 = p0 + d_lim * length + Vector((0, 0, 0.12))
        _add_tapered_tube(bm, col_layer, [p0, p1, p2, p3], [r0, r0 * 0.72, r0 * 0.48, 0.028], bark_cols, segs=7, uv_layer=uv_layer, u_tile=1.4, v_tile=1.8)

        fwd_l, side_l, up_l = basis_from_forward(p3 - p1)
        fork_defs = [
            (-0.54, 14.0, 1.06 * spread_sc, 0.046, 0.78, 0.44),
            (+0.52, 16.0, 1.04 * spread_sc, 0.045, 0.80, 0.48),
            (0.05,  38.0, 0.94 * spread_sc, 0.042, 0.92, 0.72),
            (-0.16, 56.0, 0.88 * spread_sc, 0.036, 0.94, 0.20),
        ]
        for fj, (f_yaw, f_pitch_d, f_len, f_r, sub_t, start_frac) in enumerate(fork_defs):
            fp_pitch = math.radians(f_pitch_d + rng.uniform(-4.0, 4.0))
            fd = (fwd_l * math.cos(f_yaw) + side_l * math.sin(f_yaw) + up_l * math.sin(fp_pitch)).normalized()
            f_start = p1.lerp(p3, start_frac)
            f_mid = f_start + fd * (f_len * 0.52) + Vector((0, 0, 0.08))
            f_tip = f_start + fd * f_len + Vector((0, 0, 0.14))
            _add_tapered_tube(bm, col_layer, [f_start, f_mid, f_tip], [f_r, f_r * 0.62, 0.014], bark_cols[1:], segs=6, uv_layer=uv_layer, u_tile=1.0, v_tile=1.8)

            for sgn in (-1.0, 1.0):
                tf, ts, tu = basis_from_forward(f_tip - f_start)
                t_ang = sgn * rng.uniform(0.44, 0.70)
                td = (tf * math.cos(t_ang) + ts * math.sin(t_ang) + Vector((0, 0, rng.uniform(0.08, 0.28)))).normalized()
                t_ori = f_start.lerp(f_mid, 0.42 if sgn < 0 else 0.74)
                t_end = t_ori + td * (0.64 * spread_sc)
                _add_tapered_tube(bm, col_layer, [t_ori, (t_ori + t_end) * 0.5 + Vector((0, 0, 0.04)), t_end], [0.021, 0.013, 0.007], bark_cols[1:], segs=5, uv_layer=uv_layer, u_tile=1.0, v_tile=1.6)
                twig_anchors.append({
                    "origin": t_ori.lerp(t_end, 0.16),
                    "forward": (t_end - t_ori).normalized(),
                    "length": 1.15 * spread_sc,
                    "width": 1.08 * spread_sc,
                    "tier_t": sub_t * t_val,
                    "dense": fj >= 2 or pitch_d > 55,
                })

            twig_anchors.append({
                "origin": f_mid.lerp(f_tip, 0.12),
                "forward": (f_tip - f_start).normalized(),
                "length": 1.24 * spread_sc,
                "width": 1.16 * spread_sc,
                "tier_t": min(1.0, sub_t + 0.08),
                "dense": True,
            })

    me = bpy.data.meshes.new("GoldBark")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_bark)
    obj = bpy.data.objects.new("GoldBark", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj, twig_anchors


def _build_canopy_cards(twig_anchors, mat_card):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Tint")
    rng = random.Random(2421)

    uv_wide = (0.015, 0.03, 0.485, 0.97)
    uv_round = (0.515, 0.03, 0.985, 0.97)

    for a in twig_anchors:
        origin = a["origin"]
        fwd, side, up = basis_from_forward(a["forward"])
        length = a["length"]
        width = a["width"]
        t = a["tier_t"]

        warm = rng.uniform(-0.02, 0.02)
        shade_lo = 0.92 + 0.06 * t
        t_base = _srgb_rgba(min(1.0, shade_lo + 0.04 + warm), shade_lo, max(0.0, shade_lo - 0.04))
        t_tip = _srgb_rgba(1.0, min(1.0, 0.99 + warm), 0.93)

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
                tint_base=_srgb_rgba(0.96, 0.94, 0.86),
                tint_tip=_srgb_rgba(1.0, 0.99, 0.92),
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


def main():
    albedo_path, normal_path = bake_sprig_atlas(
        _build_master_gold_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=16,
        ao_distance=0.12,
        ao_strength=0.16,
        alpha_boost=0.84,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=512,
        ridge_srgb=(0.60, 0.45, 0.33),
        fissure_srgb=(0.37, 0.27, 0.19),
        plate_freq_x=9.0,
        plate_freq_y=4.0,
        normal_amp=1.6,
        seed=2404,
    )
    mat_bark = make_textured_bark_material(
        "GoldBark",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.84,
        normal_strength=0.70,
    )
    mat_card = make_leaf_card_material(
        "GoldLeaves",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.64,
        normal_strength=0.56,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.14

    obj_bark, twig_anchors = _build_gold_skeleton(mat_bark)
    canopy_empty, obj_canopy = _build_canopy_cards(twig_anchors, mat_card)

    _normalize_bounds([obj_bark, obj_canopy])
    apply_radial_canopy_normals(
        obj_canopy.data,
        center=Vector((0.0, 0.0, 2.55)),
        sky_bias=0.75,
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
    print(f"GOLD_V4_BOUNDS w={w:.4f} d={d:.4f} h={h:.4f} minZ={mz:.4f} tris={tris}")

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
