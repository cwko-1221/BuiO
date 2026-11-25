"""Build the Moonbay opal globe and patinated cast-iron lamp."""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
out=Path(sys.argv[sys.argv.index("--")+1])
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,c,rough,metal,emission=0):
    result=bpy.data.materials.new(name)
    result.use_nodes=True
    shader=result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value=(*c,1)
    shader.inputs["Roughness"].default_value=rough
    shader.inputs["Metallic"].default_value=metal
    shader.inputs["Emission Color"].default_value=(*c,1)
    shader.inputs["Emission Strength"].default_value=emission
    result.diffuse_color=(*c,1)
    return result

iron=material("Deep tide-green cast iron",(.035,.122,.106),.58,.3)
aged=material("Satin brass fittings",(.65,.407,.139),.39,.43)
opal=material("Ivory opal globe",(.91,.791,.526),.37,0,.12)
stone=material("Warm limestone footing",(.525,.45,.34),.89,0)

def profile(name,rings,mat,sides=24,flute=False):
    points=[]
    for radius,z in rings:
        for i in range(sides):
            a=i*math.tau/sides
            wave=1+.045*math.cos(a*8) if flute else 1
            points.append((radius*wave*math.cos(a),radius*wave*math.sin(a),z))
    faces=[tuple(reversed(range(sides)))]
    for row in range(len(rings)-1):
        for i in range(sides):
            a=row*sides+i;b=row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(len(points)-sides,len(points))))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    for face in mesh.polygons[1:-1]:
        face.use_smooth=True
    return obj

body=profile("Fluted coastal column",[(.141,.015),(.179,.035),(.190,.068),(.187,.243),(.148,.288),
      (.105,.32),(.093,.44),(.082,.51),(.066,.69),(.055,1.04),(.046,1.80),
      (.051,1.90),(.069,1.947),(.084,1.973)],iron,24,True)
profile("Inset stone shoe",[(.215,-.026),(.235,.004),(.235,.059),(.192,.087)],stone,32)
profile("Brass base trim",[(.109,.305),(.118,.324),(.116,.342),(.099,.355)],aged)
profile("Post neck ferrule",[(.068,1.867),(.075,1.890),(.071,1.912),(.058,1.926)],aged)
profile("Turned lantern seat",[(.074,1.950),(.091,1.969),(.146,1.994),(.160,2.018),(.148,2.048),(.133,2.062)],iron)
profile("Lower brass window frame",[(.132,2.006),(.153,2.023),(.153,2.047),(.141,2.060)],aged)

# Slightly elongated opal capsule, with its lower rim seated in the frame.
globe=[]
for q in range(1,16):
    a=q*math.pi/16
    globe.append((.182*math.sin(a),2.235-.204*math.cos(a)))
profile("Opal globe",globe,opal,28)
profile("Cast weather cap",[(.126,2.359),(.144,2.379),(.145,2.396),(.121,2.422),(.089,2.442),(.062,2.454)],iron)
profile("Brass finial",[(.039,2.435),(.060,2.456),(.051,2.48),(.032,2.504),(.014,2.55)],aged,16)

for index in range(3):
    yaw=index*math.tau/3+math.pi/6
    n=10
    coords=[]
    for i in range(n):
        t=i/(n-1)
        z=2.032+t*.344
        a=t*.13+yaw-.055
        r=.148+.049*math.sin(t*math.pi)
        coords.append((r*math.cos(a),r*math.sin(a),z))
    curve=bpy.data.curves.new("Lantern guard rib","CURVE")
    curve.dimensions="3D"
    curve.bevel_depth=.0105
    curve.bevel_resolution=2
    curve.use_fill_caps=True
    spline=curve.splines.new("POLY")
    spline.points.add(n-1)
    for point,xyz in zip(spline.points,coords):
        point.co=(*xyz,1)
    rail=bpy.data.objects.new("Lantern guard rib",curve)
    bpy.context.collection.objects.link(rail)
    rail.data.materials.append(aged)

bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active=body
bpy.ops.object.convert(target="MESH")
bpy.ops.object.join()
body.name="lamp"
body.data.validate(clean_customdata=True)
body.data.calc_loop_triangles()
print("LAMP",len(body.data.loop_triangles),tuple(body.dimensions),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/"lamp.blend"))
bpy.ops.export_scene.gltf(filepath=str(out/"lamp.glb"),export_format="GLB",export_animations=False,export_normals=True)
