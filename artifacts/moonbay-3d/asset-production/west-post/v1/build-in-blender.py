"""A dressed limestone terminal for the western bridge handrail."""
import math
import sys
from pathlib import Path
import bpy

out=Path(sys.argv[sys.argv.index("--")+1])
stone_tile=Path(sys.argv[sys.argv.index("--")+2])
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

V,F,M=[],[],[]
def shape(rings,nt=12):
    rows=[]
    for z,r,d,slot in rings:
        row=[]
        for i in range(nt):
            angle=i*math.tau/nt
            ca,sa=math.cos(angle),math.sin(angle)
            e=.29 if d else 1
            p=(r*math.copysign(abs(ca)**e,ca),r*math.copysign(abs(sa)**e,sa),z)
            row.append(len(V))
            V.append(p)
        rows.append(row)
    for k,lo in enumerate(rows[:-1]):
        hi=rows[k+1]
        for i in range(nt):
            j=(i+1)%nt
            F.append((lo[i],lo[j],hi[j],hi[i]))
            M.append(rings[k][3])
    F.extend((tuple(reversed(rows[0])),tuple(rows[-1])))
    M.extend((rings[0][3],rings[-1][3]))

shape([(-.032,.228,True,0),(-.007,.246,True,0),(.035,.246,True,0),
       (.072,.225,True,0),(.124,.214,True,0),(.147,.191,True,0),
       (.190,.179,True,0),(.679,.179,True,0),(.712,.198,True,0),
       (.740,.213,True,0),(.766,.220,True,0),(.802,.220,True,0),
       (.823,.193,True,0),(.833,.156,True,1),
       (.861,.144,False,0),(.892,.148,False,0),(.922,.121,False,0),
       (.953,.094,False,0),(.980,.053,False,0),(.991,.014,False,0)],16)

mesh=bpy.data.meshes.new("Limestone post and sea-glaze collar")
mesh.from_pydata(V,[],F)
mesh.update()
image=bpy.data.images.load(str(stone_tile),check_existing=True)
image.pack()
stone=bpy.data.materials.new("Warm bridge limestone")
stone.use_nodes=True
n=stone.node_tree.nodes
l=stone.node_tree.links
tex=n.new("ShaderNodeTexImage")
tex.image=image
tex.location=(-330,230)
shader=n.get("Principled BSDF")
shader.inputs["Roughness"].default_value=.84
l.new(tex.outputs["Color"],shader.inputs["Base Color"])
accent=bpy.data.materials.new("Sea-glass collar")
accent.use_nodes=True
m=accent.node_tree.nodes.get("Principled BSDF")
m.inputs["Base Color"].default_value=(.08,.34,.28,1)
m.inputs["Roughness"].default_value=.46
m.inputs["Metallic"].default_value=.09
mesh.materials.append(stone)
mesh.materials.append(accent)
for i,poly in enumerate(mesh.polygons):
    poly.material_index=M[i]
    poly.use_smooth=poly.center.z>.819 if poly.center.length else i>=14*16
ob=bpy.data.objects.new("west-post",mesh)
bpy.context.collection.objects.link(ob)
bpy.context.view_layer.objects.active=ob
ob.select_set(True)
modifier=ob.modifiers.new("Honed edge highlights","BEVEL")
modifier.width=.007
modifier.segments=2
modifier.limit_method="ANGLE"
modifier.angle_limit=.43
bpy.ops.object.modifier_apply(modifier=modifier.name)
mesh=ob.data
uv=mesh.uv_layers.new(name="Stone projection").data
for poly in mesh.polygons:
    nx,ny,nz=map(abs,poly.normal)
    for idx in poly.loop_indices:
        x,y,z=mesh.vertices[mesh.loops[idx].vertex_index].co
        if nz>=max(nx,ny):a,b=x,y
        elif nx>ny:a,b=y,z
        else:a,b=x,z
        uv[idx].uv=(a*.74,b*.74)
mesh.validate(clean_customdata=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/"west-post.blend"))
bpy.ops.export_scene.gltf(filepath=str(out/"west-post.glb"),export_format="GLB",export_animations=False,
                         export_normals=True)
