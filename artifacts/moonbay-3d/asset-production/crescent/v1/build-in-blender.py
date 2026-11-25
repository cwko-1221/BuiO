"""Make the Moonbay landmark in Blender with a sculpted alloy section."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

dest=Path(sys.argv[sys.argv.index("--")+1])
dest.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def metal(name,c,rough,metallic):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    bs=m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value=(*c,1)
    bs.inputs["Roughness"].default_value=rough
    bs.inputs["Metallic"].default_value=metallic
    m.diffuse_color=(*c,1)
    return m

gold=metal("Satin cast gold",(.71,.41,.105),.45,.38)
lip=metal("Polished gilded lip",(.92,.64,.24),.33,.47)
incision=metal("Copper line inlay",(.45,.24,.066),.55,.31)
stone=metal("Worn ivory limestone",(.60,.50,.36),.86,.0)
stone_shade=metal("Shaded limestone stringcourse",(.47,.37,.25),.85,0)
patina=metal("Aged bronze socket",(.245,.156,.062),.52,.36)

offset=Vector((.49,.061))
inner_r=.887
axis=math.atan2(offset.y,offset.x)
theta=math.acos((1-inner_r**2+offset.length_squared)/(2*offset.length))
ang_lo,ang_hi=axis-theta,axis+theta
def polar(a):
    return Vector((math.cos(a),math.sin(a)))

a0=polar(ang_lo)-offset
a1=polar(ang_hi)-offset
inner_lo,inner_hi=math.atan2(a0.y,a0.x),math.atan2(a1.y,a1.x)
def paths(t):
    outer=polar(ang_lo+(ang_hi-math.tau-ang_lo)*t)
    inner=offset+inner_r*polar(inner_lo+(inner_hi-math.tau-inner_lo)*t)
    return outer,inner

domain=[point for i in range(301) for point in paths(i/300)]
minx,maxx=min(p.x for p in domain),max(p.x for p in domain)
minz,maxz=min(p.y for p in domain),max(p.y for p in domain)
def section(t,q):
    a,b=paths(t)
    p=a.lerp(b,q)
    x=-1.95+(p.x-minx)*3.9/(maxx-minx)
    z=.39+(p.y-minz)*(4.1-.39)/(maxz-minz)
    return x,z

def thickness(t,q):
    # Taper toward both horns and toward both edges of the curved cross-section.
    heart=math.sin(math.pi*t)**.72
    transverse=(.14+.86*math.sin(math.pi*q)**.56)
    return (.058+.489*heart*transverse)*(.94+.06*math.cos((t-.46)*math.tau))

def surface(t,q,side):
    x,z=section(t,q)
    return (x,side*thickness(t,q),z)

verts,faces,slots=[],[],[]
def add_face(f,slot):
    faces.append(f);slots.append(slot)
length,span=64,16
for direction in (-1,1):
    for i in range(length+1):
        # A tiny last section keeps the taper manifold at each sculpted horn.
        t=.0025+.995*i/length
        for j in range(span+1):
            verts.append(surface(t,j/span,direction))
sheet=(length+1)*(span+1)
for side in range(2):
    for i in range(length):
        for j in range(span):
            v=side*sheet+i*(span+1)+j
            vi=v+span+1
            q=(v,vi,vi+1,v+1)
            add_face(q if side==0 else q[::-1],1 if j in (0,span-1) else 0)
boundary=list(range(span+1))
boundary += [i*(span+1)+span for i in range(1,length+1)]
boundary += [length*(span+1)+j for j in range(span-1,-1,-1)]
boundary += [i*(span+1) for i in range(length-1,0,-1)]
for i,a in enumerate(boundary):
    b=boundary[(i+1)%len(boundary)]
    add_face((a,b,b+sheet,a+sheet),1)
mesh=bpy.data.meshes.new("Crescent with rounded double-sided section")
mesh.from_pydata(verts,[],faces)
mesh.update()
obj=bpy.data.objects.new("cast-crescent",mesh)
bpy.context.collection.objects.link(obj)
for m in [gold,lip]:
    mesh.materials.append(m)
for face,slot in zip(mesh.polygons,slots):
    face.material_index=slot
    face.use_smooth=True
# Recalculate after closing the side sheets to keep the front lighting uniform.
bpy.context.view_layer.objects.active=obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
obj.select_set(False)

def line(name,points,diam,mat):
    curve=bpy.data.curves.new(name,"CURVE")
    curve.dimensions="3D"
    curve.resolution_u=2
    curve.bevel_depth=diam*.5
    curve.bevel_resolution=2
    curve.use_fill_caps=True
    spline=curve.splines.new("POLY")
    spline.points.add(len(points)-1)
    for point,xyz in zip(spline.points,points):
        point.co=(*xyz,1)
    o=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)

# The fine groove follows the curved face, with a restrained orbit motif.
for side in (-1,1):
    line("Edge chased into gold",[(x,y+side*.009,z)
         for x,y,z in [surface(.095+i*.81/51,.15+.028*math.sin(i*.11),side) for i in range(52)]],.026,incision)
    for ct,extent,center in ((.31,.052,.54),(.50,.070,.51),(.69,.050,.52)):
        points=[]
        for i in range(31):
            u=i/30
            a=-1.05+u*math.tau*1.21
            r=1-u*.92
            t=ct+math.sin(a)*extent*r
            q=center+math.cos(a)*.24*r
            x,y,z=surface(t,q,side)
            points.append((x,y+side*.008,z))
        line("Chased crescent curl",points,.021,incision)

# Solid stone footing and a dark bronze saddle supporting the casting.
def foot(name,profile,center,aspect,material,sides):
    verts=[]
    faces=[]
    ox,oy=center
    for radius,z in profile:
        verts.extend((ox+radius*math.cos(i*math.tau/sides),oy+radius*aspect*math.sin(i*math.tau/sides),z) for i in range(sides))
    faces.append(tuple(reversed(range(sides))))
    for row in range(len(profile)-1):
        for i in range(sides):
            a=row*sides+i;b=row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(len(verts)-sides,len(verts))))
    me=bpy.data.meshes.new(name)
    me.from_pydata(verts,[],faces)
    me.update()
    o=bpy.data.objects.new(name,me)
    bpy.context.collection.objects.link(o)
    me.materials.append(material)
    for face in me.polygons[1:-1]:
        face.use_smooth=True

bearing=min((section(i/300,0) for i in range(301)),key=lambda p:p[1])[0]-.13
foot("Keyed limestone plinth",[(.82,0),(.85,.028),(.85,.107),(.811,.15),(.785,.192),(.736,.205)],(bearing,0),.73,stone,44)
foot("Stone shadow course",[(.755,.183),(.759,.222),(.722,.243)],(bearing,0),.72,stone_shade,44)
foot("Bronze bed",[(.595,.22),(.622,.242),(.62,.273),(.575,.303),(.532,.318)],(bearing,0),.73,patina,36)
foot("Bronze stem collar",[(.420,.298),(.444,.321),(.401,.401),(.350,.482)],(bearing-.031,0),.84,gold,36)
for x,z in [(bearing-.38,.24),(bearing+.37,.24)]:
    for y in (-.292,.292):
        foot("Seat pin cap",[(.042,z),(.052,z+.013),(.041,z+.027)],(x,y),1,lip,12)

bpy.context.scene.view_settings.view_transform='AgX'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.convert(target="MESH")
bpy.context.view_layer.objects.active=obj
bpy.ops.object.join()
obj.name="crescent"
obj.data.validate(clean_customdata=True)
obj.data.update()

bpy.ops.wm.save_as_mainfile(filepath=str(dest/"crescent.blend"))
bpy.ops.export_scene.gltf(filepath=str(dest/"crescent.glb"),export_format="GLB",export_animations=False,export_normals=True)
