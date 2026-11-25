"""Shared procedural PBR textures, architectural bmesh builders, and GLB export helpers for Moonbay Coast 3D buildings."""
import math
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0


def make_packed_image(out_dir: Path, name: str, w: int, h: int, rgba: np.ndarray, colorspace: str = "sRGB"):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(rgba, 0.0, 1.0).astype(np.float32).ravel())
    out_file = (out_dir / f"{name}.png").resolve()
    img.filepath_raw = str(out_file)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def _smooth_grid(h: int, w: int, seed: int, passes: int = 2):
    rng = np.random.default_rng(seed)
    arr = rng.normal(0.0, 1.0, (h, w)).astype(np.float32)
    for _ in range(passes):
        arr = (
            0.36 * arr
            + 0.16 * (np.roll(arr, 1, 0) + np.roll(arr, -1, 0) + np.roll(arr, 1, 1) + np.roll(arr, -1, 1))
        )
    return arr


def make_stucco_textures(out_dir: Path, prefix: str, base_rgb, tint_warm, seed: int, size: int = 512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    n1 = _smooth_grid(size, size, seed, 4)
    n2 = _smooth_grid(size, size, seed + 17, 1)
    # Subtle plaster trowel swirls & faint ashlar mortar lines near plinth courses
    trowel = 0.045 * np.sin(u * 14.0 + n1 * 1.4) * np.cos(v * 11.0 - n1 * 1.1) + 0.055 * n1 + 0.025 * n2
    tone = np.clip(0.97 + trowel, 0.84, 1.08)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    warm_mix = np.clip(0.5 + 0.45 * n1, 0.0, 1.0)
    for c in range(3):
        col = base_rgb[c] * (1.0 - 0.18 * warm_mix) + tint_warm[c] * (0.18 * warm_mix)
        rgba[..., c] = col * tone
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.84 - 0.10 * n1 + 0.06 * n2, 0.68, 0.94)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_stone_textures(out_dir: Path, prefix: str, light_rgb, dark_rgb, rows: int, cols: int, seed: int, size: int = 512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    n1 = _smooth_grid(size, size, seed, 3)
    n2 = _smooth_grid(size, size, seed + 31, 1)

    row_f = v * rows
    row_i = np.floor(row_f).astype(np.int32)
    stagger = (row_i % 2) * 0.5
    col_f = u * cols + stagger
    col_i = np.floor(col_f).astype(np.int32)

    du = np.minimum(col_f % 1.0, 1.0 - (col_f % 1.0))
    dv = np.minimum(row_f % 1.0, 1.0 - (row_f % 1.0))
    mortar_u = np.exp(-((du / 0.035) ** 2))
    mortar_v = np.exp(-((dv / 0.045) ** 2))
    mortar = np.maximum(mortar_u, mortar_v)

    rng = np.random.default_rng(seed + 99)
    block_var = rng.uniform(-0.08, 0.08, (rows + 2, cols + 2)).astype(np.float32)
    per_block = block_var[row_i % (rows + 1), col_i % (cols + 1)]

    rgba = np.ones((size, size, 4), dtype=np.float32)
    speckle = 0.05 * n1 + 0.03 * n2 + per_block
    for c in range(3):
        block_c = light_rgb[c] * (0.98 + speckle)
        mortar_c = dark_rgb[c] * 0.85
        rgba[..., c] = block_c * (1.0 - 0.55 * mortar) + mortar_c * (0.55 * mortar)
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.80 + 0.12 * mortar - 0.08 * n1 + 0.05 * n2, 0.62, 0.96)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_wood_textures(out_dir: Path, prefix: str, base_rgb, dark_rgb, planks: int, seed: int, size: int = 512, vertical: bool = False):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    rng = np.random.default_rng(seed)
    col_noise = rng.normal(0.0, 1.0, size).astype(np.float32)
    k = np.array([0.16, 0.22, 0.24, 0.22, 0.16], dtype=np.float32)
    row_smooth = np.convolve(np.pad(col_noise, 2, mode="wrap"), k, mode="valid")
    deflect = 0.005 * np.sin(u * 5.0 * math.pi + v * 3.0)
    idx_v = np.clip(((v + deflect) % 1.0 * size).astype(np.int32), 0, size - 1)
    fibers = row_smooth[idx_v] * 0.22

    grain = 0.55 + fibers * 0.42 + 0.09 * np.sin(v * 54.0 * math.pi + np.sin(u * 3.0 * math.pi) * 0.45)
    if planks > 1:
        pf = v * planks
        pi = np.floor(pf).astype(np.int32)
        dp = np.minimum(pf % 1.0, 1.0 - (pf % 1.0))
        seam = np.exp(-((dp / 0.032) ** 2))
        p_var = rng.uniform(-0.10, 0.10, planks + 2).astype(np.float32)[pi % (planks + 1)]
    else:
        seam = np.zeros_like(u)
        p_var = 0.0

    rgba = np.ones((size, size, 4), dtype=np.float32)
    tone = np.clip(0.86 + 0.20 * grain + p_var, 0.58, 1.12)
    for c in range(3):
        col = base_rgb[c] * tone
        rgba[..., c] = col * (1.0 - 0.62 * seam) + dark_rgb[c] * (0.62 * seam)
    if vertical:
        # Rotate generated horizontal grain + plank seams cleanly by 90 deg so planks run VERTICALLY along V!
        rgba = np.transpose(rgba, (1, 0, 2)).copy()
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.72 - 0.14 * grain + 0.16 * seam, 0.46, 0.92)
    if vertical:
        r_val = r_val.T
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_stained_glass_textures(out_dir: Path, prefix: str, deep_rgb, jewel_rgb, seed: int, size: int = 512):
    """Synthesize diamond/grid leaded cathedral glass w/ per-pane jewel variation & glossy clearcoat low-roughness map."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    # Diamond-quilt leaded glass grid + delicate center jewel shimmer
    d1 = (u * 5.0 + v * 5.0)
    d2 = (u * 5.0 - v * 5.0)
    i1 = np.floor(d1).astype(np.int32)
    i2 = np.floor(d2).astype(np.int32)
    lead1 = np.exp(-((np.minimum(d1 % 1.0, 1.0 - (d1 % 1.0))) / 0.045) ** 2)
    lead2 = np.exp(-((np.minimum(d2 % 1.0, 1.0 - (d2 % 1.0))) / 0.045) ** 2)
    lead = np.maximum(lead1, lead2)
    rng = np.random.default_rng(seed)
    pane_var = rng.uniform(0.0, 1.0, (16, 16)).astype(np.float32)[np.abs(i1) % 16, np.abs(i2) % 16]
    wave = 0.06 * np.sin(u * 22.0 + np.cos(v * 18.0))
    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        pane_c = deep_rgb[c] * (1.0 - 0.65 * pane_var) + jewel_rgb[c] * (0.65 * pane_var) + wave * 0.08
        rgba[..., c] = np.clip(pane_c * (1.0 - 0.78 * lead) + 0.04 * lead, 0.0, 1.0)
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.05 + 0.04 * pane_var + 0.55 * lead, 0.04, 0.75)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_shingle_textures(out_dir: Path, prefix: str, main_rgb, alt_rgb, rows: int, cols: int, seed: int, size: int = 512, moss_tint=None):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    n1 = _smooth_grid(size, size, seed, 3)
    row_f = v * rows
    row_i = np.floor(row_f).astype(np.int32)
    col_f = u * cols + (row_i % 2) * 0.5
    col_i = np.floor(col_f).astype(np.int32)
    du = np.minimum(col_f % 1.0, 1.0 - (col_f % 1.0))
    dv = row_f % 1.0
    gap_u = np.exp(-((du / 0.04) ** 2))
    underlap = np.exp(-((dv / 0.09) ** 2))

    rng = np.random.default_rng(seed + 41)
    tile_tone = rng.uniform(0.0, 1.0, (rows + 2, cols + 2)).astype(np.float32)[row_i % (rows + 1), col_i % (cols + 1)]
    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        mix_c = main_rgb[c] * (1.0 - 0.38 * tile_tone) + alt_rgb[c] * (0.38 * tile_tone)
        mix_c *= (0.94 + 0.08 * n1) * (1.0 - 0.24 * underlap - 0.18 * gap_u)
        if moss_tint is not None:
            moss_mask = np.clip((n1 + 0.15) * 1.4, 0.0, 0.55)
            mix_c = mix_c * (1.0 - moss_mask) + moss_tint[c] * moss_mask
        rgba[..., c] = mix_c
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.70 + 0.12 * tile_tone + 0.10 * underlap, 0.55, 0.90)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_striped_awning_textures(out_dir: Path, prefix: str, stripe_rgb, cream_rgb, stripes: float = 7.0, size: int = 512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    weave = 0.032 * np.sin(xx * 1.45) * np.sin(yy * 1.45) + 0.018 * np.sin(xx * 0.4 + yy * 0.36)
    phase = (u * stripes) % 2.0
    is_color = phase < 1.0
    seam = np.exp(-((np.minimum(phase % 1.0, 1.0 - (phase % 1.0))) * 28.0) ** 2)
    hem = np.exp(-((np.maximum(0.0, 0.10 - v) / 0.10) ** 2))

    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        base = np.where(is_color, stripe_rgb[c], cream_rgb[c])
        base = np.where(v < 0.055, cream_rgb[c] * 0.96, base)
        rgba[..., c] = base * (1.0 + weave - 0.10 * seam - 0.06 * hem)
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.86 + weave * 0.5, 0.76, 0.94)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_copper_patina_textures(out_dir: Path, prefix: str, deep_rgb, bright_rgb, seed: int, size: int = 512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u, v = xx / size, yy / size
    n1 = _smooth_grid(size, size, seed, 3)
    n2 = _smooth_grid(size, size, seed + 23, 1)
    panel_u = np.exp(-((np.minimum((u * 8.0) % 1.0, 1.0 - ((u * 8.0) % 1.0))) / 0.03) ** 2)
    panel_v = np.exp(-((np.minimum((v * 5.0) % 1.0, 1.0 - ((v * 5.0) % 1.0))) / 0.04) ** 2)
    seam = np.maximum(panel_u, panel_v)
    patina = np.clip(0.5 + 0.35 * n1 + 0.18 * (1.0 - v), 0.0, 1.0)
    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        col = deep_rgb[c] * (1.0 - patina) + bright_rgb[c] * patina
        rgba[..., c] = col * (0.95 + 0.06 * n2) * (1.0 - 0.22 * seam)
    col_img = make_packed_image(out_dir, f"{prefix}-col", size, size, rgba, "sRGB")

    r_rgba = np.ones((size, size, 4), dtype=np.float32)
    r_val = np.clip(0.28 + 0.20 * patina + 0.12 * seam, 0.20, 0.62)
    for c in range(3):
        r_rgba[..., c] = r_val
    r_img = make_packed_image(out_dir, f"{prefix}-rough", size, size, r_rgba, "Non-Color")
    return col_img, r_img


def make_pbr_mat(name: str, col_img=None, rough_img=None, color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.65, emission=None, emission_strength=0.0, double_sided=False, coat: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double_sided
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = metallic
    if coat > 0.0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    if col_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = col_img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
    if rough_img is not None:
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = rough_img
        nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def ensure_uv_and_col(bm):
    uv_layer = bm.loops.layers.uv.verify()
    col_layer = bm.loops.layers.color.verify()
    return uv_layer, col_layer


def assign_box_uvs(bm, scale: float = 0.32, faces=None):
    uv_layer, col_layer = ensure_uv_and_col(bm)
    target = faces if faces is not None else bm.faces
    for f in target:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            p = loop.vert.co
            if az >= ax and az >= ay:
                u, v = p.x * scale, p.y * scale
            elif ax >= ay:
                u, v = p.y * scale, p.z * scale
            else:
                u, v = p.x * scale, p.z * scale
            loop[uv_layer].uv = (u, v)
            loop[col_layer] = (1.0, 1.0, 1.0, 1.0)


def paint_faces(bm, faces, mat_idx: int, smooth: bool = False, uv_scale: float = 0.35, tint=(1.0, 1.0, 1.0, 1.0)):
    uv_layer, col_layer = ensure_uv_and_col(bm)
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            p = loop.vert.co
            if az >= ax and az >= ay:
                u, v = p.x * uv_scale, p.y * uv_scale
            elif ax >= ay:
                u, v = p.y * uv_scale, p.z * scale_z(uv_scale)
            else:
                u, v = p.x * uv_scale, p.z * uv_scale
            loop[uv_layer].uv = (u, v)
            loop[col_layer] = tint


def scale_z(s):
    return s


def add_box(bm, center, size, mat_idx: int, bevel: float = 0.0, rot_euler=(0.0, 0.0, 0.0), smooth: bool = False, uv_scale: float = 0.35):
    sx, sy, sz = size
    m = Matrix.Translation(Vector(center)) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1.0))
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    verts = ret["verts"]
    faces = list({f for v in verts for f in v.link_faces})
    if bevel > 0.0:
        edges = list({e for v in verts for e in v.link_edges})
        res = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
        seed = [v for v in verts if v.is_valid] + [v for v in res.get("verts", []) if v.is_valid]
        seen = set(seed)
        stack = list(seed)
        while stack:
            v = stack.pop()
            for e in v.link_edges:
                ov = e.other_vert(v)
                if ov.is_valid and ov not in seen:
                    seen.add(ov)
                    stack.append(ov)
        faces = list({f for v in seen for f in v.link_faces if f.is_valid} | {f for f in res.get("faces", []) if f.is_valid})
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    paint_faces(bm, faces, mat_idx, smooth=smooth, uv_scale=uv_scale)
    return faces


def add_cyl(bm, p0, p1, r0: float, r1: float, segs: int, mat_idx: int, smooth: bool = True, uv_scale: float = 0.4, cap: bool = True):
    v0, v1 = Vector(p0), Vector(p1)
    vec = v1 - v0
    length = vec.length
    if length < 1e-6:
        return []
    rot = vec.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    mid = (v0 + v1) * 0.5
    mat = Matrix.Translation(mid) @ rot
    ret = bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r0, radius2=r1, depth=length, matrix=mat)
    verts = ret["verts"]
    faces = list({f for v in verts for f in v.link_faces})
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    uv_layer, col_layer = ensure_uv_and_col(bm)
    for f in faces:
        f.material_index = mat_idx
        is_cap = abs(f.normal.dot(vec.normalized())) > 0.85
        f.smooth = False if is_cap else smooth
        for loop in f.loops:
            p = loop.vert.co
            loop[uv_layer].uv = ((p.x + p.y) * uv_scale, p.z * uv_scale)
            loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
    return faces


def add_sphere(bm, center, radius: float, scale=(1.0, 1.0, 1.0), subdivisions: int = 2, mat_idx: int = 0, smooth: bool = True):
    m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    ret = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius, matrix=m)
    verts = ret["verts"]
    faces = list({f for v in verts for f in v.link_faces})
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    paint_faces(bm, faces, mat_idx, smooth=smooth, uv_scale=0.6)
    return faces


def add_lathe(bm, profile_rz, segs: int, mat_idx: int, center=(0.0, 0.0, 0.0), smooth_side: bool = True, uv_scale: float = 0.4):
    """Build clean turned cylindrical architectural element from [(r, z), ...] bottom to top."""
    cx, cy, cz = center
    uv_layer, col_layer = ensure_uv_and_col(bm)
    rings = []
    for r, z in profile_rz:
        if r <= 1e-5:
            rings.append([bm.verts.new(Vector((cx, cy, cz + z)))])
        else:
            ring = []
            for i in range(segs):
                a = 2.0 * math.pi * i / segs
                ring.append(bm.verts.new(Vector((cx + r * math.cos(a), cy + r * math.sin(a), cz + z))))
            rings.append(ring)

    faces = []
    for k in range(len(rings) - 1):
        r0, r1 = rings[k], rings[k + 1]
        is_flat = abs(profile_rz[k][1] - profile_rz[k + 1][1]) < 1e-4
        if len(r0) == 1 and len(r1) == 1:
            continue
        if len(r0) == 1:
            v_hub = r0[0]
            for i in range(segs):
                j = (i + 1) % segs
                f = bm.faces.new((v_hub, r1[j], r1[i]))
                f.material_index = mat_idx
                f.smooth = False
                faces.append(f)
        elif len(r1) == 1:
            v_hub = r1[0]
            for i in range(segs):
                j = (i + 1) % segs
                f = bm.faces.new((r0[i], r0[j], v_hub))
                f.material_index = mat_idx
                f.smooth = False
                faces.append(f)
        else:
            for i in range(segs):
                j = (i + 1) % segs
                f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
                f.material_index = mat_idx
                f.smooth = False if is_flat else smooth_side
                faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        for loop in f.loops:
            p = loop.vert.co
            ang = math.atan2(p.y - cy, p.x - cx)
            loop[uv_layer].uv = (ang * 0.5, (p.z - cz) * uv_scale)
            loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
    return faces


def add_curved_arch_extrude(bm, half_span: float, spring_z: float, rise: float, depth: float, thickness: float, segs: int, mat_idx: int, rot_z: float = 0.0, offset=(0.0, 0.0, 0.0)):
    """Extrude clean semicircular arch ring facing -Y (front +Z in Three.js)."""
    rot = Matrix.Rotation(rot_z, 4, "Z")
    off = Vector(offset)
    uv_layer, col_layer = ensure_uv_and_col(bm)
    rings = []
    for i in range(segs + 1):
        t = i / segs
        ang = math.pi * t
        cx = -math.cos(ang) * half_span
        cz = spring_z + math.sin(ang) * rise
        nx = -math.cos(ang)
        nz = math.sin(ang)
        v_in_f = off + (rot @ Vector((cx - nx * thickness * 0.5, -depth * 0.5, cz - nz * thickness * 0.5)))
        v_out_f = off + (rot @ Vector((cx + nx * thickness * 0.5, -depth * 0.5, cz + nz * thickness * 0.5)))
        v_out_b = off + (rot @ Vector((cx + nx * thickness * 0.5, depth * 0.5, cz + nz * thickness * 0.5)))
        v_in_b = off + (rot @ Vector((cx - nx * thickness * 0.5, depth * 0.5, cz - nz * thickness * 0.5)))
        rings.append([bm.verts.new(v_in_f), bm.verts.new(v_out_f), bm.verts.new(v_out_b), bm.verts.new(v_in_b)])

    faces = []
    for i in range(segs):
        a, b = rings[i], rings[i + 1]
        for k in range(4):
            kn = (k + 1) % 4
            f = bm.faces.new((a[k], a[kn], b[kn], b[k]))
            f.material_index = mat_idx
            f.smooth = False
            faces.append(f)
    # Caps
    for r_end in (rings[0], list(reversed(rings[-1]))):
        f = bm.faces.new(r_end)
        f.material_index = mat_idx
        f.smooth = False
        faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        for loop in f.loops:
            p = loop.vert.co
            loop[uv_layer].uv = ((p.x + p.y) * 0.4, p.z * 0.4)
            loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
    return faces


def add_arched_window(bm, center, width: float, height: float, yaw: float, frame_mat: int, glass_mat: int, sill_mat: int, cross_mullions: bool = True, planter: bool = False, flower_mat: int = None, leaf_mat: int = None):
    """Architectural recessed arched window facing local -Y (rotated by yaw around Z)."""
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)

    def xform(x, y, z):
        return org + (rot @ Vector((x, y, z)))

    rect_h = max(0.25, height - width * 0.5)
    # Stone / plaster outer frame piers + sill + lintel arch
    pier_w = width * 0.14
    frame_d = 0.22
    add_box(bm, xform(-width * 0.5 + pier_w * 0.5, -0.04, -height * 0.5 + rect_h * 0.5), (pier_w, frame_d, rect_h), frame_mat, bevel=0.015, rot_euler=(0, 0, yaw))
    add_box(bm, xform(width * 0.5 - pier_w * 0.5, -0.04, -height * 0.5 + rect_h * 0.5), (pier_w, frame_d, rect_h), frame_mat, bevel=0.015, rot_euler=(0, 0, yaw))
    add_curved_arch_extrude(bm, width * 0.5 - pier_w * 0.5, -height * 0.5 + rect_h, width * 0.5 - pier_w * 0.5, frame_d, pier_w, 20, frame_mat, rot_z=yaw, offset=org + (rot @ Vector((0, -0.04, 0))))
    # Sill
    add_box(bm, xform(0.0, -0.09, -height * 0.5 - 0.04), (width * 1.14, 0.28, 0.11), sill_mat, bevel=0.02, rot_euler=(0, 0, yaw))

    # Recessed glass pane + crisp cross mullions
    inner_w = width - pier_w * 2.0
    add_box(bm, xform(0.0, 0.03, -height * 0.5 + rect_h * 0.5), (inner_w, 0.05, rect_h), glass_mat, rot_euler=(0, 0, yaw))
    add_cyl(bm, xform(0.0, 0.05, -height * 0.5 + rect_h), xform(0.0, 0.0, -height * 0.5 + rect_h), inner_w * 0.5, inner_w * 0.5, 22, glass_mat, smooth=False)
    if cross_mullions:
        bar_t = max(0.035, width * 0.045)
        add_box(bm, xform(0.0, -0.01, -height * 0.5 + (height - pier_w) * 0.5), (bar_t, 0.07, height - pier_w * 1.2), frame_mat, rot_euler=(0, 0, yaw))
        add_box(bm, xform(0.0, -0.01, -height * 0.5 + rect_h * 0.65), (inner_w, 0.07, bar_t), frame_mat, rot_euler=(0, 0, yaw))

    # Optional wooden flower window-box with cambered ovate leaf rosettes & crisp multi-petal blossoms
    if planter and leaf_mat is not None:
        import random
        rng_p = random.Random(int(abs(org.x * 37 + org.y * 53 + org.z * 19) * 100) + 7)
        bx_z = -height * 0.5 - 0.14
        add_box(bm, xform(0.0, -0.18, bx_z), (width * 0.96, 0.26, 0.18), sill_mat, bevel=0.015, rot_euler=(0, 0, yaw))
        add_box(bm, xform(0.0, -0.18, bx_z + 0.08), (width * 0.86, 0.18, 0.04), frame_mat, rot_euler=(0, 0, yaw))
        for k in (-0.34, -0.20, -0.06, 0.08, 0.22, 0.34):
            base_pt = xform(k * width, -0.18, bx_z + 0.10)
            for li in range(3):
                la = rng_p.uniform(-math.pi, math.pi)
                lp = rng_p.uniform(0.28, 0.78)
                fwd_loc = rot @ Vector((math.cos(la) * math.cos(lp), math.sin(la) * math.cos(lp) - 0.25, math.sin(lp))).normalized()
                add_cambered_leaf(bm, base_pt, fwd_loc, rot @ Vector((0.0, -0.6, 0.8)), 0.15, 0.095, leaf_mat)
            if flower_mat is not None and abs(k) < 0.32:
                fc = xform(k * width, -0.21, bx_z + 0.19)
                n_dir = (rot @ Vector((0.0, -0.75, 0.66))).normalized()
                up_t = Vector((0, 0, 1))
                u_t = n_dir.cross(up_t).normalized()
                v_t = n_dir.cross(u_t).normalized()
                pr = 0.055
                for pi in range(5):
                    pa = pi * math.tau / 5.0
                    rd = u_t * math.cos(pa) + v_t * math.sin(pa)
                    sd = -u_t * math.sin(pa) + v_t * math.cos(pa)
                    pf = bm.faces.new((
                        bm.verts.new(fc),
                        bm.verts.new(fc + rd * (pr * 0.6) + sd * (pr * 0.3)),
                        bm.verts.new(fc + rd * pr),
                        bm.verts.new(fc + rd * (pr * 0.6) - sd * (pr * 0.3)),
                    ))
                    paint_faces(bm, [pf], flower_mat, smooth=True, uv_scale=1.0)
                add_sphere(bm, fc + n_dir * 0.015, 0.022, (1, 1, 1), 1, sill_mat, smooth=True)


def add_round_window(bm, center, radius: float, yaw: float, frame_mat: int, glass_mat: int):
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    # Frame ring segments
    segs = 18
    for i in range(segs):
        a0 = 2.0 * math.pi * i / segs
        a1 = 2.0 * math.pi * (i + 1) / segs
        am = (a0 + a1) * 0.5
        seg_l = 2.0 * math.pi * radius / segs * 1.15
        p = xform(math.cos(am) * radius, -0.04, math.sin(am) * radius)
        m_rot = rot @ Matrix.Rotation(-am, 4, "Y")
        e = m_rot.to_euler("XYZ")
        add_box(bm, p, (radius * 0.24, 0.18, seg_l), frame_mat, bevel=0.01, rot_euler=e)
    add_cyl(bm, xform(0, 0.03, 0), xform(0, -0.01, 0), radius * 0.92, radius * 0.92, 18, glass_mat, smooth=False)
    t = max(0.04, radius * 0.12)
    add_box(bm, xform(0, -0.02, 0), (t, 0.08, radius * 1.8), frame_mat, rot_euler=(0, 0, yaw))
    add_box(bm, xform(0, -0.02, 0), (radius * 1.8, 0.08, t), frame_mat, rot_euler=(0, 0, yaw))


def add_arched_door(bm, center, width: float, height: float, yaw: float, door_mat: int, frame_mat: int, metal_mat: int, step_mat: int = None):
    """Paneled double timber door with curved arch surround, brass handles, hinge straps, and optional stone threshold."""
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))

    arch_r = width * 0.5
    rect_h = height - arch_r
    pier_w = width * 0.13
    # Door frame piers + arch
    add_box(bm, xform(-width * 0.5 - pier_w * 0.3, -0.06, rect_h * 0.5), (pier_w, 0.24, rect_h), frame_mat, bevel=0.02, rot_euler=(0, 0, yaw))
    add_box(bm, xform(width * 0.5 + pier_w * 0.3, -0.06, rect_h * 0.5), (pier_w, 0.24, rect_h), frame_mat, bevel=0.02, rot_euler=(0, 0, yaw))
    add_curved_arch_extrude(bm, arch_r + pier_w * 0.3, rect_h, arch_r + pier_w * 0.3, 0.24, pier_w, 16, frame_mat, rot_z=yaw, offset=org + (rot @ Vector((0, -0.06, 0))))

    # Clean arch-top paneled double timber door leaf (semicircular arch extrusion strictly for Z >= rect_h, zero Z-fighting!)
    leaf_front_y = -0.025
    leaf_back_y = 0.065
    add_box(bm, xform(0, (leaf_front_y + leaf_back_y) * 0.5, rect_h * 0.5), (width, leaf_back_y - leaf_front_y, rect_h), door_mat, rot_euler=(0, 0, yaw))
    # Extruded semicircular arch lunette exclusively above rect_h
    uv_layer, col_layer = ensure_uv_and_col(bm)
    segs_arch = 16
    cf = xform(0, leaf_front_y, rect_h)
    cb = xform(0, leaf_back_y, rect_h)
    vf_hub = bm.verts.new(cf)
    vb_hub = bm.verts.new(cb)
    arc_f = []
    arc_b = []
    for i in range(segs_arch + 1):
        ang = math.pi * i / segs_arch
        ax = -math.cos(ang) * arch_r
        az = rect_h + math.sin(ang) * arch_r
        arc_f.append(bm.verts.new(xform(ax, leaf_front_y, az)))
        arc_b.append(bm.verts.new(xform(ax, leaf_back_y, az)))
    arch_faces = []
    for i in range(segs_arch):
        arch_faces.append(bm.faces.new((vf_hub, arc_f[i + 1], arc_f[i])))
        arch_faces.append(bm.faces.new((vb_hub, arc_b[i], arc_b[i + 1])))
        arch_faces.append(bm.faces.new((arc_f[i], arc_f[i + 1], arc_b[i + 1], arc_b[i])))
    bmesh.ops.recalc_face_normals(bm, faces=arch_faces)
    paint_faces(bm, arch_faces, door_mat, smooth=False, uv_scale=0.35)
    # Brass escutcheon backplates, handles, vertical stile groove, bottom kickplate & wrought hinge straps
    add_box(bm, xform(0, leaf_front_y - 0.015, height * 0.45), (0.06, 0.03, height * 0.86), metal_mat, rot_euler=(0, 0, yaw))
    add_box(bm, xform(0, leaf_front_y - 0.010, 0.07), (width * 0.96, 0.024, 0.12), metal_mat, rot_euler=(0, 0, yaw))
    # Subtle beveled vertical stile grille bars capped with tie rails & spear finials
    for pi in (-0.34, -0.17, 0.17, 0.34):
        gx = pi * width
        add_box(bm, xform(gx, leaf_front_y - 0.004, rect_h * 0.50), (0.022, 0.014, rect_h * 0.86), metal_mat, rot_euler=(0, 0, yaw))
        add_sphere(bm, xform(gx, leaf_front_y - 0.006, rect_h * 0.945), 0.022, (0.85, 0.70, 1.45), 1, metal_mat, smooth=True)
    for lx in (-0.255 * width, 0.255 * width):
        add_box(bm, xform(lx, leaf_front_y - 0.005, rect_h * 0.915), (0.21 * width, 0.016, 0.026), metal_mat, rot_euler=(0, 0, yaw))
    for s in (-1, 1):
        # Oval/diamond brass escutcheon backplate behind knob
        add_box(bm, xform(s * 0.13, leaf_front_y - 0.016, rect_h * 0.54), (0.09, 0.020, 0.22), metal_mat, bevel=0.008, rot_euler=(0, 0, yaw))
        add_sphere(bm, xform(s * 0.13, leaf_front_y - 0.052, rect_h * 0.54), 0.056, (1.0, 1.0, 1.0), 1, metal_mat, smooth=True)
        for hz in (rect_h * 0.22, rect_h * 0.76):
            add_box(bm, xform(s * (width * 0.31), leaf_front_y - 0.018, hz), (width * 0.32, 0.025, 0.062), metal_mat, rot_euler=(0, 0, yaw))

    if step_mat is not None:
        add_box(bm, xform(0, -0.22, -0.08), (width * 1.32, 0.52, 0.16), step_mat, bevel=0.025, rot_euler=(0, 0, yaw))


def add_wall_lantern(bm, center, yaw: float, metal_mat: int, glass_mat: int):
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    add_box(bm, xform(0, -0.03, 0), (0.14, 0.06, 0.22), metal_mat, bevel=0.01, rot_euler=(0, 0, yaw))
    add_box(bm, xform(0, -0.14, 0.04), (0.04, 0.22, 0.04), metal_mat, rot_euler=(0, 0, yaw))
    add_cyl(bm, xform(0, -0.22, -0.18), xform(0, -0.22, -0.02), 0.075, 0.095, 6, glass_mat, smooth=False)
    add_cyl(bm, xform(0, -0.22, -0.02), xform(0, -0.22, 0.05), 0.12, 0.03, 6, metal_mat, smooth=False)
    add_cyl(bm, xform(0, -0.22, -0.22), xform(0, -0.22, -0.18), 0.03, 0.085, 6, metal_mat, smooth=False)


def add_scalloped_awning(bm, center, width: float, proj: float, drop: float, yaw: float, awning_mat: int, wood_mat: int, scallops: int = 8):
    """Crisp angled striped awning with solid underside, scalloped front valance & carved timber brackets."""
    rot = Matrix.Rotation(yaw, 4, "Z")
    org = Vector(center)
    xform = lambda x, y, z: org + (rot @ Vector((x, y, z)))
    uv_layer, col_layer = ensure_uv_and_col(bm)

    # Angled canopy slab using clean parallel quad grid across width
    ny = 4
    nx = max(6, scallops)
    grid_top = []
    grid_bot = []
    for iy in range(ny + 1):
        ty = iy / ny
        y = -ty * proj
        z = -ty * drop
        row_t, row_b = [], []
        for ix in range(nx + 1):
            tx = ix / nx
            x = (tx - 0.5) * width
            row_t.append(bm.verts.new(xform(x, y, z + 0.02)))
            row_b.append(bm.verts.new(xform(x, y, z - 0.02)))
        grid_top.append(row_t)
        grid_bot.append(row_b)

    faces = []
    for iy in range(ny):
        ty0, ty1 = iy / ny, (iy + 1) / ny
        for ix in range(nx):
            tx0, tx1 = ix / nx, (ix + 1) / nx
            ft = bm.faces.new((grid_top[iy][ix], grid_top[iy][ix + 1], grid_top[iy + 1][ix + 1], grid_top[iy + 1][ix]))
            ft.material_index = awning_mat
            ft.smooth = False
            for loop, (u, v) in zip(ft.loops, [(tx0, 1.0 - ty0 * 0.8), (tx1, 1.0 - ty0 * 0.8), (tx1, 1.0 - ty1 * 0.8), (tx0, 1.0 - ty1 * 0.8)]):
                loop[uv_layer].uv = (u, v)
                loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
            fb = bm.faces.new((grid_bot[iy][ix + 1], grid_bot[iy][ix], grid_bot[iy + 1][ix], grid_bot[iy + 1][ix + 1]))
            fb.material_index = awning_mat
            fb.smooth = False
            for loop in fb.loops:
                loop[uv_layer].uv = (0.28, 0.05)
                loop[col_layer] = (0.94, 0.90, 0.84, 1.0)
            faces.extend((ft, fb))

    # Side rim caps
    for iy in range(ny):
        fL = bm.faces.new((grid_top[iy][0], grid_top[iy + 1][0], grid_bot[iy + 1][0], grid_bot[iy][0]))
        fR = bm.faces.new((grid_top[iy + 1][-1], grid_top[iy][-1], grid_bot[iy][-1], grid_bot[iy + 1][-1]))
        for f in (fL, fR):
            f.material_index = awning_mat
            f.smooth = False
            for loop in f.loops:
                loop[uv_layer].uv = (0.28, 0.05)
                loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
        faces.extend((fL, fR))

    # Scalloped front valance drop
    for ix in range(nx):
        tx0, tx1 = ix / nx, (ix + 1) / nx
        x0, x1 = (tx0 - 0.5) * width, (tx1 - 0.5) * width
        sc0 = 0.14 + 0.04 * abs(math.sin(tx0 * math.pi * scallops))
        sc1 = 0.14 + 0.04 * abs(math.sin(tx1 * math.pi * scallops))
        va = grid_bot[-1][ix]
        vb = grid_bot[-1][ix + 1]
        vc = bm.verts.new(xform(x1, -proj, -drop - sc1))
        vd = bm.verts.new(xform(x0, -proj, -drop - sc0))
        fv = bm.faces.new((va, vb, vc, vd))
        fv.material_index = awning_mat
        fv.smooth = False
        for loop, (u, v) in zip(fv.loops, [(tx0, 0.15), (tx1, 0.15), (tx1, 0.01), (tx0, 0.01)]):
            loop[uv_layer].uv = (u, v)
            loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
        faces.append(fv)

    # Gusseted triangular canvas end cheeks + curved lower valance fringe
    for end_x, cap_sign in ((-width * 0.5, 1), (width * 0.5, -1)):
        v_top = bm.verts.new(xform(end_x, 0.0, 0.0))
        v_wall_b = bm.verts.new(xform(end_x, 0.0, -drop))
        v_front_b = bm.verts.new(xform(end_x, -proj, -drop - 0.14))
        v_in_top = bm.verts.new(xform(end_x + cap_sign * 0.04, 0.0, 0.0))
        v_in_wb = bm.verts.new(xform(end_x + cap_sign * 0.04, 0.0, -drop))
        v_in_fb = bm.verts.new(xform(end_x + cap_sign * 0.04, -proj, -drop - 0.14))
        gf_out = bm.faces.new((v_top, v_wall_b, v_front_b) if cap_sign > 0 else (v_top, v_front_b, v_wall_b))
        gf_in = bm.faces.new((v_in_top, v_in_fb, v_in_wb) if cap_sign > 0 else (v_in_top, v_in_wb, v_in_fb))
        for gf in (gf_out, gf_in):
            gf.material_index = awning_mat
            gf.smooth = False
            for loop, (u, v) in zip(gf.loops, [(0.15, 0.95), (0.15, 0.15), (0.85, 0.10)]):
                loop[uv_layer].uv = (u, v)
                loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
            faces.append(gf)

    bmesh.ops.recalc_face_normals(bm, faces=faces)

    # Timber/bronze support brackets under ends
    for sx in (-width * 0.44, width * 0.44):
        add_box(bm, xform(sx, -proj * 0.42, -drop * 0.55 - 0.08), (0.09, proj * 0.78, 0.10), wood_mat, bevel=0.01, rot_euler=(-0.38, 0, yaw))


def add_cambered_leaf(bm, base_pt, fwd_dir, arch_normal, length: float, width: float, mat_idx: int):
    """Build 6-vertex midrib-folded, arched ovate botanical leaf (NO rigid flat kite polygon!)."""
    p = Vector(base_pt)
    f = Vector(fwd_dir).normalized()
    n = Vector(arch_normal).normalized()
    s = f.cross(n)
    if s.length < 1e-4:
        s = f.cross(Vector((0, 0, 1)))
    s.normalize()
    n = s.cross(f).normalized()
    v_base = bm.verts.new(p)
    v_mid_c = bm.verts.new(p + f * (length * 0.44) + n * (width * 0.12))
    v_mid_l = bm.verts.new(p + f * (length * 0.42) + s * (width * 0.50) - n * (width * 0.06))
    v_mid_r = bm.verts.new(p + f * (length * 0.42) - s * (width * 0.50) - n * (width * 0.06))
    v_hi_l = bm.verts.new(p + f * (length * 0.78) + s * (width * 0.24) - n * (width * 0.08))
    v_hi_r = bm.verts.new(p + f * (length * 0.78) - s * (width * 0.24) - n * (width * 0.08))
    v_tip = bm.verts.new(p + f * length - n * (length * 0.16))
    lfaces = [
        bm.faces.new((v_base, v_mid_c, v_mid_l)),
        bm.faces.new((v_base, v_mid_r, v_mid_c)),
        bm.faces.new((v_mid_l, v_mid_c, v_hi_l)),
        bm.faces.new((v_mid_c, v_mid_r, v_hi_r)),
        bm.faces.new((v_hi_l, v_mid_c, v_tip)),
        bm.faces.new((v_mid_c, v_hi_r, v_tip)),
    ]
    bmesh.ops.recalc_face_normals(bm, faces=lfaces)
    paint_faces(bm, lfaces, mat_idx, smooth=True, uv_scale=1.0)


def add_vine_climb(bm, points, stem_r: float, stem_mat: int, leaf_mat: int, flower_mat: int = None, seed: int = 1, cling_center=None):
    """Build tapered continuous botanical climbing vine + cambered ovate leaf clusters clutching the surface."""
    import random
    rng = random.Random(seed)
    pts = [Vector(p) for p in points]
    n_pts = len(pts)
    for i in range(n_pts - 1):
        t_head = i / max(1, n_pts - 1)
        t_tail = (i + 1) / max(1, n_pts - 1)
        r0 = stem_r * (1.10 - 0.52 * t_head)
        r1 = stem_r * (1.10 - 0.52 * t_tail)
        add_cyl(bm, pts[i], pts[i + 1], r0, r1, 6, stem_mat, smooth=True)
        seg = pts[i + 1] - pts[i]
        seg_len = max(0.08, seg.length)
        tang = seg / seg_len
        n_clusters = max(2, int(seg_len * 5.2))
        for k in range(n_clusters):
            tk = (k + 0.4) / n_clusters
            p = pts[i].lerp(pts[i + 1], tk)
            if cling_center is not None:
                # Hug tangent direction tightly around column surface center!
                radial = Vector((p.x - cling_center[0], p.y - cling_center[1], 0.0))
                out_n = radial.normalized() if radial.length > 1e-4 else Vector((1, 0, 0))
                sw = out_n.cross(tang).normalized()
            else:
                out_n = Vector((0.0, -1.0, 0.35)).normalized()
                sw = out_n.cross(tang).normalized()
            side_sign = 1.0 if (k + i) % 2 == 0 else -1.0
            fwd = (tang * 0.72 + sw * (0.65 * side_sign) + out_n * 0.14).normalized()
            llen = rng.uniform(0.11, 0.17)
            add_cambered_leaf(bm, p + out_n * (r0 * 0.35), fwd, out_n, llen, llen * 0.62, leaf_mat)
            if rng.random() < 0.55:
                fwd2 = (tang * 0.45 - sw * (0.78 * side_sign) + out_n * 0.18).normalized()
                add_cambered_leaf(bm, p + out_n * (r0 * 0.30), fwd2, out_n, llen * 0.85, llen * 0.54, leaf_mat)
            if flower_mat is not None and (k + i) % 4 == 1:
                fc = p + out_n * (r0 + 0.03)
                u_t = sw
                v_t = tang
                for pi in range(5):
                    pa = pi * math.tau / 5.0
                    rd = u_t * math.cos(pa) + v_t * math.sin(pa)
                    sd = -u_t * math.sin(pa) + v_t * math.cos(pa)
                    pf = bm.faces.new((
                        bm.verts.new(fc),
                        bm.verts.new(fc + rd * 0.038 + sd * 0.020 + out_n * 0.015),
                        bm.verts.new(fc + rd * 0.065 + out_n * 0.006),
                        bm.verts.new(fc + rd * 0.038 - sd * 0.020 + out_n * 0.015),
                    ))
                    paint_faces(bm, [pf], flower_mat, smooth=True, uv_scale=1.0)


def add_ribbed_dome(bm, center, radius: float, height: float, dome_mat: int, rib_mat: int, meridian_segs: int = 24, rings: int = 10, n_ribs: int = 8):
    """Build smooth copper/emerald ribbed dome shell with extruded brushed-gold meridian ribs & finial collar."""
    cx, cy, cz = center
    uv_layer, col_layer = ensure_uv_and_col(bm)
    lat_rings = []
    for ir in range(rings):
        phi = (math.pi * 0.5) * ir / rings
        r = radius * math.cos(phi)
        z = cz + height * math.sin(phi)
        ring = []
        for im in range(meridian_segs):
            th = 2.0 * math.pi * im / meridian_segs
            ring.append(bm.verts.new(Vector((cx + r * math.cos(th), cy + r * math.sin(th), z))))
        lat_rings.append((ring, phi))

    top_v = bm.verts.new(Vector((cx, cy, cz + height)))
    faces = []
    for k in range(rings - 1):
        r0, p0 = lat_rings[k]
        r1, p1 = lat_rings[k + 1]
        v0, v1 = p0 / (math.pi * 0.5), p1 / (math.pi * 0.5)
        for i in range(meridian_segs):
            j = (i + 1) % meridian_segs
            u0, u1 = i / meridian_segs, (i + 1) / meridian_segs
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = dome_mat
            f.smooth = True
            for loop, (u, v) in zip(f.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
                loop[uv_layer].uv = (u, v)
                loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
            faces.append(f)

    last_ring, last_phi = lat_rings[-1]
    v_last = last_phi / (math.pi * 0.5)
    for i in range(meridian_segs):
        j = (i + 1) % meridian_segs
        u0, u1 = i / meridian_segs, (i + 1) / meridian_segs
        f = bm.faces.new((last_ring[i], last_ring[j], top_v))
        f.material_index = dome_mat
        f.smooth = True
        for loop, (u, v) in zip(f.loops, [(u0, v_last), (u1, v_last), ((u0 + u1) * 0.5, 1.0)]):
            loop[uv_layer].uv = (u, v)
            loop[col_layer] = (1.0, 1.0, 1.0, 1.0)
        faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)

    # Meridional gold/brass ribs hugging the dome contour
    rib_w = max(0.06, radius * 0.038)
    rib_h = max(0.055, radius * 0.032)
    rib_steps = 9
    for irb in range(n_ribs):
        th = 2.0 * math.pi * irb / n_ribs
        ca, sa = math.cos(th), math.sin(th)
        tx, ty = -sa, ca
        sec_rings = []
        for s in range(rib_steps + 1):
            phi = (math.pi * 0.49) * s / rib_steps
            cp, sp = math.cos(phi), math.sin(phi)
            px = cx + (radius + rib_h * 0.3) * cp * ca
            py = cy + (radius + rib_h * 0.3) * cp * sa
            pz = cz + (height + rib_h * 0.3) * sp
            nx, ny, nz = cp * ca, cp * sa, sp
            c0 = Vector((px - tx * rib_w * 0.5, py - ty * rib_w * 0.5, pz))
            c1 = Vector((px + tx * rib_w * 0.5, py + ty * rib_w * 0.5, pz))
            nrm = Vector((nx, ny, nz)).normalized() * rib_h
            sec_rings.append([
                bm.verts.new(c0 - nrm * 0.3),
                bm.verts.new(c1 - nrm * 0.3),
                bm.verts.new(c1 + nrm * 0.7),
                bm.verts.new(c0 + nrm * 0.7),
            ])
        rfaces = []
        for s in range(rib_steps):
            a, b = sec_rings[s], sec_rings[s + 1]
            for k in range(4):
                kn = (k + 1) % 4
                f = bm.faces.new((a[k], a[kn], b[kn], b[k]))
                f.material_index = rib_mat
                f.smooth = False
                rfaces.append(f)
        rfaces.append(bm.faces.new(list(reversed(sec_rings[0]))))
        rfaces[-1].material_index = rib_mat
        rfaces.append(bm.faces.new(sec_rings[-1]))
        rfaces[-1].material_index = rib_mat
        bmesh.ops.recalc_face_normals(bm, faces=rfaces)
        assign_box_uvs(bm, 0.5, rfaces)

    # Equatorial gold collar rim
    add_lathe(bm, [
        (radius + 0.08, 0.0), (radius + 0.14, 0.03), (radius + 0.14, 0.12), (radius + 0.02, 0.15), (radius - 0.05, 0.15)
    ], meridian_segs, rib_mat, center=(cx, cy, cz - 0.02), smooth_side=True)


def add_tiled_gable_roof(
    bm,
    center_xy,
    ridge_span: float,
    eave_span: float,
    eave_z: float,
    ridge_z: float,
    roof_mat: int,
    trim_mat: int,
    ridge_mat: int,
    ridge_along: str = "Y",
    tile_rows: int = 5,
    tile_cols: int = 9,
    bell_flare: float = 0.16,
    bargeboard_t: float = 0.16,
):
    """Build crisp gable roof deck + flared bargeboards + staggered 3D tile shingles + rounded ridge cap."""
    cx, cy = center_xy
    half_r = ridge_span * 0.5
    half_e = eave_span * 0.5
    yaw = 0.0 if ridge_along == "Y" else math.pi * 0.5
    rot = Matrix.Rotation(yaw, 4, "Z")

    def xform(x, y, z):
        p = rot @ Vector((x, y, 0.0))
        return Vector((cx + p.x, cy + p.y, z))

    def slope_z(ax_abs: float):
        t = min(1.0, max(0.0, ax_abs / half_e))
        return ridge_z - (ridge_z - eave_z) * (t ** (1.0 - bell_flare * 0.45))

    # Solid deck underlay
    nx_d = 6
    for side in (-1, 1):
        for ix in range(nx_d):
            t0, t1 = ix / nx_d, (ix + 1) / nx_d
            u0, u1 = t0 * half_e, t1 * half_e
            z0, z1 = slope_z(u0), slope_z(u1)
            px = side * (u0 + u1) * 0.5
            pz = (z0 + z1) * 0.5 - 0.06
            dx = u1 - u0
            dz = z0 - z1
            ang = math.atan2(dz, dx) * side
            seg_w = math.hypot(dx, dz) + 0.04
            add_box(bm, xform(px, 0.0, pz), (seg_w, ridge_span, 0.12), trim_mat, rot_euler=(0.0, ang, yaw))

    # Individual sculpted overlapping roof tile slabs per slope
    uv_layer, col_layer = ensure_uv_and_col(bm)
    tile_w = ridge_span / tile_cols
    for side in (-1, 1):
        for ir in range(tile_rows):
            t0 = ir / tile_rows
            t1 = min(1.0, (ir + 1.08) / tile_rows)
            u0, u1 = t0 * half_e, t1 * half_e
            z0, z1 = slope_z(u0), slope_z(u1)
            dx = u1 - u0
            dz = z0 - z1
            ang = math.atan2(dz, dx) * side
            slope_len = math.hypot(dx, dz)
            stagger = (ir % 2) * 0.5
            for ic in range(tile_cols):
                yc0 = -half_r + (ic + 0.04) * tile_w
                yc1 = -half_r + (ic + 0.96) * tile_w
                # Overlap slightly along vertical tilt
                px = side * (u0 + u1) * 0.5
                py = (yc0 + yc1) * 0.5
                pz = (z0 + z1) * 0.5 + 0.028 + 0.008 * ((ic + ir) % 2)
                tile_tilt = ang - side * 0.045  # slight kick at bottom edge of each shingle!
                # Tiny per-tile natural jitter
                rng_v = ((ir * 13 + ic * 7 + (1 if side > 0 else 0)) % 5 - 2) * 0.005
                add_box(
                    bm,
                    xform(px, py, pz + rng_v),
                    (slope_len, tile_w * 0.94, 0.055),
                    roof_mat,
                    bevel=0.0,
                    rot_euler=(0.0, tile_tilt, yaw),
                    smooth=False,
                    uv_scale=0.45,
                )

    # Crisp gable fascia bargeboards along both front & back gable ends
    for end_s in (-1, 1):
        y_end = end_s * (half_r - bargeboard_t * 0.4)
        for side in (-1, 1):
            for ix in range(4):
                t0, t1 = ix / 4, (ix + 1) / 4
                u0, u1 = t0 * (half_e + 0.06), t1 * (half_e + 0.06)
                z0, z1 = slope_z(u0), slope_z(u1)
                ang = math.atan2(z0 - z1, u1 - u0) * side
                seg_l = math.hypot(u1 - u0, z0 - z1) + 0.05
                add_box(
                    bm,
                    xform(side * (u0 + u1) * 0.5, y_end, (z0 + z1) * 0.5 - 0.03),
                    (seg_l, bargeboard_t, 0.22),
                    trim_mat,
                    bevel=0.018,
                    rot_euler=(0.0, ang, yaw),
                )

    # Rounded ridge pole & cap saddle tiles
    p_ra = xform(0.0, -half_r - 0.06, ridge_z + 0.06)
    p_rb = xform(0.0, half_r + 0.06, ridge_z + 0.06)
    add_cyl(bm, p_ra, p_rb, 0.13, 0.13, 12, ridge_mat, smooth=True)


def export_glb(objs, out_dir: Path, asset_id: str, expected_size, auto_center: bool = True):
    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")

    def measure_all():
        mn = Vector((math.inf, math.inf, math.inf))
        mx = Vector((-math.inf, -math.inf, -math.inf))
        tri_count = 0
        for o in objs:
            o.data.calc_loop_triangles()
            tri_count += len(o.data.loop_triangles)
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                mn.x = min(mn.x, w.x); mx.x = max(mx.x, w.x)
                mn.y = min(mn.y, w.y); mx.y = max(mx.y, w.y)
                mn.z = min(mn.z, w.z); mx.z = max(mx.z, w.z)
        return mn, mx, tri_count

    min_v, max_v, tris = measure_all()
    if auto_center:
        shift = Vector((-(min_v.x + max_v.x) * 0.5, -(min_v.y + max_v.y) * 0.5, -min_v.z))
        if shift.length > 1e-4:
            mat = Matrix.Translation(shift)
            for o in objs:
                o.data.transform(mat)
                o.data.update()
            bpy.context.view_layer.update()
            min_v, max_v, tris = measure_all()

    for o in objs:
        o.select_set(True)
        for p in o.data.polygons:
            if not p.use_smooth:
                p.use_smooth = False

    w = max_v.x - min_v.x
    d = max_v.y - min_v.y
    h = max_v.z - min_v.z
    cx = (min_v.x + max_v.x) * 0.5
    cy = (min_v.y + max_v.y) * 0.5
    ew, ed, eh = expected_size
    print(f"EXPORT_BOUNDS {asset_id} w={w:.4f}/{ew:.4f} d={d:.4f}/{ed:.4f} h={h:.4f}/{eh:.4f} minZ={min_v.z:.4f} cx={cx:.4f} cy={cy:.4f} tris={tris}")
    assert abs(w / ew - 1.0) <= 0.08, f"{asset_id} width {w} vs {ew}"
    assert abs(d / ed - 1.0) <= 0.08, f"{asset_id} depth {d} vs {ed}"
    assert abs(h / eh - 1.0) <= 0.08, f"{asset_id} height {h} vs {eh}"
    assert abs(min_v.z) <= 0.05, f"{asset_id} minZ {min_v.z}"
    assert abs(min_v.x + max_v.x) <= 0.08 and abs(min_v.y + max_v.y) <= 0.08, f"{asset_id} center ({cx},{cy})"

    bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / f"{asset_id}.blend"))
    glb_path = out_dir / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_attributes=True,
    )
    print(f"EXPORTED {glb_path}")
    return glb_path
