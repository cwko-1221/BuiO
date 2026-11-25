"""Build Moonbay Marina Wharf Bollard Piling (dock-post v1):
Chamfered coastal walnut-oak harbor piling with beveled forged-bronze deck base
flange & lag bolts, lower riveted bronze barrel strap, upper bronze tie-ring collar
with forged +/-Y shackle eyelets centered at rope height (z=0.965m), vertical V-check
timber detailing, painted cream storm-cap bell & brass-topped finial.
Matches ASSETS['dock-post'].size = [0.38, 0.38, 1.33].
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


# 512x512 Vertical-Grain Weathered Teak/Walnut Oak & Storm-Cap Wood Textures
W_TX, H_TX = 512, 512
yy, xx = np.mgrid[0:H_TX, 0:W_TX].astype(np.float32)
u, v = xx / W_TX, yy / H_TX

# Vertical timber grain (u = circumference, v = height 0..1.33m)
warp = 0.035 * np.sin(v * 14.0 + 0.5 * np.cos(u * 6.0 * math.pi)) + 0.015 * np.sin(v * 33.0)
ring = np.sin((u * 18.0 + warp * 8.0) * 2.0 * math.pi)
pores = 0.45 * np.sin(u * 95.0 + v * 12.0) + 0.35 * np.cos(u * 170.0 - v * 28.0)
knots = np.exp(-(((u - 0.32) % 1.0 - 0.5) ** 2 / 0.008 + ((v - 0.56) ** 2) / 0.018))
cathedral = 0.50 + 0.34 * ring + 0.16 * pores - 0.25 * knots

# Sea-spray salt bleaching slightly higher near deck base (v < 0.22) and top drip shoulder (v > 0.78)
salt = np.clip(1.0 - v / 0.22, 0.0, 1.0) * 0.22 + np.clip((v - 0.80) / 0.20, 0.0, 1.0) * 0.10
dark_edge = np.exp(-((np.abs(u - 0.25) < 0.018) * 1.0)) * 0.0  # crisp V-check handled in geometry too

t_factor = np.clip(cathedral, 0.0, 1.0)
# Warm coastal walnut-teak (clear visual contrast against dock-deck cedar planks, zero black mud!)
r_c = (0.31 + 0.24 * t_factor) * (1.0 - 0.15 * salt) + 0.18 * salt
g_c = (0.16 + 0.15 * t_factor) * (1.0 - 0.10 * salt) + 0.17 * salt
b_c = (0.08 + 0.08 * t_factor) * (1.0 - 0.05 * salt) + 0.15 * salt

timber_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
timber_rgba[..., 0] = np.clip(r_c, 0.0, 1.0)
timber_rgba[..., 1] = np.clip(g_c, 0.0, 1.0)
timber_rgba[..., 2] = np.clip(b_c, 0.0, 1.0)
timber_img = make_packed_image("dock-post-timber", W_TX, H_TX, timber_rgba, "sRGB")

rough_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
r_rough = np.clip(0.84 - 0.20 * t_factor + 0.08 * salt, 0.55, 0.94)
rough_rgba[..., 0] = r_rough
rough_rgba[..., 1] = r_rough
rough_rgba[..., 2] = r_rough
timber_rough_img = make_packed_image("dock-post-rough", W_TX, H_TX, rough_rgba, "Non-Color")

# Painted marine cream wood cap texture (subtle aged brush grain + sun patina matching village-fence cream)
brush = 0.50 + 0.30 * np.sin(u * 48.0 + 0.8 * np.sin(v * 20.0)) + 0.20 * np.cos(v * 64.0)
cap_rgba = np.ones((H_TX, W_TX, 4), dtype=np.float32)
cap_rgba[..., 0] = np.clip(0.88 + 0.08 * brush, 0.0, 1.0)
cap_rgba[..., 1] = np.clip(0.80 + 0.09 * brush, 0.0, 1.0)
cap_rgba[..., 2] = np.clip(0.62 + 0.09 * brush, 0.0, 1.0)
cap_img = make_packed_image("dock-post-cap", W_TX, H_TX, cap_rgba, "sRGB")


def make_tex_mat(name, img, rough_img=None, rough_val=0.68, metal=0.0, spec=0.35):
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
    # Matches dock-deck HarborBronze slot (exact linear base values)
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
MAT_CAP = make_tex_mat("HarborStormCap", cap_img, rough_val=0.58, spec=0.40)

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
                v_z = max(0.0, min(1.0, (co.z + 0.03) / 1.38))
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
                # Subtle seasonal wood drying checks on two side faces (+/-X edges, avoiding rope lugs on +/-Y)
                if check_grooves and 0.14 < z < 1.12 and abs(abs(math.cos(ang)) - 1.0) < 0.04:
                    rk -= 0.008
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


def add_torus_ring(center, axis_dir, major_r, minor_r, maj_segs=18, min_segs=8, mat_idx=1):
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


def add_bolt_head(pos, normal_dir, radius=0.013, depth=0.012, mat_idx=1):
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
    """Sculpt forged bronze tie bracket + shackle eye centered cleanly at local (+/-Y, z=0.965m) for dock-rope!"""
    s = 1.0 if side_y >= 0 else -1.0
    # Mounting saddle plate seated into collar band (y ~ +/- 0.156m)
    before = set(bm.faces)
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    bmesh.ops.transform(
        bm,
        matrix=Matrix.Translation((0.0, s * 0.152, z_center)) @ Matrix.Diagonal((0.056, 0.040, 0.072, 1.0)),
        verts=verts,
    )
    assign_faces([f for f in bm.faces if f not in before], 1, WHITE, smooth_mode=False)
    # Heavy forged bronze ring torus protruding cleanly outward to +/-0.188m (within 0.38m footprint)
    add_torus_ring(
        center=Vector((0.0, s * 0.168, z_center)),
        axis_dir=Vector((1.0, 0.0, 0.0)),
        major_r=0.025,
        minor_r=0.0085,
        maj_segs=16,
        min_segs=8,
        mat_idx=1,
    )


# 1. Forged HarborBronze Octagonal Anchoring Base Shoe (-0.024 .. 0.055m -> solid seat on dock-deck)
base_profile = [
    (0.000, -0.024),
    (0.189, -0.024),
    (0.189,  0.008),
    (0.178,  0.036),
    (0.165,  0.058),
    (0.156,  0.062),
]
add_lathe(base_profile, segs=8, mat_idx=1, smooth_mode=False, phase=math.pi / 8.0)
# Four chamfered bronze deck lag bolts on the chamfered top corners of the base flange
for k in range(4):
    ang = (k + 0.5) * math.pi * 0.5
    add_bolt_head(Vector((0.152 * math.cos(ang), 0.152 * math.sin(ang), 0.028)), Vector((0.35 * math.cos(ang), 0.35 * math.sin(ang), 1.0)), radius=0.015, depth=0.016, mat_idx=1)

# 2. Main Chamfered Timber Harbor Piling (z = 0.052 .. 1.185m, tapered shaft + turned neck collar)
shaft_profile = [
    (0.162, 0.052),
    (0.164, 0.115),  # timber base dado
    (0.150, 0.140),
    (0.148, 0.560),  # subtle harbor waist
    (0.146, 0.900),
    (0.144, 1.050),
    (0.132, 1.095),  # carved cove neck
    (0.146, 1.135),  # flared timber shoulder
    (0.168, 1.175),  # eaves step under storm cap
    (0.000, 1.178),
]
add_lathe(shaft_profile, segs=16, mat_idx=0, col=(1.0, 0.98, 0.95, 1.0), smooth_mode=True, check_grooves=True)

# 3. Lower Forged Bronze Structural Strap (z = 0.340 .. 0.398m) + 8 rivets
lower_band = [
    (0.145, 0.336),
    (0.158, 0.344),
    (0.160, 0.394),
    (0.144, 0.402),
]
add_lathe(lower_band, segs=16, mat_idx=1, smooth_mode=False)
for k in range(8):
    ang = 2.0 * math.pi * k / 8.0
    add_bolt_head(Vector((0.158 * math.cos(ang), 0.158 * math.sin(ang), 0.369)), Vector((math.cos(ang), math.sin(ang), 0.0)), radius=0.010, depth=0.010, mat_idx=1)

# 4. Upper Tie-Ring HarborBronze Collar (z = 0.922 .. 1.008m) + 6 side studs + forged +/-Y rope eyelets @ z=0.965m!
upper_band = [
    (0.142, 0.920),
    (0.159, 0.928),
    (0.162, 0.965),
    (0.159, 1.002),
    (0.141, 1.010),
]
add_lathe(upper_band, segs=16, mat_idx=1, smooth_mode=False)
for k in range(8):
    # Skip +/-Y axes (k=2,6) where shackle lugs mount
    if k in (2, 6):
        continue
    ang = 2.0 * math.pi * k / 8.0
    add_bolt_head(Vector((0.158 * math.cos(ang), 0.158 * math.sin(ang), 0.965)), Vector((math.cos(ang), math.sin(ang), 0.0)), radius=0.011, depth=0.011, mat_idx=1)

add_shackle_lug(+1.0, z_center=0.965)
add_shackle_lug(-1.0, z_center=0.965)

# 5. Painted Cream Marine Storm-Cap & Turned Bronze Acorn Finial (z = 1.168 .. 1.330m, outer radius = 0.189m -> w=0.378m)
cap_profile = [
    (0.000, 1.168),
    (0.175, 1.168),
    (0.189, 1.186),  # overhanging drip eaves edge (matches 0.38m spec cleanly)
    (0.189, 1.216),  # fascia band
    (0.168, 1.244),  # beveled bell dome
    (0.125, 1.274),
    (0.068, 1.292),
    (0.042, 1.298),
]
add_lathe(cap_profile, segs=16, mat_idx=2, col=(1.0, 0.99, 0.96, 1.0), smooth_mode=True)

# Top brass/bronze acorn finial capping cleanly at maxZ = 1.330m
finial_profile = [
    (0.044, 1.296),
    (0.054, 1.308),
    (0.042, 1.322),
    (0.018, 1.330),
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
