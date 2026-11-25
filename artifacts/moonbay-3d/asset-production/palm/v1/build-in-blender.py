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
    apply_radial_canopy_normals,
    generate_bark_textures,
    make_textured_bark_material,
)

ASSET_NAME = "palm"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 4.40
TARGET_D = 4.40
TARGET_H = 5.30
MIN_Z_TARGET = -0.05


def _srgb_rgba(r, g, b, a=1.0):
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.52, spec=0.26):
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


def _add_leaflet_blade(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float, bend_z: float, v_crease: float, col_base, col_mid, col_tip):
    """Creates a crisp V-creased curving 3D palm pinna (leaflet) with tapered lance tip."""
    d = dir_v.normalized()
    up_hint = Vector((0.0, 0.0, 1.0))
    side = d.cross(up_hint)
    if side.length < 1e-4:
        side = d.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(d).normalized()

    # 3 stations along leaflet (base, mid, pre-tip) + pointed tip
    pts = [
        (0.00, 0.36, 0.0),
        (0.32, 0.52, bend_z * 0.28),
        (0.68, 0.38, bend_z * 0.72),
        (0.90, 0.16, bend_z * 0.94),
    ]
    rings = []
    for t, w_mul, bz in pts:
        center = origin + d * (length * t) + up * bz
        hw = width * w_mul
        vc = bm.verts.new(center + up * (v_crease * (1.0 - 0.5 * t)))
        vl = bm.verts.new(center - side * hw)
        vr = bm.verts.new(center + side * hw)
        rings.append((vl, vc, vr, t))

    tip = bm.verts.new(origin + d * length + up * bend_z)

    for i in range(len(rings) - 1):
        vl0, vc0, vr0, t0 = rings[i]
        vl1, vc1, vr1, t1 = rings[i + 1]
        c0 = col_base if t0 < 0.2 else col_mid
        c1 = col_mid if t1 < 0.75 else col_tip
        for v_quad in ((vl0, vc0, vc1, vl1), (vc0, vr0, vr1, vc1)):
            f = bm.faces.new(v_quad)
            f.smooth = True
            f.loops[0][col_layer] = c0
            f.loops[1][col_layer] = c0
            f.loops[2][col_layer] = c1
            f.loops[3][col_layer] = c1

    vl_e, vc_e, vr_e, _ = rings[-1]
    for v_tri in ((vl_e, vc_e, tip), (vc_e, vr_e, tip)):
        f = bm.faces.new(v_tri)
        f.smooth = True
        f.loops[0][col_layer] = col_tip
        f.loops[1][col_layer] = col_tip
        f.loops[2][col_layer] = col_tip


def _build_master_frond_scene(scene):
    """
    Bakes 2 lush crisp pinnate palm fronds into 1024x1024 RGBA + Tangent Normal atlas:
      Left slot  U=[0.015..0.485]: Mature coastal coconut frond (golden-olive rachis + deep->sunny pinnae)
      Right slot U=[0.515..0.985]: Fresh crown emerald frond (vibrant sunlit lime-emerald pinnae)
    """
    rng = random.Random(2701)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    def build_frond(cx: float, is_young: bool):
        slot_min = cx - 0.44
        slot_max = cx + 0.44
        n_spine = 26
        spine_pts = []
        for i in range(n_spine):
            t = i / (n_spine - 1)
            y = -0.90 + t * 1.76
            x = cx + math.sin(t * math.pi * 0.9) * (0.015 if not is_young else -0.012)
            z = 0.03 * math.sin(t * math.pi)
            spine_pts.append((Vector((x, y, z)), t))

        # Tapered central golden-green petiole & rachis rib
        prev_up = Vector((0, 0, 1))
        rings = []
        for i, (p, t) in enumerate(spine_pts):
            tang = (spine_pts[min(n_spine - 1, i + 1)][0] - spine_pts[max(0, i - 1)][0]).normalized()
            side = tang.cross(prev_up).normalized()
            up = side.cross(tang).normalized()
            r = (0.024 * (1.0 - 0.78 * t) + 0.004)
            ring = []
            for s in range(6):
                ang = (2.0 * math.pi * s) / 6.0
                ring.append(bm.verts.new(p + (side * math.cos(ang) + up * math.sin(ang)) * r))
            rings.append((ring, t))

        rachis_base = _srgb_rgba(0.62, 0.64, 0.31) if not is_young else _srgb_rgba(0.56, 0.72, 0.32)
        rachis_tip = _srgb_rgba(0.50, 0.66, 0.28)
        for i in range(len(rings) - 1):
            r0, t0 = rings[i]
            r1, t1 = rings[i + 1]
            c0 = tuple(rachis_base[k] * (1 - t0) + rachis_tip[k] * t0 for k in range(4))
            c1 = tuple(rachis_base[k] * (1 - t1) + rachis_tip[k] * t1 for k in range(4))
            for s in range(6):
                s2 = (s + 1) % 6
                f = bm.faces.new((r0[s], r0[s2], r1[s2], r1[s]))
                f.smooth = True
                f.loops[0][col_layer] = c0
                f.loops[1][col_layer] = c0
                f.loops[2][col_layer] = c1
                f.loops[3][col_layer] = c1

        # 26 pairs of slender curved pinnate leaflets along t in [0.12 .. 0.99]
        n_pairs = 26
        for pi in range(n_pairs):
            u = pi / (n_pairs - 1)
            t = 0.12 + 0.87 * u
            idx_f = t * (len(spine_pts) - 1)
            i0 = min(int(idx_f), len(spine_pts) - 2)
            frac = idx_f - i0
            base_p = spine_pts[i0][0].lerp(spine_pts[i0 + 1][0], frac)
            tang = (spine_pts[i0 + 1][0] - spine_pts[i0][0]).normalized()
            tang_xy = Vector((tang.x, tang.y, 0.0)).normalized()
            perp = Vector((-tang_xy.y, tang_xy.x, 0.0))

            # Natural envelope: broad diamond-lanceolate frond silhouette tapering neatly to petiole & tip
            env = math.sin(math.pow(u, 0.72) * math.pi * 0.94)
            # Sweeping forward angle becomes sharper near frond apex
            splay_deg = 74.0 - 48.0 * (u ** 1.15)
            for sgn in (-1.0, 1.0):
                stagger = 0.012 if sgn > 0 else -0.012
                origin = base_p + tang_xy * stagger + perp * (sgn * 0.008) + Vector((0, 0, rng.uniform(0.0, 0.01)))
                ang = math.radians(splay_deg * (-sgn) + rng.uniform(-3.0, 3.0))
                # Forward-sweeping pinna direction (tang_xy rotated toward left/right)
                d_pin = (tang_xy * math.cos(ang) + perp * math.sin(ang) + Vector((0, 0, rng.uniform(0.04, 0.16)))).normalized()
                raw_len = (0.12 + 0.34 * env) * (0.93 if is_young else 1.0)
                tip_x = origin.x + d_pin.x * raw_len
                if tip_x < slot_min or tip_x > slot_max:
                    max_dx = abs((slot_min if tip_x < slot_min else slot_max) - origin.x)
                    if abs(d_pin.x) > 1e-4:
                        raw_len = min(raw_len, (max_dx / abs(d_pin.x)) * 0.95)
                if raw_len < 0.055:
                    continue
                wid = 0.020 + 0.011 * env + rng.uniform(-0.002, 0.002)

                sh = 0.92 + 0.14 * env + rng.uniform(-0.04, 0.04)
                if is_young:
                    c_b = _srgb_rgba(0.28 * sh, 0.56 * sh, 0.22 * sh)
                    c_m = _srgb_rgba(0.38 * sh, 0.70 * sh, 0.26 * sh)
                    c_t = _srgb_rgba(0.52 * sh, 0.80 * sh, 0.32 * sh)
                else:
                    c_b = _srgb_rgba(0.23 * sh, 0.49 * sh, 0.21 * sh)
                    c_m = _srgb_rgba(0.34 * sh, 0.63 * sh, 0.25 * sh)
                    c_t = _srgb_rgba(0.50 * sh, 0.73 * sh, 0.30 * sh)
                _add_leaflet_blade(
                    bm, col_layer, origin, d_pin, raw_len, wid,
                    bend_z=-0.015 - 0.03 * env, v_crease=0.007,
                    col_base=c_b, col_mid=c_m, col_tip=c_t,
                )

    build_frond(-0.50, is_young=False)
    build_frond(+0.50, is_young=True)

    me = bpy.data.meshes.new("PalmFrondMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("PalmFrondAlbedo", roughness=0.52)
    me.materials.append(mat)
    obj = bpy.data.objects.new("PalmFrondMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _trunk_curve(t: float) -> Vector:
    # Graceful curved coastal coconut trunk leaning slightly windward while staying well-balanced
    z = -0.05 + t * 4.35
    x = math.sin(t * math.pi * 0.95) * 0.26 - 0.05 * t
    y = -0.08 * t + 0.06 * math.sin(t * math.pi * 1.4)
    return Vector((x, y, z))


def _trunk_radius(t: float) -> float:
    # Swollen coconut root bole at base tapering gently into slender ringed palm column
    bole = 0.095 * math.exp(-t * 10.5)
    core = 0.165 * ((1.0 - 0.38 * t) ** 0.72)
    return core + bole


def _build_trunk_and_coconuts(mat_bark, mat_wood):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Col")

    # 1. Stepped Ringed Coconut Trunk (20 clear leaf-scar growth rings + exposed root collar)
    n_scars = 22
    n_segs = 14
    rings_geom = []
    for ri in range(n_scars * 2):
        scar_idx = ri // 2
        is_lip = (ri % 2 == 1)
        t = min(1.0, (scar_idx + (0.86 if is_lip else 0.05)) / n_scars)
        c = _trunk_curve(t)
        base_r = _trunk_radius(t)
        # Leaf-scar ridge profile: gently swollen flared shelf just under each scar
        scar_flare = (1.075 if is_lip else 0.965) if scar_idx > 1 else 1.0
        root_amp = 0.22 * math.exp(-t * 11.0)
        tilt_z = 0.025 * (1.0 if scar_idx % 2 == 0 else -1.0)
        ring = []
        for si in range(n_segs):
            ang = (2.0 * math.pi * si) / n_segs
            lobe = math.sin(ang * 6.0 + 0.3) * root_amp
            r = base_r * scar_flare * (1.0 + lobe)
            p = Vector((c.x + math.cos(ang) * r, c.y + math.sin(ang) * r, c.z + math.cos(ang) * tilt_z * 0.25))
            ring.append((bm.verts.new(p), si / n_segs, ang))
        rings_geom.append((ring, t, is_lip))

    for ri in range(len(rings_geom) - 1):
        r0, t0, lip0 = rings_geom[ri]
        r1, t1, lip1 = rings_geom[ri + 1]
        for si in range(n_segs):
            s2 = (si + 1) % n_segs
            v0, u0, _ = r0[si]
            v1, u1, _ = r0[s2]
            v2, u2, _ = r1[s2]
            v3, u3, _ = r1[si]
            u1_adj = u1 if s2 != 0 else 1.0
            f = bm.faces.new((v0, v1, v2, v3))
            f.smooth = True
            uvs = [
                (u0 * 2.0, t0 * 8.0),
                (u1_adj * 2.0, t0 * 8.0),
                (u1_adj * 2.0, t1 * 8.0),
                (u0 * 2.0, t1 * 8.0),
            ]
            for loop, tt, is_l, uv_c in zip(f.loops, (t0, t0, t1, t1), (lip0, lip0, lip1, lip1), uvs):
                loop[uv_layer].uv = uv_c
                # Darker weathered crease at base & slight green crownshaft tint near top
                moss = math.exp(-tt * 9.0)
                scar_shade = 1.04 if is_l else 0.88
                crown_tint = max(0.0, (tt - 0.90) / 0.10)
                r_c = ((0.96 - 0.16 * moss) * (1.0 - 0.30 * crown_tint) + 0.32 * crown_tint) * scar_shade
                g_c = ((0.95 - 0.12 * moss) * (1.0 - 0.12 * crown_tint) + 0.56 * crown_tint) * scar_shade
                b_c = ((0.93 - 0.18 * moss) * (1.0 - 0.40 * crown_tint) + 0.22 * crown_tint) * scar_shade
                loop[col_layer] = _srgb_rgba(r_c, g_c, b_c)

    cap_b = bm.faces.new([v for v, _, _ in rings_geom[0][0]][::-1])
    for loop in cap_b.loops:
        loop[col_layer] = _srgb_rgba(0.80, 0.78, 0.72)
        loop[uv_layer].uv = (0.5, 0.0)
    bmesh.ops.triangulate(bm, faces=[cap_b])

    cap_t = bm.faces.new([v for v, _, _ in rings_geom[-1][0]])
    for loop in cap_t.loops:
        loop[col_layer] = _srgb_rgba(0.45, 0.62, 0.28)
        loop[uv_layer].uv = (0.5, 1.0)
    bmesh.ops.triangulate(bm, faces=[cap_t])

    me_trunk = bpy.data.meshes.new("PalmTrunk")
    bm.to_mesh(me_trunk)
    bm.free()
    me_trunk.materials.append(mat_bark)
    obj_trunk = bpy.data.objects.new("PalmTrunk", me_trunk)
    bpy.context.scene.collection.objects.link(obj_trunk)

    # 2. Coconut Cluster & Fibrous Crownshaft Petiole Collar (`PalmCoconuts` separate UV/vcol wood-fruit mesh)
    bm_c = bmesh.new()
    col_c = bm_c.loops.layers.color.new("Col")
    crown = _trunk_curve(0.99)
    rng = random.Random(2707)

    # Exposed central woody frond ribs (16 golden-olive arched petioles anchoring canopy cards!)
    frond_defs = []
    # Tier 0 (5 graceful drooping mature outer fronds)
    for i in range(5):
        yaw = (2.0 * math.pi * i) / 5.0 + 0.15 + rng.uniform(-0.14, 0.14)
        frond_defs.append((yaw, 22.0, -34.0, 2.28, 1.12, False, 0.90))
    # Tier 1 (6 wide arched mid-crown sweeping fronds)
    for i in range(6):
        yaw = (2.0 * math.pi * i) / 6.0 + 0.52 + rng.uniform(-0.12, 0.12)
        frond_defs.append((yaw, 42.0, -14.0, 2.15, 1.04, False, 0.97))
    # Tier 2 (5 fresh vibrant ascending crown spears)
    for i in range(5):
        yaw = (2.0 * math.pi * i) / 5.0 + 0.90 + rng.uniform(-0.12, 0.12)
        frond_defs.append((yaw, 68.0, 24.0, 1.62, 0.86, True, 1.03))

    # Add sculpted coconuts tucked around crown base right beneath lower fronds
    for ci in range(7):
        ang = (2.0 * math.pi * ci) / 7.0 + rng.uniform(-0.15, 0.15)
        dist_r = 0.165 + rng.uniform(-0.02, 0.03)
        cz_off = -0.14 + (ci % 2) * (-0.09)
        cc = crown + Vector((math.cos(ang) * dist_r, math.sin(ang) * dist_r, cz_off))
        is_young_nut = (ci % 3 == 0)
        res = bmesh.ops.create_icosphere(bm_c, subdivisions=2, radius=0.105)
        for v in res["verts"]:
            d = v.co
            v.co = Vector((cc.x + d.x * 0.92, cc.y + d.y * 0.92, cc.z + d.z * 1.18))
        for v in res["verts"]:
            for f in v.link_faces:
                f.smooth = True
                for loop in f.loops:
                    if is_young_nut:
                        loop[col_c] = _srgb_rgba(0.48, 0.65, 0.25)
                    else:
                        loop[col_c] = _srgb_rgba(0.46, 0.30, 0.17)

    # Add woody petiole splines & compute frond frame points
    frond_paths = []
    for yaw, start_deg, end_deg, f_len, f_wid, is_young, tint_k in frond_defs:
        rad = Vector((math.cos(yaw), math.sin(yaw), 0.0))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
        p_cur = crown + rad * 0.04 + Vector((0, 0, -0.02 if not is_young else 0.05))
        pts = [p_cur]
        n_seg = 7
        for si in range(1, n_seg + 1):
            st = si / n_seg
            pitch = math.radians(start_deg * (1.0 - st) + end_deg * st)
            d_step = (rad * math.cos(pitch) + Vector((0.0, 0.0, math.sin(pitch)))).normalized()
            p_cur = p_cur + d_step * (f_len / n_seg)
            pts.append(p_cur.copy())

        # Build physical 3D woody central petiole rib from base to 75% length
        pet_pts = pts[:6]
        pet_rad = [0.036 * (1.0 - 0.72 * (k / 5.0)) for k in range(6)]
        pet_cols = [_srgb_rgba(0.55, 0.56, 0.28) if k < 2 else _srgb_rgba(0.48, 0.58, 0.25) for k in range(6)]
        prev_u = Vector((0, 0, 1))
        rings_p = []
        for k, (pt, rr) in enumerate(zip(pet_pts, pet_rad)):
            tg = (pet_pts[min(5, k + 1)] - pet_pts[max(0, k - 1)]).normalized()
            sd = tg.cross(prev_u)
            if sd.length < 1e-4:
                sd = side
            sd.normalize()
            up_p = sd.cross(tg).normalized()
            rings_p.append(([bm_c.verts.new(pt + (sd * math.cos(2*math.pi*j/5) + up_p * math.sin(2*math.pi*j/5)) * rr) for j in range(5)], pet_cols[k]))
        for k in range(len(rings_p) - 1):
            r0, c0 = rings_p[k]
            r1, c1 = rings_p[k + 1]
            for j in range(5):
                j2 = (j + 1) % 5
                f = bm_c.faces.new((r0[j], r0[j2], r1[j2], r1[j]))
                f.smooth = True
                f.loops[0][col_c] = c0
                f.loops[1][col_c] = c0
                f.loops[2][col_c] = c1
                f.loops[3][col_c] = c1

        frond_paths.append({
            "pts": pts,
            "side": side,
            "width": f_wid,
            "is_young": is_young,
            "tint_k": tint_k,
            "yaw": yaw,
        })

    me_c = bpy.data.meshes.new("PalmCoconuts")
    bm_c.to_mesh(me_c)
    bm_c.free()
    me_c.materials.append(mat_wood)
    obj_c = bpy.data.objects.new("PalmCoconuts", me_c)
    bpy.context.scene.collection.objects.link(obj_c)

    return obj_trunk, obj_c, frond_paths


def _build_frond_canopy(frond_paths, mat_card):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Tint")
    rng = random.Random(2711)

    uv_mature = (0.015, 0.03, 0.485, 0.96)
    uv_young = (0.515, 0.03, 0.985, 0.96)

    for fp in frond_paths:
        pts = fp["pts"]
        side = fp["side"]
        wid = fp["width"]
        uv_rect = uv_young if fp["is_young"] else uv_mature
        u0, v0, u1, v1 = uv_rect
        u_mid = 0.5 * (u0 + u1)
        tk = fp["tint_k"]

        # Slight natural side roll twist along each palm frond (+-14 deg) for breezy sculptural variety
        twist_max = rng.uniform(-0.24, 0.24)
        n = len(pts)
        # V-folded 3-vertex-wide ribbon rows tracing the curved 3D spine smoothly!
        rows = []
        for i in range(n):
            t = i / (n - 1)
            tang = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
            up_loc = side.cross(tang).normalized()
            tw = twist_max * t
            sd_tw = (side * math.cos(tw) + up_loc * math.sin(tw)).normalized()
            up_tw = sd_tw.cross(tang).normalized()

            hw = wid * 0.5 * (0.65 + 0.35 * math.sin(t * math.pi * 0.85))
            v_droop = -0.14 * hw * (0.5 + 0.8 * t)

            v_l = bm.verts.new(pts[i] - sd_tw * hw + up_tw * v_droop)
            v_m = bm.verts.new(pts[i] + up_tw * 0.025)
            v_r = bm.verts.new(pts[i] + sd_tw * hw + up_tw * v_droop)
            rows.append((v_l, v_m, v_r, t))

        base_col = _srgb_rgba(0.90 * tk, 0.95 * tk, 0.90 * tk)
        tip_col = _srgb_rgba(min(1.0, 1.02 * tk), min(1.0, 1.03 * tk), min(1.0, 0.98 * tk))

        for i in range(len(rows) - 1):
            l0, m0, r0, t0 = rows[i]
            l1, m1, r1, t1 = rows[i + 1]
            vv0 = v0 + (v1 - v0) * t0
            vv1 = v0 + (v1 - v0) * t1
            c0 = tuple(base_col[k] * (1 - t0) + tip_col[k] * t0 for k in range(4))
            c1 = tuple(base_col[k] * (1 - t1) + tip_col[k] * t1 for k in range(4))

            # Left half (u0 .. u_mid)
            fl = bm.faces.new((l0, m0, m1, l1))
            fl.smooth = True
            for lp, uv_c, cc in zip(fl.loops, [(u0, vv0), (u_mid, vv0), (u_mid, vv1), (u0, vv1)], (c0, c0, c1, c1)):
                lp[uv_layer].uv = uv_c
                lp[col_layer] = cc

            # Right half (u_mid .. u1)
            fr = bm.faces.new((m0, r0, r1, m1))
            fr.smooth = True
            for lp, uv_c, cc in zip(fr.loops, [(u_mid, vv0), (u1, vv0), (u1, vv1), (u_mid, vv1)], (c0, c0, c1, c1)):
                lp[uv_layer].uv = uv_c
                lp[col_layer] = cc

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
        _build_master_frond_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=16,
        ao_distance=0.10,
        ao_strength=0.16,
        alpha_boost=0.82,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_alb, bark_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=512,
        ridge_srgb=(0.66, 0.54, 0.41),
        fissure_srgb=(0.45, 0.34, 0.25),
        plate_freq_x=3.0,
        plate_freq_y=12.0,
        normal_amp=1.4,
        seed=2704,
    )
    mat_bark = make_textured_bark_material(
        "PalmBark",
        albedo_path=bark_alb,
        normal_path=bark_nrm,
        roughness=0.84,
        normal_strength=0.68,
    )
    mat_wood = _make_vcol_mat("PalmCrownCoconuts", roughness=0.62, spec=0.22)
    mat_card = make_leaf_card_material(
        "PalmFronds",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.46,
        normal_strength=0.58,
    )

    obj_trunk, obj_c, frond_paths = _build_trunk_and_coconuts(mat_bark, mat_wood)
    canopy_empty, obj_canopy = _build_frond_canopy(frond_paths, mat_card)

    _normalize_bounds([obj_trunk, obj_c, obj_canopy])
    apply_radial_canopy_normals(
        obj_canopy.data,
        center=Vector((0.0, 0.0, 3.85)),
        sky_bias=0.72,
        blend_geom=0.32,
    )

    bpy.context.view_layer.update()
    pts = []
    tris = 0
    for o in (obj_trunk, obj_c, obj_canopy):
        for v in o.data.vertices:
            pts.append(v.co)
        tris += sum(max(1, len(p.vertices) - 2) for p in o.data.polygons)

    w = max(p.x for p in pts) - min(p.x for p in pts)
    d = max(p.y for p in pts) - min(p.y for p in pts)
    h = max(p.z for p in pts) - min(p.z for p in pts)
    mz = min(p.z for p in pts)
    print(f"PALM_V1_BOUNDS w={w:.4f} d={d:.4f} h={h:.4f} minZ={mz:.4f} tris={tris}")

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
