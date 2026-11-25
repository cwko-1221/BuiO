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

def variant_0():
    stone(PLAN, (-.16,.035,.02), (.91,.65,1.07), [.02,.18,.09,-.04,-.09,-.02,.03,.13], [
        (0,.84,0,0),(.15,1,.025,0),(.32,.96,.035,.014),(.41,.97,.02,0),
        (.61,.91,-.021,.015),(.80,.78,-.13,.095),(.91,.56,-.21,.14)
    ], -.10)
    stone(SHELF, (.52,-.21,.014), (.66,.48,.53), [.08,.12,.02,-.08,-.02,.08,.13,.11], [
        (0,.88,0,0),(.18,1.04,.045,0),(.38,.98,0,0),(.45,.88,-.04,.01),
        (.65,.87,-.09,.075),(.81,.59,-.20,.14)
    ], -.23)
    stone(SPALL, (-.59,-.43,0), (.44,.44,.35), [.05,.08,-.12,-.17,-.05,.05,.12,.07], [
        (0,.87,0,0),(.16,1.02,.04,0),(.51,.94,.10,.04),(.70,.80,.13,.11),(.90,.48,.20,.17)
    ], .12)
    stone(SPALL, (.60,.46,0), (.49,.31,.35), [.03,.14,.06,-.08,.04,.08,.14,-.04], [
        (0,.87,0,0),(.22,1.01,0,0),(.48,.87,-.08,.05),(.81,.50,-.21,.15)
    ], -.17)
    stone(SHELF, (.98,-.40,0), (.22,.25,.18), [.03,.14,.04,-.08,.02,.09,.14,.07], [
        (0,.89,0,0),(.21,1.02,0,0),(.56,.92,-.05,.02),(.91,.50,-.20,.14)
    ], -.4)

def variant_1():
    stone(SPALL,(-.31,.06,.02),(.55,.66,.95),[.01,.17,.16,.06,-.18,-.12,-.12,.14],[
        (0,.84,0,0),(.17,1.04,-.02,0),(.43,.97,-.05,.025),(.66,.80,-.10,.03),(.87,.60,-.01,.10)
    ],.23)
    stone(PLAN,(.42,-.01,0),(.58,.57,.80),[-.04,-.07,.04,.13,.10,-.18,-.11,-.074],[
        (0,.84,0,0),(.14,1.03,.02,0),(.36,1.04,-.05,0),(.45,.93,.035,-.02),(.69,.84,.19,-.025),(.87,.51,.26,.06)
    ],-.16)
    stone(SHELF,(-.08,-.52,0),(.45,.26,.28),[.18,.08,.04,-.07,.01,.04,.02,.08],[
        (0,.88,0,0),(.16,1,0,0),(.53,.95,.02,.015),(.83,.57,-.065,.11)
    ],.04)
    stone(SPALL,(.65,-.38,0),(.29,.37,.16),[.01,.09,.09,.05,.07,.09,-.02,.061],[
        (0,.82,0,0),(.18,1.02,0,0),(.56,.94,-.06,-.04),(.91,.54,-.13,.056)
    ],.15)

def variant_2():
    stone(SHELF,(.02,.14,0),(1.08,.66,.64),[.06,.08,.035,-.08,.02,.10,.16,.12],[
        (0,.95,0,0),(.19,1.02,0,0),(.48,.99,-.035,.008),(.58,.92,-.095,.038),(.88,.83,-.11,.066),(.94,.69,-.16,.14)
    ],-.21)
    stone(PLAN,(.32,.43,.08),(.54,.38,.83),[-.08,.04,-.08,.06,.13,.11,.092,.059],[
        (0,.84,0,0),(.15,1,.04,0),(.53,.94,.08,0),(.76,.78,.12,.03),(.91,.45,.17,.09)
    ],.09)
    stone(SPALL,(-.27,-.47,0),(.67,.32,.32),[.08,.04,.012,-.05,.10,.09,.10,.18],[
        (0,.91,0,0),(.19,1,0,.019),(.64,.88,.025,.09),(.77,.62,.24,.28)
    ],-.12)
    stone(SHELF,(-.90,.08,0),(.23,.28,.24),[.02,.14,.04,-.08,.02,.09,.14,.07],[
        (0,.79,0,0),(.21,1.03,0,0),(.56,.91,0,0),(.88,.54,-.11,.04)
    ],.2)

def make_variant(name, sculpt):
    vertices.clear()
    faces.clear()
    bpy.ops.object.select_all(action="DESELECT")
    sculpt()
    lo = [min(v[i] for v in vertices) for i in range(3)]
    hi = [max(v[i] for v in vertices) for i in range(3)]
    center = [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]]
    dims = (2.3,1.6,1.2)
    vertices[:] = [tuple((v[i]-center[i])*dims[i]/(hi[i]-lo[i]) for i in range(3)) for v in vertices]
    mesh = bpy.data.meshes.new("Fractured shore slate")
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
    bevel.width = .021
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
                v.co[i] = 1.06*v.co[i] - .072
    return obj


variants = [make_variant(name,sculpt) for name,sculpt in [
    ("shore-rock-shear",variant_0),("shore-rock-split",variant_1),("shore-rock-shelf",variant_2),
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
stone_mat = bpy.data.materials.new("Shore slate and damp mineral foot")
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
coarse, mineral, grain, fine = noise(3.1,3,.68),noise(15,2.5,.66),noise(52,2,.63),noise(113,2,.68)
x,y,z=xyz.outputs["X"],xyz.outputs["Y"],xyz.outputs["Z"]
fold=calc("ADD",calc("ADD",z,calc("MULTIPLY",x,.29)),calc("ADD",calc("MULTIPLY",y,.16),calc("MULTIPLY",coarse,.17)))
seam=calc("SUBTRACT",fold,calc("ADD",.41,calc("MULTIPLY",mineral,.07)))
seam_profile=ramp(calc("ABSOLUTE",seam),[(0,(.30,.34,.34)),(.018,(.68,.69,.66)),(.048,(1,1,1))])
breaks=ramp(noise(5.3,2,.62),[(0,(.1,.1,.1)),(.53,(.65,.65,.65)),(.75,(.95,.95,.95))])
dry=ramp(coarse,[(0,(.27,.25,.225)),(.42,(.39,.365,.325)),(.67,(.53,.505,.452)),(1,(.59,.55,.48))])
dry=mix(breaks,dry,seam_profile,"MULTIPLY")
flecks=ramp(calc("ADD",calc("MULTIPLY",mineral,.63),calc("MULTIPLY",grain,.37)),[(0,(.40,.43,.42)),(.48,(.89,.89,.85)),(.71,(1,.98,.92))])
dry=mix(.58,dry,flecks,"MULTIPLY")
vein=calc("SUBTRACT",fold,calc("ADD",.658,calc("MULTIPLY",mineral,.065)))
vein_mask=ramp(calc("ABSOLUTE",vein),[(0,(.65,.65,.65)),(.018,(.0,.0,.0))])
dry=mix(calc("MULTIPLY",vein_mask,calc("GREATER_THAN",coarse,.51)),dry,(.55,.54,.445,1))
water_height=calc("ADD",z,calc("MULTIPLY",noise(5.6,2,.68),.26))
damp=ramp(water_height,[(.040,(.65,.65,.65)),(.14,(.43,.43,.43)),(.37,(0,0,0))])
color=mix(damp,dry,(.176,.205,.187,1))
dry_rough=ramp(grain,[(0,(.77,.77,.77)),(1,(.96,.96,.96))])
rough=mix(damp,dry_rough,(.53,.53,.53,1))
bump=nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value=.35
bump.inputs["Distance"].default_value=.020
height=calc("ADD",calc("MULTIPLY",seam_profile,.19),calc("ADD",calc("MULTIPLY",grain,.52),calc("MULTIPLY",fine,.22)))
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

color_tex = bake("shore-slate-albedo",1024,"sRGB",color)
rough_tex = bake("shore-slate-roughness",1024,"Non-Color",rough)
normal_tex = bake("shore-slate-normal",1024,"Non-Color")
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

bpy.ops.export_scene.gltf(filepath=str(DEST/"shore-rock.glb"),export_format="GLB",
                         export_animations=False,export_normals=True,export_tangents=True)
for obj in variants:
    print("SHORE ROCK",obj.name,len(obj.data.polygons),"triangles",tuple(obj.dimensions),flush=True)
# Separate studio positions for editing the three variants in one .blend.
for obj,x in zip(variants,(-2.75,0,2.75)):
    obj.location.x=x
bpy.ops.wm.save_as_mainfile(filepath=str(DEST/"shore-rock.blend"))