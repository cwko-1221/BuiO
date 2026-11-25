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

ASSET_NAME = "daisy"
OUT_GLB = os.path.join(SCRIPT_DIR, f"{ASSET_NAME}.glb")
TARGET_W = 0.97
TARGET_D = 0.72
TARGET_H = 0.47
MIN_Z_TARGET = -0.04


def _srgb_rgba(r, g, b, a=1.0):
    return (max(0.0, min(1.0, r)), max(0.0, min(1.0, g)), max(0.0, min(1.0, b)), a)


def _make_vcol_mat(name, roughness=0.66, spec=0.07):
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


def _lerp_col(ca, cb, t):
    return (
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
        1.0,
    )


def _add_crenate_daisy_leaf(bm, col_layer, origin: Vector, dir_v: Vector, length: float, width: float, tilt: float, col_base, col_mid, col_tip):
    """
    Sculpts a smooth spatulate oxeye-daisy blade with gentle rounded crenate scallops
    and continuous parabolic cross-blade curvature (NO alternating Z-ridges -> ZERO zebra stripes).
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

    # Smooth 12-slice profile with delicate rounded crenate margin undulations
    n_slices = 12
    rings = []
    for si in range(n_slices):
        t = 0.06 + (si / (n_slices - 1)) * 0.88
        # Classic spoon-obovate daisy silhouette: narrow petiole swelling smoothly to rounded upper belly
        env = math.sin(t * math.pi) ** 0.72 * (0.55 + 0.58 * t)
        scallop = 1.0 + 0.14 * math.sin((t - 0.12) * 19.0) * smooth_window(t)
        w_outer = max(0.05, env * scallop * 0.44 * width)
        w_inner = w_outer * 0.48
        arch_z = math.sin(t * math.pi) * 0.008
        center = origin + d * (t * length) + u_vec * arch_z
        # Flat-normal-safe uniform gentle trough (independent of scallop radius -> silky smooth shading)
        z_outer = 0.003 * math.sin(t * math.pi)
        z_mid = 0.001 * math.sin(t * math.pi)
        col = _lerp_col(col_base, col_mid, min(1.0, t * 2.0)) if t < 0.5 else _lerp_col(col_mid, col_tip, (t - 0.5) * 2.0)

        vl = bm.verts.new(center - s_vec * w_outer + u_vec * z_outer)
        vml = bm.verts.new(center - s_vec * w_inner + u_vec * z_mid)
        vc = bm.verts.new(center - u_vec * 0.002)
        vmr = bm.verts.new(center + s_vec * w_inner + u_vec * z_mid)
        vr = bm.verts.new(center + s_vec * w_outer + u_vec * z_outer)
        rings.append((vl, vml, vc, vmr, vr, col))

    v_pet = bm.verts.new(origin)
    vl0, vml0, vc0, vmr0, vr0, c0 = rings[0]
    for tri in ((v_pet, vl0, vml0), (v_pet, vml0, vc0), (v_pet, vc0, vmr0), (v_pet, vmr0, vr0)):
        f = bm.faces.new(tri)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = c0

    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        ca, cb = a[5], b[5]
        for k in range(4):
            f = bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
            f.smooth = True
            for lp, cc in zip(f.loops, (ca, cb, cb, ca)):
                lp[col_layer] = cc

    vl_l, vml_l, vc_l, vmr_l, vr_l, cl = rings[-1]
    v_tip = bm.verts.new(origin + d * length - u_vec * 0.002)
    for tri in ((vl_l, v_tip, vml_l), (vml_l, v_tip, vc_l), (vc_l, v_tip, vmr_l), (vmr_l, v_tip, vr_l)):
        f = bm.faces.new(tri)
        f.smooth = True
        for lp in f.loops:
            lp[col_layer] = cl


def smooth_window(t):
    if t < 0.20 or t > 0.90:
        return 0.0
    return math.sin(((t - 0.20) / 0.70) * math.pi)


def _add_daisy_blossom(bm, col_layer, center: Vector, normal: Vector, radius: float, yaw_off: float, n_petals: int, rng):
    """Sculpts a crisp 16-petal Shasta daisy with separated rounded rays and rich saffron-gold domed disk."""
    n = normal.normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(n.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    t1 = ref.cross(n).normalized()
    t2 = n.cross(t1).normalized()

    # Balanced contrast so cream-white rays `#fff0cc` hold clean individual petal gaps in sunlit Three.js ACES
    c_gold_hi = _srgb_rgba(0.99, 0.74, 0.08)
    c_gold_lo = _srgb_rgba(0.84, 0.46, 0.03)
    c_ray_b = _srgb_rgba(0.76, 0.74, 0.57)
    c_ray_m = _srgb_rgba(0.90, 0.88, 0.75)
    c_ray_t = _srgb_rgba(0.96, 0.94, 0.84)
    c_calyx = _srgb_rgba(0.16, 0.36, 0.10)

    # Raised domed saffron-golden floret disk
    disk_r = radius * 0.31
    disk_mid = radius * 0.18
    v_top = bm.verts.new(center + n * (radius * 0.19))
    inner_ring = []
    outer_ring = []
    for s in range(10):
        a = yaw_off + s * (math.tau / 10.0)
        dr = t1 * math.cos(a) + t2 * math.sin(a)
        inner_ring.append(bm.verts.new(center + dr * disk_mid + n * (radius * 0.14)))
        outer_ring.append(bm.verts.new(center + dr * disk_r + n * (radius * 0.06)))

    for s in range(10):
        s2 = (s + 1) % 10
        f0 = bm.faces.new((v_top, inner_ring[s], inner_ring[s2]))
        f0.smooth = True
        for lp in f0.loops:
            lp[col_layer] = c_gold_hi
        f1 = bm.faces.new((inner_ring[s], outer_ring[s], outer_ring[s2], inner_ring[s2]))
        f1.smooth = True
        for lp, cc in zip(f1.loops, (c_gold_hi, c_gold_lo, c_gold_lo, c_gold_hi)):
            lp[col_layer] = cc

    # Dark emerald phyllary calyx peeking neatly between ray bases for crisp crevice contrast
    for k in range(8):
        a = yaw_off + (k + 0.5) * (math.tau / 8.0)
        dr = t1 * math.cos(a) + t2 * math.sin(a)
        ds = -t1 * math.sin(a) + t2 * math.cos(a)
        vb = bm.verts.new(center - n * (radius * 0.05))
        vl = bm.verts.new(center + dr * (radius * 0.44) - ds * (radius * 0.10) - n * (radius * 0.015))
        vr = bm.verts.new(center + dr * (radius * 0.44) + ds * (radius * 0.10) - n * (radius * 0.015))
        fc = bm.faces.new((vb, vl, vr))
        for lp in fc.loops:
            lp[col_layer] = c_calyx

    # Distinct narrow-waisted spoon ray petals with clean separation between rays
    for k in range(n_petals):
        ang = yaw_off + k * (math.tau / n_petals) + rng.uniform(-0.03, 0.03)
        dr = t1 * math.cos(ang) + t2 * math.sin(ang)
        ds = -t1 * math.sin(ang) + t2 * math.cos(ang)
        p_lift = 0.04 + (0.045 if (k % 2 == 0) else -0.005)
        plen = radius * rng.uniform(0.93, 1.03)
        w0 = radius * 0.042
        w1 = radius * 0.112
        w2 = radius * 0.088

        vb_l = bm.verts.new(center + dr * (disk_r * 0.90) - ds * w0 + n * (radius * 0.05))
        vb_r = bm.verts.new(center + dr * (disk_r * 0.90) + ds * w0 + n * (radius * 0.05))
        vm_l = bm.verts.new(center + dr * (plen * 0.64) - ds * w1 + n * (radius * (p_lift + 0.05)))
        vm_r = bm.verts.new(center + dr * (plen * 0.64) + ds * w1 + n * (radius * (p_lift + 0.05)))
        vo_l = bm.verts.new(center + dr * (plen * 0.91) - ds * w2 + n * (radius * (p_lift + 0.04)))
        vo_r = bm.verts.new(center + dr * (plen * 0.91) + ds * w2 + n * (radius * (p_lift + 0.04)))
        v_tip = bm.verts.new(center + dr * plen + n * (radius * (p_lift + 0.02)))

        for verts, cols in (
            ((vb_l, vm_l, vm_r, vb_r), (c_ray_b, c_ray_m, c_ray_m, c_ray_b)),
            ((vm_l, vo_l, vo_r, vm_r), (c_ray_m, c_ray_t, c_ray_t, c_ray_m)),
            ((vo_l, v_tip, vo_r), (c_ray_t, c_ray_t, c_ray_t)),
        ):
            fp = bm.faces.new(verts)
            fp.smooth = True
            for lp, cc in zip(fp.loops, cols):
                lp[col_layer] = cc


def _build_master_daisy_sprig_scene(scene):
    """
    Bakes 3 crisp Oxeye/Shasta Daisy atlas regions (`1024x1024` RGBA + Tangent Normal):
      - Left half   (`x=-0.50`): Organic 2-blossom + 1-bud wildflower shoot over narrow stem leaves.
      - Right Top   (`x=+0.50, y=+0.48`): Single sculpted crisp 16-petal cream-white golden daisy head.
      - Right Bottom(`x=+0.50, y=-0.48`): Non-overlapping 7-leaf crenate-lobed basal rosette fan (ZERO stripes).
    """
    rng = random.Random(3102)
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    stem_b = _srgb_rgba(0.24, 0.46, 0.14)
    stem_t = _srgb_rgba(0.36, 0.64, 0.21)
    leaf_b = _srgb_rgba(0.16, 0.40, 0.11)
    leaf_m = _srgb_rgba(0.27, 0.58, 0.17)
    leaf_t = _srgb_rgba(0.40, 0.72, 0.23)

    # ---- LEFT SLOT: Organic 2-Blossom + 1-Bud Wild-Daisy Shoot (cx=-0.50) ----
    cx = -0.50
    _add_tapered_tube(
        bm, col_layer,
        [Vector((cx, -0.84, -0.02)), Vector((cx - 0.02, -0.25, 0.00)), Vector((cx + 0.01, 0.26, 0.02)), Vector((cx + 0.02, 0.56, 0.04))],
        [0.015, 0.012, 0.009, 0.006], [stem_b, stem_b, stem_t, stem_t], segs=5,
    )
    for p_mid, p_tip in (
        (Vector((cx - 0.01, -0.08, 0.01)), Vector((cx - 0.21, 0.24, 0.03))),
        (Vector((cx + 0.01,  0.04, 0.01)), Vector((cx + 0.19, 0.30, 0.03))),
    ):
        _add_tapered_tube(
            bm, col_layer,
            [p_mid, p_mid.lerp(p_tip, 0.5) + Vector((0, 0, 0.01)), p_tip],
            [0.010, 0.008, 0.005], [stem_b, stem_t, stem_t], segs=4,
        )

    for y_l, ang, llen, lwid, tilt in (
        (-0.74, math.radians(-58), 0.35, 0.17, -0.06),
        (-0.70, math.radians(58),  0.35, 0.17,  0.06),
        (-0.44, math.radians(-50), 0.37, 0.18, -0.05),
        (-0.40, math.radians(52),  0.37, 0.18,  0.05),
    ):
        ld = Vector((math.sin(ang), math.cos(ang), 0.05)).normalized()
        orig = Vector((cx, y_l, 0.0))
        _add_crenate_daisy_leaf(bm, col_layer, orig, ld, llen, lwid, tilt, leaf_b, leaf_m, leaf_t)

    _add_daisy_blossom(bm, col_layer, Vector((cx + 0.02, 0.58, 0.06)), Vector((0.06, 0.18, 0.98)), 0.24, 0.20, 16, rng)
    _add_daisy_blossom(bm, col_layer, Vector((cx - 0.21, 0.25, 0.05)), Vector((-0.26, 0.12, 0.96)), 0.19, 0.85, 14, rng)
    _add_daisy_blossom(bm, col_layer, Vector((cx + 0.19, 0.31, 0.05)), Vector((0.28, 0.14, 0.95)), 0.13, 1.40, 12, rng)

    # ---- RIGHT TOP REGION: Crisp Single Sculpted Shasta Daisy Head (cx=+0.50, cy=+0.48) ----
    _add_tapered_tube(
        bm, col_layer,
        [Vector((0.50, 0.12, -0.02)), Vector((0.50, 0.46, 0.02))],
        [0.012, 0.007], [stem_b, stem_t], segs=5,
    )
    for la, lw in ((math.radians(-125), 0.24), (math.radians(125), 0.24)):
        _add_crenate_daisy_leaf(
            bm, col_layer, Vector((0.50, 0.38, -0.01)),
            Vector((math.sin(la), math.cos(la), 0.02)).normalized(),
            0.22, 0.13, 0.0, leaf_b, leaf_m, leaf_t,
        )
    _add_daisy_blossom(bm, col_layer, Vector((0.50, 0.50, 0.05)), Vector((0.04, 0.16, 0.98)), 0.34, 0.15, 16, rng)

    # ---- RIGHT BOTTOM REGION: Non-Overlapping 7-Leaf Basal Crenate Rosette Fan (hub=(0.50, -0.84)) ----
    cx_r = 0.50
    hub_l = Vector((cx_r, -0.86, -0.01))
    # Radial fan framing 1 crisp center apical leaf + 3 symmetrical non-overlapping pairs
    fan_specs = [
        (0.00, 0.64, 0.24),
        (-0.46, 0.56, 0.22),
        ( 0.46, 0.56, 0.22),
        (-0.92, 0.48, 0.20),
        ( 0.92, 0.48, 0.20),
        (-1.32, 0.38, 0.18),
        ( 1.32, 0.38, 0.18),
    ]
    for ang, llen, lwid in fan_specs:
        ld = Vector((math.sin(ang), math.cos(ang), 0.04)).normalized()
        orig = hub_l + Vector((math.sin(ang) * 0.04, 0.04 + math.cos(ang) * 0.04, 0.0))
        if orig.x + ld.x * llen < 0.06:
            llen = min(llen, (orig.x - 0.06) / max(0.05, -ld.x))
        elif orig.x + ld.x * llen > 0.94:
            llen = min(llen, (0.94 - orig.x) / max(0.05, ld.x))
        if orig.y + ld.y * llen > -0.06:
            llen = min(llen, (-0.06 - orig.y) / max(0.05, ld.y))
        _add_crenate_daisy_leaf(bm, col_layer, orig, ld, llen, lwid, 0.0, leaf_b, leaf_m, leaf_t)

    me = bpy.data.meshes.new("DaisySprigMaster")
    bm.to_mesh(me)
    bm.free()
    mat = _make_vcol_mat("DaisySprigAlbedo", roughness=0.80, spec=0.04)
    me.materials.append(mat)
    obj = bpy.data.objects.new("DaisySprigMaster", me)
    scene.collection.objects.link(obj)
    return [obj]


def _make_head_basis(up_vec: Vector, yaw_ref: float):
    """Returns (fwd, side, up) matching basis_from_forward handedness (`side.cross(fwd) == +up`)."""
    up = up_vec.normalized()
    ref = Vector((math.cos(yaw_ref), math.sin(yaw_ref), 0.0))
    if abs(ref.dot(up)) > 0.92:
        ref = Vector((1.0, 0.0, 0.0)) if abs(up.x) < 0.9 else Vector((0.0, 1.0, 0.0))
    fwd = (ref - up * ref.dot(up)).normalized()
    side = fwd.cross(up).normalized()
    return fwd, side, up


def _build_daisy_base_and_cards(mat_stem, mat_card):
    """Builds uneven natural wild-daisy stems + stripe-free basal leaf rosettes + organic height blooms (~1,080 tris)."""
    rng = random.Random(3112)

    bm_b = bmesh.new()
    uv_b = bm_b.loops.layers.uv.new("UVMap")
    col_b = bm_b.loops.layers.color.new("Col")
    stem_cols = [_srgb_rgba(0.68, 0.80, 0.58), _srgb_rgba(0.78, 0.90, 0.68), _srgb_rgba(0.86, 0.96, 0.74)]

    bm_c = bmesh.new()
    uv_c = bm_c.loops.layers.uv.new("UVMap")
    col_c = bm_c.loops.layers.color.new("Tint")
    uv_spray = (0.015, 0.03, 0.485, 0.97)
    uv_single = (0.54, 0.52, 0.96, 0.96)
    uv_rosette = (0.515, 0.03, 0.985, 0.475)

    # 1) Ground-hugging Oval Crenate Basal Leaf Rosette Cushion (12 spreading + 6 inner tufts, anchored -0.04m)
    for i in range(12):
        yaw = (i / 12.0) * math.tau + rng.uniform(-0.08, 0.08)
        pitch = math.radians(rng.uniform(10.0, 22.0))
        r0 = rng.uniform(0.06, 0.11)
        p_root = Vector((math.cos(yaw) * r0 * 1.25, math.sin(yaw) * r0 * 0.92, -0.04))
        p_mid = Vector((math.cos(yaw) * 0.16, math.sin(yaw) * 0.12, 0.02))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p_tip = p_mid + d * rng.uniform(0.14, 0.18)
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.011, 0.008, 0.004], stem_cols, segs=3, uv_layer=uv_b, u_tile=1.0, v_tile=1.8)

        fwd, side, up = basis_from_forward(d)
        roll = math.radians(16.0 if (i % 2 == 0) else -16.0)
        cr, sr = math.cos(roll), math.sin(roll)
        r_side = (side * cr + up * sr).normalized()
        r_up = r_side.cross(fwd).normalized()
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=p_mid - fwd * 0.06,
            forward=fwd, side=r_side, up=r_up,
            length=rng.uniform(0.35, 0.41), width=rng.uniform(0.32, 0.38),
            arch=0.048, v_fold=0.022, uv_rect=uv_rosette,
            tint_base=_srgb_rgba(0.84, 0.90, 0.78), tint_tip=_srgb_rgba(0.98, 1.00, 0.92), cols=2, rows=2,
        )

    for j in range(6):
        yaw = (j / 6.0) * math.tau + 0.48
        pitch = math.radians(rng.uniform(28.0, 42.0))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        fwd, side, up = basis_from_forward(d)
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=Vector((math.cos(yaw) * 0.04, math.sin(yaw) * 0.03, 0.05)),
            forward=fwd, side=side, up=up,
            length=0.33, width=0.32,
            arch=0.050, v_fold=0.022, uv_rect=uv_rosette,
            tint_base=_srgb_rgba(0.78, 0.86, 0.74), tint_tip=_srgb_rgba(0.96, 1.00, 0.90), cols=2, rows=2,
        )

    # 2) 10 Airy Lower/Shoulder Multi-Flower Wild-Daisy Sprays (`uv_spray`) fanning at uneven outward angles
    for k in range(10):
        yaw = (k / 10.0) * math.tau + rng.uniform(-0.12, 0.12)
        pitch = math.radians(rng.uniform(28.0, 46.0))
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        p_root = Vector((math.cos(yaw) * 0.06, math.sin(yaw) * 0.05, -0.04))
        p_mid = Vector((math.cos(yaw) * 0.10, math.sin(yaw) * 0.08, 0.02))
        p_tip = p_mid + d * rng.uniform(0.18, 0.25)
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.010, 0.008, 0.004], stem_cols, segs=3, uv_layer=uv_b, u_tile=1.0, v_tile=2.0)

        tilt_d = Vector((math.cos(yaw) * 0.76, math.sin(yaw) * 0.76, 0.65)).normalized()
        fwd, side, up = basis_from_forward(tilt_d)
        roll = math.radians(24.0 if (k % 2 == 0) else -24.0)
        cr, sr = math.cos(roll), math.sin(roll)
        r_side = (side * cr + up * sr).normalized()
        r_up = r_side.cross(fwd).normalized()
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=p_mid.lerp(p_tip, 0.08),
            forward=fwd, side=r_side, up=r_up,
            length=rng.uniform(0.32, 0.37), width=rng.uniform(0.28, 0.33),
            arch=0.045, v_fold=0.018, uv_rect=uv_spray,
            tint_base=_srgb_rgba(0.92, 0.94, 0.90), tint_tip=_srgb_rgba(1.0, 1.0, 1.0), cols=2, rows=2,
        )

    # 3) 10 Individual Single-Blossom Stalks (`uv_single`) at organically staggered heights (`0.22..0.44m`)
    # NO flat crown shelf: individual blooms nod at natural irregular angles across lower, mid, & crown tiers
    single_stems = [
        # (x, y, z, blossom_diam, tilt_nx, tilt_ny, tilt_nz, yaw_ref)
        ( 0.26,  0.04, 0.24, 0.165,  0.55,  0.12, 0.82, 0.2),
        ( 0.12,  0.22, 0.31, 0.175,  0.28,  0.48, 0.83, 1.1),
        (-0.14,  0.20, 0.27, 0.170, -0.35,  0.46, 0.81, 2.2),
        (-0.27, -0.02, 0.25, 0.165, -0.58, -0.08, 0.81, 3.1),
        (-0.15, -0.19, 0.30, 0.175, -0.34, -0.44, 0.83, 4.1),
        ( 0.14, -0.18, 0.23, 0.165,  0.34, -0.48, 0.81, 5.3),
        ( 0.11,  0.06, 0.39, 0.195,  0.22,  0.14, 0.96, 0.7),
        (-0.11,  0.05, 0.35, 0.185, -0.24,  0.16, 0.95, 2.5),
        (-0.02, -0.09, 0.43, 0.195, -0.05, -0.22, 0.97, 4.5),
        ( 0.03,  0.02, 0.46, 0.205,  0.08,  0.06, 0.99, 1.8),  # tall natural apex focal blossom
    ]
    for idx, (hx, hy, hz, diam, tx, ty, tz, yaw_ref) in enumerate(single_stems):
        hub = Vector((hx, hy, hz))
        p_root = Vector((hx * 0.22, hy * 0.22, -0.04))
        p_mid = Vector((hx * 0.54 + rng.uniform(-0.015, 0.015), hy * 0.54 + rng.uniform(-0.015, 0.015), hz * 0.46))
        p_tip = hub - Vector((0.0, 0.0, 0.01))
        _add_tapered_tube(bm_b, col_b, [p_root, p_mid, p_tip], [0.010, 0.007, 0.004], stem_cols, segs=3, uv_layer=uv_b, u_tile=1.0, v_tile=2.2)

        n_vec = Vector((tx, ty, tz)).normalized()
        cf, cs, cu = _make_head_basis(n_vec, yaw_ref)
        add_cambered_card(
            bm_c, uv_c, col_c,
            origin=hub - cf * (diam * 0.5),
            forward=cf, side=cs, up=cu,
            length=diam, width=diam,
            arch=0.026, v_fold=0.022, uv_rect=uv_single,
            tint_base=_srgb_rgba(0.95, 0.96, 0.94), tint_tip=_srgb_rgba(1.0, 1.0, 1.0), cols=3, rows=3,
        )

    me_b = bpy.data.meshes.new("DaisyStems")
    bm_b.to_mesh(me_b)
    bm_b.free()
    me_b.materials.append(mat_stem)
    obj_b = bpy.data.objects.new("DaisyStems", me_b)
    bpy.context.scene.collection.objects.link(obj_b)

    me_c = bpy.data.meshes.new("DaisyFoliage")
    bm_c.to_mesh(me_c)
    bm_c.free()
    me_c.materials.append(mat_card)
    obj_c = bpy.data.objects.new("DaisyFoliage", me_c)
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
        _build_master_daisy_sprig_scene,
        out_dir=SCRIPT_DIR,
        size=1024,
        ortho_scale=2.0,
        samples_albedo=24,
        ao_distance=0.07,
        ao_strength=0.24,
        alpha_boost=0.88,
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    stem_alb, stem_nrm = generate_bark_textures(
        out_dir=SCRIPT_DIR,
        size=256,
        ridge_srgb=(0.38, 0.58, 0.24),
        fissure_srgb=(0.24, 0.42, 0.15),
        plate_freq_x=5.0,
        plate_freq_y=2.2,
        normal_amp=0.75,
        seed=3106,
    )
    mat_stem = make_textured_bark_material(
        "DaisyStems",
        albedo_path=stem_alb,
        normal_path=stem_nrm,
        roughness=0.76,
        normal_strength=0.38,
    )
    mat_card = make_leaf_card_material(
        "DaisySprigs",
        albedo_path=albedo_path,
        normal_path=normal_path,
        cutoff=0.36,
        roughness=0.66,
        normal_strength=0.36,
    )
    bsdf = mat_card.node_tree.nodes["Principled BSDF"]
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.07
    nt = mat_card.node_tree
    tex_alb = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image.colorspace_settings.name != "Non-Color"), None)
    if tex_alb and "Emission Color" in bsdf.inputs:
        nt.links.new(tex_alb.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.056

    obj_stem, obj_fol = _build_daisy_base_and_cards(mat_stem, mat_card)
    _normalize_bounds([obj_stem, obj_fol])
    apply_radial_canopy_normals(
        obj_fol.data,
        center=Vector((0.0, 0.0, 0.08)),
        sky_bias=1.25,
        blend_geom=0.07,
    )

    bpy.context.view_layer.update()
    pts = [v.co for o in (obj_stem, obj_fol) for v in o.data.vertices]
    tris = sum(max(1, len(p.vertices) - 2) for o in (obj_stem, obj_fol) for p in o.data.polygons)
    print(f"DAISY_V2_BOUNDS w={max(p.x for p in pts)-min(p.x for p in pts):.4f} d={max(p.y for p in pts)-min(p.y for p in pts):.4f} h={max(p.z for p in pts)-min(p.z for p in pts):.4f} minZ={min(p.z for p in pts):.4f} tris={tris}")

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
