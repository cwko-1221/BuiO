"""Sculpt and export the Moonbay broadleaf tree in Blender."""
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

dest=Path(sys.argv[sys.argv.index("--")+1])
dest.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
rng=random.Random(61728)

class Part:
    def __init__(self,name):
        self.name=name
        self.verts=[]
        self.faces=[]
        self.colors=[]
        self.flat=[]
    def vertex(self,p,c):
        self.verts.append(tuple(p))
        self.colors.append((*c,1))
        return len(self.verts)-1
    def face(self,index,flat=False):
        self.faces.append(index)
        self.flat.append(flat)
    def finish(self,mat):
        data=bpy.data.meshes.new(self.name)
        data.from_pydata(self.verts,[],self.faces)
        data.update()
        rgba=data.color_attributes.new(name="Tint",type="FLOAT_COLOR",domain="POINT")
        for i,tint in enumerate(self.colors):
            rgba.data[i].color=tint
        for poly,flat in zip(data.polygons,self.flat):
            poly.use_smooth=not flat
        data.materials.append(mat)
        obj=bpy.data.objects.new(self.name,data)
        bpy.context.collection.objects.link(obj)
        return obj

bark=Part("Trunk, branches and root flare")
crown=Part("Leaf masses and sprigs")

def mix(a,b,f):
    return tuple(l*(1-f)+r*f for l,r in zip(a,b))

def branch(points,radii,sides=9,flared=False):
    path=[Vector(p) for p in points]
    rings=[]
    turns=[.88+.23*rng.random() for _ in range(sides)]
    groove=[.79+.31*rng.random() for _ in range(sides)]
    for i,p in enumerate(path):
        d=(path[min(len(path)-1,i+1)]-path[max(0,i-1)]).normalized()
        X=d.cross(Vector((0,1,0))).normalized()
        Y=d.cross(X)
        ring=[]
        for j in range(sides):
            a=math.tau*j/sides
            rr=radii[i]*turns[j]*(1.22 if flared and i==0 and j%3==0 else 1)
            v=p+rr*(X*math.cos(a)+Y*math.sin(a))
            v.z=max(-.06,v.z)
            tone=groove[j]*(.93+.13*rng.random())
            base=(.23,.128,.070) if i<2 else (.28,.156,.084)
            ring.append(bark.vertex(v,tuple(tone*x for x in base)))
        rings.append(ring)
    for lo,hi in zip(rings,rings[1:]):
        for j in range(sides):
            k=(j+1)%sides
            bark.face((lo[j],lo[k],hi[k],hi[j]))
    bark.face(tuple(reversed(rings[0])))
    bark.face(tuple(rings[-1]))

branch([(0,0,0),(.01,0,.22),(.06,-.10,.67),(.01,-.07,1.32),(-.09,.025,2.0),
        (-.03,.08,2.58),(.14,.12,3.10),(.05,.31,3.7),(.12,.34,4.3),(.12,.50,4.85)],
       [.32,.31,.248,.211,.175,.136,.11,.075,.047,.012],13,True)
for i,(x,y) in enumerate([(-.53,-.18),(-.38,.45),(.48,.34),(.29,-.52),(.51,-.19)]):
    branch([(x,y,0),(x*.70,y*.67,.08),(x*.36,y*.31,.21),(.05,0,.46)],
           [.035,.12,.15,.13],7)

# Each scaffold has a distinct crook. Negative space remains below the crown.
boughs=[
 ([(.01,-.06,1.42),(-.33,-.22,2.17),(-.85,-.32,2.79),(-1.31,-.52,3.25),(-1.69,-.61,3.8),(-1.93,-.48,4.18)],[.137,.132,.098,.067,.036,.013]),
 ([(.02,.04,2.02),(.4,-.24,2.55),(.87,-.57,2.94),(1.28,-.76,3.51),(1.57,-.66,4.15)],[.124,.113,.084,.056,.018]),
 ([(-.06,.10,2.14),(-.46,.63,2.77),(-.72,1.08,3.37),(-1.04,1.44,3.99)],[.13,.102,.061,.018]),
 ([(.03,.11,2.51),(.56,.52,2.98),(1.08,.97,3.32),(1.49,1.24,3.8)],[.109,.102,.059,.017]),
 ([(.12,-.04,2.75),(.24,-.61,3.08),(.23,-1.07,3.53),(.15,-1.40,3.95)],[.086,.071,.048,.013]),
 ([(.08,.24,3.01),(.14,.72,3.55),(.38,1.04,4.12),(.48,1.40,4.43)],[.084,.070,.043,.013]),
 ([(.07,.18,3.38),(.36,.15,3.79),(.81,-.04,4.29),(1.14,.03,4.64)],[.072,.059,.035,.012]),
]
for points,radii in boughs:
    branch(points,radii)
    mid=Vector(points[-3])
    end=Vector(points[-1])
    s=1 if end.x<0 else -1
    twig=end*.6+mid*.4+Vector((s*.21,rng.uniform(-.55,.55),.35))
    leaf_end=twig+Vector((s*.14,rng.uniform(-.28,.28),.48))
    branch([mid,mid.lerp(twig,.54),twig,leaf_end],[.047,.042,.025,.009],7)

FOLIAGE_LOW=(.043,.105,.042)
FOLIAGE_HIGH=(.342,.445,.095)
def tint(z,shade):
    f=max(.03,min(.97,(z-2.65)/3.1*.53+shade*.32))
    return mix(FOLIAGE_LOW,FOLIAGE_HIGH,f)

def clump(origin,extent,phase,lean):
    # Shallow irregular lobes taper up into a leaf plane and overhang into a ragged skirt.
    pos=Vector(origin)
    sections=[(-.64,.20),(-.48,.75),(-.10,1),(.28,.91),(.69,.69),(.91,.36)]
    rings=[]
    n=17
    for k,(height,radius) in enumerate(sections):
        ring=[]
        for j in range(n):
            q=math.tau*j/n
            a=q+k*.098+phase
            r=radius*(1+.18*math.sin(4*a+phase)+.129*math.sin(7*a-k*.61)+.032*rng.random())
            xx=math.cos(a)*extent[0]*r
            yy=math.sin(a)*extent[1]*r
            zz=(height+.16*math.sin(5*a+height)*r+.10*(rng.random()-.5))*extent[2]
            p=pos+Vector((xx+lean[0]*height,yy+lean[1]*height,zz))
            shade=.15+.56*(height+.64)/1.55+rng.uniform(-.15,.15)
            ring.append(crown.vertex(p,tint(p.z,shade)))
        rings.append(ring)
    for lo,hi in zip(rings,rings[1:]):
        for j in range(n):
            k=(j+1)%n
            crown.face((lo[j],lo[k],hi[k],hi[j]))
    a=crown.vertex(pos+Vector((0,0,-.71*extent[2])),tint(pos.z-.6,.1))
    b=crown.vertex(pos+Vector((lean[0],lean[1],.96*extent[2])),tint(pos.z+.7,.72))
    for j in range(n):
        k=(j+1)%n
        crown.face((a,rings[0][k],rings[0][j]))
        crown.face((b,rings[-1][j],rings[-1][k]))
    return rings

patches=[
 ((-1.80,-.22,4.16),(.88,.69,.55),.45,(-.15,.11)),
 ((-1.19,-1.03,3.88),(.64,.61,.44),1.26,(.04,-.08)),
 ((-1.13,.71,4.63),(.72,.77,.59),.25,(-.09,.11)),
 ((-.83,1.61,4.19),(.62,.64,.43),2.43,(-.15,.13)),
 (( .16,.52,5.02),(.82,.73,.57),.62,(.05,.12)),
 (( .82,.98,4.60),(.71,.61,.42),1.82,(.12,.05)),
 ((-.47,.02,4.53),(.61,.62,.44),2.26,(-.03,.08)),
 (( .14,-1.51,4.10),(.76,.60,.50),.05,(.17,-.09)),
 ((1.08,-.82,3.95),(.69,.60,.42),1.76,(.15,.06)),
 ((1.83,-.44,4.48),(.83,.64,.46),2.92,(.06,.11)),
 ((1.50,1.39,4.13),(.77,.64,.49),.54,(.15,.02)),
 (( .75,.01,4.62),(.67,.58,.45),2.77,(.05,-.14)),
]

def blade(base,forward,size,light):
    side=Vector((-forward.y,forward.x,rng.uniform(-.6,.6))).normalized()
    cross=side.cross(forward).normalized()
    width=size*rng.uniform(.21,.35)
    peak=base+forward*size*.46+cross*size*.15
    profile=[base,base+forward*size*.36+side*width,base+forward*size*.73+side*width*.65,
             base+forward*size,base+forward*size*.69-side*width*.61,base+forward*size*.36-side*width]
    indices=[crown.vertex(v,tint(v.z,light+rng.uniform(-.11,.12))) for v in profile]
    middle=crown.vertex(peak,tint(peak.z,light+.08))
    for j in range(6):
        crown.face((indices[j],indices[(j+1)%6],middle),True)

for patch,(pose,size,angle,lean) in enumerate(patches):
    rings=clump(pose,size,angle,lean)
    center=Vector(pose)
    for i in range(12):
        # The root is pushed into the actual lobe mesh at a ring vertex.
        # Both the underside and the outer contour remain supported.
        tier=2+(i+patch)%2
        surface=Vector(crown.verts[rings[tier][(i*7+patch*3)%len(rings[tier])]])
        outward=(surface-center).normalized()
        side=Vector((-outward.y,outward.x,0)).normalized()
        root=surface-outward*.17
        light=rng.uniform(.38,.87)
        for j,spread in enumerate((-.67,.59,-.25,.32) if i%3==0 else (-.58,.44,.08)):
            base=root+outward*(j*.019)
            tilt=Vector((0,0,rng.uniform(-.47,.52)))
            forward=(outward+side*spread+tilt).normalized()
            blade(base,forward,rng.uniform(.24,.46),light+j*.034)

parts=[bark,crown]
all_verts=[v for p in parts for v in p.verts]
lo=[min(v[k] for v in all_verts) for k in range(3)]
hi=[max(v[k] for v in all_verts) for k in range(3)]
dims=(5.1,4.7,5.55)
origin=((lo[0]+hi[0])*.5,(lo[1]+hi[1])*.5,lo[2])
# Keep the trunk centered on the collision pivot. The canopy has a centered
# footprint yet retains a height-staggered, asymmetric mass.
for p in parts:
    p.verts=[tuple((v[k]-origin[k])*dims[k]/(hi[k]-lo[k]) for k in range(3)) for v in p.verts]

def material(name,rough,metal=0):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bs=mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Roughness"].default_value=rough
    bs.inputs["Metallic"].default_value=metal
    bs.inputs["Specular IOR Level"].default_value=.31
    v=mat.node_tree.nodes.new("ShaderNodeVertexColor")
    v.layer_name="Tint"
    v.location=(-360,300)
    mat.node_tree.links.new(v.outputs["Color"],bs.inputs["Base Color"])
    return mat

trunk=bark.finish(material("Warm coastal bark",.89))
leaves=crown.finish(material("Olive and spring leaf",.78))
# Fuse intersections into one surface, then decimate before UV layout.
bpy.context.view_layer.objects.active=trunk
trunk.select_set(True)
trunk.data.remesh_voxel_size=.034
bpy.ops.object.voxel_remesh()
for poly in trunk.data.polygons:
    poly.use_smooth=True
smooth=trunk.modifiers.new("Rounded crotches and root transitions","SMOOTH")
smooth.factor=.79
smooth.iterations=5
bpy.ops.object.modifier_apply(modifier=smooth.name)
simplify=trunk.modifiers.new("Runtime bark topology","DECIMATE")
simplify.ratio=min(1,3150/(2*len(trunk.data.polygons)))
bpy.ops.object.modifier_apply(modifier=simplify.name)
trunk.data.validate(verbose=True,clean_customdata=True)
trunk.data.update()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(77), island_margin=.026)
bpy.ops.object.mode_set(mode="OBJECT")

scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=2
scene.render.bake.margin=8
mat=trunk.data.materials[0]
nodes,links=mat.node_tree.nodes,mat.node_tree.links
surface=nodes.get("Principled BSDF")
output=nodes.get("Material Output")
for n in list(nodes):
    if n not in (surface,output):
        nodes.remove(n)
coords=nodes.new("ShaderNodeTexCoord")
axis=nodes.new("ShaderNodeVectorMath")
axis.operation="MULTIPLY"
axis.inputs[1].default_value=(4.1,4.1,.34)
links.new(coords.outputs["Object"],axis.inputs[0])
grain=nodes.new("ShaderNodeTexNoise")
grain.inputs["Scale"].default_value=4.3
grain.inputs["Detail"].default_value=2.4
grain.inputs["Roughness"].default_value=.61
links.new(axis.outputs["Vector"],grain.inputs["Vector"])
ramp=nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.interpolation="EASE"
for i,(pos,c) in enumerate([(.16,(.062,.040,.028)),(.72,(.215,.130,.078)),(.43,(.124,.076,.045))]):
    el=ramp.color_ramp.elements[i] if i<2 else ramp.color_ramp.elements.new(pos)
    el.position=pos
    el.color=(*c,1)
links.new(grain.outputs["Fac"],ramp.inputs[0])
bump=nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value=.37
bump.inputs["Distance"].default_value=.023
links.new(grain.outputs["Fac"],bump.inputs["Height"])
links.new(bump.outputs[0],surface.inputs["Normal"])

def bake(label,signal=None):
    img=bpy.data.images.new(label,width=512,height=512,alpha=False)
    img.colorspace_settings.name="sRGB" if signal is not None else "Non-Color"
    tex=nodes.new("ShaderNodeTexImage")
    tex.image=img
    nodes.active=tex
    if signal is not None:
        emission=nodes.new("ShaderNodeEmission")
        links.new(signal,emission.inputs["Color"])
        links.new(emission.outputs[0],output.inputs["Surface"])
        bpy.ops.object.bake(type="EMIT")
        nodes.remove(emission)
    else:
        links.new(surface.outputs[0],output.inputs["Surface"])
        bpy.ops.object.bake(type="NORMAL",normal_space="TANGENT")
    img.filepath_raw=str(dest/(label+".png"))
    img.file_format="PNG"
    img.save()
    img.pack()
    return tex

albedo=bake("Coastal bark color",ramp.outputs["Color"])
normal=bake("Coastal bark normal")
for n in list(nodes):
    if n not in (albedo,normal,surface,output):
        nodes.remove(n)
links.new(albedo.outputs["Color"],surface.inputs["Base Color"])
normal_map=nodes.new("ShaderNodeNormalMap")
links.new(normal.outputs["Color"],normal_map.inputs["Color"])
links.new(normal_map.outputs[0],surface.inputs["Normal"])
links.new(surface.outputs[0],output.inputs["Surface"])
for graph,xy in [(albedo,(-500,400)),(normal,(-500,50)),(normal_map,(-220,50)),(surface,(20,400)),(output,(330,400))]:
    graph.location=xy

parent=bpy.data.objects.new("canopy",None)
bpy.context.collection.objects.link(parent)
leaves.parent=parent
for o in (trunk,leaves):
    o.data.calc_loop_triangles()
    print(o.name,len(o.data.loop_triangles),"triangles")
bpy.ops.wm.save_as_mainfile(filepath=str(dest/"green-tree.blend"))
bpy.ops.export_scene.gltf(filepath=str(dest/"green-tree.glb"),export_format="GLB",export_animations=False,export_normals=True,export_tangents=True,export_vertex_color="MATERIAL")
