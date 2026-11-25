"""Build Moonbay Marina Wharf Bollard Piling (dock-post v2):
Natural linear-grained coastal walnut-oak 16-sided chamfered piling with subtle
fibrous pores & natural ring intervals (no regular sinusoidal waves), flush-seated
HarborBronze beveled base anchor flange & lag bolts (minZ=-0.008m), riveted lower
strap, upper bronze tie-ring collar + forged +/-Y shackle eyelets centered at rope
height (z=0.965m), and tailored architectural marine cream storm-cap & bronze finial.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

out_dir = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0


def make_packed_image(name, w, h, rgba_array, colorspace="sRGB"):
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(rgba_array.ravel())
    out_file = (out_dir / f"{name}.png").resolve()
    img.filepath_raw = str(out_file)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


# 512x512 Natural Vertical Coastal Oak / Teak Timber Texture (fine longitudinal fibers, subtle irregular cathedral variation)
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX
rng_np = np.random.default_rng(20261125)

# Fine multi-frequency longitudinal timber grain (gentle organic deflection, NOT wavy sinusoidal bars)
deflect = (
    0.006 * np.sin(v * 5.0 * math.pi + 1.2 * np.cos(u * 2.0 * math.pi))
    + 0.003 * np.cos(v * 11.0 * math.pi + 2.4 * np.sin(u * 4.0 * math.pi))
)
u_g = (u + deflect) % 1.0
# Per-column deterministic wood fiber variation (simulates natural tight vascular pores along log grain)
col_noise = rng_np.normal(0.0, 1.0, W_TX).astype(np.float32)
# Smooth 1D column filter so fibers stay silky vertical without harsh pixel harshness
kernel = np.array([0.15, 0.22, 0.26, 0.22, 0.15], dtype=np.float32)
col_smooth = np.convolve(np.pad(col_noise, 2, mode="wrap"), kernel, mode="valid")
idx_shift = np.clip((u_g * W_TX).astype(np.int32), 0, W_TX - 1)
fibers = col_smooth[idx_shift]

# Subtle broad vertical plank/stave tone + soft irregular heartwood rings
rings = (
    0.35 * np.sin(u_g * 14.0 * math.pi + np.sin(v * 3.0 * math.pi) * 0.9)
    + 0.25 * np.cos(u_g * 29.0 * math.pi - 0.5 * v)
    + 0.40 * fibers
)
fine_pore = 0.20 * np.sin(u_g * 220.0 + v * 6.0) + 0.18 * np.cos(u_g * 380.0 - v * 11.0)
knot = np.exp(-(((u_g - 0.28) % 1.0 - 0.5) ** 2 / 0.0025 + ((v - 0.58) ** 2) / 0.009))
grain_val = np.clip(0.55 + 0.14 * rings + 0.08 * fine_pore - 0.16 * knot, 0.15, 0.95)

# Salt spray silvering near pier deck base (v < 0.16) and weather wash under cap
salt = np.clip(1.0 - v / 0.16, 0.0, 1.0) * 0.14

r_c = (0.37 + 0.20 * grain_val) * (1.0 - 0.12 * salt) + 0.14 * salt
g_c = (0.20 + 0.13 * grain_val) * (1.0 - 0.08 * salt) + 0.13 * salt
b_c = (0.10 + 0.07 * grain_val) * (1.0 - 0.04 * salt) + 0.11 * salt

timber_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
timber_rgba[..., 0] = np.clip(r_c, 0.0, 1.0)
timber_rgba[..., 1] = np.clip(g_c, 0.0, 1.0)
timber_rgba[..., 2] = np.clip(b_c, 0.0, 1.0)
timber_img = make_packed_image("dock-post-timber", W_TX, H_TX, timber_rgba, "sRGB")

rough_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
r_rough = np.clip(0.82 - 0.16 * grain_val + 0.06 * salt, 0.58, 0.92)
rough_rgba[..., 0] = r_rough
rough_rgba[..., 1] = r_rough
rough_rgba[..., 2] = r_rough
timber_rough_img = make_packed_image("dock-post-rough", W_TX, H_TX, rough_rgba, "Non-Color")

# Architectural painted marine cream wood cap texture (subtle patina)
brush = 0.50 + 0.22 * np.sin(u * 42.0 + 0.5 * np.cos(v * 18.0)) + 0.18 * fibers
cap_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
cap_rgba[..., 0] = np.clip(0.89 + 0.06 * brush, 0.0, 1.0)
cap_rgba[..., 1] = np.clip(0.81 + 0.07 * brush, 0.0, 1.0)
cap_rgba[..., 2] = np.clip(0.64 + 0.07 * brush, 0.0, 1.0)
cap_img = make_packed_image("dock-post-cap", W_TX, H_TX, cap_rgba, "sRGB")


def make_tex_mat(name, img, rough_img=None, rough_val=0.62, metal=0.0, spec=0.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Specular IOR Level"].default_value = spec
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-460, 240)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Tint"
    vc.location = (-460, 20)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.location = (-210, 160)
    nt.links.new(tex.outputs["Color"], mix.inputs["A"])
    nt.links.new(vc.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    if rough_img is not None:
        tr = nt.nodes.new("ShaderNodeTexImage")
        tr.image = rough_img
        tr.location = (-460, -240)
        nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = rough_val
    return mat


def make_metal_mat(name, rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.40):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return mat


MAT_TIMBER = make_tex_mat("PilingTimber", timber_img, rough_img=timber_rough_img, spec=0.32)
MAT_BRONZE = make_metal_mat("HarborBronze", rgba=(0.345, 0.242, 0.135, 1.0), metal=0.72, rough=0.40)
MAT_CAP = make_tex_mat("HarborStormCap", cap_img, rough_val=0.58, spec=0.38)

bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
vc_layer = bm.loops.layers.color.new("Tint")
WHITE = (1.0, 1.0, 1.0, 1.0)


def assign_faces(faces, mat_idx, col=WHITE, smooth_mode=True, uv_cyl=True):
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth_mode
        for lp in f.loops:
            lp[vc_layer] = col
            co = lp.vert.co
            if uv_cyl:
                ang = (math.atan2(co.y, co.x) / (2.0 * math.pi)) + 0.5
                v_z = max(0.0, min(1.0, (co.z + 0.02) / 1.36))
                lp[uv_layer].uv = (ang % 1.0, v_z)
            else:
                lp[uv_layer].uv = ((co.x * 1.8 + 0.5) % 1.0, (co.y * 1.8 + 0.5) % 1.0)


def add_lathe(profile_rz, segs=16, mat_idx=0, col=WHITE, smooth_mode=True, check_grooves=False, phase=0.0):
    before = set(bm.faces)
    rings = []
    for r, z in profile_rz:
        if r <= 1e-4:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            row = []
            for k in range(segs):
                ang = phase + 2.0 * math.pi * k / segs
                rk = r
                if check_grooves and 0.16 < z < 1.12 and abs(abs(math.cos(ang)) - 1.0) < 0.04:
                    rk -= 0.007
                row.append(bm.verts.new((rk * math.cos(ang), rk * math.sin(ang), z)))
            rings.append(row)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) > 1:
            for k in range(segs):
                bm.faces.new((a[0], b[(k + 1) % segs], b[k]))
        elif len(a) > 1 and len(b) == 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        elif len(a) > 1 and len(b) > 1:
            for k in range(segs):
                k2 = (k + 1) % segs
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
    assign_faces([f for f in bm.faces if f not in before], mat_idx, col, smooth_mode=smooth_mode)


def add_torus_ring(center, axis_dir, major_r, minor_r, maj_segs=16, min_segs=8, mat_idx=1):
    before = set(bm.faces)
    n = axis_dir.normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(ref).normalized()
    v = n.cross(u).normalized()
    rings = []
    for i in range(maj_segs):
        a = 2.0 * math.pi * i / maj_segs
        rad_dir = u * math.cos(a) + v * math.sin(a)
        c_pt = center + rad_dir * major_r
        ring = []
        for j in range(min_segs):
            b = 2.0 * math.pi * j / min_segs
            pt = c_pt + rad_dir * (minor_r * math.cos(b)) + n * (minor_r * math.sin(b))
            ring.append(bm.verts.new(pt))
        rings.append(ring)
    for i in range(maj_segs):
        ra = rings[i]
        rb = rings[(i + 1) % maj_segs]
        for j in range(min_segs):
            j2 = (j + 1) % min_segs
            bm.faces.new((ra[j], rb[j], rb[j2], ra[j2]))
    assign_faces([f for f in bm.faces if f not in before], mat_idx, WHITE, smooth_mode=True)


def add_bolt_head(pos, normal_dir, radius=0.012, depth=0.011, mat_idx=1):
    before = set(bm.faces)
    n = normal_dir.normalized()
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    u = n.cross(ref).normalized()
    v = n.cross(u).normalized()
    rot = Matrix((u, v, n)).transposed().to_4x4()
    verts = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=6,
        radius1=radius, radius2=radius * 0.78, depth=depth,
    )["verts"]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(pos + n * (depth * 0.3)) @ rot, verts=verts)
    assign_faces([f for f in bm.faces if f not in before], mat_idx, WHITE, smooth_mode=False)


def add_shackle_lug(side_y, z_center=0.965):
    s = 1.0 if side_y >= 0 else -1.0
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation((0.0, s * 0.150, z_center)) @ Matrix.Diagonal((0.052, 0.036, 0.068, 1.0)),
        verts=verts,
    )
    assign_faces([f for f in bm.faces if f not in before], 1, WHITE, smooth_mode=False)
    add_torus_ring(
        center=Vector((0.0, s * 0.164, z_center)),
        axis_dir=Vector((1.0, 0.0, 0.0)),
        major_r=0.022,
        minor_r=0.008,
        maj_segs=14,
        min_segs=8,
        mat_idx=1,
    )


# 1. Flush-Seated HarborBronze Octagonal Deck Collar (-0.008 .. 0.062m, tight radius 0.174m to sit cleanly on miters)
base_profile = [
    (0.000, -0.008),
    (0.174, -0.008),
    (0.174,  0.012),
    (0.165,  0.038),
    (0.155,  0.060),
    (0.148,  0.066),
]
add_lathe(base_profile, segs=8, mat_idx=1, smooth_mode=False, phase=math.pi / 8.0)
for k in range(4):
    ang = (k + 0.5) * math.pi * 0.5
    add_bolt_head(Vector((0.144 * math.cos(ang), 0.144 * math.sin(ang), 0.032)), Vector((0.35 * math.cos(ang), 0.35 * math.sin(ang), 1.0)), radius=0.013, depth=0.014, mat_idx=1)

# 2. Chamfered 16-Sided Harbor Timber Piling (z = 0.058 .. 1.190m)
shaft_profile = [
    (0.154, 0.058),
    (0.156, 0.115),
    (0.146, 0.142),
    (0.145, 0.560),
    (0.144, 0.900),
    (0.142, 1.060),
    (0.130, 1.105),  # crisp turned neck cove
    (0.144, 1.142),  # timber collar beading
    (0.162, 1.175),  # clean eaves flare under cap
    (0.000, 1.178),
]
add_lathe(shaft_profile, segs=16, mat_idx=0, col=(1.0, 0.98, 0.95, 1.0), smooth_mode=True, check_grooves=True)

# 3. Lower Riveted Bronze Strap (z = 0.336 .. 0.402m)
lower_band = [
    (0.143, 0.336),
    (0.156, 0.344),
    (0.158, 0.394),
    (0.142, 0.402),
]
add_lathe(lower_band, segs=16, mat_idx=1, smooth_mode=False)
for k in range(8):
    ang = 2.0 * math.pi * k / 8.0
    add_bolt_head(Vector((0.156 * math.cos(ang), 0.156 * math.sin(ang), 0.369)), Vector((math.cos(ang), math.sin(ang), 0.0)), radius=0.010, depth=0.010, mat_idx=1)

# 4. Upper Tie-Ring HarborBronze Collar @ z=0.965m + +/-Y shackle eyelets + 6 rivets
upper_band = [
    (0.140, 0.922),
    (0.158, 0.930),
    (0.161, 0.965),
    (0.158, 1.000),
    (0.139, 1.008),
]
add_lathe(upper_band, segs=16, mat_idx=1, smooth_mode=False)
for k in range(8):
    if k in (2, 6):
        continue
    ang = 2.0 * math.pi * k / 8.0
    add_bolt_head(Vector((0.157 * math.cos(ang), 0.157 * math.sin(ang), 0.965)), Vector((math.cos(ang), math.sin(ang), 0.0)), radius=0.010, depth=0.010, mat_idx=1)

add_shackle_lug(+1.0, z_center=0.965)
add_shackle_lug(-1.0, z_center=0.965)

# 5. Tailored Architectural Marine Cream Storm-Cap (crisp faceted eaves + stepped cap + bronze finial -> max r=0.175m)
cap_profile = [
    (0.000, 1.168),
    (0.168, 1.168),
    (0.176, 1.186),  # crisp tailored harbor fascia (no floppy mushroom brim)
    (0.176, 1.224),
    (0.154, 1.246),  # clean 45-deg storm bevel
    (0.118, 1.268),  # shallow tiered weather deck
    (0.068, 1.288),
    (0.044, 1.294),
]
add_lathe(cap_profile, segs=16, mat_idx=2, col=(1.0, 0.99, 0.96, 1.0), smooth_mode=False)

finial_profile = [
    (0.046, 1.292),
    (0.055, 1.306),
    (0.040, 1.322),
    (0.016, 1.330),
    (0.000, 1.330),
]
add_lathe(finial_profile, segs=16, mat_idx=1, smooth_mode=True)

mesh = bpy.data.meshes.new("dock-post")
bm.to_mesh(mesh)
bm.free()
for m in (MAT_TIMBER, MAT_BRONZE, MAT_CAP):
    mesh.materials.append(m)
for p in mesh.polygons:
    if not p.use_smooth:
        p.use_smooth = False

obj = bpy.data.objects.new("dock-post", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()

xs = [v.co.x for v in mesh.vertices]
ys = [v.co.y for v in mesh.vertices]
zs = [v.co.z for v in mesh.vertices]
print(
    f"DOCK_POST_BOUNDS w={max(xs)-min(xs):.4f} d={max(ys)-min(ys):.4f} h={max(zs)-min(zs):.4f} "
    f"minZ={min(zs):.4f} maxZ={max(zs):.4f} cx={(max(xs)+min(xs))*0.5:.4f} cy={(max(ys)+min(ys))*0.5:.4f} tris={sum(len(p.vertices)-2 for p in mesh.polygons)}"
)

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "dock-post.blend"))
glb_path = out_dir / "dock-post.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_materials="EXPORT",
    export_texcoords=True,
    export_normals=True,
    export_attributes=True,
)
print(f"EXPORTED {glb_path}")
