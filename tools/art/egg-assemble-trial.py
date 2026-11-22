"""蛋壳装配试验；坐标与测量均在 Blender 的 Z 向上空间。"""
import json
import math
import runpy
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


shared = runpy.run_path(str(Path(__file__).with_name('egg-split-trial.py')))
meshes, bounds = shared['meshes'], shared['bounds']


def load(path):
    before = set(meshes())
    bpy.ops.import_scene.gltf(filepath=str(path), merge_vertices=True)
    return [obj for obj in meshes() if obj not in before]


def fit(objects, target):
    low, high = bounds(objects)
    dst_low, dst_high = target
    factors = [(dst_high[axis] - dst_low[axis]) / (high[axis] - low[axis]) for axis in range(3)]
    return Matrix.Translation(dst_low) @ Matrix.Diagonal(Vector([*factors, 1])) @ Matrix.Translation(-low)


def bake(obj, transform, pivot):
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.data.transform(Matrix.Translation(-pivot) @ transform @ world)
    obj.matrix_world = Matrix.Translation(pivot)
    obj.data.update()
    bpy.context.view_layer.update()


def surface(objects):
    points, faces = [], []
    for obj in objects:
        offset = len(points)
        points.extend(obj.matrix_world @ vert.co for vert in obj.data.vertices)
        faces.extend([offset + idx for idx in face.vertices] for face in obj.data.polygons)
    return BVHTree.FromPolygons(points, faces, all_triangles=True)


def heights(tree, radius, sectors, upward):
    start, sign = (-1., 1.) if upward else (4., -1.)
    for index in range(sectors):
        angle = math.tau * index / sectors
        hit = tree.ray_cast((radius * math.cos(angle), radius * math.sin(angle), start), (0, 0, sign))[0]
        yield hit.z if hit is not None else np.nan


def hollow(upper, lower):
    # 按实际球冠与环线的旋转包络让位，而非假设一个理想球。
    radii = np.arange(0, 0.711, 0.005)
    tree = surface([lower])
    tops = np.array([max(heights(tree, radius, 144, False)) for radius in radii])
    floor = bounds([upper])[0].z
    profile = [max(tops - 4 * np.maximum(abs(radii - radius) - 0.022, 0)) + 0.018 for radius in radii]
    for vert in upper.data.vertices:
        point = upper.matrix_world @ vert.co
        # 只抬升平盖底内侧；保留外壳、口沿及原有 UV。
        if point.z < floor + 0.010:
            ceiling = np.interp(math.hypot(point.x, point.y), radii, profile)
            vert.co.z += max(0., ceiling - point.z)
    upper.data.update()


def clearance(upper, lower):
    lid_tree, base_tree = surface(upper), surface(lower)

    def sample(start, end):
        gaps = []
        for radius in np.arange(start, end + 0.0001, 0.01):
            gaps.extend(np.array(list(heights(lid_tree, radius, 180, True))) -
                        np.array(list(heights(base_tree, radius, 180, False))))
        finite = np.array(gaps)[np.isfinite(gaps)]
        return dict(min=float(min(finite)), median=float(np.median(finite)), max=float(max(finite)), count=len(finite))

    return dict(core=sample(0, 0.58), rim=sample(0.67, 0.71), contact=sample(0, 0.66),
                intersectingTrianglePairs=len(lid_tree.overlap(base_tree)))


def export_lod(folder, level, originals, target_boxes, pivots):
    root = bpy.data.objects.new(f'office_egg_LOD{level}', None)
    bpy.context.collection.objects.link(root)
    parts, records = {}, {}
    budget = (40000, 16000, 4800)[level]
    ratio = min(1., (budget - 4) / sum(len(obj.data.polygons) for obj in originals.values()))
    for key, original in originals.items():
        obj = original.copy()
        obj.data = original.data.copy()
        obj.parent = root
        bpy.context.collection.objects.link(obj)
        obj.name = f'office_egg_{key.title()}_LOD{level}'
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('按整蛋预算减面', 'DECIMATE')
        mod.ratio, mod.use_collapse_triangulate = ratio, True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.context.view_layer.update()
        bake(obj, fit([obj], target_boxes[key]), pivots[key])
        obj.parent = root
        parts[key] = obj
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *parts.values()]:
        obj.select_set(True)
    path = folder / f'LOD{level}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), use_selection=True, export_format='GLB')
    # 对回读的成品验收，而非只量导出前的网格。
    imported = load(path)
    checked = {key: next(obj for obj in imported if obj.name.startswith(parts[key].name)) for key in parts}
    if len(imported) != 2 or len({obj.parent for obj in imported}) != 1 or imported[0].parent is None:
        raise ValueError('回读层级不是一个根节点、两个网格子节点')
    for key, obj in checked.items():
        box = bounds([obj])
        records[key] = dict(triangles=len(obj.data.polygons), bounds=[list(vec) for vec in box],
                            boundsMaxError=float(np.max(np.abs(np.array(box) - target_boxes[key]))),
                            pivot=list(obj.matrix_world.translation), pivotError=(obj.matrix_world.translation - pivots[key]).length)
    gap = clearance([checked['upper']], [checked['lower']])
    # 再抽查匀升、匀转的四个中间/终点姿态，不等同于连续碰撞检测。
    lid = checked['upper']
    rest = lid.matrix_world.copy()
    base_tree = surface([checked['lower']])
    motion_pairs = []
    for fraction in (0.25, 0.5, 0.75, 1.):
        lid.matrix_world = (Matrix.Translation(Vector((0, 0, 0.9 * fraction))) @ rest @
                            Matrix.Rotation(math.radians(45 * fraction), 4, 'Z'))
        bpy.context.view_layer.update()
        motion_pairs.append(len(surface([lid]).overlap(base_tree)))
    lid.matrix_world = rest
    bpy.context.view_layer.update()
    if (gap['intersectingTrianglePairs'] or any(motion_pairs) or gap['contact']['min'] <= 0 or
            max(max(rec['boundsMaxError'], rec['pivotError']) for rec in records.values()) > 1e-5 or
            sum(rec['triangles'] for rec in records.values()) > budget):
        raise ValueError(f'LOD{level} 装配验收失败：{records}, {gap}')
    return checked, dict(parts=records, clearance=gap, motionPairsAtQuarterSteps=motion_pairs)


def pair_images(folder, reference):
    import OpenImageIO as oiio
    for name in [*shared['views'], 'action', 'action-low']:
        inputs = [oiio.ImageBuf(str(path / f'{name}.png')).get_pixels(oiio.UINT8) for path in [folder, reference]]
        sheet = oiio.ImageBuf(np.ascontiguousarray(np.concatenate(inputs, axis=1)))
        if not sheet.write(str(folder / f'{name}-pair.png')):
            raise ValueError(sheet.geterror())


def assemble(source, out):
    assets = source / 'art-src/tripo/batch1/office_egg'
    separate, segmented = out / 'separate', out / 'tripo-seg'
    separate.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    game = load(assets / 'game.glb')
    lid = max({obj.parent for obj in game}, key=lambda obj: obj.matrix_world.translation.z)
    upper_ref = [obj for obj in game if obj.parent == lid]
    lower_ref = [obj for obj in game if obj.parent != lid]
    if len(upper_ref) != 2 or len(lower_ref) != 8 or abs(lid.matrix_world.translation.z - 1.6) > 1e-5:
        raise ValueError('游戏原模的分组或标尺已变，请重新标定')
    boxes = {'upper': bounds(upper_ref), 'lower': bounds(lower_ref)}
    low, high = boxes['lower']
    pivots = {'upper': lid.matrix_world.translation.copy(), 'lower': Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z))}
    originals = {}
    for key in boxes:
        obj, = load(out / 'incoming' / f'{key}.glb')
        bake(obj, fit([obj], boxes[key]), pivots[key])
        originals[key] = obj
    upper, lower = originals['upper'], originals['lower']
    report = dict(gameBounds={key: [list(vec) for vec in box] for key, box in boxes.items()},
                  reference=clearance(upper_ref, lower_ref), beforeHollow=clearance([upper], [lower]), lods={})
    hollow(upper, lower)
    for level in range(3):
        checked, result = export_lod(separate, level, originals, boxes, pivots)
        report['lods'][f'LOD{level}'] = result
        if level == 0:
            hero = checked
    (separate / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    segments = load(assets / 'tripo-split.glb')
    moving, = [obj for obj in segments if obj.name == 'tripo_part_2']
    if len(segments) != 6 or moving != max(segments, key=lambda obj: bounds([obj])[1].z):
        raise ValueError('智能分件的上壳或件数已变，请重新标定')
    transform = fit(segments, bounds(game))
    for obj in segments:
        bake(obj, transform, pivots['upper' if obj == moving else 'lower'])
    shared['setup_render']()
    shared['render'](separate, [lower], Vector((0, 0, 1.76)), 4.4, {'lower-source': (0.4, -1, 0.27)})
    reference = separate / 'game'
    for folder, parts, active in [(reference, game, lid), (separate, list(hero.values()), hero['upper']), (segmented, segments, moving)]:
        shared['render_poses'](folder, parts, active)
    for folder in (separate, segmented):
        pair_images(folder, reference)


if __name__ == '__main__':
    assemble(*map(Path, sys.argv[sys.argv.index('--') + 1:]))
