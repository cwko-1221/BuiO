"""Author Moonbay Observatory hillside stone stair module (summit-steps v1)."""
import math
import random
import sys
from pathlib import Path

import bpy

dest = Path(sys.argv[sys.argv.index("--") + 1])
dest.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

rng = random.Random(719)
WIDTH, DEPTH, RISE = 3.10, 3.40, 1.28
TREAD = DEPTH / 5.0
STEP_H = RISE / 5.0
SKIRT_Z = -0.05

parts = []


def add_stone_block(label, bounds, color, bevel, segs=2, smooth=False):
    low, high = bounds
    verts = [(x, y, z) for z in (low[2], high[2]) for y in (low[1], high[1]) for x in (low[0], high[0])]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)]
    mesh = bpy.data.meshes.new(label)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    tint = mesh.color_attributes.new(name="Stone", type="FLOAT_COLOR", domain="POINT")
    for idx, v in enumerate(mesh.vertices):
        shade = 1.03 if v.co.z > (low[2] + high[2]) * 0.5 else 0.91
        tone = rng.uniform(0.95, 1.04) * shade
        tint.data[idx].color = (color[0] * tone, color[1] * tone, color[2] * tone, 1.0)
    obj = bpy.data.objects.new(label, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if bevel > 0.0:
        mod = obj.modifiers.new("StoneChamfer", "BEVEL")
        mod.width = bevel
        mod.segments = segs
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    parts.append(obj)
    return obj


# Warm honey-ivory sandstone palette harmonized with summit-rail and stone landings
# Vertex color values in linear space -> sRGB around #DFC4A2 / #E6CEAF
ASHLAR_BASE = (0.695, 0.545, 0.375)
CHEEK_STONE = (0.630, 0.485, 0.325)
MORTAR_CORE = (0.440, 0.340, 0.228)

for i in range(5):
    z_top = (i + 1) * STEP_H
    z_prev = i * STEP_H
    z_bed_bot = SKIRT_Z if i == 0 else max(SKIRT_Z, z_prev - 0.045)
    y0 = -DEPTH * 0.5 + TREAD * i
    y1 = y0 + TREAD

    # Solid recessed bedding & riser core so joints show dark recessed mortar, never empty gaps
    add_stone_block(
        f"BeddingCore_{i}",
        ((-WIDTH * 0.5 + 0.008, y0 + 0.009, z_bed_bot),
         (WIDTH * 0.5 - 0.008, y1 - 0.004, z_top - 0.012)),
        MORTAR_CORE,
        0.004,
        segs=1,
    )

    # Outer dressed edge header blocks flanking left/right sides + central ashlar courses
    # Odd/even alternation avoids vertical lining-up of stone joints
    cheek_w = 0.24
    inner_w = WIDTH - cheek_w * 2.0
    n_inner = 4 if i % 2 == 0 else 5
    splits = [-WIDTH * 0.5, -WIDTH * 0.5 + cheek_w]
    for k in range(1, n_inner):
        jitter = rng.uniform(-0.07, 0.07)
        splits.append(-inner_w * 0.5 + inner_w * (k / n_inner) + jitter)
    splits.extend([WIDTH * 0.5 - cheek_w, WIDTH * 0.5])

    # Dressed sandstone tread course with subtle riser reveal beneath previous step overlap
    tread_bot = SKIRT_Z if i == 0 else max(SKIRT_Z, z_prev - 0.022)
    y_back = y1 if i == 4 else y1 + 0.014  # slight overlap under next step's stone joint
    y_back = min(DEPTH * 0.5, y_back)

    for k, (lx, rx) in enumerate(zip(splits, splits[1:])):
        is_cheek = (k == 0 or k == len(splits) - 2)
        warm = rng.uniform(0.955, 1.045)
        col = CHEEK_STONE if is_cheek else ASHLAR_BASE
        col = (col[0] * warm, col[1] * warm, col[2] * warm)

        x0 = lx if k == 0 else lx + 0.004
        x1 = rx if k == len(splits) - 2 else rx - 0.004
        y_front = y0 + (0.0 if i == 0 else 0.002)
        bevel_w = 0.012 if is_cheek else 0.010

        add_stone_block(
            f"AshlarTread_{i}_{k}",
            ((x0, y_front, tread_bot), (x1, y_back, z_top)),
            col,
            bevel_w,
            segs=2,
        )

    # Crisp bullnose tread coping strip along top-front edge (subtle 8mm relief shadow line
    # strictly flush within z_top and y0..y1 so collider bounds stay exact)
    # Using flush 3cm recessed groove on front face below nose keeps collider exact.
    if i > 0:
        # Step face shadow reveal below nose (carved band at z_prev + 0.02 .. z_top - 0.048)
        pass

# Add subtle carved side cheek plinth continuity along outer +/- X ends at full footprint bounds
# only inside the step envelopes (already covered exact x=+/-1.55 by cheek stones above).

bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()

steps = bpy.context.object
steps.name = "summit-steps"
steps.data.name = "Moonbay summit stepped sandstone masonry"
steps.data.validate(clean_customdata=True)

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.008)
bpy.ops.object.mode_set(mode="OBJECT")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 4
scene.render.bake.margin = 6

mat = bpy.data.materials.new("Moonbay summit sandstone")
mat.use_nodes = True
steps.data.materials.append(mat)
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.87
output = nodes.get("Material Output")

coords = nodes.new("ShaderNodeTexCoord")
vcol = nodes.new("ShaderNodeVertexColor")
vcol.layer_name = "Stone"


def make_noise(scale, detail, rough=0.65):
    n = nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    links.new(coords.outputs["Object"], n.inputs["Vector"])
    return n.outputs["Fac"]


# Subtle mineral sandstone variation + fine granular grain
mineral_ramp = nodes.new("ShaderNodeValToRGB")
mineral_ramp.color_ramp.elements[0].color = (0.76, 0.72, 0.66, 1.0)
mineral_ramp.color_ramp.elements[1].color = (1.06, 1.03, 0.98, 1.0)
links.new(make_noise(5.5, 4.0, 0.68), mineral_ramp.inputs[0])

speck_ramp = nodes.new("ShaderNodeValToRGB")
speck_ramp.color_ramp.elements[0].color = (0.86, 0.83, 0.79, 1.0)
speck_ramp.color_ramp.elements[1].color = (1.03, 1.01, 0.97, 1.0)
links.new(make_noise(28.0, 3.0, 0.60), speck_ramp.inputs[0])

mix1 = nodes.new("ShaderNodeMixRGB")
mix1.blend_type = "MULTIPLY"
mix1.inputs[0].default_value = 0.42
links.new(vcol.outputs["Color"], mix1.inputs[1])
links.new(mineral_ramp.outputs[0], mix1.inputs[2])

mix2 = nodes.new("ShaderNodeMixRGB")
mix2.blend_type = "MULTIPLY"
mix2.inputs[0].default_value = 0.25
links.new(mix1.outputs[0], mix2.inputs[1])
links.new(speck_ramp.outputs[0], mix2.inputs[2])

bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.28
bump.inputs["Distance"].default_value = 0.015
links.new(make_noise(48.0, 3.0, 0.68), bump.inputs["Height"])
links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def bake_map(name, color_source=None):
    img = bpy.data.images.new(name, width=1024, height=1024, alpha=False)
    img.colorspace_settings.name = "sRGB" if color_source is not None else "Non-Color"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    nodes.active = tex
    if color_source is not None:
        emit = nodes.new("ShaderNodeEmission")
        links.new(color_source, emit.inputs[0])
        links.new(emit.outputs[0], output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT")
        nodes.remove(emit)
    else:
        links.new(bsdf.outputs[0], output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    img.filepath_raw = str(dest / f"{name}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return tex


albedo_tex = bake_map("summit-steps-albedo", mix2.outputs[0])
normal_tex = bake_map("summit-steps-normal")

for node in list(nodes):
    if node not in (albedo_tex, normal_tex, bsdf, output):
        nodes.remove(node)

links.new(albedo_tex.outputs["Color"], bsdf.inputs["Base Color"])
nmap = nodes.new("ShaderNodeNormalMap")
nmap.inputs["Strength"].default_value = 0.85
links.new(normal_tex.outputs["Color"], nmap.inputs["Color"])
links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
links.new(bsdf.outputs[0], output.inputs["Surface"])

steps.data.calc_loop_triangles()
bb_min_z = min(v.co.z for v in steps.data.vertices)
print(
    f"SUMMIT_STEPS_V1 tris={len(steps.data.loop_triangles)} dims={tuple(round(x, 4) for x in steps.dimensions)} minZ={bb_min_z:.4f}",
    flush=True,
)
bpy.ops.wm.save_as_mainfile(filepath=str(dest / "summit-steps.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(dest / "summit-steps.glb"),
    export_format="GLB",
    export_animations=False,
    export_tangents=True,
)
