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

ASSET_NAME = "lavender"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 1.03
TARGET_D = 0.83
TARGET_H = 0.72
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


def _add_lance_leaf(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float, arch: float, col_base, col_tip):
    """Sculpts a narrow silvery-sage linear lavender blade curving gently outward."""
    d = dir_v.normalized()
    side = d.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()

    p0 = origin
    p1_l = origin + d * (length * 0.42) - side * (width * 0.48) + up * arch
    p1_r = origin + d * (length * 0.42) + side * (width * 0.48) + up * arch
    p2_l = origin + d * (length * 0.78) - side * (width * 0.30) + up * (arch * 0.85)
    p2_r = origin + d * (length * 0.78) + side * (width * 0.30) + up * (arch * 0.85)
    p_tip = origin + d * length + up * (arch * 0.30)

    v0 = bm.verts.new(p0)
    v1l = bm.verts.new(p1_l)
    v1r = bm.verts.new(p1_r)
    v2l = bm.verts.new(p2_l)
    v2r = bm.verts.new(p2_r)
    vt = bm.verts.new(p_tip)

    c_mid = tuple(col_base[k] * 0.45 + col_tip[k] * 0.55 for k in range(4))
    for verts, cols in (
        ((v0, v1l, v1r), (col_base, c_mid, c_mid)),
        ((v1l, v2l, v2r, v1r), (c_mid, col_tip, col_tip, c_mid)),
        ((v2l, vt, v2r), (col_tip, col_tip, col_tip)),
    ):
        f = bm.faces.new(verts)
        f.smooth = True
        for lp, cc in zip(f.loops, cols):
            lp[col_layer] = cc


def _add_lavender_floret(bm, col_layer, center: Vector, out_dir: Vector, scale: float, col_calyx, col_petal):
    """Tiny botanical 2-part lavender calyx cup + flaring violet-lilac corolla floret."""
    d = out_dir.normalized()
    side = d.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()

    # Calyx base cup
    vc0 = bm.verts.new(center)
    vc1 = bm.verts.new(center + d * (0.018 * scale) - side * (0.010 * scale) + up * (0.008 * scale))
    vc2 = bm.verts.new(center + d * (0.018 * scale) + side * (0.010 * scale) + up * (0.008 * scale))
    fc = bm.faces.new((vc0, vc1, vc2))
    fc.smooth = True
    for lp in fc.loops:
        lp[col_layer] = col_calyx

    # Flaring lilac bilabiate petal lip
    vp1 = bm.verts.new(center + d * (0.016 * scale) - side * (0.016 * scale) + up * (0.014 * scale))
    vp2 = bm.verts.new(center + d * (0.038 * scale) - side * (0.013 * scale) + up * (0.018 * scale))
    vp3 = bm.verts.new(center + d * (0.038 * scale) + side * (0.013 * scale) + up * (0.018 * scale))
    vp4 = bm.verts.new(center + d * (0.016 * scale) + side * (0.016 * scale) + up * (0.014 * scale))
    fp = bm.faces.new((vp1, vp2, vp3, vp4))
    fp.smooth = True
    for lp in fp.loops:
        lp[col_layer] = col_petal


def _build_master_lavender_sprig_scene(scene):
    """
    Bakes 2 distinct Lavandula angustifolia botanical sprays (`1024x1024` RGBA + Tangent Normal):
      Left slot: Tall upright multi-stalk flowering lavender spray with silver-sage narrow basal leaves,
                 slender square green flower peduncles, and tiered whorled violet-amethyst florets.
      Right slot: Dense arching basal silvery-sage foliage collar with budding & half-blooming stems!
    """
    rng = random.Random(2901)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    stem_dark = _srgb_rgba(0.32, 0.45, 0.25)
    stem_tip = _srgb_rgba(0.46, 0.60, 0.36)

    def add_floral_spike_stalk(origin: Vector, tip_pos: Vector, mid_ctrl: Vector, bloom_frac: float, rad: float, slot_min: float, slot_max: float):
        pts = [
            origin,
            origin.lerp(mid_ctrl, 0.50),
            mid_ctrl,
            mid_ctrl.lerp(tip_pos, 0.55),
            tip_pos,
        ]
        _add_tapered_tube(
            bm, col_layer, pts,
            [rad, rad * 0.85, rad * 0.72, rad * 0.55, rad * 0.38],
            [stem_dark, stem_dark, stem_tip, stem_tip, _srgb_rgba(0.56, 0.46, 0.68)],
            segs=5,
        )

        # Narrow opposite basal/lower stem leaves (silvery-sage lanceolate blades)
        for li in range(5):
            t_l = 0.08 + 0.09 * li
            p_l = origin.lerp(mid_ctrl, min(1.0, t_l * 2.0))
            d_s = (tip_pos - origin).normalized()
            d_xy = Vector((d_s.x, d_s.y, 0.0))
            if d_xy.length < 1e-4:
                d_xy = Vector((0.0, 1.0, 0.0))
            d_xy.normalize()
            perp = Vector((-d_xy.y, d_xy.x, 0.0))
            for sgn in (-1.0, 1.0):
                lang = math.radians(sgn * rng.uniform(28.0, 52.0))
                ld = (d_xy * math.cos(lang) + perp * math.sin(lang)).normalized()
                llen = rng.uniform(0.14, 0.21) * (1.0 - 0.12 * li)
                lwid = rng.uniform(0.024, 0.033)
                est_x = p_l.x + ld.x * llen
                if est_x < slot_min or est_x > slot_max:
                    llen *= 0.65
                _add_lance_leaf(
                    bm, col_layer, p_l, ld, llen, lwid, arch=0.012,
                    col_base=_srgb_rgba(0.35, 0.50, 0.28),
                    col_tip=_srgb_rgba(0.54, 0.69, 0.46),
                )

        # Whorled flower spike verticillasters along upper half!
        n_whorls = int(7 + bloom_frac * 3)
        start_t = 0.46 if bloom_frac > 0.8 else 0.54
        for wi in range(n_whorls):
            wt = start_t + (0.98 - start_t) * (wi / max(1, n_whorls - 1))
            idx_f = wt * (len(pts) - 1)
            i0 = min(int(idx_f), len(pts) - 2)
            frac = idx_f - i0
            wp = pts[i0].lerp(pts[i0 + 1], frac)
            tang = (pts[i0 + 1] - pts[i0]).normalized()
            tang_xy = Vector((tang.x, tang.y, 0.0)).normalized()
            perp = Vector((-tang_xy.y, tang_xy.x, 0.0))

            # Taper whorl size toward the bud apex; plumper florets read rich & velvety at distance
            apex_scale = 1.28 - 0.36 * ((wi / max(1, n_whorls - 1)) ** 1.25)
            n_florets = 5 if wi < n_whorls - 1 else 3
            for fi in range(n_florets):
                ang = (fi - (n_florets - 1) * 0.5) * 0.78 + rng.uniform(-0.16, 0.16)
                fdir = (tang_xy * 0.55 + perp * math.sin(ang) * 0.95 + Vector((0, 0, 0.45))).normalized()
                foff = perp * (math.sin(ang) * 0.009) + Vector((0, 0, rng.uniform(0.004, 0.016)))
                fpos = wp + foff
                fpos.x = max(slot_min + 0.03, min(slot_max - 0.03, fpos.x))
                shade = rng.uniform(-0.04, 0.04)
                is_open = (wi >= 1) and (wi < n_whorls - 1 or rng.random() < 0.65)
                calyx_col = _srgb_rgba(0.49 + shade, 0.31 + shade, 0.78)
                petal_col = _srgb_rgba(0.75 + shade, 0.57 + shade, 0.99) if is_open else _srgb_rgba(0.60 + shade, 0.42 + shade, 0.88)
                _add_lavender_floret(bm, col_layer, fpos, fdir, apex_scale * rng.uniform(1.00, 1.32), calyx_col, petal_col)

    # Slot 1 (Left x = -0.50): Radiant Flowering Lavender Bouquet Spray (6 swaying spikes + silvery basal leaves)
    s1_min, s1_max = -0.94, -0.06
    flower_stalks = [
        (Vector((-0.50, -0.86, 0.0)), Vector((-0.52, 0.80, 0.04)), Vector((-0.54, 0.02, 0.02)), 1.0, 0.010),
        (Vector((-0.51, -0.84, 0.0)), Vector((-0.80, 0.64, 0.03)), Vector((-0.68, -0.05, 0.02)), 0.95, 0.009),
        (Vector((-0.49, -0.84, 0.0)), Vector((-0.22, 0.68, 0.03)), Vector((-0.34, -0.04, 0.02)), 0.95, 0.009),
        (Vector((-0.50, -0.82, 0.0)), Vector((-0.68, 0.48, 0.02)), Vector((-0.62, -0.14, 0.01)), 0.85, 0.008),
        (Vector((-0.49, -0.82, 0.0)), Vector((-0.33, 0.50, 0.02)), Vector((-0.39, -0.12, 0.01)), 0.85, 0.008),
        (Vector((-0.50, -0.83, 0.0)), Vector((-0.44, 0.72, 0.03)), Vector((-0.46, -0.04, 0.02)), 0.90, 0.009),
    ]
    for o, t, m, bf, r in flower_stalks:
        add_floral_spike_stalk(o, t, m, bf, r, s1_min, s1_max)

    # Cozy full basal silvery-sage leaf rosette anchored low at -0.84
    for k in range(18):
        ang = math.radians(-82.0 + k * (164.0 / 17.0))
        ld = Vector((math.sin(ang), math.cos(ang), 0.12)).normalized()
        _add_lance_leaf(
            bm, col_layer, Vector((-0.50 + math.sin(ang)*0.025, -0.82, 0.01)), ld,
            rng.uniform(0.24, 0.36), rng.uniform(0.028, 0.040), arch=0.02,
            col_base=_srgb_rgba(0.32, 0.47, 0.25), col_tip=_srgb_rgba(0.56, 0.72, 0.48),
        )

    # Slot 2 (Right x = +0.50): Lush Basal Foliage & Young Spike Cluster
    s2_min, s2_max = 0.06, 0.94
    bud_stalks = [
        (Vector((0.50, -0.86, 0.0)), Vector((0.51, 0.76, 0.04)), Vector((0.48, -0.02, 0.02)), 0.95, 0.010),
        (Vector((0.49, -0.84, 0.0)), Vector((0.24, 0.58, 0.03)), Vector((0.36, -0.10, 0.02)), 0.90, 0.009),
        (Vector((0.51, -0.84, 0.0)), Vector((0.78, 0.60, 0.03)), Vector((0.66, -0.08, 0.02)), 0.90, 0.009),
        (Vector((0.50, -0.82, 0.0)), Vector((0.36, 0.38, 0.02)), Vector((0.42, -0.22, 0.01)), 0.80, 0.008),
        (Vector((0.50, -0.82, 0.0)), Vector((0.65, 0.40, 0.02)), Vector((0.58, -0.20, 0.01)), 0.80, 0.008),
        (Vector((0.50, -0.83, 0.0)), Vector((0.57, 0.64, 0.03)), Vector((0.54, -0.06, 0.02)), 0.85, 0.009),
    ]
    for o, t, m, bf, r in bud_stalks:
        add_floral_spike_stalk(o, t, m, bf, r, s2_min, s2_max)

    for k in range(20):
        ang = math.radians(-84.0 + k * (168.0 / 19.0))
        ld = Vector((math.sin(ang), math.cos(ang), 0.14)).normalized()
        _add_lance_leaf(
            bm, col_layer, Vector((0.50 + math.sin(ang)*0.025, -0.82, 0.01)), ld,
            rng.uniform(0.26, 0.40), rng.uniform(0.030, 0.042), arch=0.022,
            col_base=_srgb_rgba(0.30, 0.45, 0.24), col_tip=_srgb_rgba(0.57, 0.73, 0.49),
        )

    me = bpy.data.meshes.new("LavenderSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("LavenderSprigAlbedo", roughness=0.58, spec=0.14)
    me.materials.append(mat)
    obj = bpy.data.objects.new("LavenderSprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _build_lavender_base_and_cards(mat_bark, mat_card):
    """Builds gnarled low woody sub-shrub stems + 15 fanned arched lavender sprig cards (~700 tris)."""
    rng = random.Random(2911)

    # 1. Low woody Mediterranean sub-shrub base stems anchored to -0.04m
    bm_b = bmesh.new()
    uv_b = bm_b.loops.layers.uv.new("UVMap")
    col_b = bm_b.loops.layers.color.new("Col")
    bark_cols = [_srgb_rgba(0.84, 0.80, 0.74), _srgb_rgba(0.92, 0.88, 0.82), _srgb_rgba(0.96, 0.94, 0.90)]
    anchors = []

    n_stems = 8
    for i in range(n_stems):
        yaw = (2.0 * math.pi * i) / n_stems + rng.uniform(-0.18, 0.18)
        pitch = math.radians(30.0 + (i % 3) * 12.0)
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p_root = Vector((math.cos(yaw) * 0.04, math.sin(yaw) * 0.03, -0.04))
        p0 = Vector((math.cos(yaw) * 0.08, math.sin(yaw) * 0.07, 0.005))
        p1 = p0 + d * 0.085 + Vector((0, 0, 0.02))
        _add_tapered_tube(bm_b, col_b, [p_root, p0, p1], [0.018, 0.013, 0.007], bark_cols, segs=4, uv_layer=uv_b, u_tile=1.0, v_tile=2.0)

        # Nestle foliage cards low so silver-green rosettes hug the earth around woody bases!
        anchors.append({
            "origin": p0.lerp(p1, 0.15),
            "forward": (Vector((math.cos(yaw) * 0.56, math.sin(yaw) * 0.56, 0.83)).normalized()),
            "length": rng.uniform(0.58, 0.67),
            "width": rng.uniform(0.45, 0.54),
            "slot": 0 if (i % 2 == 0) else 1,
            "is_crown": True,
        })

    # 3 taller central flower sprays giving domed mound center
    for j in range(3):
        yaw = j * (2.0 * math.pi / 3.0) + 0.45
        p0 = Vector((math.cos(yaw) * 0.03, math.sin(yaw) * 0.03, 0.005))
        p1 = p0 + Vector((math.cos(yaw) * 0.04, math.sin(yaw) * 0.04, 0.09))
        _add_tapered_tube(bm_b, col_b, [p0 - Vector((0, 0, 0.045)), p0, p1], [0.016, 0.012, 0.007], bark_cols, segs=4, uv_layer=uv_b)
        anchors.append({
            "origin": p0.lerp(p1, 0.15),
            "forward": (Vector((math.cos(yaw) * 0.22, math.sin(yaw) * 0.22, 0.97)).normalized()),
            "length": rng.uniform(0.64, 0.70),
            "width": rng.uniform(0.48, 0.54),
            "slot": 0,
            "is_crown": True,
        })

    me_b = bpy.data.meshes.new("LavenderWood")
    bm_b.to_mesh(me_b)
    bm_b.free()
    me_b.materials.append(mat_bark)
    obj_b = bpy.data.objects.new("LavenderWood", me_b)
    bpy.context.scene.collection.objects.link(obj_b)

    # 2. Build crossed/arched sprig cards (cols=2, rows=3)
    bm_c = bmesh.new()
    uv_c = bm_c.loops.layers.uv.new("UVMap")
    col_c = bm_c.loops.layers.color.new("Tint")
    uv_l = (0.015, 0.03, 0.485, 0.97)
    uv_r = (0.515, 0.03, 0.985, 0.97)

    for idx, a in enumerate(anchors):
        fwd, side, up = basis_from_forward(a["forward"])
        # Twist side axis smoothly around forward so radial vertical cards show full 360 lavender silhouette!
        roll = math.radians(38.0 if (idx % 2 == 0) else -38.0)
        c_r, s_r = math.cos(roll), math.sin(roll)
        r_side = (side * c_r + up * s_r).normalized()
        r_up = r_side.cross(fwd).normalized()

        warm = rng.uniform(-0.02, 0.02)
        t_base = _srgb_rgba(0.90 + warm, 0.94 + warm, 0.92)
        t_tip = _srgb_rgba(1.0, min(1.0, 0.98 + warm), 1.0)

        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=a["origin"],
            forward=fwd,
            side=r_side,
            up=r_up,
            length=a["length"],
            width=a["width"],
            arch=0.05,
            v_fold=0.03,
            uv_rect=uv_l if a["slot"] == 0 else uv_r,
            tint_base=t_base,
            tint_tip=t_tip,
            cols=2, rows=3,
        )

        # Add orthogonal cross-card on central crown tufts so overhead/side views stay fluffy from all angles!
        if a["is_crown"] or (idx % 2 == 0):
            roll2 = roll + math.radians(68.0)
            c2, s2 = math.cos(roll2), math.sin(roll2)
            r2_side = (side * c2 + up * s2).normalized()
            r2_up = r2_side.cross(fwd).normalized()
            add_cambered_card(
                bm_c, uv_c, col_c,
                origin=a["origin"],
                forward=fwd,
                side=r2_side,
                up=r2_up,
                length=a["length"] * 0.96,
                width=a["width"] * 0.92,
                arch=0.04,
                v_fold=0.025,
                uv_rect=uv_r if a["slot"] == 0 else uv_l,
                tint_base=t_base,
                tint_tip=t_tip,
                cols=2, rows=2,
            )

    me_c = bpy.data.meshes.new("LavenderSprigs")
    bm_c.to_mesh(me_c)
    bm_c.free()
    me_c.materials.append(mat_card)
    obj_c = bpy.data.objects.new("LavenderSprigs", me_c)
    bpy.context.scene.collection.objects.link(obj_c)
    return obj_b, obj_c


def _normalize_bounds(objs):
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        if o.type != "MESH":
            continue
        mw = o.matrix_world
        for v in o.data.vertices:
            pts.append(mw @ v.co)
    min_x, max_x = min(p.x for p in pts), max(p.x for p in pts)
    min_y, max_y = min(p.y for p in pts), max(p.y for p in pts)
    min_z, max_z = min(p.z for p in pts), max(p.z for p in pts)

    sx = TARGET_W / (max_x - min_x)
    sy = TARGET_D / (max_y - min_y)
    sz = TARGET_H / (max_z - min_z)
    cx = 0.5 * (min_x + max_x)
    cy = 0.5 * (min_y + max_y)

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
        _build_master_lavender_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=16,
        ao_distance=0.06,
        ao_strength=0.10,
        alpha_boost=0.82,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=256,
        ridge_srgb=(0.56, 0.48, 0.36),
        fissure_srgb=(0.38, 0.31, 0.22),
        plate_freq_x=7.0,
        plate_freq_y=2.5,
        normal_amp=1.0,
        seed=2904,
    )
    mat_bark = make_textured_bark_material(
        "LavenderWood",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.84,
        normal_strength=0.55,
    )
    mat_card = make_leaf_card_material(
        "LavenderSprigs",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.58,
        normal_strength=0.45,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.14
    # Subtle petal translucency so shaded purple spikes stay bright amethyst-lavender
    nt = mat_card.node_tree
    tex_alb = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image.colorspace_settings.name != "Non-Color"), None)
    if tex_alb and "Emission Color" in bsdf.inputs:
        nt.links.new(tex_alb.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.10

    obj_bark, obj_fol = _build_lavender_base_and_cards(mat_bark, mat_card)
    _normalize_bounds([obj_bark, obj_fol])
    apply_radial_canopy_normals(
        obj_fol.data,
        center=Vector((0.0, 0.0, 0.14)),
        sky_bias=1.35,
        blend_geom=0.06,
    )

    bpy.context.view_layer.update()
    pts = [v.co for o in (obj_bark, obj_fol) for v in o.data.vertices]
    tris = sum(max(1, len(p.vertices) - 2) for o in (obj_bark, obj_fol) for p in o.data.polygons)
    print(f"LAVENDER_V1_BOUNDS w={max(p.x for p in pts)-min(p.x for p in pts):.4f} d={max(p.y for p in pts)-min(p.y for p in pts):.4f} h={max(p.z for p in pts)-min(p.z for p in pts):.4f} minZ={min(p.z for p in pts):.4f} tris={tris}")

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
