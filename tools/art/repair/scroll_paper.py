"""Keep the archived textured rollers and rebuild the backing and printed paper."""
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from seam_weld import stitch_boundaries


def ink_image(folder):
    # Coverage in paper coordinates (even-odd fill keeps the counters of each glyph).
    ink_file = Path(__file__).resolve().parents[3] / 'src/scene3a/scroll-ink.json'
    ink = json.loads(ink_file.read_text(encoding='utf-8'))
    width, height = 2048, 1024
    mask = np.zeros((height, width), dtype=np.float32)
    def paint(contours):
        edges = np.concatenate([np.stack([p, np.roll(p, 1, axis=0)], axis=1) for p in contours])
        x1, y1 = edges[:, 0].T
        x2, y2 = edges[:, 1].T
        for row in range(height):
            for shift in (.25, .75):
                y = (row + shift) * ink['height'] / height
                hit = (y1 > y) != (y2 > y)
                xs = np.sort((x1[hit] + (y-y1[hit])*(x2[hit]-x1[hit])/(y2[hit]-y1[hit])) * width / ink['width'])
                for left, right in zip(xs[::2], xs[1::2]):
                    col = np.arange(int(left), int(right)+1)
                    mask[row,col] += .5 * np.maximum(0, np.minimum(col+1,right)-np.maximum(col,left))
    paint([np.asarray(p) for p in ink['contours']])
    paper = np.empty((height,width,4), dtype=np.float32)
    paper[:,:,:3] = np.array([.95,.90,.78]) + mask[:,:,None] * np.array([-.85,-.81,-.70])
    paper[:,:,3] = 1
    # Vermilion seal with a paper-coloured inset keyline.
    paper[790:892,1855:1957,:3] = [.62,.16,.11]
    paper[802:880,1867:1945,:3] = [.95,.90,.78]
    paper[809:873,1874:1938,:3] = [.62,.16,.11]
    image = bpy.data.images.new('RicePaper',width,height,alpha=False)
    image.pixels.foreach_set(np.ascontiguousarray(paper[::-1]).ravel())
    image.filepath_raw = str(folder / 'paper.png')
    image.file_format = 'PNG'
    image.save()
    return bpy.data.images.load(image.filepath_raw)


def roller_half(source, sign):
    mesh = bmesh.new()
    mesh.from_mesh(source)
    cut = bmesh.ops.bisect_plane(mesh, geom=mesh.verts[:]+mesh.edges[:]+mesh.faces[:],
                                 plane_co=(0,0,sign*.191), plane_no=(0,0,sign), clear_inner=True)
    border = [e for e in cut['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    if not border:
        raise ValueError('No roller/backing boundary at the expected archive height')
    bmesh.ops.holes_fill(mesh, edges=border)
    data = source.copy()
    mesh.to_mesh(data)
    mesh.free()
    obj = bpy.data.objects.new('TopRoll' if sign > 0 else 'BottomRoll',data)
    bpy.context.collection.objects.link(obj)
    return obj


def sheet(name, width, height, depth, y, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0,y,0))
    obj = bpy.context.object
    obj.name = name
    obj.data.transform(Matrix.Diagonal(Vector((width,depth,height,1))))
    mat = bpy.data.materials.new('M_scroll_'+name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color,1)
    shader.inputs['Roughness'].default_value = .84
    obj.data.materials.append(mat)
    return obj, mat


output, source, height_arg, _, *budgets = sys.argv[sys.argv.index('--')+1:]
folder = Path(output)
folder.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
original, = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
data = original.data
data.transform(original.matrix_world)
mesh = bmesh.new()
mesh.from_mesh(data)
stitch_boundaries(mesh)
mesh.to_mesh(data)
mesh.free()
rollers = [roller_half(data,sign) for sign in (1,-1)]
bpy.data.objects.remove(original,do_unlink=True)
sheet('Brocade',.916,.417,.017,0,(.44,.043,.032))
paper, base = sheet('PaperEdge',.859,.355,.005,-.0105,(.90,.78,.59))
ink = base.copy()
ink.name = 'M_scroll_Ink'
image = ink.node_tree.nodes.new('ShaderNodeTexImage')
image.image = ink_image(folder)
ink.node_tree.links.new(image.outputs['Color'], ink.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
paper.data.materials.append(ink)
front, = [f for f in paper.data.polygons if f.normal.y < -.99]
front.material_index = 1
for i in front.loop_indices:
    p = paper.data.vertices[paper.data.loops[i].vertex_index].co
    paper.data.uv_layers.active.data[i].uv = (p.x/.859+.5,p.z/.355+.5)
# Reduce only the rollers. The paper face and its complete UV rectangle survive every level.
sources = [obj.data for obj in rollers]
for level, limit in enumerate(map(int,budgets)):
    for obj, original in zip(rollers,sources):
        obj.data = original.copy()
        original.calc_loop_triangles()
        target = (limit - 24) // 2 - 2
        if len(original.loop_triangles) > target:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new('Roller budget','DECIMATE')
            mod.ratio = target / len(original.loop_triangles)
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.export_scene.gltf(filepath=str(folder / f'lod{level}.glb'),export_format='GLB',export_animations=False)
