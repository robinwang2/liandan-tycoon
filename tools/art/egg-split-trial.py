"""在蛋的局部坐标中试切三个 LOD，并输出同机位动作对照和拆件上传图。"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


def meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']


def bounds(objects):
    points = [obj.matrix_world @ vert.co for obj in objects for vert in obj.data.vertices]
    return [Vector(fn(point[axis] for point in points) for axis in range(3)) for fn in (min, max)]


def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*color, 1)
    return mat


def component_sizes(bm):
    remaining = set(bm.verts)
    sizes = []
    while remaining:
        queue = [remaining.pop()]
        for vert in queue:
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other in remaining:
                    remaining.remove(other)
                    queue.append(other)
        sizes.append(len(queue))
    return sorted(sizes, reverse=True)


def closed_lod(source, target):
    # 已发布的低模有不匹配的 UV 岛边界；从同一闭合高模重新减面，目标沿用原低模预算。
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = target.name + '_Closed'
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bm.to_mesh(obj.data)
    bm.free()
    modifier = obj.modifiers.new('闭合后减面', 'DECIMATE')
    modifier.ratio = len(target.data.polygons) / len(source.data.polygons)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def split(source, upper, cut, cap):
    name = source.name.removesuffix('_Closed').replace('office_egg', 'office_egg_' + ('Upper' if upper else 'Lower'))
    data = source.data.copy()
    data.name = name
    data.materials.append(cap)
    bm = bmesh.new()
    bm.from_mesh(data)
    bm.transform(source.matrix_world)
    # 只焊接同位点；UV 在面角上。先验证输入闭合，再封新产生的边，不顺手补原洞。
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    if any(not edge.is_manifold for edge in bm.edges):
        raise ValueError(f'{name}：源模型焊合后仍不闭合')
    bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=1e-7,
                           plane_co=cut, plane_no=(0, 0, 1), clear_inner=upper, clear_outer=not upper)
    rim = [edge for edge in bm.edges if edge.is_boundary]
    if not rim or any(abs(vert.co.z - cut.z) > 1e-5 for edge in rim for vert in edge.verts):
        raise ValueError(f'{name}：切口不在预期平面')
    # 本试验仅接受围绕竖轴的单环星形截面；三角扇避免窄长耳切面，不跨洞填充。
    ring = sorted({vert for edge in rim for vert in edge.verts},
                  key=lambda vert: math.atan2(vert.co.y - cut.y, vert.co.x - cut.x))
    pairs = list(zip(ring, ring[1:] + ring[:1]))
    if {frozenset(edge.verts) for edge in rim} != {frozenset(pair) for pair in pairs}:
        raise ValueError(f'{name}：存在多环、回折或碎片，不能直接封盘')
    center = bm.verts.new(cut)
    for first, second in pairs:
        face = bm.faces.new((center, second, first) if upper else (center, first, second))
        face.material_index = len(data.materials) - 1
    bmesh.ops.triangulate(bm, faces=[face for face in bm.faces if len(face.verts) > 3])
    sizes = component_sizes(bm)
    bad = sum(not edge.is_manifold or not edge.is_contiguous for edge in bm.edges)
    if len(sizes) != 1 or bad:
        raise ValueError(f'{name}：连通块 {sizes}，非流形或绕序异常边 {bad}')
    origin = cut if upper else Vector((0, 0, 0))
    bm.transform(Matrix.Translation(-origin))
    bm.to_mesh(data)
    bm.free()
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = origin
    return obj, {'triangles': len(data.polygons), 'capTriangles': len(rim), 'components': len(sizes),
                 'badEdges': bad, 'pivot': list(origin)}


def light(position, power, size):
    bpy.ops.object.light_add(type='AREA', location=position)
    obj = bpy.context.object
    obj.rotation_euler = (Vector((0, 0, 1.5)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    obj.data.energy, obj.data.shape, obj.data.size = power, 'DISK', size


def render(folder, objects, target, scale, directions, gray=False):
    folder.mkdir(parents=True, exist_ok=True)
    for obj in meshes():
        obj.hide_render = obj not in objects
    scene.view_layers[0].material_override = clay if gray else None
    camera.data.ortho_scale = scale
    for name, direction in directions.items():
        camera.location = target + Vector(direction).normalized() * 9
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(folder / (name + '.png'))
        bpy.ops.render.render(write_still=True)


views = {'front': (0, -1, 0), 'right': (1, 0, 0), 'back': (0, 1, 0), 'left': (-1, 0, 0)}

def setup_render():
    global scene, camera, clay
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('柔光背景')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.48, 0.52, 0.57, 1)
    light((3, -4, 6), 380, 4)
    light((-3, 2, 4), 240, 3)
    bpy.ops.object.camera_add()
    camera = scene.camera = bpy.context.object
    camera.data.type = 'ORTHO'
    clay = material('参考灰模', (0.40, 0.40, 0.40))


def render_poses(folder, parts, moving):
    render(folder, parts, Vector((0, 0, 1.315)), 3.05, views)
    rest = moving.matrix_world.copy()
    center = rest.translation
    moving.matrix_world = (Matrix.Translation(center + Vector((0, 0, 0.9))) @
                           Matrix.Rotation(math.radians(45), 4, 'Z') @ Matrix.Translation(-center) @ rest)
    render(folder, parts, Vector((0, 0, 1.76)), 4.4, {'action': (0.4, -1, 0.27), 'action-low': (0.4, -1, -0.20)})
    moving.matrix_world = rest
    bpy.context.view_layer.update()


if __name__ == '__main__':
    source, out = map(Path, sys.argv[sys.argv.index('--') + 1:])
    assets = source / 'art-src/tripo/batch1/office_egg'
    fbx, = (source / 'unity/Game/Assets/Art/Props').glob('**/SM_office_egg.fbx')
    meta = json.loads(fbx.with_name('report.json').read_text(encoding='utf-8-sig'))
    for filename, key in [('game.glb', 'refSha'), ('tripo.glb', 'sha')]:
        if hashlib.sha256((assets / filename).read_bytes()).hexdigest() != meta[key]:
            raise ValueError(f'{filename} 与规范化报告不匹配')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(assets / 'game.glb'))
    game = meshes()
    # 三组分别是底座、下壳（含核）、上壳。用各自的组变换识别，不按顶点高度误分内核。
    lid_group = max({obj.parent for obj in game}, key=lambda obj: obj.matrix_world.translation.z)
    upper_ref = [obj for obj in game if obj.parent == lid_group]
    lower_ref = [obj for obj in game if obj not in upper_ref]
    pivot = lid_group.matrix_world.translation.copy()
    if len(upper_ref) != 2 or len(lower_ref) != 8 or abs(pivot.z - 1.6) > 1e-5:
        raise ValueError('游戏原模层级或比例变化，请重新标定')
    ref_boxes = {key: [list(point) for point in bounds(parts)] for key, parts in [('upper', upper_ref), ('lower', lower_ref)]}
    # 原模金边最低点再向下留 0.01，落在 Tripo 环形颈部，而非横切金边。
    cut = Vector((pivot.x, pivot.y, ref_boxes['upper'][0][2] - 0.01))
    bpy.ops.import_scene.fbx(filepath=str(fbx))
    lods = sorted(set(meshes()) - set(game), key=lambda obj: obj.name)
    if [obj.name[-4:] for obj in lods] != ['LOD0', 'LOD1', 'LOD2']:
        raise ValueError('预期每级一个已规范化网格')
    texture = next(node.image for mat in lods[0].data.materials for node in mat.node_tree.nodes if node.type == 'TEX_IMAGE')
    texture.filepath = str(fbx.with_name('T_office_egg_BaseColor.png'))
    texture.reload()
    if tuple(texture.size) != (2048, 2048):
        raise ValueError('底色贴图缺失或分辨率不符')
    cap = material('M_office_egg_Cut', (0.055, 0.061, 0.068))
    report = {'fbx': str(fbx.relative_to(source)), 'gamePivot': list(pivot), 'gameBounds': ref_boxes,
              'cut': list(cut), 'lift': 0.9, 'yawDegrees': 45, 'lods': {}}
    levels = []
    for lod in lods:
        parts = []
        records = {}
        closed = lod if lod == lods[0] else closed_lod(lods[0], lod)
        for upper in (False, True):
            obj, record = split(closed, upper, cut, cap)
            parts.append(obj)
            records['upper' if upper else 'lower'] = record
        key = lod.name[-4:]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(out / (key + '.glb')), use_selection=True, export_format='GLB')
        report['lods'][key] = records
        levels.append(parts)
    setup_render()
    for key, parts in [('upper', upper_ref), ('lower', lower_ref)]:
        low, high = bounds(parts)
        render(out / 'upload' / key, parts, (low + high) / 2, max(high - low) * 1.15, views, True)
    for key, parts, moving in [('cut', levels[0], levels[0][1]), ('game', game, lid_group)]:
        render_poses(out / key, parts, moving)
    (out / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
