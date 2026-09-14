# Colours the anatomy the way an atlas plate does, adds vessel markings to the
# lung surface, and exports the glb the station loads.
#
# Each part is given its material BEFORE the parts are joined, so a joined mesh
# keeps several material slots and exports as several primitives. That is how
# the rib cage can be tan bone with white costal cartilage in one object.
import bpy
import math
import random

OUT = r"C:\Users\kochu\Documents\BuiO\science-lab-app\public\models\respiratory.glb"

def srgb(hex_colour, roughness):
    """Blender material values are linear; picking numbers that look right as
    sRGB is what made every part render about 15% too pale."""
    def channel(value):
        v = value / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r = channel((hex_colour >> 16) & 255)
    g = channel((hex_colour >> 8) & 255)
    b = channel(hex_colour & 255)
    return ((r, g, b, 1.0), roughness)


PALETTE = {
    'bone':      srgb(0xD9C89A, 0.52),
    'cartilage': srgb(0xE4E7E6, 0.40),
    'lung':      srgb(0xC96070, 0.56),
    'airway':    srgb(0xE3A9AC, 0.44),
    'muscle':    srgb(0xB3564A, 0.58),
}

# prefix -> material, and which export group it joins
ASSIGN = [
    ('lung_',          'lung',      'lungs'),
    ('rib_',           'bone',      'ribcage'),
    ('costal_',        'cartilage', 'ribcage'),
    ('sternum_',       'bone',      'ribcage'),
    ('vertebra_',      'bone',      'spine'),
    ('spinous_',       'bone',      'spine'),
    ('trachea',        'airway',    'airway'),
    ('larynx',         'airway',    'airway'),
    ('tracheal_ring_', 'cartilage', 'airway'),
    ('bronchus_',      'airway',    'airway'),
    ('diaphragm',      'muscle',    'diaphragm'),
]


def material(name):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    colour, roughness = PALETTE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = colour
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    if name == 'lung':
        # Vertex colours carry the vessel markings. The exporter then writes no
        # base colour factor, so glTF multiplies COLOR_0 by white, which is what
        # we want.
        attribute = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'vessels'
        mat.node_tree.links.new(attribute.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


def paint_vessels(obj):
    """Fine branching marks over the lung surface, painted into vertex colours.

    A flat organ colour is most of what makes a model look moulded; the surface
    of a lung is covered in fine vessels and lobular markings.
    """
    mesh = obj.data
    layer = mesh.color_attributes.get('vessels')
    if layer is None:
        layer = mesh.color_attributes.new(name='vessels', type='FLOAT_COLOR', domain='POINT')
    base = srgb(0xCF6B78, 0)[0][:3]
    deep = srgb(0x8E3444, 0)[0][:3]
    for index, vert in enumerate(mesh.vertices):
        x, y, z = vert.co
        # Three octaves of cheap trig noise reads as branching at this scale.
        vein = (math.sin(x * 34.0 + math.sin(z * 21.0) * 2.0)
                * math.sin(z * 27.0 + math.sin(y * 18.0) * 2.0))
        fine = math.sin(x * 78.0) * math.sin(y * 66.0) * math.sin(z * 71.0)
        mark = max(0.0, vein) ** 3.0 * 0.85 + max(0.0, fine) ** 4.0 * 0.4
        mark = min(mark, 1.0)
        colour = tuple(base[i] + (deep[i] - base[i]) * mark for i in range(3))
        layer.data[index].color = (colour[0], colour[1], colour[2], 1.0)


groups = {}
for obj in list(bpy.data.objects):
    if obj.type != 'MESH':
        continue
    for prefix, material_name, group in ASSIGN:
        if obj.name.startswith(prefix):
            obj.data.materials.clear()
            obj.data.materials.append(material(material_name))
            if material_name == 'lung':
                paint_vessels(obj)
            groups.setdefault(group, []).append(obj)
            break

made = []
for group, members in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = members[0]
    if len(members) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = group
    joined.data.name = group
    made.append(joined)
    bpy.ops.object.select_all(action='DESELECT')

for obj in list(bpy.data.objects):
    if obj not in made:
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=False,
    export_vertex_color='ACTIVE',
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)

for obj in made:
    slots = [s.material.name if s.material else '-' for s in obj.material_slots]
    print('%-10s faces=%5d  materials=%s' % (obj.name, len(obj.data.polygons), ','.join(slots)))
print('exported', OUT)
