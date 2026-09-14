# Renders whatever is in the scene from a few fixed angles, so the model can be
# judged by eye rather than by bounding boxes.
import bpy
import math
from mathutils import Vector

OUT = r"C:\Users\kochu\Documents\BuiO\tmp\bl-shots"

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
if not meshes:
    print("no meshes")
else:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, world.x), min(lo.y, world.y), min(lo.z, world.z)))
            hi = Vector((max(hi.x, world.x), max(hi.y, world.y), max(hi.z, world.z)))
    centre = (lo + hi) / 2.0
    span = max(hi.x - lo.x, hi.z - lo.z, 0.4)

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new('World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.06, 0.08, 0.10, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 1.1

    # A key light and a fill, so form reads instead of flat silhouette.
    for name, location, energy in (("key", (3.2, -4.2, 4.4), 900), ("fill", (-3.6, -2.6, 1.6), 380)):
        existing = bpy.data.objects.get(name)
        if existing:
            bpy.data.objects.remove(existing, do_unlink=True)
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = energy
        light_data.size = 5.0
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        light.rotation_euler = (math.radians(58), 0, math.radians(38 if name == "key" else -50))
        scene.collection.objects.link(light)

    cam = bpy.data.objects.get('previewCam')
    if not cam:
        cam_data = bpy.data.cameras.new('previewCam')
        cam = bpy.data.objects.new('previewCam', cam_data)
        scene.collection.objects.link(cam)
    cam.data.lens = 60
    scene.camera = cam

    distance = span * 3.1
    views = {
        "front": (0, -1, 0.16),
        "three-quarter": (-0.72, -0.78, 0.3),
        "side": (-1, -0.06, 0.12),
    }
    for name, direction in views.items():
        offset = Vector(direction).normalized() * distance
        cam.location = centre + offset
        forward = (centre - cam.location).normalized()
        cam.rotation_euler = forward.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = OUT + "\\" + name + ".png"
        bpy.ops.render.render(write_still=True)

    print("rendered", ", ".join(views), "| centre %.2f %.2f %.2f span %.2f" % (centre.x, centre.y, centre.z, span))
