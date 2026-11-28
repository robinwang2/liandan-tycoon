"""以米为单位操作，Blender 正面为 -Y。切割在原网格上进行，保留面角 UV。"""
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

if __name__ == '__main__':
    sys.dont_write_bytecode = True
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


def prepare_box_lods(source, folder, targets, voxel_height):
    """纸盒的预制远级。保留原坐标系，另烘 LOD2 底色，避免跨图集岛插值。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    original, = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    name = original.name
    original.name = name + '_Source'
    folder.mkdir(parents=True, exist_ok=True)

    for level, target in enumerate(targets, 1):
        obj = original.copy()
        obj.data = original.data.copy()
        bpy.context.collection.objects.link(obj)
        obj.name = name
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.data.transform(world)
        obj.matrix_world = Matrix.Identity(4)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        stitch_boundaries(bm)
        bm.to_mesh(obj.data)
        bm.free()
        bpy.context.view_layer.objects.active = obj
        if level == 2:
            remesh = obj.modifiers.new('保留盒盖和层间隙', 'REMESH')
            remesh.mode = 'VOXEL'
            remesh_size = (max(v.co.z for v in obj.data.vertices) - min(v.co.z for v in obj.data.vertices)) * voxel_height
            remesh.voxel_size = remesh_size
            bpy.ops.object.modifier_apply(modifier=remesh.name)
        obj.data.calc_loop_triangles()
        decimate = obj.modifiers.new('纸盒面数', 'DECIMATE')
        decimate.ratio = min(1., target / len(obj.data.loop_triangles))
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        if level == 2:
            obj.data.materials.clear()
            mat = bpy.data.materials.new('M_pizza_stack_Far')
            mat.use_nodes = True
            obj.data.materials.append(mat)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(island_margin=.012)
            bpy.ops.object.mode_set(mode='OBJECT')
            image = bpy.data.images.new('PizzaFar', 512, 512, alpha=False)
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = image
            mat.node_tree.nodes.active = tex
            scene = bpy.context.scene
            scene.render.engine = 'CYCLES'
            scene.cycles.samples = 1
            original.select_set(True)
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                                cage_extrusion=remesh_size, max_ray_distance=remesh_size * 3, margin=4)
            original.select_set(False)
            mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
            image.pack()
        bpy.ops.export_scene.gltf(filepath=str(folder / f'lod{level}.glb'), export_format='GLB', use_selection=True)
        bpy.data.objects.remove(obj, do_unlink=True)


if __name__ == '__main__':
    file, destination, counts, voxel = sys.argv[sys.argv.index('--')+1:]
    prepare_box_lods(Path(file), Path(destination), [int(n) for n in counts.split(',')], float(voxel))
