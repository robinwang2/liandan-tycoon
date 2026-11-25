"""把下载外壳对齐到原模 Shell 的六个盒面，按原名接回程序部件。"""
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from seam_weld import stitch_boundaries


def mesh_bounds(obj):
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return tuple(Vector(fn(p[i] for p in points) for i in range(3)) for fn in (min, max))


def fit_box(obj, target):
    low, high = mesh_bounds(obj)
    dst, top = target
    if min(high-low) <= 0 or min(top-dst) <= 0:
        raise ValueError('外壳应有非零宽深高')
    scale = Matrix.Diagonal(Vector([*((top[i]-dst[i])/(high[i]-low[i]) for i in range(3)), 1]))
    obj.data.transform(Matrix.Translation(dst) @ scale @ Matrix.Translation(-low))


def import_meshes(file):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(file))
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']


def assemble(folder, item, budget, mirror):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = {obj.name: obj for obj in import_meshes(folder/'game.glb')}
    if set(source) != {'Shell', *item['parts']}:
        raise ValueError('原模网格与选件表不一致，请重跑 prep')
    template = source.pop('Shell')
    target = mesh_bounds(template)
    bpy.data.objects.remove(template, do_unlink=True)
    pivots = {name: obj.matrix_world.translation.copy() for name, obj in source.items()}
    # 原程序车窗用深色实体表示；输出到玻璃专槽后仍保留其色调。
    glass = bpy.data.materials.get('M_' + item['id'] + '_Glass')
    if 'Glass' in source:
        if not glass or glass not in source['Glass'].data.materials[:]:
            raise ValueError('原模缺少独立玻璃材质槽')
        shader = next(n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        alpha = shader.inputs['Alpha']
        if alpha.default_value >= 1:
            alpha.default_value = .62
        # 选件表可按件压低玻璃不透明度，让柜内货品颜色透出来。
        if 'glassAlpha' in item:
            alpha.default_value = float(item['glassAlpha'])
        glass.diffuse_color = (*shader.inputs['Base Color'].default_value[:3], alpha.default_value)

    pieces = import_meshes(folder/'tripo.glb')
    if not pieces:
        raise ValueError('下载件没有外壳网格')
    for mat in {slot.material for obj in pieces for slot in obj.material_slots if slot.material}:
        shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        alpha = shader.inputs['Alpha']
        if alpha.is_linked or alpha.default_value < .9999:
            raise ValueError('下载外壳含透明材质：'+mat.name+'。请使用只含不透明外壳的下载件')
    # 合并下载件所有网格，保留各自的 UV 与图片材质；程序部件始终独立。
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    shell = pieces[0]
    world = shell.matrix_world.copy()
    shell.parent = None
    if mirror:
        world = Matrix.Diagonal(Vector((1,-1,1,1))) @ world
    shell.data.transform(world)
    if world.to_3x3().determinant() < 0:
        shell.data.flip_normals()
    shell.matrix_world = Matrix.Identity(4)
    shell.name = 'Shell'
    bpy.context.view_layer.update()
    fit_box(shell, target)
    # 留足 LOD0 程序几何，只对焊好 UV 接缝的壳体减面。
    for obj in source.values():
        obj.data.calc_loop_triangles()
    limit = budget - sum(len(obj.data.loop_triangles) for obj in source.values())
    if limit < 1:
        raise ValueError('程序件已用完 LOD0 预算')
    mesh = bmesh.new()
    mesh.from_mesh(shell.data)
    stitch_boundaries(mesh)
    mesh.to_mesh(shell.data)
    mesh.free()
    for _ in range(3):
        shell.data.calc_loop_triangles()
        count = len(shell.data.loop_triangles)
        if count <= limit:
            break
        mod = shell.modifiers.new('外壳预算', 'DECIMATE')
        mod.ratio = .99 * limit / count
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    fit_box(shell, target)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [shell, *source.values()]:
        obj.select_set(True)
    # 导出副本时移除非网格父级，使 GLB 中的节点名直接对应部件名。
    for obj in source.values():
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
    staged = folder/'assembling.glb'
    bpy.ops.export_scene.gltf(filepath=str(staged), use_selection=True, export_format='GLB')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    check = {obj.name: obj for obj in import_meshes(staged)}
    if set(check) != {'Shell', *pivots} or any((check[n].matrix_world.translation-p).length > 1e-5 for n,p in pivots.items()):
        raise ValueError('修补 GLB 回读缺件或枢轴偏移')
    if any((a-b).length > 1e-5 for a,b in zip(mesh_bounds(check['Shell']), target)):
        raise ValueError('修补外壳回读尺寸与游戏外壳不符')
    staged.replace(folder/'repaired.glb')


if __name__ == '__main__':
    directory, spec, budget, *flags = sys.argv[sys.argv.index('--')+1:]
    assemble(Path(directory), json.loads(spec), int(budget), '--mirror-depth' in flags)
