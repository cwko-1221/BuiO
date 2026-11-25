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

ASSET_NAME = "shrub"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 1.42
TARGET_D = 1.14
TARGET_H = 0.86
MIN_Z_TARGET = -0.055


def _srgb_rgba(r, g, b, a=1.0):
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.58, spec=0.16):
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

    tip_v = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * (radii[-1] * 1.25))
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
            f.loops[2][uv_layer].uv = (0.5 * (u0 + u1_adj) * u_tile, (l_end + 0.04) * v_tile)


def _add_shrub_leaf(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float, tilt: float, col_base, col_mid, col_tip):
    """Sculpts a crisp cambered pointed-oval coastal viburnum/boxwood leaf with central midrib crease."""
    d = dir_v.normalized()
    side = d.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()
    c_t, s_t = math.cos(tilt), math.sin(tilt)
    s_vec = (side * c_t + up * s_t).normalized()
    u_vec = s_vec.cross(d).normalized()

    # Petiole base -> wide shoulder -> tapered tip
    v0 = bm.verts.new(origin + d * (length * 0.04))
    v_ml = bm.verts.new(origin + d * (length * 0.42) - s_vec * (width * 0.48) + u_vec * (length * 0.05))
    v_mc = bm.verts.new(origin + d * (length * 0.42) + u_vec * (length * 0.01))
    v_mr = bm.verts.new(origin + d * (length * 0.42) + s_vec * (width * 0.48) + u_vec * (length * 0.05))

    v_ul = bm.verts.new(origin + d * (length * 0.76) - s_vec * (width * 0.34) + u_vec * (length * 0.035))
    v_uc = bm.verts.new(origin + d * (length * 0.76) + u_vec * (length * 0.01))
    v_ur = bm.verts.new(origin + d * (length * 0.76) + s_vec * (width * 0.34) + u_vec * (length * 0.035))

    v_tip = bm.verts.new(origin + d * length - u_vec * (length * 0.02))

    for verts, cols in (
        ((v0, v_ml, v_mc), (col_base, col_mid, col_base)),
        ((v0, v_mc, v_mr), (col_base, col_base, col_mid)),
        ((v_ml, v_ul, v_uc, v_mc), (col_mid, col_tip, col_mid, col_mid)),
        ((v_mc, v_uc, v_ur, v_mr), (col_mid, col_mid, col_tip, col_mid)),
        ((v_ul, v_tip, v_uc), (col_tip, col_tip, col_mid)),
        ((v_uc, v_tip, v_ur), (col_mid, col_tip, col_tip)),
    ):
        f = bm.faces.new(verts)
        f.smooth = True
        for lp, cc in zip(f.loops, cols):
            lp[col_layer] = cc


def _build_master_shrub_sprig_scene(scene):
    """
    Bakes 2 lush crisp Coastal Shrub Leaf Sprigs (`1024x1024` RGBA + Tangent Normal):
      Forked woody brown-olive twigs dotted with 30+ individual pointed oval chartreuse-olive
      leaves (`0x86a641` coastal mood) and fresh lime terminal buds — zero solid ball blobs!
    """
    rng = random.Random(2801)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    twig_dark = _srgb_rgba(0.45, 0.33, 0.21)
    twig_mid = _srgb_rgba(0.56, 0.44, 0.26)

    def add_sprig(cx: float, sprout_variant: bool):
        slot_min = cx - 0.455
        slot_max = cx + 0.455
        y_top_limit = 0.885

        pts_m = [
            Vector((cx, -0.84, 0.0)),
            Vector((cx - 0.03 if sprout_variant else cx + 0.02, -0.36, 0.02)),
            Vector((cx + 0.03 if sprout_variant else cx - 0.02, 0.14, 0.04)),
            Vector((cx, 0.62, 0.05)),
        ]
        _add_tapered_tube(bm, col_layer, pts_m, [0.020, 0.014, 0.010, 0.006], [twig_dark, twig_dark, twig_mid, twig_mid], segs=6)

        p0, p1, p2, p3 = pts_m
        s_a = p0.lerp(p1, 0.78)
        s_b = p1.lerp(p2, 0.12)
        s_c = p1.lerp(p2, 0.74)
        s_d = p2.lerp(p3, 0.04)
        sub_twigs = [
            (s_a, s_a + Vector((-0.14, 0.24, 0.02)), s_a + Vector((-0.26, 0.48, 0.04)), 0.011),
            (s_b, s_b + Vector((0.16, 0.24, 0.02)), s_b + Vector((0.27, 0.48, 0.04)), 0.011),
            (s_c, s_c + Vector((-0.15, 0.26, 0.02)), s_c + Vector((-0.25, 0.50, 0.03)), 0.009),
            (s_d, s_d + Vector((0.14, 0.24, 0.02)), s_d + Vector((0.24, 0.46, 0.03)), 0.009),
        ]
        for p0, p1, p2, r0 in sub_twigs:
            _add_tapered_tube(bm, col_layer, [p0, p1, p2], [r0, r0 * 0.65, 0.005], [twig_dark, twig_mid, twig_mid], segs=5)

        shoots = [(pts_m, 1.0)] + [([p0, p1, p2], 0.90) for p0, p1, p2, _ in sub_twigs]
        for s_pts, sc in shoots:
            n_nodes = 7 if len(s_pts) == 4 else 5
            for i in range(n_nodes):
                t = 0.22 + 0.78 * (i / max(1, n_nodes - 1))
                idx_f = t * (len(s_pts) - 1)
                i0 = min(int(idx_f), len(s_pts) - 2)
                frac = idx_f - i0
                p = s_pts[i0].lerp(s_pts[i0 + 1], frac)
                tang = (s_pts[i0 + 1] - s_pts[i0]).normalized()
                tang_xy = Vector((tang.x, tang.y, 0.0)).normalized()
                perp = Vector((-tang_xy.y, tang_xy.x, 0.0))

                sides = (-1.0, 1.0) if i < n_nodes - 1 else (-1.0, 0.0, 1.0)
                for sgn in sides:
                    ang = 0.0 if sgn == 0.0 else math.radians(sgn * rng.uniform(34.0, 62.0))
                    ldir = (tang_xy * math.cos(ang) + perp * math.sin(ang) + Vector((0, 0, rng.uniform(0.06, 0.22)))).normalized()
                    llen = rng.uniform(0.18, 0.24) * sc
                    lwid = llen * rng.uniform(0.46, 0.56)

                    # Keep leaf silhouette neatly within its half-sheet atlas column
                    tip_est = p + ldir * llen
                    if tip_est.x - lwid * 0.5 < slot_min or tip_est.x + lwid * 0.5 > slot_max or tip_est.y > y_top_limit:
                        llen *= 0.76
                        lwid *= 0.80

                    sh = rng.uniform(-0.03, 0.04)
                    # Vibrant coastal chartreuse-olive leaf colors matching #86a641 (zero washed-out white!)
                    is_shoot = (i >= n_nodes - 2) or (sgn == 0.0)
                    if is_shoot:
                        cb = _srgb_rgba(0.42 + sh * 0.4, 0.64 + sh * 0.4, 0.19)
                        cm = _srgb_rgba(0.54 + sh * 0.5, 0.76 + sh * 0.4, 0.23)
                        ct = _srgb_rgba(0.62 + sh * 0.4, 0.84 + sh * 0.4, 0.27)
                    else:
                        cb = _srgb_rgba(0.32 + sh * 0.4, 0.50 + sh * 0.4, 0.15)
                        cm = _srgb_rgba(0.43 + sh * 0.5, 0.64 + sh * 0.4, 0.20)
                        ct = _srgb_rgba(0.53 + sh * 0.5, 0.74 + sh * 0.4, 0.24)

                    # Petiole bridge
                    pv0 = bm.verts.new(p)
                    pv1 = bm.verts.new(p + perp * 0.005)
                    pv2 = bm.verts.new(p + ldir * (llen * 0.08) + perp * 0.004)
                    pv3 = bm.verts.new(p + ldir * (llen * 0.08))
                    pf = bm.faces.new((pv0, pv1, pv2, pv3))
                    for lp in pf.loops:
                        lp[col_layer] = _srgb_rgba(0.50, 0.46, 0.24)

                    _add_shrub_leaf(
                        bm, col_layer,
                        p + Vector((0, 0, rng.uniform(0.005, 0.025))),
                        ldir, llen, lwid,
                        tilt=sgn * rng.uniform(-0.22, 0.22),
                        col_base=cb, col_mid=cm, col_tip=ct,
                    )

    add_sprig(-0.50, sprout_variant=True)
    add_sprig(+0.50, sprout_variant=False)

    me = bpy.data.meshes.new("ShrubSprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("ShrubLeafAlbedo", roughness=0.58, spec=0.16)
    me.materials.append(mat)
    obj = bpy.data.objects.new("ShrubSprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _build_shrub_skeleton(mat_bark):
    """Builds multi-stemmed gnarled woody shrub skeleton anchoring cleanly to -0.055m soil with low skirt twigs."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Col")

    rng = random.Random(2815)
    bark_cols = [
        _srgb_rgba(0.84, 0.80, 0.74),
        _srgb_rgba(0.92, 0.88, 0.82),
        _srgb_rgba(0.97, 0.94, 0.89),
    ]
    twig_anchors = []

    # 6 low arching skirt canes + 2 domed central canes: zero flowerpot cylinder collar!
    stem_specs = [
        (0.05,  17.0, 0.44, 0.030, 1.06),
        (1.02,  21.0, 0.40, 0.028, 0.98),
        (2.08,  19.0, 0.42, 0.029, 1.00),
        (3.15,  16.0, 0.45, 0.031, 1.08),
        (4.22,  20.0, 0.41, 0.028, 0.98),
        (5.28,  18.0, 0.43, 0.030, 1.02),
        (1.62,  54.0, 0.42, 0.034, 0.95),
        (4.72,  56.0, 0.40, 0.032, 0.92),
    ]

    for yaw, pitch_d, length, r0, sc in stem_specs:
        pitch = math.radians(pitch_d + rng.uniform(-2.5, 2.5))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p_root = Vector((math.cos(yaw) * 0.08, math.sin(yaw) * 0.07, -0.055))
        p0 = Vector((math.cos(yaw) * 0.14, math.sin(yaw) * 0.12, 0.04))
        p1 = p0 + d * (length * 0.54) + Vector((0, 0, 0.05))
        p2 = p0 + d * length + Vector((0, 0, 0.09))
        _add_tapered_tube(bm, col_layer, [p_root, p0, p1, p2], [r0 * 1.15, r0, r0 * 0.62, 0.011], [bark_cols[0], bark_cols[0], bark_cols[1], bark_cols[2]], segs=5, uv_layer=uv_layer, u_tile=1.0, v_tile=2.0)

        fwd_s, side_s, up_s = basis_from_forward(p2 - p0)
        for sgn in (-1.0, 1.0):
            f_yaw = sgn * rng.uniform(0.38, 0.62)
            f_pitch = math.radians(rng.uniform(4.0, 22.0))
            fd = (fwd_s * math.cos(f_yaw) + side_s * math.sin(f_yaw) + up_s * math.sin(f_pitch)).normalized()
            f0 = p0.lerp(p1, 0.30 if sgn < 0 else 0.72)
            f_end = f0 + fd * (0.29 * sc)
            _add_tapered_tube(bm, col_layer, [f0, (f0 + f_end) * 0.5 + Vector((0, 0, 0.025)), f_end], [0.015, 0.009, 0.005], [bark_cols[1], bark_cols[2], bark_cols[2]], segs=4, uv_layer=uv_layer, u_tile=1.0, v_tile=1.8)
            twig_anchors.append({
                "origin": f0.lerp(f_end, 0.12),
                "forward": (f_end - f0).normalized(),
                "length": 0.44 * sc,
                "width": 0.43 * sc,
                "outer": pitch_d < 45.0,
                "upper": False,
            })

        # Low basal skirt shoot keeping foliage naturally close to ground around outer canes
        if pitch_d < 45.0:
            skirt_dir = (Vector((math.cos(yaw), math.sin(yaw), 0.16)).normalized())
            s0 = p0.lerp(p1, 0.22)
            twig_anchors.append({
                "origin": s0,
                "forward": skirt_dir,
                "length": 0.42 * sc,
                "width": 0.40 * sc,
                "outer": True,
                "upper": False,
            })

        # Tip sprig continuing leader cane
        twig_anchors.append({
            "origin": p1.lerp(p2, 0.25),
            "forward": (p2 - p1).normalized(),
            "length": 0.46 * sc,
            "width": 0.44 * sc,
            "outer": pitch_d < 45.0,
            "upper": pitch_d >= 45.0,
        })

    me = bpy.data.meshes.new("ShrubBark")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_bark)
    obj = bpy.data.objects.new("ShrubBark", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj, twig_anchors


def _build_shrub_cards(twig_anchors, mat_card):
    """Places lean, cambered sprig cards (2x2 grid = 8 tris per card) so 235 instances stay ultra-fast."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Tint")
    rng = random.Random(2821)

    uv_a = (0.015, 0.03, 0.485, 0.97)
    uv_b = (0.515, 0.03, 0.985, 0.97)

    for idx, a in enumerate(twig_anchors):
        origin = a["origin"]
        fwd, side, up = basis_from_forward(a["forward"])
        length = a["length"]
        width = a["width"]

        warm = rng.uniform(-0.02, 0.02)
        t_base = _srgb_rgba(0.85 + warm, 0.93 + warm, 0.74)
        t_tip = _srgb_rgba(0.96, 1.0, 0.85 + warm)

        # Primary arched spray
        add_cambered_card(
            bm, uv_layer, col_layer,
            origin=origin,
            forward=fwd,
            side=side,
            up=up,
            length=length,
            width=width,
            arch=0.055,
            v_fold=0.030,
            uv_rect=uv_a if (idx % 2 == 0) else uv_b,
            tint_base=t_base,
            tint_tip=t_tip,
            cols=2, rows=2,
        )

        # Crossed oblique spray (+-28 deg roll) ONLY on upper/outer tips to give full 3D side silhouette cleanly
        if a["outer"] or a["upper"]:
            roll = math.radians(28.0 if (idx % 2 == 0) else -28.0)
            c_r, s_r = math.cos(roll), math.sin(roll)
            r_side = (side * c_r + up * s_r).normalized()
            r_up = r_side.cross(fwd).normalized()
            if r_up.z < 0:
                r_side = -r_side
                r_up = -r_up
            pitch_fwd = (fwd + r_up * 0.16).normalized()
            pf, ps, pu = basis_from_forward(pitch_fwd, up_hint=r_up)
            add_cambered_card(
                bm, uv_layer, col_layer,
                origin=origin + fwd * (length * 0.06),
                forward=pf,
                side=ps,
                up=pu,
                length=length * 0.92,
                width=width * 0.90,
                arch=0.050,
                v_fold=0.025,
                uv_rect=uv_b if (idx % 2 == 0) else uv_a,
                tint_base=_srgb_rgba(0.88, 0.95, 0.79),
                tint_tip=_srgb_rgba(0.97, 1.0, 0.88),
                cols=2, rows=2,
            )

    me = bpy.data.meshes.new("ShrubFoliage")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_card)
    obj = bpy.data.objects.new("ShrubFoliage", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


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
        _build_master_shrub_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=16,
        ao_distance=0.08,
        ao_strength=0.14,
        alpha_boost=0.84,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=256,
        ridge_srgb=(0.56, 0.42, 0.28),
        fissure_srgb=(0.36, 0.25, 0.16),
        plate_freq_x=7.0,
        plate_freq_y=2.5,
        normal_amp=1.2,
        seed=2804,
    )
    mat_bark = make_textured_bark_material(
        "ShrubBark",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.82,
        normal_strength=0.60,
    )
    mat_card = make_leaf_card_material(
        "ShrubLeaves",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.58,
        normal_strength=0.50,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16

    obj_bark, twig_anchors = _build_shrub_skeleton(mat_bark)
    obj_fol = _build_shrub_cards(twig_anchors, mat_card)

    _normalize_bounds([obj_bark, obj_fol])
    apply_radial_canopy_normals(
        obj_fol.data,
        center=Vector((0.0, 0.0, 0.18)),
        sky_bias=1.20,
        blend_geom=0.08,
    )

    bpy.context.view_layer.update()
    pts = []
    tris = 0
    for o in (obj_bark, obj_fol):
        for v in o.data.vertices:
            pts.append(v.co)
        tris += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)

    w = max(p.x for p in pts) - min(p.x for p in pts)
    d = max(p.y for p in pts) - min(p.y for p in pts)
    h = max(p.z for p in pts) - min(p.z for p in pts)
    mz = min(p.z for p in pts)
    print(f"SHRUB_V1_BOUNDS w={w:.4f} d={d:.4f} h={h:.4f} minZ={mz:.4f} tris={tris}")

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
