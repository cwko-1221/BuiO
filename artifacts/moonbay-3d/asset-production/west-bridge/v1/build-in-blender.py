"""West basin bridge, with masonry laid from arch springers to the crown."""
import math
import random
import sys
from pathlib import Path
import bpy

target=Path(sys.argv[sys.argv.index("--")+1])
limestone=Path(sys.argv[sys.argv.index("--")+2])
target.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
rng=random.Random(164)
V,F,C,slots,smooth=[],[],[],[],[]
span=19
crest=.513064262
width=4.50
base=-.04
stretch=1.19
def h(y):return (y-base)/stretch
def roof(u):
    return h(2.45+.83*u/crest if u<=crest else 3.28-.73*(u-crest)/(1-crest))
def soffit(u):
    lo,hi=.161,.863
    if u<lo or u>hi:return h(.10)
    t=2*(u-lo)/(hi-lo)-1
    return h(.40+1.89*math.sqrt(max(0,1-t*t)))

warm=(.65,.477,.296)
cream=(.75,.586,.365)
shade=(.415,.335,.226)
wet=(.39,.323,.237)
def tint(c,f):return tuple(min(1,k*f) for k in c)
def v(x,u,z,color):
    V.append((x,span*(.5-u),z))
    C.append((*color,1))
    return len(V)-1
def face(c,slot=0,s=False):
    F.append(c);slots.append(slot);smooth.append(s)

def strip(us,section,kind,color,soft=True):
    rings=[]
    for u in us:
        rings.append([v(x,u,z,tint(color,shade)) for x,z,shade in section(u)])
    count=len(rings[0])
    for row,lo in enumerate(rings[:-1]):
        hi=rings[row+1]
        for j in range(count):
            k=(j+1)%count
            face((lo[j],lo[k],hi[k],hi[j]),kind,soft)
    face(tuple(reversed(rings[0])),kind)
    face(tuple(rings[-1]),kind)

def core(u):
    top=roof(u)-.042
    low=soffit(u)
    return [(-1.93,low,.86),(1.93,low,.86),(2.05,low+.062,.87),(2.085,top-.164,.99),
            (2.115,top-.07,1.02),(2.115,top,1.03),(-2.115,top,1.03),
            (-2.115,top-.07,1.02),(-2.085,top-.164,.99),(-2.05,low+.062,.87)]
levels=sorted({i/90 for i in range(91)}|{.161,.863,crest})
strip(levels,core,0,shade)

# Stone foundation ends are inset into the existing surveyed approaches.
for start,end in [(0,.182),(.825,1)]:
    for i in range(4):
        aa=start+(end-start)*i/4
        bb=start+(end-start)*(i+1)/4-.00055
        def plinth(u):
            return [(-2.21,0,.70),(2.21,0,.70),(2.25,.069,.79),(2.25,.39,.86),
                    (2.219,.49,.89),(2.15,.55,.92),(-2.15,.55,.92),(-2.219,.49,.89),
                    (-2.25,.39,.86),(-2.25,.069,.79)]
        strip([aa,bb],plinth,1,wet)

for side in (-1,1):
    # The large wedge stones are radially laid under the spandrel courses.
    opening_start,opening_end=.163,.861
    crown_y=h(2.28)
    for i in range(27):
        a=opening_start+(opening_end-opening_start)*i/27+.00040
        b=opening_start+(opening_end-opening_start)*(i+1)/27-.00040
        def ashlar(u):
            lower=soffit(u)+.016
            upper=min(lower+.26,roof(u)-.15)
            x=side
            return [(x*1.977,lower+.015,.84),(x*2.102,lower+.015,.87),
                    (x*2.139,lower+.047,.98),(x*2.139,upper-.023,1.05),
                    (x*2.101,upper,1.05),(x*2.004,upper,.95)]
        strip([a,(a+b)/2,b],ashlar,0,tint(cream,rng.uniform(.92,1.055)))
    # Roughly dressed end walls, with staggered blocks fitted to the arch.
    for row in range(7):
        n=25
        edge=[0]+[(i+(row%2)*.46+rng.uniform(-.13,.13))/n for i in range(1,n)]+[1]
        for left,right in zip(edge,edge[1:]):
            a=left+.00054;b=right-.00054
            def room(u):
                lo=max(soffit(u)+(.23 if .161<=u<=.863 else .03),.29+row*.289)
                hi=min(roof(u)-.17,.29+(row+1)*.289-.017)
                return lo,hi
            good=[a+(b-a)*i/8 for i in range(9) if room(a+(b-a)*i/8)[1]-room(a+(b-a)*i/8)[0]>.036]
            if len(good)<2:continue
            def block(u):
                lo,hi=room(u)
                return [(side*2.03,lo,.85),(side*2.107,lo,.88),(side*2.127,lo+.022,.98),
                        (side*2.127,hi-.018,1.02),(side*2.106,hi,1.04),(side*2.025,hi,.94)]
            strip(good,block,1 if row==0 else 0,tint(warm,rng.uniform(.88,1.085)))
    # A shallow structural cap follows the two constant slopes of the deck.
    for i in range(24):
        a=i/24+.00033;b=(i+1)/24-.00033
        inn=[a,crest,b] if a<crest<b else [a,b]
        def cornice(u):
            z=roof(u)
            return [(side*1.75,z-.12,.91),(side*2.112,z-.159,.87),(side*2.215,z-.13,.93),
                    (side*2.246,z-.094,1.02),(side*2.239,z-.052,1.05),
                    (side*2.208,z-.023,1.06),(side*1.75,z-.023,1.05)]
        strip(inn,cornice,0,tint(cream,rng.uniform(.94,1.045)))

mesh=bpy.data.meshes.new("Bridge arch, spandrel masonry and inset foundations")
mesh.from_pydata(V,[],F)
mesh.update()
color=mesh.color_attributes.new(name="Stone tone",type="FLOAT_COLOR",domain="POINT")
for i,tone in enumerate(C):
    color.data[i].color=tone
image=bpy.data.images.load(str(limestone),check_existing=True)
image.pack()
for label,rough in [("Dressed sandstone",.86),("Damp stone at springline",.64)]:
    mat=bpy.data.materials.new(label)
    mat.use_nodes=True
    ns=mat.node_tree.nodes
    bs=ns.get("Principled BSDF")
    bs.inputs["Roughness"].default_value=rough
    detail=ns.new("ShaderNodeTexImage")
    detail.image=image
    mat.node_tree.links.new(detail.outputs["Color"],bs.inputs["Base Color"])
    mesh.materials.append(mat)
for poly,slot,usesmooth in zip(mesh.polygons,slots,smooth):
    poly.material_index=slot
    poly.use_smooth=usesmooth
obj=bpy.data.objects.new("west-bridge",mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
mesh.validate(clean_customdata=True)
uv=mesh.uv_layers.new(name="Stone projection").data
for poly in mesh.polygons:
    nx,ny,nz=map(abs,poly.normal)
    for idx in poly.loop_indices:
        x,y,z=mesh.vertices[mesh.loops[idx].vertex_index].co
        if nz>=max(nx,ny):a,b=x,y
        elif nx>ny:a,b=y,z
        else:a,b=x,z
        uv[idx].uv=(a*.8,b*.8)
mesh.calc_loop_triangles()
print("BRIDGE",len(mesh.loop_triangles),tuple(obj.dimensions))
bpy.ops.export_scene.gltf(filepath=str(target/"west-bridge.glb"),export_format="GLB",export_animations=False,
                         export_normals=True,export_vertex_color="ACTIVE")
for mat in mesh.materials:
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    tex=next(n for n in nodes if n.type=='TEX_IMAGE')
    color=nodes.new("ShaderNodeVertexColor")
    color.layer_name="Stone tone"
    blend=nodes.new("ShaderNodeMixRGB")
    blend.blend_type="MULTIPLY"
    blend.inputs[0].default_value=1
    links.new(color.outputs["Color"],blend.inputs[1])
    links.new(tex.outputs["Color"],blend.inputs[2])
    links.new(blend.outputs[0],nodes.get("Principled BSDF").inputs["Base Color"])
bpy.ops.wm.save_as_mainfile(filepath=str(target/"west-bridge.blend"))
