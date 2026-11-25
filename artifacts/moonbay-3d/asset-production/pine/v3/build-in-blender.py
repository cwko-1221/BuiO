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
    apply_radial_canopy_normals,
)

ASSET_NAME = "pine"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 3.15
TARGET_D = 3.15
TARGET_H = 5.75
MIN_Z_TARGET = -0.05


def _srgb_rgba(r, g, b, a=1.0):
    """Ensure clamped sRGB tuple in [0, 1] for Blender BYTE_COLOR loop layers."""
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.68, spec=0.22):
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


def _add_tapered_tube(bm, col_layer, pts, radii, colors, segs=6):
    rings = []
    n = len(pts)
    prev_up = Vector((0.0, 0.0, 1.0))
    for i, (p, r) in enumerate(zip(pts, radii)):
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
            ring.append(bm.verts.new(p + offset))
        rings.append((ring, colors[i]))

    for i in range(len(rings) - 1):
        r0, c0 = rings[i]
        r1, c1 = rings[i + 1]
        for s in range(segs):
            s2 = (s + 1) % segs
            f = bm.faces.new((r0[s], r0[s2], r1[s2], r1[s]))
            f.smooth = True
            f.loops[0][col_layer] = c0
            f.loops[1][col_layer] = c0
            f.loops[2][col_layer] = c1
            f.loops[3][col_layer] = c1

    tip_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * (radii[-1] * 1.4))
    r_end, c_end = rings[-1]
    for s in range(segs):
        s2 = (s + 1) % segs
        f = bm.faces.new((r_end[s], r_end[s2], tip_v))
        f.smooth = True
        for loop in f.loops:
            loop[col_layer] = c_end


def _add_pine_needle(bm, col_layer, base: Vector, dir_v: Vector, length: float, width: float, bend_z: float, base_col, mid_col, tip_col):
    """Creates a curved tapered 3D pine needle prism with triangular ridge."""
    d = dir_v.normalized()
    up_hint = Vector((0.0, 0.0, 1.0))
    side = d.cross(up_hint)
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()

    p0 = base
    p1 = base + d * (length * 0.45) + up * (bend_z * 0.45)
    p2 = base + d * length + up * bend_z

    w0 = width * 0.52
    w1 = width * 0.39
    h0 = width * 0.34
    h1 = width * 0.24

    v0_l = bm.verts.new(p0 - side * w0)
    v0_r = bm.verts.new(p0 + side * w0)
    v0_t = bm.verts.new(p0 + up * h0)

    v1_l = bm.verts.new(p1 - side * w1)
    v1_r = bm.verts.new(p1 + side * w1)
    v1_t = bm.verts.new(p1 + up * h1)

    v2 = bm.verts.new(p2)

    quads = [
        ((v0_l, v0_t, v1_t, v1_l), (base_col, base_col, mid_col, mid_col)),
        ((v0_t, v0_r, v1_r, v1_t), (base_col, base_col, mid_col, mid_col)),
        ((v0_r, v0_l, v1_l, v1_r), (base_col, base_col, mid_col, mid_col)),
    ]
    for verts, cols in quads:
        f = bm.faces.new(verts)
        f.smooth = True
        for loop, c in zip(f.loops, cols):
            loop[col_layer] = c

    tris = [
        ((v1_l, v1_t, v2), (mid_col, mid_col, tip_col)),
        ((v1_t, v1_r, v2), (mid_col, mid_col, tip_col)),
        ((v1_r, v1_l, v2), (mid_col, mid_col, tip_col)),
    ]
    for verts, cols in tris:
        f = bm.faces.new(verts)
        f.smooth = True
        for loop, c in zip(f.loops, cols):
            loop[col_layer] = c


def _build_master_sprig_scene(scene):
    """
    Builds 2 lush coastal pine sprig masters in clean non-overlapping Ortho halves:
      Left slot  U=[0.02..0.48], V=[0.04..0.96] -> x in [-0.94..-0.04], y in [-0.90..0.90]
      Right slot U=[0.52..0.98], V=[0.04..0.96] -> x in [+0.04..+0.94], y in [-0.90..0.90]
    All vertex colors use bright coastal sRGB values for BYTE_COLOR accuracy!
    """
    rng = random.Random(2613)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    # Warm cinnamon twig & buff needle sheath in sRGB!
    bark_dark = _srgb_rgba(0.36, 0.22, 0.14)
    bark_mid = _srgb_rgba(0.49, 0.31, 0.19)
    sheath_col = _srgb_rgba(0.64, 0.49, 0.33)

    def add_fascicle_cluster(shoot_pts, slot_x_min, slot_x_max, needle_scale=1.0, dense=True, z_lift=0.06):
        n_nodes = 14 if dense else 11
        for i in range(n_nodes):
            t = 0.16 + 0.84 * (i / max(1, n_nodes - 1))
            idx_f = t * (len(shoot_pts) - 1)
            i0 = min(int(idx_f), len(shoot_pts) - 2)
            frac = idx_f - i0
            p = shoot_pts[i0].lerp(shoot_pts[i0 + 1], frac)
            tang = (shoot_pts[i0 + 1] - shoot_pts[i0]).normalized()
            tang_xy = Vector((tang.x, tang.y, 0.0)).normalized()
            perp = Vector((-tang_xy.y, tang_xy.x, 0.0))

            angles = [-1.0, 1.0, -0.45, 0.45] if dense else [-1.0, 1.0]
            if i == n_nodes - 1:
                angles.extend([0.0, -0.25, 0.25, -0.65, 0.65])
            for side_s in angles:
                count_in_fas = 3 if (i > 1 and side_s != 0.0) else 2
                splay_deg = 27.0 + abs(side_s) * 24.0 + rng.uniform(-5.0, 5.0)
                if side_s == 0.0:
                    splay_deg = rng.uniform(-8.0, 8.0)
                base_ang = math.radians(splay_deg * (-1.0 if side_s < 0 else (1.0 if side_s > 0 else 0.0)))
                for k in range(count_in_fas):
                    fan = math.radians((k - (count_in_fas - 1) * 0.5) * 14.0 + rng.uniform(-4.0, 4.0))
                    ang = base_ang + fan
                    n_dir = (tang_xy * math.cos(ang) + perp * math.sin(ang) + Vector((0.0, 0.0, z_lift + rng.uniform(0.08, 0.28)))).normalized()
                    n_origin = p + n_dir * 0.005 + Vector((0.0, 0.0, rng.uniform(-0.005, 0.02)))
                    n_len = (0.132 + 0.056 * (1.0 - 0.35 * t) + rng.uniform(-0.015, 0.02)) * needle_scale
                    # Prevent crossing the central atlas seam between left & right sprigs!
                    tip_x = n_origin.x + n_dir.x * n_len
                    if tip_x < slot_x_min or tip_x > slot_x_max:
                        max_dx = abs((slot_x_min if tip_x < slot_x_min else slot_x_max) - n_origin.x)
                        if abs(n_dir.x) > 1e-4:
                            n_len = min(n_len, max_dx / abs(n_dir.x) * 0.94)
                    if n_len < 0.055:
                        continue
                    n_wid = (0.0132 + rng.uniform(-0.0012, 0.0016)) * needle_scale

                    # Vibrant Mediterranean maritime pine palette (sRGB values!)
                    shade = 0.85 + 0.22 * t + rng.uniform(-0.05, 0.06)
                    is_tip = t > 0.72
                    b_c = sheath_col if k == 0 else _srgb_rgba(0.14 * shade, 0.34 * shade, 0.17 * shade)
                    m_c = _srgb_rgba(0.21 * shade, 0.48 * shade, 0.24 * shade)
                    if is_tip:
                        t_c = _srgb_rgba(0.36 * shade, 0.66 * shade, 0.31 * shade)
                    else:
                        t_c = _srgb_rgba(0.28 * shade, 0.58 * shade, 0.28 * shade)
                    _add_pine_needle(
                        bm, col_layer, n_origin, n_dir, n_len, n_wid,
                        bend_z=rng.uniform(0.014, 0.040),
                        base_col=b_c, mid_col=m_c, tip_col=t_c,
                    )

    # --- LEFT SPRIG (center x=-0.50, clamped inside [-0.94, -0.05]) ---
    lx = -0.50
    main_l = [
        Vector((lx, -0.84, 0.0)),
        Vector((lx - 0.015, -0.44, 0.02)),
        Vector((lx + 0.02, -0.02, 0.04)),
        Vector((lx - 0.01, 0.40, 0.06)),
        Vector((lx + 0.01, 0.74, 0.08)),
    ]
    _add_tapered_tube(bm, col_layer, main_l, [0.026, 0.020, 0.015, 0.010, 0.007], [bark_dark, bark_dark, bark_mid, bark_mid, bark_mid], segs=8)
    add_fascicle_cluster(main_l, -0.94, -0.05, needle_scale=0.98, dense=True)

    laterals_left = [
        (Vector((lx - 0.01, -0.50, 0.02)), Vector((lx - 0.18, -0.30, 0.04)), Vector((lx - 0.32, -0.08, 0.06)), 0.015),
        (Vector((lx - 0.01, -0.42, 0.02)), Vector((lx + 0.18, -0.22, 0.04)), Vector((lx + 0.32, -0.01, 0.06)), 0.015),
        (Vector((lx + 0.01, -0.14, 0.03)), Vector((lx - 0.18, 0.08, 0.05)), Vector((lx - 0.34, 0.32, 0.07)), 0.013),
        (Vector((lx + 0.01, -0.06, 0.04)), Vector((lx + 0.19, 0.16, 0.05)), Vector((lx + 0.33, 0.38, 0.07)), 0.013),
        (Vector((lx, 0.24, 0.05)), Vector((lx - 0.14, 0.46, 0.07)), Vector((lx - 0.25, 0.68, 0.09)), 0.010),
        (Vector((lx, 0.28, 0.05)), Vector((lx + 0.14, 0.48, 0.07)), Vector((lx + 0.25, 0.70, 0.09)), 0.010),
    ]
    for p0, p1, p2, r0 in laterals_left:
        _add_tapered_tube(bm, col_layer, [p0, p1, p2], [r0, r0 * 0.68, 0.005], [bark_dark, bark_mid, bark_mid], segs=6)
        add_fascicle_cluster([p0, p1, p2], -0.94, -0.05, needle_scale=0.90, dense=True)

    # --- RIGHT SPRIG (center x=+0.50, clamped inside [+0.05, +0.94]) ---
    rx = 0.50
    main_r = [
        Vector((rx, -0.82, 0.0)),
        Vector((rx + 0.01, -0.38, 0.02)),
        Vector((rx - 0.01, 0.08, 0.05)),
        Vector((rx + 0.01, 0.52, 0.07)),
        Vector((rx, 0.78, 0.09)),
    ]
    _add_tapered_tube(bm, col_layer, main_r, [0.023, 0.017, 0.013, 0.009, 0.006], [bark_dark, bark_dark, bark_mid, bark_mid, bark_mid], segs=8)
    add_fascicle_cluster(main_r, 0.05, 0.94, needle_scale=1.02, dense=True, z_lift=0.14)

    laterals_right = [
        (Vector((rx, -0.56, 0.02)), Vector((rx - 0.16, -0.34, 0.05)), Vector((rx - 0.28, -0.05, 0.08)), 0.013),
        (Vector((rx, -0.52, 0.02)), Vector((rx + 0.16, -0.30, 0.05)), Vector((rx + 0.28, -0.02, 0.08)), 0.013),
        (Vector((rx, -0.18, 0.04)), Vector((rx - 0.16, 0.12, 0.06)), Vector((rx - 0.29, 0.44, 0.09)), 0.012),
        (Vector((rx, -0.14, 0.04)), Vector((rx + 0.16, 0.16, 0.06)), Vector((rx + 0.29, 0.46, 0.09)), 0.012),
        (Vector((rx, 0.22, 0.06)), Vector((rx - 0.12, 0.50, 0.08)), Vector((rx - 0.21, 0.74, 0.10)), 0.009),
        (Vector((rx, 0.24, 0.06)), Vector((rx + 0.12, 0.52, 0.08)), Vector((rx + 0.21, 0.75, 0.10)), 0.009),
    ]
    for p0, p1, p2, r0 in laterals_right:
        _add_tapered_tube(bm, col_layer, [p0, p1, p2], [r0, r0 * 0.68, 0.005], [bark_dark, bark_mid, bark_mid], segs=6)
        add_fascicle_cluster([p0, p1, p2], 0.05, 0.94, needle_scale=0.94, dense=True, z_lift=0.12)

    me = bpy.data.meshes.new("PineSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("PineSprigAlbedo", roughness=0.58)
    me.materials.append(mat)
    obj = bpy.data.objects.new("PineSprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _trunk_curve(t: float) -> Vector:
    z = -0.05 + t * 5.20
    x = math.sin(t * math.pi * 1.40) * 0.075 - 0.02 * math.sin(t * math.pi * 2.6)
    y = math.cos(t * math.pi * 1.15) * 0.040 - 0.04 * (1.0 - t)
    return Vector((x, y, z))


def _trunk_radius(t: float) -> float:
    flare = 0.095 * math.exp(-t * 14.0)
    core = 0.195 * ((1.0 - 0.89 * t) ** 0.80)
    return core + flare


def _build_bark_mesh(mat_bark):
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    n_rings = 26
    n_segs = 14
    rings = []
    for ri in range(n_rings):
        t = ri / (n_rings - 1)
        c = _trunk_curve(t)
        base_r = _trunk_radius(t)
        root_amp = 0.34 * math.exp(-t * 10.5)
        bark_amp = 0.052 * (1.0 - 0.4 * t)
        ring = []
        for si in range(n_segs):
            ang = (2.0 * math.pi * si) / n_segs
            root_lobe = math.sin(ang * 5.0 + 0.4) * root_amp
            furrow = math.sin(ang * 7.0 + t * 9.0) * bark_amp
            r = base_r * (1.0 + root_lobe + furrow)
            p = Vector((c.x + math.cos(ang) * r, c.y + math.sin(ang) * r, c.z))
            ring.append((bm.verts.new(p), ang))
        rings.append((ring, t))

    for ri in range(n_rings - 1):
        r0, t0 = rings[ri]
        r1, t1 = rings[ri + 1]
        for si in range(n_segs):
            s2 = (si + 1) % n_segs
            v0, a0 = r0[si]
            v1, a1 = r0[s2]
            v2, _ = r1[s2]
            v3, _ = r1[si]
            f = bm.faces.new((v0, v1, v2, v3))
            f.smooth = True
            for loop, tt, aa in zip(f.loops, (t0, t0, t1, t1), (a0, a1, a1, a0)):
                moss = math.exp(-tt * 9.5)
                fur = 0.88 + 0.14 * math.sin(aa * 7.0 + tt * 9.0)
                # Warm cinnamon coastal cedar bark in sRGB!
                r_col = (0.45 * (1.0 - 0.28 * moss) + 0.04 * tt) * fur
                g_col = (0.29 * (1.0 - 0.12 * moss) + 0.05 * moss + 0.03 * tt) * fur
                b_col = (0.19 * (1.0 - 0.25 * moss) + 0.02 * tt) * fur
                loop[col_layer] = _srgb_rgba(r_col, g_col, b_col)

    bm.faces.new([v for v, _ in rings[0][0]][::-1])

    # 8 staggered overlapping tiers creating a lush conical pine with visible airy wood interior
    branch_anchors = []
    rng = random.Random(2617)

    tiers = [
        # (t_trunk, count, bough_len, pitch_deg, r_base, width_sprig, is_apex, droop_scale)
        (0.25, 5, 1.15, -2.0, 0.060, 0.84, False, 1.0),
        (0.35, 5, 1.12, 4.0,  0.054, 0.82, False, 0.8),
        (0.45, 5, 1.04, 10.0, 0.048, 0.78, False, 0.6),
        (0.55, 5, 0.92, 16.0, 0.042, 0.72, False, 0.45),
        (0.65, 5, 0.78, 22.0, 0.036, 0.66, False, 0.30),
        (0.75, 4, 0.64, 30.0, 0.030, 0.60, True,  0.15),
        (0.84, 4, 0.50, 40.0, 0.024, 0.52, True,  0.05),
        (0.91, 4, 0.36, 52.0, 0.018, 0.44, True,  0.0),
    ]

    bark_cols = [
        _srgb_rgba(0.41, 0.26, 0.17),
        _srgb_rgba(0.46, 0.30, 0.19),
        _srgb_rgba(0.51, 0.33, 0.21),
        _srgb_rgba(0.55, 0.36, 0.23),
    ]

    tier_yaw_offset = 0.20
    for tier_idx, (t_tr, count, b_len, pitch_d, r0, sp_w, is_apex, droop) in enumerate(tiers):
        c_root = _trunk_curve(t_tr)
        for bi in range(count):
            yaw = tier_yaw_offset + (2.0 * math.pi * bi) / count + rng.uniform(-0.22, 0.22)
            pitch = math.radians(pitch_d + rng.uniform(-4.0, 5.0))
            b_dir = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
            radial_xy = Vector((math.cos(yaw), math.sin(yaw), 0.0))
            b_side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
            b_up = b_side.cross(b_dir).normalized()

            p0 = c_root - radial_xy * 0.03 + Vector((0, 0, rng.uniform(-0.03, 0.03)))
            l_cur = b_len * rng.uniform(0.92, 1.08)
            p1 = p0 + b_dir * (l_cur * 0.36) - Vector((0, 0, 0.07 * droop))
            p2 = p0 + b_dir * (l_cur * 0.72) - Vector((0, 0, 0.03 * droop))
            p3 = p0 + b_dir * l_cur + Vector((0, 0, 0.08))

            _add_tapered_tube(bm, col_layer, [p0, p1, p2, p3], [r0, r0 * 0.68, r0 * 0.42, 0.011], bark_cols, segs=6)

            # Secondary forked woody twigs emerging closer inward (`0.22..0.60` along bough)
            for sgn in (-1.0, 1.0):
                t_start = p0.lerp(p2, 0.32 if sgn < 0 else 0.54)
                fork_ang = sgn * rng.uniform(0.45, 0.66)
                f_dir = (b_dir * math.cos(fork_ang) + b_side * math.sin(fork_ang) + Vector((0, 0, 0.14))).normalized()
                f_side = b_up.cross(f_dir).normalized()
                f_up = f_side.cross(f_dir).normalized()
                f_len = l_cur * rng.uniform(0.46, 0.60)
                t_mid = t_start + f_dir * (f_len * 0.52)
                t_tip = t_start + f_dir * f_len + Vector((0, 0, 0.04))
                _add_tapered_tube(
                    bm, col_layer, [t_start, t_mid, t_tip],
                    [r0 * 0.44, r0 * 0.28, 0.008],
                    bark_cols[1:], segs=5,
                )
                # Anchor starts along twig so foliage blends directly into wood without bare gaps
                branch_anchors.append({
                    "origin": t_start.lerp(t_mid, 0.18),
                    "forward": (t_tip - t_start).normalized(),
                    "side": f_side,
                    "up": f_up,
                    "length": f_len * 1.18,
                    "width": sp_w * 0.90,
                    "tier_t": t_tr,
                    "is_apex": is_apex,
                })

            # Primary bough foliage extending from inner-mid bough (`p0.lerp(p1, 0.65)`) past tip!
            tip_dir = (p3 - p1).normalized()
            tip_side = Vector((-tip_dir.y, tip_dir.x, 0.0))
            if tip_side.length < 1e-4:
                tip_side = Vector((1.0, 0.0, 0.0))
            tip_side.normalize()
            tip_up = tip_side.cross(tip_dir).normalized()
            branch_anchors.append({
                "origin": p0.lerp(p1, 0.55),
                "forward": tip_dir,
                "side": tip_side,
                "up": tip_up,
                "length": l_cur * 0.98,
                "width": sp_w * 1.06,
                "tier_t": t_tr,
                "is_apex": is_apex,
            })

        tier_yaw_offset += 0.62

    # Feathered closed coniferous spire apex at top (`z = 4.95 -> 5.75`, NO dark top crater!)
    peak_base = _trunk_curve(0.99)
    # 2 perpendicular crossed central leader spire cards pointing straight up (+Z)
    for ang_deg in (20.0, 110.0):
        ang = math.radians(ang_deg)
        c_fwd = Vector((0.0, 0.0, 1.0))
        c_side = Vector((math.cos(ang), math.sin(ang), 0.0))
        c_up = c_side.cross(c_fwd).normalized()
        branch_anchors.append({
            "origin": peak_base - Vector((0, 0, 0.34)),
            "forward": c_fwd,
            "side": c_side,
            "up": c_up,
            "length": 0.96,
            "width": 0.48,
            "tier_t": 1.0,
            "is_apex": True,
            "is_spire": True,
        })
    # 4 steeply ascending inward-tucked collar twigs forming pointed silhouette around leader
    for k in range(4):
        ang = k * (0.5 * math.pi) + 0.45
        l_dir = Vector((math.cos(ang) * 0.28, math.sin(ang) * 0.28, 0.96)).normalized()
        l_side = Vector((-math.sin(ang), math.cos(ang), 0.0))
        l_up = l_side.cross(l_dir).normalized()
        branch_anchors.append({
            "origin": peak_base - Vector((0, 0, 0.52)) + Vector((math.cos(ang)*0.08, math.sin(ang)*0.08, 0.0)),
            "forward": l_dir,
            "side": l_side,
            "up": l_up,
            "length": 0.72,
            "width": 0.42,
            "tier_t": 0.97,
            "is_apex": True,
            "tip_taper": 0.58,
        })

    me = bpy.data.meshes.new("PineBark")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_bark)
    obj = bpy.data.objects.new("PineBark", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj, branch_anchors


def _build_canopy_cards(branch_anchors, mat_card):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Tint")
    rng = random.Random(2621)

    uv_bough = (0.015, 0.03, 0.485, 0.96)
    uv_apex = (0.515, 0.03, 0.985, 0.96)

    for a in branch_anchors:
        origin = a["origin"]
        fwd = a["forward"]
        side = a["side"]
        up = a["up"]
        length = a["length"]
        width = a["width"]
        t = a["tier_t"]
        uv_rect = uv_apex if a["is_apex"] else uv_bough

        # Crisp sunny coastal tint in sRGB (bright enough so baked greens sing cleanly!)
        warm = rng.uniform(-0.03, 0.04)
        shade_lo = 0.83 + 0.11 * t
        t_base = _srgb_rgba(shade_lo + warm, min(1.0, shade_lo + 0.04), shade_lo - 0.02)
        t_tip = _srgb_rgba(min(1.0, 0.98 + warm), 1.0, 0.96)

        if a.get("is_spire"):
            add_cambered_card(
                bm, uv_layer, col_layer,
                origin=origin,
                forward=fwd,
                side=side,
                up=up,
                length=length,
                width=width,
                arch=0.04,
                v_fold=0.05,
                uv_rect=uv_apex,
                tint_base=t_base,
                tint_tip=t_tip,
                cols=3, rows=3,
                tip_taper=0.38,
            )
            continue

        # Card 0: Main gently arched bough horizontal canopy sheet
        add_cambered_card(
            bm, uv_layer, col_layer,
            origin=origin,
            forward=fwd,
            side=side,
            up=up,
            length=length,
            width=width,
            arch=0.10,
            v_fold=0.065,
            uv_rect=uv_rect,
            tint_base=t_base,
            tint_tip=t_tip,
            cols=3, rows=3,
            tip_taper=a.get("tip_taper", 1.0),
        )

        # Card 1 & 2: Banked +-46 deg lateral sheets for 360-degree depth & fluffy needle silhouette
        for roll_deg in (-46.0, 46.0):
            roll = math.radians(roll_deg + rng.uniform(-6.0, 6.0))
            c_r, s_r = math.cos(roll), math.sin(roll)
            r_side = (side * c_r + up * s_r).normalized()
            r_up = r_side.cross(fwd).normalized()
            pitch_fwd = (fwd + r_up * 0.12).normalized()
            r_up = r_side.cross(pitch_fwd).normalized()
            add_cambered_card(
                bm, uv_layer, col_layer,
                origin=origin + fwd * (length * 0.05),
                forward=pitch_fwd,
                side=r_side,
                up=r_up,
                length=length * 0.94,
                width=width * 0.85,
                arch=0.075,
                v_fold=0.045,
                uv_rect=uv_apex if roll_deg > 0 else uv_rect,
                tint_base=_srgb_rgba(t_base[0] * 0.96, t_base[1] * 0.97, t_base[2] * 0.97),
                tint_tip=t_tip,
                cols=3, rows=2,
            )

        # Card 3: Inner collar tuft wrapping inward toward trunk without creating gaps
        if not a["is_apex"] and t < 0.72:
            sh_fwd = (fwd + Vector((0, 0, 0.30))).normalized()
            sh_side = Vector((-sh_fwd.y, sh_fwd.x, 0.0)).normalized()
            sh_up = sh_side.cross(sh_fwd).normalized()
            add_cambered_card(
                bm, uv_layer, col_layer,
                origin=origin - fwd * (length * 0.10),
                forward=sh_fwd,
                side=sh_side,
                up=sh_up,
                length=length * 0.62,
                width=width * 0.70,
                arch=0.08,
                v_fold=0.04,
                uv_rect=uv_apex,
                tint_base=_srgb_rgba(t_base[0] * 0.92, t_base[1] * 0.95, t_base[2] * 0.93),
                tint_tip=_srgb_rgba(0.95, 0.99, 0.94),
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

    sxy = min(TARGET_W / cur_w, TARGET_D / cur_d)
    if max(cur_w * sxy, cur_d * sxy) > max(TARGET_W, TARGET_D) * 1.04:
        sxy = TARGET_W / max(cur_w, cur_d)
    sz = TARGET_H / cur_h

    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            v.co.x = (v.co.x - cx) * sxy
            v.co.y = (v.co.y - cy) * sxy
            v.co.z = (v.co.z - min_z) * sz + MIN_Z_TARGET
        o.data.update()


def main():
    albedo_path, normal_path = bake_sprig_atlas(
        _build_master_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=16,
        ao_distance=0.13,
        ao_strength=0.28,
        alpha_boost=0.80,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat_bark = _make_vcol_mat("PineBark", roughness=0.84, spec=0.14)
    mat_card = make_leaf_card_material(
        "PineNeedles",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.56,
        normal_strength=0.58,
    )

    bark_obj, branch_anchors = _build_bark_mesh(mat_bark)
    canopy_empty, canopy_obj = _build_canopy_cards(branch_anchors, mat_card)

    _normalize_bounds([bark_obj, canopy_obj])
    apply_radial_canopy_normals(
        canopy_obj.data,
        center=Vector((0.0, 0.0, 2.95)),
        sky_bias=0.50,
        blend_geom=0.20,
    )

    bpy.context.view_layer.update()
    pts = []
    tris = 0
    for o in (bark_obj, canopy_obj):
        for v in o.data.vertices:
            pts.append(v.co)
        tris += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)

    w = max(p.x for p in pts) - min(p.x for p in pts)
    d = max(p.y for p in pts) - min(p.y for p in pts)
    h = max(p.z for p in pts) - min(p.z for p in pts)
    mz = min(p.z for p in pts)
    print(f"PINE_V3_BOUNDS w={w:.4f} d={d:.4f} h={h:.4f} minZ={mz:.4f} tris={tris}")

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
