"""把 BlendSwap 23125 的 ficus 盆栽（NeRF 合成集改版）整理成 normalize.py 可读的三级 GLB。

blender -b --factory-startup --disable-autoexec ficus.blend -P tools/art/ficus_prep.py -- 输出目录
输出 lod0.glb（精模）、lod1.glb、lod2.glb（分块凸包树冠），三份物体同名同序，由 normalize.py --lod-sources 读入。
- 删去相机、空面片和光照；保留叶、茎、绑带、支杆、土和盆。
- Mapping 节点烘进 UV；土的 Poliigon 材质只留底色图；叶片透射图丢弃（游戏里不透射）。
- 先按位置缝合（UV 按面角保留），再按部位分配面数。散叶减面会成片消失，远两级的叶子
  改成按格子分块的凸包，贴回叶面，用叶片平均色的 M_Canopy 平涂。
"""
import collections
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

out = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
KEEP = {'Band1', 'Band2', 'Erde', 'plant', 'Stange', 'Stiel1', 'Stiel2', 'Stiel3', 'Stiel4', 'Vase'}
for obj in list(bpy.data.objects):
    if obj.type != 'MESH' or obj.name not in KEEP:
        bpy.data.objects.remove(obj, do_unlink=True)
missing = KEEP - {obj.name for obj in bpy.data.objects}
if missing:
    raise ValueError('ficus.blend 缺少网格：' + '、'.join(sorted(missing)))


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def base_image(mat):
    sock = principled(mat).inputs['Base Color']
    node = sock.links[0].from_node if sock.is_linked else None
    if node and node.type == 'MIX':  # 土：AO × 底色，只留底色图
        node = next(s.links[0].from_node for s in node.inputs if s.is_linked and s.links[0].from_node.name == 'COLOR')
    return node if node and node.type == 'TEX_IMAGE' else None


def mapping_of(tex):
    vec = tex.inputs['Vector']
    if not vec.is_linked or vec.links[0].from_node.type != 'MAPPING':
        return (0, 0), 0.0, (1, 1)
    m = vec.links[0].from_node
    if m.vector_type != 'POINT' or m.inputs['Vector'].links[0].from_socket.name != 'UV':
        raise ValueError(m.name + ' 不是 UV 点映射')
    loc, rot, scale = (m.inputs[k].default_value for k in ('Location', 'Rotation', 'Scale'))
    return (loc[0], loc[1]), rot[2], (scale[0], scale[1])


transforms, leaf_color = {}, None
for mat in {s.material for o in bpy.data.objects for s in o.material_slots if s.material}:
    tex = base_image(mat)
    bsdf = principled(mat)
    for name in ('Transmission Weight', 'Normal', 'Roughness', 'Specular IOR Level'):
        for link in list(bsdf.inputs[name].links):
            mat.node_tree.links.remove(link)
    if tex:
        transforms[mat.name] = mapping_of(tex)
        for link in list(tex.inputs['Vector'].links):
            mat.node_tree.links.remove(link)
        for link in list(bsdf.inputs['Base Color'].links):
            mat.node_tree.links.remove(link)
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if tex.image.packed_file is None:
            raise ValueError(tex.image.name + ' 未打包进 .blend')
        if mat.name == 'Bätter':
            px = np.empty(len(tex.image.pixels), dtype=np.float32)
            tex.image.pixels.foreach_get(px)
            # image.pixels 对 8 位 sRGB 图给的是编码值：先转线性再平均，Unity 导入时会再按 gamma 还原。
            srgb = px.reshape(-1, 4)[:, :3]
            linear = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
            leaf_color = (*linear.mean(axis=0), 1.0)
    bsdf.inputs['Roughness'].default_value = 0.39 if mat.name == 'Vase' else 0.7
    bsdf.inputs['Metallic'].default_value = 0.0
if leaf_color is None:
    raise ValueError('找不到叶片底色图')

# Blender 点映射：v' = R(rot) · (v ∘ scale) + loc，按材质烘进对应面的 UV。
for obj in bpy.data.objects:
    me = obj.data
    uv = me.uv_layers.active.data
    for face in me.polygons:
        mat = obj.material_slots[face.material_index].material if obj.material_slots else None
        if not mat or mat.name not in transforms:
            continue
        (lx, ly), rz, (sx, sy) = transforms[mat.name]
        c, s = math.cos(rz), math.sin(rz)
        for li in face.loop_indices:
            u, v = uv[li].uv
            u, v = u * sx, v * sy
            uv[li].uv = (c * u - s * v + lx, s * u + c * v + ly)
    for slot in obj.material_slots:  # 盆有一个空材质槽
        if slot.material is None:
            slot.material = bpy.data.materials['Vase']

bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.data.objects['Vase']
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def decimate(obj, limit, strict=True):
    """折叠减面到不超过 limit；多碎块网格一次给比例常常过冲，按结果回调比例重试。"""
    have = tris(obj)
    if have <= limit:
        return have
    source, ratio, best, low = obj.data.copy(), limit / have, None, None
    for _ in range(8):
        obj.data = source.copy()
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('减面', 'DECIMATE')
        mod.ratio = min(1.0, ratio)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        got = tris(obj)
        print('  减面', obj.name, have, '比例', round(ratio, 4), '→', got, '/', limit)
        if got <= limit and (best is None or got > best[0]):
            best = (got, obj.data)
        if not strict and (low is None or got < low[0]):
            low = (got, obj.data)
        if limit * .97 <= got <= limit:
            break
        ratio *= (limit * .985) / max(got, 1)
    if best is None and not strict:
        best = low  # 碎叶有折叠下限；LOD0 由 normalize 统一压到总预算
    if best is None:
        raise ValueError(f'{obj.name} 减不到 {limit} 面')
    obj.data = best[1]
    return tris(obj)


# LOD0：按部位分配，叶片占大头；normalize 再统一压到 14000 以内。
LOD0 = {'plant': 7600, 'Vase': 1700, 'Erde': 300, 'Band1': 500, 'Band2': 500, 'Stange': 12,
        'Stiel1': 650, 'Stiel2': 850, 'Stiel3': 800, 'Stiel4': 650}
for obj in bpy.data.objects:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(obj.data)
    bm.free()
    have = tris(obj)
    print('LOD0 部位', obj.name, have, '→', decimate(obj, LOD0[obj.name], strict=False))
base = {obj.name: obj for obj in bpy.data.objects}

canopy_mat = bpy.data.materials.new('Canopy')
canopy_mat.use_nodes = True
cb = principled(canopy_mat)
cb.inputs['Base Color'].default_value = leaf_color
cb.inputs['Roughness'].default_value = 0.7
canopy_mat.diffuse_color = leaf_color


def canopy(src, cell, limit):
    """按格子把叶面分块，各取凸包，减面后贴回最近叶面。"""
    bm = bmesh.new()
    bm.from_mesh(src.data)
    buckets = collections.defaultdict(list)
    for f in bm.faces:
        key = tuple(int(x // cell) for x in f.calc_center_median())
        buckets[key].extend(v.co.copy() for v in f.verts)
    bm.free()
    hull = bmesh.new()
    for pts in buckets.values():
        if len(pts) < 4:
            continue
        res = bmesh.ops.convex_hull(hull, input=[hull.verts.new(p) for p in pts])
        loose = {g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)}
        bmesh.ops.delete(hull, geom=list(loose), context='VERTS')
    mesh = bpy.data.meshes.new('canopy')
    hull.to_mesh(mesh)
    hull.free()
    mesh.materials.append(canopy_mat)
    obj = bpy.data.objects.new('canopy', mesh)
    bpy.context.collection.objects.link(obj)
    # 贴回叶面后不少三角面退化成零面积，导出时会被丢掉。按清理后的面数回调减面目标。
    goal, best = limit, None
    for _ in range(6):
        obj.data = mesh.copy()
        decimate(obj, goal)
        bpy.context.view_layer.objects.active = obj
        wrap = obj.modifiers.new('贴叶面', 'SHRINKWRAP')
        wrap.target = src
        wrap.wrap_method = 'NEAREST_SURFACEPOINT'
        bpy.ops.object.modifier_apply(modifier=wrap.name)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(obj.data)
        obj.data.validate()  # 与 glTF 回读一致：去掉重复面
        bm.free()
        got = tris(obj)
        print('  树冠', cell, '目标', goal, '→ 清理后', got, '/', limit)
        if got <= limit and (best is None or got > best[0]):
            best = (got, obj.data)
        if limit * .97 <= got <= limit or goal >= tris_of(mesh):
            break
        goal = int(goal * limit * .985 / max(got, 1))
    if best is None:
        raise ValueError(f'树冠减不到 {limit} 面')
    obj.data = best[1]
    # 平涂材质也给一套 UV，FBX/Unity 导入不缺通道。
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name='UVMap')
    return obj


def tris_of(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


# 远两级：(叶块格子 m, 树冠面数, 其余部位保留比例)。数值来自轮廓试验，见 unity-port-plan 第 5 批记录。
LEVELS = {1: (0.06, 3900, 0.30), 2: (0.09, 1190, 0.08)}


def export(objs, file):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True, export_apply=True,
                              export_image_format='AUTO', export_animations=False, export_cameras=False, export_lights=False)
    print(file.name, '三角面', sum(map(tris, objs)))


out.mkdir(parents=True, exist_ok=True)
export(list(base.values()), out / 'lod0.glb')
# 远级的盆、茎等从 lod0.glb 回读件减面：glTF 按 UV 缝拆开的网格折叠得动，原 .blend 的细管会卡在约 1/9。
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(out / 'lod0.glb'))
raw = {}
for obj in set(bpy.data.objects) - before:
    if obj.type == 'MESH':
        obj.data.transform(obj.matrix_world)
        obj.matrix_world.identity()
        mesh = obj.data
        for index, mat in enumerate(mesh.materials):  # 回读产生的 .001 材质换回原材质
            mesh.materials[index] = bpy.data.materials[mat.name.rsplit('.', 1)[0] if mat.name.rsplit('.', 1)[-1].isdigit() else mat.name]
        raw[obj.name.split('.')[0]] = mesh
        obj.data = mesh.copy()
    bpy.data.objects.remove(obj, do_unlink=True)
if set(raw) != set(base):
    raise ValueError('lod0.glb 回读零件不符：' + str(sorted(raw)))
for level, (cell, canopy_limit, keep) in LEVELS.items():
    group = []
    for name, obj in base.items():
        if name == 'plant':
            part = canopy(obj, cell, canopy_limit)
        else:
            part = obj.copy()
            part.data = raw[name].copy()
            bpy.context.collection.objects.link(part)
            decimate(part, max(12, int(tris(obj) * keep)))
        group.append(part)
    # 与 LOD0 同名同序，normalize 按名字对齐零件与枢轴。
    for name, part in zip(base, group):
        base[name].name, part.name = name + '_base', name
    export(group, out / f'lod{level}.glb')
    for name, part in zip(list(base), group):
        part.name = name + f'_lod{level}'
        base[name].name = name
    for part in group:
        bpy.data.objects.remove(part, do_unlink=True)
print('叶片平均色（线性）', [round(c, 4) for c in leaf_color[:3]])
