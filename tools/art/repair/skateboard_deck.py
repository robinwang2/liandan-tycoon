"""Extract the textured deck from the archived B8 board before batch5-style assembly."""
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from hybrid import fit_box, import_meshes, mesh_bounds

archive, folder = map(Path, sys.argv[sys.argv.index('--') + 1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
template, = import_meshes(folder / 'shell.glb')
target = mesh_bounds(template)
bpy.data.objects.remove(template, do_unlink=True)
deck, = import_meshes(archive)
deck.data.transform(deck.matrix_world)
deck.parent = None
deck.matrix_world = Matrix.Identity(4)
mesh = bmesh.new()
mesh.from_mesh(deck.data)
# The two components have a real gap at 0.0170 .. 0.0197 in Blender Z.
cut = .018
if any((edge.verts[0].co.z < cut) != (edge.verts[1].co.z < cut) for edge in mesh.edges):
    raise ValueError('Deck and original truck are no longer separate')
bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.co.z < cut], context='VERTS')
mesh.to_mesh(deck.data)
mesh.free()
bpy.context.view_layer.update()
fit_box(deck, target)
bpy.ops.export_scene.gltf(filepath=str(folder / 'extracted-shell.glb'), export_format='GLB', export_animations=False)
