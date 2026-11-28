"""Prepare the inspected +Z-facing batch-eight GLBs without changing their proportions."""
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from seam_weld import stitch_boundaries


output, source, height_arg, lod_base, *limits = sys.argv[sys.argv.index('--') + 1:]
height = float(height_arg)
if len(limits) != 3 or lod_base not in ('source', 'lod0'):
    raise ValueError('Expected a LOD source and one triangle budget per level')
folder = Path(output)
folder.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
body, = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
mesh = body.data
mesh.transform(body.matrix_world)
body.parent = None
body.matrix_world = Matrix.Identity(4)
body.name = 'Body'

# Join coincident UV borders before collapsing edges, retaining the per-corner UVs.
surface = bmesh.new()
surface.from_mesh(mesh)
stitch_boundaries(surface)
surface.to_mesh(mesh)
surface.free()
mesh.calc_loop_triangles()
triangles = len(mesh.loop_triangles)
for level, limit in enumerate(map(int, limits)):
    body.data = mesh.copy()
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    if triangles > limit:
        modifier = body.modifiers.new('Triangle budget', 'DECIMATE')
        modifier.ratio = (limit - 2) / triangles
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    corners = [Vector(point) for point in body.bound_box]
    low, high = [Vector([fn(point[i] for point in corners) for i in range(3)]) for fn in (min, max)]
    center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    body.data.transform(Matrix.Scale(height / (high.z - low.z), 4) @ Matrix.Translation(-center))
    bpy.ops.export_scene.gltf(filepath=str(folder / f'lod{level}.glb'), export_format='GLB',
                              use_selection=True, export_animations=False)
    if level == 0 and lod_base == 'lod0':
        # Retain the silhouette established by the near mesh for the whale's figure and stand.
        mesh = body.data
        mesh.calc_loop_triangles()
        triangles = len(mesh.loop_triangles)
