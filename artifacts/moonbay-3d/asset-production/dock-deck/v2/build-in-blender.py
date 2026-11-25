import bpy
import bmesh
import math
import os
import sys

out_dir = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

# Exact handoff dims: width=3.80, depth=3.40, height=0.32, minZ=0.000
W = 3.80
D = 3.40
H = 0.32
PLANK_COUNT = 9
PLANK_PITCH = D / PLANK_COUNT
PLANK_DEPTH = PLANK_PITCH - 0.0258
PLANK_THICK = 0.106
PLANK_Z0 = H - PLANK_THICK  # 0.214 .. 0.320

# Weathered marine bronze / brass hardware material (slot 1 -> exported primitive 1)
bronze_mat = bpy.data.materials.new("HarborBronze")
bronze_mat.use_nodes = True
b_nodes = bronze_mat.node_tree.nodes
b_links = bronze_mat.node_tree.links
b_bsdf = b_nodes["Principled BSDF"]
b_bsdf.inputs["Base Color"].default_value = (0.345, 0.242, 0.135, 1.0)
b_bsdf.inputs["Metallic"].default_value = 0.72
b_bsdf.inputs["Roughness"].default_value = 0.42

# Procedural coastal cedar/teak shader for Cycle-baking into 1024x1024 atlas
proc_mat = bpy.data.materials.new("DockTimberProc")
proc_mat.use_nodes = True
pn = proc_mat.node_tree.nodes
pl = proc_mat.node_tree.links
pn.clear()

out_node = pn.new("ShaderNodeOutputMaterial")
bsdf_node = pn.new("ShaderNodeBsdfPrincipled")
pl.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])

geom_node = pn.new("ShaderNodeNewGeometry")
texcoord = pn.new("ShaderNodeTexCoord")

# Custom per-piece attributes: grain_axis (0=along X planks, 1=along Y stringers), tone_seed (0..1), wear_zone
attr_seed = pn.new("ShaderNodeAttribute")
attr_seed.attribute_name = "plank_seed"
attr_axis = pn.new("ShaderNodeAttribute")
attr_axis.attribute_name = "grain_y"
attr_shade = pn.new("ShaderNodeAttribute")
attr_shade.attribute_name = "beam_shadow"

# Build grain coordinates oriented along plank/stringer direction
sep_obj = pn.new("ShaderNodeSeparateXYZ")
pl.new(texcoord.outputs["Object"], sep_obj.inputs["Vector"])

# Cross-axis grain scaling: stretch along X when grain_y=0, along Y when grain_y=1
mix_u = pn.new("ShaderNodeMix")
mix_u.data_type = "FLOAT"
pl.new(attr_axis.outputs["Fac"], mix_u.inputs["Factor"])
pl.new(sep_obj.outputs["X"], mix_u.inputs["A"])
pl.new(sep_obj.outputs["Y"], mix_u.inputs["B"])

mix_v = pn.new("ShaderNodeMix")
mix_v.data_type = "FLOAT"
pl.new(attr_axis.outputs["Fac"], mix_v.inputs["Factor"])
pl.new(sep_obj.outputs["Y"], mix_v.inputs["A"])
pl.new(sep_obj.outputs["X"], mix_v.inputs["B"])

# Offset along grain by seed*7.3 so every board shows unique knots and cathedral rings
seed_off = pn.new("ShaderNodeMath")
seed_off.operation = "MULTIPLY"
seed_off.inputs[1].default_value = 7.31
pl.new(attr_seed.outputs["Fac"], seed_off.inputs[0])

add_u = pn.new("ShaderNodeMath")
add_u.operation = "ADD"
pl.new(mix_u.outputs["Result"], add_u.inputs[0])
pl.new(seed_off.outputs["Value"], add_u.inputs[1])

comb_grain = pn.new("ShaderNodeCombineXYZ")
pl.new(add_u.outputs["Value"], comb_grain.inputs["X"])
pl.new(mix_v.outputs["Result"], comb_grain.inputs["Y"])
pl.new(sep_obj.outputs["Z"], comb_grain.inputs["Z"])

map_grain = pn.new("ShaderNodeMapping")
map_grain.inputs["Scale"].default_value = (1.6, 18.0, 14.0)
pl.new(comb_grain.outputs["Vector"], map_grain.inputs["Vector"])

noise_ring = pn.new("ShaderNodeTexNoise")
noise_ring.inputs["Scale"].default_value = 3.2
noise_ring.inputs["Detail"].default_value = 7.0
noise_ring.inputs["Roughness"].default_value = 0.62
noise_ring.inputs["Distortion"].default_value = 0.85
pl.new(map_grain.outputs["Vector"], noise_ring.inputs["Vector"])

# Fine timber pores
map_pore = pn.new("ShaderNodeMapping")
map_pore.inputs["Scale"].default_value = (3.5, 42.0, 32.0)
pl.new(comb_grain.outputs["Vector"], map_pore.inputs["Vector"])

noise_pore = pn.new("ShaderNodeTexNoise")
noise_pore.inputs["Scale"].default_value = 9.0
noise_pore.inputs["Detail"].default_value = 4.0
pl.new(map_pore.outputs["Vector"], noise_pore.inputs["Vector"])

# Sunlit center traffic wear mask (slightly warmer/bleached toward center walkway |X|<1.25)
abs_x = pn.new("ShaderNodeMath")
abs_x.operation = "ABSOLUTE"
pl.new(sep_obj.outputs["X"], abs_x.inputs[0])

wear_map = pn.new("ShaderNodeMapRange")
wear_map.inputs["From Min"].default_value = 0.35
wear_map.inputs["From Max"].default_value = 1.85
wear_map.inputs["To Min"].default_value = 1.0
wear_map.inputs["To Max"].default_value = 0.0
pl.new(abs_x.outputs["Value"], wear_map.inputs["Value"])

# Combine ring + pores for grain factor
mix_grain = pn.new("ShaderNodeMath")
mix_grain.operation = "ADD"
pl.new(noise_ring.outputs["Fac"], mix_grain.inputs[0])

pore_mul = pn.new("ShaderNodeMath")
pore_mul.operation = "MULTIPLY"
pore_mul.inputs[1].default_value = 0.28
pl.new(noise_pore.outputs["Fac"], pore_mul.inputs[0])
pl.new(pore_mul.outputs["Value"], mix_grain.inputs[1])

grain_ramp = pn.new("ShaderNodeValToRGB")
gr = grain_ramp.color_ramp
gr.elements[0].position = 0.25
gr.elements[0].color = (0.195, 0.088, 0.032, 1.0)  # deep grain pore
e_mid = gr.elements.new(0.54)
e_mid.color = (0.415, 0.205, 0.072, 1.0)            # rich warm teak honey
gr.elements[1].position = 0.88
gr.elements[1].color = (0.560, 0.295, 0.112, 1.0)   # sunlit cedar highlight
pl.new(mix_grain.outputs["Value"], grain_ramp.inputs["Fac"])

# Subtle plank-to-plank color shift driven by plank_seed (0..1)
seed_ramp = pn.new("ShaderNodeValToRGB")
sr = seed_ramp.color_ramp
sr.elements[0].position = 0.0
sr.elements[0].color = (0.86, 0.84, 0.82, 1.0)
e_s2 = sr.elements.new(0.5)
e_s2.color = (1.02, 1.00, 0.97, 1.0)
sr.elements[1].position = 1.0
sr.elements[1].color = (1.13, 1.07, 0.99, 1.0)
pl.new(attr_seed.outputs["Fac"], seed_ramp.inputs["Fac"])

mul_seed = pn.new("ShaderNodeMix")
mul_seed.data_type = "RGBA"
mul_seed.blend_type = "MULTIPLY"
mul_seed.inputs["Factor"].default_value = 1.0
pl.new(grain_ramp.outputs["Color"], mul_seed.inputs["A"])
pl.new(seed_ramp.outputs["Color"], mul_seed.inputs["B"])

# Bleached walkway center patina + weathered underside shadow darkening
bleach_mix = pn.new("ShaderNodeMix")
bleach_mix.data_type = "RGBA"
bleach_mix.blend_type = "MIX"
pl.new(wear_map.outputs["Result"], bleach_mix.inputs["Factor"])
bleach_mul = pn.new("ShaderNodeMath")
bleach_mul.operation = "MULTIPLY"
bleach_mul.inputs[1].default_value = 0.18
pl.new(wear_map.outputs["Result"], bleach_mul.inputs[0])
pl.new(bleach_mul.outputs["Value"], bleach_mix.inputs["Factor"])
pl.new(mul_seed.outputs["Result"], bleach_mix.inputs["A"])
bleach_mix.inputs["B"].default_value = (0.62, 0.37, 0.17, 1.0)

shadow_mix = pn.new("ShaderNodeMix")
shadow_mix.data_type = "RGBA"
shadow_mix.blend_type = "MIX"
pl.new(attr_shade.outputs["Fac"], shadow_mix.inputs["Factor"])
pl.new(bleach_mix.outputs["Result"], shadow_mix.inputs["A"])
shadow_mix.inputs["B"].default_value = (0.145, 0.068, 0.025, 1.0)

pl.new(shadow_mix.outputs["Result"], bsdf_node.inputs["Base Color"])

# Roughness: worn sunlit boards slightly smoother (0.64), grain pores rougher (0.88)
rough_map = pn.new("ShaderNodeMapRange")
rough_map.inputs["From Min"].default_value = 0.25
rough_map.inputs["From Max"].default_value = 0.92
rough_map.inputs["To Min"].default_value = 0.88
rough_map.inputs["To Max"].default_value = 0.64
pl.new(mix_grain.outputs["Value"], rough_map.inputs["Value"])
pl.new(rough_map.outputs["Result"], bsdf_node.inputs["Roughness"])

# Bump / Normal relief along planks
bump_node = pn.new("ShaderNodeBump")
bump_node.inputs["Strength"].default_value = 0.20
bump_node.inputs["Distance"].default_value = 0.008
pl.new(mix_grain.outputs["Value"], bump_node.inputs["Height"])
pl.new(bump_node.outputs["Normal"], bsdf_node.inputs["Normal"])


def add_beveled_box(bm, cx, cy, cz, sx, sy, sz, bevel_w=0.011, segs=2):
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    verts = []
    for dx in (-hx, hx):
        for dy in (-hy, hy):
            for dz in (-hz, hz):
                verts.append(bm.verts.new((cx + dx, cy + dy, cz + dz)))
    faces = [
        (0, 2, 3, 1),
        (4, 5, 7, 6),
        (0, 1, 5, 4),
        (2, 6, 7, 3),
        (0, 4, 6, 2),
        (1, 3, 7, 5),
    ]
    new_edges = set()
    new_faces = []
    for f in faces:
        nf = bm.faces.new([verts[i] for i in f])
        new_faces.append(nf)
        for e in nf.edges:
            new_edges.add(e)
    if bevel_w > 0:
        bmesh.ops.bevel(
            bm,
            geom=list(new_edges),
            offset=bevel_w,
            segments=segs,
            affect="EDGES",
            clamp_overlap=True,
        )


def set_face_attr(bm, layer, val, start_face_idx):
    bm.faces.ensure_lookup_table()
    for f in bm.faces[start_face_idx:]:
        f[layer] = val


# Build Wood Deck + Structural Timber Stringers
wood_bm = bmesh.new()
seed_layer = wood_bm.faces.layers.float.new("plank_seed")
axis_layer = wood_bm.faces.layers.float.new("grain_y")
shade_layer = wood_bm.faces.layers.float.new("beam_shadow")

plank_seeds = [0.18, 0.76, 0.42, 0.91, 0.29, 0.64, 0.11, 0.83, 0.52]
for i in range(PLANK_COUNT):
    cy = -D * 0.5 + (i + 0.5) * PLANK_PITCH
    start_idx = len(wood_bm.faces)
    add_beveled_box(
        wood_bm,
        0.0,
        cy,
        PLANK_Z0 + PLANK_THICK * 0.5,
        W,
        PLANK_DEPTH,
        PLANK_THICK,
        bevel_w=0.011,
        segs=2,
    )
    set_face_attr(wood_bm, seed_layer, plank_seeds[i], start_idx)
    set_face_attr(wood_bm, axis_layer, 0.0, start_idx)
    set_face_attr(wood_bm, shade_layer, 0.0, start_idx)

# Three longitudinal bear stringers beneath planks (outer rim joists inset 4.5cm under overhang)
rim_x = W * 0.5 - 0.045 - 0.09  # 1.765 -> outer face at 1.855 (0.045m drip overhang!)
for idx, jx in enumerate((-rim_x, 0.0, rim_x)):
    start_idx = len(wood_bm.faces)
    add_beveled_box(
        wood_bm,
        jx,
        0.0,
        0.107,
        0.18,
        D,
        0.214,
        bevel_w=0.012,
        segs=2,
    )
    set_face_attr(wood_bm, seed_layer, 0.15 + idx * 0.25, start_idx)
    set_face_attr(wood_bm, axis_layer, 1.0, start_idx)
    set_face_attr(wood_bm, shade_layer, 0.36, start_idx)

# Two transverse structural tie beams linking stringers
for idx, ly in enumerate((-0.85, 0.85)):
    start_idx = len(wood_bm.faces)
    add_beveled_box(
        wood_bm,
        0.0,
        ly,
        0.123,
        W - 0.12,
        0.145,
        0.182,
        bevel_w=0.010,
        segs=2,
    )
    set_face_attr(wood_bm, seed_layer, 0.33 + idx * 0.31, start_idx)
    set_face_attr(wood_bm, axis_layer, 0.0, start_idx)
    set_face_attr(wood_bm, shade_layer, 0.45, start_idx)

bmesh.ops.recalc_face_normals(wood_bm, faces=wood_bm.faces)
wood_mesh = bpy.data.meshes.new("DockWoodMesh")
wood_bm.to_mesh(wood_mesh)
wood_bm.free()

wood_obj = bpy.data.objects.new("DockWood", wood_mesh)
scene.collection.objects.link(wood_obj)
wood_obj.data.materials.append(proc_mat)
for p in wood_obj.data.polygons:
    p.use_smooth = True

# Smart UV unwrap cleanly before Cycles baking
bpy.context.view_layer.objects.active = wood_obj
wood_obj.select_set(True)
uv_layer = wood_mesh.uv_layers.new(name="UVMap")
wood_mesh.uv_layers.active = uv_layer
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.008)
bpy.ops.object.mode_set(mode="OBJECT")

# Bake 1024x1024 BaseColor, Roughness, Normal maps via Cycles
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.bake_type = "DIFFUSE"
scene.render.bake.use_pass_direct = False
scene.render.bake.use_pass_indirect = False
scene.render.bake.use_pass_color = True
scene.render.bake.margin = 8

tex_color = bpy.data.images.new("dock-deck-albedo", 768, 768)
tex_rough = bpy.data.images.new("dock-deck-rough", 512, 512)
tex_norm = bpy.data.images.new("dock-deck-normal", 512, 512)
tex_rough.colorspace_settings.name = "Non-Color"
tex_norm.colorspace_settings.name = "Non-Color"

bake_img_node = pn.new("ShaderNodeTexImage")
pn.active = bake_img_node

def run_bake(pass_type, target_img, out_name):
    bake_img_node.image = target_img
    target_img.filepath_raw = os.path.join(out_dir, out_name)
    target_img.file_format = "PNG"
    bpy.ops.object.bake(type=pass_type)
    target_img.save()
    target_img.pack()

run_bake("DIFFUSE", tex_color, "dock-deck-albedo.png")
run_bake("ROUGHNESS", tex_rough, "dock-deck-rough.png")
run_bake("NORMAL", tex_norm, "dock-deck-normal.png")

# Replace procedural wood material with clean baked PBR material for glTF export
wood_pbr = bpy.data.materials.new("PierTimber")
wood_pbr.use_nodes = True
wn = wood_pbr.node_tree.nodes
wl = wood_pbr.node_tree.links
wn.clear()

w_out = wn.new("ShaderNodeOutputMaterial")
w_bsdf = wn.new("ShaderNodeBsdfPrincipled")
w_bsdf.inputs["Roughness"].default_value = 0.76
wl.new(w_bsdf.outputs["BSDF"], w_out.inputs["Surface"])

img_c = wn.new("ShaderNodeTexImage")
img_c.image = tex_color
wl.new(img_c.outputs["Color"], w_bsdf.inputs["Base Color"])

img_r = wn.new("ShaderNodeTexImage")
img_r.image = tex_rough
wl.new(img_r.outputs["Color"], w_bsdf.inputs["Roughness"])

img_n = wn.new("ShaderNodeTexImage")
img_n.image = tex_norm
norm_map = wn.new("ShaderNodeNormalMap")
norm_map.inputs["Strength"].default_value = 0.85
wl.new(img_n.outputs["Color"], norm_map.inputs["Color"])
wl.new(norm_map.outputs["Normal"], w_bsdf.inputs["Normal"])

wood_obj.data.materials[0] = wood_pbr

# Build Hardware Bronze Fasteners + Outer Stringer Iron Tie-Straps
metal_bm = bmesh.new()

def add_dome_bolt(bm, x, y, z, rx=0.011, ry=0.014, h=0.004, segs=10):
    ring_verts = []
    for k in range(segs):
        ang = 2 * math.pi * k / segs
        ring_verts.append(bm.verts.new((x + rx * math.cos(ang), y + ry * math.sin(ang), z - 0.001)))
    top_v = bm.verts.new((x, y, z + h))
    mid_ring = []
    for k in range(segs):
        ang = 2 * math.pi * k / segs
        mid_ring.append(bm.verts.new((x + rx * 0.68 * math.cos(ang), y + ry * 0.68 * math.sin(ang), z + h * 0.75)))
    for k in range(segs):
        kn = (k + 1) % segs
        bm.faces.new((ring_verts[k], ring_verts[kn], mid_ring[kn], mid_ring[k]))
        bm.faces.new((mid_ring[k], mid_ring[kn], top_v))

# Paired staggered carriage bolt heads on top of planks over outer & spine stringers
for i in range(PLANK_COUNT):
    cy = -D * 0.5 + (i + 0.5) * PLANK_PITCH
    jitter_y = 0.075 if i % 2 == 0 else -0.075
    for sx in (-1.0, 1.0):
        add_dome_bolt(metal_bm, sx * 1.48, cy - 0.075, H, rx=0.011, ry=0.015, h=0.004)
        add_dome_bolt(metal_bm, sx * 1.48, cy + 0.075, H, rx=0.011, ry=0.015, h=0.004)
    if i % 2 == 0:
        add_dome_bolt(metal_bm, -0.032, cy + jitter_y * 0.4, H, rx=0.010, ry=0.013, h=0.0035)
        add_dome_bolt(metal_bm, 0.032, cy - jitter_y * 0.4, H, rx=0.010, ry=0.013, h=0.0035)

# Three heavy outer fascia tie brackets per side (at X = +-1.855m, Y = -1.133, 0, +1.133)
outer_face_x = rim_x + 0.09  # 1.855
for sgn in (-1.0, 1.0):
    bx = sgn * (outer_face_x + 0.005)
    for ty in (-1.133, 0.0, 1.133):
        add_beveled_box(metal_bm, bx, ty, 0.115, 0.014, 0.125, 0.135, bevel_w=0.003, segs=1)
        for bz in (0.072, 0.158):
            # Side-facing dome rivet
            ang_segs = 8
            rv = []
            for k in range(ang_segs):
                a = 2 * math.pi * k / ang_segs
                rv.append(metal_bm.verts.new((bx + sgn * 0.006, ty + 0.013 * math.cos(a), bz + 0.013 * math.sin(a))))
            tv = metal_bm.verts.new((bx + sgn * 0.013, ty, bz))
            for k in range(ang_segs):
                kn = (k + 1) % ang_segs
                if sgn > 0:
                    metal_bm.faces.new((rv[k], rv[kn], tv))
                else:
                    metal_bm.faces.new((rv[kn], rv[k], tv))

bmesh.ops.recalc_face_normals(metal_bm, faces=metal_bm.faces)
metal_mesh = bpy.data.meshes.new("DockMetalMesh")
metal_bm.to_mesh(metal_mesh)
metal_bm.free()

metal_obj = bpy.data.objects.new("DockHardware", metal_mesh)
scene.collection.objects.link(metal_obj)
metal_obj.data.materials.append(bronze_mat)
for p in metal_obj.data.polygons:
    p.use_smooth = True

# Keep PierTimber first (slot 0), HarborBronze second (slot 1), joined into clean single object
bpy.ops.object.select_all(action="DESELECT")
wood_obj.select_set(True)
metal_obj.select_set(True)
bpy.context.view_layer.objects.active = wood_obj
bpy.ops.object.join()

root_obj = bpy.context.active_object
root_obj.name = "dock-deck"
root_obj.data.name = "dock-deck"

# Print exact bounding verification
coords = [root_obj.matrix_world @ v.co for v in root_obj.data.vertices]
xs = [c.x for c in coords]
ys = [c.y for c in coords]
zs = [c.z for c in coords]
dims = (round(max(xs) - min(xs), 4), round(max(ys) - min(ys), 4), round(max(zs) - min(zs), 4))
print("DOCK_DECK_V1", len(root_obj.data.polygons), dims, "minZ=", round(min(zs), 4), "maxZ=", round(max(zs), 4), "center=", (round((min(xs)+max(xs))/2, 4), round((min(ys)+max(ys))/2, 4)))

blend_path = os.path.join(out_dir, "dock-deck.blend")
glb_path = os.path.join(out_dir, "dock-deck.glb")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)
