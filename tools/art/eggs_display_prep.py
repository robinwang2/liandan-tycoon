"""Build the four revised display props from the original batch-six recipes."""
import math
import runpy
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix


def shell(name, half_width, half_depth, bottom, top, material, lid):
    corners = [(-half_width, -half_depth), (half_width, -half_depth),
               (half_width, half_depth), (-half_width, half_depth)]
    vertices = [(xpos, ypos, height) for height in (bottom, top) for xpos, ypos in corners]
    faces = [(index, (index+1) % 4, (index+1) % 4+4, index+4) for index in range(4)]
    if lid:
        faces.append((4, 5, 6, 7))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(material)
    bpy.context.collection.objects.link(bpy.data.objects.new(name, mesh))


def aquarium():
    tank = bpy.data.objects['Tank'].data
    glass = bpy.data.materials['M_egg_blub_tank_Glass']
    water = bpy.data.materials['M_egg_blub_tank_Water']
    edit = bmesh.new()
    edit.from_mesh(tank)
    faces = [face for face in edit.faces if tank.materials[face.material_index] in (glass, water)]
    bmesh.ops.delete(edit, geom=faces, context='FACES')
    edit.to_mesh(tank)
    edit.free()
    for material, color, alpha, order in [(glass, (.66, .89, .95), .035, 1),
                                          (water, (.20, .62, .86), .14, 0)]:
        sockets = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED').inputs
        sockets['Base Color'].default_value = (*color, 1)
        sockets['Alpha'].default_value = alpha
        material.use_backface_culling = True
        material['transparentProp'] = True
        material['thinTintOrder'] = order
    shell('Water', .219, .119, .024, .282, water, True)
    shell('Glass', .223, .123, .019, .347, glass, False)


output, prop, source = sys.argv[sys.argv.index('--')+1:]
if prop not in ('egg_bob', 'egg_spot', 'egg_blub_tank', 'egg_whiteboard'):
    raise ValueError(prop)
runpy.run_path(str(Path(__file__).with_name('eggs_prep.py')), run_name='__main__')
for level in range(3):
    file = Path(output)/f'lod{level}.glb'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(file))
    if prop in ('egg_bob', 'egg_spot'):
        body = bpy.data.objects['Body']
        body.matrix_world = Matrix.Rotation(math.pi, 4, 'Z') @ body.matrix_world
    elif prop == 'egg_blub_tank':
        aquarium()
    else:
        bpy.data.materials['M_egg_whiteboard_Print']['baseMapEmission'] = .80
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', export_extras=True, export_animations=False)
