import os
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix


def _dilate_rgba(rgba: np.ndarray, iterations: int = 16, alpha_min: float = 0.12):
    """Flood RGB colors outward from valid alpha > alpha_min into transparent pixels."""
    out = rgba.copy()
    valid = out[:, :, 3] > alpha_min
    rgb = out[:, :, :3].copy()
    h, w = valid.shape

    for _ in range(iterations):
        if np.all(valid):
            break
        acc_rgb = np.zeros_like(rgb)
        acc_cnt = np.zeros((h, w), dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                ys_src = slice(max(0, -dy), h - max(0, dy))
                xs_src = slice(max(0, -dx), w - max(0, dx))
                ys_dst = slice(max(0, dy), h - max(0, -dy))
                xs_dst = slice(max(0, dx), w - max(0, -dx))

                v = valid[ys_src, xs_src]
                acc_rgb[ys_dst, xs_dst] += rgb[ys_src, xs_src] * v[:, :, None]
                acc_cnt[ys_dst, xs_dst] += v

        fill = (~valid) & (acc_cnt > 0)
        if not np.any(fill):
            break
        rgb[fill] = acc_rgb[fill] / acc_cnt[fill][:, None]
        valid[fill] = True

    out[:, :, :3] = rgb
    return out


def bake_sprig_atlas(
    build_scene_fn,
    out_dir: str,
    size: int = 1024,
    ortho_scale: float = 2.0,
    samples_albedo: int = 16,
    ao_distance: float = 0.16,
    ao_strength: float = 0.42,
    alpha_boost: float = 0.85,
):
    """
    Renders a clean orthographic 1024x1024 RGBA Albedo+AO atlas and Linear Tangent Normal atlas
    from real 3D geometry created by build_scene_fn(scene), then dilates RGB outward to eliminate
    mipmap dark/white fringes. Returns (albedo_png_path, normal_png_path).
    """
    os.makedirs(out_dir, exist_ok=True)
    albedo_path = os.path.join(out_dir, "sprig_albedo.png")
    normal_path = os.path.join(out_dir, "sprig_normal.png")
    normal_exr = os.path.join(out_dir, "_sprig_normal_tmp.exr")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples_albedo
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 2
    sc.cycles.diffuse_bounces = 1
    sc.cycles.glossy_bounces = 0
    sc.cycles.transparent_max_bounces = 8
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True

    objs = build_scene_fn(sc)

    cam_data = bpy.data.cameras.new("SprigBakeOrtho")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_start = 0.1
    cam_data.clip_end = 20.0
    cam_obj = bpy.data.objects.new("SprigBakeOrtho", cam_data)
    cam_obj.location = (0.0, 0.0, 5.0)
    cam_obj.rotation_euler = (0.0, 0.0, 0.0)
    sc.collection.objects.link(cam_obj)
    sc.camera = cam_obj

    # Keep original linear albedo shaders untouched; swap to cavity-shaded unlit emission pass
    orig_mats = {}
    for obj in objs:
        if obj.type != "MESH":
            continue
        orig_mats[obj.name] = [slot.material for slot in obj.material_slots]
        for idx, slot in enumerate(obj.material_slots):
            m = slot.material
            if m is None or not m.use_nodes:
                continue
            em_mat = m.copy()
            em_mat.name = f"{m.name}_AlbedoAO"
            nt = em_mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            out_node = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
            if bsdf and out_node:
                base_sock = bsdf.inputs["Base Color"]
                base_val = tuple(base_sock.default_value)
                src_link = base_sock.links[0].from_socket if base_sock.is_linked else None

                ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
                ao.samples = 8
                ao.inputs["Distance"].default_value = ao_distance

                geo = nt.nodes.new("ShaderNodeNewGeometry")
                sep = nt.nodes.new("ShaderNodeSeparateXYZ")
                nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])

                # Gentle zenith normal shading (+-8%) so needles & veins stay sculpted from all views
                map_r = nt.nodes.new("ShaderNodeMapRange")
                map_r.inputs["From Min"].default_value = -0.3
                map_r.inputs["From Max"].default_value = 1.0
                map_r.inputs["To Min"].default_value = 0.93
                map_r.inputs["To Max"].default_value = 1.07
                nt.links.new(sep.outputs["Z"], map_r.inputs["Value"])

                ao_mix = nt.nodes.new("ShaderNodeMix")
                ao_mix.data_type = "FLOAT"
                ao_mix.inputs["Factor"].default_value = ao_strength
                ao_mix.inputs["A"].default_value = 1.0
                nt.links.new(ao.outputs["AO"], ao_mix.inputs["B"])

                mul_light = nt.nodes.new("ShaderNodeMath")
                mul_light.operation = "MULTIPLY"
                nt.links.new(ao_mix.outputs["Result"], mul_light.inputs[0])
                nt.links.new(map_r.outputs["Result"], mul_light.inputs[1])

                mul_col = nt.nodes.new("ShaderNodeMix")
                mul_col.data_type = "RGBA"
                mul_col.blend_type = "MULTIPLY"
                mul_col.inputs["Factor"].default_value = 1.0
                if src_link is not None:
                    nt.links.new(src_link, mul_col.inputs["A"])
                else:
                    mul_col.inputs["A"].default_value = base_val
                comb = nt.nodes.new("ShaderNodeCombineColor")
                nt.links.new(mul_light.outputs["Value"], comb.inputs["Red"])
                nt.links.new(mul_light.outputs["Value"], comb.inputs["Green"])
                nt.links.new(mul_light.outputs["Value"], comb.inputs["Blue"])
                nt.links.new(comb.outputs["Color"], mul_col.inputs["B"])

                em = nt.nodes.new("ShaderNodeEmission")
                nt.links.new(mul_col.outputs["Result"], em.inputs["Color"])
                nt.links.new(em.outputs["Emission"], out_node.inputs["Surface"])
            slot.material = em_mat

    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.render.filepath = albedo_path
    bpy.ops.render.render(write_still=True)

    # Pass 2: True Shading Normal EXR (linear float) -> Normalized OpenGL Tangent Normal PNG
    norm_mat = bpy.data.materials.new("_SprigNormalBake")
    norm_mat.use_nodes = True
    n_nt = norm_mat.node_tree
    n_nt.nodes.clear()
    n_out = n_nt.nodes.new("ShaderNodeOutputMaterial")
    n_em = n_nt.nodes.new("ShaderNodeEmission")
    n_geo = n_nt.nodes.new("ShaderNodeNewGeometry")
    n_map = n_nt.nodes.new("ShaderNodeVectorMath")
    n_map.operation = "MULTIPLY_ADD"
    n_map.inputs[1].default_value = (0.5, 0.5, 0.5)
    n_map.inputs[2].default_value = (0.5, 0.5, 0.5)
    n_nt.links.new(n_geo.outputs["Normal"], n_map.inputs[0])
    n_nt.links.new(n_map.outputs["Vector"], n_em.inputs["Color"])
    n_nt.links.new(n_em.outputs["Emission"], n_out.inputs["Surface"])

    for obj in objs:
        if obj.type == "MESH":
            for slot in obj.material_slots:
                slot.material = norm_mat

    sc.cycles.samples = 4
    sc.view_settings.view_transform = "Raw"
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "32"
    sc.render.filepath = normal_exr
    bpy.ops.render.render(write_still=True)

    # Post-process both images in linear float space with numpy: alpha curve + 16px edge bleed
    alb_img = bpy.data.images.load(albedo_path)
    alb_px = np.array(alb_img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    # Coverage-preserving alpha boost so crisp 3-5px needles survive mipmap downsampling
    alpha = alb_px[:, :, 3]
    if alpha_boost != 1.0:
        alpha = np.where(alpha > 0.02, np.power(np.clip(alpha, 0.0, 1.0), alpha_boost), 0.0)
        alb_px[:, :, 3] = alpha
    alb_dilated = _dilate_rgba(alb_px, iterations=18, alpha_min=0.10)
    alb_img.pixels.foreach_set(alb_dilated.ravel())
    alb_img.filepath_raw = albedo_path
    alb_img.file_format = "PNG"
    alb_img.save()

    n_img = bpy.data.images.load(normal_exr)
    n_img.colorspace_settings.name = "Non-Color"
    n_px = np.array(n_img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    # Neutral flat tangent normal (0.5, 0.5, 1.0) wherever alpha == 0 before dilation
    mask = n_px[:, :, 3] > 0.15
    n_px[~mask, :3] = [0.5, 0.5, 1.0]
    n_dilated = _dilate_rgba(n_px, iterations=18, alpha_min=0.15)
    # Re-normalize vectors & clamp Z >= 0.35 so double-sided card lighting stays upright
    vec = n_dilated[:, :, :3] * 2.0 - 1.0
    vec[:, :, 2] = np.maximum(vec[:, :, 2], 0.35)
    norm_len = np.maximum(np.linalg.norm(vec, axis=2, keepdims=True), 1e-5)
    vec = (vec / norm_len) * 0.5 + 0.5
    n_dilated[:, :, :3] = np.clip(vec, 0.0, 1.0)
    n_dilated[:, :, 3] = 1.0

    n_out_img = bpy.data.images.new("_SprigNormalPNG", size, size, alpha=False)
    n_out_img.colorspace_settings.name = "Non-Color"
    n_out_img.pixels.foreach_set(n_dilated.ravel())
    n_out_img.filepath_raw = normal_path
    n_out_img.file_format = "PNG"
    n_out_img.save()

    if os.path.exists(normal_exr):
        try:
            os.remove(normal_exr)
        except OSError:
            pass

    bpy.ops.wm.read_factory_settings(use_empty=True)
    return albedo_path, normal_path


def make_leaf_card_material(
    name: str,
    albedo_path: str,
    normal_path: str,
    cutoff: float = 0.40,
    roughness: float = 0.62,
    normal_strength: float = 0.60,
):
    """
    Creates a GLTF-compatible alphaMode=MASK + DoubleSide + Vertex Tint + NormalMap material.
    Uses ShaderNodeMath(GREATER_THAN, cutoff) so Blender 4.5 exports alphaMode="MASK" cleanly.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.28

    alb_img = bpy.data.images.load(albedo_path)
    alb_img.pack()
    tex_alb = nt.nodes.new("ShaderNodeTexImage")
    tex_alb.image = alb_img

    vcol = nt.nodes.new("ShaderNodeVertexColor")
    vcol.layer_name = "Tint"

    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex_alb.outputs["Color"], mix.inputs["A"])
    nt.links.new(vcol.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = cutoff
    nt.links.new(tex_alb.outputs["Alpha"], gt.inputs[0])
    nt.links.new(gt.outputs["Value"], bsdf.inputs["Alpha"])

    if normal_path and os.path.exists(normal_path):
        n_img = bpy.data.images.load(normal_path)
        n_img.colorspace_settings.name = "Non-Color"
        n_img.pack()
        tex_n = nt.nodes.new("ShaderNodeTexImage")
        tex_n.image = n_img
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def basis_from_forward(forward: Vector, up_hint: Vector = Vector((0.0, 0.0, 1.0))):
    """
    Returns right-handed (forward, side, up) where side = forward x up_hint (+right) and
    up = side x forward (+Z upward), guaranteeing add_cambered_card faces wind toward +up!
    """
    fwd = forward.normalized()
    side = fwd.cross(up_hint)
    if side.length < 1e-4:
        side = fwd.cross(Vector((1.0, 0.0, 0.0)))
    side.normalize()
    up = side.cross(fwd).normalized()
    return fwd, side, up


def add_cambered_card(
    bm: bmesh.types.BMesh,
    uv_layer,
    col_layer,
    origin: Vector,
    forward: Vector,
    side: Vector,
    up: Vector,
    length: float,
    width: float,
    arch: float = 0.14,
    v_fold: float = 0.08,
    uv_rect=(0.0, 0.0, 1.0, 1.0),
    tint_base=(0.82, 0.88, 0.85, 1.0),
    tint_tip=(1.0, 1.0, 1.0, 1.0),
    cols: int = 3,
    rows: int = 3,
    tip_taper: float = 1.0,
):
    """Adds a curved, V-folded 3x3 sprig card anchored at `origin` extending along `forward`."""
    u0, v0, u1, v1 = uv_rect
    grid = []
    for r in range(rows + 1):
        t = r / rows  # 0 at base -> 1 at tip
        row_verts = []
        arch_z = math.sin(t * math.pi * 0.85) * arch - (t * t) * (arch * 0.55)
        w_scale = 1.0 - (1.0 - tip_taper) * (t * t)
        for c in range(cols + 1):
            s = (c / cols) * 2.0 - 1.0  # -1..+1 across card width
            drop_z = -abs(s) * v_fold * (0.4 + 0.6 * t)
            pos = (
                origin
                + forward * (t * length)
                + side * (s * width * 0.5 * w_scale)
                + up * (arch_z + drop_z)
            )
            row_verts.append((bm.verts.new(pos), s, t))
        grid.append(row_verts)

    for r in range(rows):
        for c in range(cols):
            v_a, s_a, t_a = grid[r][c]
            v_b, s_b, t_b = grid[r][c + 1]
            v_c, s_c, t_c = grid[r + 1][c + 1]
            v_d, s_d, t_d = grid[r + 1][c]
            f = bm.faces.new((v_a, v_b, v_c, v_d))
            f.smooth = True
            params = [(s_a, t_a), (s_b, t_b), (s_c, t_c), (s_d, t_d)]
            for loop, (ss, tt) in zip(f.loops, params):
                uu = u0 + (u1 - u0) * (ss * 0.5 + 0.5)
                vv = v0 + (v1 - v0) * tt
                loop[uv_layer].uv = (uu, vv)
                w_col = tuple(
                    tint_base[k] * (1.0 - tt) + tint_tip[k] * tt for k in range(4)
                )
                loop[col_layer] = w_col


def apply_radial_canopy_normals(
    mesh: bpy.types.Mesh,
    center: Vector,
    sky_bias: float = 0.42,
    blend_geom: float = 0.25,
):
    """Replaces flat quad normals with smooth spherical outward normals + gentle sky lift."""
    mesh.update()
    v_norms = []
    for v in mesh.vertices:
        d = v.co - center
        if d.length < 1e-4:
            d = Vector((0.0, 0.0, 1.0))
        else:
            d.normalize()
        n = (d + Vector((0.0, 0.0, sky_bias))).normalized()
        v_norms.append(n)

    loop_norms = []
    for poly in mesh.polygons:
        g_n = Vector(poly.normal)
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            sn = v_norms[vi]
            if blend_geom > 0.0 and g_n.length > 1e-4:
                out_n = sn.lerp(g_n if g_n.dot(sn) >= 0 else -g_n, blend_geom).normalized()
            else:
                out_n = sn
            loop_norms.append(tuple(out_n))

    mesh.normals_split_custom_set(loop_norms)
    mesh.update()


def generate_bark_textures(
    out_dir: str,
    size: int = 512,
    ridge_srgb=(0.64, 0.44, 0.29),
    fissure_srgb=(0.36, 0.22, 0.14),
    plate_freq_x: float = 9.0,
    plate_freq_y: float = 3.0,
    normal_amp: float = 2.6,
    seed: int = 42,
):
    """
    Synthesizes a seamless tileable 512x512 sculpted bark Albedo PNG + OpenGL Tangent Normal PNG
    in numpy using multi-octave periodic noise for vertical scaly bark plates & fissures.
    """
    os.makedirs(out_dir, exist_ok=True)
    alb_path = os.path.join(out_dir, "bark_albedo.png")
    nrm_path = os.path.join(out_dir, "bark_normal.png")

    rng = np.random.default_rng(seed)
    u = np.linspace(0.0, 2.0 * math.pi, size, endpoint=False, dtype=np.float32)[None, :]
    v = np.linspace(0.0, 2.0 * math.pi, size, endpoint=False, dtype=np.float32)[:, None]

    # Periodic multi-harmonic ridge & plate heightfield (0..1)
    h = np.zeros((size, size), dtype=np.float32)
    harmonics = [
        (plate_freq_x, plate_freq_y, 0.45),
        (plate_freq_x * 2.0, plate_freq_y * 2.0, 0.26),
        (plate_freq_x * 3.0, plate_freq_y * 5.0, 0.16),
        (plate_freq_x * 5.0, plate_freq_y * 8.0, 0.10),
    ]
    for fx, fy, amp in harmonics:
        ph1 = rng.uniform(0.0, 2.0 * math.pi)
        ph2 = rng.uniform(0.0, 2.0 * math.pi)
        warp = 0.65 * np.sin(np.round(fy) * v + ph2) + 0.35 * np.sin(np.round(fx * 0.5) * u + np.round(fy * 2.0) * v + ph1)
        val = np.sin(np.round(fx) * u + warp + np.round(fy) * v * 0.5 + ph1)
        # Flatten ridges into scaly bark plates, sharpen fissures
        plate = np.clip(val * 0.65 + 0.55, 0.0, 1.0)
        h += (plate ** 0.75) * amp

    # Add horizontal scaly breaks along pine/cedar bark plates
    breaks = np.abs(np.sin(v * 7.0 + 0.8 * np.sin(u * 4.0))) ** 0.45
    h = np.clip(h * (0.75 + 0.25 * breaks), 0.0, 1.0)
    h = (h - h.min()) / max(1e-5, float(h.max() - h.min()))

    # Fine bark fiber grain
    grain = np.sin(u * 28.0 + np.sin(v * 12.0) * 1.4) * 0.06
    h_detail = np.clip(h + grain, 0.0, 1.0)

    c0 = np.array(fissure_srgb, dtype=np.float32)[None, None, :]
    c1 = np.array(ridge_srgb, dtype=np.float32)[None, None, :]
    rgb = c0 * (1.0 - h_detail[:, :, None]) + c1 * h_detail[:, :, None]

    # Blender image.save() stores pixel floats straight into sRGB PNG bytes without inverse-gamma;
    # keeping target sRGB values directly avoids double-darkening (~gamma^4.84).
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0.0, 1.0)

    img_a = bpy.data.images.new("_BarkAlbedoTmp", size, size, alpha=False)
    img_a.pixels.foreach_set(rgba.ravel())
    img_a.filepath_raw = alb_path
    img_a.file_format = "PNG"
    img_a.save()

    # Periodic central-difference tangent normal map
    dh_dx = (np.roll(h_detail, -1, axis=1) - np.roll(h_detail, 1, axis=1)) * normal_amp
    dh_dy = (np.roll(h_detail, -1, axis=0) - np.roll(h_detail, 1, axis=0)) * normal_amp
    nx = -dh_dx
    ny = -dh_dy
    nz = np.ones_like(nx)
    inv = 1.0 / np.maximum(np.sqrt(nx * nx + ny * ny + nz * nz), 1e-5)

    n_rgba = np.ones((size, size, 4), dtype=np.float32)
    n_rgba[:, :, 0] = nx * inv * 0.5 + 0.5
    n_rgba[:, :, 1] = ny * inv * 0.5 + 0.5
    n_rgba[:, :, 2] = nz * inv * 0.5 + 0.5

    img_n = bpy.data.images.new("_BarkNormalTmp", size, size, alpha=False)
    img_n.colorspace_settings.name = "Non-Color"
    img_n.pixels.foreach_set(n_rgba.ravel())
    img_n.filepath_raw = nrm_path
    img_n.file_format = "PNG"
    img_n.save()

    bpy.data.images.remove(img_a)
    bpy.data.images.remove(img_n)
    return alb_path, nrm_path


def make_textured_bark_material(
    name: str,
    albedo_path: str,
    normal_path: str,
    roughness: float = 0.84,
    normal_strength: float = 0.72,
):
    """Creates a GLTF-ready sculpted bark material multiplying bark texture with vertex Col."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16

    alb_img = bpy.data.images.load(albedo_path)
    alb_img.pack()
    tex_alb = nt.nodes.new("ShaderNodeTexImage")
    tex_alb.image = alb_img

    vcol = nt.nodes.new("ShaderNodeVertexColor")
    vcol.layer_name = "Col"

    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex_alb.outputs["Color"], mix.inputs["A"])
    nt.links.new(vcol.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])

    n_img = bpy.data.images.load(normal_path)
    n_img.colorspace_settings.name = "Non-Color"
    n_img.pack()
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = n_img
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = normal_strength
    nt.links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat
