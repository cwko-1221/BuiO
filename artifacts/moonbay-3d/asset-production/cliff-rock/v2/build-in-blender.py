"""Build the Moonbay weathered coastal slate outcrop in Blender 4.5."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

DEST = Path(sys.argv[sys.argv.index("--") + 1])
DEST.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

# Each stone has its own fracture profile. Rings run counterclockwise looking
# down. Three narrow steps across the main body describe the same tipped bed.
PLAN = [(-1.00,-.37),(-.44,-.95),(.45,-1),(.98,-.48),(1,.32),(.55,.91),(-.27,1),(-.88,.52)]
SPALL = [(-.99,-.06),(-.75,-.68),(.04,-1),(.73,-.76),(1,-.07),(.67,.73),(-.02,1),(-.84,.65)]
SHELF = [(-1,-.16),(-.67,-.80),(-.12,-1),(.90,-.53),(1,.38),(.39,.94),(-.40,1),(-.92,.61)]
vertices, faces = [], []

def stone(profile, center, half, heights, sections, rotate=0):
    start = len(vertices)
    cc, ss = math.cos(rotate), math.sin(rotate)
    for j, (level, radius, slide_x, slide_y) in enumerate(sections):
        for i, (x,y) in enumerate(profile):
            ox = (x*radius + slide_x)*half[0]
            oy = (y*radius + slide_y)*half[1]
            z = center[2] + half[2]*(level + heights[i]*min(level*2.7,1))
            vertices.append((center[0]+ox*cc-oy*ss,center[1]+ox*ss+oy*cc,z))
    count = len(profile)
    faces.append(tuple(start+i for i in reversed(range(count))))
    for j in range(len(sections)-1):
        for i in range(count):
            at = start+j*count+i
            nxt = start+j*count+(i+1)%count
            faces.append((at,nxt,nxt+count,at+count))
    up = start+(len(sections)-1)*count
    faces.extend([(up,up+1,up+2,up+3,up+4),(up,up+4,up+5,up+6,up+7)])

# Long riven bedrock faces with a collapsed corner or a recessed upper bench.
def variant_0():
    stone(SHELF,(-.12,-.03,0),(1.96,1.05,2.83),[.155,.12,.085,-.05,.06,.118,.19,.15],[
        (0,.95,0,-.085),(.16,1.02,-.03,-.035),(.39,1,-.013,.035),(.54,.99,.016,.083),
        (.61,.94,.029,.096),(.79,.89,-.048,.153),(.93,.73,-.15,.20)
    ],-.10)
    # The smaller rib emerges from the side of the parent bedrock. Its heel
    # is buried inside the mass. It never faces the slope as a loose rock.
    stone(PLAN,(1.17,.31,.013),(.78,.74,2.38),[-.07,.04,.13,.08,-.05,.07,.12,-.10],[
        (0,.98,-.25,-.03),(.19,1.01,-.118,-.025),(.47,1,.04,-.05),(.71,.80,.11,.085),(.96,.61,.13,.16)
    ],.10)

def variant_1():
    stone(PLAN,(-.69,-.07,0),(1.21,1.09,2.81),[.04,.10,.12,.021,-.11,-.06,.034,.14],[
        (0,.97,.12,-.055),(.16,1.03,.11,-.065),(.41,1.00,-.022,.005),(.52,.93,-.104,.071),
        (.73,.88,-.048,.104),(.94,.68,-.115,.15)
    ],.19)
    stone(SHELF,(.61,-.005,0),(1.37,.90,1.76),[-.06,.12,.13,.11,.04,.06,.07,.035],[
        (0,.94,-.07,-.09),(.22,1.01,.0,-.034),(.40,.97,.015,.017),(.54,.90,.044,.055),
        (.80,.86,.0,.11),(.91,.71,.02,.16)
    ],-.15)

def make_variant(name, sculpt):
    vertices.clear()
    faces.clear()
    bpy.ops.object.select_all(action="DESELECT")
    sculpt()
    lo = [min(v[i] for v in vertices) for i in range(3)]
    hi = [max(v[i] for v in vertices) for i in range(3)]
    center = [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]]
    dims = (4.5,2.7,3.4)
    vertices[:] = [tuple((v[i]-center[i])*dims[i]/(hi[i]-lo[i]) for i in range(3)) for v in vertices]
    mesh = bpy.data.meshes.new("Fractured cliff slate")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    
    # Narrow irregular highlights on chipped edges. Preserve large fracture planes.
    for poly in mesh.polygons:
        poly.use_smooth = True
    bevel = obj.modifiers.new("Weathered fracture edges", "BEVEL")
    bevel.width = .039
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = .27
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    triangulate = obj.modifiers.new("Stable bake triangulation", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    normals = obj.modifiers.new("Weighted plane normals", "WEIGHTED_NORMAL")
    normals.keep_sharp = True
    normals.weight = 45
    bpy.ops.object.modifier_apply(modifier=normals.name)
    
    # Re-normalize the final footprint after beveling the bounding extrema.
    lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
    for v in obj.data.vertices:
        for i in range(3):
            mid = (lo[i]+hi[i])*.5 if i < 2 else lo[i]
            v.co[i] = (v.co[i]-mid)*dims[i]/(hi[i]-lo[i])
            if i == 2:
                v.co[i] = 1.026*v.co[i] - .088
    return obj


variants = [make_variant(name,sculpt) for name,sculpt in [
    ("cliff-rock-bed",variant_0),("cliff-rock-step",variant_1),
]]
for obj in variants:
    obj.select_set(True)
bpy.context.view_layer.objects.active = variants[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(71), island_margin=.014)
bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=.01)
bpy.ops.object.mode_set(mode="OBJECT")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 2
scene.render.bake.margin = 6
scene.render.bake.use_clear = True
stone_mat = bpy.data.materials.new("Cliff slate and weathered fractures")
stone_mat.use_nodes = True
for obj in variants:
    obj.data.materials.append(stone_mat)
nodes, links = stone_mat.node_tree.nodes, stone_mat.node_tree.links
surface = nodes.get("Principled BSDF")
output = nodes.get("Material Output")
texcoords = nodes.new("ShaderNodeTexCoord")
vector = texcoords.outputs["Object"]
xyz = nodes.new("ShaderNodeSeparateXYZ")
links.new(vector, xyz.inputs[0])

def calc(op, a, b=None):
    n = nodes.new("ShaderNodeMath")
    n.operation = op
    for i,v in enumerate([a,b]):
        if v is None:
            continue
        if isinstance(v, (int,float)):
            n.inputs[i].default_value = v
        else:
            links.new(v,n.inputs[i])
    return n.outputs[0]

def noise(scale, detail, rough):
    n = nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    links.new(vector,n.inputs["Vector"])
    return n.outputs["Fac"]

def ramp(value, stops):
    n = nodes.new("ShaderNodeValToRGB")
    n.color_ramp.interpolation = "EASE"
    for i,(pos,rgb) in enumerate(stops):
        e = n.color_ramp.elements[i] if i<2 else n.color_ramp.elements.new(pos)
        e.position,e.color = pos,(*rgb,1)
    links.new(value,n.inputs["Fac"])
    return n.outputs["Color"]

def mix(factor, a, b, mode="MIX"):
    n = nodes.new("ShaderNodeMixRGB")
    n.blend_type = mode
    for i,value in enumerate((factor,a,b)):
        if isinstance(value,(int,float,tuple)):
            n.inputs[i].default_value = value
        else:
            links.new(value,n.inputs[i])
    return n.outputs[0]

# One irregular fracture crosses the outcrop. Local mineral seams feather
# away before the edges. Wet staining collects in pockets above the foot.
coarse, mineral, grain, fine = noise(1.5,3,.64),noise(7.1,2.5,.64),noise(32,2,.64),noise(83,2,.65)
x,y,z=xyz.outputs["X"],xyz.outputs["Y"],xyz.outputs["Z"]
fold=calc("ADD",calc("ADD",z,calc("MULTIPLY",x,.22)),calc("ADD",calc("MULTIPLY",y,.31),calc("MULTIPLY",coarse,.33)))
primary=calc("SUBTRACT",fold,calc("ADD",1.16,calc("MULTIPLY",mineral,.20)))
profile=ramp(calc("ABSOLUTE",primary),[(0,(.36,.38,.40)),(.039,(.68,.69,.71)),(.119,(1,1,1))])
breaks=ramp(noise(2.6,2,.63),[(0,(.03,.03,.03)),(.42,(.47,.47,.47)),(.69,(.89,.89,.89))])
dry=ramp(coarse,[(0,(.25,.24,.25)),(.42,(.385,.36,.355)),(.67,(.49,.46,.445)),(1,(.64,.61,.57))])
dry=mix(breaks,dry,profile,"MULTIPLY")
spots=ramp(mineral,[(0,(.68,.65,.68)),(.49,(.93,.90,.90)),(.74,(1,.99,.96))])
dry=mix(.61,dry,spots,"MULTIPLY")
vein=calc("SUBTRACT",fold,calc("ADD",1.88,calc("MULTIPLY",mineral,.11)))
vein_mask=ramp(calc("ABSOLUTE",vein),[(0,(.66,.66,.66)),(.032,(.0,.0,.0))])
dry=mix(calc("MULTIPLY",vein_mask,calc("GREATER_THAN",coarse,.53)),dry,(.56,.53,.46,1))
base=calc("ADD",z,calc("MULTIPLY",noise(2.2,2,.63),.57))
moisture=ramp(base,[(.08,(.64,.64,.64)),(.42,(.49,.49,.49)),(.93,(0,0,0))])
color=mix(moisture,dry,(.214,.222,.206,1))
dry_rough=ramp(grain,[(0,(.8,.8,.8)),(1,(.98,.98,.98))])
rough=mix(moisture,dry_rough,(.65,.65,.65,1))
bump=nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = .39
bump.inputs["Distance"].default_value = .034
height=calc("ADD",calc("MULTIPLY",profile,.19),calc("ADD",calc("MULTIPLY",grain,.48),calc("MULTIPLY",fine,.20)))
links.new(height,bump.inputs["Height"])
links.new(bump.outputs["Normal"],surface.inputs["Normal"])

def bake(label, size, colorspace, signal=None):
    img = bpy.data.images.new(label,width=size,height=size,alpha=False)
    img.colorspace_settings.name = colorspace
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.label = label
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
    img.filepath_raw = str(DEST/(label+".png"))
    img.file_format = "PNG"
    img.save()
    img.pack()
    return tex

color_tex = bake("cliff-slate-albedo",1024,"sRGB",color)
rough_tex = bake("cliff-slate-roughness",1024,"Non-Color",rough)
normal_tex = bake("cliff-slate-normal",1024,"Non-Color")
for n in list(nodes):
    if n not in (color_tex,rough_tex,normal_tex,surface,output):
        nodes.remove(n)
links.new(color_tex.outputs["Color"],surface.inputs["Base Color"])
links.new(rough_tex.outputs["Color"],surface.inputs["Roughness"])
tangent = nodes.new("ShaderNodeNormalMap")
links.new(normal_tex.outputs["Color"],tangent.inputs["Color"])
links.new(tangent.outputs["Normal"],surface.inputs["Normal"])
links.new(surface.outputs[0],output.inputs["Surface"])
for n,xy in [(color_tex,(-590,490)),(rough_tex,(-590,80)),(normal_tex,(-590,-330)),(tangent,(-280,-310)),(surface,(0,480)),(output,(310,480))]:
    n.location = xy

bpy.ops.export_scene.gltf(filepath=str(DEST/"cliff-rock.glb"),export_format="GLB",
                         export_animations=False,export_normals=True,export_tangents=True)
for obj in variants:
    print("SHORE ROCK",obj.name,len(obj.data.polygons),"triangles",tuple(obj.dimensions),flush=True)
# Separate studio positions for editing the three variants in one .blend.
for obj,x in zip(variants,(-2.65,2.65)):
    obj.location.x=x
bpy.ops.wm.save_as_mainfile(filepath=str(DEST/"cliff-rock.blend"))