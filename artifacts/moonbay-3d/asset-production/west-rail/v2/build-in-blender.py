"""Western bridge balustrade, aligned lengthwise in local X."""
import math
import sys
from pathlib import Path
import bpy
from array import array

out=Path(sys.argv[sys.argv.index("--")+1])
limestone=Path(sys.argv[sys.argv.index("--")+2])
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
parts=[]

stone=bpy.data.materials.new("Ivory cut stone")
stone.use_nodes=True
nt=stone.node_tree
bs=nt.nodes.get("Principled BSDF")
bs.inputs["Roughness"].default_value=.84
tex=nt.nodes.new("ShaderNodeTexImage")
tile=bpy.data.images.load(str(limestone),check_existing=True)
iw,ih=tile.size[:]
pixels=array("f",[0])*(iw*ih*4)
tile.pixels.foreach_get(pixels)
for i in range(0,len(pixels),4):
    for k,tone in enumerate((.85,.759,.63)):
        pixels[i+k]*=tone
tex.image=bpy.data.images.new("Warm-honed bridge limestone",iw,ih,alpha=False)
tex.image.pixels.foreach_set(pixels)
tex.image.filepath_raw=str(out/"bridge-limestone.png")
tex.image.file_format="PNG"
tex.image.save()
tex.image.pack()
tex.location=(-410,320)
nt.links.new(tex.outputs["Color"],bs.inputs["Base Color"])
glaze=bpy.data.materials.new("Sea-glass green glaze")
glaze.use_nodes=True
p=glaze.node_tree.nodes.get("Principled BSDF")
p.inputs["Base Color"].default_value=(.079,.39,.32,1)
p.inputs["Roughness"].default_value=.38
p.inputs["Metallic"].default_value=.12

def slab(name,rings):
    # Extruded moulding with a constant low bearing along all local X.
    vertices=[(x,y,z) for x in (-1.275,1.275) for y,z in rings]
    l=len(rings)
    faces=[tuple(reversed(range(l))),tuple(range(l,2*l))]
    for i in range(l):
        a=i;b=(i+1)%l
        faces.append((a,b,b+l,a+l))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    mesh.materials.append(stone)
    ob=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(ob)
    parts.append(ob)
    # Micro-softened long moulding highlights at outdoor viewing distances.
    ob.select_set(True)
    bpy.context.view_layer.objects.active=ob
    mod=ob.modifiers.new("Worn long stone edge","BEVEL")
    mod.width=.0068
    mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    ob.select_set(False)

slab("Continuous limestone foot",[(-.172,-.033),(.172,-.033),(.185,-.009),(.180,.035),(.154,.065),(.131,.086),(-.131,.086),(-.154,.065),(-.180,.035),(-.185,-.009)])
slab("Rounded stone hand rail",[(-.125,.601),(.125,.601),(.142,.621),(.145,.656),(.130,.684),(.093,.70),(-.093,.70),(-.130,.684),(-.145,.656),(-.142,.621)])

for i in range(6):
    x=2.55*((i+.5)/6-.5)
    dims=[(.126,.125,.065),(.137,.128,.083),(.124,.118,.119),(.092,.088,.15),
          (.074,.071,.18),(.064,.062,.218),(.073,.07,.255),(.099,.095,.307),
          (.105,.102,.349),(.089,.085,.409),(.07,.068,.46),(.082,.077,.512),
          (.109,.103,.552),(.13,.122,.58),(.132,.122,.615)]
    num=14
    vertices=[]
    for rx,ry,h in dims:
        for j in range(num):
            a=j*math.tau/num
            vertices.append((x+rx*math.cos(a),ry*math.sin(a),h))
    faces=[tuple(reversed(range(num)))]
    slots=[0]
    for k in range(len(dims)-1):
        for j in range(num):
            a=k*num+j;b=k*num+(j+1)%num
            faces.append((a,b,b+num,a+num))
            slots.append(1 if 3<=k<=11 else 0)
    faces.append(tuple(range(len(vertices)-num,len(vertices))))
    slots.append(0)
    mesh=bpy.data.meshes.new("Turned baluster")
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    mesh.materials.append(stone)
    mesh.materials.append(glaze)
    for poly,idx in zip(mesh.polygons,slots):
        poly.material_index=idx
        poly.use_smooth=True
    ob=bpy.data.objects.new("Turned baluster",mesh)
    bpy.context.collection.objects.link(ob)
    parts.append(ob)

for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
ob=bpy.context.object
ob.name="west-rail"
me=ob.data
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
uv=me.uv_layers.new(name="Stone projection").data
for poly in me.polygons:
    nx,ny,nz=map(abs,poly.normal)
    for idx in poly.loop_indices:
        x,y,z=me.vertices[me.loops[idx].vertex_index].co
        if nz>=max(nx,ny):a,b=x,y
        elif nx>ny:a,b=y,z
        else:a,b=x,z
        uv[idx].uv=(a*.74,b*.74)
me.validate(clean_customdata=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/"west-rail.blend"))
bpy.ops.export_scene.gltf(filepath=str(out/"west-rail.glb"),export_format="GLB",export_animations=False,export_normals=True)
