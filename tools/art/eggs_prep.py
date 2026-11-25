"""Blender background: -P eggs_prep.py -- OUTPUT ID SOURCE (open .blend first)."""
import math
import random
import sys
import zipfile
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from eggs_teapot import PATCHES, POINTS

output, prop, source = sys.argv[sys.argv.index('--')+1:]
output, source = Path(output), Path(source)
output.mkdir(parents=True, exist_ok=True)
prints = Path(__file__).resolve().parents[2] / 'art-src/eggs' / prop / 'tex/print.png'


def material(label, color, metal=0, rough=.45, image=None, alpha=1, glow=0):
    name = 'M_'+prop+'_'+label
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF'); sockets = shader.inputs
    sockets['Base Color'].default_value = (*color, 1)
    sockets['Metallic'].default_value = metal; sockets['Roughness'].default_value = rough
    if alpha < 1:
        sockets['Alpha'].default_value = alpha; mat['transparentProp'] = True
    if glow:
        sockets['Emission Color'].default_value = (*color, 1); sockets['Emission Strength'].default_value = glow
    if image:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(str(image),check_existing=True)
        mat.node_tree.links.new(tex.outputs['Color'], sockets['Base Color'])
    return mat


def box(location, dims, mat, rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    obj=bpy.context.object; obj.scale=dims; obj.rotation_euler.z=rotation; obj.data.materials.append(mat)
    return obj


def geometry(name, vertices, faces, mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
    return obj


def merged(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1: bpy.ops.object.join()
    obj=objects[0];obj.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return obj


def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type=='MESH']


def soften(objects, level):
    for obj in objects:
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bevel=obj.modifiers.new('Finished edges','BEVEL');bevel.width=min(obj.dimensions)*.10;bevel.segments=2-level
        bpy.ops.object.modifier_apply(modifier=bevel.name)


def simplify(obj, target):
    mesh=obj.data;mesh.calc_loop_triangles();count=len(mesh.loop_triangles)
    if count<=target: return
    mod=obj.modifiers.new('LOD','DECIMATE');mod.ratio=(target-2)/count;mod.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)


def extent(obj):
    coords=[obj.matrix_world @ vert.co for vert in obj.data.vertices]
    return [Vector([fn(point[axis] for point in coords) for axis in range(3)]) for fn in (min,max)]


def teapot(level):
    steps=(7,5,3)[level]; vertices=[];faces=[];unique={}
    def basis(pos): return ((1-pos)**3,3*pos*(1-pos)**2,3*pos**2*(1-pos),pos**3)
    for patch in PATCHES:
        grid=[]
        for row in range(steps+1):
            for col in range(steps+1):
                weights=[a*b for a in basis(row/steps) for b in basis(col/steps)]
                point=tuple(round(sum(weight*POINTS[index][axis] for weight,index in zip(weights,patch)),7) for axis in range(3))
                if point not in unique: unique[point]=len(vertices);vertices.append(point)
                grid.append(unique[point])
        for row in range(steps):
            for col in range(steps):
                start=row*(steps+1)+col
                corners=list(dict.fromkeys(grid[start+offset] for offset in (0,steps+1,steps+2,1)))
                if len(corners)>=3:faces.append(corners)
    obj=geometry('Body',vertices,faces,material('Porcelain',(.92,.85,.72),rough=.18))
    for face in obj.data.polygons:face.use_smooth=True


def cornell():
    white=material('Plaster',(.82,.79,.73));thick=.008
    for location,dims,mat in [((0,0,thick/2),(.4,.4,thick),white),((0,0,.4-thick/2),(.4,.4,thick),white),((0,.196,.2),(.384,thick,.384),white),((-.196,0,.2),(thick,.4,.384),material('Red',(.58,.025,.018))),((.196,0,.2),(thick,.4,.384),material('Green',(.035,.37,.046)))]:box(location,dims,mat)
    box((-.075,.064,.128),(.115,.116,.24),white,.29);box((.077,-.069,.065),(.116,.117,.114),white,-.30)
    box((0,-.012,.391),(.105,.094,.002),material('Light',(1,.91,.72),glow=5))


def print_face(width,height,depth,mid,image):
    obj=geometry('Print',[(-width/2,depth,mid-height/2),(width/2,depth,mid-height/2),(width/2,depth,mid+height/2),(-width/2,depth,mid+height/2)],[(0,1,2,3)],material('Print',(1,1,1),image=image))
    uv=obj.data.uv_layers.new();
    for index,corner in enumerate(((0,0),(1,0),(1,1),(0,1))):uv.data[index].uv=corner


def display(level):
    metal=material('Frame',(.10,.13,.15),.7,.31)
    if prop in ('egg_attention','egg_bbb_poster'):
        width,height=(.5,.7) if prop=='egg_attention' else (.6,.9)
        box((0,.0001 if level==2 else .002,height/2),(width,.0398 if level==2 else .036,height),metal)
        if level<2:
            for side in (-1,1):
                for pos,dims in [((side*(width-.016)/2,-.018,height/2),(.016,.004,height)),((0,-.018,(height+side*(height-.016))/2),(width-.032,.004,.016))]:
                    rail=box(pos,dims,metal)
                    if level==0:
                        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);mod=rail.modifiers.new('Milled edge','BEVEL');mod.width=.0012;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
        print_face(width-.036,height-.036,-.0162 if level<2 else -.02,height/2,source if prop=='egg_bbb_poster' else prints)
        return
    ad=prop=='egg_gpu_ad';width,depth,height=(.8,.4,1.7) if ad else (1.4,.55,1.8)
    panel=1.32 if ad else .88;mid=height-panel/2
    box((0,0,mid),(width,.044,panel),metal);print_face(width-.035,panel-.036,-.023,mid,prints)
    for side in (-1,1):
        xpos=side*width*.37;box((xpos,0,mid/2),(.035,.035,mid),metal);box((xpos,0,.09),(.07,depth,.045),metal)
        for end in (-1,1):
            if ad:box((xpos,end*(depth/2-.03),.045),(.06,.06,.09),metal)
            else:
                bpy.ops.mesh.primitive_cylinder_add(vertices=(20,12,8)[level],radius=.06,depth=.046,rotation=(0,math.pi/2,0),location=(xpos,end*.215,.06));bpy.context.object.data.materials.append(metal)


def clips(level):
    paper=material('Kraft',(.55,.26,.089));silver=material('Steel',(.64,.67,.71),.91,.22)
    box((-.045,.025,.004),(.17,.13,.008),paper)
    for sign in (-1,1):
        box((-.045+sign*.083,.025,.039),(.004,.13,.078),paper);box((-.045,.025+sign*.063,.039),(.16,.004,.078),paper)
    rng=random.Random(2003);vertices=[];faces=[]
    for index in range(150):
        inside=index<104
        center=Vector((rng.uniform(-.105,.015) if inside else rng.uniform(-.117,.14),rng.uniform(-.018,.071) if inside else rng.uniform(-.108,-.047),.022+.00069*index if inside else .0016+.00010*(index-104)))
        angle=rng.uniform(-math.pi,math.pi);rot=Matrix.Rotation(angle,3,'Z') @ Matrix.Rotation(rng.uniform(-.2,.2),3,'X')
        if level==2:
            start=len(vertices)
            for px,py,pz in [(-.016,0,0),(.016,0,0),(0,-.0035,0),(0,.0035,0),(0,0,.0015),(0,0,-.00065)]:vertices.append(center+rot@Vector((px,py,pz)))
            for pole in (4,5):
                for first,last in [(0,2),(2,1),(1,3),(3,0)]:faces.append(tuple(start+num for num in ((first,last,pole) if pole==4 else (last,first,pole))))
            continue
        points=[(-.010,-.003),(.012,-.003),(.015,-.002),(.016,0),(.015,.002),(.012,.003),(-.012,.003),(-.015,.002),(-.016,0),(-.015,-.002),(-.012,-.002),(.009,-.0015)]
        if level==1:points=[points[num] for num in (0,1,3,5,6,8,11)]
        sides=(4,3,3)[level];start=len(vertices)
        for at,(px,py) in enumerate(points):
            prev=points[max(0,at-1)];nxt=points[min(at+1,len(points)-1)];perp=Vector((prev[1]-nxt[1],nxt[0]-prev[0],0)).normalized()
            for seg in range(sides):
                theta=math.tau*seg/sides;vertices.append(center+rot@(Vector((px,py,.00065))+perp*(.00065*math.cos(theta))+Vector((0,0,.00065*math.sin(theta)))))
                if at: faces.append(tuple(start+row*sides+column%sides for row,column in [(at-1,seg),(at-1,seg+1),(at,seg+1),(at,seg)]))
    geometry('Clips',vertices,faces,silver)


def crane(level):
    species=source.stem;tri='tri' if species=='bob' else 'triangulated';tex='diffuse' if species=='bob' else 'texture'
    with zipfile.ZipFile(source) as archive:
        for filename in (species+'_'+tri+'.obj',species+'_'+tex+'.png'):
            target=output/filename
            target.write_bytes(archive.read(species+'/'+filename))
    bpy.ops.wm.obj_import(filepath=str(output/(species+'_'+tri+'.obj')),forward_axis='NEGATIVE_Z',up_axis='Y')
    obj=merged(meshes(),'Fish' if species=='blub' else 'Body');obj.data.materials.clear();obj.data.materials.append(material('Skin',(1,1,1),image=output/(species+'_'+tex+'.png')))
    for face in obj.data.polygons:face.use_smooth=True
    obj.data.transform(Matrix.Rotation(math.pi if species=='spot' else math.pi/2,4,'Z'))
    low,high=extent(obj);height={'bob':.12,'spot':.145,'blub':.13}[species];scale=height/(high.z-low.z)
    offset=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z));obj.data.transform(Matrix.Scale(scale,4)@Matrix.Translation(-offset))
    simplify(obj,((5800,2250,685) if species!='blub' else (5700,2100,520))[level]);
    if species=='spot':
        obj.location.z=.015;box((0,0,.0075),(.12,.17,.015),material('Oak',(.31,.125,.042)))
    if species!='blub':return
    obj.location=(0,0,.122);glass=material('Glass',(.62,.92,.97),rough=.12,alpha=.055);water=material('Water',(.28,.68,.8),rough=.2,alpha=.045);rim=material('Rim',(.075,.11,.12),.65)
    box((0,0,.012),(.45,.25,.024),rim);box((0,0,.152),(.44,.24,.26),water)
    for sign in (-1,1):
        box((sign*.223,0,.184),(.004,.25,.332),glass);box((0,sign*.123,.184),(.441,.004,.332),glass)
        box((sign*.222,0,.346),(.006,.25,.008),rim);box((0,sign*.122,.346),(.438,.006,.008),rim)
    rng=random.Random(84);stone=material('Pebbles',(.36,.29,.19));leaf=material('Kelp',(.055,.30,.12))
    for index in range((37,22,10)[level]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(rng.uniform(-.20,.20),rng.uniform(-.104,.104),.025));rock=bpy.context.object;rock.scale=(.014,.01,.007);rock.data.materials.append(stone)
    for index in range(9):
        xpos=(-.17 if index<5 else .16)+.012*(index%5);top=.11+.015*(index%4);geometry('Leaf',[(xpos-.006,.075,.025),(xpos+.006,.075,.025),(xpos+.018,.069,top*.77),(xpos+.009,.074,top)],[(0,1,2),(0,2,3)],leaf)
    merged([part for part in meshes() if part!=obj],'Tank');bpy.context.view_layer.objects.active=obj;obj.select_set(True)


def nerf():
    graph=bpy.context.evaluated_depsgraph_get();chosen=[]
    for original in list(bpy.context.scene.objects):
        if original.type!='MESH':continue
        evaluated=original.evaluated_get(graph);mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=graph)
        if not mesh.polygons:continue
        if not mesh.materials:mesh.materials.append(material('Insulator',(.09,.09,.10)))
        copy=bpy.data.objects.new('Bake',mesh);bpy.context.collection.objects.link(copy);mesh.transform(evaluated.matrix_world);chosen.append(copy)
        if prop=='egg_mic' and any(slot.material and slot.material.name=='Wire' for slot in original.material_slots):
            hull=bmesh.new();hull.from_mesh(mesh);result=bmesh.ops.convex_hull(hull,input=list(hull.verts));bmesh.ops.delete(hull,geom=result['geom_interior']+result['geom_unused'],context='VERTS');hull.to_mesh(mesh);hull.free();mesh.update()
            mesh.materials.clear();mesh.materials.append(material('Grille',(.27,.29,.30),.72,.4,image=prints));uv=mesh.uv_layers.active or mesh.uv_layers.new()
            for face in mesh.polygons:
                normal=face.normal;axes=sorted(range(3),key=lambda axis:abs(normal[axis]))[:2];axes.sort()
                for loop in face.loop_indices:
                    point=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=tuple(point[axis]*32 for axis in axes)
                face.use_smooth=True
    for obj in list(bpy.context.scene.objects):
        if obj not in chosen:bpy.data.objects.remove(obj,do_unlink=True)
    for obj in chosen:
        for slot in obj.material_slots:
            mat=slot.material
            if not mat or not mat.node_tree:continue
            shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if not shader:continue
            tex=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
            if tex:
                mapping=tex.inputs['Vector'].links
                if mapping and mapping[0].from_node.type=='MAPPING' and obj.data.uv_layers.active:
                    transform=mapping[0].from_node.inputs
                    for entry in obj.data.uv_layers.active.data:
                        uv=entry.uv.copy();angle=transform['Rotation'].default_value.z;u,v=[a*b for a,b in zip(uv,transform['Scale'].default_value)]
                        entry.uv=(u*math.cos(angle)-v*math.sin(angle)+transform['Location'].default_value.x,u*math.sin(angle)+v*math.cos(angle)+transform['Location'].default_value.y)
                    mat.node_tree.links.remove(mapping[0])
                mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])
            else:
                color=shader.inputs['Base Color'];ramp=next((n for n in mat.node_tree.nodes if n.type=='VALTORGB'),None)
                if color.is_linked and ramp:color.default_value=ramp.color_ramp.evaluate(.5);mat.node_tree.links.remove(color.links[0])
            for link in list(shader.inputs['Normal'].links):mat.node_tree.links.remove(link)
            out=next(n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL');mat.node_tree.links.new(shader.outputs[0],out.inputs['Surface'])
    return chosen


base=nerf() if source.suffix=='.blend' else None
for level in range(3):
    if base:
        copies=[]
        for original in base:
            obj=original.copy();obj.data=original.data.copy();bpy.context.collection.objects.link(obj);copies.append(obj)
        if prop=='egg_mic' and level==2:
            ranked=[]
            for obj in copies:
                low,high=extent(obj);span=sorted(high-low,reverse=True)
                ranked.append((obj,span[0]*max(span[1],.025)**.65))
            ranked=sorted(ranked,key=lambda entry:-entry[1])[:18];weight=sum(score for obj,score in ranked)
            for obj in copies:
                if obj not in [part for part,score in ranked]:bpy.data.objects.remove(obj,do_unlink=True)
            for obj,score in ranked:simplify(obj,max(12,int(1080*score/weight)))
            copies=[part for part,score in ranked]
        obj=merged(copies,'Body');parts=[obj]
        simplify(obj,((5880,2350,828) if prop=='egg_hotdog' else (7840,3100,1110))[level]);
        if prop=='egg_mic' and level==2:
            surface=bmesh.new();surface.from_mesh(obj.data)
            bmesh.ops.triangulate(surface,faces=list(surface.faces))
            for edge in list(surface.edges):
                if edge.is_valid and len(edge.link_faces)>2:
                    excess=sorted(edge.link_faces,key=lambda face:face.calc_area(),reverse=True)[2:]
                    bmesh.ops.delete(surface,geom=excess,context='FACES')
            surface.to_mesh(obj.data);surface.free();obj.data.update()
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if prop=='egg_teapot':teapot(level)
        elif prop=='egg_cornell':cornell()
        elif prop=='egg_paperclips':clips(level)
        elif source.suffix=='.zip':crane(level)
        else:display(level)
        if level<2 and prop in ('egg_cornell','egg_gpu_ad','egg_whiteboard'):soften([part for part in meshes() if len(part.data.polygons)==6],level)
        parts=meshes() if prop=='egg_blub_tank' else [merged(meshes(),'Body')]
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:part.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output/f'lod{level}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False)
    if base:bpy.data.objects.remove(obj,do_unlink=True)
