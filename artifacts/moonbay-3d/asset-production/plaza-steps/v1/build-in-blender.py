"""Author the Moonbay plaza stairs facing the south approach."""
import math
import random
import sys
from pathlib import Path

import bpy

dest=Path(sys.argv[sys.argv.index("--")+1])
dest.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
rng=random.Random(391)
width,depth,rise=5.8,2.7,.6
tread=depth/5
parts=[]

def block(label,bounds,color,bevel):
    low,high=bounds
    vertices=[(x,y,z) for z in (low[2],high[2]) for y in (low[1],high[1]) for x in (low[0],high[0])]
    faces=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6)]
    data=bpy.data.meshes.new(label)
    data.from_pydata(vertices,[],faces)
    data.update()
    tint=data.color_attributes.new(name="Stone",type="FLOAT_COLOR",domain="POINT")
    for i,v in enumerate(data.vertices):
        tone=rng.uniform(.92,1.04)*(1.04 if v.co.z>low[2]+.002 else .93)
        tint.data[i].color=tuple(x*tone for x in color)+(1,)
    o=bpy.data.objects.new(label,data)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    modifier=o.modifiers.new("Worked edge","BEVEL")
    modifier.width=bevel
    modifier.segments=2
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    parts.append(o)

inner=(.64,.505,.353)
mortar=(.405,.313,.208)
for i in range(5):
    z=(i+1)*rise/5
    y=-depth/2+tread*i
    # A continuous inner course fills all the joints. Pocket seams sit only
    # a few millimetres below the stone tops and are safe to step across.
    block("Bedding course "+str(i+1),((-width/2+.009,y+.009,-.06),
          (width/2-.009,y+tread-.008,z-.009)),mortar,.006)
    ends=[-width/2,-width/2+.24]
    count=7 if i%2==0 else 8
    centre_width=width-.48
    for k in range(1,count):
        ends.append(-centre_width/2+centre_width*k/count+rng.uniform(-.106,.106))
    ends += [centre_width/2,width/2]
    for k,(left,right) in enumerate(zip(ends,ends[1:])):
        warm=1+rng.uniform(-.047,.043)
        color=tuple(v*warm for v in inner)
        if k==0 or k==len(ends)-2:color=(.57,.437,.278)
        # Bottom step faces negative Blender Y and positive glTF Z.
        # All five top elevations and edges match the walkable geometry.
        x0=left if k==0 else left+.006
        x1=right if k==len(ends)-2 else right-.006
        block("Limestone tread "+str(i+1)+"."+str(k+1),((x0,y,.12*i-.014 if i else -.06),
              (x1,y+tread-.007,z)),color,.013)

bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
steps=bpy.context.object
steps.name="plaza-steps"
steps.data.name="Treads, side stones and bedding"
steps.data.validate(clean_customdata=True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(78),island_margin=.010)
bpy.ops.object.mode_set(mode="OBJECT")

scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=2
scene.render.bake.margin=6
mat=bpy.data.materials.new("Warm plaza limestone")
mat.use_nodes=True
steps.data.materials.append(mat)
nodes,links=mat.node_tree.nodes,mat.node_tree.links
surface=nodes.get("Principled BSDF")
surface.inputs["Roughness"].default_value=.87
output=nodes.get("Material Output")
coords=nodes.new("ShaderNodeTexCoord")
vertex=nodes.new("ShaderNodeVertexColor")
vertex.layer_name="Stone"
def noise(scale,detail):
    n=nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value=scale
    n.inputs["Detail"].default_value=detail
    n.inputs["Roughness"].default_value=.67
    links.new(coords.outputs["Object"],n.inputs["Vector"])
    return n.outputs["Fac"]

pattern=nodes.new("ShaderNodeMixRGB")
pattern.blend_type="MULTIPLY"
pattern.inputs[0].default_value=.31
links.new(vertex.outputs["Color"],pattern.inputs[1])
color=nodes.new("ShaderNodeValToRGB")
color.color_ramp.elements[0].color=(.42,.38,.33,1)
color.color_ramp.elements[1].color=(1,.99,.93,1)
links.new(noise(6.2,3),color.inputs[0])
links.new(color.outputs[0],pattern.inputs[2])
bump=nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value=.32
bump.inputs["Distance"].default_value=.019
links.new(noise(63,2),bump.inputs["Height"])
links.new(bump.outputs["Normal"],surface.inputs["Normal"])

def bake(label,source=None):
    image=bpy.data.images.new(label,width=1024,height=1024,alpha=False)
    image.colorspace_settings.name="sRGB" if source is not None else "Non-Color"
    tex=nodes.new("ShaderNodeTexImage")
    tex.image=image
    nodes.active=tex
    if source is not None:
        emit=nodes.new("ShaderNodeEmission")
        links.new(source,emit.inputs[0])
        links.new(emit.outputs[0],output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT")
        nodes.remove(emit)
    else:
        links.new(surface.outputs[0],output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL",normal_space="TANGENT")
    image.filepath_raw=str(dest/(label+".png"))
    image.file_format="PNG"
    image.save()
    image.pack()
    return tex

base=bake("Plaza limestone albedo",pattern.outputs[0])
normal=bake("Plaza limestone normal")
for n in list(nodes):
    if n not in (base,normal,surface,output):
        nodes.remove(n)
links.new(base.outputs["Color"],surface.inputs["Base Color"])
n=nodes.new("ShaderNodeNormalMap")
links.new(normal.outputs["Color"],n.inputs["Color"])
links.new(n.outputs[0],surface.inputs["Normal"])
links.new(surface.outputs[0],output.inputs["Surface"])
for tex,pos in [(base,(-520,360)),(normal,(-520,80)),(n,(-240,80)),(surface,(30,355)),(output,(310,355))]:
    tex.location=pos

steps.data.calc_loop_triangles()
print("PLAZA",len(steps.data.loop_triangles),"triangles",tuple(steps.dimensions),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(dest/"plaza-steps.blend"))
bpy.ops.export_scene.gltf(filepath=str(dest/"plaza-steps.glb"),export_format="GLB",export_animations=False,export_tangents=True)
