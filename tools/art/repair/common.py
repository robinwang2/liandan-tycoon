"""以米为单位操作，Blender 正面为 -Y。切割在原网格上进行，保留面角 UV。"""
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from seam_weld import stitch_boundaries


def load(file, size, wall):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(file))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    worlds = [obj.matrix_world.copy() for obj in objects]
    points = np.array([world @ vertex.co for obj, world in zip(objects, worlds) for vertex in obj.data.vertices])
    low, high = points.min(axis=0), points.max(axis=0)
    center = ((low[0]+high[0])/2, high[1] if wall else (low[1]+high[1])/2, low[2])
    fit = Matrix.Diagonal(Vector((* (np.array(size)/(high-low)), 1))) @ Matrix.Translation(-Vector(center))
    for obj, world in zip(objects, worlds):
        obj.parent = None
        obj.data = obj.data.copy()
        obj.data.transform(fit @ world)
        obj.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    return objects


def cut(shell, planes, remove, budget):
    mesh = bmesh.new()
    mesh.from_mesh(shell.data)
    stitch_boundaries(mesh)
    for axis, value in planes:
        normal = Vector((0, 0, 0)); normal[axis] = 1
        bmesh.ops.bisect_plane(mesh, geom=[*mesh.verts, *mesh.edges, *mesh.faces],
                               plane_co=normal*value, plane_no=normal, dist=1e-7)
    bmesh.ops.delete(mesh, geom=[face for face in mesh.faces if remove(face.calc_center_median())], context='FACES')
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    count = len(mesh.faces)
    mesh.to_mesh(shell.data); mesh.free()
    if count > budget:
        bpy.context.view_layer.objects.active = shell
        modifier = shell.modifiers.new('仅简化外壳', 'DECIMATE')
        modifier.ratio = budget/count
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    shell.name = 'Shell'


def material(name, color, glow=0, metal=0):
    srgb = [value/255 for value in bytes.fromhex(color)]
    linear = [((value+.055)/1.055)**2.4 if value>.04045 else value/12.92 for value in srgb]
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF').inputs
    shader['Base Color'].default_value = mat.diffuse_color = (*linear, 1)
    shader['Metallic'].default_value = metal
    if glow:
        shader['Emission Color'].default_value = (*linear, 1)
        shader['Emission Strength'].default_value = glow
    return mat


class Panels:
    def __init__(self):
        self.vertices, self.faces, self.slots, self.indices = [], [], [], []

    def add(self, points, faces, mat):
        offset = len(self.vertices); self.vertices.extend(points)
        if mat not in self.slots:
            self.slots.append(mat)
        for face in faces:
            self.faces.append([offset+index for index in face]); self.indices.append(self.slots.index(mat))

    def box(self, center, size, mat):
        points = [tuple(val+sign*dim/2 for val, sign, dim in zip(center, signs, size))
                  for signs in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.add(points, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)

    def finish(self, name):
        mesh = bpy.data.meshes.new(name); mesh.from_pydata(self.vertices, [], self.faces); mesh.update()
        obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
        for mat in self.slots: mesh.materials.append(mat)
        for face, index in zip(mesh.polygons, self.indices): face.material_index = index
        return obj


def run(build, size, wall=False):
    folder = Path(sys.argv[sys.argv.index('--')+1]).resolve()
    shell, = load(folder/'tripo.glb', size, wall)
    shell.data.calc_loop_triangles()
    metrics = {'sourceTriangles': len(shell.data.loop_triangles), **build(shell)}
    target = folder/'repaired.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=False, export_cameras=False)
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=str(target))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    for obj in objects: obj.data.calc_loop_triangles()
    metrics['triangles'] = sum(len(obj.data.loop_triangles) for obj in objects)
    assert 0 < metrics['triangles'] <= 15000
    if not wall:
        front = next(obj for obj in objects if obj.name == 'Front')
        # 按材质取实际导出的顶点，以盘位/灯的局部包围盒反验每个格子的中心和尺寸。
        def check_array(name, columns, width, height, corner_count=8):
            mat_index = front.data.materials.find(name)
            points = {tuple(round(axis, 6) for axis in front.matrix_world @ front.data.vertices[index].co)
                      for face in front.data.polygons if face.material_index == mat_index for index in face.vertices}
            assert len(points)==12*len(columns)*corner_count, name
            for row in range(12):
                center = .19+row*.15
                for column in columns:
                    corners = [point for point in points if abs(point[0]-column)<width*.51 and abs(point[2]-center)<height*.51]
                    assert len(corners)==corner_count, (name,row,column)
                    actual = np.array(corners)
                    assert np.allclose(actual.mean(axis=0)[[0,2]], [column,center], atol=1e-6)
                    assert np.allclose(np.ptp(actual,axis=0)[[0,2]], [width,height], atol=1e-6)
        check_array('Tray', [-.19+index*.125 for index in range(4)], .108, .09, 4)
        for index, color in enumerate(['Amber','Mint']): check_array('M_server_rack_LED_'+color,[.19+index*.025],.012,.008)
    if wall:
        screen = next(obj for obj in objects if obj.name == 'Screen')
        assert screen.data.materials[0].name == 'M_tv_wall_Screen'
        points = [screen.matrix_world @ vertex.co for vertex in screen.data.vertices]
        metrics['screenMaxDeviationMeters'] = max(abs(point.y-points[0].y) for point in points)
        assert metrics['screenMaxDeviationMeters'] < 1e-6
        uv = screen.data.uv_layers.active
        assert {tuple(coord.vector) for coord in uv.uv} == {(0,0),(1,0),(1,1),(0,1)}
    (folder/'repair-metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf8')
