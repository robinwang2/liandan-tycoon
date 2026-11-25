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

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from seam_weld import stitch_boundaries
from lod_integrity import compare


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
    coords = np.array([tuple(obj.matrix_world @ obj.data.vertices[index].co) for obj in objects
                       for index in {loop.vertex_index for loop in obj.data.loops}])
    if not coords.size:
        raise ValueError('没有可测量的网格面')
    return coords.min(axis=0), coords.max(axis=0)


def dimensions(low, high):
    return dict(zip(('width', 'depth', 'height'), (high-low).tolist()))


def clean(mesh):
    # 源拐角法线提供局部朝向参考。单靠 recalc 会把不封闭且被 UV 切开的壳片整片翻反。
    references = [sum((mesh.corner_normals[index].vector for index in face.loop_indices), Vector()).normalized()
                  for face in mesh.polygons]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    source_normals = {face: references[face.index] for face in bm.faces if face.index >= 0}
    merged = stitch_boundaries(bm)
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
    strength = sockets['Emission Strength'].default_value
    if strength and any(sockets['Emission Color'].default_value[:3]):
        info['emission'] = [value*strength for value in sockets['Emission Color'].default_value[:3]]
    for key, role in [('Base Color','BaseColor'), ('Normal','Normal')]:
        image, _ = image_source(sockets[key])
        tint = [1,1,1,1]
        if args.hybrid and key == 'Base Color' and sockets[key].is_linked:
            # glTF 的底图乘底色因子会导入为 Mix 节点。保留纹理和线性乘色。
            node = sockets[key].links[0].from_node
            if node.type == 'MIX' and node.blend_type == 'MULTIPLY':
                a, b = [s for s in node.inputs if s.enabled and s.type == 'RGBA']
                if b.is_linked:
                    a, b = b, a
                if a.is_linked and not b.is_linked:
                    image, _ = image_source(a)
                    tint = list(b.default_value)
        if image:
            info[role] = save_png(image, 'T_' + stem + '_' + role)
            if role == 'BaseColor':
                info['baseColor'] = tint
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
        # 微小连通件折到最后可能剩下一对重复的三角面，FBX 导入器会删掉其中一面。
        obj.data.validate(clean_customdata=False)


def hybrid_reduction(counts, goal, limit, legacy):
    if legacy:
        # 只用于复现修复前已经交付的 FBX。
        fixed = sum(n for name, n in counts.items() if name != 'Shell' and n <= 320)
        keep = min(1, .98 * (limit-fixed) / (sum(counts.values())-fixed))
        ratios = {name: keep if name == 'Shell' or n > 320 else 1. for name, n in counts.items()}
        return ratios, math.ceil(fixed + keep * (sum(counts.values()) - fixed))

    # 给玻璃及小程序件保留原网格。大程序件独立分配，只在整级额度紧张时简化。
    ratios = dict.fromkeys(counts, 1.)
    large = {name: n for name, n in counts.items() if name not in ('Shell', 'Glass') and n > 320}
    fixed = sum(n for name, n in counts.items() if name != 'Shell' and name not in large)
    available = limit - fixed
    if available <= 0:
        raise ValueError(f'玻璃及小程序件占 {fixed} 面，该级预算 {limit} 面，外壳没有剩余额度')
    if large and sum(large.values()) > available / 2:
        # 通常保留七成；多轮车辆等程序几何本身超预算时，至少留出剩余额度的四分之一给壳。
        keep = min(.70, .75 * available / sum(large.values()))
        ratios.update(dict.fromkeys(large, keep))
    program = sum(math.ceil(n * ratios[name]) for name, n in counts.items() if name != 'Shell')
    if program >= limit:
        raise ValueError(f'程序件预留 {program} 面，该级预算 {limit} 面，外壳没有剩余额度')
    if program >= goal:
        goal = limit
    ratios['Shell'] = min(1., (goal - program) / counts['Shell'])
    return ratios, goal


def flatten_rack_sides(shell):
    # 两块外侧钢板本来接近平面。只校正外侧 4 mm 的板面，不抹掉门框、倒角和原 UV。
    mesh = shell.data
    low, high = bounds([shell])
    normals = [corner.vector.copy() for corner in mesh.corner_normals]
    for face in mesh.polygons:
        sign = 1 if face.normal.x > 0 else -1
        plane = high[0] if sign == 1 else low[0]
        if abs(face.normal.x) < .94 or any(abs(mesh.vertices[index].co.x-plane)>.004 for index in face.vertices):
            continue
        for index in face.vertices:
            mesh.vertices[index].co.x = plane
        for index in face.loop_indices:
            normals[index] = (sign,0,0)
    mesh.update()
    mesh.normals_split_custom_set(normals)


def simplify_rack_shell(shell, limit):
    # 开过 12 行面板的薄外壳和内夹层在远级不能一起直接塌边。先向内加厚，再取等值面。
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform, closest_point_on_tri

    source = shell.data.copy()
    source.calc_loop_triangles()
    coords = [v.co.copy() for v in source.vertices]
    tree = BVHTree.FromPolygons(coords, [tri.vertices[:] for tri in source.loop_triangles], all_triangles=True)
    bpy.context.view_layer.objects.active = shell
    solid = shell.modifiers.new('机柜薄板内壁', 'SOLIDIFY')
    solid.thickness = .018
    solid.offset = -1
    bpy.ops.object.modifier_apply(modifier=solid.name)
    voxel = shell.modifiers.new('远级机柜外壳', 'REMESH')
    voxel.mode = 'VOXEL'
    voxel.voxel_size = .014
    bpy.ops.object.modifier_apply(modifier=voxel.name)
    reduce(shell, min(1, limit / triangles(shell)))

    # 为远级三角面在原外壳上取色。三个角投到同一个源三角形内，防止插值穿过图集的其他 UV 岛。
    mesh = shell.data
    mesh.materials.clear()
    for mat in source.materials:
        mesh.materials.append(mat)
    source_uv = source.uv_layers.active
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name=source_uv.name)
    for face in mesh.polygons:
        _, _, index, _ = tree.find_nearest(face.center)
        tri = source.loop_triangles[index]
        face.material_index = tri.material_index
        xyz = [coords[i] for i in tri.vertices]
        tex = [source_uv.uv[i].vector.to_3d() for i in tri.loops]
        for i in face.loop_indices:
            point = closest_point_on_tri(mesh.vertices[mesh.loops[i].vertex_index].co, *xyz)
            uv.uv[i].vector = barycentric_transform(point, *xyz, *tex).xy
    bpy.data.meshes.remove(source)
    mesh.update()


def panel_signature(front):
    # 回读 FBX 后按三角形和材质比对，而不是只数面；包括灯、槽和它们相对机身的位置。
    mesh = front.data
    mesh.calc_loop_triangles()
    points = [tuple(round(axis,6) for axis in front.matrix_world @ vertex.co) for vertex in mesh.vertices]
    uv = mesh.uv_layers.active
    return sorted((mesh.materials[face.material_index].name,
                   sorted((points[v], tuple(uv.uv[i].vector) if uv else ()) for v, i in zip(face.vertices, face.loops)))
                  for face in mesh.loop_triangles)


parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--budget', type=int, default=40000)
parser.add_argument('--name', default='Furnace')
parser.add_argument('--rotate-z', type=float, default=0)
parser.add_argument('--mirror-depth', action='store_true')
parser.add_argument('--hybrid', action='store_true')
parser.add_argument('--lod-limits')
parser.add_argument('--lod-targets', default='0,0')
parser.add_argument('--legacy-hybrid', action='store_true')
# 预制远级：逗号分隔的 LOD1、LOD2 GLB，零件与主件同名同序，不再自动减面（散叶植物用）。
parser.add_argument('--lod-sources')
# 按件放宽的 LOD 完整性门槛：--min-iou 依次给 LOD1、LOD2；--max-interior-loss 两级共用。
parser.add_argument('--min-iou')
parser.add_argument('--max-interior-loss', type=float)
parser.add_argument('--width', type=float)
parser.add_argument('--depth', type=float)
parser.add_argument('--origin', choices=['bottom','wall','ceiling'], default='bottom')
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
extra_levels = []
for file in (args.lod_sources.split(',') if args.lod_sources else []):
    if args.hybrid or args.mirror_depth or args.rotate_z:
        raise ValueError('预制远级只支持整件、不旋转、不镜像')
    known = set(bpy.data.objects)
    import_glb(Path(file))
    base = lambda name: name.rsplit('.', 1)[0] if name.rsplit('.', 1)[-1].isdigit() else name
    found = {base(obj.name): obj for obj in set(bpy.data.objects) - known if obj.type == 'MESH'}
    if sorted(found) != sorted(obj.name for obj in objects):
        raise ValueError(f'{file} 的零件 {sorted(found)} 与主件 {sorted(obj.name for obj in objects)} 不符')
    level_objects = [found[obj.name] for obj in objects]
    for obj in level_objects:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.data = obj.data.copy()
        obj.data.transform(world)
        obj.matrix_world = Matrix.Identity(4)
        # 回读产生的同名 .001 材质换回主件材质，保证各级共用一份贴图与材质记录。
        for slot, mat in enumerate(obj.data.materials):
            if mat and base(mat.name) != mat.name and base(mat.name) in bpy.data.materials:
                obj.data.materials[slot] = bpy.data.materials[base(mat.name)]
    extra_levels.append(level_objects)
rotation = Matrix.Rotation(math.radians(args.rotate_z), 4, 'Z')
if args.mirror_depth:
    rotation = Matrix.Diagonal(Vector((1, -1, 1, 1))) @ rotation
worlds = [rotation @ obj.matrix_world.copy() for obj in objects]
for obj, world in zip(objects, worlds):
    obj.parent = None
    obj.data = obj.data.copy()
    mesh = obj.data
    reverse = world.to_3x3().determinant() < 0
    # 翻面会重排面角。按原面的顶点对应自定义法线，UV 随原面角走，不翻贴图。
    normals = None
    if reverse and mesh.has_custom_normals:
        basis = world.to_3x3().inverted().transposed()
        normals = [{mesh.loops[i].vertex_index: (basis @ mesh.corner_normals[i].vector).normalized()
                    for i in face.loop_indices} for face in mesh.polygons]
    mesh.transform(world)
    if reverse:
        mesh.flip_normals()
        if normals is not None:
            mesh.normals_split_custom_set([normals[face.index][mesh.loops[i].vertex_index]
                                           for face in mesh.polygons for i in face.loop_indices])
    obj.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
low, high = bounds(objects)
factor = height / (high-low)[2]
def anchor(low, high):
    return Vector(((high[0]+low[0])/2, high[1] if args.origin=='wall' else (low[1]+high[1])/2,
                   high[2] if args.origin=='ceiling' else low[2]))


offset = anchor(low,high)
factors = [args.width/(high[0]-low[0]) if args.width else factor, args.depth/(high[1]-low[1]) if args.depth else factor, factor]
transform = Matrix.Diagonal(Vector([*factors,1])) @ Matrix.Translation(-offset)
pivots = {obj: transform @ world.translation for obj,world in zip(objects,worlds)}
palette(objects)
merged = 0
for obj in objects:
    obj.data.transform(transform)
    merged += clean(obj.data)
for level_objects in extra_levels:
    for obj in level_objects:
        obj.data.transform(transform)
        clean(obj.data)
materials = sorted({mat for obj in objects + [o for level in extra_levels for o in level] for mat in obj.data.materials if mat},
                   key=lambda mat: mat.name)
records = []
for index, mat in enumerate(materials):
    stem = args.name + (f'_{index+1:02}' if index else '')
    if mat.name.startswith('M_'+args.name+'_'):
        stem = mat.name[2:]
    else:
        mat.name = 'M_' + stem
    records.append(textures(mat, stem))
    if (args.hybrid and mat.name == 'M_'+args.name+'_Glass') or (extra_levels and mat.get('transparentProp')):
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        records[-1]['baseColor'][3] = bsdf.inputs['Alpha'].default_value
        records[-1]['glass'] = True
initial = sum(map(triangles,objects))
part_names = [obj.name for obj in objects]
if args.hybrid and ('Shell' not in part_names or len(objects) < 2 or initial > args.budget):
    raise ValueError('修补件须包含预算内的外壳和独立程序件')
part_boxes = [bounds([obj]) for obj in objects] if args.hybrid else []
expected_pivots = {obj.name: list(pivots[obj]) for obj in objects} if args.hybrid else {}
repair_rack = args.name == 'server_rack' and args.source.name == 'repaired.glb'
repair_tv = args.name == 'tv_wall' and args.source.name == 'repaired.glb'
if repair_tv and (set(part_names) != {'Screen', 'Bezel', 'Shell'} or initial > args.budget):
    raise ValueError('修补电视须交付预算内的 Screen、Bezel、Shell')
if repair_rack:
    if set(part_names) != {'Front','Shell'} or initial > args.budget:
        raise ValueError('修补机柜须交付预算内的 Front 和 Shell，不能对面板整体减面')
    front_count = triangles(objects[part_names.index('Front')])
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
counts = dict(zip(part_names, map(triangles, objects)))
limits = [args.budget, *map(int, args.lod_limits.split(','))] if args.lod_limits else [args.budget] * 3
targets = [0, *map(int, args.lod_targets.split(','))]
for level, ratio in enumerate([1,.4,.12]):
    group = []
    goal = targets[level]
    if args.hybrid and level:
        # 首轮保留原常用的 40% / 12% 目标，重试只增加外壳预算。
        goal = goal or min(limits[level], math.ceil(args.budget * ratio))
        part_ratios, goal = hybrid_reduction(counts, goal, limits[level], args.legacy_hybrid and not targets[level])
    elif goal and not repair_rack:
        fixed = counts.get('Screen', 0) + (counts.get('Bezel', 0) if repair_tv else 0)
        ratio = min(1., (goal - fixed) / max(1, sum(counts.values()) - fixed))
    for index, original in enumerate(objects):
        obj = original
        if level and extra_levels:
            obj = extra_levels[level-1][index]
        elif level:
            obj = original.copy()
            obj.data = original.data.copy()
            bpy.context.collection.objects.link(obj)
            if args.hybrid:
                part_ratio = part_ratios[part_names[index]]
                if part_ratio < 1:
                    reduce(obj,part_ratio)
                    lo, hi = bounds([obj])
                    base, top = part_boxes[index]
                    if np.any((top-base > 1e-7) & (hi-lo < 1e-8)):
                        raise ValueError('程序部件减面塌陷：'+part_names[index])
                    scale = np.divide(top-base,hi-lo,out=np.ones(3),where=hi-lo>1e-8)
                    obj.data.transform(Matrix.Translation(Vector(base)) @ Matrix.Diagonal(Vector([*scale,1])) @ Matrix.Translation(-Vector(lo)))
            elif repair_rack and part_names[index] == 'Shell':
                # 以交付预算而非当前面数分配远级额度；先预留整块面板，再简化机身。
                shell_limit = (goal or int(args.budget*(.138 if level == 2 else ratio))) - front_count
                if shell_limit < 1:
                    raise ValueError(f'LOD{level} 没有剩余外壳预算')
                if level == 2:
                    simplify_rack_shell(obj, shell_limit)
                else:
                    reduce(obj, shell_limit/triangles(obj))
            elif not repair_rack and part_names[index] != 'Screen' and not (repair_tv and part_names[index] == 'Bezel'):
                reduce(obj,ratio)
        if repair_rack and part_names[index] == 'Shell':
            flatten_rack_sides(obj)
        suffix = '' if len(objects)==1 else ('_'+part_names[index] if args.hybrid or repair_rack or part_names[index] in ('Upper','Lower','Fish') else f'_Part{index+1:02}')
        obj.name = f'SM_{args.name}{suffix}_LOD{level}'
        obj.data.name = obj.name
        group.append(obj)
    count = sum(map(triangles,group))
    if count > args.budget or not count:
        raise ValueError(f'LOD{level} 面数不合格：{count}')
    # 减面可能让脚底穿地（试验中 LOD2 低了约 1 cm）；整组平移，不单独移动耳、足或盖。
    movable = [group[part_names.index('Shell')]] if (repair_rack or repair_tv) and level else group
    floor, ceiling = bounds(movable)
    fit = Matrix.Identity(4)
    target_anchor = Vector((0, 0, 0))
    if args.width and args.depth:
        # 边折叠可能把顶点推出原包围盒，按整组校正，不单独拉伸零件。
        extent = np.array([args.width,args.depth,height])
        if repair_tv and level:
            # 屏幕和边框保持 LOD0 的世界坐标，只把后壳拟合到它自己的原包围盒。
            low0, high0 = bounds([objects[part_names.index('Shell')]])
            extent, target_anchor = high0-low0, anchor(low0, high0)
        ratios = extent / (ceiling-floor)
        if not np.isfinite(ratios).all() or np.max(np.abs(1-ratios)) > .2:
            raise ValueError(f'LOD{level} 减面后尺寸变化过大，请人工复核')
        fit = Matrix.Diagonal(Vector([*ratios,1]))
    # 机柜的长宽高由外壳决定。远级只校正外壳，面板继承已落地的 LOD0 坐标。
    for obj in movable:
        obj.data.transform(fit)
    shift = Matrix.Translation(target_anchor-anchor(*bounds(movable)))
    for obj in movable:
        obj.data.transform(shift)
    if repair_rack:
        sys.dont_write_bytecode = True
        sys.path.insert(0,str(Path(__file__).resolve().parent))
        from rack_clearance import trim
        trimmed = trim(group)
        count = sum(map(triangles,group))
    floor, ceiling = bounds(group)
    lods.append(dict(level=level, triangles=count, size=dimensions(floor,ceiling), origin=list(anchor(floor,ceiling)), parts=[obj.name for obj in group]))
    lods[-1]['budget'] = limits[level]
    lods[-1]['targetTriangles'] = goal or count
    lods[-1]['retainedRatio'] = count / sum(counts.values())
    if args.hybrid:
        lods[-1]['partRatios'] = part_ratios if level else dict.fromkeys(counts, 1.)
        lods[-1]['partTriangles'] = dict(zip(part_names, map(triangles, group)))
    if repair_rack:
        lods[-1]['trimmedShellTriangles'] = trimmed
    exported.extend(group)
# 各级减面结束后再还原活动件枢轴，避免 LOD1/2 重复变换。
if len(objects)>1:
    for index,obj in enumerate(exported):
        pivot = pivots[objects[index % len(objects)]]
        obj.data.transform(Matrix.Translation(-pivot)); obj.location = pivot
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for obj in exported:
    obj.select_set(True)
model = 'SM_'+args.name+'.fbx'
bpy.ops.export_scene.fbx(filepath=str(out/model), use_selection=True, object_types={'MESH'}, axis_forward='-Z', axis_up='Y',
                         apply_scale_options='FBX_SCALE_UNITS', bake_space_transform=True, bake_anim=False, path_mode='RELATIVE')
imported = load(out/model)
for lod in lods:
    group = [obj for obj in imported if obj.name in lod['parts']]
    if len(group) != len(lod['parts']):
        raise ValueError(f"FBX 回读缺少零件：{lod['parts']}")
    if lod['level'] == 0:
        reference_group = group
    else:
        overrides = {}
        if args.min_iou:
            limits_iou = [float(v) for v in args.min_iou.split(',')]
            overrides['min_iou'] = limits_iou[min(lod['level'], len(limits_iou)) - 1]
        if args.max_interior_loss is not None:
            overrides['max_interior_loss'] = args.max_interior_loss
        lod['lodIntegrity'] = compare(reference_group, group, **overrides)
    measured = list(anchor(*bounds(group)))
    if not all(abs(value) <= .0001 for value in measured):
        raise ValueError(f"FBX 回读 LOD{lod['level']} 表面锚点偏移：{measured} m")
    lod['fbxSurfaceAnchorMeters'] = measured
    if args.hybrid:
        lod['partPivotsBlender'] = {}
        for name, pivot in expected_pivots.items():
            obj = next(o for o in group if o.name == f"SM_{args.name}_{name}_LOD{lod['level']}")
            actual = obj.matrix_world.translation
            if (actual-Vector(pivot)).length > 1e-4 or triangles(obj) == 0:
                raise ValueError('FBX 回读枢轴或几何不匹配：'+obj.name)
            lod['partPivotsBlender'][name] = list(actual)
    if repair_rack:
        front = next(obj for obj in group if '_Front_LOD' in obj.name)
        signature = panel_signature(front)
        if lod['level'] == 0:
            reference_panel = signature
        if len(signature) != front_count or signature != reference_panel:
            raise ValueError(f"FBX 回读 LOD{lod['level']} 的面板几何或材质与 LOD0 不一致")
        lod.update(frontTriangles=front_count, shellTriangles=lod['triangles']-front_count, frontMatchesLOD0=True)
    if repair_tv:
        screen = next(obj for obj in group if obj.name == lod['parts'][part_names.index('Screen')])
        signature = panel_signature(screen)
        if lod['level'] == 0:
            reference_screen = signature
        if len(signature) != 2 or signature != reference_screen:
            raise ValueError(f"FBX 回读 LOD{lod['level']} 的屏幕几何、材质或 UV 不一致")
        lod.update(screenTriangles=2, screenMatchesLOD0=True)
report = dict(source=args.source.name, model=model, budget=args.budget, targetHeight=height, scale=factor, rotateZ=args.rotate_z, mirrorDepth=args.mirror_depth,
              sourceSize=dimensions(low,high), normals='缝合反向同位对边，保留面角 UV；按连通面统一绕序，开口壳片按源法线校正朝向', weldToleranceMeters=0,
              mergedVertices=merged, lods=lods, materials=records, seconds=round(time.monotonic()-start,2),
              origin=args.origin, axisScales=factors, movingParts='保留分件；单网格不自动推断活动边界。')
if extra_levels:
    report['lodSources'] = [Path(file).name for file in args.lod_sources.split(',')]
if args.hybrid:
    report['legacyHybridRecipe'] = args.legacy_hybrid
    # 将规范化枢轴还原为网页 XYZ 轴序，Unity 可据此反验导入轴转换并应用角位移。
    report['pivots'] = [dict(node=name, x=p[0], y=p[2], z=-p[1]) for name,p in expected_pivots.items()]
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(model, [lod['triangles'] for lod in lods], report['seconds'])
