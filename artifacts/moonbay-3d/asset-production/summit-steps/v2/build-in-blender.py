"""Author Moonbay Observatory hillside sandstone stair module (summit-steps v2)."""
import math
import random
import sys
from pathlib import Path

import bpy

dest = Path(sys.argv[sys.argv.index("--") + 1])
dest.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

rng = random.Random(7192)
WIDTH, DEPTH, RISE = 3.10, 3.40, 1.28
TREAD = DEPTH / 5.0
STEP_H = RISE / 5.0
BASE_Z = -0.04
NOSE = 0.018
CAP_H = 0.042

parts = []


def add_stone_block(label, bounds, color, bevel, segs=2, ambient_grad=True):
    low, high = bounds
    verts = [(x, y, z) for z in (low[2], high[2]) for y in (low[1], high[1]) for x in (low[0], high[0])]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)]
    mesh = bpy.data.meshes.new(label)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    tint = mesh.color_attributes.new(name="Stone", type="FLOAT_COLOR", domain="POINT")
    z_mid = (low[2] + high[2]) * 0.5
    for idx, v in enumerate(mesh.vertices):
        shade = 1.04 if (not ambient_grad or v.co.z >= z_mid) else 0.87
        tone = rng.uniform(0.955, 1.035) * shade
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
    parts.append(obj)
    return obj


# Rich warm honey sandstone palette harmonizing with landings, railStone, and mountain rock
TREAD_SLAB = (0.71, 0.548, 0.372)
CHEEK_SLAB = (0.64, 0.482, 0.318)
RISER_STONE = (0.585, 0.440, 0.292)
MORTAR_CORE = (0.395, 0.295, 0.195)

for i in range(5):
    z_top = (i + 1) * STEP_H
    z_cap_bot = z_top - CAP_H
    y_nose = -DEPTH * 0.5 + TREAD * i
    y_back = y_nose + TREAD if i == 4 else min(DEPTH * 0.5, y_nose + TREAD + 0.015)

    # 1. Continuous solid backing/mortar core down to BASE_Z (-0.04m)
    # Gives rock-solid underside from reverse angles and fills every stone seam cleanly.
    add_stone_block(
        f"MortarCore_{i}",
        ((-WIDTH * 0.5 + 0.010, y_nose + NOSE + 0.010, BASE_Z),
         (WIDTH * 0.5 - 0.010, min(DEPTH * 0.5, y_nose + TREAD + 0.008), z_top - 0.010)),
        MORTAR_CORE,
        0.003,
        segs=1,
        ambient_grad=False,
    )

    # 2. Recessed dressed stone riser blocks down to BASE_Z (or overlap cleanly)
    # Recessed NOSE (1.8cm) behind bullnose cap front edge -> sharp sunlit shadow line per step!
    y_riser_front = y_nose + NOSE
    z_riser_top = z_cap_bot + 0.006
    cheek_w = 0.23
    inner_w = WIDTH - cheek_w * 2.0

    # Solid stepped riser courses (4 blocks across width, staggered opposite to treads)
    n_risers = 3 if i % 2 == 0 else 4
    r_splits = [-WIDTH * 0.5 + 0.002, -WIDTH * 0.5 + cheek_w]
    for k in range(1, n_risers):
        r_splits.append(-inner_w * 0.5 + inner_w * (k / n_risers) + rng.uniform(-0.05, 0.05))
    r_splits.extend([WIDTH * 0.5 - cheek_w, WIDTH * 0.5 - 0.002])

    for k, (lx, rx) in enumerate(zip(r_splits, r_splits[1:])):
        tone = rng.uniform(0.94, 1.04)
        r_col = tuple(c * tone for c in RISER_STONE)
        x0 = lx if k == 0 else lx + 0.004
        x1 = rx if k == len(r_splits) - 2 else rx - 0.004
        add_stone_block(
            f"RiserCourse_{i}_{k}",
            ((x0, y_riser_front, BASE_Z), (x1, y_nose + TREAD, z_riser_top)),
            r_col,
            0.008,
            segs=2,
        )

    # 3. Projecting dressed bullnose tread slabs flush at top elevation z_top
    n_treads = 4 if i % 2 == 0 else 5
    t_splits = [-WIDTH * 0.5, -WIDTH * 0.5 + cheek_w]
    for k in range(1, n_treads):
        t_splits.append(-inner_w * 0.5 + inner_w * (k / n_treads) + rng.uniform(-0.07, 0.07))
    t_splits.extend([WIDTH * 0.5 - cheek_w, WIDTH * 0.5])

    for k, (lx, rx) in enumerate(zip(t_splits, t_splits[1:])):
        is_cheek = (k == 0 or k == len(t_splits) - 2)
        base_col = CHEEK_SLAB if is_cheek else TREAD_SLAB
        warm = rng.uniform(0.945, 1.055)
        col = tuple(c * warm for c in base_col)
        x0 = lx if k == 0 else lx + 0.005
        x1 = rx if k == len(t_splits) - 2 else rx - 0.005
        # Cheek coping spans from nose down onto cheek mass smoothly
        z_slab_bot = z_cap_bot if not is_cheek else z_cap_bot - 0.006
        add_stone_block(
            f"TreadSlab_{i}_{k}",
            ((x0, y_nose, z_slab_bot), (x1, y_back, z_top)),
            col,
            0.011,
            segs=2,
        )

bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()

steps = bpy.context.object
steps.name = "summit-steps"
steps.data.name = "Moonbay summit sandstone stepped masonry"
steps.data.validate(clean_customdata=True)

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.008)
bpy.ops.object.mode_set(mode="OBJECT")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 2
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


def make_noise(scale, detail, rough=0.62):
    n = nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    links.new(coords.outputs["Object"], n.inputs["Vector"])
    return n.outputs["Fac"]


mineral_ramp = nodes.new("ShaderNodeValToRGB")
mineral_ramp.color_ramp.elements[0].color = (0.72, 0.67, 0.60, 1.0)
mineral_ramp.color_ramp.elements[1].color = (1.07, 1.04, 0.98, 1.0)
links.new(make_noise(4.8, 3.0, 0.62), mineral_ramp.inputs[0])

speck_ramp = nodes.new("ShaderNodeValToRGB")
speck_ramp.color_ramp.elements[0].color = (0.85, 0.82, 0.78, 1.0)
speck_ramp.color_ramp.elements[1].color = (1.03, 1.01, 0.97, 1.0)
links.new(make_noise(22.0, 2.5, 0.55), speck_ramp.inputs[0])

mix1 = nodes.new("ShaderNodeMixRGB")
mix1.blend_type = "MULTIPLY"
mix1.inputs[0].default_value = 0.45
links.new(vcol.outputs["Color"], mix1.inputs[1])
links.new(mineral_ramp.outputs[0], mix1.inputs[2])

mix2 = nodes.new("ShaderNodeMixRGB")
mix2.blend_type = "MULTIPLY"
mix2.inputs[0].default_value = 0.24
links.new(mix1.outputs[0], mix2.inputs[1])
links.new(speck_ramp.outputs[0], mix2.inputs[2])

bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.26
bump.inputs["Distance"].default_value = 0.014
links.new(make_noise(36.0, 2.5, 0.62), bump.inputs["Height"])
links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def bake_map(name, size, color_source=None):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False)
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


albedo_tex = bake_map("summit-steps-albedo", 1024, mix2.outputs[0])
normal_tex = bake_map("summit-steps-normal", 768)

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
    f"SUMMIT_STEPS_V2 tris={len(steps.data.loop_triangles)} dims={tuple(round(x, 4) for x in steps.dimensions)} minZ={bb_min_z:.4f}",
    flush=True,
)
bpy.ops.wm.save_as_mainfile(filepath=str(dest / "summit-steps.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(dest / "summit-steps.glb"),
    export_format="GLB",
    export_animations=False,
    export_tangents=True,
)
