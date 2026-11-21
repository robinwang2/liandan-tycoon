"""静态道具规范化。通过 normalize.mjs 调用；所有 LOD 共用底部原点和材质，不合并零件。"""
import argparse
import json
import math
import re
import sys
import struct
import tempfile
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def import_glb(file):
    # Blender 会忽略网页合批用的 _ARM。借用这些无 UV 网格的第一套 UV 传入两个归一化通道。
    blob = file.read_bytes()
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20+length])
    changed = False
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            if '_ARM' in attrs:
                if 'TEXCOORD_0' in attrs:
                    raise ValueError('网页合批网格已有 UV，不能借用此通道传入粗糙度和金属度')
                attrs['TEXCOORD_0'] = attrs.pop('_ARM')
                mesh.setdefault('extras', {})['webRM'] = True
                changed = True
    if not changed:
        bpy.ops.import_scene.gltf(filepath=str(file.resolve()))
        return
    header = json.dumps(doc).encode()
    header += b' ' * (-len(header) % 4)
    tail = blob[20+length:]
    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp)/file.name
        staged.write_bytes(struct.pack('<4sIII4s', b'glTF', 2, 20+len(header)+len(tail), len(header), b'JSON') + header + tail)
        bpy.ops.import_scene.gltf(filepath=str(staged))


def load(file):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    importer = {'.glb': bpy.ops.import_scene.gltf, '.fbx': bpy.ops.import_scene.fbx}[file.suffix.lower()]
    if file.suffix.lower() == '.glb':
        import_glb(file)
    else:
        importer(filepath=str(file.resolve()))
    meshes = sorted((obj for obj in bpy.context.scene.objects if obj.type == 'MESH'), key=lambda obj: obj.name)
    if not meshes:
        raise ValueError('输入没有网格')
    return meshes


def bounds(objects):
    coords = np.array([tuple(obj.matrix_world @ vertex.co) for obj in objects for vertex in obj.data.vertices])
    return coords.min(axis=0), coords.max(axis=0)


def dimensions(low, high):
    return dict(zip(('width', 'depth', 'height'), (high-low).tolist()))


def clean(mesh):
    # 只在拥有同一组 UV、拐角法线及材质的顶点之间焊接。避免把硬边或 UV 岛焊穿。
    signatures = [set() for vertex in mesh.vertices]
    for face in mesh.polygons:
        for index in face.loop_indices:
            signatures[mesh.loops[index].vertex_index].add((face.material_index, tuple(mesh.corner_normals[index].vector),
                tuple(tuple(layer.uv[index].vector) for layer in mesh.uv_layers)))
    # 源拐角法线提供局部朝向参考。单靠 recalc 会把不封闭且被 UV 切开的壳片整片翻反。
    references = [sum((mesh.corner_normals[index].vector for index in face.loop_indices), Vector()).normalized()
                  for face in mesh.polygons]
    groups = {}
    bm = bmesh.new()
    bm.from_mesh(mesh)
    before = len(bm.verts)
    for vertex in bm.verts:
        groups.setdefault(frozenset(signatures[vertex.index]), []).append(vertex)
    for vertices in groups.values():
        if len(vertices) > 1:
            bmesh.ops.remove_doubles(bm, verts=vertices, dist=1e-6)
    # 原模型可能有重合但独立的装饰件，焊接不能以引入非流形边为代价。
    if any(len(edge.link_faces) > 2 for edge in bm.edges):
        bm.free()
        bm = bmesh.new()
        bm.from_mesh(mesh)
    merged = before - len(bm.verts)
    source_normals = {face: references[face.index] for face in bm.faces if face.index >= 0}
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    remaining = set(bm.faces)
    while remaining:
        component = [remaining.pop()]
        open_shell = False
        for face in component:
            for edge in face.edges:
                open_shell |= not edge.is_manifold
                for other in edge.link_faces:
                    if other in remaining:
                        remaining.remove(other)
                        component.append(other)
        if open_shell and sum(face.calc_area()*face.normal.dot(source_normals[face]) for face in component if face in source_normals) < 0:
            bmesh.ops.reverse_faces(bm, faces=component)
    bmesh.ops.triangulate(bm, faces=[face for face in bm.faces if len(face.verts) > 3])
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return merged


def save_png(image, name):
    image.name = name
    image.filepath_raw = str(out / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    return name + '.png'


def palette(objects):
    # 网页灰模的底色在 COLOR_0，并非白色贴图。URP/Lit 不读顶点色，把平涂色移到 UV 色带。
    colored = [obj for obj in objects if obj.data.color_attributes.active_color and (not obj.data.uv_layers or obj.data.get('webRM'))]
    if not colored:
        return
    colors = {}
    for obj in colored:
        mesh = obj.data
        attr = mesh.color_attributes.active_color
        packed = mesh.get('webRM')
        uv = mesh.uv_layers.active if packed else mesh.uv_layers.new(name='Palette')
        for face in mesh.polygons:
            indices = list(face.loop_indices)
            swatches = {tuple(attr.data[index if attr.domain == 'CORNER' else mesh.loops[index].vertex_index].color) for index in indices}
            if len(swatches) != 1:
                raise ValueError('顶点色含渐变，需要单独烘焙')
            color = swatches.pop()
            # glTF 导入 UV 时 V 被翻转，故原始金属度为 1-V。
            rm = tuple(uv.uv[indices[0]].vector) if packed else (0.8,1)
            slot = colors.setdefault((color, rm), len(colors))
            for index in indices:
                uv.uv[index].vector = (slot + .5, .5)
    image = bpy.data.images.new('色带', len(colors)*16, 16, alpha=True)
    def paint(target, entries):
        target.pixels.foreach_set(np.tile(np.repeat(np.array(entries, dtype=np.float32), 16, axis=0), (16, 1)).ravel())
    paint(image, [color for color, rm in colors])
    mask = bpy.data.images.new('网页材质色带', len(colors)*16, 16, alpha=True, is_data=True)
    paint(mask, [(1, rm[0], 1-rm[1], 1) for color, rm in colors])
    materials = set()
    for obj in colored:
        for coord in obj.data.uv_layers.active.uv:
            coord.vector.x /= len(colors)
        materials.update(obj.data.materials)
    for mat in materials:
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
        mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
        if any(obj.data.get('webRM') and mat in list(obj.data.materials) for obj in colored):
            texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
            texture.image = mask
            split = mat.node_tree.nodes.new('ShaderNodeSeparateColor')
            mat.node_tree.links.new(texture.outputs['Color'],split.inputs[0])
            mat.node_tree.links.new(split.outputs['Green'],bsdf.inputs['Roughness'])
            mat.node_tree.links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])


def image_source(socket):
    if socket.is_linked:
        link = socket.links[0]
        node = link.from_node
        if node.type == 'TEX_IMAGE':
            return node.image, 0
        if node.type == 'NORMAL_MAP':
            return image_source(node.inputs['Color'])
        if node.type == 'SEPARATE_COLOR':
            image, _ = image_source(node.inputs[0])
            return image, list(node.outputs).index(link.from_socket)
    return None, 0


def textures(mat, stem):
    nodes = mat.node_tree.nodes
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    sockets = shader.inputs
    info = {'name': mat.name, 'baseColor': list(sockets['Base Color'].default_value),
            'metallic': sockets['Metallic'].default_value, 'smoothness': 1-sockets['Roughness'].default_value}
    for key, role in [('Base Color','BaseColor'), ('Normal','Normal')]:
        image, _ = image_source(sockets[key])
        if image:
            info[role] = save_png(image, 'T_' + stem + '_' + role)
            if role == 'BaseColor':
                info['baseColor'] = [1, 1, 1, 1]
    ao = next((node.inputs.get('Occlusion') for node in nodes if node.type == 'GROUP' and node.inputs.get('Occlusion')), None)
    channels = [image_source(ao) if ao else (None,0), image_source(sockets['Roughness']), image_source(sockets['Metallic'])]
    images = [image for image, channel in channels if image]
    if images:
        width, height = images[0].size
        data = np.ones((height*width,4), dtype=np.float32)
        for index, (image, channel) in enumerate(channels):
            if image:
                if tuple(image.size) != (width, height):
                    raise ValueError('ORM 各通道分辨率不同，请先重采样')
                pixels = np.empty(data.size, dtype=np.float32)
                image.pixels.foreach_get(pixels)
                data[:,index] = pixels[channel::4]
            else:
                data[:,index] = [1, 1-info['smoothness'], info['metallic']][index]
        for role, pixels in [('ORM',data), ('LitMask',np.column_stack((data[:,2],data[:,0],data[:,3],1-data[:,1])))]:
            mask = bpy.data.images.new(role, width, height, alpha=True, is_data=True)
            mask.pixels.foreach_set(pixels.ravel())
            info[role] = save_png(mask, 'T_'+stem+'_'+role)
    return info


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def reduce(obj, ratio):
    if ratio < 1:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('减面', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--budget', type=int, default=40000)
parser.add_argument('--name', default='Furnace')
parser.add_argument('--rotate-z', type=float, default=0)
target = parser.add_mutually_exclusive_group(required=True)
target.add_argument('--height', type=float)
target.add_argument('--reference', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
start = time.monotonic()
out = args.out.resolve()
out.mkdir(parents=True, exist_ok=True)
if not re.fullmatch('[A-Za-z][A-Za-z0-9_]*', args.name) or args.budget < 1:
    raise ValueError('名称或面数预算无效')
height = args.height
if args.reference:
    height = dimensions(*bounds(load(args.reference)))['height']
if not math.isfinite(height) or height <= 0:
    raise ValueError('目标高度必须为正数')
objects = load(args.source)
rotation = Matrix.Rotation(math.radians(args.rotate_z), 4, 'Z')
worlds = [rotation @ obj.matrix_world.copy() for obj in objects]
for obj, world in zip(objects, worlds):
    obj.parent = None
    obj.data = obj.data.copy()
    obj.data.transform(world)
    obj.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
low, high = bounds(objects)
factor = height / (high-low)[2]
offset = Vector(((high[0]+low[0])/2, (high[1]+low[1])/2, low[2]))
palette(objects)
merged = 0
for obj in objects:
    obj.data.transform(Matrix.Scale(factor,4) @ Matrix.Translation(-offset))
    merged += clean(obj.data)
materials = sorted({mat for obj in objects for mat in obj.data.materials if mat}, key=lambda mat: mat.name)
records = []
for index, mat in enumerate(materials):
    stem = args.name + (f'_{index+1:02}' if index else '')
    mat.name = 'M_' + stem
    records.append(textures(mat, stem))
initial = sum(map(triangles,objects))
for obj in objects:
    reduce(obj,min(1,args.budget/initial))
# 多零件的边界和取整可能使第一次减面稍超预算，不应导出超标的 LOD0。
for attempt in range(4):
    current = sum(map(triangles,objects))
    if current <= args.budget:
        break
    for obj in objects:
        reduce(obj, .98*args.budget/current)
lods = []
exported = []
for level, ratio in enumerate([1,.4,.12]):
    group = []
    for index, original in enumerate(objects):
        obj = original
        if level:
            obj = original.copy()
            obj.data = original.data.copy()
            bpy.context.collection.objects.link(obj)
            reduce(obj,ratio)
        suffix = '' if len(objects)==1 else f'_Part{index+1:02}'
        obj.name = f'SM_{args.name}{suffix}_LOD{level}'
        obj.data.name = obj.name
        group.append(obj)
    count = sum(map(triangles,group))
    if count > args.budget or not count:
        raise ValueError(f'LOD{level} 面数不合格：{count}')
    # 减面可能让脚底穿地（试验中 LOD2 低了约 1 cm）；整组平移，不单独移动耳、足或盖。
    floor, ceiling = bounds(group)
    center = (floor+ceiling)/2
    center[2] = floor[2]
    for obj in group:
        obj.data.transform(Matrix.Translation(-Vector(center)))
    lods.append(dict(level=level, triangles=count, size=dimensions(floor,ceiling), origin=[0,0,0], parts=[obj.name for obj in group]))
    exported.extend(group)
bpy.ops.object.select_all(action='DESELECT')
for obj in exported:
    obj.select_set(True)
model = 'SM_'+args.name+'.fbx'
bpy.ops.export_scene.fbx(filepath=str(out/model), use_selection=True, object_types={'MESH'}, axis_forward='-Z', axis_up='Y',
                         apply_scale_options='FBX_SCALE_UNITS', bake_space_transform=True, bake_anim=False, path_mode='RELATIVE')
report = dict(source=args.source.name, model=model, budget=args.budget, targetHeight=height, scale=factor, rotateZ=args.rotate_z,
              sourceSize=dimensions(low,high), normals='按连通面统一绕序；开口壳片按源拐角法线面积投票校正朝向，保留 UV 接缝与硬边', weldToleranceMeters=1e-6,
              mergedVertices=merged, lods=lods, materials=records, seconds=round(time.monotonic()-start,2),
              movingParts='保留输入网格；Tripo 整体炉盖暂不切。后续选 Tripo 分件、按高度切并封口或单独生成炉盖，再设枢轴。')
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(model, [lod['triangles'] for lod in lods], report['seconds'])
