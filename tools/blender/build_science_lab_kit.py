"""Build the BuiO primary-science reusable laboratory asset kit.

This script is intentionally self-contained and is designed to be run with a
factory-startup Blender background process.  It never opens or saves a .blend
file; its only artifact is the GLB passed as the first command-line argument.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Vector


TAU = math.tau


def shipping_dimensions(dimensions: tuple[float, float, float]) -> list[float]:
    """Convert Blender XYZ extents to glTF Y-up XYZ extents for extras."""
    return [dimensions[0], dimensions[2], dimensions[1]]


def output_path() -> str:
    args = sys.argv
    if "--" in args:
        tail = args[args.index("--") + 1 :]
        if tail:
            return os.path.abspath(tail[0])
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(
        os.path.join(here, "..", "..", "science-lab-app", "public", "models", "science-lab-kit.glb")
    )


def requested_asset_names() -> set[str] | None:
    """Optional second CLI argument: comma-separated builder suffixes."""
    args = sys.argv
    if "--" not in args:
        return None
    tail = args[args.index("--") + 1 :]
    if len(tail) < 2 or not tail[1].strip():
        return None
    return {name.strip().lower() for name in tail[1].split(",") if name.strip()}


OUT = output_path()
REQUESTED_ASSETS = requested_asset_names()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def set_input(node, names, value) -> None:
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.42,
    transmission: float = 0.0,
    ior: float = 1.45,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    mat.use_screen_refraction = transmission > 0 if hasattr(mat, "use_screen_refraction") else False
    if color[3] < 1.0:
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
        elif hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
        mat.use_transparency_overlap = False if hasattr(mat, "use_transparency_overlap") else True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, ["Base Color"], color)
    set_input(bsdf, ["Metallic"], metallic)
    set_input(bsdf, ["Roughness"], roughness)
    set_input(bsdf, ["IOR"], ior)
    set_input(bsdf, ["Alpha"], color[3])
    set_input(bsdf, ["Transmission Weight", "Transmission"], transmission)
    set_input(bsdf, ["Coat Weight", "Clearcoat"], 0.28 if transmission else 0.08)
    set_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.12)
    if emission is not None:
        set_input(bsdf, ["Emission Color", "Emission"], emission)
        set_input(bsdf, ["Emission Strength"], emission_strength)
    mat["material_family"] = (
        "glass" if transmission else "metal" if metallic > 0.5 else "polymer"
    )
    return mat


MAT = {}


def _texture_sample(kind: str, u: float, v: float, seed: float) -> tuple[float, float]:
    """Return deterministic height and fine noise for a small PBR texture."""
    noise = math.sin((u * 127.1 + v * 311.7 + seed * 19.19) * 12.9898) * 43758.5453
    noise = noise - math.floor(noise)
    if kind == "wood":
        grain = math.sin(v * 46.0 + math.sin(u * 13.0) * 2.1)
        fine = math.sin(v * 137.0 + u * 9.0)
        return 0.5 + grain * 0.32 + fine * 0.08 + (noise - 0.5) * 0.08, noise
    if kind == "copper":
        brushed = math.sin(v * 236.0 + math.sin(u * 17.0) * 0.5)
        return 0.5 + brushed * 0.055 + (noise - 0.5) * 0.045, noise
    return 0.5 + (noise - 0.5) * 0.22, noise


def _generated_texture(name: str, kind: str, channel: str, *, size: int = 256) -> bpy.types.Image:
    """Create and pack a compact colour, roughness or tangent-normal texture."""
    heights: list[float] = []
    noises: list[float] = []
    for y in range(size):
        v = y / max(1, size - 1)
        for x in range(size):
            u = x / max(1, size - 1)
            height, noise = _texture_sample(kind, u, v, len(name) * 0.17)
            heights.append(max(0.0, min(1.0, height)))
            noises.append(noise)

    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            index = y * size + x
            height = heights[index]
            noise = noises[index]
            if channel == "base":
                if kind == "wood":
                    factor = 0.78 + height * 0.28
                    color = (
                        min(1.0, 0.82 * factor),
                        min(1.0, 0.60 * factor),
                        min(1.0, 0.36 * factor),
                    )
                elif kind == "copper":
                    factor = 0.96 + (noise - 0.5) * 0.045
                    color = (
                        min(1.0, 0.98 * factor),
                        min(1.0, 0.47 * factor),
                        min(1.0, 0.19 * factor),
                    )
                else:
                    factor = 0.95 + (noise - 0.5) * 0.055
                    color = (0.055 * factor, 0.57 * factor, 0.36 * factor)
            elif channel == "roughness":
                if kind == "wood":
                    value = 0.52 + (1.0 - height) * 0.19
                elif kind == "copper":
                    value = 0.22 + abs(height - 0.5) * 0.16
                else:
                    value = 0.31 + noise * 0.11
                color = (value, value, value)
            else:
                left = heights[y * size + max(0, x - 1)]
                right = heights[y * size + min(size - 1, x + 1)]
                down = heights[max(0, y - 1) * size + x]
                up = heights[min(size - 1, y + 1) * size + x]
                strength = 1.15 if kind == "wood" else 0.72 if kind == "copper" else 0.38
                nx = -(right - left) * strength
                ny = -(up - down) * strength
                nz = 1.0
                length = math.sqrt(nx * nx + ny * ny + nz * nz)
                color = (nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5)
            pixels.extend((*color, 1.0))

    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.file_format = "PNG"
    image.pixels.foreach_set(pixels)
    image.update()
    image.pack()
    if channel != "base":
        image.colorspace_settings.name = "Non-Color"
    return image


def spoon_material(kind: str) -> bpy.types.Material:
    """PBR material with packed authored maps, suitable for glTF export."""
    key = f"spoon_{kind}"
    cached = MAT.get(key)
    if cached is not None:
        return cached
    name = f"MAT_SPOON_{kind.upper()}"
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    output.location = (620, 0)
    bsdf.location = (340, 0)
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    # A slightly softened metallic response keeps copper readable under the
    # deliberately simple classroom lighting while retaining brushed highlights.
    set_input(bsdf, ["Metallic"], 0.84 if kind == "copper" else 0.0)
    set_input(bsdf, ["Roughness"], 0.25 if kind == "copper" else 0.38 if kind == "plastic" else 0.62)
    set_input(bsdf, ["IOR"], 1.46)
    set_input(bsdf, ["Coat Weight", "Clearcoat"], 0.24 if kind == "plastic" else 0.08 if kind == "wood" else 0.0)
    set_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.18)

    base_node = nodes.new("ShaderNodeTexImage")
    base_node.name = f"{name}_BASE"
    base_node.image = _generated_texture(f"TEX_{kind.upper()}_BASE", kind, "base")
    base_node.location = (-520, 150)
    links.new(base_node.outputs["Color"], bsdf.inputs["Base Color"])

    rough_node = nodes.new("ShaderNodeTexImage")
    rough_node.name = f"{name}_ROUGH"
    rough_node.image = _generated_texture(f"TEX_{kind.upper()}_ROUGH", kind, "roughness")
    rough_node.location = (-520, -30)
    links.new(rough_node.outputs["Color"], bsdf.inputs["Roughness"])

    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.name = f"{name}_NORMAL"
    normal_node.image = _generated_texture(f"TEX_{kind.upper()}_NORMAL", kind, "normal")
    normal_node.location = (-520, -220)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-80, -210)
    # Keep the micro-surface readable without exposing UV seams or creating a
    # woven/grid look at the close camera distance used by the experiment.
    normal_map.inputs["Strength"].default_value = 0.34 if kind == "wood" else 0.035 if kind == "copper" else 0.09
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    mat["material_family"] = "metal" if kind == "copper" else "wood" if kind == "wood" else "polymer"
    mat["texture_maps"] = ["baseColor", "roughness", "normal"]
    MAT[key] = mat
    return mat


def build_materials() -> None:
    MAT.update(
        glass=material("MAT_GLASS_CLEAR", (0.72, 0.93, 1.0, 0.30), roughness=0.08, transmission=0.88, ior=1.46),
        glass_blue=material("MAT_GLASS_BLUE", (0.38, 0.78, 0.98, 0.34), roughness=0.10, transmission=0.82, ior=1.46),
        glass_warm=material("MAT_GLASS_WARM", (1.0, 0.88, 0.54, 0.35), roughness=0.09, transmission=0.82, ior=1.46),
        mirror=material("MAT_MIRROR", (0.82, 0.9, 0.98, 1.0), metallic=1.0, roughness=0.035),
        steel=material("MAT_STEEL", (0.47, 0.54, 0.61, 1.0), metallic=0.92, roughness=0.24),
        dark_metal=material("MAT_DARK_METAL", (0.10, 0.14, 0.18, 1.0), metallic=0.82, roughness=0.30),
        copper=material("MAT_COPPER", (0.72, 0.29, 0.10, 1.0), metallic=0.88, roughness=0.27),
        chrome=material("MAT_CHROME", (0.73, 0.79, 0.84, 1.0), metallic=1.0, roughness=0.12),
        rubber=material("MAT_RUBBER", (0.025, 0.035, 0.045, 1.0), roughness=0.86),
        white=material("MAT_PLASTIC_WHITE", (0.91, 0.94, 0.96, 1.0), roughness=0.40),
        navy=material("MAT_PLASTIC_NAVY", (0.035, 0.13, 0.24, 1.0), roughness=0.34),
        teal=material("MAT_PLASTIC_TEAL", (0.02, 0.51, 0.55, 1.0), roughness=0.34),
        blue=material("MAT_PLASTIC_BLUE", (0.08, 0.34, 0.78, 1.0), roughness=0.35),
        red=material("MAT_PLASTIC_RED", (0.88, 0.11, 0.14, 1.0), roughness=0.36),
        yellow=material("MAT_PLASTIC_YELLOW", (1.0, 0.66, 0.04, 1.0), roughness=0.38),
        green=material("MAT_PLASTIC_GREEN", (0.08, 0.64, 0.32, 1.0), roughness=0.37),
        wood=material("MAT_WOOD", (0.43, 0.18, 0.075, 1.0), roughness=0.62),
        markings=material("MAT_MARKINGS", (0.025, 0.12, 0.18, 1.0), roughness=0.40),
        glow=material(
            "MAT_BULB_GLOW",
            (1.0, 0.67, 0.16, 0.84),
            roughness=0.18,
            transmission=0.26,
            emission=(1.0, 0.28, 0.035, 1.0),
            emission_strength=1.8,
        ),
        proxy=material("MAT_COLLISION_PROXY", (1.0, 0.0, 1.0, 0.0), roughness=1.0),
    )


def root(name: str, asset_id: str, dimensions: tuple[float, float, float]) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.08
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj["asset_id"] = asset_id
    obj["asset_version"] = 1
    obj["unit_meters"] = 1.0
    obj["authoring_up_axis"] = "Z"
    obj["shipping_up_axis"] = "Y"
    obj["dimensions_m"] = shipping_dimensions(dimensions)
    obj["interaction_ready"] = True
    return obj


def finish_mesh(obj: bpy.types.Object, parent: bpy.types.Object, mat=None, *, bevel=0.0, smooth=False) -> bpy.types.Object:
    obj.parent = parent
    if mat is not None:
        obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("EDGE_SOFTEN", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.select_set(False)
    return obj


def cube(name, parent, location, scale, mat, *, bevel=0.03, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return finish_mesh(obj, parent, mat, bevel=bevel)


def cylinder(name, parent, location, radius, depth, mat, *, vertices=24, rotation=(0, 0, 0), bevel=0.015, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, parent, mat, bevel=bevel, smooth=smooth)


def cone(name, parent, location, radius1, radius2, depth, mat, *, vertices=28, rotation=(0, 0, 0), bevel=0.012):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, parent, mat, bevel=bevel, smooth=True)


def sphere(name, parent, location, radius, mat, *, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return finish_mesh(obj, parent, mat, smooth=True)


def torus(name, parent, location, major_radius, minor_radius, mat, *, rotation=(0, 0, 0), major_segments=24, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, parent, mat, smooth=True)


def open_cylinder(name, parent, location, radius, height, mat, *, vertices=32, thickness=0.018):
    verts = []
    faces = []
    z0 = location[2] - height / 2
    z1 = location[2] + height / 2
    for z in (z0, z1):
        for i in range(vertices):
            a = TAU * i / vertices
            verts.append((location[0] + radius * math.cos(a), location[1] + radius * math.sin(a), z))
    for i in range(vertices):
        j = (i + 1) % vertices
        faces.append((i, j, vertices + j, vertices + i))
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("GLASS_THICKNESS", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 0
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.select_set(False)
    return obj


def curve_tube(name, parent, points, radius, mat, *, cyclic=False):
    curve = bpy.data.curves.new(f"{name}_CURVE", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.select_set(False)
    return obj


def empty(name, parent, location, semantic, **props):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.06
    obj["semantic"] = semantic
    for key, value in props.items():
        obj[key] = value
    return obj


def proxy(name, parent, location, dimensions, shape="box", *, rotation=(0, 0, 0), mass=0.5):
    # Collision shapes ship as metadata-bearing nodes rather than renderable
    # geometry.  This keeps them available to Rapier while guaranteeing they
    # can never flash into view during transparent-material sorting.
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    obj.empty_display_type = "SPHERE" if shape in {"sphere", "capsule"} else "CIRCLE" if shape == "cylinder" else "CUBE"
    obj.empty_display_size = max(dimensions) / 2
    obj["is_collision_proxy"] = True
    obj["collider"] = shape
    obj["dimensions_m"] = shipping_dimensions(dimensions)
    obj["mass_kg"] = mass
    return obj


def smart_uv(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.025)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def spoon_handle(name: str, parent: bpy.types.Object, spoon_mat: bpy.types.Material) -> bpy.types.Object:
    sections = 20
    length = 1.46
    verts = []
    faces = []
    for index in range(sections + 1):
        t = index / sections
        z = t * length
        if z <= 0.15:
            width = max(0.008, 0.145 * math.sqrt(max(0.0, 1.0 - ((z - 0.15) / 0.15) ** 2)))
        else:
            blend = (z - 0.15) / (length - 0.15)
            blend = blend * blend * (3.0 - 2.0 * blend)
            width = 0.145 + (0.048 - 0.145) * blend
        # A real spoon handle meets the back of the bowl.  Move only the upper
        # neck rearward so it remains unioned but cannot protrude through the
        # visible concave face.
        neck_blend = max(0.0, min(1.0, (z / length - 0.78) / 0.22))
        neck_blend = neck_blend * neck_blend * (3.0 - 2.0 * neck_blend)
        center_y = 0.022 * neck_blend
        half_depth = 0.031 - 0.003 * neck_blend
        verts.extend([
            (-width, center_y - half_depth, z),
            (width, center_y - half_depth, z),
            (-width, center_y + half_depth, z),
            (width, center_y + half_depth, z),
        ])
    for index in range(sections):
        base = index * 4
        nxt = base + 4
        faces.extend([
            (base, base + 1, nxt + 1, nxt),
            (base + 3, base + 2, nxt + 2, nxt + 3),
            (base + 2, base, nxt, nxt + 2),
            (base + 1, base + 3, nxt + 3, nxt + 1),
        ])
    faces.extend([(0, 2, 3, 1), (sections * 4, sections * 4 + 1, sections * 4 + 3, sections * 4 + 2)])
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, parent, spoon_mat, bevel=0.014, smooth=True)
    smart_uv(obj)
    return obj


def spoon_bowl(name: str, parent: bpy.types.Object, spoon_mat: bpy.types.Material) -> bpy.types.Object:
    length_segments = 24
    width_segments = 14
    # Overlap the neck of the handle generously so the exact boolean below can
    # form a continuous, manufactured spoon body with no floating seam.
    start_z = 1.38
    length = 0.96
    half_width = 0.255
    depth = 0.105
    wall = 0.03
    verts = []
    faces = []

    def spread(t: float) -> float:
        return math.pow(max(0.0, math.sin(math.pi * t)), 0.57) * (0.88 + 0.12 * t) + 0.22 * math.pow(1.0 - t, 5)

    def add_surface(outer: bool) -> int:
        base = len(verts)
        for i in range(length_segments + 1):
            t = 0.006 + (0.992 * i / length_segments)
            outline = spread(t)
            hollow = math.pow(max(0.0, math.sin(math.pi * t)), 0.78)
            for j in range(width_segments + 1):
                s = -1.0 + 2.0 * j / width_segments
                across = math.pow(max(0.0, 1.0 - s * s), 0.8)
                y = -0.012 + depth * hollow * across
                if outer:
                    y += wall * (0.72 + 0.28 * across)
                verts.append((half_width * outline * s, y, start_z + t * length))
        for i in range(length_segments):
            for j in range(width_segments):
                a = base + i * (width_segments + 1) + j
                b = a + 1
                c = a + width_segments + 1
                d = c + 1
                if outer:
                    faces.extend([(a, c, b), (b, c, d)])
                else:
                    faces.extend([(a, b, c), (b, d, c)])
        return base

    inner = add_surface(False)
    outer = add_surface(True)
    stride = width_segments + 1
    outline = []
    for j in range(width_segments + 1):
        outline.append((0, j))
    for i in range(1, length_segments + 1):
        outline.append((i, width_segments))
    for j in range(width_segments - 1, -1, -1):
        outline.append((length_segments, j))
    for i in range(length_segments - 1, 0, -1):
        outline.append((i, 0))
    for index, (i, j) in enumerate(outline):
        ni, nj = outline[(index + 1) % len(outline)]
        a = inner + i * stride + j
        b = inner + ni * stride + nj
        c = outer + i * stride + j
        d = outer + ni * stride + nj
        faces.extend([(a, c, b), (b, c, d)])

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, parent, spoon_mat, smooth=True)
    smart_uv(obj)
    return obj


def spoon_body(name: str, parent: bpy.types.Object, spoon_mat: bpy.types.Material) -> bpy.types.Object:
    """Build one watertight loft from handle tip through the concave bowl.

    Unlike the older boolean construction, every cross-section shares vertices
    with the next one.  The handle therefore widens, thins and curves into the
    bowl without a front seam, side gap or intersecting connector.
    """
    handle_rows = 28
    bowl_rows = 36
    width_segments = 18
    neck_z = 1.405
    bowl_length = 0.965
    neck_width = 0.050
    rows: list[dict[str, float | str]] = []

    for index in range(handle_rows + 1):
        t = index / handle_rows
        z = neck_z * t
        if z <= 0.15:
            end_round = math.sin((z / 0.15) * math.pi / 2)
            width = 0.028 + (0.145 - 0.028) * end_round
        else:
            taper = (z - 0.15) / (neck_z - 0.15)
            taper = taper * taper * (3.0 - 2.0 * taper)
            width = 0.145 + (neck_width - 0.145) * taper
        rows.append({"region": "handle", "z": z, "width": width, "t": t})

    for index in range(1, bowl_rows + 1):
        t = index / bowl_rows
        spread = math.pow(max(0.0, math.sin(math.pi * t)), 0.68) * (0.90 + 0.10 * t)
        target_width = 0.255 * spread
        neck_blend = min(1.0, t / 0.24)
        neck_blend = neck_blend * neck_blend * (3.0 - 2.0 * neck_blend)
        width = max(0.007, neck_width + (target_width - neck_width) * neck_blend)
        rows.append({
            "region": "bowl",
            "z": neck_z + t * bowl_length,
            "width": width,
            "t": t,
        })

    stride = width_segments + 1
    verts: list[tuple[float, float, float]] = []

    def surface_y(row: dict[str, float | str], s: float, *, back: bool) -> float:
        across = math.pow(max(0.0, 1.0 - s * s), 0.82)
        if row["region"] == "handle":
            # A subtly crowned, solid handle that arrives at the neck with the
            # same front/back profile used by the first bowl section.
            return (0.030 - 0.004 * across) if back else (-0.030 + 0.004 * across)
        t = float(row["t"])
        onset = min(1.0, t / 0.18)
        onset = onset * onset * (3.0 - 2.0 * onset)
        hollow = math.pow(max(0.0, math.sin(math.pi * t)), 0.82)
        if back:
            return 0.030 - 0.015 * onset + 0.088 * hollow * across
        rim_y = -0.030 - 0.008 * onset
        return rim_y + 0.115 * hollow * across

    for back in (False, True):
        for row in rows:
            width = float(row["width"])
            z = float(row["z"])
            for segment in range(width_segments + 1):
                s = -1.0 + 2.0 * segment / width_segments
                verts.append((width * s, surface_y(row, s, back=back), z))

    faces: list[tuple[int, ...]] = []
    back_base = len(rows) * stride
    for row_index in range(len(rows) - 1):
        for segment in range(width_segments):
            a = row_index * stride + segment
            b = a + 1
            c = a + stride
            d = c + 1
            faces.extend([(a, b, c), (b, d, c)])
            ba, bb, bc, bd = back_base + a, back_base + b, back_base + c, back_base + d
            faces.extend([(ba, bc, bb), (bb, bc, bd)])

    for row_index in range(len(rows) - 1):
        front_left = row_index * stride
        next_front_left = front_left + stride
        back_left = back_base + front_left
        next_back_left = back_left + stride
        faces.append((front_left, next_front_left, next_back_left, back_left))
        front_right = row_index * stride + width_segments
        next_front_right = front_right + stride
        back_right = back_base + front_right
        next_back_right = back_right + stride
        faces.append((front_right, back_right, next_back_right, next_front_right))

    for segment in range(width_segments):
        front_bottom = segment
        back_bottom = back_base + segment
        faces.append((front_bottom, back_bottom, back_bottom + 1, front_bottom + 1))
        front_top = (len(rows) - 1) * stride + segment
        back_top = back_base + front_top
        faces.append((front_top, front_top + 1, back_top + 1, back_top))

    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, parent, spoon_mat, smooth=True)
    obj["continuous_topology"] = True
    obj["junction_type"] = "lofted_handle_to_bowl"
    smart_uv(obj)
    return obj


def make_spoon_asset(kind: str, mass: float) -> bpy.types.Object:
    suffix = kind.upper()
    spoon_mat = spoon_material(kind)
    r = root(f"ASSET_SPOON_{suffix}", f"spoon_{kind}", (0.56, 0.15, 2.37))
    r["material_kind"] = kind
    r["pbr_textures"] = ["baseColor", "roughness", "normal"]
    spoon_body(f"SPOON_{suffix}_BODY", r, spoon_mat)
    empty(f"PIVOT_SPOON_{suffix}_GRIP", r, (0, -0.045, 0.72), "grip", grip=True, handedness="either")
    empty(f"SOCKET_SPOON_{suffix}_BUTTER", r, (0, 0.055, 1.935), "butter_seat", radius=0.13)
    proxy(f"COL_SPOON_{suffix}", r, (0, 0.02, 1.185), (0.56, 0.15, 2.37), "box", mass=mass)
    return r


def make_spoon_wood():
    return make_spoon_asset("wood", 0.075)


def make_spoon_plastic():
    return make_spoon_asset("plastic", 0.045)


def make_spoon_copper():
    return make_spoon_asset("copper", 0.12)


def add_graduations(parent, radius, z_start, z_end, count, *, front_y=-0.01):
    for i in range(count + 1):
        z = z_start + (z_end - z_start) * i / count
        major = i % 5 == 0
        length = 0.16 if major else 0.09
        cube(
            f"MARK_GRAD_{i:02d}",
            parent,
            (radius - length / 2 + 0.012, front_y - radius, z),
            (length / 2, 0.008, 0.008 if major else 0.005),
            MAT["markings"],
            bevel=0.002,
        )


def make_beaker():
    r = root("ASSET_BEAKER", "beaker", (0.90, 0.90, 0.95))
    open_cylinder("BEAKER_GLASS_WALL", r, (0, 0, 0.49), 0.43, 0.86, MAT["glass"], thickness=0.022)
    cylinder("BEAKER_GLASS_BASE", r, (0, 0, 0.065), 0.42, 0.045, MAT["glass"], bevel=0.012)
    torus("BEAKER_ROLLED_RIM", r, (0, 0, 0.925), 0.43, 0.024, MAT["glass"])
    # A short, readable pouring lip.
    cone("BEAKER_SPOUT", r, (0, -0.43, 0.92), 0.105, 0.05, 0.15, MAT["glass"], vertices=16, rotation=(math.pi / 2, 0, 0), bevel=0.006)
    add_graduations(r, 0.43, 0.20, 0.79, 10, front_y=0.01)
    empty("PIVOT_BEAKER_GRIP", r, (0.34, -0.18, 0.58), "grip", grip=True, handedness="either")
    # Extras are authored in shipping glTF axes (Y-up), while object transforms
    # below remain Blender Z-up and are converted by export_yup.
    empty("SOCKET_BEAKER_POUR", r, (0, -0.50, 0.92), "pour_socket", direction=[0, 0, 1])
    proxy("COL_BEAKER_BODY", r, (0, 0, 0.48), (0.82, 0.82, 0.90), "cylinder", mass=0.34)


def make_graduated_cylinder():
    r = root("ASSET_GRADUATED_CYLINDER", "graduated_cylinder", (0.46, 0.46, 1.52))
    cylinder("CYLINDER_HEX_BASE", r, (0, 0, 0.055), 0.23, 0.075, MAT["teal"], vertices=6, bevel=0.018)
    open_cylinder("CYLINDER_GLASS_WALL", r, (0, 0, 0.77), 0.16, 1.37, MAT["glass"], thickness=0.014)
    cylinder("CYLINDER_GLASS_BOTTOM", r, (0, 0, 0.105), 0.155, 0.026, MAT["glass"], bevel=0.006)
    torus("CYLINDER_RIM", r, (0, 0, 1.455), 0.16, 0.017, MAT["glass"])
    add_graduations(r, 0.16, 0.22, 1.33, 20, front_y=0.005)
    empty("PIVOT_CYLINDER_GRIP", r, (0.12, -0.08, 0.92), "grip", grip=True)
    empty("SOCKET_CYLINDER_FILL", r, (0, 0, 1.46), "fill_socket", radius=0.14)
    proxy("COL_GRADUATED_CYLINDER", r, (0, 0, 0.77), (0.32, 0.32, 1.40), "cylinder", mass=0.25)


def make_reagent_bottle():
    r = root("ASSET_REAGENT_BOTTLE", "reagent_bottle", (0.72, 0.72, 1.18))
    cylinder("BOTTLE_BODY", r, (0, 0, 0.43), 0.33, 0.72, MAT["glass_warm"], vertices=28, bevel=0.055)
    cone("BOTTLE_SHOULDER", r, (0, 0, 0.83), 0.33, 0.16, 0.22, MAT["glass_warm"], bevel=0.025)
    cylinder("BOTTLE_NECK", r, (0, 0, 1.00), 0.16, 0.20, MAT["glass_warm"], bevel=0.018)
    cylinder("BOTTLE_CAP", r, (0, 0, 1.13), 0.19, 0.13, MAT["navy"], vertices=24, bevel=0.02)
    for i in range(12):
        a = TAU * i / 12
        cube(
            f"BOTTLE_CAP_GRIP_{i:02d}", r,
            (0.184 * math.cos(a), 0.184 * math.sin(a), 1.13),
            (0.012, 0.027, 0.052), MAT["rubber"], bevel=0.003, rotation=(0, 0, a),
        )
    cube("BOTTLE_LABEL", r, (0, -0.334, 0.47), (0.22, 0.008, 0.17), MAT["white"], bevel=0.025)
    cube("BOTTLE_LABEL_STRIPE", r, (0, -0.344, 0.52), (0.18, 0.006, 0.035), MAT["red"], bevel=0.006)
    empty("PIVOT_BOTTLE_GRIP", r, (0.25, -0.10, 0.62), "grip", grip=True)
    empty("PIVOT_BOTTLE_CAP", r, (0, 0, 1.13), "twist_pivot", axis=[0, 1, 0])
    empty("SOCKET_BOTTLE_POUR", r, (0, 0, 1.10), "pour_socket", direction=[0, 1, 0])
    proxy("COL_REAGENT_BOTTLE", r, (0, 0, 0.59), (0.64, 0.64, 1.16), "cylinder", mass=0.62)


def make_goggles():
    r = root("ASSET_GOGGLES", "safety_goggles", (1.18, 0.32, 0.54))
    for side, x in (("L", -0.31), ("R", 0.31)):
        torus(f"GOGGLE_FRAME_{side}", r, (x, 0, 0.32), 0.25, 0.035, MAT["teal"], rotation=(math.pi / 2, 0, 0), major_segments=28)
        sphere(f"GOGGLE_LENS_{side}", r, (x, -0.01, 0.32), 0.23, MAT["glass_blue"], scale=(1.0, 0.10, 0.72))
    curve_tube("GOGGLE_NOSE_BRIDGE", r, [(-0.08, 0, 0.36), (0, -0.025, 0.30), (0.08, 0, 0.36)], 0.035, MAT["teal"])
    curve_tube("GOGGLE_STRAP", r, [(-0.55, 0, 0.33), (-0.66, 0.17, 0.36), (0, 0.28, 0.37), (0.66, 0.17, 0.36), (0.55, 0, 0.33)], 0.028, MAT["rubber"])
    empty("PIVOT_GOGGLES_GRIP", r, (0, -0.02, 0.33), "grip", grip=True)
    proxy("COL_GOGGLES", r, (0, 0.02, 0.32), (1.14, 0.28, 0.48), "box", mass=0.12)


def make_tuning_fork():
    r = root("ASSET_TUNING_FORK", "tuning_fork", (0.50, 0.18, 1.36))
    cylinder("FORK_HANDLE", r, (0, 0, 0.31), 0.075, 0.58, MAT["chrome"], vertices=20, bevel=0.016)
    # Continuous U-profile: the curved yoke and parallel tines are one piece,
    # matching a struck aluminium tuning fork rather than a decorative ring.
    curve_tube(
        "FORK_U_PROFILE",
        r,
        [
            (-0.19, 0, 1.33), (-0.19, 0, 0.76), (-0.17, 0, 0.67),
            (-0.11, 0, 0.60), (0, 0, 0.57), (0.11, 0, 0.60),
            (0.17, 0, 0.67), (0.19, 0, 0.76), (0.19, 0, 1.33),
        ],
        0.055,
        MAT["chrome"],
    )
    empty("PIVOT_FORK_GRIP", r, (0, 0, 0.24), "grip", grip=True)
    empty("SOCKET_FORK_STRIKE_L", r, (-0.19, -0.08, 1.08), "strike_socket", strike=True)
    empty("SOCKET_FORK_STRIKE_R", r, (0.19, -0.08, 1.08), "strike_socket", strike=True)
    proxy("COL_TUNING_FORK", r, (0, 0, 0.68), (0.48, 0.16, 1.30), "box", mass=0.48)


def make_mallet():
    r = root("ASSET_MALLET", "rubber_mallet", (1.04, 0.30, 0.30))
    cylinder("MALLET_HANDLE", r, (-0.12, 0, 0.15), 0.055, 0.70, MAT["wood"], rotation=(0, math.pi / 2, 0), vertices=20, bevel=0.016)
    cylinder("MALLET_HEAD", r, (0.38, 0, 0.15), 0.145, 0.34, MAT["rubber"], rotation=(0, math.pi / 2, 0), vertices=24, bevel=0.04)
    cylinder("MALLET_HEAD_RING", r, (0.38, 0, 0.15), 0.153, 0.06, MAT["yellow"], rotation=(0, math.pi / 2, 0), vertices=24, bevel=0.012)
    empty("PIVOT_MALLET_GRIP", r, (-0.28, 0, 0.15), "grip", grip=True)
    empty("SOCKET_MALLET_FACE", r, (0.56, 0, 0.15), "impact_face", direction=[1, 0, 0])
    proxy("COL_MALLET_HANDLE", r, (-0.12, 0, 0.15), (0.70, 0.11, 0.11), "box", mass=0.10)
    proxy("COL_MALLET_HEAD", r, (0.38, 0, 0.15), (0.34, 0.29, 0.29), "cylinder", rotation=(0, math.pi / 2, 0), mass=0.22)


def make_battery():
    r = root("ASSET_BATTERY", "battery_cell", (0.78, 0.40, 0.82))
    cube("BATTERY_CASE", r, (0, 0, 0.37), (0.36, 0.18, 0.34), MAT["navy"], bevel=0.065)
    cube("BATTERY_LABEL_PANEL", r, (0, -0.185, 0.39), (0.25, 0.008, 0.18), MAT["yellow"], bevel=0.025)
    cube("BATTERY_LABEL_BAR", r, (0, -0.196, 0.40), (0.17, 0.005, 0.035), MAT["red"], bevel=0.005)
    cylinder("BATTERY_TERMINAL_POS", r, (-0.19, 0, 0.76), 0.075, 0.12, MAT["copper"], bevel=0.012)
    cylinder("BATTERY_TERMINAL_NEG", r, (0.19, 0, 0.76), 0.075, 0.12, MAT["dark_metal"], bevel=0.012)
    empty("SOCKET_BATTERY_POSITIVE", r, (-0.19, 0, 0.84), "electrical_positive", polarity="positive")
    empty("SOCKET_BATTERY_NEGATIVE", r, (0.19, 0, 0.84), "electrical_negative", polarity="negative")
    empty("PIVOT_BATTERY_GRIP", r, (0, -0.18, 0.42), "grip", grip=True)
    proxy("COL_BATTERY", r, (0, 0, 0.40), (0.76, 0.38, 0.80), "box", mass=0.72)


def make_switch():
    r = root("ASSET_SWITCH", "knife_switch", (0.92, 0.46, 0.48))
    cube("SWITCH_BASE", r, (0, 0, 0.08), (0.44, 0.21, 0.07), MAT["white"], bevel=0.045)
    for side, x in (("L", -0.27), ("R", 0.27)):
        cylinder(f"SWITCH_POST_{side}", r, (x, 0, 0.22), 0.065, 0.25, MAT["copper"], bevel=0.012)
        empty(f"SOCKET_SWITCH_{side}", r, (x, 0, 0.36), "electrical_terminal", terminal=side.lower())
    lever = cube("SWITCH_LEVER", r, (-0.02, 0, 0.33), (0.32, 0.04, 0.035), MAT["chrome"], bevel=0.025, rotation=(0, -0.42, 0))
    lever["movable"] = True
    cylinder("SWITCH_HANDLE", r, (0.27, 0, 0.47), 0.075, 0.13, MAT["red"], rotation=(math.pi / 2, 0, 0), bevel=0.018)
    empty("PIVOT_SWITCH_LEVER", r, (-0.27, 0, 0.34), "hinge", axis=[0, 1, 0], min_angle=-0.05, max_angle=0.48)
    proxy("COL_SWITCH_BASE", r, (0, 0, 0.08), (0.88, 0.42, 0.14), "box", mass=0.42)


def make_bulb():
    r = root("ASSET_BULB", "lamp_bulb", (0.52, 0.52, 0.88))
    cylinder("BULB_SOCKET", r, (0, 0, 0.17), 0.18, 0.30, MAT["dark_metal"], vertices=24, bevel=0.025)
    for i in range(4):
        torus(f"BULB_THREAD_{i}", r, (0, 0, 0.06 + i * 0.07), 0.18, 0.012, MAT["chrome"])
    sphere("BULB_GLASS", r, (0, 0, 0.55), 0.28, MAT["glow"], scale=(0.92, 0.92, 1.10))
    curve_tube("BULB_FILAMENT", r, [(-0.085, 0, 0.43), (-0.04, 0, 0.55), (0.0, 0, 0.49), (0.04, 0, 0.55), (0.085, 0, 0.43)], 0.012, MAT["copper"])
    empty("SOCKET_BULB_POSITIVE", r, (0, 0, 0.005), "electrical_positive", polarity="positive")
    empty("SOCKET_BULB_NEGATIVE", r, (0.18, 0, 0.17), "electrical_negative", polarity="negative")
    empty("PIVOT_BULB_GRIP", r, (0, -0.18, 0.20), "grip", grip=True)
    proxy("COL_BULB", r, (0, 0, 0.44), (0.50, 0.50, 0.86), "capsule", mass=0.09)


def make_vacuum_pump():
    r = root("ASSET_VACUUM_PUMP", "vacuum_pump", (1.18, 0.66, 0.88))
    cube("PUMP_BODY", r, (0, 0, 0.36), (0.50, 0.28, 0.30), MAT["teal"], bevel=0.10)
    cube("PUMP_MOTOR_PANEL", r, (-0.35, -0.285, 0.38), (0.11, 0.012, 0.20), MAT["navy"], bevel=0.025)
    cube("PUMP_HANDLE_TOP", r, (0, 0, 0.78), (0.26, 0.055, 0.055), MAT["rubber"], bevel=0.035)
    cylinder("PUMP_HANDLE_L", r, (-0.26, 0, 0.63), 0.045, 0.30, MAT["dark_metal"], bevel=0.012)
    cylinder("PUMP_HANDLE_R", r, (0.26, 0, 0.63), 0.045, 0.30, MAT["dark_metal"], bevel=0.012)
    cylinder("PUMP_HOSE_PORT", r, (0.53, 0, 0.43), 0.09, 0.18, MAT["copper"], rotation=(0, math.pi / 2, 0), bevel=0.018)
    cylinder("PUMP_POWER_KNOB", r, (-0.16, -0.32, 0.43), 0.085, 0.08, MAT["red"], rotation=(math.pi / 2, 0, 0), bevel=0.018)
    empty("SOCKET_PUMP_HOSE", r, (0.63, 0, 0.43), "vacuum_hose", diameter=0.12)
    empty("PIVOT_PUMP_KNOB", r, (-0.16, -0.37, 0.43), "rotary_control", min_value=0.0, max_value=1.0)
    empty("PIVOT_PUMP_GRIP", r, (0, 0, 0.78), "grip", grip=True)
    proxy("COL_VACUUM_PUMP", r, (0, 0, 0.43), (1.14, 0.62, 0.84), "box", mass=4.8)


def make_bell_jar():
    r = root("ASSET_BELL_JAR", "bell_jar", (1.18, 1.18, 1.52))
    cylinder("BELL_JAR_BASE", r, (0, 0, 0.10), 0.58, 0.17, MAT["navy"], vertices=32, bevel=0.055)
    torus("BELL_JAR_GASKET", r, (0, 0, 0.20), 0.48, 0.045, MAT["rubber"], major_segments=32)
    open_cylinder("BELL_JAR_GLASS_WALL", r, (0, 0, 0.79), 0.49, 1.16, MAT["glass"], thickness=0.025)
    sphere("BELL_JAR_DOME", r, (0, 0, 1.31), 0.50, MAT["glass"], scale=(1.0, 1.0, 0.48))
    cylinder("BELL_JAR_KNOB_STEM", r, (0, 0, 1.48), 0.055, 0.16, MAT["chrome"], bevel=0.012)
    sphere("BELL_JAR_KNOB", r, (0, 0, 1.57), 0.11, MAT["teal"], scale=(1, 1, 0.75))
    cylinder("BELL_JAR_HOSE_PORT", r, (0.48, 0, 0.14), 0.07, 0.20, MAT["copper"], rotation=(0, math.pi / 2, 0), bevel=0.012)
    empty("SOCKET_BELL_JAR_HOSE", r, (0.60, 0, 0.14), "vacuum_hose", diameter=0.12)
    empty("PIVOT_BELL_JAR_GRIP", r, (0, 0, 1.58), "grip", grip=True)
    empty("SOCKET_BELL_JAR_INTERIOR", r, (0, 0, 0.60), "chamber_interior", radius=0.40)
    proxy("COL_BELL_JAR", r, (0, 0, 0.80), (1.06, 1.06, 1.48), "cylinder", mass=1.75)


def make_cart():
    r = root("ASSET_CART", "dynamics_cart", (1.10, 0.72, 0.52))
    cube("CART_CHASSIS", r, (0, 0, 0.31), (0.48, 0.27, 0.11), MAT["yellow"], bevel=0.075)
    cube("CART_TOP_PAD", r, (0, 0, 0.44), (0.30, 0.21, 0.035), MAT["rubber"], bevel=0.025)
    for side, y in (("F", -0.31), ("B", 0.31)):
        for lr, x in (("L", -0.31), ("R", 0.31)):
            cylinder(f"CART_WHEEL_{side}_{lr}", r, (x, y, 0.20), 0.13, 0.075, MAT["rubber"], rotation=(math.pi / 2, 0, 0), bevel=0.02)
            cylinder(f"CART_HUB_{side}_{lr}", r, (x, y, 0.20), 0.05, 0.085, MAT["chrome"], rotation=(math.pi / 2, 0, 0), bevel=0.008)
    cube("CART_BUMPER_FRONT", r, (0.53, 0, 0.30), (0.05, 0.24, 0.08), MAT["red"], bevel=0.03)
    empty("SOCKET_CART_FORCE", r, (-0.54, 0, 0.34), "force_attachment", axis=[1, 0, 0])
    empty("PIVOT_CART_GRIP", r, (0, 0, 0.46), "grip", grip=True)
    proxy("COL_CART_CHASSIS", r, (0, 0, 0.33), (1.04, 0.66, 0.36), "box", mass=0.65)


def make_spring_scale():
    r = root("ASSET_SPRING_SCALE", "spring_scale", (0.38, 0.28, 1.46))
    cylinder("SCALE_BODY", r, (0, 0, 0.80), 0.17, 1.02, MAT["glass_blue"], vertices=28, bevel=0.025)
    cylinder("SCALE_TOP_CAP", r, (0, 0, 1.33), 0.18, 0.12, MAT["teal"], bevel=0.022)
    cylinder("SCALE_BOTTOM_CAP", r, (0, 0, 0.27), 0.18, 0.12, MAT["teal"], bevel=0.022)
    spring_points = []
    turns = 11
    samples = 88
    for i in range(samples):
        t = i / (samples - 1)
        a = TAU * turns * t
        spring_points.append((0.07 * math.cos(a), 0.07 * math.sin(a), 1.26 - 0.75 * t))
    curve_tube("SCALE_SPRING", r, spring_points, 0.014, MAT["steel"])
    cube("SCALE_POINTER", r, (0, -0.176, 0.77), (0.11, 0.012, 0.025), MAT["red"], bevel=0.006)
    for i in range(11):
        z = 0.43 + i * 0.075
        cube(f"SCALE_TICK_{i:02d}", r, (0.10 if i % 5 else 0.07, -0.18, z), (0.055 if i % 5 else 0.085, 0.008, 0.006), MAT["markings"], bevel=0.002)
    curve_tube("SCALE_TOP_LOOP", r, [(0, 0, 1.38), (0.13, 0, 1.47), (0, 0, 1.56), (-0.13, 0, 1.47)], 0.025, MAT["steel"], cyclic=True)
    curve_tube("SCALE_HOOK", r, [(0, 0, 0.21), (0, 0, 0.08), (0.11, 0, 0.01), (0.16, 0, 0.11)], 0.026, MAT["steel"])
    empty("PIVOT_SPRING_SCALE_GRIP", r, (0, 0, 1.49), "grip", grip=True)
    empty("SOCKET_SPRING_SCALE_HOOK", r, (0.15, 0, 0.10), "force_hook", max_newtons=10.0)
    empty("PIVOT_SPRING_SCALE_POINTER", r, (0, -0.19, 0.77), "linear_indicator", axis=[0, 0, 1])
    proxy("COL_SPRING_SCALE", r, (0, 0, 0.78), (0.36, 0.26, 1.42), "capsule", mass=0.24)


def make_funnel_clamp_stand():
    r = root("ASSET_FUNNEL_CLAMP_STAND", "funnel_clamp_stand", (1.38, 0.80, 1.76))
    cube("STAND_BASE", r, (-0.32, 0, 0.065), (0.42, 0.34, 0.06), MAT["dark_metal"], bevel=0.055)
    cylinder("STAND_ROD", r, (-0.56, 0, 0.89), 0.035, 1.62, MAT["chrome"], bevel=0.008)
    cube("CLAMP_BOSS", r, (-0.43, 0, 1.15), (0.12, 0.09, 0.09), MAT["teal"], bevel=0.035)
    cylinder("CLAMP_ARM", r, (-0.05, 0, 1.15), 0.028, 0.62, MAT["chrome"], rotation=(0, math.pi / 2, 0), bevel=0.006)
    torus("CLAMP_RING", r, (0.29, 0, 1.15), 0.25, 0.028, MAT["chrome"], rotation=(math.pi / 2, 0, 0), major_segments=28)
    cone("FUNNEL_BOWL", r, (0.29, 0, 1.16), 0.28, 0.055, 0.48, MAT["glass_blue"], bevel=0.012)
    cylinder("FUNNEL_STEM", r, (0.29, 0, 0.79), 0.045, 0.38, MAT["glass_blue"], bevel=0.008)
    cylinder("CLAMP_KNOB", r, (-0.43, -0.14, 1.15), 0.065, 0.13, MAT["red"], rotation=(math.pi / 2, 0, 0), bevel=0.015)
    empty("PIVOT_CLAMP_HEIGHT", r, (-0.56, 0, 1.15), "linear_adjustment", axis=[0, 0, 1], min_value=0.65, max_value=1.55)
    empty("PIVOT_FUNNEL_GRIP", r, (0.29, -0.20, 1.24), "grip", grip=True)
    empty("SOCKET_FUNNEL_INLET", r, (0.29, 0, 1.43), "fill_socket", radius=0.22)
    empty("SOCKET_FUNNEL_OUTLET", r, (0.29, 0, 0.59), "flow_outlet", diameter=0.07)
    proxy("COL_STAND_BASE", r, (-0.32, 0, 0.065), (0.84, 0.68, 0.12), "box", mass=2.4)
    proxy("COL_FUNNEL", r, (0.29, 0, 1.06), (0.58, 0.58, 0.92), "cylinder", mass=0.20)


def make_mirror():
    r = root("ASSET_MIRROR", "optical_mirror", (0.96, 0.54, 1.10))
    cube("MIRROR_BASE", r, (0, 0.05, 0.06), (0.34, 0.24, 0.055), MAT["navy"], bevel=0.055)
    cylinder("MIRROR_STEM", r, (0, 0.08, 0.43), 0.035, 0.68, MAT["chrome"], bevel=0.008)
    cube("MIRROR_FRAME", r, (0, 0, 0.73), (0.45, 0.055, 0.32), MAT["teal"], bevel=0.055, rotation=(0.0, 0.0, 0.0))
    cube("MIRROR_SURFACE", r, (0, -0.061, 0.73), (0.39, 0.008, 0.26), MAT["mirror"], bevel=0.025)
    cylinder("MIRROR_SIDE_PIVOT_L", r, (-0.47, 0, 0.73), 0.055, 0.12, MAT["chrome"], rotation=(math.pi / 2, 0, 0), bevel=0.012)
    cylinder("MIRROR_SIDE_PIVOT_R", r, (0.47, 0, 0.73), 0.055, 0.12, MAT["chrome"], rotation=(math.pi / 2, 0, 0), bevel=0.012)
    empty("PIVOT_MIRROR_TILT", r, (0, 0, 0.73), "hinge", axis=[1, 0, 0], min_angle=-0.85, max_angle=0.85)
    empty("PIVOT_MIRROR_GRIP", r, (0.34, -0.08, 0.73), "grip", grip=True)
    empty("SOCKET_MIRROR_OPTICAL_CENTER", r, (0, -0.08, 0.73), "optical_surface", normal=[0, -1, 0])
    proxy("COL_MIRROR", r, (0, 0.0, 0.59), (0.94, 0.50, 1.04), "box", mass=0.82)


def triangular_prism(name, parent, length, height, depth, mat):
    x0 = -length / 2
    x1 = length / 2
    z0 = 0.05
    z1 = z0 + height
    ym = depth / 2
    verts = [
        (x0, -ym, z0), (x1, -ym, z0), (0, -ym, z1),
        (x0, ym, z0), (x1, ym, z0), (0, ym, z1),
    ]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, parent, mat, bevel=0.018)


def make_prism():
    r = root("ASSET_PRISM", "triangular_prism", (0.82, 0.48, 0.72))
    triangular_prism("PRISM_GLASS", r, 0.78, 0.68, 0.44, MAT["glass_blue"])
    # Discrete edge caps keep the silhouette legible against a bright bench.
    curve_tube("PRISM_EDGE_FRONT", r, [(-0.39, -0.225, 0.05), (0.39, -0.225, 0.05), (0, -0.225, 0.73), (-0.39, -0.225, 0.05)], 0.012, MAT["chrome"])
    curve_tube("PRISM_EDGE_BACK", r, [(-0.39, 0.225, 0.05), (0.39, 0.225, 0.05), (0, 0.225, 0.73), (-0.39, 0.225, 0.05)], 0.012, MAT["chrome"])
    empty("PIVOT_PRISM_GRIP", r, (0, -0.23, 0.30), "grip", grip=True)
    empty("SOCKET_PRISM_OPTICAL_CENTER", r, (0, -0.25, 0.30), "optical_volume", refractive_index=1.52)
    proxy("COL_PRISM", r, (0, 0, 0.38), (0.80, 0.46, 0.70), "box", mass=0.48)


BUILDERS = [
    make_beaker,
    make_graduated_cylinder,
    make_reagent_bottle,
    make_spoon_wood,
    make_spoon_plastic,
    make_spoon_copper,
    make_goggles,
    make_tuning_fork,
    make_mallet,
    make_battery,
    make_switch,
    make_bulb,
    make_vacuum_pump,
    make_bell_jar,
    make_cart,
    make_spring_scale,
    make_funnel_clamp_stand,
    make_mirror,
    make_prism,
]

if REQUESTED_ASSETS:
    BUILDERS = [
        builder for builder in BUILDERS
        if builder.__name__.removeprefix("make_") in REQUESTED_ASSETS
    ]
    missing = REQUESTED_ASSETS - {
        builder.__name__.removeprefix("make_") for builder in BUILDERS
    }
    if missing:
        raise RuntimeError(f"Unknown requested assets: {sorted(missing)}")


def validate_authored_scene() -> list[str]:
    roots = sorted(obj.name for obj in bpy.context.scene.objects if obj.name.startswith("ASSET_"))
    expected = sorted(builder.__name__.removeprefix("make_").upper() for builder in BUILDERS)
    if len(roots) != len(BUILDERS):
        raise RuntimeError(f"Expected {len(BUILDERS)} asset roots, found {len(roots)}: {roots}")
    for root_name in roots:
        obj = bpy.data.objects[root_name]
        if obj.parent is not None:
            raise RuntimeError(f"{root_name} must be a top-level node")
        if obj.location.length > 1e-7 or any(abs(v - 1) > 1e-7 for v in obj.scale):
            raise RuntimeError(f"{root_name} must have an identity transform")
        descendants = [child for child in obj.children_recursive]
        if not any(child.name.startswith("COL_") for child in descendants):
            raise RuntimeError(f"{root_name} has no collision proxy")
        if not any(child.name.startswith("PIVOT_") or child.name.startswith("SOCKET_") for child in descendants):
            raise RuntimeError(f"{root_name} has no interaction marker")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            if any(abs(v - 1.0) > 1e-6 for v in obj.scale) or any(abs(v) > 1e-6 for v in obj.rotation_euler):
                raise RuntimeError(f"Unapplied mesh rotation/scale: {obj.name}")
    return roots


def export_glb() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.context.scene["kit_name"] = "BuiO Primary Science Laboratory Kit"
    bpy.context.scene["kit_version"] = 1
    bpy.context.scene["coordinate_system"] = "glTF Y-up, metres"
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def validate_export(expected_roots: list[str]) -> dict:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=OUT)
    imported_names = {obj.name for obj in bpy.context.scene.objects}
    missing = [name for name in expected_roots if name not in imported_names]
    if missing:
        raise RuntimeError(f"Export validation failed; missing roots: {missing}")
    markers = sorted(name for name in imported_names if name.startswith(("PIVOT_", "SOCKET_", "COL_")))
    if not any(name.startswith("PIVOT_") for name in markers):
        raise RuntimeError("Export contains no pivot markers")
    if not any(name.startswith("SOCKET_") for name in markers):
        raise RuntimeError("Export contains no socket markers")
    if not any(name.startswith("COL_") for name in markers):
        raise RuntimeError("Export contains no collision proxies")
    return {
        "output": OUT,
        "bytes": os.path.getsize(OUT),
        "assets": expected_roots,
        "marker_count": len(markers),
        "mesh_count": sum(1 for obj in bpy.context.scene.objects if obj.type == "MESH"),
        "material_count": len(bpy.data.materials),
    }


def main() -> None:
    clear_scene()
    build_materials()
    for builder in BUILDERS:
        builder()
    roots = validate_authored_scene()
    export_glb()
    report = validate_export(roots)
    print("SCIENCE_LAB_KIT_REPORT=" + json.dumps(report, ensure_ascii=True, sort_keys=True))


if __name__ == "__main__":
    main()
