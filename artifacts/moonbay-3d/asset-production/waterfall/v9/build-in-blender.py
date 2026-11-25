"""Build the Moonbay cascade in metres. Run with Blender -b --python this_file."""
from math import cos, hypot, pi, sin
from pathlib import Path
from tempfile import TemporaryDirectory
import bpy
import bmesh
import numpy as np
from mathutils import Vector, noise

OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

def point(x, y, z):
    return x, -z, y

# Downstream Z, water elevation, channel centre, width to the left and right.
# Each boundary is shared by its two surfaces so that their banks cannot drift.
sections = [
    (-3.61, 5.74, .42, .12, .21), (-3.35, 5.71, .41, .29, .29),
    (-3.04, 5.63, .36, .42, .43), (-2.72, 5.55, .24, .71, .61),
    (-2.40, 5.52, .18, .84, .91), (-2.02, 5.51, .12, .72, 1.01),
    (-1.81, 5.47, .04, .71, .91), (-1.65, 5.30, .03, .69, .88),
    (-1.57, 4.87, .02, .66, .84), (-1.46, 4.32, .00, .74, .93),
    (-1.26, 3.95, -.10, .85, 1.00), (-.99, 3.87, -.17, .95, 1.19),
    (-.60, 3.87, -.25, 1.05, 1.27), (-.26, 3.86, -.25, .95, .99),
    (.02, 3.83, -.28, .69, .66), (.18, 3.67, -.34, .67, .64),
    (.27, 3.18, -.35, .65, .67), (.36, 2.50, -.33, .75, .70),
    (.54, 2.09, -.29, .85, .79), (.80, 2.02, -.15, 1.07, .95),
    (1.13, 2.01, -.04, 1.27, 1.20), (1.52, 2.00, .12, 1.14, 1.14),
    (1.87, 1.97, .26, .88, .85), (2.12, 1.86, .55, .75, .72),
    (2.28, 1.57, .59, .68, .67), (2.42, 1.14, .67, .65, .71),
    (2.57, .67, .74, .72, .76), (2.83, .38, .82, .85, .88),
    (3.09, .31, .85, .92, .84), (3.39, .26, .99, .74, .60),
    (3.64, .20, 1.14, .39, .34), (3.81, .17, 1.21, .26, .22),
    (3.93, .12, 1.24, .15, .12),
]

def coherent(x,y,z,scale):
    return noise.noise_vector(Vector((x*scale+10.31,y*scale-4.85,z*scale+8.11)))[0]

def mix(a,b,t):
    return tuple(x+(y-x)*t for x,y in zip(a,b))

# Cross sections have recessed beds and a continuous solid skirt.
rock = bpy.data.materials.new("Fractured calcareous slate | wet seams and moss")
rock.use_nodes = True
rock.diffuse_color = (.34,.32,.26,1)

def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata([point(*v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    data.materials.append(material)
    return obj

def faces_for_grid(rows, cols):
    return [(r*cols+c, (r+1)*cols+c, (r+1)*cols+c+1, r*cols+c+1)
            for r in range(rows-1) for c in range(cols-1)]

stone_points, stone_faces = [], []
across = [-1.0,-.90,-.80,-.73,-.65,-.57,-.50,-.43,-.36,-.33,-.24,0,
          .24,.33,.36,.43,.50,.57,.65,.73,.80,.90,1.0]
for row,(z,y,c,l,r) in enumerate(sections):
    prev = sections[max(0,row-1)]
    nex = sections[min(len(sections)-1,row+1)]
    dy, dz = nex[1]-prev[1], nex[0]-prev[0]
    length = hypot(dy,dz)
    ny, nz = dz/length, abs(dy)/length
    for u in across:
        dist = abs(u)
        width = l if u<0 else r
        side = -1 if u<0 else 1
        shoulder = 1.6 + .32*sin(z*2.68+side*1.7) + .16*sin(z*5.6+side)
        if z < -2.75:
            shoulder += .5*(-z-2.75)
        if z > 2.1:
            shoulder *= 1-.31*(z-2.1)
        x = c+side*(width*min(1,dist/.33)+shoulder*max(0,dist-.33)/.67)
        n = coherent(x, y*.8, z, 2.2)
        x += max(0,dist-.36)*n*.15
        depth = .16+.13*max(0,1-dist/.39)
        # The bed climbs just inside the visible waterline. The water extends
        # into this wet lip, so oblique views cannot show a detached edge.
        wet_lip = min(1,max(0,(dist-.25)/.105))
        wet_lip = wet_lip*wet_lip*(3-2*wet_lip)
        yy = y-ny*(depth-.315*wet_lip)
        zz = z-nz*(depth-.315*wet_lip)
        if dist > .33:
            rim = max(0,dist-.33)/.67
            bluff = min(1,rim*2.5)
            rift = sin((y+.20*x-.11*z)*14 + 1.4*n)
            side_rise = (.33 + .16*sin(z*2.3+side*1.2)) * sin(min(1,rim*6)*pi*.5)
            outer = max(0, (dist-.50)/.50)
            ledge = (.16*sin(x*6+z*3.2)+.22*n+.086*rift)*bluff
            yy = max(.075, yy+side_rise + ledge - outer**1.02*(.49*y+.29))
            zz += rim*(.23*sin(x*2+z*.78)+.135*n)+bluff*.10*rift
        if z>2.9:
            yy = max(.04, yy-.10*(z-2.9))
        zz -= .14*max(0,dist-.33)*nz
        stone_points.append((x,yy,zz))

cols = len(across)
for i,j,k,m in faces_for_grid(len(sections),cols):
    if (i//cols+i%cols)%2:
        stone_faces.extend(((i,j,m),(j,k,m)))
    else:
        stone_faces.extend(((i,j,k),(i,k,m)))
border = list(range(cols)) + [r*cols+cols-1 for r in range(1,len(sections))]
border += list(range(len(stone_points)-2,len(stone_points)-cols-1,-1))
border += [r*cols for r in range(len(sections)-2,0,-1)]
lower = len(stone_points)
for i in border:
    x,y,z = stone_points[i]
    stone_points.append((x*.98,0,z))

for i,a in enumerate(border):
    j = (i+1) % len(border)
    stone_faces.append((border[j],a,lower+i,lower+j))
stone_faces.append(tuple(range(lower,lower+len(border))))

# Fractured shelves run into the outcrop as vertical ribs and give way to
# smaller, shallow fragments at the stream mouth. Tall pieces taper back.
def shelf(x,top,z,w,h,d,phase):
    outlines = [
        [(-1,-.33),(-.59,-1),(.33,-.9),(.88,-.60),(1,.22),(.58,.94),(-.18,1),(-.79,.59)],
        [(-1,-.49),(-.69,-.88),(.20,-1),(.93,-.42),(.83,.52),(.25,1),(-.61,.87),(-.92,.21)],
        [(-1,-.19),(-.74,-.94),(-.05,-.84),(.86,-1),(1,.11),(.71,.75),(-.08,1),(-.83,.56)],
    ]
    outline = outlines[int(phase*11)%len(outlines)]
    count = len(outline)
    start = len(stone_points)
    side = 1 if x>0 else -1
    stretch = [(.02,.82,-.31,-.05),(.28,1.03,-.15,.09),(.58,.96,.02,.03),
               (.68,.99,.07,-.005),(.94,.83,.10,-.09),(1.0,.57,-.02,-.12)]
    for ring,(height,spread,lean,shift) in enumerate(stretch):
        for i,(u,v) in enumerate(outline):
            xx = x+w*(u*spread+side*lean)
            zz = z+d*(v*spread+shift)
            yy = top-h + h*(height+.12*sin(i*2.32+phase*7)*height) -.19*(xx-x)+.13*(zz-z)
            xx += side*w*.075*sin(i*.61+ring+phase)
            zz += d*.056*sin(i*1.8+ring*2.3+phase)
            stone_points.append((xx,max(.015,yy),zz))

    for band in range(len(stretch)-1):
        for i in range(count):
            j = (i+1)%count
            a=start+band*count
            stone_faces.append((a+i,a+j,a+j+count,a+i+count))
    stone_faces.append(tuple(start+i for i in range(count)))
    cap=start+(len(stretch)-1)*count
    stone_faces.extend(((cap,cap+1,cap+2,cap+3,cap+4),
                        (cap+4,cap+5,cap+6,cap+7,cap)))

for spec in [
    (-1.61,5.87,-2.83,1.27,2.84,.84,.33),
    (-2.39,4.98,-1.97,.82,2.39,.78,.61),
    (-.35,6.22,-3.25,.79,1.43,.39,.74),
    ( 1.05,6.12,-3.24,.73,1.49,.46,.41),
    ( 2.12,5.76,-2.62,1.13,2.74,.93,.16),
    ( 1.61,5.07,-1.72,.46,1.71,.50,.93),
    (-1.91,4.23,-1.04,.77,2.32,.64,.25),
    (-2.39,3.88,-.24,.70,2.77,.72,.51),
    ( 2.19,4.02,-.89,.86,2.22,.80,.52),
    ( 1.43,3.89,-.11,.48,1.67,.67,.68),
    (-1.78,2.41,.99,.86,2.05,.82,.27),
    (-1.69,1.97,1.93,.53,1.86,.54,.33),
    ( 1.93,2.46,1.01,.89,1.93,.76,.41),
    ( 2.05,1.82,1.99,.59,1.81,.72,.55),
    (-.22,.62,2.97,.63,.55,.57,.90),
    ( 1.84,.59,3.00,.49,.56,.61,.10),
    ( 1.65,.33,3.63,.52,.28,.30,.81),
    ( .61,.22,3.56,.40,.22,.34,.31),
    ( 1.19,.25,3.94,.52,.26,.25,.56),
    ( 2.34,.45,2.83,.44,.52,.48,.61),
    (-.68,.41,3.37,.39,.41,.35,.38),
]:
    shelf(*spec)

bed = mesh("Cascade bedrock and fractured banks",stone_points,stone_faces,rock)
bpy.context.view_layer.objects.active = bed
bed.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
# Fuse the ribs and terraces into one eroded mass. Small concave gaps
# from intersecting original rock volumes cannot show through the banks.
remesh = bed.modifiers.new("Fused bedrock","REMESH")
remesh.mode = "VOXEL"
remesh.voxel_size = .052
remesh.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth = bed.modifiers.new("Eroded bank edges","SMOOTH")
smooth.factor = .62
smooth.iterations = 2
bpy.ops.object.modifier_apply(modifier=smooth.name)
simplify = bed.modifiers.new("Browser rock silhouette","DECIMATE")
simplify.ratio = min(1,10600/len(bed.data.polygons)*.5)
bpy.ops.object.modifier_apply(modifier=simplify.name)

# Sanitize duplicate faces left by tightly spaced decimation, then lock the
# exact triangles used for both the UV bake and the runtime collider.
clean = bmesh.new()
clean.from_mesh(bed.data)
bmesh.ops.dissolve_degenerate(clean,dist=.00008,edges=list(clean.edges))
seams = [edge for edge in clean.edges if edge.is_boundary]
if seams:
    bmesh.ops.holes_fill(clean,edges=seams,sides=8)
bmesh.ops.triangulate(clean,faces=list(clean.faces))
bmesh.ops.recalc_face_normals(clean,faces=list(clean.faces))
broken = [(tuple(edge.verts[0].co),len(edge.link_faces)) for edge in clean.edges if not edge.is_manifold]
if broken:
    raise RuntimeError(f"The bedrock must be a closed mesh: {broken[:8]}")
clean.to_mesh(bed.data)
clean.free()
bed.data.validate()
validated = bmesh.new()
validated.from_mesh(bed.data)
closed = all(edge.is_manifold for edge in validated.edges)
validated.free()
if not closed:
    raise RuntimeError("The simplified mesh lost its closed rock faces")

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.22,island_margin=.016)
bpy.ops.uv.pack_islands(rotate=True,margin_method="FRACTION",margin=.009)
bpy.ops.object.mode_set(mode="OBJECT")
bed.data.uv_layers.active.name = "Slate atlas"
bed.data.update()

# A new atlas follows the full bed, including geological seams and the
# wet zone right along all three spillways. Blender bakes WebGL-ready maps.
attrs = bed.data.color_attributes.new(name="Water stain",type="FLOAT_COLOR",domain="POINT")
for v in bed.data.vertices:
    x,z,y = v.co.x,-v.co.y,v.co.z
    distance = min(hypot(z-row[0],(y-row[1])*.64) for row in sections)
    k = max(0,min(1,1-distance/.8))
    near = min(sections,key=lambda row:hypot(z-row[0],(y-row[1])*.8))
    _,_,centre,left,right = near
    u = (x-centre)/(left if x<centre else right)
    stain = max(0,min(1,1-max(0,abs(u)-.78)*1.1))*k
    attrs.data[v.index].color = (stain,stain,stain,1)

nodes, links = rock.node_tree.nodes, rock.node_tree.links
surface = nodes.get("Principled BSDF")
output = nodes.get("Material Output")
position = nodes.new("ShaderNodeTexCoord").outputs["Object"]
xyz = nodes.new("ShaderNodeSeparateXYZ")
links.new(position,xyz.inputs[0])

def socket(val,port):
    if isinstance(val,(int,float,tuple)):
        port.default_value = (val,val,val,1) if port.type == "RGBA" and isinstance(val,(int,float)) else val
    else:
        links.new(val,port)

def calc(operation,a,b=None):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    socket(a,node.inputs[0])
    if b is not None:
        socket(b,node.inputs[1])
    return node.outputs[0]

def signal_noise(scale,detail=2,roughness=.62):
    node = nodes.new("ShaderNodeTexNoise")
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = detail
    node.inputs["Roughness"].default_value = roughness
    links.new(position,node.inputs["Vector"])
    return node.outputs["Fac"]

def ramp(signal,stops):
    node = nodes.new("ShaderNodeValToRGB")
    node.color_ramp.interpolation = "EASE"
    for i,(pos,color) in enumerate(stops):
        elem = node.color_ramp.elements[i] if i<2 else node.color_ramp.elements.new(pos)
        elem.position = pos
        elem.color = (*((color,)*3 if isinstance(color,(int,float)) else color),1)
    links.new(signal,node.inputs[0])
    return node.outputs[0]

def blend(factor,a,b,mode="MIX"):
    node = nodes.new("ShaderNodeMixRGB")
    node.blend_type = mode
    for i,value in enumerate((factor,a,b)):
        socket(value,node.inputs[i])
    return node.outputs[0]

x, minus_z, y = xyz.outputs
large, mineral, grain, grit = (signal_noise(.85,3),signal_noise(4.7,3),signal_noise(27),signal_noise(69))
seam_height = calc("ADD",y,calc("ADD",calc("MULTIPLY",x,.18),calc("MULTIPLY",minus_z,.107)))
seam_height = calc("ADD",seam_height,calc("MULTIPLY",large,.49))
layers = calc("ADD",calc("MULTIPLY",seam_height,3.43),calc("MULTIPLY",mineral,.25))
layers = calc("FRACT",layers)
seam = ramp(layers,[(0,.32),(.072,.53),(.19,.91),(.29,1),(.60,.84),(.89,.97),(1,.37)])
stone = ramp(large,[(.16,(.26,.248,.218)),(.47,(.405,.375,.327)),(.73,(.54,.499,.427)),(.9,(.65,.605,.543))])
grain_color = ramp(mineral,[(.19,(.58,.55,.48)),(.49,(.92,.89,.83)),(.76,(1,.98,.90))])
stone = blend(.62,stone,grain_color,"MULTIPLY")
stone = blend(.85,stone,seam,"MULTIPLY")
band_h = calc("FRACT",calc("ADD",calc("MULTIPLY",seam_height,1.47),calc("MULTIPLY",mineral,.13)))
calcite = ramp(band_h,[(0,.53),(.06,.32),(.09,0),(.96,0),(1,.53)])
stone = blend(calc("MULTIPLY",calcite,calc("GREATER_THAN",large,.40)),stone,(.57,.531,.457,1))

wet = nodes.new("ShaderNodeVertexColor")
wet.layer_name = "Water stain"
stain = calc("MULTIPLY",wet.outputs["Color"],ramp(mineral,[(.18,.42),(.73,1)]))
wet_color = ramp(large,[(.22,(.116,.16,.142)),(.54,(.192,.235,.211)),(.81,(.299,.329,.281))])
wet_color = blend(.59,wet_color,seam,"MULTIPLY")
bed_color = blend(stain,stone,wet_color)
moss_noise = calc("ADD",signal_noise(1.9,4),calc("MULTIPLY",mineral,.19))
moss_cover = ramp(moss_noise,[(.50,0),(.59,.10),(.71,.72),(.82,.98)])
moss_color = ramp(mineral,[(.17,(.107,.152,.066)),(.51,(.225,.280,.105)),(.80,(.342,.377,.148))])
bed_color = blend(moss_cover,bed_color,moss_color)
roughness = blend(stain,ramp(grain,[(.15,.75),(.90,.97)]),.51)
roughness = blend(moss_cover,roughness,.97)

bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = .44
bump.inputs["Distance"].default_value = .053
relief = calc("ADD",calc("MULTIPLY",seam,.29),calc("ADD",calc("MULTIPLY",grain,.42),calc("MULTIPLY",grit,.14)))
links.new(relief,bump.inputs["Height"])
links.new(bump.outputs["Normal"],surface.inputs["Normal"])

scene.render.engine = "CYCLES"
scene.cycles.samples = 2
scene.render.bake.margin = 10

def bake(name,size,colorspace,signal=None):
    image = bpy.data.images.new(name,width=size,height=size,alpha=False)
    image.colorspace_settings.name = colorspace
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.label = name
    nodes.active = tex
    if signal is None:
        links.new(surface.outputs[0],output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL",normal_space="TANGENT")
    else:
        emit = nodes.new("ShaderNodeEmission")
        links.new(signal,emit.inputs["Color"])
        links.new(emit.outputs[0],output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT")
        nodes.remove(emit)
    # Very narrow UV islands can fall entirely between bake samples. Extend
    # the baked colour through unused texels before filtering or mipmapping.
    pixels = np.empty(size*size*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    colors = pixels.reshape((size,size,4))
    # All albedo pigments used here are above this sRGB value once baked.
    # Dark pixels below it are partially covered texels along narrow islands.
    minimum = .35 if colorspace == "sRGB" else .015
    coverage = colors[:,:,:3].max(axis=2)>minimum
    if not coverage.any():
        raise RuntimeError(f"No pixels baked for {name}")
    fallback = np.median(colors[coverage],axis=0)
    for _ in range(24):
        before = coverage.copy()
        for dest,source in [
            ((slice(1,None),slice(None)),(slice(None,-1),slice(None))),
            ((slice(None,-1),slice(None)),(slice(1,None),slice(None))),
            ((slice(None),slice(1,None)),(slice(None),slice(None,-1))),
            ((slice(None),slice(None,-1)),(slice(None),slice(1,None))),
        ]:
            grow = ~coverage[dest] & before[source]
            colors[dest][grow] = colors[source][grow]
            coverage[dest][grow] = True
        if coverage.all():
            break
    colors[~coverage] = fallback
    image.pixels.foreach_set(pixels)
    image.update()
    with TemporaryDirectory(prefix="moonbay-slate-") as scratch:
        image.filepath_raw = str(Path(scratch)/(name+".png"))
        image.file_format = "PNG"
        image.save()
        image.pack()
        relative = "//"+name+".png"
        image.filepath = relative
        for packed in image.packed_files:
            packed.filepath = relative
    return tex

albedo = bake("Cascade slate and moss",1024,"sRGB",bed_color)
rough = bake("Cascade wetness",512,"Non-Color",roughness)
normal = bake("Cascade strata and grain",1024,"Non-Color")
for node in list(nodes):
    if node not in (albedo,rough,normal,surface,output):
        nodes.remove(node)
attrs_name = attrs.name
bed.data.color_attributes.remove(bed.data.color_attributes[attrs_name])
links.new(albedo.outputs["Color"],surface.inputs["Base Color"])
links.new(rough.outputs["Color"],surface.inputs["Roughness"])
nmap = nodes.new("ShaderNodeNormalMap")
links.new(normal.outputs["Color"],nmap.inputs["Color"])
links.new(nmap.outputs["Normal"],surface.inputs["Normal"])
links.new(surface.outputs[0],output.inputs["Surface"])
for node,at in [(albedo,(-580,450)),(rough,(-580,100)),(normal,(-580,-265)),(nmap,(-280,-195)),
                (surface,(0,410)),(output,(320,410))]:
    node.location = at
bed.select_set(False)

def water_material(name,base):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*base,1)
    material.use_nodes = True
    nodes = material.node_tree
    shader = nodes.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .24
    shader.inputs["IOR"].default_value = 1.333
    tint = nodes.nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "Water preview tint"
    nodes.links.new(tint.outputs["Color"],shader.inputs["Base Color"])
    return material

pool = water_material("Basin water | jade shallows",(.038,.29,.29))
falls = water_material("Falling water | foam and fine ribbons",(.19,.54,.55))

def water_point(section, u):
    z,y,c,l,r = sections[section]
    v = 2*u-1
    # Crest profiles follow the broken lip across each separate broad sheet.
    return (c+v*(l if v<0 else r)*(1.055-.023*sin(z*8+v*5)),
            y+.007*sin(z*5+v*12)+.009*cos(v*8-z*2)*sin(z*6),
            z+.022*sin(z*4+v*8)*cos(v*2)+.013*sin(v*13+z))

def water_sample(progress,u):
    last = len(sections)-1
    section = min(last-1,int(progress))
    fraction = progress-section
    keys = [water_point(min(last,max(0,section+offset)),u) for offset in (-1,0,1,2)]
    # Use a local cubic to round the authored bends and waterline silhouettes.
    def interpolate(a,b,c,d):
        left = (c-a)*.5
        right = (d-b)*.5
        t = fraction
        return b+t*(left+t*(3*(c-b)-2*left-right+t*(2*(b-c)+left+right)))
    return tuple(interpolate(*axis) for axis in zip(*keys))

def water_normal(progress,u):
    p = Vector(point(*water_sample(max(0,progress-.015),u)))
    q = Vector(point(*water_sample(min(len(sections)-1,progress+.015),u)))
    a = Vector(point(*water_sample(progress,max(0,u-.006))))
    b = Vector(point(*water_sample(progress,min(1,u+.006))))
    return (q-p).cross(b-a).normalized()

def water_sheet(name, first,last,drop):
    subdivisions = 18
    cols = subdivisions+1
    divisions = 3
    rows = (last-first)*divisions+1
    samples = [(first+row/divisions,col/subdivisions) for row in range(rows) for col in range(cols)]
    vertices = [water_sample(*sample) for sample in samples]
    obj = mesh(name, vertices, faces_for_grid(rows,cols), falls if drop else pool)
    geo = obj.data
    uvs = geo.uv_layers.new(name="Downstream UV")
    attributes = geo.color_attributes.new(name="Water preview tint",type="FLOAT_COLOR",domain="POINT")
    geo.color_attributes.active_color = attributes
    flow = [0.]
    for j in range(1,rows):
        _,y0,z0 = vertices[(j-1)*cols+9]
        _,y1,z1 = vertices[j*cols+9]
        flow.append(flow[-1]+((y1-y0)**2+(z1-z0)**2)**.5)
    for row in range(rows):
        v = flow[row]/flow[-1]
        for col in range(cols):
            u=col/subdivisions
            xyz=vertices[row*cols+col]
            if drop:
                ribbon = .33+.23*sin(u*54+v*2)*sin(u*27-3)+.12*coherent(*xyz,4.0)
                shade = mix((.049,.26,.29),(.45,.69,.66),ribbon+max(0,v-.78)*1.5)
            else:
                edge = abs(2*u-1)**3
                shade = mix((.026,.196,.209),(.15,.375,.342),edge+.15*coherent(*xyz,4))
            attributes.data[row*cols+col].color = (*shade,1)
    for face in geo.polygons:
        face.use_smooth = True
        for loop in face.loop_indices:
            i = geo.loops[loop].vertex_index
            uvs.data[loop].uv = ((i%cols)/subdivisions,1-flow[i//cols]/flow[-1])
    geo.normals_split_custom_set_from_vertices([water_normal(*sample) for sample in samples])
    return obj

water_sheet("cascade-water-pool-source",0,6,False)
water_sheet("cascade-water-drop-upper",6,11,True)
water_sheet("cascade-water-pool-upper",11,14,False)
water_sheet("cascade-water-drop-middle",14,19,True)
water_sheet("cascade-water-pool-lower",19,22,False)
water_sheet("cascade-water-drop-lower",22,28,True)
water_sheet("cascade-water-pool-outlet",28,len(sections)-1,False)

# Preserve the centred metre-scale origin shared by the level editor and Three.js.
bounds = [[v.co[axis] for obj in scene.objects for v in obj.data.vertices] for axis in range(3)]
xc, yc = [(min(values)+max(values))*.5 for values in bounds[:2]]
foot = min(bounds[2])
for obj in scene.objects:
    for v in obj.data.vertices:
        v.co.x -= xc
        v.co.y -= yc
        v.co.z -= foot
    obj.select_set(False)
bpy.context.view_layer.objects.active = bed
bed.select_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            space = area.spaces.active
            space.region_3d.view_location = Vector((0,0,3.05))
            space.region_3d.view_distance = 13.4
            space.region_3d.view_rotation = Vector((-.41,.83,-.34)).to_track_quat("-Z","Y")
            space.shading.type = "MATERIAL"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"waterfall.blend"),relative_remap=False)
bpy.ops.export_scene.gltf(filepath=str(OUT/"waterfall.glb"),export_format="GLB",
                          export_texcoords=True, export_yup=True, export_all_vertex_colors=False,
                          export_tangents=True)
