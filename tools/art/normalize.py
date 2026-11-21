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
    coords = np.array([tuple(obj.matrix_world @ obj.data.vertices[index].co) for obj in objects
                       for index in {loop.vertex_index for loop in obj.data.loops}])
    if not coords.size:
        raise ValueError('没有可测量的网格面')
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
    strength = sockets['Emission Strength'].default_value
    if strength and any(sockets['Emission Color'].default_value[:3]):
        info['emission'] = [value*strength for value in sockets['Emission Color'].default_value[:3]]
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


def cluster_shell(shell, limit):
    # 远级不能让数百个 UV 岛各自折叠。相同空间格共享位置而不共享 UV，剔除折叠和重合的三角面。
    source = shell.data
    source.calc_loop_triangles()
    coords = np.array([vertex.co[:] for vertex in source.vertices])
    faces = np.array([face.vertices[:] for face in source.loop_triangles])
    low, high = coords.min(axis=0), coords.max(axis=0)
    for step in np.geomspace(.025, .5, 64):
        cells = np.rint((coords-low)/step).astype(int)
        _, mapping = np.unique(cells, axis=0, return_inverse=True)
        mapping = mapping.ravel()
        indices = mapping[faces]
        keys = np.sort(indices,axis=1)
        valid = np.where((keys[:,0]!=keys[:,1]) & (keys[:,1]!=keys[:,2]))[0]
        _, unique = np.unique(keys[valid],axis=0,return_index=True)
        keep = valid[unique]
        if 0 < len(keep) <= limit:
            break
    else:
        raise ValueError('外壳聚类未达到远级预算')
    counts = np.bincount(mapping)
    centers = np.stack([np.bincount(mapping,weights=axis)/counts for axis in coords.T],axis=1)
    # 落在外侧钢板和底面的格子沿用原外壁位置，不让内部夹层拉弯外表面。
    for axis in range(3):
        for edge in [low[axis],high[axis]]:
            centers[mapping[np.abs(coords[:,axis]-edge)<.002],axis] = edge
    points = centers[indices[keep]]
    intact = np.linalg.norm(np.cross(points[:,1]-points[:,0],points[:,2]-points[:,0]),axis=1)>1e-8
    keep = keep[intact]
    target = bpy.data.meshes.new(shell.name+'_远壳')
    target.from_pydata(centers.tolist(), [], indices[keep].tolist())
    for mat in source.materials: target.materials.append(mat)
    uv = target.uv_layers.new(name=source.uv_layers.active.name)
    for face, index in zip(target.polygons, keep):
        original = source.loop_triangles[int(index)]
        face.material_index = original.material_index
        for dst, src in zip(face.loop_indices, original.loops):
            uv.uv[dst].vector = source.uv_layers.active.uv[src].vector
    target.update()
    # 夹层与外壁可能落入同一格；只在这些分叉处拆边，平板仍为连通网格。
    topology = bmesh.new()
    topology.from_mesh(target)
    bmesh.ops.split_edges(topology, edges=[edge for edge in topology.edges if len(edge.link_faces)>2])
    bmesh.ops.delete(topology, geom=[vertex for vertex in topology.verts if not vertex.link_faces], context='VERTS')
    topology.to_mesh(target)
    topology.free()
    shell.data = target


def panel_signature(front):
    # 回读 FBX 后按三角形和材质比对，而不是只数面；包括灯、槽和它们相对机身的位置。
    mesh = front.data
    mesh.calc_loop_triangles()
    points = [tuple(round(axis,6) for axis in front.matrix_world @ vertex.co) for vertex in mesh.vertices]
    return sorted((mesh.materials[face.material_index].name, sorted(points[index] for index in face.vertices))
                  for face in mesh.loop_triangles)


parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--budget', type=int, default=40000)
parser.add_argument('--name', default='Furnace')
parser.add_argument('--rotate-z', type=float, default=0)
parser.add_argument('--mirror-depth', action='store_true')
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
materials = sorted({mat for obj in objects for mat in obj.data.materials if mat}, key=lambda mat: mat.name)
records = []
for index, mat in enumerate(materials):
    stem = args.name + (f'_{index+1:02}' if index else '')
    if mat.name.startswith('M_'+args.name+'_'):
        stem = mat.name[2:]
    else:
        mat.name = 'M_' + stem
    records.append(textures(mat, stem))
initial = sum(map(triangles,objects))
part_names = [obj.name for obj in objects]
repair_rack = args.name == 'server_rack' and args.source.name == 'repaired.glb'
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
for level, ratio in enumerate([1,.4,.12]):
    group = []
    for index, original in enumerate(objects):
        obj = original
        if level:
            obj = original.copy()
            obj.data = original.data.copy()
            bpy.context.collection.objects.link(obj)
            if repair_rack and part_names[index] == 'Shell':
                # 以交付预算而非当前面数分配远级额度；先预留整块面板，再简化机身。
                shell_limit = int(args.budget*ratio)-front_count
                if shell_limit < 1:
                    raise ValueError(f'LOD{level} 没有剩余外壳预算')
                if level == 2:
                    cluster_shell(obj, shell_limit)
                else:
                    reduce(obj, shell_limit/triangles(obj))
            elif not repair_rack and part_names[index] != 'Screen':
                reduce(obj,ratio)
        if repair_rack and part_names[index] == 'Shell':
            flatten_rack_sides(obj)
        suffix = '' if len(objects)==1 else ('_'+part_names[index] if repair_rack or part_names[index] in ('Upper','Lower') else f'_Part{index+1:02}')
        obj.name = f'SM_{args.name}{suffix}_LOD{level}'
        obj.data.name = obj.name
        group.append(obj)
    count = sum(map(triangles,group))
    if count > args.budget or not count:
        raise ValueError(f'LOD{level} 面数不合格：{count}')
    # 减面可能让脚底穿地（试验中 LOD2 低了约 1 cm）；整组平移，不单独移动耳、足或盖。
    floor, ceiling = bounds(group)
    fit = Matrix.Identity(4)
    if args.width and args.depth:
        # 边折叠可能把顶点推出原包围盒，按整组校正，不单独拉伸零件。
        ratios = np.array([args.width,args.depth,height]) / (ceiling-floor)
        if not np.isfinite(ratios).all() or np.max(np.abs(1-ratios)) > .2:
            raise ValueError(f'LOD{level} 减面后尺寸变化过大，请人工复核')
        fit = Matrix.Diagonal(Vector([*ratios,1]))
    # 机柜的长宽高由外壳决定。远级只校正外壳，面板继承已落地的 LOD0 坐标。
    movable = [group[part_names.index('Shell')]] if repair_rack and level else group
    for obj in movable:
        obj.data.transform(fit)
    shift = Matrix.Translation(-anchor(*bounds(movable)))
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
    measured = list(anchor(*bounds(group)))
    if not all(abs(value) <= .0001 for value in measured):
        raise ValueError(f"FBX 回读 LOD{lod['level']} 表面锚点偏移：{measured} m")
    lod['fbxSurfaceAnchorMeters'] = measured
    if repair_rack:
        front = next(obj for obj in group if '_Front_LOD' in obj.name)
        signature = panel_signature(front)
        if lod['level'] == 0:
            reference_panel = signature
        if len(signature) != front_count or signature != reference_panel:
            raise ValueError(f"FBX 回读 LOD{lod['level']} 的面板几何或材质与 LOD0 不一致")
        lod.update(frontTriangles=front_count, shellTriangles=lod['triangles']-front_count, frontMatchesLOD0=True)
report = dict(source=args.source.name, model=model, budget=args.budget, targetHeight=height, scale=factor, rotateZ=args.rotate_z, mirrorDepth=args.mirror_depth,
              sourceSize=dimensions(low,high), normals='按连通面统一绕序；开口壳片按源拐角法线面积投票校正朝向，保留 UV 接缝与硬边', weldToleranceMeters=1e-6,
              mergedVertices=merged, lods=lods, materials=records, seconds=round(time.monotonic()-start,2),
              origin=args.origin, axisScales=factors, movingParts='保留分件；单网格不自动推断活动边界。')
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(model, [lod['triangles'] for lod in lods], report['seconds'])
