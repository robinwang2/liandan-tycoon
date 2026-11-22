"""按 Blender 世界坐标的平面切一个网格；只封这次切出的闭合边圈，不掩盖原模型的破洞。"""
import argparse
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path)
parser.add_argument('output',type=Path)
plane=parser.add_mutually_exclusive_group(required=True)
plane.add_argument('--height',type=float)
plane.add_argument('--point',type=float,nargs=3)
parser.add_argument('--normal',type=float,nargs=3,default=(0,0,1))
parser.add_argument('--upper-pivot',type=float,nargs=3)
parser.add_argument('--lower-pivot',type=float,nargs=3)
parser.add_argument('--mesh',help='多网格时明确指定；仅输出选中网格的两半')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
if args.output.suffix.lower()!='.glb' or args.output.exists(): raise ValueError('输出必须是全新的 GLB，不能覆盖原件')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and (not args.mesh or obj.name==args.mesh)]
if len(meshes)!=1: raise ValueError('需要一个明确的输入网格；多件请用 --mesh 指定：'+str([obj.name for obj in meshes]))
source=meshes[0]
point=Vector(args.point or (0,0,args.height)); normal=Vector(args.normal)
if not normal.length or (args.height is not None and tuple(normal)!=(0,0,1)): raise ValueError('斜切请使用 --point 和非零 --normal')
normal.normalize(); parts=[]
for upper in (False,True):
    obj=source.copy();obj.data=source.data.copy();bpy.context.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.transform(source.matrix_world)
    # glTF 接缝可能把同位置顶点分开。仅在此切件副本上焊接，保留面拐角 UV。
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    result=bmesh.ops.bisect_plane(bm,geom=[*bm.verts,*bm.edges,*bm.faces],plane_co=point,plane_no=normal,dist=1e-6,clear_inner=upper,clear_outer=not upper)
    edges=[edge for edge in result['geom_cut'] if isinstance(edge,bmesh.types.BMEdge) and edge.is_boundary]
    if not edges or not bm.faces:raise ValueError('切面没有产生有效轮廓，请调整高度或网格')
    degree={}
    for edge in edges:
        for vert in edge.verts:degree[vert]=degree.get(vert,0)+1
    if any(n!=2 for n in degree.values()):raise ValueError('切口不是闭环，请先修复开口或非流形网格')
    caps=bmesh.ops.holes_fill(bm,edges=edges,sides=0)['faces']
    if not caps or any(not edge.is_manifold for edge in edges):raise ValueError('切口未封闭，不导出')
    bm.normal_update();outward=-normal if upper else normal
    for face in caps:
        if face.normal.dot(outward)<0:face.normal_flip()
    # 默认上半以截面中心为枢轴，下半以整个底面中心为枢轴；铰链用显式坐标。
    cut_center=sum((vert.co for vert in degree),Vector())/len(degree)
    low=Vector([min(v.co[axis] for v in bm.verts) for axis in range(3)])
    high=Vector([max(v.co[axis] for v in bm.verts) for axis in range(3)])
    base=(low+high)*.5;base.z=low.z
    pivot=Vector((args.upper_pivot or cut_center) if upper else (args.lower_pivot or base))
    bm.transform(Matrix.Translation(-pivot));bm.to_mesh(obj.data);bm.free();obj.parent=None;obj.matrix_world=Matrix.Translation(pivot)
    obj.name='Upper' if upper else 'Lower';parts.append(obj)
    print(obj.name,'枢轴',tuple(pivot),'封口面数',len(caps))
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
args.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output.resolve()),export_format='GLB',use_selection=True)
