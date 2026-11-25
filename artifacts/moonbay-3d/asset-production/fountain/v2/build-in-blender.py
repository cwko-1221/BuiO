"""Build the Moonbay limestone basin and eight bronze spouts."""
import math
import random
import sys
import numpy as np
from pathlib import Path

import bpy

dest=Path(sys.argv[sys.argv.index("--")+1])
dest.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
rng=random.Random(2037)
vertices,faces,indices,tints,smooth=[],[],[],[],[]

def color_scale(c,f):
    return tuple(min(1,v*f) for v in c)
def v(point,c):
    vertices.append(point)
    tints.append((*c,1))
    return len(vertices)-1
def face(c,material,soft):
    faces.append(c)
    indices.append(material)
    smooth.append(soft)

LIME=(.71,.56,.39)
WET=(.365,.345,.265)
PEDESTAL=(.63,.51,.35)
MORTAR=(.43,.351,.236)
BRONZE=(.38,.227,.082)
PATINA=(.21,.155,.083)

def ring(profile,segments=100,center=(0,0)):
    # Profile is (radius, elevation, color, material slot).
    loops=[]
    for radius,z,c,slot in profile:
        indices_row=[]
        for i in range(segments):
            a=i*math.tau/segments
            tint=color_scale(c,1+.028*math.sin(a*3+.7)+.015*math.sin(a*11+z))
            indices_row.append(v((center[0]+radius*math.cos(a),center[1]+radius*math.sin(a),z),tint))
        loops.append(indices_row)
    for i,lo in enumerate(loops):
        hi=loops[(i+1)%len(loops)]
        for j in range(segments):
            k=(j+1)%segments
            face((lo[j],lo[k],hi[k],hi[j]),profile[i][3],True)

# Stone foundation, damp inner belly, lip and a structural back to the wedges.
ring([(4.22,.066,WET,1),(4.65,-.05,MORTAR,0),(4.76,-.045,MORTAR,0),
      (4.80,.049,PEDESTAL,0),(4.80,.099,PEDESTAL,0),(4.758,.137,PEDESTAL,0),
      (4.657,.161,PEDESTAL,0),(4.657,.521,MORTAR,0),(4.702,.547,MORTAR,0),
      (4.725,.58,MORTAR,0),(4.713,.627,PEDESTAL,0),(4.668,.68,PEDESTAL,0),
      (4.315,.68,PEDESTAL,0),(4.261,.624,WET,1),(4.229,.574,WET,1),
      (4.228,.49,WET,1),(4.236,.443,WET,1),(4.235,.311,WET,1),(4.222,.20,WET,1)])

# The cap is accurately coursed limestone. The bed beneath receives each
# radial gap, while the inward half has a narrower mineral-darkened edge.
cap_profile=[
    (4.702,.548,PEDESTAL),(4.758,.556,PEDESTAL),(4.785,.589,LIME),
    (4.784,.627,LIME),(4.751,.671,LIME),(4.712,.693,LIME),
    (4.667,.705,LIME),(4.49,.706,LIME),(4.359,.702,color_scale(LIME,.965)),
    (4.318,.690,color_scale(LIME,.93)),(4.276,.663,color_scale(LIME,.91)),
    (4.252,.629,color_scale(PEDESTAL,.94)),(4.245,.591,color_scale(PEDESTAL,.90)),
    (4.275,.57,PEDESTAL),(4.319,.595,PEDESTAL),(4.67,.550,PEDESTAL)
]
def capstone(a0,a1,tone):
    rows=[]
    subdivisions=6
    for k,(r,z,shade) in enumerate(cap_profile):
        row=[]
        for j in range(subdivisions+1):
            f=j/subdivisions
            a=a0+(a1-a0)*f
            taper=1 if j not in (0,subdivisions) else .989
            rad=r*taper+4.55*(1-taper)
            zfit=z if j not in (0,subdivisions) else z-.007
            row.append(v((rad*math.cos(a),rad*math.sin(a),zfit),
                         color_scale(shade,tone*(.992+.016*math.sin(a*32+k*.4)))))
        rows.append(row)
    for k,lo in enumerate(rows):
        hi=rows[(k+1)%len(rows)]
        for j in range(subdivisions):
            face((lo[j],lo[j+1],hi[j+1],hi[j]),1 if 10<=k<=12 else 0,True)
    face(tuple(row[0] for row in rows),0,False)
    face(tuple(reversed([row[-1] for row in rows])),0,False)

cap_count=27
cap_angles=[.065+(i+rng.uniform(-.17,.17))*math.tau/cap_count for i in range(cap_count)]
for i,a in enumerate(cap_angles):
    b=cap_angles[i+1] if i+1<len(cap_angles) else cap_angles[0]+math.tau
    capstone(a+.0011,b-.0011,rng.uniform(.94,1.055))

def wedge(angle0,angle1,delta=1):
    loops=[]
    profile=[(4.629,.149),(4.654,.149),(4.686,.178),(4.692,.219),
             (4.681,.483),(4.668,.52),(4.621,.536)]
    for j,(r,z) in enumerate(profile):
        band=[]
        for i in range(6):
            a=angle0+(angle1-angle0)*i/5
            band.append(v((r*math.cos(a),r*math.sin(a),z),
                          color_scale(LIME,delta*(.95+.025*math.sin(j*1.9))*(.96+.06*i/5))))
        loops.append(band)
    for j in range(len(loops)):
        lo,hi=loops[j],loops[(j+1)%len(loops)]
        for i in range(5):face((lo[i],lo[i+1],hi[i+1],hi[i]),0,True)
    face(tuple(row[0] for row in loops),0,False)
    face(tuple(row[-1] for row in reversed(loops)),0,False)

count=42
seams=[(i+rng.uniform(-.14,.14))*math.tau/count for i in range(count)]
for i,a in enumerate(seams):
    b=seams[i+1] if i+1<len(seams) else seams[0]+math.tau
    wedge(a+.0018,b-.0018,rng.uniform(.89,1.08))

# The rotor of the fountain is a stone plinth and one cast upper crown. The
# moon's footing seats on the level face at model Z=1.30.
ring([(.007,.104,PEDESTAL,0),(1.27,.105,WET,1),(1.28,.163,WET,1),
      (1.215,.206,WET,1),(1.10,.29,WET,1),(1.014,.48,WET,1),
      (.980,.544,PEDESTAL,0),(.967,.63,PEDESTAL,0),(.998,.722,PEDESTAL,0),
      (1.104,.818,PEDESTAL,0),(1.207,.896,PEDESTAL,0),(1.214,.938,PEDESTAL,0),
      (1.184,.985,LIME,0),(1.112,1.021,LIME,0),(1.085,1.119,PEDESTAL,0),
      (1.104,1.189,LIME,0),(1.259,1.213,LIME,0),(1.286,1.247,LIME,0),
      (1.248,1.278,LIME,0),(1.188,1.3,LIME,0),(.007,1.3,LIME,0)],72)

def nozzle(angle):
    dx,dy=math.cos(angle),math.sin(angle)
    tu=(-dy,dx)
    n=18
    loops=[]
    # The bore surrounds the water curve that begins at radius 1.2576 and
    # height 1.1635. It remains open when seen from near the water.
    profile=[(1.060,.091,1.,BRONZE,2),(1.115,.103,1.,BRONZE,2),
             (1.160,.087,1.08,BRONZE,2),(1.213,.067,1.08,BRONZE,2),
             (1.245,.071,1.1,BRONZE,2),(1.272,.063,1.12,BRONZE,2),
             (1.274,.036,1.31,PATINA,3),(1.234,.035,1.32,PATINA,3)]
    for radius,r,aspect,c,slot in profile:
        row=[]
        for j in range(n):
            a=j*math.tau/n
            x=radius*dx+tu[0]*math.cos(a)*r
            y=radius*dy+tu[1]*math.cos(a)*r
            row.append(v((x,y,1.164+math.sin(a)*r*aspect),c))
        loops.append(row)
    for j,lo in enumerate(loops):
        hi=loops[(j+1)%len(loops)]
        for i in range(n):
            k=(i+1)%n
            face((lo[i],lo[k],hi[k],hi[i]),profile[j][4],True)

for i in range(8):
    nozzle(i*math.tau/8)

mesh=bpy.data.meshes.new("Limestone masonry and bronze bores")
mesh.from_pydata(vertices,[],faces)
mesh.update()
colors=mesh.color_attributes.new(name="Tint",type="FLOAT_COLOR",domain="POINT")
for i,c in enumerate(tints):
    colors.data[i].color=c
for name,rough,metal in [("Dry honed limestone",.85,0),("Wet mineral-darkened limestone",.55,0),("Weathered cast bronze",.43,.54),("Bronze shaded bore",.59,.36)]:
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    surface=mat.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Roughness"].default_value=rough
    surface.inputs["Metallic"].default_value=metal
    tint=mat.node_tree.nodes.new("ShaderNodeVertexColor")
    tint.layer_name="Tint"
    tint.location=(-340,330)
    mat.node_tree.links.new(tint.outputs["Color"],surface.inputs["Base Color"])
    mesh.materials.append(mat)
for poly,slot,soft in zip(mesh.polygons,indices,smooth):
    poly.material_index=slot
    poly.use_smooth=soft
obj=bpy.data.objects.new("fountain-basin",mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
mesh.validate(clean_customdata=True)
mesh.calc_loop_triangles()
print("FOUNTAIN",len(mesh.loop_triangles),tuple(obj.dimensions),flush=True)
# A small repeatable neutral limestone texture combines with the geometric
# dry/wet vertex tint. Sampling in world-model metres keeps the pores sized.
uv=mesh.uv_layers.new(name="Stone projection").data
for poly in mesh.polygons:
    nx,ny,nz=map(abs,poly.normal)
    for idx in poly.loop_indices:
        x,y,z=mesh.vertices[mesh.loops[idx].vertex_index].co
        if nz>=max(nx,ny):
            a,b=x,y
        elif nx>ny:
            a,b=y,z
        else:
            a,b=x,z
        uv[idx].uv=(a*.76,b*.76)

size=384
rand=np.random.default_rng(77012)
def tile_noise(cells):
    sample=rand.random((cells,cells))
    t=np.arange(size,dtype=np.float64)*cells/size
    index=t.astype(int)
    fract=(t-index)
    fract=fract*fract*(3-2*fract)
    f,g=fract[None,:],fract[:,None]
    i,j=index[None,:],index[:,None]
    return (sample[j,i]*(1-f)*(1-g)+sample[j,(i+1)%cells]*f*(1-g)
           +sample[(j+1)%cells,i]*(1-f)*g+sample[(j+1)%cells,(i+1)%cells]*f*g)
yy,xx=np.ogrid[:size,:size]
pores=np.zeros((size,size))
for _ in range(330):
    px,py=rand.uniform(0,size,2)
    dx=(xx-px+size*.5)%size-size*.5
    dy=(yy-py+size*.5)%size-size*.5
    r=rand.uniform(.36,1.35)
    pores+=np.exp(-(dx*dx+dy*dy)/(r*r))*rand.uniform(.10,.24)
tone=np.clip(.865+.073*tile_noise(7)+.08*tile_noise(28)+.036*tile_noise(62)-pores,.64,1)
image=bpy.data.images.new("Honed limestone pores",size,size,alpha=False)
image.colorspace_settings.name="sRGB"
pixels=np.ones((size,size,4),dtype=np.float32)
pixels[:,:,0]=tone
pixels[:,:,1]=tone*.995
pixels[:,:,2]=tone*.983
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw=str(dest/"limestone-pores.png")
image.file_format="PNG"
image.save()
image.pack()
for mat in mesh.materials[:2]:
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    tex=nodes.new("ShaderNodeTexImage")
    tex.image=image
    tex.label="Honed limestone pores"
    tex.location=(-520,110)
    links.new(tex.outputs["Color"],nodes.get("Principled BSDF").inputs["Base Color"])

bpy.ops.export_scene.gltf(filepath=str(dest/"fountain.glb"),export_format="GLB",
                         export_animations=False,export_normals=True,export_vertex_color="ACTIVE")

# Save the editable Blender material with the same multiply used by glTF.
for mat in mesh.materials[:2]:
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    tint=next(n for n in nodes if n.type=="VERTEX_COLOR")
    tex=next(n for n in nodes if n.type=="TEX_IMAGE")
    mix=nodes.new("ShaderNodeMixRGB")
    mix.blend_type="MULTIPLY"
    mix.inputs[0].default_value=1
    mix.location=(-230,250)
    links.new(tex.outputs["Color"],mix.inputs[1])
    links.new(tint.outputs["Color"],mix.inputs[2])
    links.new(mix.outputs["Color"],nodes.get("Principled BSDF").inputs["Base Color"])
bpy.ops.wm.save_as_mainfile(filepath=str(dest/"fountain.blend"))
