"""Original toy miniatures, authored in Blender; never touches the user's existing scene.

Run inside Blender's Python context. Exports one texture-free, mobile-friendly GLB.
All eight variants use the existing .25 radius / .22 half-height gameplay proxies.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'pet-app/src/game/assets/arcade-prizes-v2.glb'
original_scene = bpy.context.scene
previous = bpy.data.scenes.get('Arcade Prize Atelier')
if previous and previous.get('arcade_prize_source') == str(Path(__file__).resolve()):
    # Keep our previous draft recoverable, while freeing stable runtime node names on rebuild.
    previous.name = 'Arcade Prize Atelier - draft'
    for obj in previous.objects:
        obj.name = 'Draft_' + obj.name
scene = bpy.data.scenes.new('Arcade Prize Atelier')
scene['arcade_prize_source'] = str(Path(__file__).resolve())
bpy.context.window.scene = scene
collection = scene.collection
materials = {}
roots = []
active_root = None


def color(hex_value):
    rgb = [(hex_value >> shift & 255) / 255 for shift in (16, 8, 0)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)


def mat(name, hex_value, rough=.32, metal=0):
    if name in materials:
        return materials[name]
    material = bpy.data.materials.new('Arcade_' + name)
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = color(hex_value)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    material.diffuse_color = color(hex_value)
    materials[name] = material
    return material


cream = mat('Porcelain', 0xFFF2D9, .27)
white = mat('Eye glint', 0xFFFFFF, .18)
ink = mat('Chocolate eyes', 0x392738, .18)
pink = mat('Blush', 0xF497AC, .35)
gold = mat('Champagne gold', 0xEBC785, .22, .7)
teal = mat('Mint enamel', 0x63C7B2, .3)
tan = mat('Caramel', 0xDFA46E, .31)
ribbon = mat('Rose satin', 0xED588D, .29)
rose_light = mat('Ribbon piping', 0xFFAFCA, .31)
violet = mat('Lavender velvet', 0x8972BC, .46)
mint = mat('Sage upholstery', 0x91BEA6, .55)
mint_light = mat('Sage cushion', 0xB8DAC7, .57)
coral = mat('Mushroom lacquer', 0xE67864, .29)


def mesh(name, vertices, faces, material, smooth=True):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.parent = active_root
    data.materials.append(material)
    for face in data.polygons:
        face.use_smooth = smooth
    return obj


def ball(name, pos, size, material, segments=20, rings=12):
    vertices = []
    for j in range(rings + 1):
        theta = math.pi * j / rings
        for i in range(segments):
            phi = 2 * math.pi * i / segments
            vertices.append((size[0] * math.sin(theta) * math.cos(phi),
                             size[1] * math.sin(theta) * math.sin(phi), size[2] * math.cos(theta)))
    faces = [(j * segments + i, (j + 1) * segments + i,
              (j + 1) * segments + (i + 1) % segments, j * segments + (i + 1) % segments)
             for j in range(rings) for i in range(segments)]
    obj = mesh(name, vertices, faces, material)
    obj.location = pos
    return obj


def rounded(name, pos, size, material, bevel=.05):
    x, y, z = (v / 2 for v in size)
    obj = mesh(name, [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
                     (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],
               [(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)], material, False)
    obj.location = pos
    modifier = obj.modifiers.new('Soft tailored edges', 'BEVEL')
    modifier.width = min(bevel, min(size) * .45)
    modifier.segments = 4
    return obj


def lathe(name, pos, profile, material, segments=32, smooth=True):
    vertices = [(r * math.cos(i * math.tau / segments), r * math.sin(i * math.tau / segments), z)
                for r, z in profile for i in range(segments)]
    faces = [(j * segments + i, j * segments + (i+1) % segments,
              (j+1) * segments + (i+1) % segments, (j+1) * segments + i)
             for j in range(len(profile)-1) for i in range(segments)]
    faces += [tuple(reversed(range(segments))), tuple((len(profile)-1)*segments+i for i in range(segments))]
    obj = mesh(name, vertices, faces, material, smooth)
    obj.location = pos
    return obj


def line(name, points, thickness, material):
    # Explicit mesh tubes avoid unsupported curve exports and texture/shader dependencies.
    vertices = []
    for index, point in enumerate(points):
        p = Vector(point)
        tangent = Vector(points[min(index+1, len(points)-1)]) - Vector(points[max(0,index-1)])
        tangent.normalize()
        normal = tangent.cross(Vector((0,1,0)))
        if normal.length < .01:
            normal = tangent.cross(Vector((1,0,0)))
        normal.normalize()
        other = tangent.cross(normal).normalized()
        for i in range(6):
            vertices.append(p + thickness * (normal * math.cos(i*math.tau/6) + other * math.sin(i*math.tau/6)))
    faces = [(j*6+i,j*6+(i+1)%6,(j+1)*6+(i+1)%6,(j+1)*6+i)
             for j in range(len(points)-1) for i in range(6)]
    return mesh(name, vertices, faces, material)


def silhouette(name, outline, depth, material, bevel=.025):
    area = sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))
    if area < 0:
        outline = list(reversed(outline))
    n = len(outline)
    obj = mesh(name, [(x, y, z) for y in [-depth/2,depth/2] for x,z in outline],
               [tuple(range(n)),tuple(reversed([n+i for i in range(n)]))] +
               [(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)], material, False)
    mod = obj.modifiers.new('Soft sculpted rim', 'BEVEL')
    mod.width = bevel
    mod.segments = 3
    return obj


def root(kind, variant):
    global active_root
    active_root = bpy.data.objects.new('Prize_' + kind + '_' + str(variant), None)
    collection.objects.link(active_root)
    roots.append(active_root)


def ruby(variant):
    root('ruby', variant)
    shades = [mat('Ruby facet '+str(i), h, .16, .22) for i,h in enumerate(
        [0x9C1536,0xD51C45,0xF34E69,0x820E30,0xE63153,0xFF7D91])]
    n = 12
    profile = [(.028,.02),(.32,.28),(.32,.31),(.17,.47)]
    gem = lathe('Brilliant cut ruby', (0,0,0), profile, shades[0], n, False)
    for material in shades[1:]:
        gem.data.materials.append(material)
    for face in gem.data.polygons:
        face.material_index = [0,1,3,2,1,4,0,2,3,1,4,2][face.index % n]
    gem.rotation_euler.z = math.pi/12 if not variant else math.pi/6
    if variant:
        gem.scale = (.92,1,.98)
    # A small solid glint, not particles or an expensive transparent material.
    glint = silhouette('Cut glint', [(0,.07),(.009,.012),(.04,0),(.009,-.012),(0,-.07),(-.009,-.012),(-.04,0),(-.009,.012)], .003, white, .002)
    glint.location = (.105,-.252,.335)
    glint.rotation_euler.x = -.6


def pet(variant):
    root('pet', variant)
    fur = cream if not variant else tan
    ball('Pear body',(0,.02,.24),(.185,.14,.22),fur)
    ball('Cream belly',(0,-.105,.23),(.115,.039,.135),cream)
    ball('Oversized round head',(0,-.013,.51),(.245,.182,.203),fur,24,16)
    for side in [-1,1]:
        ball('Little feet',(side*.105,-.09,.072),(.093,.103,.069),fur)
        ball('Front paws',(side*.153,-.095,.24),(.053,.062,.094),fur)
        if variant:
            ear = ball('Floppy ear',(side*.225,-.005,.49),(.077,.11,.165),mat('Cocoa ears',0xB57248))
            ear.rotation_euler.y = side*.18
        else:
            ear = silhouette('Rounded cat ear', [(-.067,0),(.067,0),(.046,.13),(.018,.159),(-.015,.145)], .075,fur,.018)
            ear.location = (side*.157,.005,.625)
            inner = silhouette('Rose ear inset', [(-.038,0),(.038,0),(.024,.08),(.007,.105),(-.009,.087)], .007,pink,.006)
            inner.location = (side*.157,-.044,.658)
        ball('Glossy eye',(side*.087,-.185,.535),(.028,.018,.039),ink)
        ball('Eye sparkle',(side*.087-.008,-.202,.55),(.009,.006,.011),white,12,8)
        ball('Rosy cheek',(side*.151,-.171,.467),(.032,.012,.017),pink,16,8)
        ball('Cream muzzle',(side*.034,-.184,.471),(.046,.034,.036),cream)
        line('Smile',[(side*.003,-.215,.45),(side*.013,-.216,.434),(side*.03,-.208,.437)],.0045,ink)
    ball('Button nose',(0,-.219,.481),(.021,.014,.015),pink if not variant else ink,16,10)
    collar = lathe('Mint collar',(0,.015,.351),[(.142,0),(.145,.027),(.137,.047)],teal)
    collar.scale.y = .78
    ball('Gold heart tag',(0,-.13,.332),(.029,.011,.033),gold,16,10)
    tail_points = [(.12,.1,.12),(.205,.12,.18),(.232,.102,.25),(.227,.064,.3)]
    line('Curled tail',tail_points,.036,fur)


def wearable(variant):
    root('wearable',variant)
    if not variant:
        for side in [-1,1]:
            outline = [(side*.014,.27),(side*.145,.388),(side*.272,.414),(side*.325,.375),
                       (side*.327,.207),(side*.274,.164),(side*.144,.193)]
            if side < 0:
                outline.reverse()
            silhouette('Sculpted satin bow',outline,.105,ribbon,.032)
            line('Loop highlight',[(side*.055,-.077,.289),(side*.15,-.078,.365),(side*.255,-.077,.379),
                                   (side*.291,-.074,.35)],.006,rose_light)
            tail = silhouette('Ribbon tail',[(side*.029,.245),(side*.096,.264),(side*.156,.035),
                                            (side*.088,.06),(side*.055,.018)],.043,ribbon,.012)
            tail.location.y = .038
            line('Satin fold',[(side*.07,-.031,.259),(side*.14,-.063,.285),(side*.221,-.068,.27)],.007,rose_light)
        ball('Champagne knot',(0,-.026,.274),(.058,.079,.074),gold)
        ball('Pearl knot',(0,-.099,.279),(.019,.012,.024),cream,16,10)
    else:
        brim = lathe('Soft oval brim',(0,0,.033),[(.285,0),(.31,.012),(.31,.035),(.285,.046)],violet)
        brim.scale.y = .82
        lathe('Velvet hat crown',(0,0,.077),[(.202,0),(.197,.022),(.18,.292),(.17,.315),(.148,.326)],violet)
        lathe('Satin hat band',(0,0,.1),[(.203,0),(.2,.065)],ribbon)
        line('Gold band trim',[(.202*math.cos(a),.202*math.sin(a),.104) for a in [i*math.tau/40 for i in range(41)]],.005,gold)
        for i in range(5):
            angle = i*math.tau/5
            ball('Tiny flower petal',(.075+.025*math.cos(angle),-.204,.153+.025*math.sin(angle)),(.019,.012,.019),cream,12,8)
        ball('Flower centre',(.075,-.216,.153),(.012,.008,.012),gold,12,8)


def furniture(variant):
    root('furniture',variant)
    if not variant:
        for x in [-.24,.24]:
            for y in [-.12,.13]:
                lathe('Tapered brass foot',(x,y,.015),[(.019,0),(.026,.083)],gold,12)
        rounded('Sofa frame',(0,.018,.152),(.62,.36,.15),mint,.055)
        rounded('Upholstered back',(0,.148,.34),(.6,.106,.33),mint,.047)
        for side in [-1,1]:
            rounded('Rounded sofa arm',(side*.283,0,.265),(.117,.37,.245),mint,.055)
            rounded('Seat cushion',(side*.122,-.036,.256),(.237,.269,.09),mint_light,.035)
            rounded('Back cushion',(side*.126,.096,.362),(.248,.075,.208),mint_light,.035)
            line('Seat piping',[(side*.231,-.166,.257),(side*.015,-.166,.257)],.0045,cream)
        pillow = rounded('Rose throw pillow',(-.162,-.006,.371),(.133,.086,.147),pink,.038)
        pillow.rotation_euler.y = -.22
        ball('Pillow tuft',(-.162,-.055,.371),(.009,.005,.009),rose_light,12,8)
        pillow = rounded('Cream throw pillow',(.161,-.003,.365),(.124,.077,.142),cream,.033)
        pillow.rotation_euler.y = .22
    else:
        lathe('Ceramic lamp foot',(0,0,.019),[(.1,0),(.12,.014),(.114,.044),(.09,.052)],cream)
        lathe('Lamp stem',(0,0,.066),[(.039,0),(.037,.28)],cream,24)
        lathe('Brass stem collar',(0,0,.302),[(.049,0),(.049,.027)],gold,24)
        lathe('Warm ivory shade underside',(0,0,.32),[(.225,0),(.233,.018),(.226,.035)],cream)
        lathe('Mushroom dome',(0,0,.354),[(.232,0),(.239,.018),(.226,.065),(.194,.119),(.145,.168),(.078,.203),(.014,.22)],coral)
        for angle, radius in [(0,.13),(1.2,.145),(2.6,.117),(4,.14),(5.1,.09)]:
            x,y=radius*math.cos(angle),radius*math.sin(angle)
            ball('Ivory cap spot',(x,y,.535-radius*.3),(.025,.029,.009),cream,16,8)
        line('Pull chain',[(.061,-.027,.333),(.071,-.047,.216),(.072,-.047,.18)],.006,gold)
        ball('Pull bead',(.072,-.047,.175),(.012,.012,.017),gold,12,8)


try:
    for build in [ruby,pet,wearable,furniture]:
        for variant in [0,1]:
            build(variant)
    bpy.context.view_layer.update()
    # Bake modifiers and part transforms, then merge parts by material for few draw calls.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for parent in roots:
        parts = list(parent.children)
        baked = []
        for obj in parts:
            data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph),depsgraph=depsgraph)
            data.transform(obj.matrix_world)
            baked.append((data,list(obj.data.materials)))
        points = [v.co for data,_ in baked for v in data.vertices]
        min_z,max_z = min(p.z for p in points),max(p.z for p in points)
        # Circular proxy, not just independent x/z AABB; no protruding corners clip coins.
        radius = max(math.hypot(p.x,p.y) for p in points)
        factor = min(.438/(max_z-min_z),.244/radius)
        transform = Matrix.Translation((0,0,-.22-min_z*factor)) @ Matrix.Scale(factor,4)
        buckets = {}
        for data,mats in baked:
            data.transform(transform)
            indices = {}
            for polygon in data.polygons:
                material = mats[polygon.material_index]
                vertices,faces,smooth = buckets.setdefault(material.name,([],[],[]))
                mapping = indices.setdefault(material.name,{})
                face = []
                for index in polygon.vertices:
                    if index not in mapping:
                        mapping[index] = len(vertices)
                        vertices.append(tuple(data.vertices[index].co))
                    face.append(mapping[index])
                faces.append(tuple(face))
                smooth.append(polygon.use_smooth)
        for name,(vertices,faces,smooth) in buckets.items():
            active_root = parent
            obj = mesh(parent.name+'_'+name,vertices,faces,bpy.data.materials[name])
            # Preserve smooth split normals after joining disconnected sculpted parts.
            for polygon,flag in zip(obj.data.polygons,smooth):
                polygon.use_smooth = flag
        for obj in parts:
            bpy.data.objects.remove(obj,do_unlink=True)
        for data,_ in baked:
            bpy.data.meshes.remove(data)
    for obj in scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    cls = bpy.types.Operator.bl_rna_get_subclass_py('EXPORT_SCENE_OT_gltf')
    definition = next(c.__annotations__['export_format'] for c in cls.__mro__
                      if 'export_format' in getattr(c,'__annotations__',{}))
    items = definition.keywords['items']
    formats = items(None,bpy.context) if callable(items) else items
    export_format = next(item[0] for item in formats if item[0] == 'GLB')
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format=export_format,use_selection=True,use_active_scene=True,
                              export_apply=True,export_animations=False,export_cameras=False,
                              export_lights=False,export_texcoords=False,export_extras=False)
    print(json.dumps({'output':str(OUTPUT),'bytes':OUTPUT.stat().st_size,'variants':[r.name for r in roots]}))
    # Lay out the isolated atelier for the viewport check. Runtime GLB stays centred at origin.
    for index,parent in enumerate(roots):
        parent.location = ((index%4)*.8,(index//4)*.8,.22)
    bpy.context.view_layer.update()
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.region_3d.view_location = (1.2,.4,.2)
            area.spaces.active.region_3d.view_distance = 3.7
finally:
    # Keep this new scene available for review without deleting or changing existing objects.
    bpy.context.window.scene = original_scene
