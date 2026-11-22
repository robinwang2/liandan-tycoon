"""三种 GLB 统一到同一米制展位；参考 FBX 仅放在 Unity 的 Editor 目录。"""
import json
import hashlib
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import bpy, load, Vector


def reference(objects, dest):
    dest.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object; obj.name = 'GameReference'
    records = []
    for index, mat in enumerate(obj.data.materials):
        mat.name = f'Game_{index:02}'
        shader = mat.node_tree.nodes.get('Principled BSDF').inputs
        records.append(dict(name=mat.name, baseColor=list(shader['Base Color'].default_value),
                            metallic=shader['Metallic'].default_value, smoothness=1-shader['Roughness'].default_value,
                            emission=[value*shader['Emission Strength'].default_value for value in shader['Emission Color'].default_value[:3]]))
    digest = hashlib.sha256((folder/'game.glb').read_bytes()).hexdigest()
    (dest/'report.json').write_text(json.dumps({'refSha':digest,'materials':records}, indent=2), encoding='utf8')
    bpy.ops.export_scene.fbx(filepath=str(dest/'GameReference.fbx'), use_selection=True, object_types={'MESH'},
                             axis_forward='-Z', axis_up='Y', bake_space_transform=True, apply_scale_options='FBX_SCALE_UNITS', bake_anim=False)


def render(folder, model, size, wall):
    objects = load(folder/(model+'.glb'), size, wall)
    if model == 'game': reference(objects, Path(sys.argv[-1]))
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 4
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 480; scene.render.resolution_y = 420; scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('棚拍'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.36,.41,.46,1)
    center = Vector((0,-size[1]/2 if wall else 0,size[2]/2))
    for location, power in [((-3,-4,5),430),((3,-2,3),250),((1,3,4),320)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object; light.data.energy = power; light.data.shape = 'DISK'; light.data.size = 3
        light.rotation_euler = (center-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(); camera = bpy.context.object; scene.camera = camera; camera.data.type = 'ORTHO'
    span = max(size[0], size[2]*480/420)*1.1
    for view, direction in [('front',(0,-1,0)),('left',(-1,0,0)),('right',(1,0,0)),('back',(0,1,0)),('close',(.14,-1,.08))]:
        focus = center.copy()
        if view=='close': focus.y = -size[1] if wall else -size[1]/2
        camera.location = focus+Vector(direction).normalized()*6
        camera.rotation_euler = (focus-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale = span if view!='close' else span*(.72 if wall else .34)
        scene.render.filepath = str(folder/'repair-views'/f'{model}-{view}.png'); bpy.ops.render.render(write_still=True)


folder = Path(sys.argv[-2]).resolve(); wall = folder.name=='tv_wall'
for model in ['game','tripo','repaired']: render(folder, model, (2.2,.15,1.3) if wall else (.7,1,2.1), wall)
