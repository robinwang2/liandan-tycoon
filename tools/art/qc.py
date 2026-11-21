# 模型质检（Blender 无界面运行）：导入一个模型，统计面数、尺寸、破面、零件、材质贴图，再从几个方向渲染出图。
#   blender -b --factory-startup -P tools/art/qc.py -- <模型.glb|.fbx|.obj> --out <输出目录> [--budget 三角面上限] [--height 目标高度(米)]
#                                                     [--views front,left,right,back,persp] [--res 1024] [--bg 0.86] [--flat]
# 输出：<输出目录>/report.json，以及每个方向一张 PNG（front.png、left.png……）。拼对照图交给 tools/art/qc.mjs。
# 坐标约定：glTF 的 +Y 朝上、+Z 朝前，导进 Blender 以后是 +Z 朝上、-Y 朝前。「前」= 从 -Y 往 +Y 看，「左」= 从 -X 看，「右」= 从 +X 看，「后」= 从 +Y 看。
import bpy, bmesh, sys, os, json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
src = argv[0]
opt = {}
i = 1
while i < len(argv):
    if argv[i] in ('--flat','--rack-clearance'): opt[argv[i][2:]] = True; i += 1; continue
    opt[argv[i].lstrip('-')] = argv[i + 1]; i += 2
out = opt.get('out', os.path.splitext(src)[0] + '_qc')
os.makedirs(out, exist_ok=True)
budget = int(opt['budget']) if 'budget' in opt else None
target_h = float(opt['height']) if 'height' in opt else None
views = opt.get('views', 'front,left,right,back,persp').split(',')
res = int(opt.get('res', 1024))
bg = float(opt.get('bg', 0.86))

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=src)
elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
else: raise SystemExit('不认识的格式：' + ext)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if 'lod' in opt:
    for obj in meshes:
        obj.hide_render = not obj.name.endswith('_LOD' + opt['lod'])
    meshes = [obj for obj in meshes if not obj.hide_render]
if not meshes: raise SystemExit('文件里没有网格')
dg = bpy.context.evaluated_depsgraph_get()

# ── 统计 ──
tris = verts = 0
non_manifold = boundary = 0
islands = 0
inward_faces = outward_faces = unresolved_faces = 0
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
mats, images = set(), {}
for o in meshes:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(me); bm.transform(o.matrix_world)
    # 两侧沿几何法线探测：只有背侧射线能逃出网格时记为疑似朝内。薄片、凹处不强判。
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    for face in bm.faces:
        center = face.calc_center_median()
        normal = face.normal
        def escapes(direction):
            return tree.ray_cast(center + direction * 1e-6, direction)[0] is None
        front, back = escapes(normal), escapes(-normal)
        inward_faces += back and not front
        outward_faces += front and not back
        unresolved_faces += front == back
    for v in bm.verts:
        if not v.link_faces: continue
        for k in range(3): lo[k] = min(lo[k], v.co[k]); hi[k] = max(hi[k], v.co[k])
    verts += len(bm.verts)
    tris += sum(len(f.verts) - 2 for f in bm.faces)
    for e in bm.edges:
        n = len(e.link_faces)
        if n == 1: boundary += 1
        elif n > 2: non_manifold += 1
    # 连通的零件数
    seen = set()
    for f in bm.faces:
        if f.index in seen: continue
        islands += 1; stack = [f]; seen.add(f.index)
        while stack:
            g = stack.pop()
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
    bm.free(); ev.to_mesh_clear()
    for slot in o.material_slots:
        m = slot.material
        if not m: continue
        mats.add(m.name)
        if m.use_nodes:
            for nd in m.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image: images[nd.image.name] = list(nd.image.size)
size = hi - lo
center = (lo + hi) / 2
report = {
    'normalOrientationEstimate': {'suspectedInward': inward_faces, 'likelyOutward': outward_faces,
        'unresolved': unresolved_faces, 'inwardFractionOfAllFaces': inward_faces/max(1,inward_faces+outward_faces+unresolved_faces)},
    'file': os.path.abspath(src), 'objects': len(meshes), 'materials': sorted(mats), 'textures': images,
    'triangles': tris, 'vertices': verts, 'parts': islands, 'boundaryEdges': boundary, 'nonManifoldEdges': non_manifold,
    'size': {'width': round(size.x, 4), 'depth': round(size.y, 4), 'height': round(size.z, 4)},
    'ratio': {'width/height': round(size.x / size.z, 3) if size.z else None, 'depth/height': round(size.y / size.z, 3) if size.z else None},
    'origin': {'bottomZ': round(lo.z, 4), 'centerX': round(center.x, 4), 'centerY': round(center.y, 4)},
}
problems = []
if opt.get('rack-clearance'):
    sys.dont_write_bytecode = True
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from rack_clearance import measure
    try:
        clearance = report['rackFrontClearance'] = measure(meshes)
        if clearance['intersectingTriangles']:
            problems.append(f"机柜行板前方 5 cm 内有 {clearance['intersectingTriangles']} 个外壳三角面：{clearance['polygonExamples']}")
    except ValueError as error:
        problems.append(str(error))
if budget and tris > budget: problems.append(f'三角面 {tris} 超过预算 {budget}')
if non_manifold: problems.append(f'有 {non_manifold} 条边连着 3 个以上的面（破面）')
if target_h and size.z: report['scaleToTarget'] = round(target_h / size.z, 4)
if abs(lo.z) > 0.02 * max(size.z, 1e-6) or abs(center.x) > 0.02 * max(size.x, 1e-6) or abs(center.y) > 0.02 * max(size.y, 1e-6):
    report['note_origin'] = '原点不在底面中心（规范化时要挪）'
for name, wh in images.items():
    if max(wh) > 2048: report.setdefault('notes', []).append(f'贴图 {name} 是 {wh[0]}×{wh[1]}，超过 2K')
report['pass'] = not problems
report['problems'] = problems

# ── 渲染 ──
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x = sc.render.resolution_y = res
sc.render.film_transparent = False
sc.display.shading.light = 'STUDIO'
sc.display.shading.background_type = 'WORLD'
sc.display.shading.color_type = 'SINGLE' if opt.get('flat') else ('TEXTURE' if images else 'MATERIAL')
if opt.get('flat'): sc.display.shading.single_color = (0.8, 0.8, 0.8)
sc.display.shading.show_cavity = True
sc.display.shading.cavity_type = 'BOTH'
sc.display.shading.show_shadows = False
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('qc'); world.color = (bg, bg, bg); sc.world = world
cam_data = bpy.data.cameras.new('qc'); cam = bpy.data.objects.new('qc', cam_data); sc.collection.objects.link(cam); sc.camera = cam
span = max(size.x, size.y, size.z) or 1
dist = span * 4
DIRS = {'front': Vector((0, -1, 0)), 'back': Vector((0, 1, 0)), 'left': Vector((-1, 0, 0)), 'right': Vector((1, 0, 0)), 'top': Vector((0, 0, 1)), 'persp': Vector((0.75, -1, 0.65))}
renders = {}
for v in views:
    d = DIRS[v].normalized()
    cam.location = center + d * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if v == 'persp':
        cam_data.type = 'PERSP'; cam_data.lens = 70; cam.location = center + d * span * 3.2
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    else:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = span * 1.12
    cam_data.clip_end = dist * 4
    sc.render.filepath = os.path.join(out, v + '.png')
    bpy.ops.render.render(write_still=True)
    renders[v] = sc.render.filepath
report['renders'] = renders
with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f: json.dump(report, f, ensure_ascii=False, indent=1)
print('QC_REPORT ' + json.dumps(report, ensure_ascii=False))
