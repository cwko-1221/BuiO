# Colours the anatomy the way an atlas plate does, adds vessel markings to the
# lung surface, and exports the glb the station loads.
#
# Each part is given its material BEFORE the parts are joined, so a joined mesh
# keeps several material slots and exports as several primitives. That is how
# the rib cage can be tan bone with white costal cartilage in one object.
import bpy
import math
import os
import random

OUT = r"C:\Users\kochu\Documents\BuiO\science-lab-app\public\models\respiratory.glb"
TEXTURE_DIR = r"C:\Users\kochu\Documents\BuiO\science-lab-app\art-source\respiratory\generated-textures"
os.makedirs(TEXTURE_DIR, exist_ok=True)

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
    'tendon':    srgb(0xD7C8B6, 0.48),
    'artery':    srgb(0x4779A8, 0.42),
    'vein':      srgb(0xB64351, 0.42),
}

# prefix -> material, and which export group it joins
ASSIGN = [
    ('lung_',          'lung',      'lungs'),
    ('rib_',           'bone',      'ribcage'),
    ('costal_',        'cartilage', 'ribcage'),
    ('sternum',        'bone',      'ribcage'),
    ('vertebra_',      'bone',      'spine'),
    ('spinous_',       'bone',      'spine'),
    ('tracheal_ring_', 'cartilage', 'airway'),
    ('trachea',        'airway',    'airway'),
    ('larynx',         'airway',    'airway'),
    ('bronchus_',      'airway',    'airway'),
    ('pulmonary_artery_', 'artery',  'airway'),
    ('pulmonary_vein_',   'vein',    'airway'),
    ('diaphragm',      'muscle',    'diaphragm'),
    ('central_tendon',  'tendon',    'diaphragm'),
]


TEXTURE_BASE = {
    'bone': 0xD9C89A, 'cartilage': 0xE4E7E6, 'lung': 0xC96070,
    'airway': 0xE3A9AC, 'muscle': 0xB3564A, 'tendon': 0xD7C8B6,
    'artery': 0x4779A8, 'vein': 0xB64351,
}


def linear_channel(value):
    v = value / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def tissue_texture(name, size=128):
    """Create a small, deterministic anatomical albedo texture.

    The image is saved beside the source scripts and embedded into the GLB.
    It is subtle at classroom distance but breaks the toy-like single-colour
    surfaces when the learner zooms in.
    """
    image_name = 'respiratory_%s_albedo' % name
    image = bpy.data.images.get(image_name)
    if image is None:
        image = bpy.data.images.new(image_name, width=size, height=size, alpha=False)
    base_hex = TEXTURE_BASE[name]
    base = [linear_channel((base_hex >> shift) & 255) for shift in (16, 8, 0)]
    rng = random.Random(9173 + sum(ord(c) for c in name))
    pixels = [0.0] * (size * size * 4)
    phase = rng.random() * math.tau
    for y in range(size):
        v = y / max(1, size - 1)
        for x in range(size):
            u = x / max(1, size - 1)
            grain = (math.sin((u * 31.0 + math.sin(v * 17.0)) * math.tau + phase)
                     * math.sin((v * 23.0 + math.sin(u * 13.0)) * math.tau))
            fine = math.sin((u * 91.0 + v * 47.0) * math.tau + phase) * 0.5
            if name == 'lung':
                # Fine pleural vessels over a moist pink parenchymal field.
                vessel = max(0.0, grain) ** 5.0
                amount = 0.035 * fine - 0.23 * vessel
                tint = (1.0, 0.74, 0.78)
            elif name == 'muscle':
                fibre = math.sin((u * 52.0 + v * 8.0) * math.tau) * 0.5
                amount = 0.055 * fibre + 0.025 * fine
                tint = (1.0, 0.86, 0.80)
            elif name == 'bone':
                pore = max(0.0, grain - 0.72) * -0.18
                amount = 0.035 * fine + pore
                tint = (1.0, 0.98, 0.91)
            elif name == 'tendon':
                fibre = math.sin((u * 38.0 - v * 10.0) * math.tau)
                amount = 0.035 * fibre
                tint = (0.97, 1.0, 1.0)
            else:
                amount = 0.025 * grain + 0.018 * fine
                tint = (1.0, 0.97, 0.96)
            i = (y * size + x) * 4
            for c in range(3):
                pixels[i + c] = max(0.0, min(1.0, base[c] * tint[c] + amount))
            pixels[i + 3] = 1.0
    image.pixels.foreach_set(pixels)
    image.update()
    image.filepath_raw = os.path.join(TEXTURE_DIR, image_name + '.png')
    image.file_format = 'PNG'
    image.save()
    return image


def socket(node, name):
    return next(item for item in node.inputs if item.name == name)


def material(name):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    colour, roughness = PALETTE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    socket(bsdf, 'Base Color').default_value = colour
    socket(bsdf, 'Roughness').default_value = roughness
    socket(bsdf, 'Metallic').default_value = 0.0
    image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    image_node.image = tissue_texture(name)
    image_node.interpolation = 'Linear'
    mat.node_tree.links.new(image_node.outputs[0], socket(bsdf, 'Base Color'))
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


def ensure_uv(obj):
    """Guarantee every exported primitive has a stable UV channel.

    Curve-generated ribs already carry useful longitudinal UVs.  The generated
    diaphragm does not, so it receives a planar atlas based on its own bounds.
    """
    mesh = obj.data
    if mesh.uv_layers:
        return
    layer = mesh.uv_layers.new(name='UVMap')
    xs = [v.co.x for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    x0, x1 = min(xs), max(xs)
    z0, z1 = min(zs), max(zs)
    dx = max(x1 - x0, 1e-6)
    dz = max(z1 - z0, 1e-6)
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            layer.data[loop_index].uv = ((co.x - x0) / dx, (co.z - z0) / dz)


CAGE_TOP = 3.42
CAGE_BOTTOM = 1.62
DIAPHRAGM_BASE = 1.72
LUNG_APEX = 3.44
LUNG_BASE = 2.034
CARINA_Z = 2.96


def clamp01(value):
    return min(max(value, 0.0), 1.0)


def deformed(part, co, inhale):
    """One endpoint of a quiet-to-deep breath, in Blender coordinates.

    The deformation is intentionally non-uniform.  The posterior rib joints
    stay nearly fixed while the lateral/anterior ribs lift and swing out; the
    diaphragmatic rim stays attached while its domes flatten; lung bases move
    more than the apices; and only the intrapulmonary airway follows the lung.
    """
    x, y, z = co
    direction = 1.0 if inhale else -1.0
    if part == 'ribcage':
        height = clamp01((z - CAGE_BOTTOM) / (CAGE_TOP - CAGE_BOTTOM))
        mid = math.sin(math.pi * height) ** 0.7
        front = clamp01((0.48 - y) / 1.10)
        transverse = (0.068 if inhale else 0.045) * direction
        x *= 1.0 + transverse * (0.42 + 0.58 * mid)
        y -= direction * (0.060 if inhale else 0.034) * front * (0.35 + 0.65 * mid)
        z += direction * (0.075 if inhale else 0.040) * front * mid
    elif part == 'diaphragm':
        # Full control travel represents one slow deep breath: about 4.9 cm of
        # inspiratory dome descent and 1.6 cm of expiratory rebound.
        factor = 0.70 if inhale else 1.07
        dome = clamp01((z - DIAPHRAGM_BASE) / 0.54)
        x *= 1.0 + (0.025 if inhale else -0.090) * dome
        y *= 1.0 + (0.035 if inhale else -0.100) * dome
        z = DIAPHRAGM_BASE + (z - DIAPHRAGM_BASE) * factor
    elif part == 'lungs':
        basal = clamp01((LUNG_APEX - z) / (LUNG_APEX - LUNG_BASE))
        diaphragm_factor = 0.70 if inhale else 1.07
        floor_z = DIAPHRAGM_BASE + (z - DIAPHRAGM_BASE) * diaphragm_factor
        # Every point on the diaphragmatic surface follows the dome exactly;
        # the deformation then fades through the middle lobe and reaches zero
        # at the anchored apex.
        contact = clamp01((2.55 - z) / 0.35)
        z += (floor_z - z) * contact
        radial = (0.042 if inhale else -0.060) * (0.30 + 0.70 * basal)
        depth = (0.055 if inhale else -0.065) * (0.30 + 0.70 * basal)
        # The mediastinal/hilar surface is tethered; expansion is lateral from
        # that anchor rather than scaling the whole lung away from the carina.
        side = 1.0 if x >= 0.0 else -1.0
        anchor = side * 0.29
        x = anchor + (x - anchor) * (1.0 + radial)
        y *= 1.0 + depth
    elif part == 'airway':
        distal = clamp01((CARINA_Z - z) / (CARINA_Z - LUNG_BASE))
        if distal > 0.0:
            basal = clamp01((LUNG_APEX - z) / (LUNG_APEX - LUNG_BASE))
            diaphragm_factor = 0.70 if inhale else 1.07
            floor_z = DIAPHRAGM_BASE + (z - DIAPHRAGM_BASE) * diaphragm_factor
            contact = clamp01((2.55 - z) / 0.35)
            z += (floor_z - z) * contact
            radial = (0.042 if inhale else -0.060) * (0.30 + 0.70 * basal)
            depth = (0.055 if inhale else -0.065) * (0.30 + 0.70 * basal)
            # The intrapulmonary tree uses the same continuous deformation as
            # the parenchyma around it, preserving its rest-pose containment.
            side = 1.0 if x >= 0.0 else -1.0
            anchor = side * 0.29
            x = anchor + (x - anchor) * (1.0 + radial)
            y *= 1.0 + depth
    return (x, y, z)


def add_breath_shapes(obj, part):
    if part not in {'ribcage', 'diaphragm', 'lungs', 'airway'}:
        return
    basis = obj.shape_key_add(name='Basis')
    inhale = obj.shape_key_add(name='Inhale')
    exhale = obj.shape_key_add(name='Exhale')
    for index, point in enumerate(basis.data):
        inhale.data[index].co = deformed(part, point.co, True)
        exhale.data[index].co = deformed(part, point.co, False)
    obj.data.shape_keys.use_relative = True


groups = {}
for obj in list(bpy.data.objects):
    if obj.type != 'MESH':
        continue
    for prefix, material_name, group in ASSIGN:
        if obj.name.startswith(prefix):
            obj.data.materials.clear()
            obj.data.materials.append(material(material_name))
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
    ensure_uv(joined)
    add_breath_shapes(joined, group)
    for polygon in joined.data.polygons:
        polygon.use_smooth = True
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
    export_apply=False,
    export_yup=True,
    export_normals=True,
    export_texcoords=False,
    export_vertex_color='ACTIVE',
    export_materials='EXPORT',
    export_morph=True,
    export_morph_normal=True,
    export_cameras=False,
    export_lights=False,
)

for obj in made:
    slots = [s.material.name if s.material else '-' for s in obj.material_slots]
    print('%-10s faces=%5d  materials=%s' % (obj.name, len(obj.data.polygons), ','.join(slots)))
print('exported', OUT)
